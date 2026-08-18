self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { alert: event.data.text() };
    }
  }

  const title = data.title || 'ESPN Alert Hub';
  const options = {
    body: data.alert || data.body || 'New score update received!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'espn-score-update',
    renotify: true,
    data: data
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
