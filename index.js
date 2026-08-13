Parse.initialize("kgfaEs2YlbM1CBOPiLEGyTNU6TUwsbFayxLUWz6v", "6mPKe3bdTGIBE237fVV7lRei6N9e5oXR7PArQp4Q");
Parse.serverURL = "https://parseapi.back4app.com";

const VAPID_PUBLIC_KEY = "BA8NXZjt4Aj2NsNFZwFQJPvNHoGdz87nVB_0MJCQdbXFMhgOmkWsd-STbCKtgPIBPrWF7-Umqrili8Ef4xS352E";

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function initServiceWorker() {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      return reg;
    } catch (err) {
      console.error('Service Worker registration failed:', err);
    }
  }
  return null;
}

async function setupPushNotifications() {
  const reg = await initServiceWorker();
  if (!reg) return;

  const btn = document.getElementById('btnSubscribe');
  btn.addEventListener('click', async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('Notification permissions were rejected.');
        return;
      }

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      await Parse.Cloud.run('subscribeUser', { subscription: subscription.toJSON() });
      btn.innerText = "Alerts Active ✓";
      btn.style.background = "#22c55e";
    } catch (err) {
      console.error("Push Setup Error:", err);
      alert("Failed to subscribe for push notifications.");
    }
  });
}

async function fetchLiveScores() {
  const container = document.getElementById('scoreboardContainer');
  try {
    const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard');
    const data = await res.json();
    
    container.innerHTML = '';

    if (!data.events || data.events.length === 0) {
      container.innerHTML = `<div class="card" style="text-align:center;">No live NBA games right now.</div>`;
      return;
    }

    data.events.forEach(event => {
      const competition = event.competitions[0];
      const home = competition.competitors.find(c => c.homeAway === 'home');
      const away = competition.competitors.find(c => c.homeAway === 'away');
      const statusText = event.status.type.shortDetail;
      const isLive = event.status.type.state === 'in';

      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-header">
          <span>${isLive ? '<span class="live-dot"></span>LIVE' : statusText}</span>
          <span>${event.name}</span>
        </div>
        <div class="matchup">
          <div class="team away">
            <img class="team-logo" src="${away.team.logo}" alt="${away.team.abbreviation}">
            <span class="team-name">${away.team.abbreviation}</span>
          </div>
          <div class="score">${away.score} - ${home.score}</div>
          <div class="team home">
            <img class="team-logo" src="${home.team.logo}" alt="${home.team.abbreviation}">
            <span class="team-name">${home.team.abbreviation}</span>
          </div>
        </div>
        <button class="tracker-btn" onclick="startTrackingGame('${event.id}')">
          ${isLive ? 'Track Live Push Alerts' : 'Start Background Server Loop'}
        </button>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error("ESPN Fetch Error:", err);
    container.innerHTML = `<div class="card" style="text-align:center; color:#e11d48;">Error connecting to ESPN stream.</div>`;
  }
}

window.startTrackingGame = async function(gameId) {
  try {
    await Parse.Cloud.run('startGameLoop', { gameId });
    alert(`Live tracking enabled for Game ID #${gameId}. Background updates will run via QStash even if app is closed.`);
  } catch (e) {
    console.error(e);
    alert('Failed to start tracking loop.');
  }
};

setupPushNotifications();
fetchLiveScores();
setInterval(fetchLiveScores, 30000);
