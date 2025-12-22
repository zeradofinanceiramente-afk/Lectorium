import { PDFDocumentProxy } from "pdfjs-dist";
import { getOcrWorker } from "./ocrService";

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
    private ocrScale: number = 2.5; // Scale balanceado para precisão vs performance
    private imageWorker: Worker;

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
        
        // Inicializa o Worker de Imagem usando o padrão URL Constructor (Vite Safe)
        // Isso corrige o erro "does not provide an export named 'default'"
        this.imageWorker = new Worker(
            new URL('../workers/imageProcessing.worker.ts', import.meta.url), 
            { type: 'module' }
        );
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
        this.imageWorker.terminate();
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
            // Retry logic simplificado: joga pro final da fila se tiver retries
            if (task.retries < 2) {
                task.retries++;
                this.queue.push(task);
            }
            setTimeout(() => this.processNext(), 1000);
        }
    }

    private async executeTask(task: OcrTask) {
        const page = await this.pdfDoc.getPage(task.pageNumber);
        const viewport = page.getViewport({ scale: this.ocrScale });
        
        // Renderiza o PDF para um OffscreenCanvas (se suportado) ou Canvas normal
        // PDF.js exige canvas na main thread ainda para renderização de fontes
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
        
        await page.render({ canvasContext: ctx as any, viewport }).promise;

        // Extrai ImageBitmap (Zero-Copy Transferable)
        const bitmap = await createImageBitmap(canvas);
        
        // Limpa canvas da main thread imediatamente
        canvas.width = 0; canvas.height = 0;

        // Processamento Off-Thread (Worker)
        const { processedBitmap, columnSplits } = await this.processImageOffThread(bitmap, viewport.width, viewport.height);

        // OCR Engine (Worker separado do Tesseract)
        const worker = await getOcrWorker();
        
        // Tesseract.js aceita ImageBitmap diretamente! (Super rápido)
        const { data } = await worker.recognize(processedBitmap);
        
        // Bitmap já foi consumido ou transferido, o GC cuida dele.
        
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
                    // Normaliza coordenadas de volta para escala 1.0 (PDF Coordinates)
                    bbox: {
                        x0: w.bbox.x0 / this.ocrScale,
                        y0: w.bbox.y0 / this.ocrScale,
                        x1: w.bbox.x1 / this.ocrScale,
                        y1: w.bbox.y1 / this.ocrScale
                    }
                };
            });

            // Ordenação lógica de leitura (Topo-Baixo, Esquerda-Direita respeitando colunas)
            cleanWords.sort((a, b) => {
                if (a.column !== b.column) return a.column - b.column;
                const yDiff = a.bbox.y0 - b.bbox.y0;
                // Tolerância de linha (5px)
                if (Math.abs(yDiff) < 5) return a.bbox.x0 - b.bbox.x0;
                return yDiff;
            });
        }

        this.onPageComplete(task.pageNumber, cleanWords);
        if (this.onCheckpoint) this.onCheckpoint();
    }

    // Wrapper promissificado para o ImageWorker
    private processImageOffThread(bitmap: ImageBitmap, width: number, height: number): Promise<{ processedBitmap: ImageBitmap, columnSplits: number[] }> {
        return new Promise((resolve, reject) => {
            const operationId = Math.random().toString(36).substr(2, 9);
            
            const handler = (e: MessageEvent) => {
                if (e.data.operationId === operationId) {
                    this.imageWorker.removeEventListener('message', handler);
                    if (e.data.success) {
                        resolve({ 
                            processedBitmap: e.data.processedBitmap, 
                            columnSplits: e.data.columnSplits 
                        });
                    } else {
                        reject(new Error(e.data.error));
                    }
                }
            };

            this.imageWorker.addEventListener('message', handler);
            
            // Envia para o worker com transferência de posse do bitmap (Zero Copy)
            this.imageWorker.postMessage({
                operationId,
                bitmap,
                width,
                height
            }, [bitmap]);
        });
    }
}