
const CACHE_NAME = 'pdf-annotator-offline-manual-v5'; // Bump version

// Definição das Categorias de Recursos
export type ResourceCategory = 'core' | 'pdf_office' | 'tools';

export const ALL_CATEGORIES: ResourceCategory[] = ['core', 'pdf_office', 'tools'];

interface ResourceGroup {
  id: ResourceCategory;
  label: string;
  description: string;
  urls: string[]; // URLs estáticas/conhecidas
  keywords: string[]; // Palavras-chave para capturar do importmap/index.html
  required?: boolean;
}

export const AVAILABLE_RESOURCES: ResourceGroup[] = [
  {
    id: 'core',
    label: 'Sistema Base',
    description: 'Interface, lógica principal, ícones e React. (~2MB)',
    required: true,
    keywords: ['react', 'react-dom', 'firebase', 'lucide', 'vite', 'tailwind', 'idb', 'scheduler', 'bg-sidebar'], 
    urls: [
      '/',
      '/index.html',
      '/manifest.json',
      '/icons/icon.svg',
      '/icons/maskable-icon.svg',
      '/icons/shortcut-files.svg',
      '/icons/shortcut-mindmap.svg',
      '/icons/file-pdf.svg',
      'https://cdn.tailwindcss.com/3.4.1',
    ]
  },
  {
    id: 'pdf_office',
    label: 'PDF & Documentos',
    description: 'Motores de renderização PDF e edição DOCX. Essencial para arquivos. (~4MB)',
    required: true,
    keywords: ['pdfjs-dist', 'pdf-lib', 'docx', 'mammoth', 'jszip', 'file-saver'],
    urls: [
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/web/pdf_viewer.css',
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs',
    ]
  },
  {
    id: 'tools',
    label: 'Ferramentas Visuais',
    description: 'Gráficos (Mermaid), Tabelas, Matemática (KaTeX) e QR Code. (~3MB)',
    required: false,
    keywords: ['mermaid', 'katex', 'recharts', 'qrcode', 'd3', 'dagre', 'khroma', 'stylis'],
    urls: [
      'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css',
      'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css',
    ]
  }
];

// Helper para identificar a categoria de uma URL baseada nas keywords
function identifyCategory(url: string): ResourceCategory {
  const lowerUrl = url.toLowerCase();
  const categoriesToCheck: ResourceCategory[] = ['tools', 'pdf_office'];
  
  for (const catId of categoriesToCheck) {
    const group = AVAILABLE_RESOURCES.find(g => g.id === catId);
    if (group && group.keywords.some(k => lowerUrl.includes(k))) {
      return catId;
    }
  }
  return 'core';
}

/**
 * Helper para formatar bytes em string legível
 */
function formatSize(bytes: number): string {
    if (bytes === 0) return "0 KB";
    const mb = bytes / (1024 * 1024);
    if (mb < 1) {
        return `${(bytes / 1024).toFixed(0)} KB`;
    }
    return `${mb.toFixed(1)} MB`;
}

export async function deleteOfflineResources(): Promise<void> {
  if ('caches' in window) {
    await caches.delete(CACHE_NAME);
  }
}

export async function cacheAppResources(
  selectedCategories: ResourceCategory[], 
  onProgress?: (progress: number) => void
): Promise<string> {
  const cache = await caches.open(CACHE_NAME);
  let totalBytesActual = 0;
  
  const finalUrlsToCache = new Set<string>();

  // 1. Adicionar URLs estáticas
  AVAILABLE_RESOURCES.forEach(group => {
    if (group.required || selectedCategories.includes(group.id)) {
      group.urls.forEach(u => finalUrlsToCache.add(u));
    }
  });

  // 2. Assets Dinâmicos
  try {
     const res = await fetch('/index.html?t=' + Date.now());
     if (res.ok) {
         const html = await res.text();
         const parser = new DOMParser();
         const doc = parser.parseFromString(html, 'text/html');
         const urlsFound: string[] = [];

         const importMap = doc.querySelector('script[type="importmap"]');
         if (importMap && importMap.textContent) {
            try {
               const json = JSON.parse(importMap.textContent);
               if (json.imports) {
                  Object.values(json.imports).forEach((u: any) => {
                      if (typeof u === 'string') urlsFound.push(u);
                  });
               }
            } catch(e) {}
         }

         doc.querySelectorAll('script[src]').forEach(s => {
             const src = s.getAttribute('src');
             if (src) urlsFound.push(src);
         });
         doc.querySelectorAll('link[rel="stylesheet"], link[rel="modulepreload"]').forEach(l => {
             const href = l.getAttribute('href');
             if (href) urlsFound.push(href);
         });

         urlsFound.forEach(url => {
             const category = identifyCategory(url);
             const group = AVAILABLE_RESOURCES.find(g => g.id === category);
             if (group && (group.required || selectedCategories.includes(category))) {
                 finalUrlsToCache.add(url);
             }
         });
     }
  } catch (e) {}

  const urlsArray = Array.from(finalUrlsToCache);
  let completed = 0;
  const CONCURRENCY_LIMIT = 6;
  
  for (let i = 0; i < urlsArray.length; i += CONCURRENCY_LIMIT) {
      const chunk = urlsArray.slice(i, i + CONCURRENCY_LIMIT);
      await Promise.all(chunk.map(async (url) => {
          try {
              const req = new Request(url, { cache: 'reload', mode: 'cors' });
              const res = await fetch(req);
              if (res.ok) {
                  const clone = res.clone();
                  const blob = await clone.blob();
                  totalBytesActual += blob.size;
                  await cache.put(req, res);
              }
          } catch (e) {
          } finally {
              completed++;
              if (onProgress) onProgress(Math.round((completed / urlsArray.length) * 100));
          }
      }));
  }

  return formatSize(totalBytesActual);
}

export async function getOfflineCacheSize(): Promise<string | null> {
  if (!('caches' in window)) return null;

  const hasCache = await caches.has(CACHE_NAME);
  if (!hasCache) return null;

  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  if (keys.length === 0) return null;

  let totalBytes = 0;
  try {
    for (const request of keys) {
        const response = await cache.match(request);
        if (response) {
            const blob = await response.clone().blob();
            totalBytes += blob.size;
        }
    }
  } catch (e) {
      return null;
  }

  return formatSize(totalBytes);
}