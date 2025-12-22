
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// Definição de tipos mínimos para o worker
interface Annotation {
  id?: string;
  page: number;
  bbox: [number, number, number, number];
  text?: string;
  type: 'highlight' | 'note' | 'ink';
  points?: number[][];
  color?: string;
  opacity?: number;
  strokeWidth?: number;
  isBurned?: boolean;
}

self.onmessage = async (e: MessageEvent) => {
  const { pdfBytes, annotations, ocrMap } = e.data as { 
      pdfBytes: ArrayBuffer, 
      annotations: Annotation[],
      ocrMap?: Record<number, any[]> 
  };

  try {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // 1. EMBED ANNOTATIONS DATA INTO PDF METADATA
    const annotationsToBurn = annotations.map(a => ({
        ...a,
        isBurned: true
    }));
    const serializedData = JSON.stringify(annotationsToBurn);
    pdfDoc.setKeywords([`PDF_ANNOTATOR_DATA:::${serializedData}`]);

    const hexToRgb = (hex: string) => {
        const bigint = parseInt(hex.replace('#', ''), 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return rgb(r / 255, g / 255, b / 255);
    };

    // 2. BURN OCR TEXT (INVISIBLE LAYER)
    // Isso torna o PDF "pesquisável" se ele era apenas imagem antes
    if (ocrMap) {
        for (const [pageNumStr, words] of Object.entries(ocrMap)) {
            const pageNum = parseInt(pageNumStr);
            if (pageNum <= pages.length) {
                const page = pages[pageNum - 1];
                const { height } = page.getSize();
                
                // OCR geralmente assume que a imagem é renderizada com um certo DPR.
                // O Tesseract retorna bbox em pixels da imagem processada.
                // Precisamos normalizar. No front, usamos DPR e Scale. 
                // Assumindo que o bbox do Tesseract vem da imagem original (dpr 1), 
                // precisamos mapear para coordenadas PDF (72 DPI vs Pixels).
                // PDF Point ~= 1/72 inch.
                // O worker do front usa DPR=1 para extração normal.
                
                // Nota: O ajuste de coordenadas exato pode variar dependendo da resolução original do PDF.
                // Aqui usamos uma aproximação de que 1px OCR ~= 1pt PDF para documentos padrão,
                // mas pode precisar de escala se o PDF for HiDPI.
                // Para simplificar, assumimos escala 1:1, pois Tesseract roda no canvas do PDF renderizado.
                
                for (const word of words) {
                    if (word.text && word.bbox) {
                        const { x0, y0, x1, y1 } = word.bbox;
                        const w = x1 - x0;
                        const h = y1 - y0;
                        
                        // Desenhar texto invisível
                        // PDF coords: Y cresce de baixo para cima. Canvas: cima para baixo.
                        page.drawText(word.text, {
                            x: x0,
                            y: height - y1, // Inverter Y (usando y1 como baseline aproximada)
                            size: h, // Altura da fonte ~= Altura do bbox
                            font: helveticaFont,
                            color: rgb(0, 0, 0),
                            opacity: 0, // INVISÍVEL
                        });
                    }
                }
            }
        }
    }

    // 3. DRAW VISUAL ANNOTATIONS
    for (const ann of annotations) {
        if (ann.isBurned) continue;
        if (ann.page > pages.length) continue;
        
        const page = pages[ann.page - 1];
        const { height } = page.getSize();

        if (ann.type === 'highlight') {
            const rectX = ann.bbox[0];
            const rectY = ann.bbox[1];
            const rectW = ann.bbox[2];
            const rectH = ann.bbox[3];
            const pdfY = height - rectY - rectH;

            page.drawRectangle({
                x: rectX,
                y: pdfY,
                width: rectW,
                height: rectH,
                color: hexToRgb(ann.color || '#facc15'),
                opacity: ann.opacity ?? 0.4,
            });
        } else if (ann.type === 'ink' && ann.points && ann.points.length > 0) {
            const color = hexToRgb(ann.color || '#ff0000');
            const width = ann.strokeWidth || 3;

            for (let i = 0; i < ann.points.length - 1; i++) {
                const p1 = ann.points[i];
                const p2 = ann.points[i + 1];
                page.drawLine({
                    start: { x: p1[0], y: height - p1[1] },
                    end: { x: p2[0], y: height - p2[1] },
                    thickness: width,
                    color: color,
                    opacity: ann.opacity ?? 0.5
                });
            }
        }
    }

    const newPdfBytes = await pdfDoc.save();
    
    // Post back the result
    // Cast self to any to avoid window vs worker context issues with Transferable overload
    (self as any).postMessage({ success: true, pdfBytes: newPdfBytes }, [newPdfBytes.buffer]);

  } catch (error: any) {
    (self as any).postMessage({ success: false, error: error.message });
  }
};
