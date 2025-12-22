
/**
 * Otimizado para Jornais Históricos e Documentos Degradados.
 * Objetivo: Normalizar o fundo e destacar o texto sem perder as bordas dos caracteres.
 */

export interface ProcessedImageResult {
    canvas: HTMLCanvasElement | OffscreenCanvas;
    scaleFactor: number;
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

export async function preprocessHistoricalNewspaper(source: Blob): Promise<ProcessedImageResult> {
  const bitmap = await createImageBitmap(source);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false })!;
  
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  // Normalização adaptativa em vez de binarização
  applyAdaptiveStretch(imageData.data, canvas.width, canvas.height);
  applyUnsharpMask(imageData.data, canvas.width, canvas.height);

  ctx.putImageData(imageData, 0, 0);
  bitmap.close();
  
  return { canvas, scaleFactor: 1.0 };
}

export async function preprocessImageForOcr(sourceCanvas: HTMLCanvasElement | OffscreenCanvas): Promise<ProcessedImageResult> {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false })!;
  ctx.drawImage(sourceCanvas, 0, 0);
  
  const imageData = ctx.getImageData(0, 0, width, height);
  
  // Para OCR, usamos a mesma lógica de limpeza adaptativa para garantir que
  // colunas e fontes pequenas não sumam
  applyAdaptiveStretch(imageData.data, width, height);
  
  ctx.putImageData(imageData, 0, 0);
  return { canvas, scaleFactor: 1.0 };
}
