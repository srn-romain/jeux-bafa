/* ================================================================
   SERVICE WORKER - Espace Anim BAFA
   Gestion des notifications et du cache basique
   ================================================================ */

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// Écouter les messages pour afficher des notifications localement
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        const { title, body, icon, data } = event.data.payload;

        const options = {
            body: body,
            icon: icon || '/jeux-bafa/public/images/favicon.webp',
            badge: '/jeux-bafa/public/images/favicon.webp',
            vibrate: [200, 100, 200],
            data: data,
            tag: 'alert-notification', // Évite d'empiler trop de notifications
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
                // Si une fenêtre est déjà ouverte, on la focus
                for (const client of clientList) {
                    if (client.url.includes('/espace/') && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Sinon on ouvre une nouvelle fenêtre
                if (clients.openWindow) {
                    return clients.openWindow('/jeux-bafa/pages/espace/index.html');
                }
            })
        );
    }
});
