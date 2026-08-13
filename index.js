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
  { id: 'soccer/usa.1', name: 'Major League MLS' },
  { id: 'mma/ufc', name: 'MMA / UFC' },
  { id: 'football/college-football', name: 'NCAA Football' }
];

let currentSportPath = 'baseball/mlb';
let pollingInterval;

// Local storage ensures UI stays active immediately across reloads
let subscribedGames = new Set(JSON.parse(localStorage.getItem('subscribedGames') || '[]'));

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

// Top Bar Clock Function
function updateClock() {
  const now = new Date();
  
  const dateOptions = { weekday: 'short', month: 'short', day: 'numeric' };
  const timeOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
  
  const dateStr = now.toLocaleDateString('en-US', dateOptions);
  const timeStr = now.toLocaleTimeString('en-US', timeOptions);
  
  document.getElementById('datetimeDisplay').innerHTML = `
    <div class="date-str">${dateStr}</div>
    <div class="time-str">${timeStr}</div>
  `;
}

// Format "Starts in XXh XXm"
function getCountdown(dateString) {
  const gameTime = new Date(dateString).getTime();
  const now = new Date().getTime();
  const diff = gameTime - now;

  if (diff <= 0) return "soon";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
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
      renderSidebar();
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

function getBaseGraphicHTML(game) {
  const isBaseball = currentSportPath.includes('baseball');
  if (!isBaseball || game.status.type.state !== 'in') return '';

  let b1 = false, b2 = false, b3 = false;
  let outs = 0, balls = 0, strikes = 0;

  if (game.competitions && game.competitions[0].situation) {
    const sit = game.competitions[0].situation;
    if (sit.onFirst) b1 = true;
    if (sit.onSecond) b2 = true;
    if (sit.onThird) b3 = true;
    outs = sit.outs || 0;
    balls = sit.balls || 0;
    strikes = sit.strikes || 0;
  }

  const getDots = (count, max, colorClass) => {
    let dots = '';
    for(let i=0; i<max; i++) {
      dots += `<div class="dot ${i < count ? colorClass : ''}"></div>`;
    }
    return `<div class="count-dots">${dots}</div>`;
  };

  return `
    <div class="baseball-graphic">
      <div class="diamond">
        <div class="base base-2 ${b2 ? 'active' : ''}"></div>
        <div class="base base-3 ${b3 ? 'active' : ''}"></div>
        <div class="base base-1 ${b1 ? 'active' : ''}"></div>
      </div>
      <div class="counts">
        <div class="count-row">B: ${getDots(balls, 4, 'filled-green')}</div>
        <div class="count-row">S: ${getDots(strikes, 3, 'filled-red')}</div>
        <div class="count-row">O: ${getDots(outs, 3, 'filled-yellow')}</div>
      </div>
    </div>
  `;
}

function getFootballGraphicHTML(game) {
  const isFootball = currentSportPath.includes('football');
  if (!isFootball || game.status.type.state !== 'in') return '';

  let downDist = '';
  let yardLine = '';

  if (game.competitions && game.competitions[0].situation) {
    const sit = game.competitions[0].situation;
    downDist = sit.downDistanceText || '';
    yardLine = sit.possessionText || '';
  }

  if (!downDist && !yardLine) return '';

  return `
    <div class="football-graphic">
      <div class="down-dist">${downDist}</div>
      <div class="yard-line">${yardLine}</div>
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

  events.forEach(game => {
    const card = document.createElement('div');
    card.className = 'game-card';
    
    const comps = game.competitions[0].competitors;
    const team1 = comps[0]; // Away
    const team2 = comps[1] || comps[0]; // Home

    const t1Name = team1.team ? (team1.team.name || team1.team.shortDisplayName) : (team1.athlete ? team1.athlete.lastName : 'TBD');
    const t2Name = team2.team ? (team2.team.name || team2.team.shortDisplayName) : (team2.athlete ? team2.athlete.lastName : 'TBD');
    
    const t1Color = team1.team && team1.team.color ? `#${team1.team.color}` : 'rgba(255,255,255,0.05)';
    const t2Color = team2.team && team2.team.color ? `#${team2.team.color}` : 'rgba(255,255,255,0.05)';
    
    const t1Record = team1.records ? `(${team1.records[0].summary})` : '';
    const t2Record = team2.records ? `(${team2.records[0].summary})` : '';

    const t1Logo = team1.team && team1.team.logo ? team1.team.logo : '';
    const t2Logo = team2.team && team2.team.logo ? team2.team.logo : '';

    const isLive = game.status.type.state === 'in';
    const isPre = game.status.type.state === 'pre';
    const isFinal = game.status.type.state === 'post';

    // LEFT HEADER
    let headerLeftHTML = '';
    if (isLive) {
      headerLeftHTML = `<div class="live-indicator"><div class="live-dot"></div> LIVE</div>`;
    } else if (isPre) {
      headerLeftHTML = `<span>starts in ${getCountdown(game.date)}</span>`;
    } else {
      headerLeftHTML = `<span>FINAL</span>`;
    }

    let pillClass = 'status-pill';
    let metaText = '';

    // RIGHT SIDE STATUS PILL
    if (isPre) {
      pillClass += ' pregame';
      const d = new Date(game.date);
      const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      metaText = `${datePart}<br>${timePart}`;
    } else {
      if (isFinal) pillClass += ' final';
      // ESPN API provides Live Clock, Period, Inning natively inside .detail
      metaText = game.status.type.detail.replace(' - ', '<br>');
    }

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
          <div class="${pillClass}">${metaText}</div>
          ${getBaseGraphicHTML(game)}
          ${getFootballGraphicHTML(game)}
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

// Modified to handle errors gracefully & update UI optimistically so it doesn't revert
window.toggleAlert = async function(gameId, sportPath) {
  const btn = document.getElementById(`alert-btn-${gameId}`);
  
  if (subscribedGames.has(gameId)) {
    subscribedGames.delete(gameId);
    localStorage.setItem('subscribedGames', JSON.stringify([...subscribedGames]));
    btn.classList.remove('active');
    btn.innerText = 'Alert Off';
    return;
  }

  if (!('serviceWorker' in navigator)) {
    alert("Service workers are not supported in your browser.");
    return;
  }

  try {
    btn.innerText = 'Setting up...';
    
    const registration = await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    
    if (permission !== 'granted') {
      btn.innerText = 'Alert Off';
      alert('Permission denied for push notifications.');
      return;
    }
    
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    
    // OPTIMISTIC UI UPDATE: Instantly turn green
    subscribedGames.add(gameId);
    localStorage.setItem('subscribedGames', JSON.stringify([...subscribedGames]));
    btn.classList.add('active');
    btn.innerText = 'Alert On';
    
    // 1. Save to Back4App DB
    const SubscriberModel = Parse.Object.extend("Subscriber");
    const sub = new SubscriberModel();
    sub.set("gameId", gameId);
    sub.set("sportPath", sportPath);
    sub.set("subscription", JSON.parse(JSON.stringify(subscription)));
    await sub.save();
    
    // 2. Trigger QStash loop (Catch error independently so it doesn't rollback UI)
    Parse.Cloud.run("trackGame", { gameId: gameId, sportPath: sportPath })
      .catch(cloudErr => {
        console.warn('Cloud trackGame function warning (loop might not start):', cloudErr);
      });
      
  } catch (err) {
    console.error('Failed to subscribe:', err);
    // Only revert if the actual browser prompt or Save fundamentally fails
    subscribedGames.delete(gameId);
    localStorage.setItem('subscribedGames', JSON.stringify([...subscribedGames]));
    btn.classList.remove('active');
    btn.innerText = 'Alert Off';
    alert('Failed to set alert. Check browser notification settings.');
  }
};

// Initialization Sequence
updateClock();
setInterval(updateClock, 60000); 

renderSidebar();
registerServiceWorker();
fetchScores();

pollingInterval = setInterval(fetchScores, 30000);
