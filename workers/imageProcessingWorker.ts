
// Tipos de mensagens
export interface WorkerInput {
  imageBitmap: ImageBitmap;
  width: number;
  height: number;
  pageNumber: number;
}

export interface WorkerOutput {
  success: boolean;
  pageNumber: number;
  imageBitmap?: ImageBitmap;
  columnSplits?: number[];
  error?: string;
}

// --- Funções Matemáticas (Movidas do ocrManager.ts) ---

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

function applyMorphology(data: Uint8ClampedArray, width: number, height: number) {
  const temp = new Uint8ClampedArray(data);
  
  // 1. Erosão (Remove ruído)
  for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
          const idx = (y * width + x) * 4;
          if (temp[idx] === 0) {
              let whiteNeighbors = 0;
              for (let dy = -1; dy <= 1; dy++) {
                  for (let dx = -1; dx <= 1; dx++) {
                      if (temp[((y + dy) * width + (x + dx)) * 4] === 255) whiteNeighbors++;
                  }
              }
              if (whiteNeighbors > 6) {
                  data[idx] = data[idx+1] = data[idx+2] = 255;
              }
          }
      }
  }

  // 2. Dilatação Leve (Consolida texto)
  temp.set(data);
  for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
          const idx = (y * width + x) * 4;
          if (temp[idx] === 255) {
              let blackNeighbors = 0;
              for (let dy = -1; dy <= 1; dy++) {
                  for (let dx = -1; dx <= 1; dx++) {
                      if (temp[((y + dy) * width + (x + dx)) * 4] === 0) blackNeighbors++;
                  }
              }
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

// --- Handler Principal do Worker ---

self.onmessage = async (e: MessageEvent<WorkerInput>) => {
  const { imageBitmap, width, height, pageNumber } = e.data;

  try {
    // 1. Setup OffscreenCanvas
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { 
        willReadFrequently: true, 
        alpha: false 
    }) as OffscreenCanvasRenderingContext2D;

    if (!ctx) throw new Error("Worker: Failed to get context");

    ctx.drawImage(imageBitmap, 0, 0);
    
    // Libera o bitmap original da memória imediatamente
    imageBitmap.close();

    // 2. Processamento de Imagem (Heavy CPU Loop)
    const rawImageData = ctx.getImageData(0, 0, width, height);
    
    // Sharpen
    applySharpen(rawImageData.data, width, height);
    ctx.putImageData(rawImageData, 0, 0);

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const totalPixels = width * height;
    
    // Grayscale
    const grayData = new Uint8Array(totalPixels);
    for (let i = 0; i < data.length; i += 4) {
        grayData[i / 4] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    }

    // Detecção Estrutural
    const columnSplits = detectColumnsViaProjection(grayData, width, height);
    const horizontalBands = detectHorizontalTextBands(grayData, width, height);

    // Binarização (Otsu Tiled)
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

            // Inversão Inteligente (Dark Mode Detection)
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
                    if (shouldInvert) val = 255 - val;

                    const outIdx = idx * 4;
                    binaryData[outIdx] = binaryData[outIdx+1] = binaryData[outIdx+2] = val;
                    binaryData[outIdx+3] = 255;
                }
            }
        }
    }
    
    // Limpeza Morfológica
    applyMorphology(binaryData, width, height);
    
    // Atualiza o canvas com os dados binários processados
    const finalImageData = new ImageData(binaryData, width, height);
    ctx.putImageData(finalImageData, 0, 0);

    // 3. Transferência de volta para a Main Thread (Zero-Copy)
    const outputBitmap = canvas.transferToImageBitmap();
    
    const response: WorkerOutput = {
        success: true,
        pageNumber,
        imageBitmap: outputBitmap,
        columnSplits
    };

    (self as any).postMessage(response, [outputBitmap]);

  } catch (err: any) {
    (self as any).postMessage({ 
        success: false, 
        pageNumber, 
        error: err.message 
    } as WorkerOutput);
  }
};
