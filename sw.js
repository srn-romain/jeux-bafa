/* ================================================================
   SERVICE WORKER - Espace Anim BAFA
   Gestion du mode hors ligne (PWA) et des notifications
   ================================================================ */

const CACHE_NAME = 'bafa-espace-v5';

const PRECACHE_URLS = [
    './',
    './index.html',
    './manifest.json',
    './favicon.webp',
    './public/images/favicon.webp',
    './assets/css/style.css',
    './assets/css/styleEspace.css',
    './assets/js/main.js',
    './assets/js/firebase-config.js',
    './assets/js/espace-auth.js',
    './assets/js/espace-index.js',
    './assets/js/espace-colo.js',
    './assets/js/espace-colo-form.js',
    './pages/espace/index.html',
    './pages/espace/espace.html',
    'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js',
    'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage-compat.js',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;800&display=swap',
    'https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js'
];

// Installation : Mise en cache préalable des ressources essentielles
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            await Promise.allSettled(
                PRECACHE_URLS.map(url =>
                    cache.add(url).catch(err => console.warn('PWA Precache skipped:', url, err))
                )
            );
        }).then(() => self.skipWaiting())
    );
});

// Activation : Nettoyage des anciens caches
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
        }).then(() => clients.claim())
    );
});

// Fetch : Stratégie de mise en cache
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Ne pas intercepter les requêtes non-GET
    if (event.request.method !== 'GET') return;

    // Ne pas intercepter les protocoles spéciaux
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    // Ne pas intercepter les appels API Firebase / Identity / Analytics
    if (
        url.hostname.includes('firestore.googleapis.com') ||
        url.hostname.includes('identitytoolkit.googleapis.com') ||
        url.hostname.includes('securetoken.googleapis.com') ||
        url.hostname.includes('firebasestorage.googleapis.com') ||
        url.hostname.includes('google-analytics.com') ||
        url.hostname.includes('googletagmanager.com')
    ) {
        return;
    }

    // 1. Requêtes de navigation (HTML) : Network First avec Fallback Cache
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const clone = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return networkResponse;
                })
                .catch(async () => {
                    // Hors ligne : chercher la page dans le cache avec ou sans query params
                    const cachedResponse = await caches.match(event.request, { ignoreSearch: true });
                    if (cachedResponse) return cachedResponse;

                    if (url.pathname.includes('espace.html')) {
                        const fallbackColo = await caches.match('./pages/espace/espace.html', { ignoreSearch: true });
                        if (fallbackColo) return fallbackColo;
                    }
                    if (url.pathname.includes('/espace/') || url.pathname.endsWith('index.html')) {
                        const fallbackIndex = await caches.match('./pages/espace/index.html', { ignoreSearch: true });
                        if (fallbackIndex) return fallbackIndex;
                    }
                    return caches.match('./index.html', { ignoreSearch: true });
                })
        );
        return;
    }

    // 2. Ressources statiques (CSS, JS, images, polices) : Stale-While-Revalidate
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request)
                .then((networkResponse) => {
                    if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                        const clone = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return networkResponse;
                })
                .catch(() => {});

            return cachedResponse || fetchPromise;
        })
    );
});

// Écouter les messages pour afficher des notifications localement
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        const { title, body, icon, data } = event.data.payload;

        const options = {
            body: body,
            icon: icon || './public/images/favicon.webp',
            badge: './public/images/favicon.webp',
            vibrate: [200, 100, 200],
            data: data,
            tag: 'alert-notification',
            renotify: true,
            actions: [
                { action: 'open', title: 'Voir l\'alerte' }
            ]
        };

        event.waitUntil(
            self.registration.showNotification(title, options)
        );
    }
});

// Gérer le clic sur la notification
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'open' || !event.action) {
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
                for (const client of clientList) {
                    if (client.url.includes('/espace/') && 'focus' in client) {
                        return client.focus();
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow('./pages/espace/index.html');
                }
            })
        );
    }
});
