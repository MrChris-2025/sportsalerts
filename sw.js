self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  
  const title = data.title || 'Score Update';
  const options = {
    body: data.alert || 'A score change occurred!',
    icon: '/icon.png', // Add a 192x192 icon file to your root directory
    badge: '/badge.png',
    data: data
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});
