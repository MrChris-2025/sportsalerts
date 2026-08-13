// public/sw.js - Service Worker for Background Web Push

self.addEventListener('push', function(event) {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    
    const title = payload.title || 'ESPN Live Alert';
    const options = {
      body: payload.body || 'Score Update Received',
      icon: payload.icon || 'https://a.espncdn.com/favicon.ico',
      tag: payload.tag || 'espn-game-update', // Tag ensures only ONE lockscreen notification per game
      renotify: false,                       // Does not vibrate repeatedly for every minor score increment
      data: { url: payload.url || '/' }
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (e) {
    console.error('Error rendering push notification payload:', e);
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
