import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { saveOcrData, touchOfflineFile } from './storageService';
import { performLayoutOcr, performSemanticOcr, performTranslatedLayoutOcr } from './aiService';

// Configuração do Worker
GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs`;

export interface BackgroundOcrOptions {
  fileId: string;
  blob: Blob;
  startPage: number;
  endPage: number;
  mode?: 'simple' | 'semantic';
  targetLanguage?: string; // Novo Parâmetro
  onProgress: (page: number, total: number) => void;
  onComplete: () => void;
  onError: (error: string) => void;
  onQuotaExceeded?: (lastPage: number) => void;
  onSemanticResult?: (page: number, markdown: string, segments: any[]) => void;
}

async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

export async function runBackgroundOcr({ 
  fileId, blob, startPage, endPage, mode = 'simple', targetLanguage, onProgress, onComplete, onError, onQuotaExceeded, onSemanticResult 
}: BackgroundOcrOptions) {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const pdfDoc = await getDocument({
      data: arrayBuffer,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/cmaps/',
      cMapPacked: true,
    }).promise;

    const totalPagesToProcess = endPage - startPage + 1;

    for (let i = startPage; i <= endPage; i++) {
        try {
            const page = await pdfDoc.getPage(i);
            const scale = 2.0; // High res for Vision
            const viewport = page.getViewport({ scale });
            const w = viewport.width;
            const h = viewport.height;

            const isOffscreenSupported = typeof OffscreenCanvas !== 'undefined';
            const canvas = isOffscreenSupported 
                ? new OffscreenCanvas(w, h) 
                : document.createElement('canvas');
            
            if (!isOffscreenSupported) {
                (canvas as HTMLCanvasElement).width = w;
                (canvas as HTMLCanvasElement).height = h;
            }

            const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true }) as any;
            await page.render({ canvasContext: ctx, viewport }).promise;

            let base64: string;
            
            if (isOffscreenSupported) {
                const blob = await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality: 0.8 });
                base64 = await blobToBase64(blob);
            } else {
                base64 = await new Promise<string>((resolve) => {
                    (canvas as HTMLCanvasElement).toBlob(async (b) => {
                        resolve(b ? await blobToBase64(b) : '');
                    }, 'image/jpeg', 0.8);
                });
            }

            const pureBase64 = base64.split(',')[1];
            
            if (mode === 'semantic') {
                let markdown: string;
                let segments: any[];

                if (targetLanguage) {
                    // TRANSLATED SEMANTIC BATCH
                    // 1. Translated Markdown (Sidebar)
                    // 2. Translated Layout Segments (Canvas Overlay)
                    [markdown, segments] = await Promise.all([
                        performSemanticOcr(pureBase64, targetLanguage),
                        performTranslatedLayoutOcr(pureBase64, targetLanguage)
                    ]);
                } else {
                    // STANDARD SEMANTIC BATCH
                    [markdown, segments] = await Promise.all([
                        performSemanticOcr(pureBase64),
                        performLayoutOcr(pureBase64)
                    ]);
                }

                // Callback to update context state
                if (onSemanticResult) {
                    onSemanticResult(i, markdown, segments);
                }
                
                // Still process segments for canvas injection
                const mappedWords = mapSegmentsToWords(segments, w, h, scale);
                await saveOcrData(fileId, i, mappedWords);

            } else {
                // SIMPLE LAYOUT OCR (Just Canvas)
                // Se targetLanguage for passado no modo simples, usamos Translated Layout também
                const segments = targetLanguage 
                    ? await performTranslatedLayoutOcr(pureBase64, targetLanguage)
                    : await performLayoutOcr(pureBase64);
                    
                const mappedWords = mapSegmentsToWords(segments, w, h, scale);
                await saveOcrData(fileId, i, mappedWords);
            }

            await touchOfflineFile(fileId);
            onProgress(i, totalPagesToProcess);
            
            // Throttling harder for semantic mode as it does 2x API calls
            const delay = mode === 'semantic' ? 2000 : 1000;
            await new Promise(r => setTimeout(r, delay));

        } catch (pageError: any) {
            console.error(`Error processing page ${i}:`, pageError);
            
            // CHECK FOR QUOTA LIMITS (429 or explicit text)
            const errMsg = (pageError.message || '').toLowerCase();
            if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('limit') || errMsg.includes('resource exhausted')) {
                if (onQuotaExceeded) {
                    // Stop the loop gracefully and notify
                    onQuotaExceeded(Math.max(startPage, i - 1)); // Return last successful page
                    return; 
                }
            }
            // For other errors, we might want to continue to next page, but log it.
        }
    }

    onComplete();

  } catch (e: any) {
    console.error("Background OCR Error:", e);
    onError(e.message || "Erro ao iniciar processamento OCR.");
  }
}

function mapSegmentsToWords(segments: any[], w: number, h: number, scale: number) {
    const mappedWords: any[] = [];
    const originalW = w / scale;
    const originalH = h / scale;

    segments.forEach((seg: any) => {
        const [ymin, xmin, ymax, xmax] = seg.box_2d;
        const textContent = seg.text;
        
        if (!textContent) return;

        const lineX0 = (xmin / 1000) * originalW;
        const lineY0 = (ymin / 1000) * originalH;
        const lineX1 = (xmax / 1000) * originalW;
        const lineY1 = (ymax / 1000) * originalH;
        const lineWidth = lineX1 - lineX0;
        
        const words = textContent.split(/(\s+)/);
        const totalChars = textContent.length;
        const avgCharWidth = totalChars > 0 ? lineWidth / totalChars : 0;
        
        let currentX = lineX0;

        words.forEach((word: string) => {
            if (word.length === 0) return;
            const wordWidth = word.length * avgCharWidth;
            
            if (word.trim().length > 0) {
                mappedWords.push({
                    text: word,
                    confidence: 99, 
                    bbox: { 
                        x0: currentX, 
                        y0: lineY0, 
                        x1: currentX + wordWidth, 
                        y1: lineY1 
                    },
                    isRefined: true,
                    centerScore: (currentX + (wordWidth/2))
                });
            }
            currentX += wordWidth;
        });
    });
    return mappedWords;
}