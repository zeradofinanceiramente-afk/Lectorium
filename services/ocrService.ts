import { createWorker, Worker as TesseractWorker } from 'tesseract.js';

/**
 * CONFIGURAÇÃO DE RECURSOS TESSERACT 5.1.1
 * Usamos caminhos fixos para garantir que o PWA possa cachear esses arquivos
 * e evitar que o motor tente baixar versões incompatíveis em runtime.
 */
export const OCR_RESOURCES = {
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
  corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/tesseract-core.wasm.js',
  langPath: 'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0', 
  langFile: '/por.traineddata.gz'
};

let worker: TesseractWorker | null = null;
let workerLoadingPromise: Promise<TesseractWorker> | null = null;

/**
 * Obtém ou inicializa o Worker do Tesseract.
 * Implementa retentativa e cache para evitar múltiplos downloads de WASM.
 */
export const getOcrWorker = async (retryCount = 0): Promise<TesseractWorker> => {
  if (worker) return worker;
  if (workerLoadingPromise && retryCount === 0) return workerLoadingPromise;

  const MAX_RETRIES = 2;

  workerLoadingPromise = (async () => {
    try {
      console.log(`[OCR] Inicializando motor v5.1.1 (Tentativa ${retryCount + 1})...`);
      
      // No Tesseract 5, os parâmetros de caminho são passados no createWorker
      const w = await createWorker('por', 1, {
        workerPath: OCR_RESOURCES.workerPath,
        corePath: OCR_RESOURCES.corePath,
        langPath: OCR_RESOURCES.langPath,
        // Usamos cacheMethod 'none' para que o Service Worker gerencie a rede
        // e 'fixed' para nomes de arquivos previsíveis
        cacheMethod: 'none',
        logger: (m) => {
            if (m.status === 'recognizing text') {
                // Progresso opcional
            }
        },
        errorHandler: (err: any) => console.warn("[OCR] Worker warning:", err)
      });

      /**
       * OTIMIZAÇÕES ACADÊMICAS NATIVAS:
       * - PSM 3: Segmentação automática (lida com colunas de jornais e artigos).
       * - preserve_interword_spaces: Essencial para manter a geometria do PDF.
       * - textord_heavy_nr: Ajuda em digitalizações ruidosas.
       */
      await w.setParameters({
        tessedit_pageseg_mode: '3' as any, 
        tessjs_create_hocr: '0',
        tessjs_create_tsv: '0',
        preserve_interword_spaces: '1',
        textord_heavy_nr: '1',
        tessedit_do_invert: '0', 
      });

      console.log("[OCR] Motor Tesseract pronto e calibrado.");
      worker = w;
      return w;
    } catch (error) {
      console.error(`[OCR] Erro fatal na inicialização (v${retryCount + 1}):`, error);
      workerLoadingPromise = null;
      
      if (retryCount < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1500));
        return getOcrWorker(retryCount + 1);
      }
      throw new Error("Não foi possível carregar o motor de OCR. Verifique sua conexão.");
    }
  })();

  return workerLoadingPromise;
};

/**
 * Libera memória do Worker se necessário (ex: fechamento de documento pesado).
 */
export const terminateOcrWorker = async () => {
  if (worker) {
    try {
        await worker.terminate();
    } catch (e) {}
    worker = null;
    workerLoadingPromise = null;
  }
};