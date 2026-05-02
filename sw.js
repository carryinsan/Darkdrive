/**
 * DarkDrive Service Worker
 * Ensures the application is available offline as a Progressive Web App (PWA).
 */

const CACHE_NAME = 'darkdrive-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/security.js',
    '/storage.js',
    '/ui.js',
    '/editor.js',
    '/search.js',
    '/backup.js',
    '/settings.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/marked/4.3.0/marked.min.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache');
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Only intercept GET requests
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                
                // Clone the request to prevent stream consumption
                const fetchRequest = event.request.clone();

                return fetch(fetchRequest).then((response) => {
                    // Check if we received a valid response
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }

                    // Clone the response to prevent stream consumption
                    const responseToCache = response.clone();

                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            // Don't cache API calls or external dynamic resources if not defined
                            if(event.request.url.startsWith(self.location.origin)) {
                                cache.put(event.request, responseToCache);
                            }
                        });

                    return response;
                });
            }).catch(() => {
                // If network fails and it's an HTML request, return index
                if (event.request.headers.get('accept').includes('text/html')) {
                    return caches.match('/index.html');
                }
            })
    );
});
