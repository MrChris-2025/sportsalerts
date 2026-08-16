// -------------------------------------------------------
// app.js – Front‑end for the live‑sports‑alert system
// (debug‑friendly version)
// -------------------------------------------------------

// ------------------- Parse initialisation -------------------
// The SDK reads the keys from Back4App environment variables.
// If you haven’t added them to Netlify, the fallback values below will be used.
//   Replace the fallback strings with your real keys before production.
Parse.initialize(
  process.env.PARSE_APP_ID || "kgfaEs2YlbM1CBOPiLEGyTNU6TUwsbFayxLUWz6v",
  process.env.PARSE_JS_KEY   || "6mPKe3bdTGIBE237fVV7lRei6N9e5oXR7PArQp4Q",
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

    // ---- Log the raw response for debugging ----
    console.log("ESPN response status:", resp.status);
    console.log("ESPN response ok:", resp.ok);

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`ESPN returned status ${resp.status}: ${txt}`);
    }

    const data = await resp.json();

    // ---- Debug: peek at the first event (if any) ----
    console.log("ESPN events count:", data.events?.length || 0);
    if (data.events?.length) {
      console.log("First event id:", data.events[0]?.id);
    }

    const container = document.getElementById('games');
    container.innerHTML = ''; // clear old text

    if (!data.events || data.events.length === 0) {
      container.innerHTML = "No live games right now.";
      return;
    }

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
    // ---- Central error handling ----
    console.error("❌ updateScoreboardCards error:", err);
    const container = document.getElementById('games');
    container.innerHTML = `Error loading scores: ${err.message}`;
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
   This function is **only called after the user clicks the button**, not on page load.
*/
async function subscribeToGame(gameId, sport, league, pushSubscription) {
  const subscription = {
    endpoint: pushSubscription.endpoint,
    keys: {
      p256dh: pushSubscription.keys.p256dh,
      auth:   pushSubscription.keys.auth
    }
  };

  try {
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
  } catch (e) {
    console.error("❌ subscribeToGame exception:", e);
    alert('❌ Subscription threw an error – check the console.');
  }
}

// ------------------- Register Service Worker & get VAPID key ----------
document.addEventListener('DOMContentLoaded', async () => {
  // 1️⃣  Ensure we are on HTTPS – Service Workers won’t register on localhost http://
  if (location.protocol !== 'https:') {
    console.warn('⚠️ Service Worker requires HTTPS. Open the site via https://…');
    // We still load the scoreboard even if SW can’t register.
  }

  // 2️⃣  Register the SW (if we are on HTTPS)
  let swRegistered = false;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    swRegistered = true;
    console.log('✅ Service Worker registered, scope:', reg.scope);
  } catch (e) {
    console.warn('⚠️ Service Worker registration failed:', e);
  }

  // 3️⃣  Ask the user for notification permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    alert('Notification permission denied.');
    return; // don’t try to subscribe
  }

  // 4️⃣  Retrieve the VAPID public key.
  //    Priority: Netlify env var → <meta> tag → fallback string.
  let vapidKey = process.env.VAPID_PUBLIC_KEY; // set in Netlify if you want
  if (!vapidKey) {
    const meta = document.querySelector('meta[name="vapid-key"]');
    if (meta) vapidKey = meta.content;
  }
  if (!vapidKey) {
    vapidKey = "YOUR_VAPID_PUBLIC_KEY_FALLBACK"; // <-- replace with real key or remove the line
    console.warn('⚠️ Using fallback VAPID key – push may not work.');
  }

  // 5️⃣  Get (or create) a push subscription from the SW
  const sub = await (swRegistered ? navigator.serviceWorker.ready : Promise.resolve()).then(rdy => rdy.pushManager.getSubscription());
  if (!sub) {
    // No existing subscription → create a new one
    try {
      const newSub = await navigator.serviceWorker.ready.then(rdy =>
        rdy.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8(vapidKey)
        )
      );
      // Use the newly created sub for the rest of this flow
      // (we re‑assign `sub` below)
      sub = {
        endpoint: newSub.endpoint,
        keys: {
          p256dh: btoa(newSub.keys.p256dh).replace(/=/,''),
          auth:   btoa(newSub.keys.auth).replace(/=/,'')
        }
      };
      console.log('🆕 Created new push subscription');
    } catch (e) {
      console.error('❌ Failed to subscribe to push:', e);
      alert('Could not subscribe to push notifications.');
      return;
    }
  }

  // 6️⃣  Pick a game to subscribe to.
  //    In a real app you would let the user pick from the scoreboard.
  //    Here we use a static ESPN game ID as an example.
  const exampleGameId = '33186025';   // <-- replace with a real ID or let the user choose
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
}
