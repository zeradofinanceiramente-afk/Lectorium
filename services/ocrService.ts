
import { createWorker, Worker as TesseractWorker } from 'tesseract.js';

/**
 * CONFIGURAÇÃO DE RECURSOS TESSERACT 5.1.1
 * Definimos os caminhos base. A seleção entre SIMD e Standard ocorre em runtime.
 */
const TESSERACT_BASE = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0';

export const OCR_RESOURCES = {
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
  langPath: 'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0', 
  langFile: '/por.traineddata.gz',
  tesseractBase: TESSERACT_BASE,
  corePath: `${TESSERACT_BASE}/tesseract-core.wasm.js`,
  corePathSimd: `${TESSERACT_BASE}/tesseract-core-simd.wasm.js`,
};

let worker: TesseractWorker | null = null;
let workerLoadingPromise: Promise<TesseractWorker> | null = null;

/**
 * Detecção de suporte a WebAssembly SIMD (Single Instruction, Multiple Data).
 * O SIMD permite processar múltiplos dados com uma única instrução, essencial para IA/OCR rápido.
 */
const isSimdSupported = (): boolean => {
  try {
    // Opcode minimalista para testar suporte a SIMD
    return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]));
  } catch (e) {
    return false;
  }
};

/**
 * Obtém ou inicializa o Worker do Tesseract.
 * Implementa retentativa e seleção inteligente de Core (SIMD vs Standard).
 */
export const getOcrWorker = async (retryCount = 0): Promise<TesseractWorker> => {
  if (worker) return worker;
  if (workerLoadingPromise && retryCount === 0) return workerLoadingPromise;

  const MAX_RETRIES = 2;

  workerLoadingPromise = (async () => {
    try {
      const useSimd = isSimdSupported();
      const corePath = useSimd 
        ? OCR_RESOURCES.corePathSimd
        : OCR_RESOURCES.corePath;

      console.log(`[OCR] Inicializando motor v5.1.1 (Tentativa ${retryCount + 1})...`);
      console.log(`[OCR] Aceleração de Hardware (SIMD): ${useSimd ? 'ATIVADA ⚡' : 'DESATIVADA 🐢'}`);
      
      const w = await createWorker('por', 1, {
        workerPath: OCR_RESOURCES.workerPath,
        corePath: corePath,
        langPath: OCR_RESOURCES.langPath,
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
 * Libera memória do Worker se necessário.
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
