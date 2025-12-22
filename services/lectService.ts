
import JSZip from 'jszip';
import { MIME_TYPES } from '../types';

export const LECT_FORMAT_VERSION = 2;

export interface LectoriumManifest {
  formatVersion: number;
  type: 'document' | 'mindmap' | 'pdf_wrapper';
  title: string;
  createdAt: string;
  updatedAt: string;
  appVersion: string;
  metadata?: Record<string, any>;
}

export interface LectoriumPackage {
  manifest: LectoriumManifest;
  data: any; // O conteúdo principal (JSON, Estado do Editor, etc)
  assets: Record<string, Blob>; // Cache imediato (compatibilidade)
  sourceBlob?: Blob; // PDF original ou arquivo encapsulado
  zipHandle: JSZip; // Handle para Lazy Loading avançado
}

// Lista de tipos MIME permitidos para recursos (Segurança)
const SAFE_RESOURCE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf', 'text/plain', 'text/markdown', 'application/json'
]);

// Tipos que não ganham muito com recompressão (usar STORE)
const ALREADY_COMPRESSED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 
  'application/pdf', 'application/zip', 'video/mp4'
]);

/**
 * Cria um arquivo .lect (Container ZIP Otimizado)
 */
export async function packLectoriumFile(
  type: 'document' | 'mindmap' | 'pdf_wrapper',
  data: any,
  title: string,
  assets: Record<string, Blob> = {},
  sourceBlob?: Blob
): Promise<Blob> {
  const zip = new JSZip();

  // 1. Criar Manifesto (STORE - Acesso rápido sem descompressão)
  const manifest: LectoriumManifest = {
    formatVersion: LECT_FORMAT_VERSION,
    type,
    title,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    appVersion: '1.0.0'
  };

  zip.file("manifest.json", JSON.stringify(manifest, null, 2), { 
    compression: "STORE" 
  });

  // 2. Adicionar Dados de Conteúdo (DEFLATE - Texto comprime muito bem)
  // Estrutura modular: content/data.json
  zip.file("content/data.json", JSON.stringify(data), { 
    compression: "DEFLATE", 
    compressionOptions: { level: 9 } 
  });

  // 3. Adicionar Assets com Compressão Seletiva
  if (Object.keys(assets).length > 0) {
    const assetsFolder = zip.folder("resources");
    if (assetsFolder) {
      for (const [name, blob] of Object.entries(assets)) {
        // Determinar estratégia de compressão baseada no tipo
        const isCompressed = ALREADY_COMPRESSED_TYPES.has(blob.type);
        
        // Construir opções de compressão de forma segura para TS
        const options: any = {
            compression: isCompressed ? "STORE" : "DEFLATE"
        };
        if (!isCompressed) {
            options.compressionOptions = { level: 6 };
        }
        
        assetsFolder.file(name, blob as any, options);
      }
    }
  }

  // 4. Adicionar Blob Fonte (PDF/Original)
  if (sourceBlob) {
    const isCompressed = ALREADY_COMPRESSED_TYPES.has(sourceBlob.type);
    // TS Fix: Cast blob to any/Blob to satisfy JSZip types in this context
    zip.file("content/source.bin", sourceBlob as any, {
      compression: isCompressed ? "STORE" : "DEFLATE"
    });
  }

  // 5. Gerar Blob Final
  return await zip.generateAsync({
    type: 'blob',
    mimeType: MIME_TYPES.LECTORIUM,
    compression: 'DEFLATE',
    platform: 'UNIX' // Garante permissões consistentes ao extrair
  });
}

/**
 * Abre um arquivo .lect, valida e extrai conteúdo com verificações de segurança.
 */
export async function unpackLectoriumFile(fileBlob: Blob): Promise<LectoriumPackage> {
  try {
    const zip = await JSZip.loadAsync(fileBlob);

    // 1. Ler e Validar Manifesto
    const manifestFile = zip.file("manifest.json");
    if (!manifestFile) throw new Error("Arquivo inválido: manifesto não encontrado.");
    
    const manifestText = await manifestFile.async("string");
    let manifest: LectoriumManifest;
    
    try {
        manifest = JSON.parse(manifestText);
        // Validação básica de Schema
        if (!manifest.type || !manifest.formatVersion) {
            throw new Error("Manifesto malformado.");
        }
    } catch (e) {
        throw new Error("Manifesto corrompido.");
    }

    // 2. Ler Dados Principais
    const dataFile = zip.file("content/data.json");
    let data = null;
    if (dataFile) {
      const dataText = await dataFile.async("string");
      try {
        data = JSON.parse(dataText);
      } catch (e) {
        console.error("Erro ao parsear data.json", e);
        // Tenta recuperar o possível
        data = {}; 
      }
    }

    // 3. Ler Blob Fonte (se existir)
    let sourceBlob: Blob | undefined = undefined;
    const sourceFile = zip.file("content/source.bin");
    if (sourceFile) {
      sourceBlob = await sourceFile.async("blob");
    }

    // 4. Ler Assets (Com verificação de segurança)
    const assets: Record<string, Blob> = {};
    const resources = zip.folder("resources");
    
    if (resources) {
      const files: { path: string, file: JSZip.JSZipObject }[] = [];
      resources.forEach((relativePath, file) => {
        if (!file.dir) files.push({ path: relativePath, file });
      });
      
      await Promise.all(files.map(async (entry) => {
         // Verificação de Segurança (Detectar tipo real seria ideal, aqui confiamos na extensão/contexto por enquanto)
         // Em produção, usar assinatura de bytes (magic numbers) seria melhor.
         
         const blob = await entry.file.async("blob");
         
         // Validar tamanho (evitar zip bombs ou arquivos gigantes inesperados em assets)
         if (blob.size > 50 * 1024 * 1024) { // 50MB limit per asset
             console.warn(`Asset ${entry.path} ignorado: muito grande.`);
             return;
         }

         assets[entry.path] = blob;
      }));
    }

    return {
      manifest,
      data,
      assets,
      sourceBlob,
      zipHandle: zip // Retorna o zip aberto para permitir lazy loading futuro se necessário
    };

  } catch (e: any) {
    console.error("Erro ao abrir arquivo .lect:", e);
    throw new Error("Falha ao ler formato Lectorium: " + e.message);
  }
}
