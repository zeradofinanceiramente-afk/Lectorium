
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
 * Normalização Adaptativa de Contraste (Local).
 * Em resoluções altas (3.0x), o raio fixo de 20px é muito pequeno (pega apenas parte de uma letra grande).
 * Ajustamos dinamicamente baseado na largura da imagem.
 */
function applyAdaptiveStretch(data: Uint8ClampedArray, width: number, height: number) {
    const output = new Uint8ClampedArray(data.length);
    
    // WindowSize Dinâmico: ~1/50 da largura da imagem.
    const windowSize = Math.max(20, Math.floor(width / 50)); 
    
    // Criar buffer de luminância para cálculo rápido
    const lum = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
        lum[i/4] = (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114);
    }

    // Otimização de Performance: Step maior em resoluções altas
    const step = Math.max(4, Math.floor(windowSize / 4));

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            
            // Amostragem esparsa da média local
            let sum = 0;
            let count = 0;
            
            // Bounds check simplificado
            const startY = Math.max(0, y - windowSize);
            const endY = Math.min(height, y + windowSize);
            const startX = Math.max(0, x - windowSize);
            const endX = Math.min(width, x + windowSize);

            for (let wy = startY; wy < endY; wy += step) {
                for (let wx = startX; wx < endX; wx += step) {
                    sum += lum[wy * width + wx];
                    count++;
                }
            }

            const localMean = sum / count;
            const current = lum[idx];
            
            let newValue;
            // Aumentamos a agressividade do contraste para texto
            // Histórico: Jornais têm pouco contraste. Se for mais escuro que a média local, puxe para preto.
            if (current < localMean - 15) { // Threshold aumentado para evitar ruído de fundo (bleed-through)
                // É texto: Escurece exponencialmente
                newValue = Math.max(0, current * (current / localMean) - 40);
            } else {
                // É papel: Clareia totalmente (High-pass filter)
                newValue = Math.min(255, current + (255 - localMean) + 30);
            }

            const outIdx = idx * 4;
            output[outIdx] = output[outIdx+1] = output[outIdx+2] = newValue;
            output[outIdx+3] = 255;
        }
    }
    data.set(output);
}

/**
 * Filtro de Nitidez Suave (Unsharp Mask)
 */
function applyUnsharpMask(data: Uint8ClampedArray, w: number, h: number) {
    const weights = [
        -1, -1, -1,
        -1,  9, -1,
        -1, -1, -1
    ];
    const output = new Uint8ClampedArray(data.length);

    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const dstOff = (y * w + x) * 4;
            let r = 0, g = 0, b = 0;

            for (let cy = 0; cy < 3; cy++) {
                for (let cx = 0; cx < 3; cx++) {
                    const srcOff = ((y + cy - 1) * w + (x + cx - 1)) * 4;
                    const wt = weights[cy * 3 + cx];
                    r += data[srcOff] * wt;
                    g += data[srcOff + 1] * wt;
                    b += data[srcOff + 2] * wt;
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

function getHorizontalProjectionVariance(data: Uint8ClampedArray, width: number, height: number, angleDeg: number): number {
    const rad = angleDeg * (Math.PI / 180);
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    const profile = new Float64Array(height + width); 
    let minIdx = profile.length;
    let maxIdx = 0;

    const stride = 8; // Stride maior para imagens grandes (performance)
    
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

    let sum = 0;
    let sumSq = 0;
    let count = 0;
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
    
    // Downsample fixo para detecção de ângulo (sempre rápido)
    const scale = Math.min(1, 600 / width);
    const wSmall = Math.floor(width * scale);
    const hSmall = Math.floor(height * scale);
    
    const smallCanvas = new OffscreenCanvas(wSmall, hSmall);
    const sCtx = smallCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    sCtx.drawImage(canvas, 0, 0, wSmall, hSmall);
    const imageData = sCtx.getImageData(0, 0, wSmall, hSmall);
    
    const data = imageData.data;
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

/**
 * Detecção de Colunas Híbrida (Densidade + Linhas Verticais)
 * Resolve o problema de jornais históricos que usam linhas verticais como separadores.
 */
function detectColumnsViaProjection(grayData: Uint8Array, width: number, height: number): number[] {
    const vpp = new Float32Array(width);
    
    // Análise de Run-Length para detectar linhas verticais
    // Se uma coluna X tiver um segmento contínuo de preto > 25% da altura, é uma linha divisória.
    const isVerticalLine = new Uint8Array(width); // 1 = Sim, 0 = Não
    const lineThreshold = height * 0.25;

    const startY = Math.floor(height * 0.15);
    const endY = Math.floor(height * 0.90);
    
    for (let x = 0; x < width; x++) {
        let blackPixels = 0;
        let maxRun = 0;
        let currentRun = 0;

        // Amostragem (stride 2) para velocidade
        for (let y = startY; y < endY; y += 2) {
            const isBlack = grayData[y * width + x] < 128;
            
            if (isBlack) {
                blackPixels++;
                currentRun++;
            } else {
                if (currentRun > maxRun) maxRun = currentRun;
                currentRun = 0;
            }
        }
        // Check final run
        if (currentRun > maxRun) maxRun = currentRun;

        // SE for uma linha vertical longa (fio de jornal), marcamos explicitamente
        // Multiplicamos por 2 o run porque usamos stride 2
        if ((maxRun * 2) > lineThreshold) {
            isVerticalLine[x] = 1;
            // Para o VPP, consideramos linha divisória como "Espaço em branco" (Zero densidade de texto)
            vpp[x] = 0; 
        } else {
            vpp[x] = blackPixels;
        }
    }

    // Suavização do VPP
    const smoothed = new Float32Array(width);
    const window = 20; 
    for(let i=0; i<width; i++) {
        let sum=0, c=0;
        for(let j=Math.max(0, i-window); j<Math.min(width, i+window); j++) {
            sum += vpp[j];
            c++;
        }
        smoothed[i] = sum/c;
    }

    const gutters = [];
    const minContentHeight = (endY - startY) * 0.005; // 0.5% threshold
    let inGutter = false;
    let gutterStart = 0;

    const marginX = Math.floor(width * 0.05); // Margem de segurança lateral 5%
    
    for (let x = marginX; x < width - marginX; x++) {
        const val = smoothed[x];
        
        // Gutter se: Baixa densidade de texto OU detectamos uma linha vertical explicita
        // Nota: isVerticalLine já zerou o vpp, mas checamos a vizinhança para robustez
        const isWhite = val < minContentHeight; 

        if (isWhite && !inGutter) {
            inGutter = true;
            gutterStart = x;
        } else if (!isWhite && inGutter) {
            inGutter = false;
            const gutterWidth = x - gutterStart;
            // Ajustado para escala alta: gutter mínimo de 20px
            if (gutterWidth > 20 && gutterWidth < (width * 0.20)) {
                // Ponto médio do gutter
                gutters.push(Math.floor((gutterStart + x) / 2));
            }
        }
    }
    
    return gutters;
}

export async function extractColumnSlice(
    sourceCanvas: HTMLCanvasElement | OffscreenCanvas,
    x: number,
    y: number,
    w: number,
    h: number,
    scaleFactor: number = 1.0 // Default 1.0 pois a fonte já é alta resolução
): Promise<HTMLCanvasElement | OffscreenCanvas> {
    const PADDING = 40; // Mais padding para garantir contexto
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

/**
 * Tiled Extraction (Mosaico)
 * Extrai um pedaço arbitrário (Tile) da imagem original para processamento segmentado.
 * Retorna um Canvas limpo com o pedaço solicitado.
 */
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
    
    // Fundo Branco (Segurança)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, rect.w, rect.h);

    // Draw apenas a região
    ctx.drawImage(
        sourceCanvas,
        rect.x, rect.y, rect.w, rect.h,
        0, 0, rect.w, rect.h
    );

    return tileCanvas;
}

export async function preprocessHistoricalNewspaper(source: Blob): Promise<ProcessedImageResult> {
  const bitmap = await createImageBitmap(source);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false })!;
  
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  applyAdaptiveStretch(imageData.data, canvas.width, canvas.height);
  applyUnsharpMask(imageData.data, canvas.width, canvas.height);

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
    
    // Deskew
    if (Math.abs(skewAngle) > 0.2) {
        const w = canvas.width;
        const h = canvas.height;
        workingCanvas = isOffscreenSupported ? new OffscreenCanvas(w, h) : document.createElement('canvas');
        if (!isOffscreenSupported) {
            (workingCanvas as HTMLCanvasElement).width = w;
            (workingCanvas as HTMLCanvasElement).height = h;
        }

        const rctx = workingCanvas.getContext('2d', { willReadFrequently: true, alpha: false }) as any;
        
        rctx.fillStyle = '#FFFFFF';
        rctx.fillRect(0, 0, w, h);

        rctx.translate(w/2, h/2);
        rctx.rotate(skewAngle * Math.PI / 180);
        rctx.drawImage(canvas, -w/2, -h/2);
        rctx.rotate(-skewAngle * Math.PI / 180);
        rctx.translate(-w/2, -h/2);
    } else {
        const w = canvas.width;
        const h = canvas.height;
        workingCanvas = isOffscreenSupported ? new OffscreenCanvas(w, h) : document.createElement('canvas');
        if (!isOffscreenSupported) {
            (workingCanvas as HTMLCanvasElement).width = w;
            (workingCanvas as HTMLCanvasElement).height = h;
        }
        const ctx = workingCanvas.getContext('2d', { willReadFrequently: true, alpha: false }) as any;
        ctx.drawImage(canvas, 0, 0);
    }

    const width = workingCanvas.width;
    const height = workingCanvas.height;
    const ctx = workingCanvas.getContext('2d', { willReadFrequently: true, alpha: false }) as CanvasRenderingContext2D;

    const rawData = ctx.getImageData(0, 0, width, height);
    
    // Sharpen first to help edge detection for lines
    applyUnsharpMask(rawData.data, width, height);
    
    // Adaptive Binarization (Aggressive for historical docs)
    applyAdaptiveStretch(rawData.data, width, height);
    
    // Commit Changes to Canvas for Slice Extraction later
    ctx.putImageData(rawData, 0, 0);

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const grayData = new Uint8Array(width * height);
    
    for (let i = 0; i < data.length; i += 4) {
        // Luminance
        grayData[i / 4] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    }

    // Advanced Column Detection (With Vertical Line Removal Logic)
    const columnSplits = detectColumnsViaProjection(grayData, width, height);

    return { buffer: data, width, height, columnSplits, processedCanvas: workingCanvas };
}

export async function preprocessImageForOcr(sourceCanvas: HTMLCanvasElement | OffscreenCanvas): Promise<ProcessedImageResult> {
  const { processedCanvas, columnSplits } = await processImageAndLayout(sourceCanvas);
  return { canvas: processedCanvas, scaleFactor: 1.0, columnSplits };
}
