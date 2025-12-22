import { createWorker, Worker as TesseractWorker } from 'tesseract.js';

export const OCR_RESOURCES = {
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
  corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/tesseract-core.wasm.js',
  corePathSimd: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/tesseract-core-simd.wasm.js',
  wasmPath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/tesseract-core.wasm',
  wasmPathSimd: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/tesseract-core-simd.wasm',
  langPath: 'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0',
};

// Detecção de suporte a SIMD (Single Instruction, Multiple Data)
// Isso permite que o processador execute operações vetoriais, acelerando o OCR em 30-50%.
const isSimdSupported = async () => {
  try {
    return await WebAssembly.validate(new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 
      1, 8, 0, 65, 0, 253, 15, 253, 98, 11
    ]));
  } catch (e) {
    return false;
  }
};

let worker: TesseractWorker | null = null;
let workerLoadingPromise: Promise<TesseractWorker> | null = null;

export const getOcrWorker = async (retryCount = 0): Promise<TesseractWorker> => {
  if (worker) return worker;
  if (workerLoadingPromise && retryCount === 0) return workerLoadingPromise;

  const MAX_RETRIES = 2;

  workerLoadingPromise = (async () => {
    try {
      const simd = await isSimdSupported();
      const corePath = simd 
        ? OCR_RESOURCES.corePathSimd
        : OCR_RESOURCES.corePath;

      console.log(`[OCR] Inicializando motor v5.1.1 (Tentativa ${retryCount + 1}). Modo SIMD: ${simd ? 'ATIVO 🚀' : 'INATIVO 🐢'}`);
      
      const w = await createWorker('por', 1, {
        workerPath: OCR_RESOURCES.workerPath,
        corePath: corePath,
        langPath: OCR_RESOURCES.langPath,
        cacheMethod: 'none',
        logger: (m) => {
            // Logger silencioso para performance
        },
        errorHandler: (err: any) => console.warn("[OCR] Worker warning:", err)
      });

      await w.setParameters({
        tessedit_pageseg_mode: '3' as any, // Auto segmentation
        tessjs_create_hocr: '0',
        tessjs_create_tsv: '0',
        preserve_interword_spaces: '1',
        textord_heavy_nr: '1', // Noise reduction agressivo
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

export const terminateOcrWorker = async () => {
  if (worker) {
    try {
        await worker.terminate();
    } catch (e) {}
    worker = null;
    workerLoadingPromise = null;
  }
};