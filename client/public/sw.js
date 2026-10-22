'use strict';
/**
 * Gadhaa Service Worker for offline shell caching and PWA standalone experience.
 */
const CACHE_NAME = 'gadha-cache-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/sounds/gadha.mp3',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Cache addAll warning:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip Socket.IO, WebRTC, API, non-GET or browser extensions
  if (
    req.method !== 'GET' ||
    url.pathname.startsWith('/socket.io') ||
    url.pathname.startsWith('/healthz') ||
    !url.protocol.startsWith('http')
  ) {
    return;
  }

  // HTML navigation requests: Network-first, fall back to cached index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match('/index.html');
          return cached || fetch(req);
        })
    );
    return;
  }

  // Static assets (JS, CSS, fonts, images, sounds): Cache-first with background network update
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh copy in background to keep cache warm
        fetch(req)
          .then((networkResponse) => {
            if (networkResponse.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(req, networkResponse));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(req)
        .then((networkResponse) => {
          if (networkResponse.ok && (url.origin === location.origin || url.hostname.includes('googleapis.com') || url.hostname.includes('gstatic.com'))) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          // If network fails and not cached, return empty or fallback
          return caches.match(req);
        });
    })
  );
});
