
import { PDFDocumentProxy } from "pdfjs-dist";
import { getOcrWorker } from "./ocrService";
import { processImageAndLayout, extractColumnSlice, extractImageTile } from "./imageProcessingService";

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
    
    // --- HIGH FIDELITY SETTINGS ---
    // Scale 3.0 (~300 DPI) é o padrão ouro para OCR.
    private ocrScale: number = 3.0; 
    
    // Tiling Configuration
    private tileSize: number = 1024; // Tamanho do bloco em pixels
    private tileOverlap: number = 200; // Sobreposição segura

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
            if (this.queue.length > 0) setTimeout(() => this.processNext(), 200);
        } catch (e) {
            console.error(`[OcrManager] Falha p${task.pageNumber}:`, e);
            this.activePage = null;
            this.processing = false;
            this.emitStatus();
            setTimeout(() => this.processNext(), 1000);
        }
    }

    /**
     * PROTOCOLO DE SANEAMENTO DE TEXTO (GARBAGE FILTER)
     */
    private validateWord(word: any, containerHeight: number): boolean {
        const text = word.text.trim();
        if (word.confidence < 40) return false;
        if (!/[a-zA-Z0-9]/.test(text)) return false;
        if (text.length > 45) return false;
        if (/(.)\1{4,}/.test(text)) return false;
        const h = word.bbox.y1 - word.bbox.y0;
        const w = word.bbox.x1 - word.bbox.x0;
        if (h > w * 6) return false;
        if (h < 8 || w < 4) return false;
        if (h > containerHeight * 0.6) return false;
        return true;
    }

    /**
     * DEDUPLICAÇÃO ESPACIAL
     * Remove palavras duplicadas geradas pela sobreposição (Overlap) dos tiles.
     */
    private deduplicateWords(words: any[]): any[] {
        // Ordena por posição Y (depois X) para facilitar comparação
        words.sort((a, b) => {
            if (Math.abs(a.bbox.y0 - b.bbox.y0) > 5) return a.bbox.y0 - b.bbox.y0;
            return a.bbox.x0 - b.bbox.x0;
        });

        const result: any[] = [];
        const threshold = 5; // Tolerância de pixel

        for (const word of words) {
            let duplicate = false;
            
            // Verifica os últimos candidatos adicionados (janela deslizante)
            for (let i = result.length - 1; i >= 0; i--) {
                const prev = result[i];
                
                // Se estiver muito longe verticalmente, para de checar
                if (Math.abs(word.bbox.y0 - prev.bbox.y0) > 20) break;

                // Checa colisão de caixa + Texto idêntico
                const xMatch = Math.abs(word.bbox.x0 - prev.bbox.x0) < threshold;
                const textMatch = word.text === prev.text;

                if (xMatch && textMatch) {
                    duplicate = true;
                    // Mantém o que tem maior confiança
                    if (word.confidence > prev.confidence) {
                        result[i] = word;
                    }
                    break;
                }
            }

            if (!duplicate) {
                result.push(word);
            }
        }
        return result;
    }

    private async executeTask(task: OcrTask) {
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

        // Processamento de Imagem (Deskew + Filtros)
        const { width, height, columnSplits, processedCanvas } = await processImageAndLayout(canvas);
        
        if (canvas instanceof OffscreenCanvas) { canvas.width = 0; canvas.height = 0; }
        else { (canvas as HTMLCanvasElement).width = 0; (canvas as HTMLCanvasElement).height = 0; }

        const worker = await getOcrWorker();
        let allWords: any[] = [];

        // ESTRATÉGIA HÍBRIDA: COLUNAS + TILES
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

        // Para cada coluna, verificamos se precisamos de Tiling
        for (const region of regions) {
            // Se a região for muito alta (> 2000px), usamos Tiling para manter qualidade
            // Se for pequena, processamos direto
            if (height > 2000 || region.w > 2000) {
                
                // --- TILED OCR LOOP ---
                const colWords: any[] = [];
                const stepY = this.tileSize - this.tileOverlap;
                
                for (let y = 0; y < height; y += stepY) {
                    // Define altura do tile (cuidando com a borda inferior)
                    const tileH = Math.min(this.tileSize, height - y);
                    
                    // Extrai tile
                    const tileCanvas = await extractImageTile(processedCanvas, {
                        x: region.x,
                        y: y,
                        w: region.w,
                        h: tileH
                    });

                    await worker.setParameters({ tessedit_pageseg_mode: '6' as any }); // Block mode
                    const { data } = await worker.recognize(tileCanvas);

                    if (data && data.words) {
                        const tileWords = data.words.map(w => {
                            // Converte coordenadas locais do Tile para Globais da Página
                            const globalBbox = {
                                x0: ((w.bbox.x0 + region.x) / this.ocrScale),
                                y0: ((w.bbox.y0 + y) / this.ocrScale),
                                x1: ((w.bbox.x1 + region.x) / this.ocrScale),
                                y1: ((w.bbox.y1 + y) / this.ocrScale)
                            };

                            const mapped = {
                                text: w.text,
                                confidence: w.confidence,
                                column: region.colIndex,
                                bbox: globalBbox
                            };

                            if (!this.validateWord(mapped, height / this.ocrScale)) return null;
                            return mapped;
                        }).filter(Boolean);

                        colWords.push(...tileWords);
                    }

                    // Yield para UI
                    await new Promise(r => setTimeout(r, 10));
                }
                
                // Deduplica a coluna processada em tiles
                const cleanColWords = this.deduplicateWords(colWords);
                allWords.push(...cleanColWords);

            } else {
                // Processamento Direto (Fast Path para áreas pequenas)
                const sliceCanvas = await extractColumnSlice(processedCanvas, region.x, 0, region.w, height, 1.0);
                await worker.setParameters({ tessedit_pageseg_mode: '6' as any });
                const { data } = await worker.recognize(sliceCanvas);
                
                if (data && data.words) {
                    const PADDING = 40; // Sync with extractColumnSlice padding
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
        }

        // Limpeza final
        if (processedCanvas instanceof OffscreenCanvas) { processedCanvas.width = 0; processedCanvas.height = 0; }
        else { (processedCanvas as HTMLCanvasElement).width = 0; }

        // Ordenação Global
        allWords.sort((a, b) => {
            if (a.column !== b.column) return a.column - b.column;
            const yDiff = a.bbox.y0 - b.bbox.y0;
            if (Math.abs(yDiff) < 5) return a.bbox.x0 - b.bbox.x0;
            return yDiff;
        });

        this.onPageComplete(task.pageNumber, allWords);
        if (this.onCheckpoint) this.onCheckpoint();
    }
}
