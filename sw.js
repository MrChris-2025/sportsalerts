self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Live Score Update';
  
  const options = {
    body: data.body || 'Game update available.',
    icon: '/icon-192.png',
    tag: data.gameId ? `game-${data.gameId}` : 'general-alert',
    renotify: data.renotify !== undefined ? data.renotify : false,
    data: {
      url: data.url || '/'
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
