// public/index.js - TRUE FRONTEND ENTRY POINT

// 1. Initialize Back4App SDK with provided credentials
Parse.initialize("kgfaEs2YlbM1CBOPiLEGyTNU6TUwsbFayxLUWz6v", "6mPKe3bdTGIBE237fVV7lRei6N9e5oXR7PArQp4Q");
Parse.serverURL = "https://parseapi.back4app.com/";

const VAPID_PUBLIC_KEY = "BA8NXZjt4Aj2NsNFZwFQJPvNHoGdz87nVB_0MJCQdbXFMhgOmkWsd-STbCKtgPIBPrWF7-Umqrili8Ef4xS352E";

let currentSport = "basketball/nba";

// Helper: Convert VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// 2. Register Service Worker and Request Push Subscription
async function initPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('Push Messaging is not supported in this browser.');
    return;
  }

  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    console.log('Service Worker Registered Successfully:', reg);

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });

    console.log('Push Subscription Object:', JSON.stringify(subscription));

    // Save Subscription to Back4App Backend
    await Parse.Cloud.run('saveSubscription', { subscription: subscription.toJSON() });
    alert('Live background alerts activated!');

    // Trigger initial polling loop on Cloud
    await Parse.Cloud.run('pollLiveScores', { sportPath: currentSport });
  } catch (err) {
    console.error('Error enabling push notifications:', err);
  }
}

// 3. Fetch Live ESPN Scores directly from ESPN Hidden API
async function fetchEspnScores() {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${currentSport}/scoreboard`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    renderScoreboard(data.events || []);
    document.getElementById('ticker-status').innerText = `Updated ${new Date().toLocaleTimeString()} — ${data.events?.length || 0} Games Found`;
  } catch (err) {
    console.error('Error fetching ESPN feed:', err);
    document.getElementById('ticker-status').innerText = 'Error connecting to ESPN servers.';
  }
}

// 4. Render ESPN Liquid Glass UI
function renderScoreboard(events) {
  const grid = document.getElementById('games-grid');
  grid.innerHTML = '';

  if (events.length === 0) {
    grid.innerHTML = '<div class="game-card"><p>No live or scheduled games found for this sport today.</p></div>';
    return;
  }

  events.forEach(event => {
    const competition = event.competitions[0];
    const home = competition.competitors.find(c => c.homeAway === 'home');
    const away = competition.competitors.find(c => c.homeAway === 'away');
    const status = event.status.type.shortDetail || event.status.type.description;
    const isLive = event.status.type.state === 'in';

    const card = document.createElement('div');
    card.className = 'game-card';
    card.innerHTML = `
      <div class="card-header">
        <span>${event.season.slug.toUpperCase()}</span>
        <span style="color: ${isLive ? 'var(--live-red)' : 'var(--text-muted)'}; font-weight: 800;">
          ${isLive ? '● LIVE - ' : ''}${status}
        </span>
      </div>
      <div class="team-row">
        <div class="team-info">
          <img class="team-logo" src="${away.team.logo || ''}" alt="${away.team.abbreviation}" />
          <span class="team-name">${away.team.displayName}</span>
        </div>
        <span class="team-score">${away.score || '0'}</span>
      </div>
      <div class="team-row">
        <div class="team-info">
          <img class="team-logo" src="${home.team.logo || ''}" alt="${home.team.abbreviation}" />
          <span class="team-name">${home.team.displayName}</span>
        </div>
        <span class="team-score">${home.score || '0'}</span>
      </div>
      <div class="card-footer">
        <span>${competition.venue?.fullName || 'Stadium'}</span>
        <span>${competition.broadcasts?.[0]?.names?.[0] || 'ESPN'}</span>
      </div>
    `;
    grid.appendChild(card);
  });
}

// 5. App Initialization & Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('push-btn').addEventListener('click', initPushNotifications);
  
  const selector = document.getElementById('sport-selector');
  selector.addEventListener('change', (e) => {
    currentSport = e.target.value;
    fetchEspnScores();
  });

  // Initial fetch
  fetchEspnScores();

  // 30-Second Liquid Glass Refresh Loop while user is viewing page
  setInterval(fetchEspnScores, 30000);
});
