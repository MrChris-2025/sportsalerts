self.addEventListener('push', function(event) {
    const data = event.data.json();
    
    const options = {
        body: data.body,
        icon: 'https://cdn-icons-png.flaticon.com/512/5358/5358656.png',
        tag: data.gameId, // Overwrites previous score for same game
        renotify: false
    };

    event.waitUntil(
        self.registration.showNotification(
