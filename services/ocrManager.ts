
import { PDFDocumentProxy } from "pdfjs-dist";
import { getOcrWorker } from "./ocrService";
import { processImageAndLayout, extractImageTile } from "./imageProcessingService";
import { florenceService } from "./florenceService";

export type OcrStatus = 'idle' | 'queued' | 'processing' | 'done' | 'error';
export type OcrEngineType = 'tesseract' | 'florence';

type Priority = 'high' | 'low';

interface OcrTask {
    pageNumber: number;
    priority: Priority;
    retries: number;
}

interface WeightedWord {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    column: number;
    isRelative?: boolean;
    centerScore: number; 
}

export class OcrManager {
    private pdfDoc: PDFDocumentProxy;
    private queue: OcrTask[] = [];
    private processing: boolean = false;
    private processedPages: Set<number> = new Set();
    private activePage: number | null = null; 
    private onPageComplete: (page: number, words: any[]) => void;
    private onStatusChange: (statusMap: Record<number, OcrStatus>) => void;
    private onCheckpoint?: () => void;
    private engine: OcrEngineType;
    
    // --- HIGH FIDELITY SETTINGS ---
    private ocrScale: number = 3.0; 
    private florenceScale: number = 2.0; 
    
    // Tiling Configuration (Nuclear Option)
    private tileSize: number = 1024; 
    private tileOverlap: number = 200; 

    constructor(
        pdfDoc: PDFDocumentProxy, 
        onPageComplete: (page: number, words: any[]) => void,
        onStatusChange: (statusMap: Record<number, OcrStatus>) => void,
        onCheckpoint?: () => void,
        engine: OcrEngineType = 'tesseract'
    ) {
        this.pdfDoc = pdfDoc;
        this.onPageComplete = onPageComplete;
        this.onStatusChange = onStatusChange;
        this.onCheckpoint = onCheckpoint;
        this.engine = engine;
    }

    public setEngine(engine: OcrEngineType) {
        this.engine = engine;
    }

    public schedule(pageNumber: number, priority: Priority = 'low') {
        if (this.processedPages.has(pageNumber) || this.activePage === pageNumber) return;
        this.queue = this.queue.filter(t => t.pageNumber !== pageNumber);
        const task: OcrTask = { pageNumber, priority, retries: 0 };
        if (priority === 'high') this.queue.unshift(task);
        else this.queue.push(task);
        this.emitStatus();
        this.processNext();
    }

    public markAsProcessed(pageNumber: number) {
        this.processedPages.add(pageNumber);
        this.emitStatus();
    }

    private emitStatus() {
        const statusMap: Record<number, OcrStatus> = {};
        this.processedPages.forEach(p => statusMap[p] = 'done');
        this.queue.forEach(t => statusMap[t.pageNumber] = 'queued');
        if (this.activePage !== null) statusMap[this.activePage] = 'processing';
        this.onStatusChange(statusMap);
    }

    private async processNext() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;
        const task = this.queue.shift();
        if (!task) { this.processing = false; return; }

        try {
            this.activePage = task.pageNumber;
            this.emitStatus();
            
            if (this.engine === 'florence') {
                await this.executeFlorenceTask(task);
            } else {
                await this.executeTesseractTiledTask(task);
            }

            this.activePage = null;
            this.processedPages.add(task.pageNumber);
            this.processing = false;
            this.emitStatus();
            if (this.queue.length > 0) setTimeout(() => this.processNext(), 200);
        } catch (e) {
            console.error(`[OcrManager] Falha p${task.pageNumber}:`, e);
            this.activePage = null;
            this.processing = false;
            this.emitStatus();
            setTimeout(() => this.processNext(), 1000);
        }
    }

    // --- SHARED UTILS (IoU deduplication) ---
    private validateWord(word: any): boolean {
        const text = word.text.trim();
        if (!text) return false;
        // Filtro de ruído mais agressivo
        if (text.length < 2 && !/[a-zA-Z0-9]/.test(text)) return false; 
        if (/(.)\1{4,}/.test(text)) return false; // Repetição absurda (ex: "iiiii")
        return true;
    }

    private calculateIoU(bboxA: any, bboxB: any) {
        const xA = Math.max(bboxA.x0, bboxB.x0);
        const yA = Math.max(bboxA.y0, bboxB.y0);
        const xB = Math.min(bboxA.x1, bboxB.x1);
        const yB = Math.min(bboxA.y1, bboxB.y1);

        const interW = Math.max(0, xB - xA);
        const interH = Math.max(0, yB - yA);
        const interArea = interW * interH;
        
        const areaA = (bboxA.x1 - bboxA.x0) * (bboxA.y1 - bboxA.y0);
        const areaB = (bboxB.x1 - bboxB.x0) * (bboxB.y1 - bboxB.y0);
        
        // IoU clássico
        const unionArea = areaA + areaB - interArea;
        if (unionArea <= 0) return 0;
        return interArea / unionArea;
    }

    private deduplicateWords(words: WeightedWord[]) {
        // Ordena por confiança para que a melhor versão da palavra "ganhe"
        words.sort((a, b) => b.confidence - a.confidence);
        
        const uniqueWords: WeightedWord[] = [];

        for (const word of words) {
            let isDuplicate = false;
            for (const existing of uniqueWords) {
                // Se IoU > 0.3, consideramos a mesma palavra (overlap de tiles)
                // Usamos 0.3 porque as coordenadas podem variar levemente entre tiles
                if (this.calculateIoU(word.bbox, existing.bbox) > 0.3) {
                    isDuplicate = true;
                    break;
                }
            }
            if (!isDuplicate) uniqueWords.push(word);
        }
        return uniqueWords;
    }

    // --- FLORENCE STRATEGY (Tiled) ---
    private async executeFlorenceTask(task: OcrTask) {
        const page = await this.pdfDoc.getPage(task.pageNumber);
        const viewport = page.getViewport({ scale: this.florenceScale });
        
        const isOffscreenSupported = typeof OffscreenCanvas !== 'undefined';
        const canvas = isOffscreenSupported 
            ? new OffscreenCanvas(viewport.width, viewport.height) 
            : document.createElement('canvas');
        
        if (!isOffscreenSupported) {
            (canvas as HTMLCanvasElement).width = viewport.width;
            (canvas as HTMLCanvasElement).height = viewport.height;
        }
        
        const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true }) as any;
        await page.render({ canvasContext: ctx, viewport }).promise;

        const { columnSplits } = await processImageAndLayout(canvas);
        
        const width = viewport.width;
        const height = viewport.height;
        const allWords: WeightedWord[] = [];

        const cols = Math.ceil(width / (this.tileSize - this.tileOverlap));
        const rows = Math.ceil(height / (this.tileSize - this.tileOverlap));
        
        const getColumnIndex = (xCenter: number): number => {
            for (let i = 0; i < columnSplits.length; i++) {
                if (xCenter < columnSplits[i]) return i;
            }
            return columnSplits.length;
        };

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                let x = c * (this.tileSize - this.tileOverlap);
                let y = r * (this.tileSize - this.tileOverlap);
                
                const w = Math.min(this.tileSize, width - x);
                const h = Math.min(this.tileSize, height - y);
                
                const tileCanvas = await extractImageTile(canvas, { x, y, w, h });
                const blob = await (tileCanvas as any).convertToBlob({ type: 'image/jpeg', quality: 0.9 });
                
                const words = await florenceService.runOcr(blob);
                
                const mapped = this.mapCoords(words, x, y, this.florenceScale, getColumnIndex, w, h);
                allWords.push(...mapped);
                
                if (tileCanvas instanceof OffscreenCanvas) { tileCanvas.width = 0; tileCanvas.height = 0; }
            }
        }

        if (canvas instanceof OffscreenCanvas) { canvas.width = 0; canvas.height = 0; }
        else { (canvas as HTMLCanvasElement).width = 0; }

        const cleanWords = this.deduplicateWords(allWords);
        this.sortWords(cleanWords);

        this.onPageComplete(task.pageNumber, cleanWords);
        if (this.onCheckpoint) this.onCheckpoint();
    }

    // --- TESSERACT STRATEGY (Smart Tiling) ---
    private async executeTesseractTiledTask(task: OcrTask) {
        // 1. Renderizar com escala inicial (para PDF.js)
        const page = await this.pdfDoc.getPage(task.pageNumber);
        const viewport = page.getViewport({ scale: this.ocrScale }); // Ex: Scale 3.0
        
        const isOffscreenSupported = typeof OffscreenCanvas !== 'undefined';
        const canvas = isOffscreenSupported ? new OffscreenCanvas(viewport.width, viewport.height) : document.createElement('canvas');
        
        if (!isOffscreenSupported) {
            (canvas as HTMLCanvasElement).width = viewport.width;
            (canvas as HTMLCanvasElement).height = viewport.height;
        }
        
        const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true }) as any;
        await page.render({ canvasContext: ctx, viewport }).promise;

        // 2. Pré-processamento "Nuclear" (Gamma, Upscale para 300dpi, Sauvola)
        // processedCanvas já vem com deskew, upscaling e binarização
        const { width, height, columnSplits, processedCanvas } = await processImageAndLayout(canvas);
        
        // Limpa canvas original
        if (canvas instanceof OffscreenCanvas) { canvas.width = 0; canvas.height = 0; }
        else { (canvas as HTMLCanvasElement).width = 0; (canvas as HTMLCanvasElement).height = 0; }

        const worker = await getOcrWorker();
        let allWords: any[] = [];

        // 3. Grid Tiling
        const cols = Math.ceil(width / (this.tileSize - this.tileOverlap));
        const rows = Math.ceil(height / (this.tileSize - this.tileOverlap));

        const getColumnIndex = (xCenter: number): number => {
            for (let i = 0; i < columnSplits.length; i++) {
                if (xCenter < columnSplits[i]) return i;
            }
            return columnSplits.length;
        };

        // Calculamos o fator de escala final
        // O viewport.scale (ex: 3.0) era do PDF.js.
        // O processImageAndLayout pode ter feito um upscale adicional.
        // Precisamos normalizar as coordenadas finais para o sistema PDF (72dpi, scale 1.0)
        // width é a largura do processedCanvas. viewport.width era o anterior.
        // scaleTotal = width / (pdfPageWidthOriginal)
        // pdfPageWidthOriginal = viewport.width / this.ocrScale
        const totalScaleFactor = width / (viewport.width / this.ocrScale);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                let x = c * (this.tileSize - this.tileOverlap);
                let y = r * (this.tileSize - this.tileOverlap);
                const w = Math.min(this.tileSize, width - x);
                const h = Math.min(this.tileSize, height - y);

                // Extrai tile
                const tileCanvas = await extractImageTile(processedCanvas, { x, y, w, h });
                
                // OCR com PSM 6 (Single Block of Text) - Crítico!
                // Isso impede o Tesseract de procurar layout dentro do tile
                await worker.setParameters({ 
                    tessedit_pageseg_mode: '6' as any,
                    tessedit_char_whitelist: '' // Reset
                });
                
                const { data } = await worker.recognize(tileCanvas);
                
                if (data && data.words) {
                    const tileWords = data.words.map(wrd => {
                        return {
                            text: wrd.text,
                            confidence: wrd.confidence,
                            bbox: {
                                x0: wrd.bbox.x0,
                                y0: wrd.bbox.y0,
                                x1: wrd.bbox.x1,
                                y1: wrd.bbox.y1
                            }
                        };
                    });

                    // Mapeia coordenadas do Tile -> Canvas Processado -> PDF Original
                    const mapped = this.mapCoords(tileWords, x, y, totalScaleFactor, getColumnIndex);
                    allWords.push(...mapped);
                }

                if (tileCanvas instanceof OffscreenCanvas) { tileCanvas.width = 0; tileCanvas.height = 0; }
            }
        }

        if (processedCanvas instanceof OffscreenCanvas) { processedCanvas.width = 0; processedCanvas.height = 0; }
        else { (processedCanvas as HTMLCanvasElement).width = 0; }

        const cleanWords = this.deduplicateWords(allWords);
        this.sortWords(cleanWords);

        this.onPageComplete(task.pageNumber, cleanWords);
        if (this.onCheckpoint) this.onCheckpoint();
    }

    private mapCoords(
        words: any[], 
        tileX: number, tileY: number, 
        scaleFactor: number,
        colResolver: (x: number) => number,
        tileW?: number, tileH?: number
    ): WeightedWord[] {
        return words.map(w => {
            let x0, y0, x1, y1;

            if (w.isRelative && tileW && tileH) {
                // Florence coords (0-1000)
                const lx0 = (w.bbox.x0 / 1000) * tileW;
                const ly0 = (w.bbox.y0 / 1000) * tileH;
                const lx1 = (w.bbox.x1 / 1000) * tileW;
                const ly1 = (w.bbox.y1 / 1000) * tileH;
                
                x0 = (lx0 + tileX) / scaleFactor;
                y0 = (ly0 + tileY) / scaleFactor;
                x1 = (lx1 + tileX) / scaleFactor;
                y1 = (ly1 + tileY) / scaleFactor;
            } else {
                // Tesseract coords (pixels)
                x0 = (w.bbox.x0 + tileX) / scaleFactor;
                y0 = (w.bbox.y0 + tileY) / scaleFactor;
                x1 = (w.bbox.x1 + tileX) / scaleFactor;
                y1 = (w.bbox.y1 + tileY) / scaleFactor;
            }

            // Validação de ruído
            if (!this.validateWord(w)) return null;

            // Determina a coluna baseada no centro X global
            const globalXCenter = (x0 + x1) / 2 * scaleFactor;
            const column = colResolver(globalXCenter);

            return {
                text: w.text,
                confidence: w.confidence,
                centerScore: 0, // Não usado na dedup do Tesseract, mas mantido
                column,
                bbox: { x0, y0, x1, y1 }
            };
        }).filter(Boolean) as WeightedWord[];
    }

    private sortWords(words: WeightedWord[]) {
        // ORDEM DE LEITURA CORRIGIDA: Coluna -> Linha -> X
        words.sort((a, b) => {
            // 1. Coluna
            if (a.column !== b.column) return a.column - b.column;
            
            // 2. Linha (Threshold de 10px para considerar mesma linha)
            if (Math.abs(a.bbox.y0 - b.bbox.y0) > 10) return a.bbox.y0 - b.bbox.y0;
            
            // 3. Horizontal
            return a.bbox.x0 - b.bbox.x0;
        });
    }
}
