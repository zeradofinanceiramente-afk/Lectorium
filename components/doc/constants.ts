
export const DPI = 96;
export const CM_TO_PX = 37.795275591; // 1cm in pixels at 96 DPI

export const PAPER_SIZES: Record<string, { name: string, widthCm: number, heightCm: number }> = {
  'letter': { name: 'Carta (21,6 cm x 27,9 cm)', widthCm: 21.59, heightCm: 27.94 },
  'tabloid': { name: 'Tabloide (27,9 cm x 43,2 cm)', widthCm: 27.94, heightCm: 43.18 },
  'legal': { name: 'Ofício (21,6 cm x 35,6 cm)', widthCm: 21.59, heightCm: 35.56 },
  'statement': { name: 'Declaração (14 cm x 21,6 cm)', widthCm: 13.97, heightCm: 21.59 },
  'executive': { name: 'Executivo (18,4 cm x 26,7 cm)', widthCm: 18.41, heightCm: 26.67 },
  'folio': { name: 'Fólio (21,6 cm x 33 cm)', widthCm: 21.59, heightCm: 33.02 },
  'a3': { name: 'A3 (29,7 cm x 42 cm)', widthCm: 29.7, heightCm: 42 },
  'a4': { name: 'A4 (21 cm x 29,7 cm)', widthCm: 21, heightCm: 29.7 },
  'a5': { name: 'A5 (14,8 cm x 21 cm)', widthCm: 14.8, heightCm: 21 },
  'b4': { name: 'B4 (25 cm x 35,3 cm)', widthCm: 25, heightCm: 35.3 },
  'b5': { name: 'B5 (17,6 cm x 25 cm)', widthCm: 17.6, heightCm: 25 },
};
