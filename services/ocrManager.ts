
import { PDFDocumentProxy } from "pdfjs-dist";
import { getOcrWorker } from "./ocrService";
import { processImageAndLayout, extractColumnSlice, extractImageTile } from "./imageProcessingService";
import { florenceService } from "./florenceService";

export type OcrStatus = 'idle' | 'queued' | 'processing' | 'done' | 'error';
export type OcrEngineType = 'tesseract' | 'florence';

type Priority = 'high' | 'low';

interface OcrTask {
    pageNumber: number;
    priority: Priority;
    retries: number;
}

// Interface estendida para suportar score de centralidade e coluna
interface WeightedWord {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    column: number; // Crítico para jornais
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
    private ocrScale: number = 3.0; // Tesseract Scale
    private florenceScale: number = 2.0; // Florence Scale
    
    // Tiling Configuration
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
                await this.executeTesseractTask(task);
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

    // --- SHARED UTILS ---
    private validateWord(word: any, containerHeight: number): boolean {
        const text = word.text.trim();
        if (!text) return false;
        if (text.length < 2 && !/[a-zA-Z0-9]/.test(text)) return false; 
        if (/(.)\1{4,}/.test(text)) return false; 
        return true;
    }

    private checkIntersection(bboxA: any, bboxB: any) {
        const xA = Math.max(bboxA.x0, bboxB.x0);
        const yA = Math.max(bboxA.y0, bboxB.y0);
        const xB = Math.min(bboxA.x1, bboxB.x1);
        const yB = Math.min(bboxA.y1, bboxB.y1);

        const interW = Math.max(0, xB - xA);
        const interH = Math.max(0, yB - yA);
        const interArea = interW * interH;
        
        const areaA = (bboxA.x1 - bboxA.x0) * (bboxA.y1 - bboxA.y0);
        const areaB = (bboxB.x1 - bboxB.x0) * (bboxB.y1 - bboxB.y0);
        
        const minArea = Math.min(areaA, areaB);
        return interArea > (minArea * 0.7);
    }

    private deduplicateWords(words: WeightedWord[]) {
        const uniqueWords: WeightedWord[] = [];
        words.sort((a, b) => b.centerScore - a.centerScore);

        for (const word of words) {
            let isDuplicate = false;
            if (word.centerScore < 0.1) {
                 const collision = uniqueWords.some(existing => this.checkIntersection(word.bbox, existing.bbox));
                 if (collision) continue;
            }

            for (const existing of uniqueWords) {
                if (this.checkIntersection(word.bbox, existing.bbox)) {
                    isDuplicate = true;
                    break;
                }
            }
            if (!isDuplicate) uniqueWords.push(word);
        }
        return uniqueWords;
    }

    // --- FLORENCE STRATEGY (Tiled + Layout Aware) ---
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

        // 1. Detectar Colunas (Layout Analysis)
        // Isso é crucial para jornais. Usamos o algoritmo de projeção existente.
        const { columnSplits } = await processImageAndLayout(canvas);
        
        const width = viewport.width;
        const height = viewport.height;
        const allWords: WeightedWord[] = [];

        const cols = Math.ceil(width / (this.tileSize - this.tileOverlap));
        const rows = Math.ceil(height / (this.tileSize - this.tileOverlap));
        
        // Helper para determinar coluna de uma palavra
        const getColumnIndex = (xCenter: number): number => {
            for (let i = 0; i < columnSplits.length; i++) {
                if (xCenter < columnSplits[i]) return i;
            }
            return columnSplits.length;
        };

        if (cols === 1 && rows === 1) {
            const blob = await (canvas as any).convertToBlob({ type: 'image/jpeg', quality: 0.9 });
            const words = await florenceService.runOcr(blob);
            const mapped = this.mapFlorenceCoords(words, 0, 0, width, height, viewport.width, viewport.height, 1.0, getColumnIndex);
            allWords.push(...mapped);
        } else {
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    let x = c * (this.tileSize - this.tileOverlap);
                    let y = r * (this.tileSize - this.tileOverlap);
                    
                    const w = Math.min(this.tileSize, width - x);
                    const h = Math.min(this.tileSize, height - y);
                    
                    const tileCanvas = await extractImageTile(canvas, { x, y, w, h });
                    const blob = await (tileCanvas as any).convertToBlob({ type: 'image/jpeg', quality: 0.9 });
                    
                    const words = await florenceService.runOcr(blob);
                    
                    const mapped = this.mapFlorenceCoords(words, x, y, w, h, viewport.width, viewport.height, undefined, getColumnIndex);
                    allWords.push(...mapped);
                    
                    if (tileCanvas instanceof OffscreenCanvas) { tileCanvas.width = 0; tileCanvas.height = 0; }
                }
            }
        }

        if (canvas instanceof OffscreenCanvas) { canvas.width = 0; canvas.height = 0; }
        else { (canvas as HTMLCanvasElement).width = 0; }

        const cleanWords = this.deduplicateWords(allWords);

        // ORDEM DE LEITURA CORRIGIDA: Coluna -> Linha -> X
        cleanWords.sort((a, b) => {
            // 1. Coluna
            if (a.column !== b.column) return a.column - b.column;
            
            // 2. Linha (Threshold de 10px para considerar mesma linha)
            if (Math.abs(a.bbox.y0 - b.bbox.y0) > 10) return a.bbox.y0 - b.bbox.y0;
            
            // 3. Horizontal
            return a.bbox.x0 - b.bbox.x0;
        });

        this.onPageComplete(task.pageNumber, cleanWords);
        if (this.onCheckpoint) this.onCheckpoint();
    }

    private mapFlorenceCoords(
        words: any[], 
        tileX: number, tileY: number, tileW: number, tileH: number, 
        totalW: number, totalH: number, 
        forceScore: number | undefined,
        colResolver: (x: number) => number
    ): WeightedWord[] {
        return words.map(w => {
            let centerScore = forceScore || 0;
            const localXCenter = (w.bbox.x0 + w.bbox.x1) / 2;
            const localYCenter = (w.bbox.y0 + w.bbox.y1) / 2;

            if (forceScore === undefined) {
                const distX = 1 - (Math.abs(localXCenter - 500) / 500);
                const distY = 1 - (Math.abs(localYCenter - 500) / 500);
                centerScore = distX * distY;
            }

            // Desnormalização e Translação
            let x0, y0, x1, y1;
            
            if (w.isRelative) {
                const lx0 = (w.bbox.x0 / 1000) * tileW;
                const ly0 = (w.bbox.y0 / 1000) * tileH;
                const lx1 = (w.bbox.x1 / 1000) * tileW;
                const ly1 = (w.bbox.y1 / 1000) * tileH;
                
                x0 = (lx0 + tileX) / this.florenceScale;
                y0 = (ly0 + tileY) / this.florenceScale;
                x1 = (lx1 + tileX) / this.florenceScale;
                y1 = (ly1 + tileY) / this.florenceScale;
            } else {
                // Caso raro onde Florence retorna coords absolutas (não padrão)
                x0 = w.bbox.x0; y0 = w.bbox.y0; x1 = w.bbox.x1; y1 = w.bbox.y1;
            }

            // Determina a coluna baseada no centro X global (escalado para render context)
            const globalXCenter = (x0 + x1) / 2 * this.florenceScale;
            const column = colResolver(globalXCenter);

            return {
                text: w.text,
                confidence: w.confidence,
                centerScore,
                column,
                bbox: { x0, y0, x1, y1 }
            };
        });
    }

    // --- TESSERACT STRATEGY (Legacy) ---
    private async executeTesseractTask(task: OcrTask) {
        const page = await this.pdfDoc.getPage(task.pageNumber);
        const viewport = page.getViewport({ scale: this.ocrScale });
        
        const isOffscreenSupported = typeof OffscreenCanvas !== 'undefined';
        const canvas = isOffscreenSupported ? new OffscreenCanvas(viewport.width, viewport.height) : document.createElement('canvas');
        
        if (!isOffscreenSupported) {
            (canvas as HTMLCanvasElement).width = viewport.width;
            (canvas as HTMLCanvasElement).height = viewport.height;
        }
        
        const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true }) as any;
        await page.render({ canvasContext: ctx, viewport }).promise;

        const { width, height, columnSplits, processedCanvas } = await processImageAndLayout(canvas);
        
        if (canvas instanceof OffscreenCanvas) { canvas.width = 0; canvas.height = 0; }
        else { (canvas as HTMLCanvasElement).width = 0; (canvas as HTMLCanvasElement).height = 0; }

        const worker = await getOcrWorker();
        let allWords: any[] = [];

        const regions = [];
        if (columnSplits.length === 0) {
            regions.push({ x: 0, w: width, colIndex: 0 });
        } else {
            let currentX = 0;
            columnSplits.forEach((splitX, i) => {
                regions.push({ x: currentX, w: splitX - currentX, colIndex: i });
                currentX = splitX;
            });
            regions.push({ x: currentX, w: width - currentX, colIndex: columnSplits.length });
        }

        for (const region of regions) {
            const sliceCanvas = await extractColumnSlice(processedCanvas, region.x, 0, region.w, height, 1.0);
            await worker.setParameters({ tessedit_pageseg_mode: '6' as any });
            const { data } = await worker.recognize(sliceCanvas);
            
            if (data && data.words) {
                const PADDING = 40; 
                const regionWords = data.words.map(w => {
                    const mapped = {
                        text: w.text,
                        confidence: w.confidence,
                        column: region.colIndex,
                        bbox: {
                            x0: ((w.bbox.x0 - PADDING) + region.x) / this.ocrScale,
                            y0: (w.bbox.y0 - PADDING) / this.ocrScale,
                            x1: ((w.bbox.x1 - PADDING) + region.x) / this.ocrScale,
                            y1: (w.bbox.y1 - PADDING) / this.ocrScale
                        }
                    };
                    if (!this.validateWord(mapped, height / this.ocrScale)) return null;
                    return mapped;
                }).filter(Boolean);
                allWords.push(...regionWords);
            }
        }

        if (processedCanvas instanceof OffscreenCanvas) { processedCanvas.width = 0; processedCanvas.height = 0; }
        else { (processedCanvas as HTMLCanvasElement).width = 0; }

        this.onPageComplete(task.pageNumber, allWords);
        if (this.onCheckpoint) this.onCheckpoint();
    }
}
