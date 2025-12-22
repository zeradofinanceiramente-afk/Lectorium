
export const CM_TO_TWIPS = 566.929;
export const PT_TO_TWIPS = 20;
export const TWIPS_TO_PX = 1.33; // 1pt = 1.33px approx (96/72), and 20twips = 1pt. So 15twips ~= 1px.
// Correction: Word Twips (1/1440 inch). Screen 96px/inch.
// 1440 twips = 96 px -> 1 px = 15 twips. 
// So twips / 15 = px.

export const EMU_TO_PX = 1 / 9525; // English Metric Units para Pixels

export function twipsToPt(twips: string | number | null): number | null {
  if (!twips) return null;
  const val = typeof twips === 'string' ? parseInt(twips) : twips;
  return isNaN(val) ? null : val / 20;
}

export function twipsToPx(twips: string | number | null): number | null {
  if (!twips) return null;
  const val = typeof twips === 'string' ? parseInt(twips) : twips;
  return isNaN(val) ? null : Math.round(val / 15);
}

export function emuToPx(emu: string | number | null): number | null {
  if (!emu) return null;
  const val = typeof emu === 'string' ? parseInt(emu) : emu;
  return isNaN(val) ? null : Math.round(val * EMU_TO_PX);
}

export function halfPtToPt(val: string | null): number | null {
  if (!val) return null;
  const num = parseInt(val);
  return isNaN(num) ? null : num / 2;
}

export function parseXml(xmlStr: string): Document {
  return new DOMParser().parseFromString(xmlStr, "text/xml");
}

export function getVal(node: Element, attr: string = 'w:val'): string | null {
  return node.getAttribute(attr);
}

export function hexColor(val: string | null): string | null {
  if (!val || val === 'auto') return null;
  return `#${val}`;
}
