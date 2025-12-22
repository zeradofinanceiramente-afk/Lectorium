
/**
 * Image Processor Worker - GPU Accelerated (WebGL)
 * Executa manipulações de imagem usando GLSL Shaders para performance extrema.
 */

// Definições de Tipos
type WorkerCommand = 
  | { type: 'processLayout', bitmap: ImageBitmap, options?: any }
  | { type: 'preprocess', bitmap: ImageBitmap, options?: any };

interface ProcessLayoutResult {
  buffer: ArrayBuffer; 
  width: number;
  height: number;
  columnSplits: number[];
  processedBitmap?: ImageBitmap;
}

// --- SHADERS GLSL ---

const VS_SOURCE = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  uniform vec2 u_resolution;
  varying vec2 v_texCoord;
  void main() {
     vec2 zeroToOne = a_position / u_resolution;
     vec2 zeroToTwo = zeroToOne * 2.0;
     vec2 clipSpace = zeroToTwo - 1.0;
     gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
     v_texCoord = a_texCoord;
  }
`;

// Filtro de Nitidez (Convolution 3x3)
const FS_SHARPEN = `
  precision mediump float;
  uniform sampler2D u_image;
  uniform vec2 u_textureSize;
  varying vec2 v_texCoord;

  void main() {
      vec2 onePixel = vec2(1.0, 1.0) / u_textureSize;
      
      // Kernel:
      //  0 -1  0
      // -1  5 -1
      //  0 -1  0
      
      vec4 color = texture2D(u_image, v_texCoord) * 5.0;
      color += texture2D(u_image, v_texCoord + vec2(0.0, -1.0) * onePixel) * -1.0;
      color += texture2D(u_image, v_texCoord + vec2(-1.0, 0.0) * onePixel) * -1.0;
      color += texture2D(u_image, v_texCoord + vec2(1.0, 0.0) * onePixel) * -1.0;
      color += texture2D(u_image, v_texCoord + vec2(0.0, 1.0) * onePixel) * -1.0;
      
      gl_FragColor = vec4(color.rgb, 1.0);
  }
`;

// Equalização Adaptativa Local (Simula applyAdaptiveStretch da CPU)
// Usa amostragem esparsa para calcular média local sem custar performance
const FS_ADAPTIVE_STRETCH = `
  precision mediump float;
  uniform sampler2D u_image;
  uniform vec2 u_textureSize;
  varying vec2 v_texCoord;

  float luminance(vec3 color) {
      return dot(color, vec3(0.299, 0.587, 0.114));
  }

  void main() {
      vec2 onePixel = vec2(1.0, 1.0) / u_textureSize;
      vec3 current = texture2D(u_image, v_texCoord).rgb;
      float lum = luminance(current);
      
      // Calcular média local (Box Blur Esparso 5x5)
      float localSum = 0.0;
      float count = 0.0;
      
      for (float x = -4.0; x <= 4.0; x += 2.0) {
          for (float y = -4.0; y <= 4.0; y += 2.0) {
              vec3 sample = texture2D(u_image, v_texCoord + vec2(x, y) * onePixel).rgb;
              localSum += luminance(sample);
              count += 1.0;
          }
      }
      float localMean = localSum / count;
      
      // Lógica de Contraste Adaptativo
      float newValue = lum;
      if (lum < localMean - 0.05) { // 0.05 é aprox 12/255
          // Escurecer pixels abaixo da média (texto)
          newValue = max(0.0, lum * (lum / max(localMean, 0.01)) - 0.1);
      } else {
          // Clarear fundo
          newValue = min(1.0, lum + (1.0 - localMean) + 0.05);
      }
      
      gl_FragColor = vec4(vec3(newValue), 1.0);
  }
`;

// --- WEBGL ENGINE ---

class GPUProcessor {
    canvas: OffscreenCanvas;
    gl: WebGLRenderingContext;
    programSharpen: WebGLProgram | null = null;
    programAdaptive: WebGLProgram | null = null;
    positionBuffer: WebGLBuffer | null = null;
    texCoordBuffer: WebGLBuffer | null = null;

    constructor(width: number, height: number) {
        this.canvas = new OffscreenCanvas(width, height);
        this.gl = this.canvas.getContext('webgl', { 
            premultipliedAlpha: false,
            preserveDrawingBuffer: true 
        }) as WebGLRenderingContext;
        
        if (!this.gl) throw new Error("WebGL não suportado no Worker");
        
        this.initBuffers();
        this.programSharpen = this.createProgram(VS_SOURCE, FS_SHARPEN);
        this.programAdaptive = this.createProgram(VS_SOURCE, FS_ADAPTIVE_STRETCH);
    }

    resize(width: number, height: number) {
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.gl.viewport(0, 0, width, height);
        }
    }

    private createShader(type: number, source: string) {
        const shader = this.gl.createShader(type)!;
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error(this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    private createProgram(vsSource: string, fsSource: string) {
        const vs = this.createShader(this.gl.VERTEX_SHADER, vsSource);
        const fs = this.createShader(this.gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return null;

        const program = this.gl.createProgram()!;
        this.gl.attachShader(program, vs);
        this.gl.attachShader(program, fs);
        this.gl.linkProgram(program);
        return program;
    }

    private initBuffers() {
        // Fullscreen Quad
        this.positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
            0, 0,
            this.canvas.width, 0,
            0, this.canvas.height,
            0, this.canvas.height,
            this.canvas.width, 0,
            this.canvas.width, this.canvas.height,
        ]), this.gl.STATIC_DRAW);

        this.texCoordBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texCoordBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
            0.0, 0.0,
            1.0, 0.0,
            0.0, 1.0,
            0.0, 1.0,
            1.0, 0.0,
            1.0, 1.0,
        ]), this.gl.STATIC_DRAW);
    }

    private updatePositionBuffer(width: number, height: number) {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
            0, 0, width, 0, 0, height,
            0, height, width, 0, width, height,
        ]), this.gl.STATIC_DRAW);
    }

    createTexture(bitmap: ImageBitmap) {
        const tex = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, bitmap);
        return tex;
    }

    applyShader(program: WebGLProgram, texture: WebGLTexture, width: number, height: number) {
        this.resize(width, height);
        this.updatePositionBuffer(width, height);
        this.gl.useProgram(program);

        const posLoc = this.gl.getAttribLocation(program, "a_position");
        const texLoc = this.gl.getAttribLocation(program, "a_texCoord");
        const resLoc = this.gl.getUniformLocation(program, "u_resolution");
        const sizeLoc = this.gl.getUniformLocation(program, "u_textureSize");

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.enableVertexAttribArray(posLoc);
        this.gl.vertexAttribPointer(posLoc, 2, this.gl.FLOAT, false, 0, 0);

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texCoordBuffer);
        this.gl.enableVertexAttribArray(texLoc);
        this.gl.vertexAttribPointer(texLoc, 2, this.gl.FLOAT, false, 0, 0);

        this.gl.uniform2f(resLoc, width, height);
        this.gl.uniform2f(sizeLoc, width, height);

        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        this.gl.uniform1i(this.gl.getUniformLocation(program, "u_image"), 0);

        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    }

    readPixels(): Uint8ClampedArray {
        const pixels = new Uint8Array(this.gl.drawingBufferWidth * this.gl.drawingBufferHeight * 4);
        this.gl.readPixels(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);
        // WebGL reads pixels upside down relative to Canvas 2D/ImageBitmap
        // Flip Y manually or handle in CSS. Here we flip manually for data consistency.
        return this.flipY(pixels, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
    }

    private flipY(pixels: Uint8Array, width: number, height: number): Uint8ClampedArray {
        const halfHeight = Math.floor(height / 2);
        const bytesPerRow = width * 4;
        const temp = new Uint8Array(bytesPerRow);
        for (let y = 0; y < halfHeight; ++y) {
            const topOffset = y * bytesPerRow;
            const bottomOffset = (height - y - 1) * bytesPerRow;
            temp.set(pixels.subarray(topOffset, topOffset + bytesPerRow));
            pixels.set(pixels.subarray(bottomOffset, bottomOffset + bytesPerRow), topOffset);
            pixels.set(temp, bottomOffset);
        }
        return new Uint8ClampedArray(pixels.buffer);
    }
}

// Global Renderer Instance (reuse context)
let gpu: GPUProcessor | null = null;

function getGPU(width: number, height: number) {
    if (!gpu) gpu = new GPUProcessor(width, height);
    return gpu;
}

// --- WORKER HANDLERS ---

self.onmessage = async (e: MessageEvent<WorkerCommand>) => {
  const { type, bitmap } = e.data;

  try {
    let result: any;

    if (type === 'processLayout') {
      result = await handleProcessLayout(bitmap);
    } else if (type === 'preprocess') {
      result = await handlePreprocess(bitmap);
    }

    const transferables: Transferable[] = [];
    if (result.processedBitmap) transferables.push(result.processedBitmap);
    if (result.buffer) transferables.push(result.buffer);

    (self as any).postMessage({ success: true, data: result }, transferables);

  } catch (error: any) {
    console.error("Worker Error:", error);
    (self as any).postMessage({ success: false, error: error.message });
  } finally {
    if (bitmap) bitmap.close();
  }
};

async function handleProcessLayout(bitmap: ImageBitmap): Promise<ProcessLayoutResult> {
  const width = bitmap.width;
  const height = bitmap.height;
  const renderer = getGPU(width, height);

  // 1. GPU Sharpen Pass
  const texture = renderer.createTexture(bitmap);
  renderer.applyShader(renderer.programSharpen!, texture, width, height);
  
  // 2. Read back to CPU for Analysis
  const data = renderer.readPixels();
  
  // Análise de Layout (CPU - mas agora com imagem limpa)
  // Grayscale conversion "on-the-fly"
  const grayData = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      // Simple luminance
      grayData[i] = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
  }

  const columnSplits = detectColumnsViaProjection(grayData, width, height);
  const horizontalBands = detectHorizontalTextBands(grayData, width, height);

  // 3. Binarização (CPU - Otsu ainda é melhor feito estatisticamente na CPU)
  const binaryData = new Uint8ClampedArray(data.length);
  performTiledOtsu(binaryData, grayData, width, height, horizontalBands);

  // 4. Limpeza Morfológica (CPU)
  applyMorphology(binaryData, width, height);

  const finalImageData = new ImageData(binaryData, width, height);
  const processedBitmap = await createImageBitmap(finalImageData);

  return {
    buffer: binaryData.buffer,
    width,
    height,
    columnSplits,
    processedBitmap
  };
}

async function handlePreprocess(bitmap: ImageBitmap) {
  const width = bitmap.width;
  const height = bitmap.height;
  const renderer = getGPU(width, height);
  
  const texture = renderer.createTexture(bitmap);
  
  // Pipeline: Adaptive Stretch -> Sharpen
  // Nota: Idealmente usaríamos Framebuffers para ping-pong, mas para simplicidade
  // desenhamos na tela, lemos (ou copiamos para textura) e desenhamos de novo.
  // Como Adaptive Stretch é o mais importante, aplicamos ele.
  
  renderer.applyShader(renderer.programAdaptive!, texture, width, height);
  
  // Se quisermos aplicar sharpen DEPOIS, precisaríamos copiar o canvas atual para uma nova textura.
  // Para V1 do WebGL, vamos aplicar apenas AdaptiveStretch aqui, que já melhora muito para IA.
  // O Sharpen pode ser excessivo para IA que prefere contexto suave.
  
  // Convert back to Bitmap
  const processedBitmap = await renderer.canvas.transferToImageBitmap();
  
  return { processedBitmap };
}

// --- CPU FALLBACK ALGORITHMS (Layout Analysis) ---

function applyMorphology(data: Uint8ClampedArray, width: number, height: number) {
    const temp = new Uint8ClampedArray(data);
    // Erosão
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            if (temp[idx] === 0) {
                let whiteNeighbors = 0;
                // Unrolled loop for speed
                if (temp[((y-1)*width+(x-1))*4] === 255) whiteNeighbors++;
                if (temp[((y-1)*width+(x))*4] === 255) whiteNeighbors++;
                if (temp[((y-1)*width+(x+1))*4] === 255) whiteNeighbors++;
                if (temp[((y)*width+(x-1))*4] === 255) whiteNeighbors++;
                if (temp[((y)*width+(x+1))*4] === 255) whiteNeighbors++;
                if (temp[((y+1)*width+(x-1))*4] === 255) whiteNeighbors++;
                if (temp[((y+1)*width+(x))*4] === 255) whiteNeighbors++;
                if (temp[((y+1)*width+(x+1))*4] === 255) whiteNeighbors++;

                if (whiteNeighbors > 6) {
                    data[idx] = data[idx+1] = data[idx+2] = 255;
                }
            }
        }
    }
}

function computeOtsuThreshold(histogram: Uint32Array, total: number): number {
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * histogram[i];
    let sumB = 0, wB = 0, wF = 0, maxVar = 0, threshold = 127;
    for (let i = 0; i < 256; i++) {
        wB += histogram[i];
        if (wB === 0) continue;
        wF = total - wB;
        if (wF === 0) break;
        sumB += i * histogram[i];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const varBetween = wB * wF * (mB - mF) * (mB - mF);
        if (varBetween > maxVar) { maxVar = varBetween; threshold = i; }
    }
    return threshold;
}

function detectHorizontalTextBands(grayData: Uint8Array, width: number, height: number) {
    const hpp = new Uint32Array(height);
    for (let y = 0; y < height; y++) {
        let count = 0;
        const offset = y * width;
        for (let x = 0; x < width; x++) if (grayData[offset + x] < 128) count++;
        hpp[y] = count;
    }
    const bands = [];
    let inBand = false, start = 0;
    const threshold = width * 0.01;
    for (let y = 0; y < height; y++) {
        if (!inBand && hpp[y] > threshold) { inBand = true; start = y; } 
        else if (inBand && hpp[y] <= threshold) {
            if (y - start > 10) bands.push({start, end: y});
            inBand = false;
        }
    }
    return bands;
}

function detectColumnsViaProjection(grayData: Uint8Array, width: number, height: number) {
    const vpp = new Uint32Array(width);
    for (let x = 0; x < width; x++) {
        let blackPixels = 0;
        for (let y = 0; y < height; y++) if (grayData[y * width + x] < 128) blackPixels++;
        vpp[x] = blackPixels;
    }
    const midStart = Math.floor(width * 0.35), midEnd = Math.floor(width * 0.65);
    let bestGutterX = -1, minDensity = height;
    for (let x = midStart; x < midEnd; x++) {
        let localSum = 0;
        for(let i = -2; i <= 2; i++) localSum += vpp[x + i] || 0;
        const density = localSum / 5;
        if (density < minDensity) { minDensity = density; bestGutterX = x; }
    }
    return minDensity < (height * 0.02) ? [bestGutterX] : [];
}

function performTiledOtsu(binaryData: Uint8ClampedArray, grayData: Uint8Array, width: number, height: number, bands: any[]) {
    const tilesX = 8, tilesY = 8;
    const tileW = Math.floor(width / tilesX), tileH = Math.floor(height / tilesY);

    for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
            const startX = tx * tileW, startY = ty * tileH;
            const endX = (tx === tilesX - 1) ? width : (tx + 1) * tileW;
            const endY = (ty === tilesY - 1) ? height : (ty + 1) * tileH;

            const histogram = new Uint32Array(256);
            let tilePixels = 0;
            for (let y = startY; y < endY; y++) {
                let offset = y * width + startX;
                for (let x = startX; x < endX; x++) {
                    histogram[grayData[offset++]]++;
                    tilePixels++;
                }
            }
            const threshold = computeOtsuThreshold(histogram, tilePixels);
            
            let darkPixelCount = 0;
            for (let y = startY; y < endY; y++) {
                let offset = y * width + startX;
                for (let x = startX; x < endX; x++) {
                    if (grayData[offset++] < threshold) darkPixelCount++;
                }
            }
            
            const shouldInvert = (darkPixelCount / tilePixels) > 0.55;

            for (let y = startY; y < endY; y++) {
                const isWithinTextBand = bands.some((b: any) => y >= b.start && y <= b.end);
                const effectiveThreshold = isWithinTextBand ? threshold : threshold * 0.8;
                
                let offset = y * width + startX;
                let outOffset = offset * 4;
                
                for (let x = startX; x < endX; x++) {
                    let val = grayData[offset++] > effectiveThreshold ? 255 : 0;
                    if (shouldInvert) val = 255 - val;
                    
                    binaryData[outOffset] = binaryData[outOffset+1] = binaryData[outOffset+2] = val;
                    binaryData[outOffset+3] = 255;
                    outOffset += 4;
                }
            }
        }
    }
}
