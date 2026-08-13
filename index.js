if (typeof Parse !== 'undefined') {
  Parse.initialize("kgfaEs2YlbM1CBOPiLEGyTNU6TUwsbFayxLUWz6v", "6mPKe3bdTGIBE237fVV7lRei6N9e5oXR7PArQp4Q");
  Parse.serverURL = "https://parseapi.back4app.com";
}

const VAPID_PUBLIC_KEY = "BA8NXZjt4Aj2NsNFZwFQJPvNHoGdz87nVB_0MJCQdbXFMhgOmkWsd-STbCKtgPIBPrWF7-Umqrili8Ef4xS352E";

let currentSportPath = "baseball/mlb";
let currentDate = new Date();
let autoRefreshInterval = null;
const trackedGames = new Set();

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

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

function getFormattedApiDate(dateObj) {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function updateDateDisplay() {
  const fullOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  const shortOptions = { month: 'short', day: 'numeric', year: 'numeric' };

  const dateStrFull = currentDate.toLocaleDateString('en-US', fullOptions).toUpperCase();
  const dateStrShort = currentDate.toLocaleDateString('en-US', shortOptions);

  const dateDisplay = document.getElementById('dateDisplay');
  const currentDateBadge = document.getElementById('currentDateBadge');

  if (dateDisplay) dateDisplay.innerText = dateStrFull;
  if (currentDateBadge) currentDateBadge.innerText = dateStrShort;

  const datePicker = document.getElementById('datePicker');
  if (datePicker) {
    const yyyy = currentDate.getFullYear();
    const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dd = String(currentDate.getDate()).padStart(2, '0');
    datePicker.value = `${yyyy}-${mm}-${dd}`;
  }
}

function setupDateControls() {
  const prevBtn = document.getElementById('btnPrevDate');
  const nextBtn = document.getElementById('btnNextDate');
  const datePicker = document.getElementById('datePicker');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      currentDate.setDate(currentDate.getDate() - 1);
      updateDateDisplay();
      fetchLiveScores();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      currentDate.setDate(currentDate.getDate() + 1);
      updateDateDisplay();
      fetchLiveScores();
    });
  }

  if (datePicker) {
    datePicker.addEventListener('change', (e) => {
      if (e.target.value) {
        const parts = e.target.value.split('-');
        currentDate = new Date(parts[0], parts[1] - 1, parts[2]);
        updateDateDisplay();
        fetchLiveScores();
      }
    });
  }
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

async function checkExistingSubscription() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg && reg.pushManager) {
    const sub = await reg.pushManager.getSubscription();
    const btnSubscribe = document.getElementById('btnSubscribe');
    const btnUnsubscribe = document.getElementById('btnUnsubscribe');

    if (sub) {
      if (btnSubscribe) {
        btnSubscribe.innerText = "Alerts Active ✓";
        btnSubscribe.style.background = "#16a34a";
      }
      if (btnUnsubscribe) btnUnsubscribe.style.display = "inline-block";
    } else {
      if (btnSubscribe) {
        btnSubscribe.innerText = "Enable Push";
        btnSubscribe.style.background = "#182238";
      }
      if (btnUnsubscribe) btnUnsubscribe.style.display = "none";
    }
  }
}

async function setupPushNotifications() {
  const pwaBanner = document.getElementById('pwaBanner');
  if (pwaBanner && !isStandalone()) {
    pwaBanner.style.display = 'flex';
  }

  const reg = await initServiceWorker();
  if (!reg) return;

  await checkExistingSubscription();

  const btnSubscribe = document.getElementById('btnSubscribe');
  const btnUnsubscribe = document.getElementById('btnUnsubscribe');
  const btnTestPush = document.getElementById('btnTestPush');

  if (btnSubscribe) {
    btnSubscribe.addEventListener('click', async () => {
      if (!isStandalone()) {
        alert('📱 Action Required:
You MUST add this app to your Home Screen first to subscribe to Push Alerts.

Tap Share/Menu -> "Add to Home Screen".');
        return;
      }

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

        if (typeof Parse !== 'undefined') {
          await Parse.Cloud.run('subscribeUser', { subscription: subscription.toJSON() });
        }
        btnSubscribe.innerText = "Alerts Active ✓";
        btnSubscribe.style.background = "#16a34a";
        if (btnUnsubscribe) btnUnsubscribe.style.display = "inline-block";
        alert("Subscribed successfully to sports push alerts!");
      } catch (err) {
        console.error("Push Setup Error:", err);
        alert("Failed to subscribe for push notifications.");
      }
    });
  }

  if (btnUnsubscribe) {
    btnUnsubscribe.addEventListener('click', async () => {
      if (!isStandalone()) {
        alert('You must launch the app from your Home Screen to manage subscriptions.');
        return;
      }

      try {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          if (btnSubscribe) {
            btnSubscribe.innerText = "Enable Push";
            btnSubscribe.style.background = "#182238";
          }
          btnUnsubscribe.style.display = "none";
          alert("Unsubscribed successfully.");
        }
      } catch (err) {
        console.error("Unsubscribe Error:", err);
        alert("Failed to unsubscribe.");
      }
    });
  }

  if (btnTestPush) {
    btnTestPush.addEventListener('click', async () => {
      try {
        btnTestPush.innerText = "Sending...";
        if (typeof Parse !== 'undefined') {
          const res = await Parse.Cloud.run('sendTestPush');
          alert(`Test Push Triggered! Delivered to ${res.sentCount} device(s).`);
        } else {
          alert("Parse SDK not available.");
        }
        btnTestPush.innerText = "Test Push";
      } catch (err) {
        console.error("Test Push Error:", err);
        alert("Failed to dispatch test push notification.");
        btnTestPush.innerText = "Test Push";
      }
    });
  }
}

function setupSportsNav() {
  const nav = document.getElementById('categoriesNav');
  if (nav) {
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
  if (!container) return;

  const apiDate = getFormattedApiDate(currentDate);

  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${currentSportPath}/scoreboard?dates=${apiDate}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    container.innerHTML = '';

    if (!data.events || data.events.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          No games scheduled for ${document.getElementById('dateDisplay').innerText}.<br>
          <span style="font-size: 0.8rem; opacity: 0.7; margin-top: 8px; display: inline-block;">Use the date arrows above to navigate to scheduled game dates.</span>
        </div>`;
      return;
    }

    data.events.forEach(event => {
      const competition = event.competitions ? event.competitions[0] : null;
      if (!competition) return;

      const statusText = event.status?.type?.shortDetail ? event.status.type.shortDetail.toUpperCase() : 'SCHEDULED';
      const statusState = event.status?.type?.state || 'pre';
      const isLive = statusState === 'in';

      const away = competition.competitors ? competition.competitors.find(c => c.homeAway === 'away') || competition.competitors[1] || competition.competitors[0] : null;
      const home = competition.competitors ? competition.competitors.find(c => c.homeAway === 'home') || competition.competitors[0] : null;

      const awayName = away?.team?.abbreviation || away?.team?.name || away?.athlete?.displayName || away?.displayName || 'AWAY';
      const homeName = home?.team?.abbreviation || home?.team?.name || home?.athlete?.displayName || home?.displayName || 'HOME';

      const awayRecord = away?.records ? `(${away.records[0]?.summary || ''})` : '';
      const homeRecord = home?.records ? `(${home.records[0]?.summary || ''})` : '';

      const awayLogo = away?.team?.logo || away?.athlete?.headshot?.href || away?.athlete?.flag?.href || 'https://a.espncdn.com/favicon.ico';
      const homeLogo = home?.team?.logo || home?.athlete?.headshot?.href || home?.athlete?.flag?.href || 'https://a.espncdn.com/favicon.ico';

      const awayScore = away?.score ?? '0';
      const homeScore = home?.score ?? '0';

      const awayColor = away?.team?.color ? `#${away.team.color}` : '#121a2a';
      const homeColor = home?.team?.color ? `#${home.team.color}` : '#121a2a';

      const situation = competition.situation;
      const isAlertOn = trackedGames.has(event.id);

      const card = document.createElement('div');
      card.className = 'game-card';
      card.innerHTML = `
        <div class="card-top-bar">
          <span>${isLive ? '<span class="live-tag"><span class="live-dot"></span>LIVE</span>' : statusState.toUpperCase()}</span>
          <span>${event.status?.type?.detail ? event.status.type.detail.toUpperCase() : 'GAME'}</span>
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
          <button id="alertBtn_${event.id}" class="card-btn ${isAlertOn ? 'alert-active' : ''}" onclick="window.toggleGameAlert('${event.id}', '${currentSportPath}')">
            ${isAlertOn ? 'Alert On 🔥' : 'Alert Off'}
          </button>
          <button class="card-btn btn-stream" onclick="window.open('${event.links ? event.links[0]?.href : '#'}', '_blank')">Watch Stream</button>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error("ESPN Fetch Error:", err);
    container.innerHTML = `
      <div class="empty-state" style="color:#ef4444;">
        Failed to load live scoreboards for this category.<br>
        <span style="font-size:0.8rem; color:#94a3b8; margin-top:8px; display:inline-block;">Detail: ${err.message}</span>
      </div>`;
  }
}

window.toggleGameAlert = async function(gameId, sportPath) {
  if (!isStandalone()) {
    alert('📱 Action Required:
You MUST add this app to your Home Screen first to enable game alerts.

Tap Share/Menu -> "Add to Home Screen".');
    return;
  }

  const btn = document.getElementById(`alertBtn_${gameId}`);

  if (trackedGames.has(gameId)) {
    trackedGames.delete(gameId);
    if (btn) {
      btn.classList.remove('alert-active');
      btn.innerText = 'Alert Off';
    }
    alert(`Alerts disabled for Game ID #${gameId}.`);
  } else {
    try {
      if (typeof Parse !== 'undefined') {
        await Parse.Cloud.run('startGameLoop', { gameId, sportPath });
      }
      trackedGames.add(gameId);
      if (btn) {
        btn.classList.add('alert-active');
        btn.innerText = 'Alert On 🔥';
      }
      alert(`Alert On! Red glassmorphism active. Live updates will be pushed via QStash even if app is closed.`);
    } catch (e) {
      console.error(e);
      alert('Failed to start tracking loop.');
    }
  }
};

function initApp() {
  updateDateDisplay();
  setupDateControls();
  setupPushNotifications();
  setupSportsNav();
  fetchLiveScores();

  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(fetchLiveScores, 30000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
