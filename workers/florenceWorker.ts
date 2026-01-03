
import { pipeline, env } from '@xenova/transformers';

// Configuração para evitar download de binários do Node
env.allowLocalModels = false;
env.useBrowserCache = true;

// Definição de Tipos
interface FlorenceWorkerMessage {
  type: 'init' | 'process';
  data?: any;
  modelId?: string;
}

interface ProcessData {
  imageUrl: string; // Blob URL ou Data URL
  task: string;
}

// Estado do Worker
let modelPipeline: any = null;
let modelId = 'Xenova/florence-2-base-ft'; 

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as FlorenceWorkerMessage;

  try {
    if (msg.type === 'init') {
      await initializeModel(msg.modelId);
    } else if (msg.type === 'process' && msg.data) {
      await processImage(msg.data);
    }
  } catch (err: any) {
    self.postMessage({ status: 'error', error: err.message });
  }
};

async function initializeModel(id?: string) {
  if (modelPipeline) {
    self.postMessage({ status: 'ready', message: 'Modelo já carregado.' });
    return;
  }

  if (id) modelId = id;

  self.postMessage({ status: 'progress', message: 'Carregando Florence-2 (Isso pode demorar)...', progress: 0 });

  try {
    modelPipeline = await pipeline('image-to-text', modelId, {
      progress_callback: (data: any) => {
        if (data.status === 'progress') {
          self.postMessage({ 
            status: 'downloading', 
            file: data.file, 
            progress: data.progress 
          });
        }
      }
    });

    self.postMessage({ status: 'ready', message: 'Modelo Florence-2 carregado com sucesso.' });
  } catch (e) {
    console.error(e);
    throw new Error('Falha ao carregar modelo Florence-2.');
  }
}

async function processImage(data: ProcessData) {
  if (!modelPipeline) throw new Error("Modelo não inicializado.");

  const { imageUrl, task } = data; 

  // Configurações de Geração Otimizadas
  // repetition_penalty: Evita loops em texturas repetitivas
  const output = await modelPipeline(imageUrl, {
    text: task || '<OCR>',
    max_new_tokens: 1024,
    repetition_penalty: 1.05, 
  });
  
  self.postMessage({ status: 'done', result: output });
}
