Parse.initialize("kgfaEs2YlbM1CBOPiLEGyTNU6TUwsbFayxLUWz6v", "6mPKe3bdTGIBE237fVV7lRei6N9e5oXR7PArQp4Q");
Parse.serverURL = "https://parseapi.back4app.com";

const VAPID_PUBLIC_KEY = "BA8NXZjt4Aj2NsNFZwFQJPvNHoGdz87nVB_0MJCQdbXFMhgOmkWsd-STbCKtgPIBPrWF7-Umqrili8Ef4xS352E";

let currentSportPath = "basketball/nba";
let autoRefreshInterval = null;

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

  const btnSubscribe = document.getElementById('btnSubscribe');
  const btnTestPush = document.getElementById('btnTestPush');

  btnSubscribe.addEventListener('click', async () => {
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
      btnSubscribe.innerText = "Alerts Active ✓";
      btnSubscribe.style.background = "#22c55e";
    } catch (err) {
      console.error("Push Setup Error:", err);
      alert("Failed to subscribe for push notifications.");
    }
  });

  btnTestPush.addEventListener('click', async () => {
    try {
      btnTestPush.innerText = "Sending...";
      const res = await Parse.Cloud.run('sendTestPush');
      alert(`Test Push Sent! Delivered to ${res.sentCount} subscriber(s).`);
      btnTestPush.innerText = "Test Push Now";
    } catch (err) {
      console.error("Test Push Error:", err);
      alert("Failed to send test push notification.");
      btnTestPush.innerText = "Test Push Now";
    }
  });
}

function setupSportsNav() {
  const nav = document.getElementById('sportsNav');
  nav.addEventListener('click', (e) => {
    if (e.target.classList.contains('sport-tab')) {
      document.querySelectorAll('.sport-tab').forEach(tab => tab.classList.remove('active'));
      e.target.classList.add('active');
      currentSportPath = e.target.getAttribute('data-sport');
      fetchLiveScores();
    }
  });
}

async function fetchLiveScores() {
  const container = document.getElementById('scoreboardContainer');
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${currentSportPath}/scoreboard`);
    const data = await res.json();
    
    container.innerHTML = '';

    if (!data.events || data.events.length === 0) {
      container.innerHTML = `<div class="card" style="text-align:center;">No live events scheduled right now for this sport.</div>`;
      return;
    }

    data.events.forEach(event => {
      const competition = event.competitions[0];
      const statusText = event.status.type.shortDetail;
      const isLive = event.status.type.state === 'in';

      const away = competition.competitors ? competition.competitors.find(c => c.homeAway === 'away') || competition.competitors[1] : null;
      const home = competition.competitors ? competition.competitors.find(c => c.homeAway === 'home') || competition.competitors[0] : null;

      const awayName = away?.team?.abbreviation || away?.athlete?.displayName || away?.displayName || 'Away';
      const homeName = home?.team?.abbreviation || home?.athlete?.displayName || home?.displayName || 'Home';

      const awayLogo = away?.team?.logo || away?.athlete?.headshot || 'https://a.espncdn.com/favicon.ico';
      const homeLogo = home?.team?.logo || home?.athlete?.headshot || 'https://a.espncdn.com/favicon.ico';

      const awayScore = away?.score ?? '0';
      const homeScore = home?.score ?? '0';

      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-header">
          <span>${isLive ? '<span class="live-dot"></span>LIVE' : statusText}</span>
          <span>${event.name}</span>
        </div>
        <div class="matchup">
          <div class="team away">
            <img class="team-logo" src="${awayLogo}" alt="${awayName}" onerror="this.src='https://a.espncdn.com/favicon.ico'">
            <span class="team-name">${awayName}</span>
          </div>
          <div class="score">${awayScore} - ${homeScore}</div>
          <div class="team home">
            <img class="team-logo" src="${homeLogo}" alt="${homeName}" onerror="this.src='https://a.espncdn.com/favicon.ico'">
            <span class="team-name">${homeName}</span>
          </div>
        </div>
        <button class="tracker-btn" onclick="startTrackingGame('${event.id}', '${currentSportPath}')">
          ${isLive ? 'Track Live Push Alerts' : 'Start Background Server Loop'}
        </button>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error("ESPN Fetch Error:", err);
    container.innerHTML = `<div class="card" style="text-align:center; color:#e11d48;">Error connecting to ESPN Live Stream.</div>`;
  }
}

window.startTrackingGame = async function(gameId, sportPath) {
  try {
    await Parse.Cloud.run('startGameLoop', { gameId, sportPath });
    alert(`Live tracking enabled for Event ID #${gameId}! Background updates will run via QStash even if app is closed.`);
  } catch (e) {
    console.error(e);
    alert('Failed to start tracking loop.');
  }
};

setupPushNotifications();
setupSportsNav();
fetchLiveScores();

if (autoRefreshInterval) clearInterval(autoRefreshInterval);
autoRefreshInterval = setInterval(fetchLiveScores, 30000);
