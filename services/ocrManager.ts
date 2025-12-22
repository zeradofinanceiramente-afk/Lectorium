
import { PDFDocumentProxy } from "pdfjs-dist";
import { getOcrWorker } from "./ocrService";
// @ts-ignore
import ImageProcessorWorker from '../workers/imageProcessor.worker.ts?worker';

export type OcrStatus = 'idle' | 'queued' | 'processing' | 'done' | 'error';

type Priority = 'high' | 'low';

interface OcrTask {
    pageNumber: number;
    priority: Priority;
    retries: number;
}

interface WorkerWrapper {
    id: number;
    worker: Worker;
    busy: boolean;
}

export class OcrManager {
    private pdfDoc: PDFDocumentProxy;
    private queue: OcrTask[] = [];
    private workerPool: WorkerWrapper[] = [];
    private processedPages: Set<number> = new Set();
    private activePages: Set<number> = new Set(); // Track multiple active pages
    private onPageComplete: (page: number, words: any[]) => void;
    private onStatusChange: (statusMap: Record<number, OcrStatus>) => void;
    private onCheckpoint?: () => void;
    private ocrScale: number = 3.0; 

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
        
        this.initWorkerPool();
    }

    private initWorkerPool() {
        // Estratégia: Usar (Cores - 1) para deixar a UI thread livre
        // Mínimo de 2 workers para garantir paralelismo
        const logicalCores = navigator.hardwareConcurrency || 4;
        const poolSize = Math.max(2, logicalCores - 1);
        
        console.log(`[OcrManager] Inicializando Pool com ${poolSize} workers.`);

        for (let i = 0; i < poolSize; i++) {
            try {
                // Vite worker import handles URL resolution and bundling automatically
                const worker = new ImageProcessorWorker();
                this.workerPool.push({ id: i, worker, busy: false });
            } catch (e) {
                console.error(`[OcrManager] Falha ao iniciar worker ${i}:`, e);
            }
        }
    }

    public schedule(pageNumber: number, priority: Priority = 'low') {
        if (this.processedPages.has(pageNumber) || this.activePages.has(pageNumber)) return;
        
        // Remove duplicatas na fila
        this.queue = this.queue.filter(t => t.pageNumber !== pageNumber);
        
        const task: OcrTask = { pageNumber, priority, retries: 0 };
        
        if (priority === 'high') this.queue.unshift(task);
        else this.queue.push(task);
        
        this.emitStatus();
        this.processQueue();
    }

    public markAsProcessed(pageNumber: number) {
        this.processedPages.add(pageNumber);
        this.emitStatus();
    }

    public terminate() {
        this.workerPool.forEach(w => w.worker.terminate());
        this.workerPool = [];
    }

    private emitStatus() {
        const statusMap: Record<number, OcrStatus> = {};
        this.processedPages.forEach(p => statusMap[p] = 'done');
        this.queue.forEach(t => statusMap[t.pageNumber] = 'queued');
        this.activePages.forEach(p => statusMap[p] = 'processing');
        this.onStatusChange(statusMap);
    }

    private reportError(pageNumber: number) {
        const statusMap: Record<number, OcrStatus> = {};
        statusMap[pageNumber] = 'error';
        this.onStatusChange(statusMap);
    }

    private async processQueue() {
        // Encontra worker livre
        const idleWorker = this.workerPool.find(w => !w.busy);
        
        if (!idleWorker || this.queue.length === 0) return;

        const task = this.queue.shift();
        if (!task) return;

        this.runWorker(idleWorker, task);
        
        // Tenta processar mais se houver outros workers livres
        if (this.queue.length > 0 && this.workerPool.some(w => !w.busy)) {
            this.processQueue();
        }
    }

    private async runWorker(wrapper: WorkerWrapper, task: OcrTask) {
        wrapper.busy = true;
        this.activePages.add(task.pageNumber);
        this.emitStatus();

        try {
            await this.executeTask(wrapper.worker, task);
            this.processedPages.add(task.pageNumber);
        } catch (e) {
            console.error(`[OcrManager] Falha no Worker ${wrapper.id} p${task.pageNumber}:`, e);
            this.reportError(task.pageNumber);
            // Opcional: Re-enfileirar com retry count se for erro transiente
        } finally {
            wrapper.busy = false;
            this.activePages.delete(task.pageNumber);
            this.emitStatus();
            
            // Worker liberado, busca próxima tarefa
            this.processQueue();
        }
    }

    private async executeTask(imageWorker: Worker, task: OcrTask) {
        const page = await this.pdfDoc.getPage(task.pageNumber);
        const viewport = page.getViewport({ scale: this.ocrScale });
        
        // 1. Renderiza PDF na Main Thread (inevitável para PDF.js)
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
        
        if (!ctx) throw new Error("Canvas Context Lost");

        await page.render({ canvasContext: ctx as any, viewport }).promise;

        // 2. Extrai Bitmap e Transfere para Worker do Pool
        const sourceBitmap = await createImageBitmap(canvas);
        
        // Limpa canvas imediatamente para economizar RAM
        canvas.width = 0; canvas.height = 0;

        const layoutResult: any = await new Promise((resolve, reject) => {
            const handleMsg = (e: MessageEvent) => {
                // Remove listener para evitar memory leak em workers de longa duração
                imageWorker.removeEventListener('message', handleMsg);
                if (e.data.success) resolve(e.data.data);
                else reject(new Error(e.data.error || "Unknown worker error"));
            };
            
            const handleError = (e: ErrorEvent) => {
                imageWorker.removeEventListener('message', handleMsg);
                imageWorker.removeEventListener('error', handleError);
                reject(new Error(e.message));
            };

            imageWorker.addEventListener('message', handleMsg);
            imageWorker.addEventListener('error', handleError);
            
            imageWorker.postMessage({ type: 'processLayout', bitmap: sourceBitmap }, [sourceBitmap]);
        });

        const { processedBitmap, columnSplits } = layoutResult;

        // 3. OCR (Tesseract)
        const worker = await getOcrWorker();
        const { data } = await worker.recognize(processedBitmap);
        
        try { processedBitmap.close(); } catch(e){}

        let cleanWords = [];
        if (data && data.words) {
            cleanWords = data.words.map(w => {
                let column = 0;
                if (columnSplits.length > 0) {
                    const xCenter = (w.bbox.x0 + w.bbox.x1) / 2;
                    if (xCenter > columnSplits[0]) column = 1;
                }

                return {
                    text: w.text,
                    confidence: w.confidence,
                    column: column,
                    bbox: {
                        x0: w.bbox.x0 / this.ocrScale,
                        y0: w.bbox.y0 / this.ocrScale,
                        x1: w.bbox.x1 / this.ocrScale,
                        y1: w.bbox.y1 / this.ocrScale
                    }
                };
            });

            cleanWords.sort((a, b) => {
                if (a.column !== b.column) return a.column - b.column;
                const yDiff = a.bbox.y0 - b.bbox.y0;
                if (Math.abs(yDiff) < 5) return a.bbox.x0 - b.bbox.x0;
                return yDiff;
            });
        }

        this.onPageComplete(task.pageNumber, cleanWords);
        if (this.onCheckpoint) this.onCheckpoint();
    }
}
