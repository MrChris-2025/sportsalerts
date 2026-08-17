Parse.initialize("kgfaEs2YlbM1CBOPiLEGyTNU6TUwsbFayxLUWz6v", "qQB0p5G4Mf0MqMiM6Z5zBEnBypzDPsQRGCrpoNVx");
Parse.serverURL = 'https://parseapi.back4app.com/';

const VAPID_PUBLIC_KEY = "BA8NXZjt4Aj2NsNFZwFQJPvNHoGdz87nVB_0MJCQdbXFMhgOmkWsd-STbCKtgPIBPrWF7-Umqrili8Ef4xS352E";
const SPORT = "basketball";
const LEAGUE = "nba";
let fetchInterval = null;

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

async function subscribeToAlerts(gameId) {
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
      sport: SPORT,
      league: LEAGUE,
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
  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${SPORT}/${LEAGUE}/scoreboard`);
    const data = await response.json();
    const container = document.getElementById('scoreboard');

    if (!data.events || data.events.length === 0) {
      container.innerHTML = "<p>No games currently available.</p>";
      return;
    }

    data.events.forEach(event => {
      const gameId = event.id;
      const status = event.status.type.detail;
      const competition = event.competitions[0];
      const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
      const awayTeam = competition.competitors.find(c => c.homeAway === 'away');

      let card = document.getElementById(`card-${gameId}`);
      if (!card) {
        card = document.createElement('div');
        card.className = 'card';
        card.id = `card-${gameId}`;
        card.innerHTML = `
          <div class="teams">${awayTeam.team.displayName} vs ${homeTeam.team.displayName}</div>
          <div class="score" id="score-${gameId}">${awayTeam.score || '0'} - ${homeTeam.score || '0'}</div>
          <div class="status" id="status-${gameId}">${status}</div>
          <button id="btn-${gameId}" onclick="subscribeToAlerts('${gameId}')">Enable Score Alerts</button>
        `;
        container.appendChild(card);
      } else {
        document.getElementById(`score-${gameId}`).innerText = `${awayTeam.score || '0'} - ${homeTeam.score || '0'}`;
        document.getElementById(`status-${gameId}`).innerText = status;
      }
    });
  } catch (error) {
    console.error("Direct score fetching error:", error);
  }
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
