
import { useState, useEffect, useRef } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import { downloadDriveFile } from '../services/driveService';
import { getOfflineFile } from '../services/storageService';
import { blobRegistry } from '../services/blobRegistry';
import { usePdfStore } from '../stores/usePdfStore';

// Configuração do Worker - CRÍTICO: Versão deve bater com importmap
GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs`;

// Conversão de DPI (72 -> 96 com ajuste visual)
const CSS_UNITS = (96.0 / 72.0) * 1.74;

interface UsePdfDocumentProps {
  fileId: string;
  fileBlob?: Blob;
  accessToken?: string | null;
  onAuthError?: () => void;
}

export const usePdfDocument = ({ fileId, fileBlob, accessToken, onAuthError }: UsePdfDocumentProps) => {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.0);
  const [pageDimensions, setPageDimensions] = useState<{ width: number, height: number } | null>(null);

  // Janitor Hook: Limpa Blobs ao desmontar ou trocar arquivo
  useEffect(() => {
    return () => {
      blobRegistry.revokeAll();
      // Limpa dimensões ao desmontar
      usePdfStore.getState().setPageSizes([]);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadPdf = async () => {
      try {
        setLoading(true);
        setError(null);
        usePdfStore.getState().setPageSizes([]); // Reset dimensions

        let blob: Blob | undefined;

        // 1. Determinar Fonte do Arquivo
        if (fileBlob) {
          blob = fileBlob;
        } else if (originalBlob) {
          blob = originalBlob; 
        } else {
          const offlineBlob = await getOfflineFile(fileId);
          
          if (!navigator.onLine && offlineBlob) {
             blob = offlineBlob;
          } else if (accessToken) {
             try {
                blob = await downloadDriveFile(accessToken, fileId);
             } catch (downloadErr: any) {
                if (offlineBlob) {
                   console.warn("Download falhou, usando versão offline cacheada.");
                   blob = offlineBlob;
                } else {
                   throw downloadErr;
                }
             }
          } else if (offlineBlob) {
             blob = offlineBlob;
          }
        }

        if (!blob) {
          throw new Error("Fonte do arquivo não disponível");
        }

        if (mounted && !originalBlob) setOriginalBlob(blob);

        // 2. Carregar PDF.js
        const arrayBuffer = await blob.arrayBuffer();
        const pdf = await getDocument({
          data: arrayBuffer,
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/standard_fonts/'
        }).promise;

        if (mounted) {
          setPdfDoc(pdf);
          setNumPages(pdf.numPages);
          
          // Setup Page 1 (Critical Path)
          try {
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 1 });
            const dimensions = { width: viewport.width, height: viewport.height };
            setPageDimensions(dimensions);

            const containerWidth = window.innerWidth;
            const isMobile = containerWidth < 768;
            const padding = isMobile ? 10 : 60;
            
            const autoScale = (containerWidth - padding) / viewport.width;
            setScale(Math.min(autoScale, 1.5));
          } catch (e) {
            console.warn("Erro no auto-fit:", e);
          }

          // 3. BACKGROUND: Fetch Dimensions for ALL Pages (Variable Height Support)
          // Isso roda de forma não bloqueante
          setTimeout(async () => {
              if (!mounted) return;
              const sizes: { width: number, height: number }[] = [];
              
              for (let i = 1; i <= pdf.numPages; i++) {
                  try {
                      // Nota: getPage em loop pode ser pesado para docs gigantes.
                      // O PDF.js cacheia essas chamadas. Apenas metadados são leves.
                      const page = await pdf.getPage(i);
                      const vp = page.getViewport({ scale: 1 });
                      sizes.push({ width: vp.width, height: vp.height });
                  } catch (e) {
                      // Fallback em caso de erro na página: usa a anterior ou padrão
                      sizes.push(sizes.length > 0 ? sizes[sizes.length-1] : { width: 600, height: 800 });
                  }
              }
              
              if (mounted) {
                  console.log(`[PDF Layout] Mapa de alturas gerado para ${pdf.numPages} páginas.`);
                  usePdfStore.getState().setPageSizes(sizes);
              }
          }, 100);
        }
      } catch (err: any) {
        console.error("Erro ao carregar PDF:", err);
        if (mounted) {
          if (err.message === "Unauthorized" || err.message.includes("401")) {
            if (onAuthError) onAuthError();
          } else {
            setError(err.message || "Falha ao abrir arquivo");
          }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (!pdfDoc || fileId) {
        loadPdf();
    }

    return () => { mounted = false; };
  }, [fileId, accessToken, fileBlob]);

  return { 
    pdfDoc, 
    originalBlob, 
    setOriginalBlob,
    numPages, 
    loading, 
    error, 
    scale, 
    setScale,
    pageDimensions,
    cssUnits: CSS_UNITS
  };
};
