self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};

  const title = data.title || 'ESPN Score Update';
  const options = {
    body: data.body || 'New game action recorded!',
    icon: '/icon.png',
    badge: '/badge.png',
    vibrate: [200, 100, 200],
    data: { url: data.data?.url || '/' }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});
