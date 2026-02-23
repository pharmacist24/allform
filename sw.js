const CACHE_NAME = 'drug-dispensing-v2';
const BASE_PATH = './'; // This works for GitHub Pages subdirectories

const ASSETS_TO_CACHE = [
    BASE_PATH,
    BASE_PATH + 'index.html',
    BASE_PATH + 'manifest.json',
    // External resources - caching them might fail due to CORS, 
    // so we let the browser handle them or cache them dynamically on fetch.
    // For a stable PWA, it's better to rely on the network for CDNs 
    // or have local fallbacks, but for this setup, we keep it simple.
];

// Install Event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching app shell');
                // We only cache local assets to avoid CORS errors during install
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .catch((err) => console.log('Cache install error:', err))
    );
    self.skipWaiting();
});

// Activate Event
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

// Fetch Event - Network First for HTML, Cache First for Assets
self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    // 1. Never cache Google Scripts (Forms submission) - Always go to network
    if (requestUrl.hostname.includes('script.google.com') || requestUrl.hostname.includes('googleusercontent.com')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // 2. For navigation requests (HTML pages) - Network First
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Clone and cache the fresh response
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    // If offline, try to serve from cache
                    return caches.match(event.request)
                        .then((response) => response || caches.match(BASE_PATH + 'index.html'));
                })
        );
        return;
    }

    // 3. For other requests (CSS, JS, Images) - Stale While Revalidate
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                const fetchPromise = fetch(event.request)
                    .then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200) {
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, networkResponse.clone());
                            });
                        }
                        return networkResponse;
                    })
                    .catch(() => cachedResponse); // Fallback to cache if network fails

                return cachedResponse || fetchPromise;
            })
    );
});