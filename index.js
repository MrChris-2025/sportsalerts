// Initialize Back4App
Parse.initialize(
  "kgfaEs2YlbM1CBOPiLEGyTNU6TUwsbFayxLUWz6v", // App ID
  "6mPKe3bdTGIBE237fVV7lRei6N9e5oXR7PArQp4Q"  // JS Key
);
Parse.serverURL = 'https://parseapi.back4app.com/';

const VAPID_PUBLIC_KEY = 'BA8NXZjt4Aj2NsNFZwFQJPvNHoGdz87nVB_0MJCQdbXFMhgOmkWsd-STbCKtgPIBPrWF7-Umqrili8Ef4xS352E';

const categories = [
  { id: 'baseball/mlb', name: 'Baseball (MLB)' },
  { id: 'football/nfl', name: 'Football (NFL)' },
  { id: 'basketball/nba', name: 'Basketball (NBA)' },
  { id: 'hockey/nhl', name: 'Hockey (NHL)' },
  { id: 'soccer/eng.1', name: 'Premier League' },
  { id: 'soccer/usa.1', name: 'Major League Soccer' },
  { id: 'mma/ufc', name: 'MMA / UFC' }
];

let currentSportPath = 'baseball/mlb';
let pollingInterval;
let subscribedGames = new Set(); // Track UI state of alerts

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (error) {
      console.error('SW Registration Failed:', error);
    }
  }
}

function renderSidebar() {
  const list = document.getElementById('categoryList');
  list.innerHTML = '';
  
  categories.forEach(cat => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = `category-btn ${cat.id === currentSportPath ? 'active' : ''}`;
    btn.innerText = cat.name;
    btn.onclick = () => {
      currentSportPath = cat.id;
      renderSidebar(); // Update active state
      fetchScores();
    };
    li.appendChild(btn);
    list.appendChild(li);
  });
}

async function fetchScores() {
  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${currentSportPath}/scoreboard`);
    const data = await response.json();
    renderScoreboard(data.events || []);
  } catch (err) {
    console.error('Failed to fetch ESPN API:', err);
  }
}

function getBaseGraphicHTML(isBaseball) {
  if (!isBaseball) return '';
  return `
    <div class="baseball-graphic">
      <div class="bases">
        <div class="base top"></div>
        <div class="base left"></div>
        <div class="base right"></div>
      </div>
      <div class="counts">
        <div class="count-row">B: <div class="count-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>
        <div class="count-row">S: <div class="count-dots"><div class="dot"></div><div class="dot"></div></div></div>
        <div class="count-row">O: <div class="count-dots"><div class="dot"></div><div class="dot"></div></div></div>
      </div>
    </div>
  `;
}

function renderScoreboard(events) {
  const scoreboard = document.getElementById('scoreboard');
  scoreboard.innerHTML = '';
  
  if (events.length === 0) {
    scoreboard.innerHTML = '<div class="no-games">No games scheduled.</div>';
    return;
  }
  
  const isBaseball = currentSportPath.includes('baseball');

  events.forEach(game => {
    const card = document.createElement('div');
    card.className = 'game-card';
    
    // ESPN API format: away team is index 0, home team is index 1
    const comps = game.competitions[0].competitors;
    const team1 = comps[0]; // Away (Top)
    const team2 = comps[1] || comps[0]; // Home (Bottom)

    const t1Name = team1.team ? (team1.team.name || team1.team.shortDisplayName) : (team1.athlete ? team1.athlete.lastName : 'TBD');
    const t2Name = team2.team ? (team2.team.name || team2.team.shortDisplayName) : (team2.athlete ? team2.athlete.lastName : 'TBD');
    
    const t1Color = team1.team && team1.team.color ? `#${team1.team.color}` : '#1f2937';
    const t2Color = team2.team && team2.team.color ? `#${team2.team.color}` : '#1f2937';
    
    const t1Record = team1.records ? `(${team1.records[0].summary})` : '';
    const t2Record = team2.records ? `(${team2.records[0].summary})` : '';

    const t1Logo = team1.team && team1.team.logo ? team1.team.logo : '';
    const t2Logo = team2.team && team2.team.logo ? team2.team.logo : '';

    const isLive = game.status.type.state === 'in';
    const isPre = game.status.type.state === 'pre';
    const isFinal = game.status.type.state === 'post';

    let headerLeftHTML = '';
    if (isLive) {
      headerLeftHTML = `<div class="live-indicator"><div class="live-dot"></div> LIVE</div>`;
    } else if (isPre) {
      // Simple date formatting for pregame
      const date = new Date(game.date);
      headerLeftHTML = `<span>starts ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>`;
    } else {
      headerLeftHTML = `<span>FINAL</span>`;
    }

    let pillClass = 'status-pill';
    if (isPre) pillClass += ' pregame';
    if (isFinal) pillClass += ' final';

    const isSubscribed = subscribedGames.has(game.id);

    card.innerHTML = `
      <div class="card-header">
        ${headerLeftHTML}
        <span>${isPre ? 'PRE' : (isFinal ? 'END' : 'IN')}</span>
      </div>
      
      <div class="card-body">
        <div class="team-row" style="background-color: ${t1Color};">
          ${t1Logo ? `<img src="${t1Logo}" class="team-logo" alt="logo">` : ''}
          <div class="team-info">
            <div class="team-name">${t1Name}</div>
            <div class="team-record">${t1Record}</div>
          </div>
          <div class="team-score">${team1.score || '0'}</div>
        </div>
        
        <div class="team-row" style="background-color: ${t2Color};">
          ${t2Logo ? `<img src="${t2Logo}" class="team-logo" alt="logo">` : ''}
          <div class="team-info">
            <div class="team-name">${t2Name}</div>
            <div class="team-record">${t2Record}</div>
          </div>
          <div class="team-score">${team2.score || '0'}</div>
        </div>

        <div class="game-meta">
          <div class="${pillClass}">${game.status.type.detail.replace(' - ', '<br>')}</div>
          ${getBaseGraphicHTML(isBaseball)}
        </div>
      </div>

      <div class="card-actions">
        <button id="alert-btn-${game.id}" class="btn btn-alert ${isSubscribed ? 'active' : ''}" 
                onclick="window.toggleAlert('${game.id}', '${currentSportPath}')" 
                ${isFinal ? 'disabled' : ''}>
          ${isSubscribed ? 'Alert On' : 'Alert Off'}
        </button>
        <button class="btn btn-stream">Watch Stream</button>
      </div>
    `;
    
    scoreboard.appendChild(card);
  });
}

window.toggleAlert = async function(gameId, sportPath) {
  if (!('serviceWorker' in navigator)) return;
  const btn = document.getElementById(`alert-btn-${gameId}`);
  
  // If already subscribed visually, toggle off (UI only for this scope, real removal requires backend endpoint)
  if (subscribedGames.has(gameId)) {
    subscribedGames.delete(gameId);
    btn.classList.remove('active');
    btn.innerText = 'Alert Off';
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  
  if (permission !== 'granted') {
    alert('Permission denied for notifications.');
    return;
  }
  
  try {
    btn.innerText = 'Setting up...';
    
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    
    const SubscriberModel = Parse.Object.extend("Subscriber");
    const sub = new SubscriberModel();
    sub.set("gameId", gameId);
    sub.set("sportPath", sportPath);
    sub.set("subscription", JSON.parse(JSON.stringify(subscription)));
    await sub.save();
    
    await Parse.Cloud.run("trackGame", { gameId: gameId, sportPath: sportPath });
    
    subscribedGames.add(gameId);
    btn.classList.add('active');
    btn.innerText = 'Alert On';
  } catch (err) {
    console.error('Failed to subscribe:', err);
    btn.innerText = 'Alert Off';
  }
};

// Initialization
renderSidebar();
registerServiceWorker();
fetchScores();

// 30s UI polling for live data matching target aesthetics
pollingInterval = setInterval(fetchScores, 30000);
