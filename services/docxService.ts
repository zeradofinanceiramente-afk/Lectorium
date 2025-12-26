
import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  HeadingLevel, 
  AlignmentType, 
  UnderlineType, 
  ImageRun, 
  BorderStyle, 
  PageOrientation, 
  CommentReference,
  LevelFormat,
  PageBreak,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  Header,
  Footer,
  PageNumber,
  TextWrappingType,
  TextWrappingSide
} from "docx";
import JSZip from "jszip";
import { MIME_TYPES, Reference } from "../types";
import { PageSettings } from "../components/doc/modals/PageSetupModal";
import { PAPER_SIZES } from "../components/doc/constants";
import { CommentData } from "../components/doc/CommentsSidebar";

// --- HELPERS ---

const base64ToUint8Array = (base64String: string) => {
    try {
        const base64 = base64String.split(',')[1] || base64String;
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    } catch (e) {
        console.error("Error converting base64", e);
        return new Uint8Array();
    }
};

// 1cm = 566.929 twips. Word exige INTEIROS.
const cmToTwips = (cm: number) => Math.round(cm * 566.929);

// Parsing de tamanho seguro
const sizeToTwips = (sizeStr: string | null): number => {
    if (!sizeStr) return 0;
    let val = 0;
    if (typeof sizeStr === 'number') val = sizeStr;
    else if (sizeStr.endsWith('pt')) val = parseFloat(sizeStr) * 20;
    else if (sizeStr.endsWith('px')) val = parseFloat(sizeStr) * 15;
    else val = parseFloat(sizeStr) * 15; // Fallback assume px
    
    return Math.round(val);
};

const mapAlignment = (align: string): any => {
  switch (align) {
    case 'center': return AlignmentType.CENTER;
    case 'right': return AlignmentType.RIGHT;
    case 'justify': return AlignmentType.JUSTIFIED;
    default: return AlignmentType.LEFT;
  }
};

// Word exige Hex sem '#'. Ex: "FF0000"
const sanitizeColor = (color: string | null | undefined): string | undefined => {
    if (!color || color === 'transparent' || color === 'auto') return undefined;
    return color.replace('#', '').toUpperCase();
};

/**
 * Processamento de Imagem com Crop via Canvas
 */
const processImageForDocx = async (
    base64Src: string, 
    crop: { top: number, right: number, bottom: number, left: number } | null,
    targetWidth?: number,
    targetHeight?: number
): Promise<{ buffer: Uint8Array, width: number, height: number }> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                resolve({ 
                    buffer: base64ToUint8Array(base64Src), 
                    width: Math.round(targetWidth || img.width), 
                    height: Math.round(targetHeight || (img.height * ((targetWidth || img.width) / img.width))) 
                });
                return;
            }

            let sx = 0, sy = 0, sw = img.width, sh = img.height;

            if (crop && (crop.top > 0 || crop.bottom > 0 || crop.left > 0 || crop.right > 0)) {
                sx = img.width * (crop.left / 100);
                sy = img.height * (crop.top / 100);
                sw = img.width * (1 - (crop.left + crop.right) / 100);
                sh = img.height * (1 - (crop.top + crop.bottom) / 100);
            }

            canvas.width = Math.floor(sw);
            canvas.height = Math.floor(sh);

            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

            const aspectRatio = sw / sh;
            let finalWidth = targetWidth || 400;
            let finalHeight = targetHeight;

            if (!finalHeight) {
                finalHeight = finalWidth / aspectRatio;
            } else if (!targetWidth) {
                finalWidth = finalHeight * aspectRatio;
            }

            canvas.toBlob((blob) => {
                if (blob) {
                    blob.arrayBuffer().then(buffer => {
                        resolve({
                            buffer: new Uint8Array(buffer),
                            width: Math.round(finalWidth),
                            height: Math.round(finalHeight!)
                        });
                    });
                } else {
                    reject(new Error("Canvas to Blob failed"));
                }
            }, 'image/png');
        };
        img.onerror = (e) => reject(e);
        img.src = base64Src;
    });
};

const processTextNode = (node: any, comments: CommentData[] = []): (TextRun | CommentReference)[] => {
  const marks = node.marks || [];
  const isBold = marks.some((m: any) => m.type === 'bold');
  const isItalic = marks.some((m: any) => m.type === 'italic');
  const isUnderline = marks.some((m: any) => m.type === 'underline');
  const isStrike = marks.some((m: any) => m.type === 'strike');
  const isSubscript = marks.some((m: any) => m.type === 'subscript');
  const isSuperscript = marks.some((m: any) => m.type === 'superscript');
  
  const textStyle = marks.find((m: any) => m.type === 'textStyle');
  const highlight = marks.find((m: any) => m.type === 'highlight');
  
  let color = sanitizeColor(textStyle?.attrs?.color) || "000000";
  
  // Font Size: Tiptap px/pt -> Word half-points
  let size = 24; // Default 12pt (24 half-points)
  if (textStyle?.attrs?.fontSize) {
      let val = parseFloat(textStyle.attrs.fontSize);
      if (textStyle.attrs.fontSize.includes('px')) val = val * 0.75; 
      if (!isNaN(val)) size = Math.round(val * 2);
  }

  let font = "Times New Roman";
  if (textStyle?.attrs?.fontFamily) {
      font = textStyle.attrs.fontFamily.replace(/['"]/g, '');
  }

  const commentMark = marks.find((m: any) => m.type === 'comment');
  
  const trOptions: any = {
    text: node.text,
    bold: isBold,
    italics: isItalic,
    underline: isUnderline ? { type: UnderlineType.SINGLE } : undefined,
    strike: isStrike,
    subScript: isSubscript,
    superScript: isSuperscript,
    color: color,
    size: size,
    font: font
  };

  if (highlight?.attrs?.color) {
      trOptions.highlight = sanitizeColor(highlight.attrs.color);
  }

  const tr = new TextRun(trOptions);

  if (commentMark) {
      const idStr = commentMark.attrs.commentId;
      const index = comments.findIndex(c => c.id === idStr);
      if (index !== -1) {
          const numericId = index + 1;
          return [tr, new CommentReference(numericId)];
      }
  }

  return [tr];
};

/**
 * Process a list recursively to flatten Tiptap nested structure into DOCX Paragraphs with numbering levels
 */
const processList = (
    listNode: any, 
    level: number, 
    isOrdered: boolean, 
    comments: CommentData[], 
    docChildren: Paragraph[]
) => {
    const ref = isOrdered ? "default-ordered" : "default-bullet";

    if (listNode.content) {
        listNode.content.forEach((listItem: any) => {
            if (listItem.type === 'listItem' && listItem.content) {
                listItem.content.forEach((child: any) => {
                    if (child.type === 'paragraph') {
                        const children = (child.content || []).flatMap((n: any) => processTextNode(n, comments));
                        docChildren.push(new Paragraph({
                            children: children,
                            numbering: { reference: ref, level: level },
                            spacing: { after: 0 }
                        }));
                    } else if (child.type === 'bulletList' || child.type === 'orderedList') {
                        processList(child, level + 1, child.type === 'orderedList', comments, docChildren);
                    }
                });
            }
        });
    }
};

/**
 * Cria um objeto Paragraph do DOCX a partir de um nó Tiptap
 */
const createDocxParagraph = (node: any, comments: CommentData[]): Paragraph => {
    const spacing: any = {};
    if (node.attrs?.marginBottom) spacing.after = sizeToTwips(node.attrs.marginBottom);
    if (node.attrs?.marginTop) spacing.before = sizeToTwips(node.attrs.marginTop);
    if (node.attrs?.lineHeight) {
        spacing.line = Math.round(parseFloat(node.attrs.lineHeight) * 240);
        spacing.lineRule = "auto";
    }

    const indent: any = {};
    if (node.attrs?.marginLeft) indent.left = sizeToTwips(node.attrs.marginLeft);
    if (node.attrs?.marginRight) indent.right = sizeToTwips(node.attrs.marginRight);
    if (node.attrs?.textIndent) indent.firstLine = sizeToTwips(node.attrs.textIndent);

    const paraOptions: any = {
        children: [],
        alignment: mapAlignment(node.attrs?.textAlign),
        spacing: spacing,
        indent: indent,
        keepNext: node.attrs?.keepWithNext,
        keepLines: node.attrs?.keepLinesTogether,
        pageBreakBefore: node.attrs?.pageBreakBefore,
        widowControl: node.attrs?.widowControl !== false,
    };

    const children = (node.content || []).flatMap((n: any) => {
        if (n.type === 'citation') {
            return [new TextRun({ text: n.attrs.label + ' ', bold: true, color: "555555" })];
        }
        if (n.type === 'text') {
            return processTextNode(n, comments);
        }
        return [];
    });
    paraOptions.children = children;

    if (node.type === 'heading') {
        paraOptions.heading = node.attrs?.level === 1 ? HeadingLevel.HEADING_1 :
                              node.attrs?.level === 2 ? HeadingLevel.HEADING_2 :
                              node.attrs?.level === 3 ? HeadingLevel.HEADING_3 :
                              HeadingLevel.HEADING_1;
        if (!spacing.after) paraOptions.spacing.after = 120;
        if (!spacing.before) paraOptions.spacing.before = 240;
    }

    if (node.attrs?.styleId) {
        paraOptions.style = node.attrs.styleId;
    }

    return new Paragraph(paraOptions);
};

export const generateDocxBlob = async (
    editorJSON: any, 
    pageSettings?: PageSettings, 
    comments: CommentData[] = [], 
    references: Reference[] = [], 
    originalZip?: JSZip
): Promise<Blob> => {
  const docChildren: (Paragraph | Table)[] = [];
  const content = editorJSON.content || [];

  for (const node of content) {
    try {
        // --- PARAGRAPH & HEADING ---
        if (node.type === 'paragraph' || node.type === 'heading') {
            docChildren.push(createDocxParagraph(node, comments));
        }
        // --- TABLE ---
        else if (node.type === 'table') {
            const rows = (node.content || []).map((row: any) => {
                const cells = (row.content || []).map((cell: any) => {
                    const cellChildren: Paragraph[] = [];
                    // Process contents of cell
                    (cell.content || []).forEach((cellNode: any) => {
                        if (cellNode.type === 'paragraph' || cellNode.type === 'heading') {
                            cellChildren.push(createDocxParagraph(cellNode, comments));
                        } else if (cellNode.type === 'image') {
                            // Imagens dentro da tabela - suporte básico
                            cellChildren.push(new Paragraph({
                                children: [new TextRun("[Imagem]")]
                            }));
                        } else {
                            // Fallback para conteúdo desconhecido
                            cellChildren.push(new Paragraph(cellNode.type || ''));
                        }
                    });

                    // Ensure cell is not empty
                    if (cellChildren.length === 0) {
                        cellChildren.push(new Paragraph(""));
                    }

                    const shading = cell.attrs?.backgroundColor 
                        ? { fill: sanitizeColor(cell.attrs.backgroundColor), type: ShadingType.CLEAR, color: "auto" } 
                        : undefined;

                    return new TableCell({
                        children: cellChildren,
                        columnSpan: cell.attrs?.colspan || 1,
                        rowSpan: cell.attrs?.rowspan || 1,
                        shading: shading
                    });
                });
                return new TableRow({ children: cells });
            });

            docChildren.push(new Table({
                rows: rows,
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                    top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                    bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                    left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                    right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                    insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                    insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                }
            }));
        }
        // --- LISTS (Robust Handling) ---
        else if (node.type === 'bulletList' || node.type === 'orderedList') {
            const listItems: Paragraph[] = [];
            processList(node, 0, node.type === 'orderedList', comments, listItems);
            docChildren.push(...listItems);
        }
        // --- IMAGE ---
        else if (node.type === 'image') {
           if (node.attrs?.src && node.attrs.src.startsWith('data:image')) {
               try {
                   const requestedWidth = node.attrs.width ? parseInt(node.attrs.width) : undefined;
                   const requestedHeight = node.attrs.height ? parseInt(node.attrs.height) : undefined;
                   const cropData = node.attrs.crop || null;

                   const { buffer, width, height } = await processImageForDocx(
                       node.attrs.src,
                       cropData,
                       requestedWidth,
                       requestedHeight
                   );

                   const alignment = node.attrs?.textAlign || node.attrs?.align || 'center';

                   docChildren.push(new Paragraph({
                       children: [
                           new ImageRun({
                               data: buffer,
                               transformation: {
                                   width: Math.round(width),
                                   height: Math.round(height)
                               }
                           })
                       ],
                       alignment: mapAlignment(alignment)
                   }));
               } catch (e) {
                   console.warn("Image export failed", e);
               }
           }
        }
        // --- BLOCKQUOTE ---
        else if (node.type === 'blockquote') {
            const children = (node.content || []).flatMap((p: any) => (p.content || []).flatMap((n: any) => processTextNode(n, comments)));
            docChildren.push(new Paragraph({
                children: children,
                indent: { left: 720 }, // 0.5 inch
                style: "Quote"
            }));
        }
        // --- PAGE BREAK ---
        else if (node.type === 'pageBreak') {
            if (docChildren.length > 0 && docChildren[docChildren.length-1] instanceof Paragraph) {
                (docChildren[docChildren.length-1] as Paragraph).addChildElement(new PageBreak());
            } else {
                docChildren.push(new Paragraph({ children: [new PageBreak()] }));
            }
        }
        // --- CUSTOM NODES (Math, Code, Chart, etc) ---
        else if (node.type === 'codeBlock') {
            // Render as monospaced paragraph
            const codeText = node.content?.map((t: any) => t.text).join('') || '';
            const lines = codeText.split('\n');
            lines.forEach((line: string) => {
                docChildren.push(new Paragraph({
                    children: [new TextRun({ text: line, font: "Courier New", size: 20 })],
                    spacing: { after: 0, line: 240 }
                }));
            });
        }
        else if (node.type === 'mathNode') {
            docChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: `[Fórmula: ${node.attrs?.latex || 'LaTeX'}]`, color: "555555", italics: true })
                ],
                alignment: AlignmentType.CENTER,
                spacing: { before: 240, after: 240 }
            }));
        }
        else if (node.type === 'mermaidNode') {
            docChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: `[Diagrama Mermaid]`, color: "555555", bold: true })
                ],
                alignment: AlignmentType.CENTER,
                spacing: { before: 240, after: 240 }
            }));
        }
        else if (node.type === 'chart') {
            docChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: `[Gráfico: ${node.attrs?.title || 'Dados'}]`, color: "555555", bold: true })
                ],
                alignment: AlignmentType.CENTER,
                spacing: { before: 240, after: 240 }
            }));
        }
        else if (node.type === 'qrCodeNode') {
            docChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: `[QR Code: ${node.attrs?.value}]`, color: "555555", italics: true })
                ],
                alignment: AlignmentType.CENTER
            }));
        }
    } catch (e) {
        console.warn(`Erro exportando nó tipo ${node.type}`, e);
        // Continua para o próximo nó sem quebrar o documento inteiro
    }
  }

  // --- Page Config ---
  let pageProperties: any = {};
  
  // Header and Footer Configuration
  const headers: any = {};
  const footers: any = {};

  if (pageSettings) {
      let size = PAPER_SIZES['a4'];
      if (PAPER_SIZES[pageSettings.paperSize]) {
          size = PAPER_SIZES[pageSettings.paperSize];
      }
      
      const widthTwips = cmToTwips(size.widthCm);
      const heightTwips = cmToTwips(size.heightCm);

      // Create Headers if text exists or page number is enabled
      const headerChildren: Paragraph[] = [];
      const footerChildren: Paragraph[] = [];

      // HEADERS
      if (pageSettings.headerText) {
          headerChildren.push(new Paragraph({
              children: [new TextRun(pageSettings.headerText)],
              alignment: AlignmentType.CENTER
          }));
      }
      
      // Page Number (Header Position) - Simplified support for export (startAt)
      if (pageSettings.pageNumber?.enabled && pageSettings.pageNumber.position === 'header') {
          const alignment = pageSettings.pageNumber.alignment === 'left' ? AlignmentType.LEFT :
                            pageSettings.pageNumber.alignment === 'right' ? AlignmentType.RIGHT : AlignmentType.CENTER;
          
          headerChildren.push(new Paragraph({
              children: [
                  new TextRun({
                      children: [PageNumber.CURRENT],
                  }),
              ],
              alignment: alignment,
          }));
      }

      if (headerChildren.length > 0) {
          headers.default = new Header({ children: headerChildren });
      }

      // FOOTERS
      if (pageSettings.footerText) {
          footerChildren.push(new Paragraph({
              children: [new TextRun(pageSettings.footerText)],
              alignment: AlignmentType.CENTER
          }));
      }
      // Page Number (Footer Position)
      if (pageSettings.pageNumber?.enabled && pageSettings.pageNumber.position === 'footer') {
          const alignment = pageSettings.pageNumber.alignment === 'left' ? AlignmentType.LEFT :
                            pageSettings.pageNumber.alignment === 'right' ? AlignmentType.RIGHT : AlignmentType.CENTER;
          
          footerChildren.push(new Paragraph({
              children: [
                  new TextRun({
                      children: [PageNumber.CURRENT],
                  }),
              ],
              alignment: alignment,
          }));
      }

      if (footerChildren.length > 0) {
          footers.default = new Footer({ children: footerChildren });
      }

      pageProperties = {
          page: {
              size: {
                  width: widthTwips,
                  height: heightTwips,
                  orientation: pageSettings.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT
              },
              margin: {
                  top: cmToTwips(pageSettings.marginTop),
                  bottom: cmToTwips(pageSettings.marginBottom),
                  left: cmToTwips(pageSettings.marginLeft),
                  right: cmToTwips(pageSettings.marginRight)
              },
              // A simple "startAt" property handles basic re-numbering.
              // Handling "displayFromPage" (visibility) requires complex section breaks which are risky to auto-generate here.
              // For DOCX export, we assume standard flow or startAt override.
              pageNumbers: pageSettings.pageNumber?.startAt ? {
                  start: pageSettings.pageNumber.startAt,
                  formatType: "decimal"
              } : undefined
          }
      };
  }

  const docComments = comments.map((c, index) => ({
      id: index + 1,
      author: c.author,
      date: new Date(c.createdAt),
      children: [
          new Paragraph({
              children: [new TextRun(c.text)]
          })
      ]
  }));

  const doc = new Document({
    comments: {
        children: docComments
    },
    numbering: {
        config: [
            {
                reference: "default-bullet",
                levels: [
                    { level: 0, format: LevelFormat.BULLET, text: "\u25CF", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
                    { level: 1, format: LevelFormat.BULLET, text: "\u25CB", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
                    { level: 2, format: LevelFormat.BULLET, text: "\u25A0", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 2160, hanging: 360 } } } }
                ]
            },
            {
                reference: "default-ordered",
                levels: [
                    { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
                    { level: 1, format: LevelFormat.LOWER_LETTER, text: "%2)", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1440, hanging: 360 } } } }
                ]
            }
        ]
    },
    styles: {
        paragraphStyles: [
            {
                id: "Normal",
                name: "Normal",
                run: { font: "Times New Roman", size: 24, color: "000000" },
                paragraph: { spacing: { line: 360 } }, // 1.5 spacing
            },
            {
                id: "Heading1",
                name: "Heading 1",
                run: { font: "Times New Roman", size: 32, bold: true, color: "2E74B5" },
                paragraph: { spacing: { before: 240, after: 120 } }
            },
            {
                id: "Heading2",
                name: "Heading 2",
                run: { font: "Times New Roman", size: 26, bold: true, color: "2E74B5" },
                paragraph: { spacing: { before: 240, after: 120 } }
            },
            {
                id: "Quote",
                name: "Quote",
                paragraph: { indent: { left: 720 }, spacing: { after: 200 } },
                run: { italics: true, font: "Times New Roman", size: 22 }
            }
        ]
    },
    sections: [{
      properties: pageProperties,
      headers: headers,
      footers: footers,
      children: docChildren,
    }],
  });

  const standardBlob = await Packer.toBlob(doc);

  try {
      // Re-hydrate custom state into the ZIP for next load
      const zip = await JSZip.loadAsync(standardBlob);
      zip.file("tiptap-state.json", JSON.stringify({ ...editorJSON, meta: { comments, references } }));
      
      return await zip.generateAsync({ type: "blob", mimeType: MIME_TYPES.DOCX });
  } catch (e) {
      console.warn("Falha ao injetar estado extendido no DOCX", e);
      return standardBlob;
  }
};

export const createEmptyDocxBlob = async (): Promise<Blob> => {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [new Paragraph("")],
    }],
  });
  return await Packer.toBlob(doc);
};
