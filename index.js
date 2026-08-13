Parse.initialize("kgfaEs2YlbM1CBOPiLEGyTNU6TUwsbFayxLUWz6v", "6mPKe3bdTGIBE237fVV7lRei6N9e5oXR7PArQp4Q");
Parse.serverURL = "https://parseapi.back4app.com";

const VAPID_PUBLIC_KEY = "BA8NXZjt4Aj2NsNFZwFQJPvNHoGdz87nVB_0MJCQdbXFMhgOmkWsd-STbCKtgPIBPrWF7-Umqrili8Ef4xS352E";

let currentSportPath = "baseball/mlb";
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

function updateHeaderDate() {
  const dateObj = new Date();
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  document.getElementById('currentDateBadge').innerText = dateObj.toLocaleDateString('en-US', options);
}

async function initServiceWorker() {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      return reg;
    } catch (err) {
      console.error('Service Worker registration error:', err);
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
        alert('Notification permission rejected.');
        return;
      }

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      await Parse.Cloud.run('subscribeUser', { subscription: subscription.toJSON() });
      btnSubscribe.innerText = "Alerts Active ✓";
      btnSubscribe.style.background = "#16a34a";
    } catch (err) {
      console.error("Push Setup Error:", err);
      alert("Failed to subscribe for push notifications.");
    }
  });

  btnTestPush.addEventListener('click', async () => {
    try {
      btnTestPush.innerText = "Sending...";
      const res = await Parse.Cloud.run('sendTestPush');
      alert(`Test Push Triggered! Delivered to ${res.sentCount} device(s).`);
      btnTestPush.innerText = "Test Push Now";
    } catch (err) {
      console.error("Test Push Error:", err);
      alert("Failed to dispatch test push notification.");
      btnTestPush.innerText = "Test Push Now";
    }
  });
}

function setupSportsNav() {
  const nav = document.getElementById('categoriesNav');
  nav.addEventListener('click', (e) => {
    const target = e.target.closest('.nav-btn');
    if (target) {
      document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
      target.classList.add('active');
      currentSportPath = target.getAttribute('data-sport');
      document.getElementById('pageTitle').innerText = target.getAttribute('data-title');
      fetchLiveScores();
    }
  });
}

function renderBaseballDiamond(situation) {
  if (!situation) return '';
  const onFirst = situation.onFirst ? 'active' : '';
  const onSecond = situation.onSecond ? 'active' : '';
  const onThird = situation.onThird ? 'active' : '';

  return `
    <svg class="diamond-svg" viewBox="0 0 100 100">
      <path class="base ${onSecond}" d="M50 15 L65 30 L50 45 L35 30 Z" />
      <path class="base ${onThird}" d="M25 40 L40 55 L25 70 L10 55 Z" />
      <path class="base ${onFirst}" d="M75 40 L90 55 L75 70 L60 55 Z" />
    </svg>
  `;
}

function renderCounts(situation) {
  if (!situation) {
    return `
      <div class="count-rows">
        <div class="count-row">B: <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>
        <div class="count-row">S: <div class="dots"><div class="dot"></div><div class="dot"></div></div></div>
        <div class="count-row">O: <div class="dots"><div class="dot"></div><div class="dot"></div></div></div>
      </div>
    `;
  }

  const balls = situation.balls || 0;
  const strikes = situation.strikes || 0;
  const outs = situation.outs || 0;

  return `
    <div class="count-rows">
      <div class="count-row">B: <div class="dots">
        <div class="dot ${balls >= 1 ? 'active' : ''}"></div>
        <div class="dot ${balls >= 2 ? 'active' : ''}"></div>
        <div class="dot ${balls >= 3 ? 'active' : ''}"></div>
      </div></div>
      <div class="count-row">S: <div class="dots">
        <div class="dot ${strikes >= 1 ? 'active' : ''}"></div>
        <div class="dot ${strikes >= 2 ? 'active' : ''}"></div>
      </div></div>
      <div class="count-row">O: <div class="dots">
        <div class="dot ${outs >= 1 ? 'active' : ''}"></div>
        <div class="dot ${outs >= 2 ? 'active' : ''}"></div>
      </div></div>
    </div>
  `;
}

async function fetchLiveScores() {
  const container = document.getElementById('scoreboardContainer');
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${currentSportPath}/scoreboard`);
    const data = await res.json();
    
    container.innerHTML = '';

    if (!data.events || data.events.length === 0) {
      container.innerHTML = `<div class="card-btn" style="grid-column: 1/-1; text-align: center; padding: 40px;">No active games scheduled for this category today.</div>`;
      return;
    }

    data.events.forEach(event => {
      const competition = event.competitions[0];
      const statusText = event.status.type.shortDetail.toUpperCase();
      const statusState = event.status.type.state;
      const isLive = statusState === 'in';

      const away = competition.competitors ? competition.competitors.find(c => c.homeAway === 'away') || competition.competitors[1] : null;
      const home = competition.competitors ? competition.competitors.find(c => c.homeAway === 'home') || competition.competitors[0] : null;

      const awayName = away?.team?.name || away?.team?.abbreviation || away?.athlete?.displayName || 'AWAY';
      const homeName = home?.team?.name || home?.team?.abbreviation || home?.athlete?.displayName || 'HOME';

      const awayRecord = away?.records ? `(${away.records[0]?.summary || ''})` : '';
      const homeRecord = home?.records ? `(${home.records[0]?.summary || ''})` : '';

      const awayLogo = away?.team?.logo || away?.athlete?.headshot || 'https://a.espncdn.com/favicon.ico';
      const homeLogo = home?.team?.logo || home?.athlete?.headshot || 'https://a.espncdn.com/favicon.ico';

      const awayScore = away?.score ?? '0';
      const homeScore = home?.score ?? '0';

      const awayColor = away?.team?.color ? `#${away.team.color}` : '#121a2a';
      const homeColor = home?.team?.color ? `#${home.team.color}` : '#121a2a';

      const situation = competition.situation;

      const card = document.createElement('div');
      card.className = 'game-card';
      card.innerHTML = `
        <div class="card-top-bar">
          <span>${isLive ? '<span class="live-tag"><span class="live-dot"></span>LIVE</span>' : statusState.toUpperCase()}</span>
          <span>${event.status.type.detail ? event.status.type.detail.toUpperCase() : 'GAME'}</span>
        </div>

        <div class="card-body">
          <div class="teams-container">
            <div class="team-row" style="background-color: ${awayColor}22; border-left: 4px solid ${awayColor};">
              <div class="team-info">
                <img class="team-logo" src="${awayLogo}" alt="${awayName}" onerror="this.src='https://a.espncdn.com/favicon.ico'">
                <div class="team-details">
                  <span class="team-name">${awayName}</span>
                  <span class="team-record">${awayRecord}</span>
                </div>
              </div>
              <div class="team-score">${awayScore}</div>
            </div>

            <div class="team-row" style="background-color: ${homeColor}22; border-left: 4px solid ${homeColor};">
              <div class="team-info">
                <img class="team-logo" src="${homeLogo}" alt="${homeName}" onerror="this.src='https://a.espncdn.com/favicon.ico'">
                <div class="team-details">
                  <span class="team-name">${homeName}</span>
                  <span class="team-record">${homeRecord}</span>
                </div>
              </div>
              <div class="team-score">${homeScore}</div>
            </div>
          </div>

          <div class="status-box">
            <div class="status-badge">${statusText}</div>
            ${currentSportPath.includes('baseball') ? renderBaseballDiamond(situation) : ''}
            ${currentSportPath.includes('baseball') ? renderCounts(situation) : ''}
          </div>
        </div>

        <div class="card-actions">
          <button class="card-btn" onclick="startTrackingGame('${event.id}', '${currentSportPath}')">
            ${isLive ? 'Track Push' : 'Alert Off'}
          </button>
          <button class="card-btn btn-stream" onclick="window.open('${event.links ? event.links[0]?.href : '#'}', '_blank')">Watch Stream</button>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error("ESPN Fetch Error:", err);
    container.innerHTML = `<div class="card-btn" style="grid-column: 1/-1; text-align: center; color:#ef4444; padding: 40px;">Error connecting to ESPN stream.</div>`;
  }
}

window.startTrackingGame = async function(gameId, sportPath) {
  try {
    await Parse.Cloud.run('startGameLoop', { gameId, sportPath });
    alert(`Tracking loop initialized for Event ID #${gameId}. Background updates will run via QStash even if app is closed.`);
  } catch (e) {
    console.error(e);
    alert('Failed to start tracking loop.');
  }
};

updateHeaderDate();
setupPushNotifications();
setupSportsNav();
fetchLiveScores();

if (autoRefreshInterval) clearInterval(autoRefreshInterval);
autoRefreshInterval = setInterval(fetchLiveScores, 30000);
