
import { ProcessedImageResult } from "./imageProcessingService";

// Tipos de Retorno do Florence
export interface FlorenceResult {
  generated_text: string;
}

export interface DetectedObject {
  label: string;
  bbox: [number, number, number, number]; // x1, y1, x2, y2
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

  private executeTask(imageBlob: Blob, task: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.worker) return reject("Worker failed to start");

      const url = URL.createObjectURL(imageBlob);

      const handler = (e: MessageEvent) => {
        const { status, result, error, task: returnedTask } = e.data;
        
        // Ensure we handle the correct task response
        if (status === 'done' && returnedTask === task) {
          this.worker?.removeEventListener('message', handler);
          URL.revokeObjectURL(url);
          resolve(result[0]?.generated_text || "");
        } else if (status === 'error') {
          this.worker?.removeEventListener('message', handler);
          URL.revokeObjectURL(url);
          reject(error);
        }
      };

      this.worker.addEventListener('message', handler);
      
      this.worker.postMessage({ 
        type: 'process', 
        data: { imageUrl: url, task } 
      });
    });
  }

  public async runOcr(imageBlob: Blob): Promise<any[]> {
    if (!this.worker || !this.isReady) await this.init();
    const rawText = await this.executeTask(imageBlob, '<OCR_WITH_REGION>');
    return this.parseFlorenceOcr(rawText);
  }

  public async runObjectDetection(imageBlob: Blob): Promise<DetectedObject[]> {
    if (!this.worker || !this.isReady) await this.init();
    const rawText = await this.executeTask(imageBlob, '<OD>');
    return this.parseFlorenceOD(rawText);
  }

  /**
   * Parser otimizado para o formato do Florence-2 com Filtros de Ruído
   * Formato: "word<loc_1><loc_2><loc_3><loc_4>"
   */
  private parseFlorenceOcr(text: string): any[] {
    const words: any[] = [];
    // Regex robusta: aceita espaços, pontuação, acentos
    const regex = /([^<]+)((?:<loc_\d+>){4})/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      let wordText = match[1].replace(/[\r\n]+/g, ' ').trim();
      if (!wordText) continue;

      // FILTRO DE RUÍDO (NOISE GATE)
      if (wordText.length <= 2) {
          const validShorts = /^(?:[aàeéioóu0-9]|da|de|do|em|na|no|os|as|um|un|is|it|at|in|on|to|by|of|or)$/i;
          if (!validShorts.test(wordText)) continue;
      }
      if (/(.)\1{3,}/.test(wordText)) continue;

      const locs = match[2].match(/\d+/g);
      if (locs && locs.length === 4) {
        const [x1, y1, x2, y2] = locs.map(Number);
        // 3. Rejeita caixas muito pequenas ou esmagadas
        if (Math.abs(x2 - x1) < 8 || Math.abs(y2 - y1) < 8) continue;

        words.push({
          text: wordText,
          confidence: 95, 
          bbox: { x0: x1, y0: y1, x1: x2, y1: y2 },
          isRelative: true 
        });
      }
    }
    return words;
  }

  /**
   * Parser para Object Detection
   * Formato: "label<loc_1><loc_2><loc_3><loc_4>"
   */
  private parseFlorenceOD(text: string): DetectedObject[] {
    const objects: DetectedObject[] = [];
    const regex = /([^<]+)((?:<loc_\d+>){4})/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
        const label = match[1].trim();
        const locs = match[2].match(/\d+/g);
        if (locs && locs.length === 4) {
            const [x1, y1, x2, y2] = locs.map(Number);
            objects.push({ label, bbox: [x1, y1, x2, y2] });
        }
    }
    return objects;
  }

  public terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.isReady = false;
  }
}

export const florenceService = new FlorenceService();
