// --- PWA BUILDER / LIGHTHOUSE COMPATIBILITY ---
// Listeners nativos no topo garantem que o arquivo seja reconhecido como um Service Worker válido
// mesmo se o importScripts do Workbox falhar ou demorar.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Import Workbox com tratamento de erro básico
try {
  importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js');
} catch (e) {
  console.error('Falha ao carregar Workbox SW:', e);
}

const CACHE_NAME = 'pdf-annotator-manual-v4'; // Matches offlineService version
const OFFLINE_PAGE = '/index.html';

// Configuração Condicional do Workbox
if (typeof workbox !== 'undefined') {
  workbox.setConfig({
    debug: false
  });

  // 1. Navigation (HTML)
  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new workbox.strategies.NetworkFirst({
      cacheName: 'pages-cache',
      networkTimeoutSeconds: 3,
      plugins: [
        new workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [0, 200],
        }),
      ],
    })
  );

  workbox.routing.setCatchHandler(async ({ event }) => {
    if (event.request.destination === 'document') {
      return caches.match(OFFLINE_PAGE);
    }
    return Response.error();
  });

  // 2. Scripts, Styles, & CDNs
  workbox.routing.registerRoute(
    ({ request, url }) => 
      request.destination === 'script' || 
      request.destination === 'style' ||
      url.hostname.includes('cdn') || 
      url.hostname.includes('esm.sh') ||
      url.hostname.includes('projectnaptha') || 
      url.hostname.includes('aistudiocdn.com') ||
      url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com'),
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'assets-cache',
      plugins: [
        new workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [0, 200],
        }),
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 300, 
          maxAgeSeconds: 90 * 24 * 60 * 60, // 90 Dias
        }),
      ],
    })
  );

  // 3. Images & Fonts
  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'image' || request.destination === 'font',
    new workbox.strategies.CacheFirst({
      cacheName: 'static-resources',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 150, 
          maxAgeSeconds: 180 * 24 * 60 * 60, // 180 Dias
          purgeOnQuotaError: true,
        }),
        new workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [0, 200],
        }),
      ],
    })
  );

  // 4. API Calls
  workbox.routing.registerRoute(
    ({ url }) => 
      url.hostname.includes('googleapis.com') || 
      url.hostname.includes('firebase') || 
      url.hostname.includes('firestore'),
    new workbox.strategies.NetworkOnly()
  );

  // 5. Share Target (POST)
  // Intercepta arquivos compartilhados via PWA Share Target e salva no Cache para a App ler
  workbox.routing.registerRoute(
    ({ url, request }) => request.method === 'POST' && url.searchParams.get('source') === 'share',
    async ({ request }) => {
      const formData = await request.formData();
      const files = formData.getAll('file');
      
      const cache = await caches.open('share-target-cache');
      
      // Armazena arquivos temporariamente. A UI deve ler e limpar.
      await Promise.all(files.map(f => {
         return cache.put(
           new Request(`/shared/${f.name}`), 
           new Response(f, { headers: { 'Content-Type': f.type } })
         );
      }));

      // Redireciona para o app com flag para processar
      return Response.redirect('/?share_target=true', 303);
    },
    'POST'
  );

} else {
  console.log('Workbox não carregado. SW rodando em modo fallback.');
}

// Assets to precache (Critical Shell Only)
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/maskable-icon.svg',
  'https://cdn.tailwindcss.com/3.4.1',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/web/pdf_viewer.css',
];

// Eventos Nativos (Install/Activate)
// Mantidos fora do bloco Workbox para garantir funcionalidade básica
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
          return cache.addAll(APP_SHELL).catch(err => {
              console.warn("SW Install: Failed to cache some shell assets", err);
          });
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Mantém caches conhecidos e o atual
          if (cacheName !== CACHE_NAME && 
              cacheName !== 'static-resources' && 
              cacheName !== 'assets-cache' && 
              cacheName !== 'pages-cache' &&
              cacheName !== 'share-target-cache' &&
              !cacheName.includes('pdf-annotator-offline-manual-v4')) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-annotations') {
    console.log('[SW] Background sync triggered');
  }
});