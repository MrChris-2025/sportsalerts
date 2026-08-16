self.addEventListener('push', function(event) {
  if (!event.data) return;

  const data = event.data.json();

  const options = {
    body: data.body,
    icon: data.icon || './icon-192.png',     // optional custom icon
    tag: data.tag,            // matches the game‑ID tag → auto‑overwrites old notifications
    renotify: data.vibrate,   // only buzz the phone when vibrate:true (game over)
    vibrate: [200,100,200],
    data: {
      url: '/'                // where to navigate when the user clicks
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
);
