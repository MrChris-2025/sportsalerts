import Parse from 'parse';

// Back4App Configuration
Parse.initialize("kgfaEs2YlbM1CBOPiLEGyTNU6TUwsbFayxLUWz6v", "6mPKe3bdTGIBE237fVV7lRei6N9e5oXR7PArQp4Q");
Parse.serverURL = 'https://parseapi.back4app.com/';

const PUBLIC_VAPID_KEY = 'BA8NXZjt4Aj2NsNFZwFQJPvNHoGdz87nVB_0MJCQdbXFMhgOmkWsd-STbCKtgPIBPrWF7-Umqrili8Ef4xS352E';

async function initApp() {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker Registered');

    // Request Notification Permission
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        await subscribeUser(registration);
    }

    startLiveUpdates();
}

async function subscribeUser(registration) {
    const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: PUBLIC_VAPID_KEY
    });

    // Save subscription to Back4App
    const UserSub = Parse.Object.extend("Subscriptions");
    const sub = new UserSub();
    sub.set("endpoint", subscription.endpoint);
    sub.set("keys", {
        p256dh: subscription.getKey('p256dh'),
        auth: subscription.getKey('auth')
    });
    await sub.save();
}

function startLiveUpdates() {
    setInterval(async () => {
        const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard');
        const data = await response.json();
        updateUI(data.events);
    }, 30000);
}

function updateUI(events) {
    const container = document.getElementById('scores-container');
    container.innerHTML = ''; 

    events.forEach(event => {
        const game = event.competitions[0];
        const card = document.createElement('div');
        card.className = 'game-card';
        card.innerHTML = `
            <div class="team">
                <span>${game.competitors[0].team.displayName}</span>
                <span>${game.competitors[0].score}</span>
            </div>
            <div class="team">
                <span>${game.competitors[1].team.displayName}</span>
                <span>${game.competitors[1].score}</span>
            </div>
            <div class="status">${event.status.type.detail}</div>
        `;
        container.appendChild(card);
    });
}

initApp();
