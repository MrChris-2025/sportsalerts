Parse.initialize("kgfaEs2YlbM1CBOPiLEGyTNU6TUwsbFayxLUWz6v", "qQB0p5G4Mf0MqMiM6Z5zBEnBypzDPsQRGCrpoNVx");
Parse.serverURL = 'https://parseapi.back4app.com/';

const VAPID_PUBLIC_KEY = "BA8NXZjt4Aj2NsNFZwFQJPvNHoGdz87nVB_0MJCQdbXFMhgOmkWsd-STbCKtgPIBPrWF7-Umqrili8Ef4xS352E";
let fetchInterval = null;

function getSelectedLeague() {
  const selector = document.getElementById('leagueSelector');
  const [sport, league] = selector.value.split('/');
  return { sport, league };
}

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
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    return await navigator.serviceWorker.register('./sw.js');
  }
  throw new Error('Push messaging is not supported by your browser.');
}

async function subscribeToAlerts(gameId, sport, league) {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Notification permission denied.');
      return;
    }

    const registration = await registerServiceWorker();
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    await Parse.Cloud.run("subscribeToGame", {
      gameId,
      sport,
      league,
      subscription: subscription.toJSON()
    });

    const btn = document.getElementById(`btn-${gameId}`);
    if (btn) {
      btn.innerText = "Subscribed ✓";
      btn.disabled = true;
    }
  } catch (err) {
    console.error("Subscription Error:", err);
    alert("Failed to subscribe: " + err.message);
  }
}

async function updateScoreboardCards() {
  const { sport, league } = getSelectedLeague();
  
  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard`);
    const data = await response.json();
    const container = document.getElementById('scoreboard');

    if (!data.events || data.events.length === 0) {
      container.innerHTML = `<p class="empty-state">No live or upcoming games scheduled today for ${league.toUpperCase()}.</p>`;
      return;
    }

    container.innerHTML = '';

    data.events.forEach(event => {
      const gameId = event.id;
      const status = event.status.type.detail;
      const competition = event.competitions[0];
      const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
      const awayTeam = competition.competitors.find(c => c.homeAway === 'away');

      const homeName = homeTeam.team.shortDisplayName || homeTeam.team.displayName;
      const awayName = awayTeam.team.shortDisplayName || awayTeam.team.displayName;
      const homeScore = homeTeam.score || '0';
      const awayScore = awayTeam.score || '0';

      const card = document.createElement('div');
      card.className = 'card';
      card.id = `card-${gameId}`;
      card.innerHTML = `
        <div>
          <div class="teams">${awayName} vs ${homeName}</div>
          <div class="score" id="score-${gameId}">${awayScore} - ${homeScore}</div>
          <div class="status" id="status-${gameId}">${status}</div>
        </div>
        <button id="btn-${gameId}" onclick="subscribeToAlerts('${gameId}', '${sport}', '${league}')">Enable Score Alerts</button>
      `;
      container.appendChild(card);
    });
  } catch (error) {
    console.error("Direct score fetching error:", error);
  }
}

function changeLeague() {
  updateScoreboardCards();
}

function startPolling() {
  if (fetchInterval) clearInterval(fetchInterval);
  updateScoreboardCards();
  fetchInterval = setInterval(updateScoreboardCards, 30000);
}

function stopPolling() {
  if (fetchInterval) clearInterval(fetchInterval);
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    startPolling();
  } else {
    stopPolling();
  }
});

startPolling();
