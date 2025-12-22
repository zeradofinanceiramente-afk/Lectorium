
/**
 * Otimizado para Jornais Históricos e Documentos Degradados.
 * Delega processamento pesado para Web Worker dedicado.
 */

export interface ProcessedImageResult {
    canvas: HTMLCanvasElement | OffscreenCanvas;
    scaleFactor: number;
}

// Singleton Worker para tarefas esporádicas de processamento
let sharedWorker: Worker | null = null;

function getWorker() {
    if (!sharedWorker) {
        // CORREÇÃO: Sintaxe nativa de Worker compatível com Vite/ESM
        sharedWorker = new Worker(
            new URL('../workers/imageProcessor.worker.ts', import.meta.url),
            { type: 'module' }
        );
    }
    return sharedWorker;
}

export async function preprocessHistoricalNewspaper(source: Blob): Promise<ProcessedImageResult> {
  const bitmap = await createImageBitmap(source);
  const worker = getWorker();

  const result: any = await new Promise((resolve, reject) => {
      const handleMsg = (e: MessageEvent) => {
          worker.removeEventListener('message', handleMsg);
          if (e.data.success) resolve(e.data.data);
          else reject(new Error(e.data.error));
      };
      worker.addEventListener('message', handleMsg);
      worker.postMessage({ type: 'preprocess', bitmap }, [bitmap]);
  });

  const { processedBitmap } = result;
  
  // Converte de volta para OffscreenCanvas ou Canvas para uso na UI/Exportação
  const canvas = new OffscreenCanvas(processedBitmap.width, processedBitmap.height);
  const ctx = canvas.getContext('2d');
  ctx?.drawImage(processedBitmap, 0, 0);
  processedBitmap.close();

  return { canvas, scaleFactor: 1.0 };
}

export async function preprocessImageForOcr(sourceCanvas: HTMLCanvasElement | OffscreenCanvas): Promise<ProcessedImageResult> {
    const bitmap = await createImageBitmap(sourceCanvas);
    const worker = getWorker();
    
    const result: any = await new Promise((resolve, reject) => {
        const handleMsg = (e: MessageEvent) => {
            worker.removeEventListener('message', handleMsg);
            if (e.data.success) resolve(e.data.data);
            else reject(new Error(e.data.error));
        };
        worker.addEventListener('message', handleMsg);
        worker.postMessage({ type: 'preprocess', bitmap }, [bitmap]);
    });

    const { processedBitmap } = result;
    const canvas = document.createElement('canvas');
    canvas.width = processedBitmap.width;
    canvas.height = processedBitmap.height;
    canvas.getContext('2d')?.drawImage(processedBitmap, 0, 0);
    processedBitmap.close();

    return { canvas, scaleFactor: 1.0 };
}
