
import { PDFDocumentProxy } from "pdfjs-dist";
import { getOcrWorker } from "./ocrService";
import { processImageAndLayout } from "./imageProcessingService";

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
    private ocrScale: number = 2.5; // Escala levemente reduzida para agilizar deskew/processamento

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
            await this.executeTask(task);
            this.activePage = null;
            this.processedPages.add(task.pageNumber);
            this.processing = false;
            this.emitStatus();
            if (this.queue.length > 0) setTimeout(() => this.processNext(), 50);
        } catch (e) {
            console.error(`[OcrManager] Falha p${task.pageNumber}:`, e);
            this.activePage = null;
            this.processing = false;
            this.emitStatus();
            setTimeout(() => this.processNext(), 1000);
        }
    }

    private async executeTask(task: OcrTask) {
        const page = await this.pdfDoc.getPage(task.pageNumber);
        const viewport = page.getViewport({ scale: this.ocrScale });
        
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d', { alpha: false });
        await page.render({ canvasContext: ctx as any, viewport }).promise;

        // --- PIPELINE DE VISÃO COMPUTACIONAL ---
        // 1. Deskew (Rotação)
        // 2. Limpeza (Adaptive Threshold)
        // 3. Detecção de Layout (Colunas)
        const { buffer, width, height, columnSplits, processedCanvas } = await processImageAndLayout(canvas);
        
        // Limpa canvas original
        canvas.width = 0; canvas.height = 0;

        const worker = await getOcrWorker();
        let allWords: any[] = [];

        // --- FATIAMENTO FÍSICO (SLICING) ---
        // Cria regiões baseadas nas colunas detectadas
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

        // Processa cada fatia separadamente
        for (const region of regions) {
            // Cria um mini-canvas para a coluna
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = region.w;
            sliceCanvas.height = height;
            const sctx = sliceCanvas.getContext('2d', { alpha: false });
            
            if (sctx) {
                // Desenha apenas a parte da coluna a partir do canvas processado (limpo e rotacionado)
                sctx.drawImage(processedCanvas, region.x, 0, region.w, height, 0, 0, region.w, height);
                
                // OCR na fatia
                const { data } = await worker.recognize(sliceCanvas);
                
                if (data && data.words) {
                    const regionWords = data.words.map(w => {
                        // Filtro de Ruído: Remove palavras gigantes (artefatos)
                        const wWidth = w.bbox.x1 - w.bbox.x0;
                        const wHeight = w.bbox.y1 - w.bbox.y0;
                        if (wWidth > region.w * 0.9 || wHeight > height * 0.3) return null;

                        return {
                            text: w.text,
                            confidence: w.confidence,
                            column: region.colIndex,
                            // Remapeia coordenadas da fatia para a página inteira
                            // E aplica escala inversa para voltar ao tamanho original do PDF
                            bbox: {
                                x0: (w.bbox.x0 + region.x) / this.ocrScale,
                                y0: w.bbox.y0 / this.ocrScale,
                                x1: (w.bbox.x1 + region.x) / this.ocrScale,
                                y1: w.bbox.y1 / this.ocrScale
                            }
                        };
                    }).filter(Boolean);
                    allWords.push(...regionWords);
                }
                
                // Limpeza do slice
                sliceCanvas.width = 0; sliceCanvas.height = 0;
            }
        }

        // Limpeza final
        processedCanvas.width = 0; processedCanvas.height = 0;

        // Ordenação final (Coluna > Y > X) para garantir fluxo de leitura
        allWords.sort((a, b) => {
            if (a.column !== b.column) return a.column - b.column;
            // Tolerância de linha (5px no PDF original)
            const yDiff = a.bbox.y0 - b.bbox.y0;
            if (Math.abs(yDiff) < 5) return a.bbox.x0 - b.bbox.x0;
            return yDiff;
        });

        this.onPageComplete(task.pageNumber, allWords);
        if (this.onCheckpoint) this.onCheckpoint();
    }
}
