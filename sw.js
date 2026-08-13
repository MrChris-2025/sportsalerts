self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  
  const options = {
    body: data.body || 'Game update available.',
    tag: data.tag || 'live-sports-update',
    renotify: false
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Live Score', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});
