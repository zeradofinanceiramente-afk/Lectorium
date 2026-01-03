
import { ProcessedImageResult } from "./imageProcessingService";

// Tipos de Retorno do Florence
export interface FlorenceResult {
  generated_text: string;
}

export class FlorenceService {
  private worker: Worker | null = null;
  private isReady = false;
  private onStatusChange?: (status: string, progress?: number) => void;

  constructor(onStatusChange?: (status: string, progress?: number) => void) {
    this.onStatusChange = onStatusChange;
  }

  public async init() {
    if (this.worker) return;

    this.worker = new Worker(new URL('../workers/florenceWorker.ts', import.meta.url), {
      type: 'module'
    });

    this.worker.onmessage = (e) => {
      const { status, message, progress, error } = e.data;
      
      if (status === 'ready') {
        this.isReady = true;
        if (this.onStatusChange) this.onStatusChange('ready');
      } else if (status === 'downloading') {
        if (this.onStatusChange) this.onStatusChange(`Baixando recursos: ${Math.round(progress || 0)}%`, progress);
      } else if (status === 'error') {
        console.error("Florence Worker Error:", error);
        if (this.onStatusChange) this.onStatusChange('error');
      }
    };

    this.worker.postMessage({ type: 'init' });
  }

  public async runOcr(imageBlob: Blob): Promise<any[]> {
    if (!this.worker || !this.isReady) await this.init();

    return new Promise((resolve, reject) => {
      if (!this.worker) return reject("Worker failed to start");

      const url = URL.createObjectURL(imageBlob);

      const handler = (e: MessageEvent) => {
        const { status, result, error } = e.data;
        
        if (status === 'done') {
          this.worker?.removeEventListener('message', handler);
          URL.revokeObjectURL(url);
          
          const rawText = result[0]?.generated_text || "";
          const parsed = this.parseFlorenceOutput(rawText);
          resolve(parsed);
        } else if (status === 'error') {
          this.worker?.removeEventListener('message', handler);
          reject(error);
        }
      };

      this.worker.addEventListener('message', handler);
      
      this.worker.postMessage({ 
        type: 'process', 
        data: { imageUrl: url, task: '<OCR_WITH_REGION>' } 
      });
    });
  }

  /**
   * Parser otimizado para o formato do Florence-2 com Filtros de Ruído e Anti-Alucinação
   * Formato: "word<loc_1><loc_2><loc_3><loc_4>"
   */
  private parseFlorenceOutput(text: string): any[] {
    const words: any[] = [];
    
    // Regex robusta: aceita espaços, pontuação, acentos e evita quebras de linha no meio da palavra
    const regex = /([^<]+)((?:<loc_\d+>){4})/g;
    
    let match;
    let lastWord = ""; // Para detecção de loop simples

    while ((match = regex.exec(text)) !== null) {
      // Limpeza: remove quebras de linha e trim
      let wordText = match[1].replace(/[\r\n]+/g, ' ').trim();
      
      if (!wordText) continue;

      // 1. FILTRO DE ALUCINAÇÃO (Loop Detector)
      // Se a palavra for idêntica à anterior e tiver < 3 letras, provavelmente é um loop
      if (wordText === lastWord && wordText.length < 3) continue;
      lastWord = wordText;

      // 2. FILTRO DE RUÍDO (NOISE GATE)
      // Rejeita palavras de 1 ou 2 letras que não sejam comuns ou numéricas
      if (wordText.length <= 2) {
          const validShorts = /^(?:[aàeéioóu0-9]|da|de|do|em|na|no|os|as|um|un|is|it|at|in|on|to|by|of|or)$/i;
          if (!validShorts.test(wordText)) continue;
      }

      // 3. Rejeita repetições absurdas (ex: "iiiii", ".....")
      if (/(.)\1{3,}/.test(wordText)) continue;

      const locs = match[2].match(/\d+/g);

      if (locs && locs.length === 4) {
        const [x1, y1, x2, y2] = locs.map(Number);
        
        // 4. Rejeita caixas muito pequenas (pontos de sujeira) ou esmagadas
        if (Math.abs(x2 - x1) < 8 || Math.abs(y2 - y1) < 8) continue;

        words.push({
          text: wordText,
          confidence: 95, // Florence não dá confiança por palavra, assumimos alta se passou nos filtros
          bbox: {
            x0: x1, 
            y0: y1,
            x1: x2,
            y1: y2
          },
          isRelative: true 
        });
      }
    }
    
    return words;
  }

  public terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.isReady = false;
  }
}

export const florenceService = new FlorenceService();
