
import { PDFDocumentProxy } from "pdfjs-dist";
import { getOcrWorker } from "./ocrService";
import { processImageAndLayout, extractColumnSlice } from "./imageProcessingService";

export type OcrStatus = 'idle' | 'queued' | 'processing' | 'done' | 'error';

type Priority = 'high' | 'low';

interface OcrTask {
    pageNumber: number;
    priority: Priority;
    retries: number;
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
    
    private ocrScale: number = 3.0; // Alta resolução para melhor detecção de caixas

    constructor(
        pdfDoc: PDFDocumentProxy, 
        onPageComplete: (page: number, words: any[]) => void,
        onStatusChange: (statusMap: Record<number, OcrStatus>) => void,
        onCheckpoint?: () => void
    ) {
        this.pdfDoc = pdfDoc;
        this.onPageComplete = onPageComplete;
        this.onStatusChange = onStatusChange;
        this.onCheckpoint = onCheckpoint;
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
            
            // Executa Tesseract exclusivamente para obter geometria e texto base
            await this.executeTesseractTask(task);

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

    private validateWord(word: any): boolean {
        // Validação mínima para garantir que temos uma caixa válida
        if (!word.bbox) return false;
        return true;
    }

    // --- TESSERACT STRATEGY (Geometry Provider) ---
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
            await worker.setParameters({ tessedit_pageseg_mode: '6' as any }); // Assume single block of text per column
            const { data } = await worker.recognize(sliceCanvas);
            
            if (data && data.words) {
                const PADDING = 40; 
                const regionWords = data.words.map(w => {
                    const mapped = {
                        text: w.text, // Texto base (sujo), será substituído pela IA
                        confidence: w.confidence,
                        column: region.colIndex,
                        bbox: {
                            x0: ((w.bbox.x0 - PADDING) + region.x) / this.ocrScale,
                            y0: (w.bbox.y0 - PADDING) / this.ocrScale,
                            x1: ((w.bbox.x1 - PADDING) + region.x) / this.ocrScale,
                            y1: (w.bbox.y1 - PADDING) / this.ocrScale
                        }
                    };
                    if (!this.validateWord(mapped)) return null;
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
