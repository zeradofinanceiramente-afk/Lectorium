
import { getVal, halfPtToPt, hexColor, parseXml, twipsToPt } from "./utils";

export interface DocxStyle {
  id: string;
  name?: string;
  basedOn?: string;
  isHeading?: boolean;
  level?: number;
  // Character Props
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  // Paragraph Props
  marginTop?: string;
  marginBottom?: string;
  lineHeight?: string;
  textAlign?: string;
}

export type StyleMap = Record<string, DocxStyle>;

export async function parseStyles(xmlContent: string): Promise<StyleMap> {
  const doc = parseXml(xmlContent);
  const styles: StyleMap = {};
  const styleNodes = doc.getElementsByTagName("w:style");

  for (let i = 0; i < styleNodes.length; i++) {
    const node = styleNodes[i];
    const id = node.getAttribute("w:styleId");
    const type = node.getAttribute("w:type"); // paragraph or character

    if (!id || (type !== 'paragraph' && type !== 'character')) continue;

    const style: DocxStyle = { id };
    
    // Name
    const nameNode = node.getElementsByTagName("w:name")[0];
    if (nameNode) style.name = getVal(nameNode) || undefined;

    // Based On
    const basedOn = node.getElementsByTagName("w:basedOn")[0];
    if (basedOn) style.basedOn = getVal(basedOn) || undefined;

    // Heading Detection
    if (style.name?.toLowerCase().startsWith('heading')) {
      const match = style.name.match(/\d+/);
      if (match) {
        style.isHeading = true;
        style.level = parseInt(match[0]);
      }
    }

    // --- Run Properties (rPr) ---
    const rPr = node.getElementsByTagName("w:rPr")[0];
    if (rPr) {
      const sz = rPr.getElementsByTagName("w:sz")[0]; // half-points
      if (sz) style.fontSize = halfPtToPt(getVal(sz)) ?? undefined;

      const color = rPr.getElementsByTagName("w:color")[0];
      if (color) style.color = hexColor(getVal(color)) || undefined;

      if (rPr.getElementsByTagName("w:b").length > 0) style.bold = true;
      if (rPr.getElementsByTagName("w:i").length > 0) style.italic = true;
      if (rPr.getElementsByTagName("w:u").length > 0) style.underline = true;

      const rFonts = rPr.getElementsByTagName("w:rFonts")[0];
      if (rFonts) {
        const ascii = rFonts.getAttribute("w:ascii");
        if (ascii) style.fontFamily = ascii;
      }
    }

    // --- Paragraph Properties (pPr) ---
    const pPr = node.getElementsByTagName("w:pPr")[0];
    if (pPr) {
      // Alignment
      const jc = pPr.getElementsByTagName("w:jc")[0];
      if (jc) {
        const val = getVal(jc);
        if (val === 'both' || val === 'distribute') style.textAlign = 'justify';
        else if (val) style.textAlign = val;
      }

      // Spacing
      const spacing = pPr.getElementsByTagName("w:spacing")[0];
      if (spacing) {
        const before = spacing.getAttribute("w:before");
        const after = spacing.getAttribute("w:after");
        const line = spacing.getAttribute("w:line");
        const lineRule = spacing.getAttribute("w:lineRule");

        if (before) style.marginTop = twipsToPt(before) + "pt";
        if (after) style.marginBottom = twipsToPt(after) + "pt";
        
        if (line && lineRule === 'auto') {
           // Word: 240 = 1 line (100%)
           style.lineHeight = (parseInt(line) / 240).toFixed(2);
        }
      }
    }

    styles[id] = style;
  }

  return styles;
}
