// index.js
import Parse from 'parse'; // Or use the global Parse if loaded via script tag

// Back4App Initialization
Parse.initialize("kgfaEs2YlbM1CBOPiLEGyTNU6TUwsbFayxLUWz6v", "6mPKe3bdTGIBE237fVV7lRei6N9e5oXR7PArQp4Q"); // Back4App App ID, Back4App JS Key
Parse.serverURL = 'https://parseapi.back4app.com';

const VAPID_PUBLIC_KEY = 'BA8NXZjt4Aj2NsNFZwFQJPvNHoGdz87nVB_0MJCQdbXFMhgOmkWsd-STbCKtgPIBPrWF7-Umqrili8Ef4xS352E'; // VAPID_PUBLIC_KEY

const subscribeButton = document.getElementById('subscribeButton');
const scoresContainer = document.getElementById('scores-container');

// Function to register the service worker
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered successfully:', registration);
            return registration;
        } catch (error) {
            console.error('Service Worker registration failed:', error);
            return null;
        }
    } else {
        console.warn('Service Workers are not supported in this browser.');
        return null;
    }
}

// Function to subscribe the user to push notifications
async function subscribeUserToPush() {
    subscribeButton.disabled = true;
    const serviceWorkerRegistration = await registerServiceWorker();
    if (!serviceWorkerRegistration) {
        alert('Push notifications not supported or service worker failed to register.');
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            throw new Error('Notification permission not granted.');
        }

        const pushSubscription = await serviceWorkerRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        console.log('Push Subscription:', pushSubscription);

        // Send subscription to your Back4App backend
        await Parse.Cloud.run('subscribeUserToPush', {
            subscription: pushSubscription
        });
        alert('Successfully subscribed to push notifications!');
        subscribeButton.textContent = 'Subscribed!';
    } catch (error) {
        console.error('Failed to subscribe the user:', error);
        alert('Failed to subscribe to push notifications. Please check console for details.');
        subscribeButton.disabled = false;
        subscribeButton.textContent = 'Enable Push Notifications';
    }
}

// Utility function to convert VAPID public key
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Function to render scores on the UI
function renderScores(scores) {
    scoresContainer.innerHTML = ''; // Clear previous scores
    if (scores.length === 0) {
        scoresContainer.innerHTML = '<div class="loading-message">No live games currently.</div>';
        return;
    }

    scores.forEach(game => {
        const gameStatusClass = game.status === 'in progress' ? 'live' : (game.status === 'final' ? 'final' : '');
        const scoreCard = `
            <div class="score-card">
                <div class="game-info">${game.sport.toUpperCase()} / ${game.league.toUpperCase()}</div>
                <div class="teams">
                    <div class="team">
                        <div class="team-name">${game.homeTeamName}</div>
                        <div class="team-score">${game.homeTeamScore}</div>
                    </div>
                    <div class="vs">VS</div>
                    <div class="team">
                        <div class="team-name">${game.awayTeamName}</div>
                        <div class="team-score">${game.awayTeamScore}</div>
                    </div>
                </div>
                <div class="game-status ${gameStatusClass}">${game.status.toUpperCase()}</div>
            </div>
        `;
        scoresContainer.innerHTML += scoreCard;
    });
}

// Function to fetch live scores for UI
async function fetchLiveScoresForUI() {
    try {
        const liveScores = await Parse.Cloud.run('getLiveScoresForUI');
        renderScores(liveScores);
    } catch (error) {
        console.error('Error fetching live scores for UI:', error);
        scoresContainer.innerHTML = '<div class="loading-message">Error loading scores. Please try again later.</div>';
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await registerServiceWorker();
    fetchLiveScoresForUI(); // Initial fetch
    setInterval(fetchLiveScoresForUI, 30000); // Update UI every 30 seconds

    subscribeButton.addEventListener('click', subscribeUserToPush);

    // Check if already subscribed
    if ('serviceWorker' in navigator && 'PushManager' in window) {
        navigator.serviceWorker.ready.then(async (registration) => {
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                subscribeButton.textContent = 'Subscribed!';
                subscribeButton.disabled = true;
            } else {
                subscribeButton.disabled = false;
            }
        });
    } else {
        subscribeButton.disabled = true;
        subscribeButton.textContent = 'Push Not Supported';
    }
});
