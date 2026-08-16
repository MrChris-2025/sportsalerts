// -------------------------------------------------------
// app.js – Front‑end that
//   1️⃣ initialises the Parse SDK with your Back4App keys
//   2️⃣ fetches ESPN scoreboard directly (CORS‑enabled)
//   3️⃣ lets the user subscribe to a game (calls cloud function)
//   4️⃣ respects the Page‑Visibility API to save battery
// -------------------------------------------------------

// ---- 1️⃣ Initialise Parse -------------------------------------------------
// Replace the two strings below with your Back4App App ID and JavaScript Key.
// You can either hard‑code them here or expose them via Netlify env vars
// (see the "Netlify environment variables" box later in this answer).

Parse.initialize(
  "kgfaEs2YlbM1CBOPiLEGyTNU6TUwsbFayxLUWz6v",          // <-- replace or use process.env.PARSE_APP_ID
  "6mPKe3bdTGIBE237fVV7lRei6N9e5oXR7PArQp4Q",          // <-- replace or use process.env.PARSE_JAVASCRIPT_KEY
  "optional third arg"
);

// Use your Back4App parse server URL (default is *.back4app.com)
Parse.serverURL = 'https://parseapi.back4app.com';

// ---- 2️⃣ ESPN config -------------------------------------------------------
const SPORT = "basketball";
const LEAGUE  = "nba";

// ---- 3️⃣ Render scoreboard (direct ESPN fetch) ---------------------------
async function updateScoreboardCards() {
  const resp = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/${SPORT}/${LEAGUE}/scoreboard`
  );
  const data = await resp.json();

  const container = document.getElementById('games');
  container.innerHTML = ''; // clear old cards

  data.events.forEach(ev => {
    const gameId = ev.id;
    const status = ev.status.type.detail;
    const homeScore = ev.competitions[0].competitors[0].score;
    const awayScore = ev.competitions[0].competitors[1].score;

    const homeName = ev.competitions[0].competitors[0].team.abbreviation ||
                     ev.competitions[0].competitors[0].team.displayName;
    const awayName = ev.competitions[0].competitors[1].team.abbreviation ||
                     ev.competitions[0].competitors[1].team.displayName;

    const card = document.createElement('div');
    card.className = 'game-card';
    card.innerHTML = `
      <strong>${awayName}</strong>
      <span class="score" id="score-${gameId}">${awayScore} - ${homeScore}</span>
      <span class="status" id="status-${gameId}">${status}</span>
    `;
    container.appendChild(card);
  });
}

// ---- 4️⃣ Polling loop, respecting visibility -----------------------------
let fetchInterval = null;

function startPolling() {
  if (fetchInterval) clearInterval(fetchInterval);
  updateScoreboardCards(); // immediate first load
  // 30 s interval – adjust up/down if you hit ESPN rate limits
  fetchInterval = setInterval(updateScoreboardCards, 30000);
}

function stopPolling() {
  clearInterval(fetchInterval);
}

// When the user switches tabs/minimises, stop polling
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    startPolling();
  } else {
    stopPolling();
  }
});

// kickoff once the page loads
startPolling();

// ---- 5️⃣ Subscribe a user to a game --------------------------------------
/*
   This function is called from a UI button (or from your own flow).
   It sends the user's Push‑Subscription (obtained from the Service Worker)
   to the Back4App cloud function `subscribeToGame`.
*/
async function subscribeToGame(gameId, sport, league, pushSubscription) {
  // Convert the subscription object to the shape Back4App expects:
  const subscription = {
    endpoint: pushSubscription.endpoint,
    keys: {
      p256dh: pushSubscription.keys.p256dh,
      auth:   pushSubscription.keys.auth
    }
  };

  // Call the cloud function – the function signature expects:
  //   request.params = { gameId, sport, league, subscription }
  const result = await Parse.Cloud.run('subscribeToGame', {
    gameId,
    sport,
    league,
    subscription
  });

  // `result` is { success: true } (or throws)
  if (result.success) {
    alert(`✅ Subscribed to game ${gameId}!`);
  } else {
    alert('❌ Subscription failed – check the console.');
  }
}

// -------------------------------------------------------
// OPTIONAL: a tiny UI to let the visitor subscribe
// -------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // If the browser supports service workers & push, we can get the subscription
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    // Simple "Subscribe" button – you can style it anyway you like
    const btn = document.createElement('button');
    btn.textContent = 'Subscribe to alerts';
    btn.style.marginTop = '1rem';
    btn.addEventListener('click', async () => {
      // 1️⃣ Register the SW (if not already registered)
      const reg = await navigator.serviceWorker.register('/sw.js', {scope: '/'});
      // 2️⃣ Ask the user for permission
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        alert('Notification permission denied.');
        return;
      }
      // 3️⃣ Get the push subscription
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        // If we don't have a subscription yet, create one (user‑visible only)
        const newSub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          // The VAPID public key must be supplied so Back4App can verify the payload.
          // We'll read it from a meta tag or Netlify env var (see below).
          applicationServerKey: urlBase64ToUint8(
            'BA8NXZjt4Aj2NsNFZwFQJPvNHoGdz87nVB_0MJCQdbXFMhgOmkWsd-STbCKtgPIBPrWF7-Umqrili8Ef4xS352E'   // <-- replace or use Netlify env
          )
        });
        // After subscribing, re‑query so `sub` is non‑null
        // (the above block re‑runs automatically, but we keep it tidy.)
        // For this example we simply assign it to `sub` variable below.
        sub = {
          endpoint: newSub.endpoint,
          keys: {
            p256dh: btoa(newSub.keys.p256dh).replace(/=/,''),
            auth:   btoa(newSub.keys.auth).replace(/=/,'')
          }
        };
      }
      // 4️⃣ Pick a game – for demo we hard‑code a gameId you already created
      //    (normally you’d let the user pick from the scoreboard.)
      const gameId = '33186025';   // example NBA game ID – replace dynamically
      const sport = 'basketball';
      const league = 'nba';
      await subscribeToGame(gameId, sport, league, sub);
    });
    document.body.appendChild(btn);
  }
});

// Helper: convert a base64 string to a Uint8Array (required by PushManager)
function urlBase64ToUint8(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
