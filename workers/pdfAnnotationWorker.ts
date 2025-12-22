
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

interface WorkerMessage {
  command: 'burn-all' | 'burn-page-ocr';
  pdfBytes: ArrayBuffer;
  annotations?: Annotation[];
  ocrMap?: Record<number, any[]>;
  pageNumber?: number;
  ocrData?: any[];
}

self.onmessage = async (e: MessageEvent) => {
  const data = e.data as WorkerMessage;
  const { command, pdfBytes } = data;

  try {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // --- MODO 1: INJEÇÃO IMEDIATA DE OCR (Single Source Update) ---
    // Apenas desenha o texto invisível na página específica e salva.
    // Não toca em metadados globais nem queima anotações visuais.
    if (command === 'burn-page-ocr' && data.pageNumber && data.ocrData) {
        const pageIndex = data.pageNumber - 1;
        if (pageIndex >= 0 && pageIndex < pages.length) {
            const page = pages[pageIndex];
            const { height } = page.getSize();
            
            for (const word of data.ocrData) {
                if (word.text && word.bbox) {
                    const { x0, y0, x1, y1 } = word.bbox;
                    const h = y1 - y0;
                    
                    // Desenhar texto invisível (Camada de Seleção Nativa)
                    page.drawText(word.text, {
                        x: x0,
                        y: height - y1, // Sistema de coordenadas PDF (origem inferior-esquerda)
                        size: h, 
                        font: helveticaFont,
                        color: rgb(0, 0, 0),
                        opacity: 0, // Totalmente invisível, apenas selecionável
                    });
                }
            }
        }
    } 
    
    // --- MODO 2: SALVAMENTO FINAL (Anotações Visuais + Metadados) ---
    else if (command === 'burn-all' || !command) {
        const annotations = data.annotations || [];
        const ocrMap = data.ocrMap;

        // 1. EMBED ANNOTATIONS DATA (Para re-edição futura)
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

        // 2. QUEIMAR OCR PENDENTE (Caso algum não tenha sido salvo incrementalmente)
        if (ocrMap) {
            for (const [pageNumStr, words] of Object.entries(ocrMap)) {
                const pageNum = parseInt(pageNumStr);
                // Verifica se a página é válida
                if (pageNum <= pages.length) {
                    const page = pages[pageNum - 1];
                    const { height } = page.getSize();
                    
                    for (const word of words) {
                        if (word.text && word.bbox) {
                            const { x0, y0, x1, y1 } = word.bbox;
                            const h = y1 - y0;
                            
                            page.drawText(word.text, {
                                x: x0,
                                y: height - y1,
                                size: h, 
                                font: helveticaFont,
                                color: rgb(0, 0, 0),
                                opacity: 0, 
                            });
                        }
                    }
                }
            }
        }

        // 3. DESENHAR ANOTAÇÕES VISUAIS (Highlights, Ink, etc)
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
            } else if (ann.type === 'note') {
                // Notas adesivas são ícones visuais
                const cx = ann.bbox[0];
                const cy = ann.bbox[1];
                const size = 14;
                const pdfY = height - cy;

                page.drawRectangle({
                    x: cx - (size/2),
                    y: pdfY - (size/2),
                    width: size,
                    height: size,
                    color: rgb(1, 0.95, 0.4),
                    borderColor: rgb(0.8, 0.7, 0),
                    borderWidth: 1,
                });
                
                // Pequeno "x" ou linhas para simular texto na nota
                page.drawLine({ start: { x: cx - 3, y: pdfY + 2 }, end: { x: cx + 3, y: pdfY + 2 }, thickness: 1, color: rgb(0,0,0), opacity: 0.3 });
                page.drawLine({ start: { x: cx - 3, y: pdfY - 1 }, end: { x: cx + 3, y: pdfY - 1 }, thickness: 1, color: rgb(0,0,0), opacity: 0.3 });
            }
        }
    }

    const newPdfBytes = await pdfDoc.save();
    
    // Post back the result
    (self as any).postMessage({ success: true, pdfBytes: newPdfBytes }, [newPdfBytes.buffer]);

  } catch (error: any) {
    (self as any).postMessage({ success: false, error: error.message });
  }
};
