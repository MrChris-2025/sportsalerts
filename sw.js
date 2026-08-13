// --- Service Worker for Push Notifications and Offline Capabilities ---

// VAPID Public Key for receiving push notifications
const VAPID_PUBLIC_KEY = 'BA8NXZjt4Aj2NsNFZwFQJPvNHoGdz87nVB_0MJCQdbXFMhgOmkWsd-STbCKtgPIBPrWF7-Umqrili8Ef4xS352E';

// Listen for push events
self.addEventListener('push', event => {
    console.log('Push received.');
    const data = event.data.json(); // Assuming payload is JSON

    const title = data.notification.title || 'Live Score Update';
    const body = data.notification.body || 'A game score has been updated.';
    const tag = data.tag || 'default-tag'; // Use tag for payload updates
    const icon = data.notification.icon || './nba-logo.png'; // Default icon

    const options = {
        body: body,
        icon: icon,
        tag: tag, // This ensures only ONE notification for a specific game exists
        renotify: false, // Set to true if you want renotify behavior (e.g., vibrations)
        // Other options like actions can be added here
    };

    // Show the notification
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Optional: Listen for notification click events
self.addEventListener('notificationclick', event => {
    console.log('Notification clicked.');
    event.notification.close(); // Close the notification

    // Optional: Open a specific URL when the notification is clicked
    // This could be a URL to the specific game or the app's main page.
    const url = self.clients.openWindow('/'); // Example: Opens the app's root URL
    if (url) {
        url.then(windowClient => {
            if (windowClient) {
                // Optionally focus on the client window if it's already open
                windowClient.focus();
            }
        });
    }
});

// Optional: Handle background sync if you implement that feature
// self.addEventListener('sync', event => {
//     if (event.tag === 'sync-scores') {
//         event.waitUntil(
//             // Perform background sync logic here
//             console.log('Background sync for scores triggered.')
//         );
//     }
// });

// Register VAPID public key for push messaging
self.addEventListener('push', async (event) => {
    if (!event.data) {
        return;
    }
    const payload = event.data.json();
    const title = payload.notification.title || 'Live Score';
    const body = payload.notification.body || 'Score updated.';
    const tag = payload.tag || `game-${Date.now()}`; // Ensure a unique tag
    const icon = payload.notification.icon || './nba-logo.png';

    // IMPORTANT: The VAPID private key should NEVER be on the client-side (service worker or main JS).
    // It must be used by the server/cloud function sending the push.
    // The VAPID_PUBLIC_KEY is okay to have on the client to subscribe.

    const options = {
        body: body,
        icon: icon,
        tag: tag,
        renotify: false, // Avoid multiple notifications for the same game event
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// Request permission for push notifications upon service worker registration (optional, but good UX)
self.addEventListener('activate', async (event) => {
    try {
        const subscription = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
        console.log('Push subscription successful:', subscription);
        // You would typically send this subscription object to your server/Back4App
        // to store it and associate it with a user.
    } catch (error) {
        console.error('Push subscription failed:', error);
    }
});

// Helper function to convert base64 string to Uint8Array
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = base64String.replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64 + padding);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
