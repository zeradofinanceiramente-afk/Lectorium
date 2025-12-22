import { PDFDocument, StandardFonts, rgb, TextAlignment } from 'pdf-lib';
import { PageSettings } from '../components/doc/modals/PageSetupModal';
import { PAPER_SIZES, CM_TO_PX } from '../components/doc/constants';

// Helper para converter CM para Pontos (PDF usa 72 DPI, 1cm = 28.35pts)
const cmToPt = (cm: number) => cm * 28.3465;

const hexToRgb = (hex: string) => {
    if (!hex) return rgb(0, 0, 0);
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
    const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
    const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
    return rgb(isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b);
};

export async function generatePdfFromTiptap(
  editorJson: any, 
  settings: PageSettings
): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  
  // Embedar fontes padrão
  const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const timesItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const timesBoldItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);

  // Configuração da Página
  const paperKey = settings.paperSize || 'a4';
  const paperDef = PAPER_SIZES[paperKey] || PAPER_SIZES['a4'];
  const isLandscape = settings.orientation === 'landscape';
  
  const widthPt = cmToPt(isLandscape ? paperDef.heightCm : paperDef.widthCm);
  const heightPt = cmToPt(isLandscape ? paperDef.widthCm : paperDef.heightCm);
  
  const margins = {
      top: cmToPt(settings.marginTop),
      bottom: cmToPt(settings.marginBottom),
      left: cmToPt(settings.marginLeft),
      right: cmToPt(settings.marginRight)
  };

  const contentWidth = widthPt - margins.left - margins.right;
  let currentPage = pdfDoc.addPage([widthPt, heightPt]);
  let yPosition = heightPt - margins.top;

  const addNewPage = () => {
      currentPage = pdfDoc.addPage([widthPt, heightPt]);
      yPosition = heightPt - margins.top;
  };

  // Processar Conteúdo
  const content = editorJson.content || [];

  for (const node of content) {
      try {
          // 1. TEXTO (Parágrafos e Headings)
          if (node.type === 'paragraph' || node.type === 'heading') {
              const align = node.attrs?.textAlign || 'left';
              const lineHeightMultiplier = node.attrs?.lineHeight ? parseFloat(node.attrs.lineHeight) : 1.5;
              
              let fontSize = 12;
              if (node.type === 'heading') {
                  const level = node.attrs?.level || 1;
                  if (level === 1) fontSize = 16;
                  else if (level === 2) fontSize = 14;
                  else fontSize = 13;
              }

              // Processar "runs" de texto (negrito, itálico, etc) dentro do parágrafo
              if (node.content) {
                  const runs = [];
                  // Flatten text runs logic
                  for (const child of node.content) {
                      if (child.type === 'text') {
                          let font = timesRoman;
                          const isBold = child.marks?.some((m: any) => m.type === 'bold');
                          const isItalic = child.marks?.some((m: any) => m.type === 'italic');
                          
                          if (isBold && isItalic) font = timesBoldItalic;
                          else if (isBold) font = timesBold;
                          else if (isItalic) font = timesItalic;

                          // Extract color from marks
                          const colorMark = child.marks?.find((m: any) => m.type === 'textStyle' && m.attrs?.color);
                          const color = colorMark ? hexToRgb(colorMark.attrs.color) : rgb(0, 0, 0);

                          runs.push({
                              text: child.text,
                              font,
                              fontSize,
                              color
                          });
                      }
                  }

                  // Word Wrap simples
                  // Nota: Uma implementação completa exigiria medição avançada de texto.
                  // Aqui fazemos uma aproximação baseada em caracteres médios para demonstração da arquitetura.
                  const averageCharWidth = 5; // Aproximação conservadora
                  
                  for (const run of runs) {
                      const words = run.text.split(' ');
                      let currentLine = '';

                      for (const word of words) {
                          const testLine = currentLine + (currentLine ? ' ' : '') + word;
                          // Heurística de largura: char * fontsize/2 (Times é estreita)
                          const testWidth = testLine.length * (run.fontSize / 2.2); 

                          if (testWidth > contentWidth) {
                              // Draw current line
                              currentPage.drawText(currentLine, {
                                  x: margins.left,
                                  y: yPosition,
                                  size: run.fontSize,
                                  font: run.font,
                                  color: run.color
                              });
                              
                              yPosition -= (run.fontSize * lineHeightMultiplier);
                              if (yPosition < margins.bottom) addNewPage();
                              
                              currentLine = word;
                      } else {
                              currentLine = testLine;
                          }
                      }
                      
                      // Draw remaining
                      if (currentLine) {
                          currentPage.drawText(currentLine, {
                              x: margins.left,
                              y: yPosition,
                              size: run.fontSize,
                              font: run.font,
                              color: run.color
                          });
                      }
                  }
                  // Add paragraph spacing
                  yPosition -= (fontSize * lineHeightMultiplier);
              } else {
                  // Empty paragraph
                  yPosition -= (fontSize * lineHeightMultiplier);
              }
              
              if (yPosition < margins.bottom) addNewPage();
          }
          
          // 2. IMAGEM
          else if (node.type === 'image' && node.attrs?.src) {
              try {
                  const src = node.attrs.src;
                  let imageBytes;
                  let embedImg;

                  if (src.startsWith('data:image/png')) {
                      imageBytes = await fetch(src).then(res => res.arrayBuffer());
                      embedImg = await pdfDoc.embedPng(imageBytes);
                  } else if (src.startsWith('data:image/jpeg') || src.startsWith('data:image/jpg')) {
                      imageBytes = await fetch(src).then(res => res.arrayBuffer());
                      embedImg = await pdfDoc.embedJpg(imageBytes);
                  }

                  if (embedImg) {
                      // Calcular dimensões (fit width se necessário)
                      let displayWidth = node.attrs.width || 400;
                      let displayHeight = displayWidth * (embedImg.height / embedImg.width);

                      if (displayWidth > contentWidth) {
                          displayWidth = contentWidth;
                          displayHeight = displayWidth * (embedImg.height / embedImg.width);
                      }

                      if (yPosition - displayHeight < margins.bottom) addNewPage();

                      currentPage.drawImage(embedImg, {
                          x: margins.left,
                          y: yPosition - displayHeight,
                          width: displayWidth,
                          height: displayHeight
                      });

                      yPosition -= (displayHeight + 20); // Spacing after image
                  }
              } catch (e) {
                  console.warn("Skipping image in canvas render", e);
              }
          }

          // 3. TABLE / CUSTOM NODES (Placeholders)
          else if (['table', 'mathNode', 'mermaidNode', 'chart', 'codeBlock'].includes(node.type)) {
              let label = `[Elemento Complexo: ${node.type}]`;
              if (node.type === 'table') label = '[Tabela - Visualização simplificada indisponível no PDF]';
              if (node.type === 'mathNode') label = `[Fórmula: ${node.attrs?.latex || 'LaTeX'}]`;
              if (node.type === 'codeBlock') label = `[Código: ${node.attrs?.language || 'Texto'}]`;

              currentPage.drawText(label, {
                  x: margins.left,
                  y: yPosition,
                  size: 10,
                  font: timesItalic,
                  color: rgb(0.4, 0.4, 0.4)
              });
              yPosition -= 24;
              if (yPosition < margins.bottom) addNewPage();
          }

      } catch (e) {
          console.warn(`Erro renderizando nó ${node.type} no PDF`, e);
          // Continua
      }
  }

  // Adicionar paginação (como marca d'água no canvas)
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const { width, height } = p.getSize();
      p.drawText(`${i + 1}`, {
          x: width - margins.right,
          y: margins.bottom / 2,
          size: 10,
          font: timesRoman,
          color: rgb(0.5, 0.5, 0.5)
      });
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes as any], { type: 'application/pdf' });
}