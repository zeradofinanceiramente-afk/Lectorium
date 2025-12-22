
import { PDFDocumentProxy } from "pdfjs-dist";
import { getOcrWorker } from "./ocrService";

export type OcrStatus = 'idle' | 'queued' | 'processing' | 'done' | 'error';

type Priority = 'high' | 'low';

interface OcrTask {
    pageNumber: number;
    priority: Priority;
    retries: number;
}

/**
 * Filtro de Nitidez (Convolution Sharpen)
 * Reforça as bordas dos caracteres antes da binarização.
 */
function applySharpen(data: Uint8ClampedArray, width: number, height: number) {
    const weights = [
        0, -1,  0,
       -1,  5, -1,
        0, -1,  0
    ];
    const side = 3;
    const halfSide = 1;
    const output = new Uint8ClampedArray(data.length);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dstOff = (y * width + x) * 4;
            let r = 0, g = 0, b = 0;

            for (let cy = 0; cy < side; cy++) {
                for (let cx = 0; cx < side; cx++) {
                    const scy = y + cy - halfSide;
                    const scx = x + cx - halfSide;
                    if (scy >= 0 && scy < height && scx >= 0 && scx < width) {
                        const srcOff = (scy * width + scx) * 4;
                        const wt = weights[cy * side + cx];
                        r += data[srcOff] * wt;
                        g += data[srcOff + 1] * wt;
                        b += data[srcOff + 2] * wt;
                    }
                }
            }
            output[dstOff] = Math.max(0, Math.min(255, r));
            output[dstOff + 1] = Math.max(0, Math.min(255, g));
            output[dstOff + 2] = Math.max(0, Math.min(255, b));
            output[dstOff + 3] = 255;
        }
    }
    data.set(output);
}

/**
 * MORFOLOGIA MATEMÁTICA: Limpeza de ruído e consolidação de fontes.
 */
function applyMorphology(data: Uint8ClampedArray, width: number, height: number) {
    const temp = new Uint8ClampedArray(data);
    
    // 1. Erosão (Remove pontos pequenos isolados/ruído)
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            if (temp[idx] === 0) { // Se for pixel preto (texto)
                let whiteNeighbors = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (temp[((y + dy) * width + (x + dx)) * 4] === 255) whiteNeighbors++;
                    }
                }
                // Se o ponto preto está quase isolado, vira branco (limpeza)
                if (whiteNeighbors > 6) {
                    data[idx] = data[idx+1] = data[idx+2] = 255;
                }
            }
        }
    }

    // 2. Dilatação Leve (Engrossa traços para fontes finas ou falhadas)
    temp.set(data);
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            if (temp[idx] === 255) { // Se for branco
                let blackNeighbors = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (temp[((y + dy) * width + (x + dx)) * 4] === 0) blackNeighbors++;
                    }
                }
                // Se toca em texto, expande levemente o preto
                if (blackNeighbors > 3) {
                    data[idx] = data[idx+1] = data[idx+2] = 0;
                }
            }
        }
    }
}

function computeOtsuThreshold(histogram: Uint32Array, total: number): number {
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * histogram[i];
    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let maxVar = 0;
    let threshold = 127;
    for (let i = 0; i < 256; i++) {
        wB += histogram[i];
        if (wB === 0) continue;
        wF = total - wB;
        if (wF === 0) break;
        sumB += i * histogram[i];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const varBetween = wB * wF * (mB - mF) * (mB - mF);
        if (varBetween > maxVar) {
            maxVar = varBetween;
            threshold = i;
        }
    }
    return threshold;
}

function detectHorizontalTextBands(grayData: Uint8Array, width: number, height: number): {start: number, end: number}[] {
    const hpp = new Uint32Array(height);
    for (let y = 0; y < height; y++) {
        let count = 0;
        for (let x = 0; x < width; x++) {
            if (grayData[y * width + x] < 128) count++;
        }
        hpp[y] = count;
    }
    const bands: {start: number, end: number}[] = [];
    let inBand = false;
    let start = 0;
    const threshold = width * 0.01;
    for (let y = 0; y < height; y++) {
        if (!inBand && hpp[y] > threshold) {
            inBand = true;
            start = y;
        } else if (inBand && hpp[y] <= threshold) {
            if (y - start > 10) bands.push({start, end: y});
            inBand = false;
        }
    }
    return bands;
}

function detectColumnsViaProjection(grayData: Uint8Array, width: number, height: number): number[] {
    const vpp = new Uint32Array(width);
    for (let x = 0; x < width; x++) {
        let blackPixels = 0;
        for (let y = 0; y < height; y++) {
            if (grayData[y * width + x] < 128) blackPixels++; 
        }
        vpp[x] = blackPixels;
    }
    const midStart = Math.floor(width * 0.35);
    const midEnd = Math.floor(width * 0.65);
    let bestGutterX = -1;
    let minDensity = height;
    for (let x = midStart; x < midEnd; x++) {
        let localSum = 0;
        for(let i = -2; i <= 2; i++) localSum += vpp[x + i] || 0;
        const density = localSum / 5;
        if (density < minDensity) {
            minDensity = density;
            bestGutterX = x;
        }
    }
    return minDensity < (height * 0.02) ? [bestGutterX] : [];
}

async function processImageAndLayout(canvas: HTMLCanvasElement): Promise<{ buffer: Uint8ClampedArray, width: number, height: number, columnSplits: number[] }> {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas context failed");

    const width = canvas.width;
    const height = canvas.height;
    
    // 1. Sharpen para reforçar fontes antes da binarização
    const rawImageData = ctx.getImageData(0, 0, width, height);
    applySharpen(rawImageData.data, width, height);
    ctx.putImageData(rawImageData, 0, 0);

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const totalPixels = width * height;
    
    const grayData = new Uint8Array(totalPixels);
    for (let i = 0; i < data.length; i += 4) {
        grayData[i / 4] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    }

    const columnSplits = detectColumnsViaProjection(grayData, width, height);
    const horizontalBands = detectHorizontalTextBands(grayData, width, height);

    // 2. Tiled Otsu Binarization com Inversão Inteligente
    const tilesX = 8;
    const tilesY = 8;
    const tileW = Math.floor(width / tilesX);
    const tileH = Math.floor(height / tilesY);
    const binaryData = new Uint8ClampedArray(data.length);

    for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
            const startX = tx * tileW;
            const startY = ty * tileH;
            const endX = (tx === tilesX - 1) ? width : (tx + 1) * tileW;
            const endY = (ty === tilesY - 1) ? height : (ty + 1) * tileH;

            const histogram = new Uint32Array(256);
            let tilePixels = 0;
            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) {
                    histogram[grayData[y * width + x]]++;
                    tilePixels++;
                }
            }
            const threshold = computeOtsuThreshold(histogram, tilePixels);

            // Determinar se o bloco deve ser invertido (Massa Escura > 55%)
            let darkPixelCount = 0;
            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) {
                    if (grayData[y * width + x] < threshold) darkPixelCount++;
                }
            }
            const shouldInvert = (darkPixelCount / tilePixels) > 0.55;

            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) {
                    const idx = y * width + x;
                    const isWithinTextBand = horizontalBands.some(b => y >= b.start && y <= b.end);
                    const effectiveThreshold = isWithinTextBand ? threshold : threshold * 0.8;

                    let val = grayData[idx] > effectiveThreshold ? 255 : 0;
                    
                    // Se o bloco for negativo (texto branco em fundo escuro), invertemos para o Tesseract
                    if (shouldInvert) val = 255 - val;

                    const outIdx = idx * 4;
                    binaryData[outIdx] = binaryData[outIdx+1] = binaryData[outIdx+2] = val;
                    binaryData[outIdx+3] = 255;
                }
            }
        }
    }
    
    // 3. Limpeza Morfológica final
    applyMorphology(binaryData, width, height);
    
    return { buffer: binaryData, width, height, columnSplits };
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

        const { buffer, width, height, columnSplits } = await processImageAndLayout(canvas);
        canvas.width = 0; canvas.height = 0;

        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = width;
        finalCanvas.height = height;
        const fctx = finalCanvas.getContext('2d', { alpha: false });
        const finalImageData = new ImageData(buffer, width, height);
        fctx?.putImageData(finalImageData, 0, 0);

        const worker = await getOcrWorker();
        const { data } = await worker.recognize(finalCanvas);
        finalCanvas.width = 0; finalCanvas.height = 0;

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
