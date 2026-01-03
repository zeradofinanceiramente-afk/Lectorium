
import JSZip from 'jszip';
import { StyleMap } from './stylesParser';
import { CM_TO_TWIPS, emuToPx, getVal, halfPtToPt, hexColor, parseXml, twipsToPt, twipsToPx } from './utils';
import { PageSettings, PageNumberConfig } from '../../components/doc/modals/PageSetupModal';
import { CommentData } from '../../components/doc/CommentsSidebar';

// Contexto passado durante a travessia
interface ParseContext {
  zip: JSZip;
  styles: StyleMap;
  commentsMap: Record<string, CommentData>;
  relsMap: Record<string, string>; // rId -> target (image path)
  activeCommentIds: Set<string>; // Rastreia comentários abertos durante a leitura linear
  numbering?: any; // Future: Ordered lists
}

export async function parseDocument(
  docXml: string, 
  context: ParseContext
): Promise<{ content: any[], settings?: PageSettings }> {
  const doc = parseXml(docXml);
  const body = doc.getElementsByTagName("w:body")[0];
  
  if (!body) throw new Error("Documento DOCX inválido: sem corpo.");

  const content: any[] = [];
  
  // 1. Traverse Body Children (Paragraphs and Tables)
  for (let i = 0; i < body.childNodes.length; i++) {
    const node = body.childNodes[i] as Element;
    
    if (node.nodeName === "w:p") {
      const pNode = await parseParagraph(node, context);
      if (Array.isArray(pNode)) {
          // Se o parágrafo foi quebrado (ex: continha pageBreak), adiciona os múltiplos nós
          content.push(...pNode);
      } else if (pNode) {
          content.push(pNode);
      }
    } else if (node.nodeName === "w:tbl") {
      const tNode = await parseTable(node, context);
      if (tNode) content.push(tNode);
    } else if (node.nodeName === "w:sectPr") {
       // Seções isoladas às vezes contêm quebras, mas geralmente são propriedades
    }
  }

  // 2. Extract Page Settings from the *last* sectPr (Document Defaults)
  const sectPr = body.getElementsByTagName("w:sectPr");
  const lastSect = sectPr[sectPr.length - 1];
  let settings: PageSettings | undefined = undefined;

  if (lastSect) {
    settings = await parseSectionProperties(lastSect, context);
  }

  return { content, settings };
}

// Helper para ler texto de arquivos XML auxiliares (header/footer)
async function loadHeaderFooterText(zip: JSZip, path: string): Promise<string> {
    let fullPath = path;
    // Normalização básica de caminho relativa a word/
    if (!path.startsWith("word/") && !path.startsWith("/")) {
        fullPath = "word/" + path;
    }
    if (fullPath.startsWith("/")) fullPath = fullPath.substring(1);

    try {
        const file = zip.file(fullPath);
        if (!file) return "";
        
        const xmlStr = await file.async("string");
        const doc = parseXml(xmlStr);
        let text = "";
        
        // Extrai parágrafos para manter quebras de linha
        const paragraphs = doc.getElementsByTagName("w:p");
        for (let i = 0; i < paragraphs.length; i++) {
            const p = paragraphs[i];
            
            // Check for PAGE field to strip it from pure text content
            // We handle page numbers separately via config
            const instrTexts = p.getElementsByTagName("w:instrText");
            let isPageNum = false;
            for(let k=0; k<instrTexts.length; k++) {
                if (instrTexts[k].textContent?.includes("PAGE")) {
                    isPageNum = true;
                    break;
                }
            }
            if (isPageNum) continue; // Skip raw page number text in header text

            const tNodes = p.getElementsByTagName("w:t");
            let line = "";
            for (let j = 0; j < tNodes.length; j++) {
                line += tNodes[j].textContent || "";
            }
            if (line.trim()) text += line + "\n";
        }
        return text.trim();
    } catch (e) {
        console.warn("Falha ao ler header/footer:", path);
        return "";
    }
}

/**
 * Analisa o XML do Header/Footer para detectar se existe um campo de numeração de página.
 * Retorna a configuração detectada (alinhamento).
 */
async function detectPageNumberInXml(zip: JSZip, path: string): Promise<Partial<PageNumberConfig> | null> {
    let fullPath = path;
    if (!path.startsWith("word/") && !path.startsWith("/")) {
        fullPath = "word/" + path;
    }
    if (fullPath.startsWith("/")) fullPath = fullPath.substring(1);

    try {
        const file = zip.file(fullPath);
        if (!file) return null;

        const xmlStr = await file.async("string");
        const doc = parseXml(xmlStr);
        
        // Procurar por instrução PAGE
        // Formato 1: <w:instrText>PAGE</w:instrText>
        // Formato 2: <w:fldSimple w:instr="PAGE">
        const instrTexts = Array.from(doc.getElementsByTagName("w:instrText"));
        const simpleFields = Array.from(doc.getElementsByTagName("w:fldSimple"));
        
        let foundNode: Element | null = null;

        // Check instrText
        for (const node of instrTexts) {
            if (node.textContent?.includes("PAGE")) {
                foundNode = node;
                break;
            }
        }

        // Check fldSimple if not found
        if (!foundNode) {
            for (const node of simpleFields) {
                if (node.getAttribute("w:instr")?.includes("PAGE")) {
                    foundNode = node;
                    break;
                }
            }
        }

        if (foundNode) {
            // Encontrar o parágrafo pai para determinar o alinhamento
            let parent = foundNode.parentElement;
            while (parent && parent.nodeName !== "w:p") {
                parent = parent.parentElement;
            }

            let alignment: 'left' | 'center' | 'right' = 'left'; // Default Word

            if (parent) {
                const pPr = parent.getElementsByTagName("w:pPr")[0];
                if (pPr) {
                    const jc = pPr.getElementsByTagName("w:jc")[0];
                    if (jc) {
                        const val = getVal(jc);
                        if (val === 'center') alignment = 'center';
                        else if (val === 'right') alignment = 'right';
                    }
                }
            }

            return {
                enabled: true,
                alignment: alignment,
                displayFromPage: 1, // Default assume 1
                startAt: 1
            };
        }

    } catch (e) {
        console.warn("Falha ao detectar numeração de página:", e);
    }
    return null;
}

async function parseSectionProperties(sectPr: Element, ctx: ParseContext): Promise<PageSettings> {
  const pgSz = sectPr.getElementsByTagName("w:pgSz")[0];
  const pgMar = sectPr.getElementsByTagName("w:pgMar")[0];

  let widthTwips = 11906; // A4 Default
  let heightTwips = 16838;
  let orientation: 'portrait' | 'landscape' = 'portrait';

  if (pgSz) {
    widthTwips = parseInt(getVal(pgSz, "w:w") || "11906");
    heightTwips = parseInt(getVal(pgSz, "w:h") || "16838");
    if (getVal(pgSz, "w:orient") === "landscape") orientation = "landscape";
  }

  let mt = 2.5, mb = 2.5, ml = 3.0, mr = 3.0;

  if (pgMar) {
    const top = parseInt(getVal(pgMar, "w:top") || "1417");
    const bottom = parseInt(getVal(pgMar, "w:bottom") || "1417");
    const left = parseInt(getVal(pgMar, "w:left") || "1701");
    const right = parseInt(getVal(pgMar, "w:right") || "1701");

    // 567 twips ~= 1cm
    mt = top / CM_TO_TWIPS;
    mb = bottom / CM_TO_TWIPS;
    ml = left / CM_TO_TWIPS;
    mr = right / CM_TO_TWIPS;
  }

  // Detect Paper Size Name
  let paperSize = 'a4';
  if (Math.abs(widthTwips - 12240) < 100) paperSize = 'letter';

  // --- HEADER & FOOTER EXTRACTION ---
  let headerText = "";
  let footerText = "";
  let pageNumberConfig: PageNumberConfig | undefined = undefined;

  const headers = sectPr.getElementsByTagName("w:headerReference");
  const footers = sectPr.getElementsByTagName("w:footerReference");

  const getRefId = (nodes: HTMLCollectionOf<Element>) => {
      for (let i = 0; i < nodes.length; i++) {
          if (getVal(nodes[i], "w:type") === "default") {
              return getVal(nodes[i], "r:id");
          }
      }
      // Fallback: se tiver apenas um, usa ele
      if (nodes.length === 1) return getVal(nodes[0], "r:id");
      return null;
  };

  const headerId = getRefId(headers);
  if (headerId && ctx.relsMap[headerId]) {
      const path = ctx.relsMap[headerId];
      headerText = await loadHeaderFooterText(ctx.zip, path);
      
      // Check for page numbers in Header
      const detectedPn = await detectPageNumberInXml(ctx.zip, path);
      if (detectedPn) {
          pageNumberConfig = {
              enabled: true,
              position: 'header',
              alignment: detectedPn.alignment || 'right',
              displayFromPage: 1,
              startAt: 1
          };
      }
  }

  const footerId = getRefId(footers);
  if (footerId && ctx.relsMap[footerId]) {
      const path = ctx.relsMap[footerId];
      footerText = await loadHeaderFooterText(ctx.zip, path);

      // Check for page numbers in Footer (only if not found in header)
      if (!pageNumberConfig) {
          const detectedPn = await detectPageNumberInXml(ctx.zip, path);
          if (detectedPn) {
              pageNumberConfig = {
                  enabled: true,
                  position: 'footer',
                  alignment: detectedPn.alignment || 'center',
                  displayFromPage: 1,
                  startAt: 1
              };
          }
      }
  }

  // Extract Page Start (pgNumType)
  const pgNumType = sectPr.getElementsByTagName("w:pgNumType")[0];
  if (pgNumType && pageNumberConfig) {
      const start = getVal(pgNumType, "w:start");
      if (start) {
          pageNumberConfig.startAt = parseInt(start);
      }
  }

  return {
    paperSize,
    orientation,
    pageColor: '#ffffff',
    marginTop: mt,
    marginBottom: mb,
    marginLeft: ml,
    marginRight: mr,
    headerText: headerText || undefined,
    footerText: footerText || undefined,
    pageNumber: pageNumberConfig
  };
}

// Helper para verificar booleanos no XML do Word
// Word: <tag w:val="on"/> ou <tag/> = true. <tag w:val="off"/> = false.
function isBoolPropertyOn(element: Element, tagName: string): boolean {
    const nodes = element.getElementsByTagName(tagName);
    if (nodes.length === 0) return false;
    
    const val = getVal(nodes[0]);
    // Se a tag existe e não tem valor, é true. Se tem valor, checamos se não é negativo.
    if (val === null) return true;
    return val !== '0' && val !== 'false' && val !== 'off';
}

// Helper to apply active comments to a Tiptap node (or array of nodes)
function applyActiveComments(nodes: any | any[], activeIds: Set<string>) {
    if (activeIds.size === 0) return;
    
    const targetNodes = Array.isArray(nodes) ? nodes : [nodes];
    
    targetNodes.forEach(node => {
        // Only apply comments to text nodes
        if (node.type === 'text') {
            if (!node.marks) node.marks = [];
            
            // Add a mark for each active comment
            activeIds.forEach(commentId => {
                // Avoid duplicates if parsing logic is re-entrant
                const exists = node.marks.some((m: any) => m.type === 'comment' && m.attrs?.commentId === commentId);
                if (!exists) {
                    node.marks.push({
                        type: 'comment',
                        attrs: { commentId }
                    });
                }
            });
        }
    });
}

// --- PARAGRAPH PARSER (High Fidelity) ---
// Returns single Node or Array of Nodes (if split by pageBreak)
async function parseParagraph(p: Element, ctx: ParseContext): Promise<any | any[]> {
  const pPr = p.getElementsByTagName("w:pPr")[0];
  const attrs: any = {};
  let type = 'paragraph';

  // 1. Resolve Style
  let styleId = 'Normal';
  if (pPr) {
    const pStyle = pPr.getElementsByTagName("w:pStyle")[0];
    if (pStyle) {
      styleId = getVal(pStyle) || 'Normal';
      attrs.styleId = styleId;
    }
  }

  // Inherit properties from style definition
  const styleDef = ctx.styles[styleId];
  if (styleDef) {
      if (styleDef.isHeading) {
          type = 'heading';
          attrs.level = styleDef.level;
      }
      if (styleDef.textAlign) attrs.textAlign = styleDef.textAlign;
      if (styleDef.marginTop) attrs.marginTop = styleDef.marginTop;
      if (styleDef.marginBottom) attrs.marginBottom = styleDef.marginBottom;
      if (styleDef.lineHeight) attrs.lineHeight = styleDef.lineHeight;
  }

  // 2. Parse Direct Paragraph Properties
  if (pPr) {
    // Alignment
    const jc = pPr.getElementsByTagName("w:jc")[0];
    if (jc) {
        const val = getVal(jc);
        if (val === 'center') attrs.textAlign = 'center';
        if (val === 'right') attrs.textAlign = 'right';
        if (val === 'both' || val === 'distribute') attrs.textAlign = 'justify';
        if (val === 'left') attrs.textAlign = 'left';
    }

    // Spacing (CRITICAL FIX FOR LINE HEIGHT)
    const spacing = pPr.getElementsByTagName("w:spacing")[0];
    if (spacing) {
        const before = spacing.getAttribute("w:before");
        const after = spacing.getAttribute("w:after");
        const line = spacing.getAttribute("w:line");
        const lineRule = spacing.getAttribute("w:lineRule");

        if (before) attrs.marginTop = twipsToPt(before) + "pt";
        if (after) attrs.marginBottom = twipsToPt(after) + "pt";
        
        if (line) {
            const lineVal = parseInt(line);
            if (lineRule === 'exact') {
                attrs.lineHeight = (lineVal / 240).toFixed(2); 
            } else if (lineRule === 'atLeast') {
                attrs.lineHeight = (lineVal / 240).toFixed(2);
            } else {
                attrs.lineHeight = (lineVal / 240).toFixed(2);
            }
        }
    }

    // Indentation (Complex)
    const ind = pPr.getElementsByTagName("w:ind")[0];
    if (ind) {
        const left = ind.getAttribute("w:left") || ind.getAttribute("w:start");
        const right = ind.getAttribute("w:right") || ind.getAttribute("w:end");
        const firstLine = ind.getAttribute("w:firstLine");
        const hanging = ind.getAttribute("w:hanging");
        
        let leftPx = twipsToPx(left) || 0;
        let rightPx = twipsToPx(right) || 0;
        
        if (hanging) {
            const hangPx = twipsToPx(hanging) || 0;
            attrs.textIndent = `-${hangPx}px`;
        } else if (firstLine) {
            attrs.textIndent = `${twipsToPx(firstLine)}px`;
        }

        if (leftPx > 0) attrs.marginLeft = `${leftPx}px`;
        if (rightPx > 0) attrs.marginRight = `${rightPx}px`;
    }

    // Background Color (Shading)
    const shd = pPr.getElementsByTagName("w:shd")[0];
    if (shd) {
        const fill = getVal(shd, "w:fill");
        if (fill && fill !== 'auto') attrs.backgroundColor = `#${fill}`;
    }

    // Pagination - Use helper strict boolean check
    if (isBoolPropertyOn(pPr, "w:keepNext")) attrs.keepWithNext = true;
    if (isBoolPropertyOn(pPr, "w:keepLines")) attrs.keepLinesTogether = true;
    
    if (isBoolPropertyOn(pPr, "w:pageBreakBefore")) {
        attrs.pageBreakBefore = true;
    }
  }

  // 3. Children (Runs, Hyperlinks, Comments)
  const nodes: any[] = [];
  
  // Helper to push content
  const pushContent = (content: any[]) => {
      if (content.length > 0) {
          nodes.push({
              type,
              attrs: { ...attrs },
              content: [...content]
          });
      } else {
          // Empty paragraph
          nodes.push({ type, attrs: { ...attrs } });
      }
  };

  let currentRunBuffer: any[] = [];

  for (let i = 0; i < p.childNodes.length; i++) {
    const child = p.childNodes[i] as Element;
    
    // --- COMMENT RANGES ---
    if (child.nodeName === "w:commentRangeStart") {
        const id = child.getAttribute("w:id");
        if (id) ctx.activeCommentIds.add(id);
    } 
    else if (child.nodeName === "w:commentRangeEnd") {
        const id = child.getAttribute("w:id");
        if (id) ctx.activeCommentIds.delete(id);
    }
    // --- RUNS ---
    else if (child.nodeName === "w:r") {
      const parsed = await parseRun(child, ctx, styleDef);
      
      // Se parseRun retornar um array, pode conter [run, pageBreak, run...]
      const items = Array.isArray(parsed) ? parsed : [parsed];
      
      for (const item of items) {
          if (!item) continue;

          // Aplica comentários ativos aos nós de texto encontrados neste run
          applyActiveComments(item, ctx.activeCommentIds);

          if (item.type === 'pageBreak') {
              // Flush current buffer into a paragraph
              pushContent(currentRunBuffer);
              currentRunBuffer = [];
              // Add page break as a separate block node
              nodes.push({ type: 'pageBreak' });
          } else {
              currentRunBuffer.push(item);
          }
      }
    } 
    // --- HYPERLINKS ---
    else if (child.nodeName === "w:hyperlink") {
       const rid = getVal(child, "r:id");
       let href = "#";
       if (rid && ctx.relsMap[rid]) {
           href = ctx.relsMap[rid];
           if (!href.startsWith('http') && !href.startsWith('mailto')) href = `http://${href}`;
       }

       for (let k = 0; k < child.childNodes.length; k++) {
           const linkChild = child.childNodes[k] as Element;
           
           // Process comment tags inside hyperlinks too
           if (linkChild.nodeName === "w:commentRangeStart") {
               const id = linkChild.getAttribute("w:id");
               if (id) ctx.activeCommentIds.add(id);
           } 
           else if (linkChild.nodeName === "w:commentRangeEnd") {
               const id = linkChild.getAttribute("w:id");
               if (id) ctx.activeCommentIds.delete(id);
           }
           else if (linkChild.nodeName === "w:r") {
               const parsed = await parseRun(linkChild, ctx, styleDef);
               const items = Array.isArray(parsed) ? parsed : [parsed];
               
               for (const item of items) {
                   if (!item) continue;
                   
                   applyActiveComments(item, ctx.activeCommentIds);

                   if (item.type === 'pageBreak') {
                       pushContent(currentRunBuffer);
                       currentRunBuffer = [];
                       nodes.push({ type: 'pageBreak' });
                   } else {
                       if(!item.marks) item.marks = [];
                       item.marks.push({ type: 'link', attrs: { href } });
                       currentRunBuffer.push(item);
                   }
               }
           }
       }
    }
  }

  // Flush remaining
  if (currentRunBuffer.length > 0 || nodes.length === 0) {
      if (currentRunBuffer.length > 0 || nodes.length === 0) {
          pushContent(currentRunBuffer);
      }
  }

  return nodes.length === 1 ? nodes[0] : nodes;
}

// --- RUN PARSER (Strict Mode - No Soft Breaks) ---
async function parseRun(r: Element, ctx: ParseContext, pStyle?: any): Promise<any | any[]> {
  const rPr = r.getElementsByTagName("w:rPr")[0];
  
  // Check for HARD Breaks FIRST (User hit Ctrl+Enter)
  // Ensure we strictly check for w:type="page"
  const brs = r.getElementsByTagName("w:br");
  const hasPageBreak = Array.from(brs).some(br => br.getAttribute("w:type") === "page");
  
  // IGNORE LastRenderedPageBreak (Soft break from Word). 
  // Trust Tiptap flow instead.
  
  // If strict page break found
  if (hasPageBreak) {
      const parts: any[] = [];
      
      for (let i = 0; i < r.childNodes.length; i++) {
          const child = r.childNodes[i] as Element;
          if (child.nodeName === "w:t") {
              const textNode = await parseTextNode(child, rPr, pStyle);
              if (textNode) parts.push(textNode);
          } else if (child.nodeName === "w:br" && child.getAttribute("w:type") === "page") {
              parts.push({ type: 'pageBreak' });
          } else if (child.nodeName === "w:drawing") {
              const img = await parseDrawing(child, ctx);
              if (img) parts.push(img);
          } else if (child.nodeName === "w:tab") {
              parts.push({ type: 'text', text: '\t' });
          }
      }
      return parts;
  }

  // Normal Run Processing
  const drawing = r.getElementsByTagName("w:drawing")[0];
  if (drawing) return parseDrawing(drawing, ctx);

  const t = r.getElementsByTagName("w:t")[0];
  if (t) return parseTextNode(t, rPr, pStyle);

  // Fallback for simple line breaks (Shift+Enter) - <w:br/> without type="page"
  if (brs.length > 0 && !hasPageBreak) {
      // Check if it's strictly a soft break (no type or type != page)
      // We already filtered page breaks above, so safe to add \n
      return { type: 'text', text: '\n' };
  }
  
  const tab = r.getElementsByTagName("w:tab")[0];
  if (tab) return { type: 'text', text: '\t' };

  return null;
}

// Helper for Text Extraction
async function parseTextNode(t: Element, rPr: Element, pStyle?: any) {
    const text = t.textContent || "";
    if (!text) return null;

    const marks: any[] = [];
    const styleAttrs: any = {};

    // Defaults from Paragraph Style
    if (pStyle) {
        if (pStyle.fontSize) styleAttrs.fontSize = pStyle.fontSize;
        if (pStyle.color) styleAttrs.color = pStyle.color;
        if (pStyle.fontFamily) styleAttrs.fontFamily = pStyle.fontFamily;
        if (pStyle.bold) marks.push({ type: 'bold' });
        if (pStyle.italic) marks.push({ type: 'italic' });
        if (pStyle.underline) marks.push({ type: 'underline' });
    }

    // Direct Formatting
    if (rPr) {
        if (rPr.getElementsByTagName("w:b").length > 0) {
            if (!marks.some(m => m.type === 'bold')) marks.push({ type: 'bold' });
        }
        if (rPr.getElementsByTagName("w:i").length > 0) {
            if (!marks.some(m => m.type === 'italic')) marks.push({ type: 'italic' });
        }
        if (rPr.getElementsByTagName("w:u").length > 0) {
            if (!marks.some(m => m.type === 'underline')) marks.push({ type: 'underline' });
        }
        if (rPr.getElementsByTagName("w:strike").length > 0) marks.push({ type: 'strike' });
        
        const sz = rPr.getElementsByTagName("w:sz")[0];
        if (sz) styleAttrs.fontSize = halfPtToPt(getVal(sz));

        const col = rPr.getElementsByTagName("w:color")[0];
        if (col) styleAttrs.color = hexColor(getVal(col));

        const rFonts = rPr.getElementsByTagName("w:rFonts")[0];
        if (rFonts) {
            const ascii = rFonts.getAttribute("w:ascii");
            const hAnsi = rFonts.getAttribute("w:hAnsi");
            styleAttrs.fontFamily = ascii || hAnsi;
        }
        
        const highlight = rPr.getElementsByTagName("w:highlight")[0];
        if (highlight) {
            const hColor = getVal(highlight);
            marks.push({ type: 'highlight', attrs: { color: hColor } });
        } else {
            const shd = rPr.getElementsByTagName("w:shd")[0];
            if (shd) {
                const fill = getVal(shd, "w:fill");
                if (fill && fill !== 'auto') {
                    marks.push({ type: 'highlight', attrs: { color: `#${fill}` } });
                }
            }
        }

        const vertAlign = rPr.getElementsByTagName("w:vertAlign")[0];
        if (vertAlign) {
            const v = getVal(vertAlign);
            if (v === 'superscript') marks.push({ type: 'superscript' });
            if (v === 'subscript') marks.push({ type: 'subscript' });
        }
    }

    if (Object.keys(styleAttrs).length > 0) {
        marks.push({ type: 'textStyle', attrs: styleAttrs });
    }

    return {
        type: 'text',
        text,
        marks: marks.length > 0 ? marks : undefined
    };
}

// Helper for Images
async function parseDrawing(drawing: Element, ctx: ParseContext) {
    const blip = drawing.getElementsByTagName("a:blip")[0];
    const embedId = blip?.getAttribute("r:embed");
    const extent = drawing.getElementsByTagName("wp:extent")[0];
    
    if (embedId && ctx.relsMap[embedId]) {
        const imagePath = "word/" + ctx.relsMap[embedId];
        const file = ctx.zip.file(imagePath);
        if (file) {
            const base64 = await file.async("base64");
            const mime = imagePath.toLowerCase().endsWith('png') ? 'image/png' : 'image/jpeg';
            
            let width = 400; 
            if (extent) {
                const cx = parseInt(extent.getAttribute("cx") || "0");
                if (cx > 0) width = emuToPx(cx) || 400;
            }

            return {
                type: 'image',
                attrs: {
                    src: `data:${mime};base64,${base64}`,
                    width: width
                }
            };
        }
    }
    return null;
}

// --- TABLE PARSER (High Fidelity) ---
async function parseTable(tbl: Element, ctx: ParseContext): Promise<any> {
    const rows: any[] = [];
    const trs = tbl.getElementsByTagName("w:tr");
    
    const tblGrid = tbl.getElementsByTagName("w:tblGrid")[0];
    const colWidths: number[] = [];
    if (tblGrid) {
        const cols = tblGrid.getElementsByTagName("w:gridCol");
        for (let i = 0; i < cols.length; i++) {
            const w = cols[i].getAttribute("w:w");
            colWidths.push(twipsToPx(w) || 100);
        }
    }

    for (let i = 0; i < trs.length; i++) {
        const tr = trs[i];
        const cells: any[] = [];
        const tcs = tr.getElementsByTagName("w:tc");

        for (let j = 0; j < tcs.length; j++) {
            const tc = tcs[j];
            const tcPr = tc.getElementsByTagName("w:tcPr")[0];
            const cellAttrs: any = {};
            
            if (tcPr) {
                const tcW = tcPr.getElementsByTagName("w:tcW")[0];
                if (tcW) {
                    const w = tcW.getAttribute("w:w");
                    const type = tcW.getAttribute("w:type");
                    if (type === 'dxa' && w) {
                        cellAttrs.colwidth = [twipsToPx(w)];
                    }
                } else if (colWidths[j]) {
                    cellAttrs.colwidth = [colWidths[j]];
                }

                const gridSpan = tcPr.getElementsByTagName("w:gridSpan")[0];
                if (gridSpan) cellAttrs.colspan = parseInt(getVal(gridSpan) || "1");
                
                const shd = tcPr.getElementsByTagName("w:shd")[0];
                if (shd) {
                    const fill = getVal(shd, "w:fill");
                    if (fill && fill !== 'auto') cellAttrs.backgroundColor = `#${fill}`;
                }
            }

            const cellContent: any[] = [];
            for (let k = 0; k < tc.childNodes.length; k++) {
                const child = tc.childNodes[k] as Element;
                if (child.nodeName === "w:p") {
                    const pNode = await parseParagraph(child, ctx);
                    if (Array.isArray(pNode)) cellContent.push(...pNode);
                    else if(pNode) cellContent.push(pNode);
                }
            }
            
            if (cellContent.length === 0) cellContent.push({ type: 'paragraph' });

            cells.push({
                type: 'tableCell',
                attrs: cellAttrs,
                content: cellContent
            });
        }
        
        rows.push({
            type: 'tableRow',
            content: cells
        });
    }

    return {
        type: 'table',
        content: rows
    };
}
