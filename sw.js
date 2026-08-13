self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  
  // The Payload Tagging Principle
  const options = {
    body: data.body || 'Game update available.',
    icon: './nba-logo.png', // Fallback icon path if available
    tag: data.tag || 'live-sports-update', // Ensures ONE notification per game overwrites
    renotify: false // Doesn't vibrate the phone for every single point
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
