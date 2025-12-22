/// <reference lib="webworker" />

/*
  High-Performance Image Processing Worker
  Responsável por: Sharpening, Grayscale, Binarização (Otsu) e Detecção de Layout.
  Executa fora da Main Thread para garantir 60fps na UI.
*/

self.onmessage = async (e: MessageEvent) => {
  const { bitmap, width, height, operationId } = e.data;

  try {
    // 1. Setup OffscreenCanvas
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { 
      willReadFrequently: true, 
      alpha: false 
    }) as OffscreenCanvasRenderingContext2D;

    if (!ctx) throw new Error("OffscreenCanvas context failed");

    // 2. Draw Raw Image
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close(); // Libera memória da textura imediatamente

    // 3. Pipeline de Processamento
    const imageData = ctx.getImageData(0, 0, width, height);
    
    // A. Sharpen (Realce de bordas para melhorar OCR)
    applySharpen(imageData.data, width, height);
    
    // B. Conversão para Escala de Cinza
    const grayData = convertToGrayscale(imageData.data, width, height);
    
    // C. Detecção de Layout (Colunas e Bandas)
    const columnSplits = detectColumnsViaProjection(grayData, width, height);
    // const horizontalBands = detectHorizontalTextBands(grayData, width, height); // Opcional para v2

    // D. Binarização Otsu Adaptativa (Tiled)
    applyAdaptiveOtsu(imageData.data, grayData, width, height);

    // E. Limpeza Morfológica
    applyMorphology(imageData.data, width, height);

    // 4. Render back to canvas to get final blob/buffer if needed, 
    // mas para o Tesseract, passamos o ImageData processado ou o próprio blob.
    // O Tesseract aceita ImageData diretamente, o que é muito rápido via transfer.
    
    // Atualiza o canvas com os pixels binarizados
    ctx.putImageData(imageData, 0, 0);
    
    // Gerar Blob ou ImageBitmap do resultado final para o Tesseract
    const finalBitmap = await canvas.transferToImageBitmap();

    self.postMessage({
      success: true,
      operationId,
      processedBitmap: finalBitmap,
      columnSplits
    }, [finalBitmap]); // Zero-Copy Transfer

  } catch (error: any) {
    console.error("Worker Image Processing Failed:", error);
    self.postMessage({
      success: false,
      operationId,
      error: error.message
    });
  }
};

// --- ALGORITMOS DE PROCESSAMENTO ---

function convertToGrayscale(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const grayData = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    // Luminância Rec. 709
    grayData[i / 4] = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722);
  }
  return grayData;
}

function applySharpen(data: Uint8ClampedArray, width: number, height: number) {
  const weights = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  const output = new Uint8ClampedArray(data.length);
  const side = 3;
  const halfSide = 1;

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
      output[dstOff] = r; output[dstOff + 1] = g; output[dstOff + 2] = b; output[dstOff + 3] = 255;
    }
  }
  data.set(output);
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

function applyAdaptiveOtsu(data: Uint8ClampedArray, grayData: Uint8Array, width: number, height: number) {
  const tilesX = 4;
  const tilesY = 4;
  const tileW = Math.ceil(width / tilesX);
  const tileH = Math.ceil(height / tilesY);

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const startX = tx * tileW;
      const startY = ty * tileH;
      const endX = Math.min(startX + tileW, width);
      const endY = Math.min(startY + tileH, height);

      const histogram = new Uint32Array(256);
      let tilePixels = 0;
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          histogram[grayData[y * width + x]]++;
          tilePixels++;
        }
      }
      
      const threshold = computeOtsuThreshold(histogram, tilePixels);

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = y * width + x;
          const val = grayData[idx] > threshold ? 255 : 0;
          const outIdx = idx * 4;
          data[outIdx] = data[outIdx+1] = data[outIdx+2] = val;
        }
      }
    }
  }
}

function applyMorphology(data: Uint8ClampedArray, width: number, height: number) {
  // Implementação simplificada de erosão para remover ruído
  const temp = new Uint8ClampedArray(data);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      if (temp[idx] === 0) { // Pixel preto
        let whiteNeighbors = 0;
        if (temp[idx - 4] === 255) whiteNeighbors++;
        if (temp[idx + 4] === 255) whiteNeighbors++;
        if (temp[idx - width * 4] === 255) whiteNeighbors++;
        if (temp[idx + width * 4] === 255) whiteNeighbors++;
        
        // Se rodeado de branco, remove (ruído)
        if (whiteNeighbors >= 3) {
          data[idx] = data[idx+1] = data[idx+2] = 255;
        }
      }
    }
  }
}

function detectColumnsViaProjection(grayData: Uint8Array, width: number, height: number): number[] {
  const vpp = new Uint32Array(width);
  // Amostragem central (evita cabeçalho e rodapé)
  const sampleStart = Math.floor(height * 0.2);
  const sampleEnd = Math.floor(height * 0.8);
  
  for (let x = 0; x < width; x++) {
    let blackPixels = 0;
    for (let y = sampleStart; y < sampleEnd; y++) {
      if (grayData[y * width + x] < 128) blackPixels++; 
    }
    vpp[x] = blackPixels;
  }

  const midStart = Math.floor(width * 0.4);
  const midEnd = Math.floor(width * 0.6);
  let bestGutterX = -1;
  let minDensity = height; // Começa alto

  for (let x = midStart; x < midEnd; x++) {
    let localSum = 0;
    // Janela de suavização de 5px
    for(let i = -2; i <= 2; i++) localSum += vpp[x + i] || 0;
    const density = localSum / 5;
    
    if (density < minDensity) {
      minDensity = density;
      bestGutterX = x;
    }
  }

  // Só considera coluna se a densidade de pixels pretos na calha for muito baixa (< 2% da altura)
  return minDensity < ((sampleEnd - sampleStart) * 0.02) ? [bestGutterX] : [];
}