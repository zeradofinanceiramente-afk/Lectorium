
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
 * Em vez de um corte seco (preto/branco), expandimos o contraste baseado na vizinhança.
 */
function applyAdaptiveStretch(data: Uint8ClampedArray, width: number, height: number) {
    const output = new Uint8ClampedArray(data.length);
    const windowSize = 20; // Raio de busca para média local
    
    // Criar buffer de luminância para cálculo rápido
    const lum = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
        lum[i/4] = (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114);
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            
            // Amostragem esparsa da média local para performance
            let sum = 0;
            let count = 0;
            const step = 4; // Pula pixels para agilizar o cálculo da média
            
            for (let wy = Math.max(0, y - windowSize); wy < Math.min(height, y + windowSize); wy += step) {
                for (let wx = Math.max(0, x - windowSize); wx < Math.min(width, x + windowSize); wx += step) {
                    sum += lum[wy * width + wx];
                    count++;
                }
            }

            const localMean = sum / count;
            const current = lum[idx];
            
            // Ganho dinâmico: Se o pixel é mais escuro que a média, aumentamos o contraste dele.
            // Isso remove manchas de fundo (clareia) e reforça a tinta (escurece).
            let newValue;
            if (current < localMean - 5) {
                // É texto ou sombra: Escurece proporcionalmente à distância da média
                newValue = Math.max(0, current * (current / localMean) - 20);
            } else {
                // É papel/fundo: Empurra para o branco suave
                newValue = Math.min(255, current + (255 - localMean) + 10);
            }

            const outIdx = idx * 4;
            output[outIdx] = output[outIdx+1] = output[outIdx+2] = newValue;
            output[outIdx+3] = 255;
        }
    }
    data.set(output);
}

/**
 * Filtro de Nitidez Suave (Unsharp Mask simplificado)
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

// --- DESKEW LOGIC (Correção de Rotação) ---

function getHorizontalProjectionVariance(data: Uint8ClampedArray, width: number, height: number, angleDeg: number): number {
    const rad = angleDeg * (Math.PI / 180);
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    const profile = new Float64Array(height + width); 
    let minIdx = profile.length;
    let maxIdx = 0;

    // Amostragem (Stride) para performance
    const stride = 4; 
    
    for (let y = 0; y < height; y += stride) {
        for (let x = 0; x < width; x += stride) {
            // Assume dados em escala de cinza/binários no canal R. < 128 é "preto" (texto)
            if (data[(y * width + x) * 4] < 128) {
                // Projeta a coordenada Y rotacionada
                const projY = x * sin + y * cos;
                const idx = Math.floor(projY + width); // Offset para índice positivo
                if (idx >= 0 && idx < profile.length) {
                    profile[idx]++;
                    if(idx < minIdx) minIdx = idx;
                    if(idx > maxIdx) maxIdx = idx;
                }
            }
        }
    }

    // Calcula Variância do perfil
    // Texto alinhado cria picos altos e vales profundos -> Variância Alta
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
    
    // Downsample para velocidade na detecção (max 600px width)
    const scale = Math.min(1, 600 / width);
    const wSmall = Math.floor(width * scale);
    const hSmall = Math.floor(height * scale);
    
    const smallCanvas = new OffscreenCanvas(wSmall, hSmall);
    const sCtx = smallCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    sCtx.drawImage(canvas, 0, 0, wSmall, hSmall);
    const imageData = sCtx.getImageData(0, 0, wSmall, hSmall);
    
    // Binarização rápida para o teste de skew
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const gray = (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114);
        const bin = gray < 128 ? 0 : 255;
        data[i] = data[i+1] = data[i+2] = bin; 
    }

    let bestVar = -1;
    let bestAngle = 0;
    
    // Busca fina: -2 a +2 graus
    for (let a = -2.0; a <= 2.0; a += 0.2) {
        const v = getHorizontalProjectionVariance(data, wSmall, hSmall, a);
        if (v > bestVar) {
            bestVar = v;
            bestAngle = a;
        }
    }
    
    // Retorna 0 se a variância for muito baixa (página em branco ou imagem cheia)
    return bestVar > 10 ? bestAngle : 0;
}

// --- COLUMN DETECTION (RLSA Vertical) ---

function detectColumnsViaProjection(grayData: Uint8Array, width: number, height: number): number[] {
    const vpp = new Float32Array(width);
    
    // Ignora Cabeçalho (Top 15%) e Rodapé (Bottom 10%) para evitar que títulos cruzem as colunas
    const startY = Math.floor(height * 0.15);
    const endY = Math.floor(height * 0.90);
    
    for (let x = 0; x < width; x++) {
        let blackPixels = 0;
        for (let y = startY; y < endY; y++) {
            if (grayData[y * width + x] < 128) blackPixels++; 
        }
        vpp[x] = blackPixels;
    }

    // Suavização do histograma (Janela de ~10px)
    // Isso remove "furos" de uma letra ou sujeira pequena na calha
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

    const gutters = [];
    const minContentHeight = (endY - startY) * 0.01; // 1% de ruído permitido
    let inGutter = false;
    let gutterStart = 0;

    // Scan apenas na área central (evita margens laterais)
    const marginX = Math.floor(width * 0.1);
    
    for (let x = marginX; x < width - marginX; x++) {
        const val = smoothed[x];
        const isWhite = val < minContentHeight;

        if (isWhite && !inGutter) {
            inGutter = true;
            gutterStart = x;
        } else if (!isWhite && inGutter) {
            inGutter = false;
            const gutterWidth = x - gutterStart;
            // Calha de jornal: deve ser > 5px e < 150px
            if (gutterWidth > 5 && gutterWidth < 150) {
                gutters.push(Math.floor((gutterStart + x) / 2));
            }
        }
    }
    
    return gutters;
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
    processedCanvas: HTMLCanvasElement // Canvas rotacionado e limpo
}> {
    // 1. Deskew (Correção de Rotação)
    const skewAngle = detectSkewAngle(canvas);
    
    let workingCanvas: HTMLCanvasElement;
    if (Math.abs(skewAngle) > 0.2) {
        const rotCanvas = document.createElement('canvas');
        rotCanvas.width = canvas.width;
        rotCanvas.height = canvas.height;
        const rctx = rotCanvas.getContext('2d', { willReadFrequently: true, alpha: false })!;
        
        // Preenche de branco antes de rotacionar
        rctx.fillStyle = '#FFFFFF';
        rctx.fillRect(0, 0, rotCanvas.width, rotCanvas.height);

        rctx.translate(canvas.width/2, canvas.height/2);
        rctx.rotate(skewAngle * Math.PI / 180);
        rctx.drawImage(canvas, -canvas.width/2, -canvas.height/2);
        rctx.rotate(-skewAngle * Math.PI / 180);
        rctx.translate(-canvas.width/2, -canvas.height/2);
        
        workingCanvas = rotCanvas;
    } else {
        // Clone para não sujar o original se for Offscreen
        workingCanvas = document.createElement('canvas');
        workingCanvas.width = canvas.width;
        workingCanvas.height = canvas.height;
        const ctx = workingCanvas.getContext('2d', { willReadFrequently: true, alpha: false })!;
        ctx.drawImage(canvas, 0, 0);
    }

    const width = workingCanvas.width;
    const height = workingCanvas.height;
    const ctx = workingCanvas.getContext('2d', { willReadFrequently: true, alpha: false })!;

    // 2. Sharpen (Melhorar bordas)
    const rawData = ctx.getImageData(0, 0, width, height);
    applyUnsharpMask(rawData.data, width, height);
    ctx.putImageData(rawData, 0, 0);

    // 3. Grayscale & Layout Analysis
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const grayData = new Uint8Array(width * height);
    
    for (let i = 0; i < data.length; i += 4) {
        grayData[i / 4] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    }

    // 4. Detecção de Colunas (No canvas alinhado e nítido)
    const columnSplits = detectColumnsViaProjection(grayData, width, height);

    // 5. Binarização Final (Otsu Adaptativo - Mesma lógica anterior, mas aplicada ao canvas alinhado)
    // Reutilizando lógica simplificada para brevidade, mas mantendo a qualidade
    applyAdaptiveStretch(data, width, height);
    ctx.putImageData(imageData, 0, 0); // Atualiza visual com contraste melhorado

    // Retorna o buffer binário (ou grayscale contrastado) para o OCR
    return { buffer: data, width, height, columnSplits, processedCanvas: workingCanvas };
}

export async function preprocessImageForOcr(sourceCanvas: HTMLCanvasElement | OffscreenCanvas): Promise<ProcessedImageResult> {
  // Wrapper simplificado para manter compatibilidade com chamadas antigas se houver
  const { processedCanvas, columnSplits } = await processImageAndLayout(sourceCanvas);
  return { canvas: processedCanvas, scaleFactor: 1.0, columnSplits };
}
