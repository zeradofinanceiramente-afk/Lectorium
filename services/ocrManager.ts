
import { PDFDocumentProxy } from "pdfjs-dist";
import { getOcrWorker } from "./ocrService";
import { processImageAndLayout, extractColumnSlice, extractImageTile, preprocessImageForNeural, maskRegions } from "./imageProcessingService";
import { florenceService, DetectedObject } from "./florenceService";

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
    
    private ocrScale: number = 3.0; 
    private florenceScale: number = 2.0; 
    
    // Tiling Aggressive Config (Limita a VRAM)
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

    private isHardwareCapable(): boolean {
        // Fallback para Tesseract se hardware for fraco (Previne Crash em mobile low-end)
        const concurrency = navigator.hardwareConcurrency || 4;
        const memory = (navigator as any).deviceMemory || 4; // Chrome specific
        
        if (concurrency < 4 || memory < 4) {
            console.warn("[OCR] Hardware fraco detectado. Forçando modo Tesseract CPU.");
            return false;
        }
        return true;
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
            
            // Check Hardware Capabilities override
            const canUseFlorence = this.engine === 'florence' && this.isHardwareCapable();

            if (canUseFlorence) {
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

    // --- FLORENCE STRATEGY (Pipeline Avançado) ---
    private async executeFlorenceTask(task: OcrTask) {
        const page = await this.pdfDoc.getPage(task.pageNumber);
        const viewport = page.getViewport({ scale: this.florenceScale });
        
        // Renderização Inicial
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

        // 1. OBJECT DETECTION (<OD>) para mascarar figuras/tabelas
        // Executa em uma versão reduzida para velocidade
        const odBlob = await (canvas as any).convertToBlob({ type: 'image/jpeg', quality: 0.7 });
        const detectedObjects = await florenceService.runObjectDetection(odBlob);
        
        // Filtra objetos que atrapalham o OCR de texto (imagens e tabelas complexas)
        const maskTargets = detectedObjects
            .filter(obj => ['image', 'figure', 'table', 'chart', 'plot'].includes(obj.label.toLowerCase()))
            .map(obj => ({
                // Florence retorna coords na escala da imagem enviada
                bbox: obj.bbox // [x1, y1, x2, y2]
            }));

        // 2. MASCARAMENTO
        if (maskTargets.length > 0) {
            await maskRegions(canvas, maskTargets);
        }

        // 3. PRE-PROCESSING & LAYOUT ANALYSIS
        const { columnSplits, processedCanvas } = await preprocessImageForNeural(canvas);
        
        const width = viewport.width;
        const height = viewport.height;
        const allWords: WeightedWord[] = [];

        // 4. REGION DEFINITION
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

        const getColumnIndex = (xCenter: number): number => {
            for (let i = 0; i < columnSplits.length; i++) {
                if (xCenter < columnSplits[i]) return i;
            }
            return columnSplits.length;
        };

        // 5. AGGRESSIVE TILING (Memória Otimizada)
        // Divide colunas em blocos de 1024px
        for (const region of regions) {
            const regionRows = Math.ceil(height / (this.tileSize - this.tileOverlap));

            for (let r = 0; r < regionRows; r++) {
                const y = r * (this.tileSize - this.tileOverlap);
                const h = Math.min(this.tileSize, height - y);
                
                // Extrai Tile
                const sliceCanvas = await extractImageTile(processedCanvas, { x: region.x, y, w: region.w, h });
                const blob = await (sliceCanvas as any).convertToBlob({ type: 'image/jpeg', quality: 0.95 });
                
                // OCR no Tile
                const words = await florenceService.runOcr(blob);
                
                const mapped = this.mapFlorenceCoords(words, region.x, y, region.w, h, width, height, undefined, getColumnIndex);
                allWords.push(...mapped);
                
                // Libera memória do tile imediatamente
                if (sliceCanvas instanceof OffscreenCanvas) {
                    sliceCanvas.width = 0; sliceCanvas.height = 0;
                }
            }
        }

        // Cleanup
        if (processedCanvas instanceof OffscreenCanvas) { processedCanvas.width = 0; processedCanvas.height = 0; }
        if (canvas instanceof OffscreenCanvas) { canvas.width = 0; canvas.height = 0; }

        const cleanWords = this.deduplicateWords(allWords);

        // Sort: Column -> Line -> X
        cleanWords.sort((a, b) => {
            if (a.column !== b.column) return a.column - b.column;
            if (Math.abs(a.bbox.y0 - b.bbox.y0) > 10) return a.bbox.y0 - b.bbox.y0;
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
                // Score baseado na centralidade no tile (evita bordas)
                const distX = 1 - (Math.abs(localXCenter - (tileW/2)) / (tileW/2));
                const distY = 1 - (Math.abs(localYCenter - (tileH/2)) / (tileH/2));
                centerScore = distX * distY;
            }

            let x0, y0, x1, y1;
            
            if (w.isRelative) {
                // Se Florence retornou coord relativa (0-1000), mapeia para o Tile pixel
                const lx0 = (w.bbox.x0 / 1000) * tileW;
                const ly0 = (w.bbox.y0 / 1000) * tileH;
                const lx1 = (w.bbox.x1 / 1000) * tileW;
                const ly1 = (w.bbox.y1 / 1000) * tileH;
                
                // Mapeia do Tile para Página Global (dividido pela escala)
                x0 = (lx0 + tileX) / this.florenceScale;
                y0 = (ly0 + tileY) / this.florenceScale;
                x1 = (lx1 + tileX) / this.florenceScale;
                y1 = (ly1 + tileY) / this.florenceScale;
            } else {
                // Absolute Coords (fallback)
                x0 = w.bbox.x0; y0 = w.bbox.y0; x1 = w.bbox.x1; y1 = w.bbox.y1;
            }

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
