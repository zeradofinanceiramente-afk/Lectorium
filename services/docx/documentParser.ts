
import JSZip from 'jszip';
import { StyleMap } from './stylesParser';
import { CM_TO_TWIPS, emuToPx, getVal, halfPtToPt, hexColor, parseXml, twipsToPt, twipsToPx } from './utils';
import { PageSettings } from '../../components/doc/modals/PageSetupModal';
import { CommentData } from '../../components/doc/CommentsSidebar';

// Contexto passado durante a travessia
interface ParseContext {
  zip: JSZip;
  styles: StyleMap;
  commentsMap: Record<string, CommentData>;
  relsMap: Record<string, string>; // rId -> target (image path)
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
      if (pNode) content.push(pNode);
    } else if (node.nodeName === "w:tbl") {
      const tNode = await parseTable(node, context);
      if (tNode) content.push(tNode);
    }
  }

  // 2. Extract Page Settings from the *last* sectPr (Document Defaults)
  const sectPr = body.getElementsByTagName("w:sectPr");
  const lastSect = sectPr[sectPr.length - 1];
  let settings: PageSettings | undefined = undefined;

  if (lastSect) {
    settings = parseSectionProperties(lastSect);
  }

  return { content, settings };
}

function parseSectionProperties(sectPr: Element): PageSettings {
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
    // Use precise floating point values for margins to avoid pagination overflow issues
    mt = top / CM_TO_TWIPS;
    mb = bottom / CM_TO_TWIPS;
    ml = left / CM_TO_TWIPS;
    mr = right / CM_TO_TWIPS;
  }

  // Detect Paper Size Name
  let paperSize = 'a4';
  if (Math.abs(widthTwips - 12240) < 100) paperSize = 'letter';

  return {
    paperSize,
    orientation,
    pageColor: '#ffffff',
    marginTop: mt,
    marginBottom: mb,
    marginLeft: ml,
    marginRight: mr
  };
}

// --- PARAGRAPH PARSER (High Fidelity) ---
async function parseParagraph(p: Element, ctx: ParseContext): Promise<any> {
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

    // Spacing
    const spacing = pPr.getElementsByTagName("w:spacing")[0];
    if (spacing) {
        const before = spacing.getAttribute("w:before");
        const after = spacing.getAttribute("w:after");
        const line = spacing.getAttribute("w:line");
        const lineRule = spacing.getAttribute("w:lineRule");

        if (before) attrs.marginTop = twipsToPt(before) + "pt";
        if (after) attrs.marginBottom = twipsToPt(after) + "pt";
        if (line) {
            // "auto" lineRule uses 240 units = 1.0 lines
            // "exact" or "atLeast" uses twips
            if (lineRule === 'auto' || !lineRule) {
                // Add 5% buffer for browser font rendering differences vs Word
                attrs.lineHeight = ((parseInt(line) / 240) * 1.05).toFixed(2);
            } else {
                // Approximate pt value for fixed height
                // Tiptap handles unitless as multiplier, so this is tricky. 
                // We'll stick to standard multiplier logic for now.
            }
        }
    }

    // Indentation (Complex)
    const ind = pPr.getElementsByTagName("w:ind")[0];
    if (ind) {
        const left = ind.getAttribute("w:left") || ind.getAttribute("w:start"); // 'start' is newer
        const right = ind.getAttribute("w:right") || ind.getAttribute("w:end");
        const firstLine = ind.getAttribute("w:firstLine");
        const hanging = ind.getAttribute("w:hanging");
        
        let leftPx = twipsToPx(left) || 0;
        let rightPx = twipsToPx(right) || 0;
        
        if (hanging) {
            // Hanging indent: The first line starts to the left of the rest.
            // In CSS/Tiptap: text-indent is negative.
            const hangPx = twipsToPx(hanging) || 0;
            attrs.textIndent = `-${hangPx}px`;
            // Word adds hanging to left margin implicitly for visual alignment of body
            // but we keep left as is + hang logic in CSS usually requires margin-left padding.
            // Tiptap ParagraphExtended handles textIndent directly.
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

    // Pagination
    if (pPr.getElementsByTagName("w:keepNext").length > 0) attrs.keepWithNext = true;
    if (pPr.getElementsByTagName("w:keepLines").length > 0) attrs.keepLinesTogether = true;
    if (pPr.getElementsByTagName("w:pageBreakBefore").length > 0) attrs.pageBreakBefore = true;
  }

  // 3. Children (Runs & Hyperlinks)
  const children: any[] = [];
  for (let i = 0; i < p.childNodes.length; i++) {
    const child = p.childNodes[i] as Element;
    
    if (child.nodeName === "w:r") {
      const run = await parseRun(child, ctx, styleDef);
      if (run) children.push(run);
    } 
    else if (child.nodeName === "w:hyperlink") {
       // Hyperlink is a wrapper around runs
       const rid = getVal(child, "r:id");
       let href = "#";
       if (rid && ctx.relsMap[rid]) {
           href = ctx.relsMap[rid];
           // Fix internal targets usually broken in parsing
           if (!href.startsWith('http') && !href.startsWith('mailto')) href = `http://${href}`;
       }

       for (let k = 0; k < child.childNodes.length; k++) {
           const linkChild = child.childNodes[k] as Element;
           if (linkChild.nodeName === "w:r") {
               const run = await parseRun(linkChild, ctx, styleDef);
               if (run) {
                   if(!run.marks) run.marks = [];
                   run.marks.push({ type: 'link', attrs: { href } });
                   children.push(run);
               }
           }
       }
    }
  }

  return {
    type,
    attrs,
    content: children.length ? children : undefined
  };
}

// --- RUN PARSER (High Fidelity) ---
async function parseRun(r: Element, ctx: ParseContext, pStyle?: any): Promise<any> {
  const rPr = r.getElementsByTagName("w:rPr")[0];
  const t = r.getElementsByTagName("w:t")[0];
  const drawing = r.getElementsByTagName("w:drawing")[0];
  const br = r.getElementsByTagName("w:br")[0];
  const tab = r.getElementsByTagName("w:tab")[0];

  // --- IMAGES ---
  if (drawing) {
      const blip = drawing.getElementsByTagName("a:blip")[0];
      const embedId = blip?.getAttribute("r:embed");
      const extent = drawing.getElementsByTagName("wp:extent")[0];
      
      if (embedId && ctx.relsMap[embedId]) {
          const imagePath = "word/" + ctx.relsMap[embedId]; // assuming standard structure
          const file = ctx.zip.file(imagePath);
          if (file) {
              const base64 = await file.async("base64");
              const mime = imagePath.toLowerCase().endsWith('png') ? 'image/png' : 'image/jpeg';
              
              let width = 400; // default
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
  }

  // --- BREAKS ---
  if (br) {
      const type = br.getAttribute("w:type");
      if (type === 'page') {
          return { type: 'pageBreak' };
      }
      return { type: 'text', text: '\n' };
  }

  // --- TABS ---
  if (tab) {
      return { type: 'text', text: '\t' };
  }

  // --- TEXT ---
  if (t) {
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

      // Direct Formatting Overrides
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
          
          // Background Color (Highlight)
          const highlight = rPr.getElementsByTagName("w:highlight")[0];
          if (highlight) {
              const hColor = getVal(highlight);
              marks.push({ type: 'highlight', attrs: { color: hColor } });
          } else {
              const shd = rPr.getElementsByTagName("w:shd")[0];
              if (shd) {
                  const fill = getVal(shd, "w:fill");
                  if (fill && fill !== 'auto') {
                      // Map shd to highlight for text runs
                      marks.push({ type: 'highlight', attrs: { color: `#${fill}` } });
                  }
              }
          }

          // Vert Align
          const vertAlign = rPr.getElementsByTagName("w:vertAlign")[0];
          if (vertAlign) {
              const v = getVal(vertAlign);
              if (v === 'superscript') marks.push({ type: 'superscript' });
              if (v === 'subscript') marks.push({ type: 'subscript' });
          }
      }

      // Add Text Style Mark if attributes exist
      if (Object.keys(styleAttrs).length > 0) {
          marks.push({ type: 'textStyle', attrs: styleAttrs });
      }

      return {
          type: 'text',
          text,
          marks: marks.length > 0 ? marks : undefined
      };
  }

  return null;
}

// --- TABLE PARSER (High Fidelity) ---
async function parseTable(tbl: Element, ctx: ParseContext): Promise<any> {
    const rows: any[] = [];
    const trs = tbl.getElementsByTagName("w:tr");
    
    // Table Grid (Columns)
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
                // Width
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

                // Grid Span (Colspan)
                const gridSpan = tcPr.getElementsByTagName("w:gridSpan")[0];
                if (gridSpan) cellAttrs.colspan = parseInt(getVal(gridSpan) || "1");
                
                // Vertical Merge (Rowspan) - Complex in DOCX ("restart" vs "continue")
                // Skipping deep rowspan logic for V1, usually just works visually or splits cells
                
                // Shading / Background
                const shd = tcPr.getElementsByTagName("w:shd")[0];
                if (shd) {
                    const fill = getVal(shd, "w:fill");
                    if (fill && fill !== 'auto') cellAttrs.backgroundColor = `#${fill}`;
                }

                // Vertical Align
                const vAlign = tcPr.getElementsByTagName("w:vAlign")[0];
                if (vAlign) {
                    // Tiptap doesn't natively support vAlign in starter-kit tableCell, requires custom extension
                    // Ignoring for now to prevent schema errors
                }
            }

            const cellContent: any[] = [];
            for (let k = 0; k < tc.childNodes.length; k++) {
                const child = tc.childNodes[k] as Element;
                if (child.nodeName === "w:p") {
                    const pNode = await parseParagraph(child, ctx);
                    if (pNode) cellContent.push(pNode);
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
