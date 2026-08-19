Parse.initialize("d1eje7SvxRjIFsdB6c3TuQLlF8v6zExAMBzChgXa", "eQqLLilvkNhy04m0OF5J4ry17vw0FKeeEHfPT2mq");
Parse.serverURL = "https://parseapi.back4app.com/";

const VAPID_PUBLIC_KEY = "BA8NXZjt4Aj2NsNFZwFQJPvNHoGdz87nVB_0MJCQdbXFMhgOmkWsd-STbCKtgPIBPrWF7-Umqrili8Ef4xS352E";

let currentSubscription = null;

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

document.addEventListener('DOMContentLoaded', async () => {
  await setupServiceWorker();
  setupUIEventListeners();
  loadLiveScores();
  setInterval(loadLiveScores, 30000);
});

async function setupServiceWorker() {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      currentSubscription = await reg.pushManager.getSubscription();
      updateMainToggleUI(!!currentSubscription);
    } catch (err) {
      console.error('Service Worker registration failed:', err);
    }
  }
}

function setupUIEventListeners() {
  const mainToggle = document.getElementById('main-push-toggle');
  if (mainToggle) {
    mainToggle.addEventListener('change', async (e) => {
      if (e.target.checked) {
        await subscribeUserToPush();
      } else {
        await unsubscribeUserFromPush();
      }
    });
  }
}

async function subscribeUserToPush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    
    currentSubscription = sub;
    await saveSubscriptionToBack4App(sub);
    updateMainToggleUI(true);
  } catch (err) {
    console.error('Failed to subscribe:', err);
    updateMainToggleUI(false);
  }
}

async function unsubscribeUserFromPush() {
  if (currentSubscription) {
    await currentSubscription.unsubscribe();
    await removeSubscriptionFromBack4App(currentSubscription);
    currentSubscription = null;
    updateMainToggleUI(false);
  }
}

async function saveSubscriptionToBack4App(sub) {
  const PushSub = Parse.Object.extend("PushSubscription");
  const query = new Parse.Query(PushSub);
  query.equalTo("endpoint", sub.endpoint);
  let record = await query.first();
  
  if (!record) {
    record = new PushSub();
  }
  
  record.set("endpoint", sub.endpoint);
  record.set("subscriptionJSON", JSON.stringify(sub));
  await record.save();
}

async function removeSubscriptionFromBack4App(sub) {
  const PushSub = Parse.Object.extend("PushSubscription");
  const query = new Parse.Query(PushSub);
  query.equalTo("endpoint", sub.endpoint);
  const record = await query.first();
  if (record) {
    await record.destroy();
  }
}

function updateMainToggleUI(isEnabled) {
  const mainToggle = document.getElementById('main-push-toggle');
  if (mainToggle) mainToggle.checked = isEnabled;
}

async function loadLiveScores() {
  try {
    const res = await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard");
    const data = await res.json();
    renderGames(data.events || []);
  } catch (err) {
    console.error('Error fetching ESPN scores:', err);
  }
}

async function renderGames(events) {
  const container = document.getElementById('games-container');
  if (!container) return;
  
  const activeGameSubs = await getActiveGameSubscriptions();

  container.innerHTML = events.map(event => {
    const competition = event.competitions[0];
    const home = competition.competitors.find(c => c.homeAway === 'home');
    const away = competition.competitors.find(c => c.homeAway === 'away');
    const isSubscribed = activeGameSubs.includes(event.id);

    return `
      <div class="card" data-game-id="${event.id}">
        <div class="header">
          <span>${event.status.type.detail}</span>
          <label class="switch">
            <input type="checkbox" class="game-toggle" data-game-id="${event.id}" ${isSubscribed ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>
        <div>
          <div>${away.team.shortDisplayName}: <strong>${away.score}</strong></div>
          <div>${home.team.shortDisplayName}: <strong>${home.score}</strong></div>
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.game-toggle').forEach(toggle => {
    toggle.addEventListener('change', handleGameToggleChange);
  });
}

async function handleGameToggleChange(e) {
  const gameId = e.target.dataset.gameId;
  const isChecked = e.target.checked;
  
  if (!currentSubscription) {
    alert("Please enable Main PWA Push Notifications first.");
    e.target.checked = false;
    return;
  }

  await Parse.Cloud.run("toggleGameSubscription", {
    endpoint: currentSubscription.endpoint,
    gameId: gameId,
    enabled: isChecked,
    sport: "basketball",
    league: "nba"
  });
}

async function getActiveGameSubscriptions() {
  if (!currentSubscription) return [];
  try {
    return await Parse.Cloud.run("getUserGameSubscriptions", { endpoint: currentSubscription.endpoint });
  } catch {
    return [];
  }
}
