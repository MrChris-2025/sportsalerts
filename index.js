import Parse from 'parse';

// Back4App Config
Parse.initialize("6mPKe3bdTGIBE237fVV7lRei6N9e5oXR7PArQp4Q", "kgfaEs2YlbM1CBOPiLEGyTNU6TUwsbFayxLUWz6v");
Parse.serverURL = 'https://parseapi.back4app.com/';

const VAPID_PUBLIC_KEY = 'BA8NXZjt4Aj2NsNFZwFQJPvNHoGdz87nVB_0MJCQdbXFMhgOmkWsd-STbCKtgPIBPrWF7-Umqrili8Ef4xS352E';

async function init() {
    // Register Service Worker for background push
    if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.register('/sw.js');
    }

    document.getElementById('subscribe-btn').addEventListener('click', subscribeUser);
    fetchScores();
    setInterval(fetchScores, 30000); // Live update every 30s
}

async function subscribeUser() {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY
    });

    // Save subscription to Back4App
    const UserSubscription = Parse.Object.extend("UserSubscription");
    const sub = new UserSubscription();
    sub.set("subscriptionData", subscription);
    sub.set("email", "holdenafart@protonmail.com");
    await sub.save();
    
    alert("Live Alerts Enabled!");
}

async function fetchScores() {
    const Game = Parse.Object.extend("Game");
    const query = new Parse.Query(Game);
    const results = await query.find();

    const container = document.getElementById('score-board');
    container.innerHTML = results.map(game => `
        <div class="game-card">
            <div><strong>${game.get('teamA')} vs ${game.get('teamB')}</strong></div>
            <div class="score">${game.get('scoreA')} - ${game.get('scoreB')}</div>
        </div>
    `).join('');
}

init();
