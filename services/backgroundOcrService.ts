
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { getOcrWorker } from './ocrService';
import { saveOcrData, touchOfflineFile } from './storageService';
import { OcrManager } from './ocrManager';

// Configuração do Worker
GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs`;

export interface BackgroundOcrOptions {
  fileId: string;
  blob: Blob;
  startPage: number;
  endPage: number;
  onProgress: (page: number, total: number) => void;
  onComplete: () => void;
  onError: (error: string) => void;
}

export async function runBackgroundOcr({ 
  fileId, blob, startPage, endPage, onProgress, onComplete, onError 
}: BackgroundOcrOptions) {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const pdfDoc = await getDocument({
      data: arrayBuffer,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/cmaps/',
      cMapPacked: true,
    }).promise;

    const manager = new OcrManager(
      pdfDoc,
      async (page, words) => {
        // Salva diretamente no IDB
        await saveOcrData(fileId, page, words);
        await touchOfflineFile(fileId);
        onProgress(page, endPage - startPage + 1);
        
        // Verifica se terminou o lote
        if (page === endPage) {
            onComplete();
        }
      },
      (statusMap) => {
        // Monitoramento opcional de status interno
      }
    );

    // Agenda as páginas sequencialmente
    for (let i = startPage; i <= endPage; i++) {
        // Pequeno delay entre agendamentos para não travar a main thread na inicialização
        await new Promise(r => setTimeout(r, 100));
        manager.schedule(i, 'low'); // Low priority para não travar UI se o usuário estiver navegando
    }

  } catch (e: any) {
    console.error("Background OCR Error:", e);
    onError(e.message || "Erro ao iniciar motor OCR.");
  }
}
