
// Import Workbox
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js');

const CACHE_NAME = 'pdf-annotator-manual-v4'; // Matches offlineService version
const OFFLINE_PAGE = '/index.html';

workbox.setConfig({
  debug: false
});

// Force update on controller change
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

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

// Activate Event: Clean up old caches
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
              // Permite manter o cache manual criado pelo offlineService
              !cacheName.includes('pdf-annotator-offline-manual-v4')) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
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

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-annotations') {
    console.log('[SW] Background sync triggered');
  }
});
