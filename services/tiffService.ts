
import UTIF from 'utif';
import { PDFDocument } from 'pdf-lib';

export async function convertTiffToPdf(tiffBlob: Blob): Promise<Blob> {
  const buffer = await tiffBlob.arrayBuffer();
  // UTIF.decode parseia o arquivo TIFF e retorna as IFDs (Image File Directories)
  const ifds = UTIF.decode(buffer);
  
  const pdfDoc = await PDFDocument.create();

  for (const ifd of ifds) {
    // Decodifica a imagem bruta para cada página (IFD)
    UTIF.decodeImage(buffer, ifd);
    const rgba = UTIF.toRGBA8(ifd);
    
    // Cria um canvas temporário para converter os dados brutos de pixel em PNG
    // O pdf-lib exige PNG ou JPG para embedar
    const canvas = document.createElement('canvas');
    canvas.width = ifd.width;
    canvas.height = ifd.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    
    const imageData = new ImageData(new Uint8ClampedArray(rgba), ifd.width, ifd.height);
    ctx.putImageData(imageData, 0, 0);
    
    // Converte para PNG
    const pngUrl = canvas.toDataURL('image/png');
    const pngImageBytes = await fetch(pngUrl).then(res => res.arrayBuffer());
    
    const pngImage = await pdfDoc.embedPng(pngImageBytes);
    
    // Adiciona página ao PDF com as dimensões da imagem
    const page = pdfDoc.addPage([ifd.width, ifd.height]);
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: ifd.width,
      height: ifd.height,
    });
  }

  const pdfBytes = await pdfDoc.save();
  // Cast to any to avoid "Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'BlobPart'"
  return new Blob([pdfBytes as any], { type: 'application/pdf' });
}
