
import { PDFDocumentProxy } from "pdfjs-dist";
import { getOcrWorker } from "./ocrService";
import type { WorkerInput, WorkerOutput } from "../workers/imageProcessingWorker";

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
    private ocrScale: number = 3.0; 
    
    // Worker Pool (Single Worker for now to keep sequence)
    private worker: Worker | null = null;

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
        this.initWorker();
    }

    private initWorker() {
        if (typeof Worker !== 'undefined') {
            try {
                // INSTANCIAÇÃO SEGURA DO WORKER
                // Usa URL relativa ao módulo atual para evitar "Invalid URL"
                // Não usa import direto para evitar erro de "export default"
                this.worker = new Worker(
                    new URL('../workers/imageProcessingWorker.ts', import.meta.url),
                    { type: 'module' }
                );
                
                this.worker.onerror = (err) => {
                    console.error("[OcrManager] Worker Error:", err);
                    // Tenta reiniciar em caso de crash
                    this.worker?.terminate();
                    this.worker = null;
                };
            } catch (e) {
                console.error("[OcrManager] Failed to initialize worker:", e);
            }
        }
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

    public terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
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
        
        // Se o worker morreu, tenta reviver
        if (!this.worker) this.initWorker();
        if (!this.worker) return; // Falha fatal

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
            // Retry logic simples
            if (task.retries < 1) {
                task.retries++;
                this.queue.push(task);
            }
            setTimeout(() => this.processNext(), 1000);
        }
    }

    private executeTask(task: OcrTask): Promise<void> {
        return new Promise(async (resolve, reject) => {
            if (!this.worker) return reject("Worker not available");

            try {
                // 1. Renderiza PDF na Main Thread (PDF.js é otimizado para isso)
                const page = await this.pdfDoc.getPage(task.pageNumber);
                const viewport = page.getViewport({ scale: this.ocrScale });
                
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
                
                await page.render({ canvasContext: ctx as any, viewport }).promise;

                // 2. Cria Bitmap para transferir ao Worker (Zero-Copy)
                const bitmap = await createImageBitmap(canvas);
                
                // Limpa canvas da DOM para economizar memória
                canvas.width = 0; 
                canvas.height = 0;

                const message: WorkerInput = {
                    imageBitmap: bitmap,
                    width: viewport.width,
                    height: viewport.height,
                    pageNumber: task.pageNumber
                };

                // Handler único para esta tarefa
                const handleMessage = async (e: MessageEvent<WorkerOutput>) => {
                    const data = e.data;
                    
                    if (data.pageNumber !== task.pageNumber) return; // Ignora mensagens antigas
                    
                    this.worker?.removeEventListener('message', handleMessage);

                    if (!data.success || !data.imageBitmap) {
                        reject(data.error || "Unknown worker error");
                        return;
                    }

                    try {
                        // 3. Recebe Bitmap Processado e envia para Tesseract
                        const finalCanvas = document.createElement('canvas');
                        finalCanvas.width = data.imageBitmap.width;
                        finalCanvas.height = data.imageBitmap.height;
                        const fctx = finalCanvas.getContext('2d');
                        fctx?.drawImage(data.imageBitmap, 0, 0);
                        data.imageBitmap.close(); // Libera bitmap recebido

                        const tesseractWorker = await getOcrWorker();
                        const { data: ocrResult } = await tesseractWorker.recognize(finalCanvas);
                        
                        finalCanvas.width = 0; 
                        finalCanvas.height = 0;

                        // 4. Processa Resultados
                        let cleanWords = [];
                        if (ocrResult && ocrResult.words) {
                            const width = viewport.width;
                            const height = viewport.height;
                            const columnSplits = data.columnSplits || [];

                            cleanWords = ocrResult.words.map(w => {
                                let column = 0;
                                if (columnSplits.length > 0) {
                                    const xCenter = (w.bbox.x0 + w.bbox.x1) / 2;
                                    if (xCenter > columnSplits[0]) column = 1;
                                }

                                const bboxWidth = w.bbox.x1 - w.bbox.x0;
                                const bboxHeight = w.bbox.y1 - w.bbox.y0;
                                
                                // Filtro de "Ghost Blocks" (Ruído de fundo)
                                if (bboxWidth > width * 0.9 || (bboxWidth > width * 0.5 && bboxHeight > height * 0.5)) {
                                    return null;
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
                            }).filter(Boolean); // Remove nulls

                            cleanWords.sort((a: any, b: any) => {
                                if (!a || !b) return 0;
                                if (a.column !== b.column) return a.column - b.column;
                                const yDiff = a.bbox.y0 - b.bbox.y0;
                                if (Math.abs(yDiff) < 5) return a.bbox.x0 - b.bbox.x0;
                                return yDiff;
                            });
                        }

                        this.onPageComplete(task.pageNumber, cleanWords);
                        if (this.onCheckpoint) this.onCheckpoint();
                        resolve();

                    } catch (processingError) {
                        reject(processingError);
                    }
                };

                this.worker.addEventListener('message', handleMessage);
                this.worker.postMessage(message, [bitmap]); // Transfere o bitmap

            } catch (err) {
                reject(err);
            }
        });
    }
}
