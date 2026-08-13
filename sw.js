// sw.js
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'Live Sports Update';
    const options = {
        body: data.body || 'Check the latest scores!',
        icon: data.icon || './nba-logo.png', // Or a generic sports icon
        badge: data.badge || './badge.png', // Optional: for Android
        tag: data.tag, // This ID ensures only ONE notification exists for this game
        renotify: false, // Don't vibrate for every point, just update the text
        data: {
            url: data.url || '/' // URL to open when notification is clicked
        }
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data.url)
    );
});
