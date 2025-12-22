
import UTIF from 'utif';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import heic2any from 'heic2any';
import daikon from 'daikon';
import JSZip from 'jszip';

// Tipos suportados pelo adaptador
export type SupportedMediaType = 'tiff' | 'heic' | 'webp' | 'dicom' | 'text' | 'image-standard' | 'cbz' | 'cbr';

/**
 * Converte imagens baseadas em Canvas para PNG buffer
 * Otimizado para usar OffscreenCanvas se disponível ou Canvas DOM limpo.
 */
async function canvasToPngBuffer(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<ArrayBuffer> {
  if (canvas instanceof OffscreenCanvas) {
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return blob.arrayBuffer();
  }
  
  return new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob((blob) => {
      if (blob) {
        blob.arrayBuffer().then(resolve).catch(reject);
      } else {
        reject(new Error("Falha ao converter canvas para blob"));
      }
    }, 'image/png');
  });
}

/**
 * CHROMIUM OPTIMIZATION: createImageBitmap pipeline.
 * Redimensiona e padroniza imagens para JPEG via Canvas/OffscreenCanvas.
 * Decodifica a imagem em background thread (GPU upload friendly).
 */
async function processImage(data: Uint8Array, mimeType: string): Promise<Uint8Array> {
  const blob = new Blob([data], { type: mimeType });
  let bitmap: ImageBitmap | null = null;

  try {
    // Decodificação Assíncrona fora da Main Thread
    bitmap = await createImageBitmap(blob);
    
    // Limite de segurança: 1600px de largura
    const MAX_WIDTH = 1600;
    let width = bitmap.width;
    let height = bitmap.height;

    if (width > MAX_WIDTH) {
        const scale = MAX_WIDTH / width;
        width = Math.floor(width * scale);
        height = Math.floor(height * scale);
    }

    // Preferir OffscreenCanvas (Nativo em Workers e Main Thread no Chromium)
    const isOffscreenSupported = typeof OffscreenCanvas !== 'undefined';
    const canvas = isOffscreenSupported 
      ? new OffscreenCanvas(width, height) 
      : document.createElement('canvas');
    
    if (!isOffscreenSupported) {
      (canvas as HTMLCanvasElement).width = width;
      (canvas as HTMLCanvasElement).height = height;
    }

    const ctx = canvas.getContext('2d', { 
        // Dica para o browser otimizar se formos ler os pixels (embora aqui vamos exportar blob)
        willReadFrequently: false,
        alpha: false // Otimização: sabemos que vamos gerar JPEG (sem alpha)
    }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

    if (!ctx) throw new Error("Contexto Canvas indisponível");

    // Fundo branco
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    
    // Desenho acelerado
    ctx.drawImage(bitmap, 0, 0, width, height);
    
    // Libera memória de textura da GPU imediatamente
    bitmap.close();
    bitmap = null;

    // Exportação
    if (canvas instanceof OffscreenCanvas) {
        const resultBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
        // Limpeza de memória do Canvas
        canvas.width = 0; canvas.height = 0; 
        return new Uint8Array(await resultBlob.arrayBuffer());
    } else {
        return new Promise((resolve, reject) => {
            (canvas as HTMLCanvasElement).toBlob((resultBlob) => {
                // Limpeza
                (canvas as HTMLCanvasElement).width = 0;
                (canvas as HTMLCanvasElement).height = 0;
                
                if (resultBlob) {
                    resultBlob.arrayBuffer().then(buffer => resolve(new Uint8Array(buffer)));
                } else {
                    reject(new Error("Falha ao processar canvas"));
                }
            }, 'image/jpeg', 0.85);
        });
    }

  } catch (e) {
    if (bitmap) bitmap.close();
    console.error("Erro no processamento de imagem otimizado:", e);
    throw new Error("Erro ao processar imagem.");
  }
}

/**
 * Converte HEIC/HEIF para PDF
 */
async function convertHeicToPdf(blob: Blob): Promise<Blob> {
  const converted = await heic2any({ blob, toType: 'image/jpeg', quality: 0.9 });
  const jpgBlob = Array.isArray(converted) ? converted[0] : converted;
  const jpgBytes = await jpgBlob.arrayBuffer();

  const pdfDoc = await PDFDocument.create();
  const jpgImage = await pdfDoc.embedJpg(jpgBytes);
  
  const page = pdfDoc.addPage([jpgImage.width, jpgImage.height]);
  page.drawImage(jpgImage, {
    x: 0, y: 0, width: jpgImage.width, height: jpgImage.height
  });

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes as any], { type: 'application/pdf' });
}

/**
 * Converte TIFF para PDF
 */
async function convertTiffToPdf(buffer: ArrayBuffer): Promise<Blob> {
  const ifds = UTIF.decode(buffer);
  const pdfDoc = await PDFDocument.create();

  for (const ifd of ifds) {
    UTIF.decodeImage(buffer, ifd);
    const rgba = UTIF.toRGBA8(ifd);
    
    // Criação de Canvas Otimizada
    const width = ifd.width;
    const height = ifd.height;
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    
    const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
    ctx.putImageData(imageData, 0, 0);
    
    const pngBytes = await canvasToPngBuffer(canvas);
    
    // Limpeza
    canvas.width = 0; canvas.height = 0;

    const pngImage = await pdfDoc.embedPng(pngBytes);
    
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(pngImage, { x: 0, y: 0, width: width, height: height });
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes as any], { type: 'application/pdf' });
}

/**
 * Converte Imagens "Exóticas" (WebP, GIF, BMP) para PDF via Canvas -> PNG
 */
async function convertWebPToPdf(blob: Blob): Promise<Blob> {
  try {
      const arrayBuffer = await blob.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      // Reutiliza o processImage que já faz a conversão robusta para JPEG
      const jpegBytes = await processImage(uint8, blob.type);
      
      const pdfDoc = await PDFDocument.create();
      const jpgImage = await pdfDoc.embedJpg(jpegBytes);
      const page = pdfDoc.addPage([jpgImage.width, jpgImage.height]);
      page.drawImage(jpgImage, { x: 0, y: 0, width: jpgImage.width, height: jpgImage.height });
      
      const pdfBytes = await pdfDoc.save();
      return new Blob([pdfBytes as any], { type: 'application/pdf' });
  } catch (e) {
      throw new Error("Falha ao converter WebP/GIF para PDF: " + (e as any).message);
  }
}

/**
 * Converte Texto (.txt, .md) para PDF
 */
async function convertTextToPdf(text: string): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 12;
  const lineHeight = 14;
  const margin = 50;
  
  const pageW = 595; // A4 width approx
  const pageH = 842; // A4 height approx
  const textW = pageW - (margin * 2);

  let currentPage = pdfDoc.addPage([pageW, pageH]);
  let y = pageH - margin;

  const lines = text.split(/\r?\n/);

  const wrapText = (line: string): string[] => {
     if (font.widthOfTextAtSize(line, fontSize) <= textW) return [line];
     
     const words = line.split(' ');
     const wrapped: string[] = [];
     let currentLine = words[0];

     for (let i = 1; i < words.length; i++) {
         const word = words[i];
         const width = font.widthOfTextAtSize(currentLine + " " + word, fontSize);
         if (width < textW) {
             currentLine += " " + word;
         } else {
             wrapped.push(currentLine);
             currentLine = word;
         }
     }
     wrapped.push(currentLine);
     return wrapped;
  };

  for (const rawLine of lines) {
      const wrappedLines = wrapText(rawLine);
      
      for (const line of wrappedLines) {
          if (y < margin + lineHeight) {
              currentPage = pdfDoc.addPage([pageW, pageH]);
              y = pageH - margin;
          }
          currentPage.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
          y -= lineHeight;
      }
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes as any], { type: 'application/pdf' });
}

/**
 * Converte DICOM para PDF (Visualização Básica)
 */
async function convertDicomToPdf(buffer: ArrayBuffer): Promise<Blob> {
  const dataView = new DataView(buffer);
  const image = daikon.Series.parseImage(dataView);

  if (!image) throw new Error("Não foi possível parsear a imagem DICOM.");

  const rawData = image.getInterpretedData();
  const numPixels = image.getRows() * image.getCols();
  const min = Math.min(...rawData);
  const max = Math.max(...rawData);
  const range = max - min; 

  const canvas = document.createElement('canvas');
  canvas.width = image.getCols();
  canvas.height = image.getRows();
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error("Contexto Canvas indisponível");

  const imageData = ctx.createImageData(canvas.width, canvas.height);
  
  for (let i = 0; i < numPixels; i++) {
      let val = rawData[i];
      let normalized = range === 0 ? 0 : Math.floor(((val - min) / range) * 255);
      
      const offset = i * 4;
      imageData.data[offset] = normalized;     
      imageData.data[offset + 1] = normalized; 
      imageData.data[offset + 2] = normalized; 
      imageData.data[offset + 3] = 255;        
  }
  
  ctx.putImageData(imageData, 0, 0);

  const pngBytes = await canvasToPngBuffer(canvas);
  
  // Clean up
  canvas.width = 0; canvas.height = 0;

  const pdfDoc = await PDFDocument.create();
  const pngImage = await pdfDoc.embedPng(pngBytes);
  const page = pdfDoc.addPage([image.getCols(), image.getRows()]);
  page.drawImage(pngImage, { x: 0, y: 0, width: image.getCols(), height: image.getRows() });

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes as any], { type: 'application/pdf' });
}

/**
 * Processa arquivos RAR (CBR)
 */
async function processCbr(data: Uint8Array): Promise<Blob> {
  let createExtractorFromData;
  try {
    const module = await import('unrar-js');
    createExtractorFromData = module.createExtractorFromData;
  } catch (err) {
    throw new Error("Falha ao carregar motor de extração RAR.");
  }

  const extractor = await createExtractorFromData({ data });
  const list = extractor.getFileList();
  const fileHeaders = [...list.fileHeaders];
  
  const imageHeaders = fileHeaders
    .filter(h => /\.(jpg|jpeg|png|webp|bmp)$/i.test(h.name) && !h.flags.directory)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  if (imageHeaders.length === 0) throw new Error("O arquivo CBR não contém imagens suportadas.");

  const pdfDoc = await PDFDocument.create();
  
  const extracted = extractor.extract({ files: imageHeaders.map(h => h.name) });

  for (const file of extracted.files) {
      if (!file.extraction) continue;
      
      const ext = file.fileHeader.name.split('.').pop()?.toLowerCase();
      let mimeType = 'image/jpeg';
      if (ext === 'png') mimeType = 'image/png';
      if (ext === 'webp') mimeType = 'image/webp';
      if (ext === 'bmp') mimeType = 'image/bmp';

      try {
          const processedData = await processImage(file.extraction, mimeType);
          const image = await pdfDoc.embedJpg(processedData);
          const page = pdfDoc.addPage([image.width, image.height]);
          page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      } catch (e) {
          console.warn(`[CBR] Falha ao processar imagem ${file.fileHeader.name}, pulando...`, e);
      }
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes as any], { type: 'application/pdf' });
}

/**
 * Converte CBZ (Zip de Imagens) para PDF
 */
async function convertCbzToPdf(blob: Blob): Promise<Blob> {
  const zip = await JSZip.loadAsync(blob);
  const pdfDoc = await PDFDocument.create();
  
  const imageFiles = Object.keys(zip.files)
    .filter(name => /\.(jpg|jpeg|png|webp|bmp)$/i.test(name) && !zip.files[name].dir && !name.startsWith('__macosx'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  if (imageFiles.length === 0) throw new Error("O arquivo CBZ não contém imagens suportadas.");

  for (const fileName of imageFiles) {
      try {
          const rawData = await zip.files[fileName].async('uint8array');
          
          const ext = fileName.split('.').pop()?.toLowerCase();
          let mimeType = 'image/jpeg';
          if (ext === 'png') mimeType = 'image/png';
          if (ext === 'webp') mimeType = 'image/webp';
          if (ext === 'bmp') mimeType = 'image/bmp';
          
          const processedData = await processImage(rawData, mimeType);
          const image = await pdfDoc.embedJpg(processedData);
          
          const page = pdfDoc.addPage([image.width, image.height]);
          page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      } catch (e) {
          console.warn(`[CBZ] Falha ao processar imagem ${fileName}, pulando...`, e);
      }
  }

  if (pdfDoc.getPageCount() === 0) {
      throw new Error("Nenhuma imagem válida pôde ser extraída do CBZ.");
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes as any], { type: 'application/pdf' });
}

/**
 * Roteamento para Comic Books
 */
async function convertComicToPdf(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  
  const isRar = uint8Array[0] === 0x52 && uint8Array[1] === 0x61 && uint8Array[2] === 0x72 && uint8Array[3] === 0x21;

  if (isRar) {
    return await processCbr(uint8Array);
  } else {
    return await convertCbzToPdf(blob);
  }
}

/**
 * Função Principal de Roteamento
 */
export async function universalConvertToPdf(blob: Blob, name: string): Promise<Blob> {
  const ext = name.split('.').pop()?.toLowerCase();
  const mime = blob.type;

  if (mime === 'image/tiff' || ext === 'tiff' || ext === 'tif') {
      return convertTiffToPdf(await blob.arrayBuffer());
  }

  if (mime === 'image/heic' || mime === 'image/heif' || ext === 'heic' || ext === 'heif') {
      return convertHeicToPdf(blob);
  }

  if (mime === 'image/webp' || mime === 'image/gif' || mime === 'image/bmp' || ext === 'webp' || ext === 'gif' || ext === 'bmp') {
      return convertWebPToPdf(blob);
  }

  if (mime === 'image/jpeg' || mime === 'image/png' || ext === 'jpg' || ext === 'jpeg' || ext === 'png') {
      return convertWebPToPdf(blob); 
  }

  if (mime === 'application/dicom' || ext === 'dcm') {
      return convertDicomToPdf(await blob.arrayBuffer());
  }

  if (mime === 'application/vnd.comicbook+zip' || mime === 'application/x-cbz' || ext === 'cbz' ||
      mime === 'application/vnd.comicbook-rar' || mime === 'application/x-cbr' || ext === 'cbr') {
      return convertComicToPdf(blob);
  }

  if (mime.startsWith('text/') || ext === 'txt' || ext === 'md' || ext === 'log') {
      const text = await blob.text();
      return convertTextToPdf(text);
  }

  throw new Error("Formato de arquivo não suportado para conversão.");
}
