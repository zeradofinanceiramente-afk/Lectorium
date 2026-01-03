
/**
 * Otimizado para Jornais Históricos e Documentos Degradados.
 * Objetivo: Normalizar o fundo e destacar o texto sem perder as bordas dos caracteres.
 */

export interface ProcessedImageResult {
    canvas: HTMLCanvasElement | OffscreenCanvas;
    scaleFactor: number;
    columnSplits: number[];
}

/**
 * UTILS: Integral Image (Summed Area Table)
 */
function computeIntegralImage(data: Uint8ClampedArray, width: number, height: number) {
    const integral = new Float64Array(width * height);
    const integralSq = new Float64Array(width * height);

    for (let y = 0; y < height; y++) {
        let sumRow = 0;
        let sumSqRow = 0;
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const val = (data[idx] * 0.299 + data[idx+1] * 0.587 + data[idx+2] * 0.114);
            sumRow += val;
            sumSqRow += val * val;

            const prevRowIndex = (y - 1) * width + x;
            const prevInt = y > 0 ? integral[prevRowIndex] : 0;
            const prevIntSq = y > 0 ? integralSq[prevRowIndex] : 0;

            const currIndex = y * width + x;
            integral[currIndex] = prevInt + sumRow;
            integralSq[currIndex] = prevIntSq + sumSqRow;
        }
    }
    return { integral, integralSq };
}

function getLocalSum(integral: Float64Array, w: number, h: number, x1: number, y1: number, x2: number, y2: number) {
    const x0 = Math.max(0, x1 - 1);
    const y0 = Math.max(0, y1 - 1);
    const xMax = Math.min(w - 1, x2);
    const yMax = Math.min(h - 1, y2);

    const A = (x0 < 0 || y0 < 0) ? 0 : integral[y0 * w + x0];
    const B = (y0 < 0) ? 0 : integral[y0 * w + xMax];
    const C = (x0 < 0) ? 0 : integral[yMax * w + x0];
    const D = integral[yMax * w + xMax];

    return D - B - C + A;
}

function normalizePolarity(data: Uint8ClampedArray, width: number, height: number): boolean {
    let totalLuminance = 0;
    const stride = 10;
    let samples = 0;

    for (let i = 0; i < data.length; i += 4 * stride) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        totalLuminance += (r * 0.299 + g * 0.587 + b * 0.114);
        samples++;
    }

    const avgLuminance = totalLuminance / samples;
    if (avgLuminance < 100) {
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 - data[i];     
            data[i+1] = 255 - data[i+1]; 
            data[i+2] = 255 - data[i+2]; 
        }
        return true; 
    }
    return false; 
}

function applyContrastStretching(data: Uint8ClampedArray) {
    let min = 255;
    let max = 0;
    const stride = 4;

    for (let i = 0; i < data.length; i += stride) {
        const val = (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114);
        if (val < min) min = val;
        if (val > max) max = val;
    }

    if (max === min) return;
    const scale = 255 / (max - min);

    for (let i = 0; i < data.length; i += 4) {
        data[i] = (data[i] - min) * scale;
        data[i+1] = (data[i+1] - min) * scale;
        data[i+2] = (data[i+2] - min) * scale;
    }
}

function applyGammaCorrection(data: Uint8ClampedArray, gamma: number) {
    const invGamma = 1.0 / gamma;
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
        lut[i] = Math.pow(i / 255.0, invGamma) * 255.0;
    }

    for (let i = 0; i < data.length; i += 4) {
        data[i] = lut[data[i]];     
        data[i+1] = lut[data[i+1]]; 
        data[i+2] = lut[data[i+2]]; 
    }
}

function shouldApplySauvola(data: Uint8ClampedArray, width: number, height: number): boolean {
    let sum = 0;
    let sumSq = 0;
    let count = 0;
    const stride = 10;

    for (let i = 0; i < data.length; i += 4 * stride) {
        const val = (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114);
        sum += val;
        sumSq += val * val;
        count++;
    }

    const mean = sum / count;
    const variance = (sumSq / count) - (mean * mean);
    const stdDev = Math.sqrt(variance);
    return stdDev < 60; 
}

function applySauvolaBinarization(data: Uint8ClampedArray, width: number, height: number) {
    if (!shouldApplySauvola(data, width, height)) {
        for (let i = 0; i < data.length; i += 4) {
            const gray = (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114);
            const val = gray < 160 ? 0 : 255;
            data[i] = data[i+1] = data[i+2] = val;
        }
        return;
    }

    const { integral, integralSq } = computeIntegralImage(data, width, height);
    const windowSize = Math.max(10, Math.floor(width / 40));
    const halfWindow = Math.floor(windowSize / 2);
    const k = 0.34;
    const R = 128;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const gray = (data[idx] * 0.299 + data[idx+1] * 0.587 + data[idx+2] * 0.114);

            const x1 = x - halfWindow;
            const y1 = y - halfWindow;
            const x2 = x + halfWindow;
            const y2 = y + halfWindow;

            const count = (Math.min(width - 1, x2) - Math.max(0, x1) + 1) * 
                          (Math.min(height - 1, y2) - Math.max(0, y1) + 1);

            const sum = getLocalSum(integral, width, height, x1, y1, x2, y2);
            const sumSq = getLocalSum(integralSq, width, height, x1, y1, x2, y2);

            const mean = sum / count;
            const variance = (sumSq / count) - (mean * mean);
            const stdDev = Math.sqrt(Math.max(0, variance));

            const threshold = mean * (1 + k * ((stdDev / R) - 1));
            let newVal = 255;
            if (gray < threshold) newVal = 0; 

            data[idx] = data[idx+1] = data[idx+2] = newVal;
        }
    }
}

function applyMorphologicalErosion(data: Uint8ClampedArray, width: number, height: number) {
    const inputCopy = new Uint8ClampedArray(data);
    const kernelSize = 1;

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let minVal = 255;
            for (let ky = -kernelSize; ky <= kernelSize; ky++) {
                for (let kx = -kernelSize; kx <= kernelSize; kx++) {
                    const idx = ((y + ky) * width + (x + kx)) * 4;
                    const val = inputCopy[idx];
                    if (val < minVal) minVal = val;
                }
            }
            const centerIdx = (y * width + x) * 4;
            data[centerIdx] = data[centerIdx + 1] = data[centerIdx + 2] = minVal;
        }
    }
}

function applyDespeckle(data: Uint8ClampedArray, width: number, height: number) {
    const inputCopy = new Uint8ClampedArray(data);
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            if (inputCopy[idx] === 0) {
                const top = inputCopy[((y - 1) * width + x) * 4];
                const bottom = inputCopy[((y + 1) * width + x) * 4];
                const left = inputCopy[(y * width + (x - 1)) * 4];
                const right = inputCopy[(y * width + (x + 1)) * 4];
                if (top === 255 && bottom === 255 && left === 255 && right === 255) {
                    data[idx] = data[idx+1] = data[idx+2] = 255;
                }
            }
        }
    }
}

function applyUnsharpMask(data: Uint8ClampedArray, w: number, h: number) {
    const weights = [-1, -1, -1, -1,  9, -1, -1, -1, -1];
    const inputCopy = new Uint8ClampedArray(data);

    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const dstOff = (y * w + x) * 4;
            let r = 0, g = 0, b = 0;
            for (let cy = 0; cy < 3; cy++) {
                for (let cx = 0; cx < 3; cx++) {
                    const srcOff = ((y + cy - 1) * w + (x + cx - 1)) * 4;
                    const wt = weights[cy * 3 + cx];
                    r += inputCopy[srcOff] * wt;
                    g += inputCopy[srcOff + 1] * wt;
                    b += inputCopy[srcOff + 2] * wt;
                }
            }
            data[dstOff] = Math.max(0, Math.min(255, r));
            data[dstOff + 1] = Math.max(0, Math.min(255, g));
            data[dstOff + 2] = Math.max(0, Math.min(255, b));
        }
    }
}

function getHorizontalProjectionVariance(data: Uint8ClampedArray, width: number, height: number, angleDeg: number): number {
    const rad = angleDeg * (Math.PI / 180);
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    const profile = new Float64Array(height + width); 
    let minIdx = profile.length;
    let maxIdx = 0;
    const stride = 8;
    
    for (let y = 0; y < height; y += stride) {
        for (let x = 0; x < width; x += stride) {
            if (data[(y * width + x) * 4] < 128) {
                const projY = x * sin + y * cos;
                const idx = Math.floor(projY + width);
                if (idx >= 0 && idx < profile.length) {
                    profile[idx]++;
                    if(idx < minIdx) minIdx = idx;
                    if(idx > maxIdx) maxIdx = idx;
                }
            }
        }
    }

    let sum = 0, sumSq = 0, count = 0;
    for (let i = minIdx; i <= maxIdx; i++) {
        const val = profile[i];
        sum += val;
        sumSq += val * val;
        count++;
    }
    if (count === 0) return 0;
    const mean = sum / count;
    return (sumSq / count) - (mean * mean);
}

function detectSkewAngle(canvas: HTMLCanvasElement | OffscreenCanvas): number {
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    const width = canvas.width;
    const height = canvas.height;
    
    const scale = Math.min(1, 600 / width);
    const wSmall = Math.floor(width * scale);
    const hSmall = Math.floor(height * scale);
    
    const isOffscreenSupported = typeof OffscreenCanvas !== 'undefined';
    const smallCanvas = isOffscreenSupported 
        ? new OffscreenCanvas(wSmall, hSmall) 
        : document.createElement('canvas');
    
    if (!isOffscreenSupported) {
        (smallCanvas as HTMLCanvasElement).width = wSmall;
        (smallCanvas as HTMLCanvasElement).height = hSmall;
    }

    const sCtx = smallCanvas.getContext('2d', { willReadFrequently: true, alpha: false }) as any;
    sCtx.drawImage(canvas, 0, 0, wSmall, hSmall);
    const imageData = sCtx.getImageData(0, 0, wSmall, hSmall);
    const data = imageData.data;
    
    normalizePolarity(data, wSmall, hSmall);

    for (let i = 0; i < data.length; i += 4) {
        const gray = (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114);
        const bin = gray < 128 ? 0 : 255;
        data[i] = data[i+1] = data[i+2] = bin; 
    }

    let bestVar = -1;
    let bestAngle = 0;
    
    for (let a = -2.0; a <= 2.0; a += 0.2) {
        const v = getHorizontalProjectionVariance(data, wSmall, hSmall, a);
        if (v > bestVar) {
            bestVar = v;
            bestAngle = a;
        }
    }
    return bestVar > 10 ? bestAngle : 0;
}

function detectColumnsViaProjection(grayData: Uint8Array, width: number, height: number): number[] {
    const vpp = new Float32Array(width);
    const startY = Math.floor(height * 0.15);
    const endY = Math.floor(height * 0.90);
    const strideY = 2; 
    const SMEAR_RADIUS = Math.floor(width * 0.02); 

    for (let y = startY; y < endY; y += strideY) {
        let smearTimer = 0;
        for (let x = 0; x < width; x++) {
            const isBlack = grayData[y * width + x] < 128;
            if (isBlack) smearTimer = SMEAR_RADIUS;
            if (smearTimer > 0) {
                vpp[x]++;
                smearTimer--;
            }
        }
    }

    const smoothed = new Float32Array(width);
    const window = 10; 
    for(let i=0; i<width; i++) {
        let sum=0, c=0;
        for(let j=Math.max(0, i-window); j<Math.min(width, i+window); j++) {
            sum += vpp[j];
            c++;
        }
        smoothed[i] = sum/c;
    }

    const gutters: number[] = [];
    const minContentHeight = (endY - startY) * 0.02 / strideY; 
    let inGutter = false;
    let gutterStart = 0;
    const marginX = Math.floor(width * 0.08); 
    
    for (let x = marginX; x < width - marginX; x++) {
        const density = smoothed[x];
        const isSpace = density < minContentHeight;

        if (isSpace && !inGutter) {
            inGutter = true;
            gutterStart = x;
        } else if (!isSpace && inGutter) {
            inGutter = false;
            const gutterWidth = x - gutterStart;
            if (gutterWidth > Math.max(30, width * 0.03) && gutterWidth < (width * 0.25)) {
                gutters.push(Math.floor((gutterStart + x) / 2));
            }
        }
    }
    return gutters;
}

export async function extractImageTile(
    sourceCanvas: HTMLCanvasElement | OffscreenCanvas,
    rect: { x: number, y: number, w: number, h: number }
): Promise<HTMLCanvasElement | OffscreenCanvas> {
    const isOffscreenSupported = typeof OffscreenCanvas !== 'undefined';
    const tileCanvas = isOffscreenSupported 
        ? new OffscreenCanvas(rect.w, rect.h) 
        : document.createElement('canvas');
    
    if (!isOffscreenSupported) {
        (tileCanvas as HTMLCanvasElement).width = rect.w;
        (tileCanvas as HTMLCanvasElement).height = rect.h;
    }

    const ctx = tileCanvas.getContext('2d', { alpha: false }) as any;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, rect.w, rect.h);
    ctx.drawImage(sourceCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);

    return tileCanvas;
}

export async function extractColumnSlice(
    sourceCanvas: HTMLCanvasElement | OffscreenCanvas,
    x: number,
    y: number,
    w: number,
    h: number,
    scaleFactor: number = 1.0 
): Promise<HTMLCanvasElement | OffscreenCanvas> {
    const PADDING = 40; 
    const targetW = Math.floor(w * scaleFactor) + (PADDING * 2);
    const targetH = Math.floor(h * scaleFactor) + (PADDING * 2);

    const isOffscreenSupported = typeof OffscreenCanvas !== 'undefined';
    const sliceCanvas = isOffscreenSupported 
        ? new OffscreenCanvas(targetW, targetH) 
        : document.createElement('canvas');
    
    if (!isOffscreenSupported) {
        (sliceCanvas as HTMLCanvasElement).width = targetW;
        (sliceCanvas as HTMLCanvasElement).height = targetH;
    }

    const ctx = sliceCanvas.getContext('2d', { alpha: false }) as any;
    
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);

    ctx.drawImage(
        sourceCanvas,
        x, y, w, h,
        PADDING, PADDING,
        targetW - (PADDING*2), targetH - (PADDING*2)
    );

    return sliceCanvas;
}

export async function preprocessHistoricalNewspaper(source: Blob): Promise<ProcessedImageResult> {
  const bitmap = await createImageBitmap(source);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false })!;
  
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  normalizePolarity(imageData.data, canvas.width, canvas.height); 
  applyContrastStretching(imageData.data); 
  applyGammaCorrection(imageData.data, 0.6); 
  applySauvolaBinarization(imageData.data, canvas.width, canvas.height);
  
  ctx.putImageData(imageData, 0, 0);
  bitmap.close();
  
  return { canvas, scaleFactor: 1.0, columnSplits: [] };
}

export async function processImageAndLayout(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<{ 
    buffer: Uint8ClampedArray, 
    width: number, 
    height: number, 
    columnSplits: number[],
    processedCanvas: HTMLCanvasElement | OffscreenCanvas
}> {
    const skewAngle = detectSkewAngle(canvas);
    let workingCanvas: HTMLCanvasElement | OffscreenCanvas;
    const isOffscreenSupported = typeof OffscreenCanvas !== 'undefined';
    
    const w = canvas.width;
    const h = canvas.height;
    workingCanvas = isOffscreenSupported ? new OffscreenCanvas(w, h) : document.createElement('canvas');
    if (!isOffscreenSupported) {
        (workingCanvas as HTMLCanvasElement).width = w;
        (workingCanvas as HTMLCanvasElement).height = h;
    }

    const ctx = workingCanvas.getContext('2d', { willReadFrequently: true, alpha: false }) as any;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);

    if (Math.abs(skewAngle) > 0.2) {
        ctx.translate(w/2, h/2);
        ctx.rotate(skewAngle * Math.PI / 180);
        ctx.drawImage(canvas, -w/2, -h/2);
        ctx.rotate(-skewAngle * Math.PI / 180);
        ctx.translate(-w/2, -h/2);
    } else {
        ctx.drawImage(canvas, 0, 0);
    }

    const rawData = ctx.getImageData(0, 0, w, h);
    normalizePolarity(rawData.data, w, h);
    applyContrastStretching(rawData.data);
    applyGammaCorrection(rawData.data, 0.6); 
    applyUnsharpMask(rawData.data, w, h);
    applySauvolaBinarization(rawData.data, w, h);
    applyMorphologicalErosion(rawData.data, w, h);
    applyDespeckle(rawData.data, w, h);
    ctx.putImageData(rawData, 0, 0);

    const grayData = new Uint8Array(w * h);
    const d = rawData.data;
    for (let i = 0; i < d.length; i += 4) {
        grayData[i / 4] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
    }

    const columnSplits = detectColumnsViaProjection(grayData, w, h);
    return { buffer: d, width: w, height: h, columnSplits, processedCanvas: workingCanvas };
}

export async function preprocessImageForOcr(sourceCanvas: HTMLCanvasElement | OffscreenCanvas): Promise<ProcessedImageResult> {
  const { processedCanvas, columnSplits } = await processImageAndLayout(sourceCanvas);
  return { canvas: processedCanvas, scaleFactor: 1.0, columnSplits };
}
