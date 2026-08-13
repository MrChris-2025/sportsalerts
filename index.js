// Initialize Back4App
Parse.initialize(
  "kgfaEs2YlbM1CBOPiLEGyTNU6TUwsbFayxLUWz6v", // App ID
  "6mPKe3bdTGIBE237fVV7lRei6N9e5oXR7PArQp4Q"  // JS Key
);
Parse.serverURL = 'https://parseapi.back4app.com/';

const VAPID_PUBLIC_KEY = 'BA8NXZjt4Aj2NsNFZwFQJPvNHoGdz87nVB_0MJCQdbXFMhgOmkWsd-STbCKtgPIBPrWF7-Umqrili8Ef4xS352E';
let currentSportPath = 'basketball/nba'; // Default sport
let pollingInterval;

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
      console.log('Service Worker Registered');
    } catch (error) {
      console.error('Service Worker Registration Failed:', error);
    }
  }
}

window.changeSport = function(sportPath) {
  currentSportPath = sportPath;
  fetchScores(); // Fetch immediately on change
};

async function fetchScores() {
  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${currentSportPath}/scoreboard`);
    const data = await response.json();
    renderScoreboard(data.events || []);
  } catch (err) {
    console.error('Failed to fetch ESPN API:', err);
  }
}

function renderScoreboard(events) {
  const scoreboard = document.getElementById('scoreboard');
  scoreboard.innerHTML = '';
  
  if (events.length === 0) {
    scoreboard.innerHTML = '<div class="no-games">No live or upcoming games currently available for this sport.</div>';
    return;
  }
  
  events.forEach(game => {
    const card = document.createElement('div');
    card.className = 'glass-card';
    
    // Some sports format competitors slightly differently (like MMA vs Team Sports)
    const competitors = game.competitions[0].competitors;
    let team1 = competitors[0];
    let team2 = competitors[1] || team1; // Fallback for some solo events if needed

    // Extracting names (accounting for teams vs fighters/individuals)
    const t1Name = team1.team ? (team1.team.abbreviation || team1.team.shortDisplayName) : (team1.athlete ? team1.athlete.shortName : 'TBD');
    const t2Name = team2.team ? (team2.team.abbreviation || team2.team.shortDisplayName) : (team2.athlete ? team2.athlete.shortName : 'TBD');
    
    card.innerHTML = `
      <div class="matchup">${game.shortName || game.name}</div>
      <div class="score-display">
        <span>${t2Name} ${team2.score || '0'}</span>
        <span> - </span>
        <span>${t1Name} ${team1.score || '0'}</span>
      </div>
      <div class="game-status">${game.status.type.detail}</div>
      <button class="btn-subscribe" onclick="window.subscribeToGame('${game.id}', '${currentSportPath}')" ${game.status.type.name === 'STATUS_FINAL' ? 'disabled' : ''}>
        ${game.status.type.name === 'STATUS_FINAL' ? 'Event Ended' : 'Get Live Push Notifications'}
      </button>
    `;
    
    scoreboard.appendChild(card);
  });
}

window.subscribeToGame = async function(gameId, sportPath) {
  if (!('serviceWorker' in navigator)) return;
  
  const registration = await navigator.serviceWorker.ready;
  
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    alert('Permission denied for notifications.');
    return;
  }
  
  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    
    // Save to Back4App
    const SubscriberModel = Parse.Object.extend("Subscriber");
    const sub = new SubscriberModel();
    sub.set("gameId", gameId);
    sub.set("sportPath", sportPath); // Save the sport context so backend knows where to fetch
    sub.set("subscription", JSON.parse(JSON.stringify(subscription)));
    await sub.save();
    
    // Trigger QStash loop start via Cloud Function
    await Parse.Cloud.run("trackGame", { gameId: gameId, sportPath: sportPath });
    
    alert('Subscribed! You will receive live score pushes on your lock screen even if the app is closed.');
  } catch (err) {
    console.error('Failed to subscribe to game:', err);
  }
};

// Initialize sequence
registerServiceWorker();
fetchScores();

// Frontend UI updates every 30 seconds for live Liquid Glass changes
pollingInterval = setInterval(fetchScores, 30000);
