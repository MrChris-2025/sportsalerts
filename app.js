// -------------------------------------------------------
// app.js – Front‑end for the live‑sports‑alert system
// -------------------------------------------------------

// ------------------- Parse initialisation -------------------
// The SDK reads the keys from Back4App environment variables.
// If you prefer hard‑coding, replace the two lines below with:
//   Parse.initialize("YOUR_APP_ID","YOUR_JS_KEY");
Parse.initialize(
  process.env.PARSE_APP_ID || "kgfaEs2YlbM1CBOPiLEGyTNU6TUwsbFayxLUWz6v",   // <-- Back4App env var (recommended)
  process.env.PARSE_JS_KEY   || "6mPKe3bdTGIBE237fVV7lRei6N9e5oXR7PArQp4Q", // <-- Back4App env var (recommended)
  "optional third arg"
);
Parse.serverURL = 'https://parseapi.back4app.com'; // your Back4App URL

// ------------------- ESPN config ---------------------------
const SPORT = "basketball";
const LEAGUE  = "nba";

// ------------------- Render scoreboard (direct ESPN) -----
async function updateScoreboardCards() {
  try {
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
  } catch (err) {
    console.error("Direct score fetching error:", err);
  }
}

// ------------------- Polling loop, visibility aware -----
let fetchInterval = null;

function startPolling() {
  if (fetchInterval) clearInterval(fetchInterval);
  updateScoreboardCards(); // immediate first load
  // 30 s interval – increase if you hit ESPN rate limits
  fetchInterval = setInterval(updateScoreboardCards, 30000);
}

function stopPolling() {
  clearInterval(fetchInterval);
}

// Stop polling when the tab becomes background / hidden
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    startPolling();
  } else {
    stopPolling();
  }
});

// Kick‑off once the page loads
startPolling();

// ------------------- Push‑subscription helper -------------
/*
   Calls the Back4App Cloud Function `subscribeToGame`.
   The pushSubscription object must come from the Service Worker’s PushManager.
*/
async function subscribeToGame(gameId, sport, league, pushSubscription) {
  const subscription = {
    endpoint: pushSubscription.endpoint,
    keys: {
      p256dh: pushSubscription.keys.p256dh,
      auth:   pushSubscription.keys.auth
    }
  };

  const result = await Parse.Cloud.run('subscribeToGame', {
    gameId,
    sport,
    league,
    subscription
  });

  if (result.success) {
    alert(`✅ Subscribed to game ${gameId}!`);
  } else {
    alert('❌ Subscription failed – see the Back4App logs.');
  }
}

// ------------------- Register Service Worker & get VAPID key ----------
document.addEventListener('DOMContentLoaded', async () => {
  // 1️⃣  If we are not on HTTPS the SW cannot be registered – warn the user.
  if (location.protocol !== 'https:') {
    console.warn('⚠️ Service Worker requires HTTPS. Open the site via https://…');
    return;
  }

  // 2️⃣  Register the SW
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  console.log('✅ Service Worker registered, scope:', reg.scope);

  // 3️⃣  Ask the user for notification permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    alert('Notification permission denied.');
    return;
  }

  // 4️⃣  Retrieve the VAPID public key.
  //    We first try the Back4App env var, then fall back to a <meta> tag.
  let vapidKey = process.env.VAPID_PUBLIC_KEY; // coming from Netlify env (if you set it)
  if (!vapidKey) {
    const meta = document.querySelector('meta[name="vapid-key"]');
    if (meta) vapidKey = meta.content;
  }
  if (!vapidKey) {
    console.error('❌ VAPID public key not found – push will not work.');
    alert('Push notifications are disabled because the VAPID key is missing.');
    return;
  }

  // 5️⃣  Get (or create) a push subscription from the SW
  const sub = await reg.pushManager.getSubscription();
  if (!sub) {
    // No existing subscription → create a new one
    const newSub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8(vapidKey)
    });
    // Refresh the reference so we can use it below
    // (the newly created sub is stored in `newSub`; we’ll just reuse it.)
    // For simplicity we assign it to `sub` after the block.
    sub = {
      endpoint: newSub.endpoint,
      keys: {
        p256dh: btoa(newSub.keys.p256dh).replace(/=/,''),
        auth:   btoa(newSub.keys.auth).replace(/=/,'')
      }
    };
  }

  // 6️⃣  Pick a game to subscribe to.
  //    In a real app you would let the user pick from the scoreboard.
  //    Here we just use a static ESPN game ID as an example.
  const exampleGameId = '33186025';   // replace with a real ID or let the user choose
  const sport = 'basketball';
  const league = 'nba';

  // 7️⃣  Call the Back4App cloud function to store the subscription
  await subscribeToGame(exampleGameId, sport, league, sub);
});

// Helper: base64 → Uint8Array (required by PushManager)
function urlBase64ToUint8(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
});
