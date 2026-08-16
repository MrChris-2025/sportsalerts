// -------------------------------------------------------
// index.js – All Parse.Cloud functions for the live‑sports system
// -------------------------------------------------------

const webpush = require('web-push');

// -------------------------------------------------------
// 0️⃣  Helper: ensure required env vars exist (early crash)
// -------------------------------------------------------
function requireEnv(...vars) {
  const missing = vars.filter(v => !process.env[v]);
  if (missing.length) {
    console.error(
      `❌ Missing Back4App environment variables: ${missing.join(', ')}. ` +
      `Add them in Back4App → Server Settings → Environment Variables.`
    );
    // Stop the module from loading further – Back4App will show the error in the function logs.
    throw new Error('Missing required environment variables');
  }
}

// Run the check once when the module is loaded.
requireEnv(
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'QSTASH_TOKEN',
  'PARSE_APP_ID',
  'PARSE_REST_API_KEY'
);

// -------------------------------------------------------
// 1️⃣  Initialise Web‑Push with VAPID keys from env vars
// -------------------------------------------------------
webpush.setVapidDetails(
  'mailto:your-email@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// -------------------------------------------------------
// 2️⃣  Helper: queue the next poll on QStash
// -------------------------------------------------------
async function scheduleNextPoll(sport, league, gameId, lastScore, delaySeconds = 240) {
  const qstashToken = process.env.QSTASH_TOKEN;
  const appId = process.env.PARSE_APP_ID;
  const restApiKey = process.env.PARSE_REST_API_KEY;
  const webhookUrl = `https://parseapi.back4app.com/functions/liveSportsPoller`;

  try {
    await Parse.Cloud.httpRequest({
      method: 'POST',
      url: `https://qstash.upstash.io/v1/publish/${webhookUrl}`,
      headers: {
        'Authorization': `Bearer ${qstashToken}`,
        'Upstash-Delay': `${delaySeconds}s`,
        'Content-Type': 'application/json',
        'Upstash-Forward-X-Parse-Application-Id': appId,
        'Upstash-Forward-X-Parse-REST-API-Key': restApiKey
      },
      body: {
        sport,
        league,
        gameId,
        lastScore
      }
    });
  } catch (err) {
    console.error("QStash Schedule Error:", err);
  }
}

// -------------------------------------------------------
// 3️⃣  Subscription Cloud Function
// -------------------------------------------------------
Parse.Cloud.define("subscribeToGame", async (request) => {
  const { gameId, sport, league, subscription } = request.params;

  if (!gameId || !sport || !league || !subscription) {
    throw new Error("Missing parameters.");
  }

  // Save the client Web Push Subscription
  const GameSubscription = Parse.Object.extend("GameSubscription");
  const subQuery = new Parse.Query("GameSubscription");
  subQuery.equalTo("gameId", gameId);
  subQuery.equalTo("endpoint", subscription.endpoint);
  let subRecord = await subQuery.first({ useMasterKey: true });

  if (!subRecord) {
    subRecord = new GameSubscription();
    subRecord.set("gameId", gameId);
    subRecord.set("subscription", subscription);
    subRecord.set("endpoint", subscription.endpoint);
    await subRecord.save(null, { useMasterKey: true });
  }

  // Manage Active Game State & Trigger QStash
  const gameQuery = new Parse.Query("ActiveGame");
  gameQuery.equalTo("gameId", gameId);
  let gameRecord = await gameQuery.first({ useMasterKey: true });

  if (!gameRecord) {
    const ActiveGame = Parse.Object.extend("ActiveGame");
    gameRecord = new ActiveGame();
    gameRecord.set("gameId", gameId);
    gameRecord.set("sport", sport);
    gameRecord.set("league", league);
    gameRecord.set("scoreText", "Starting soon...");
    gameRecord.set("status", "pre");
    gameRecord.set("isPolling", true);
    await gameRecord.save(null, { useMasterKey: true });

    // Kick‑start the QStash loop immediately
    await scheduleNextPoll(sport, league, gameId, "Initial", 0);
  } else if (!gameRecord.get("isPolling")) {
    gameRecord.set("isPolling", true);
    await gameRecord.save(null, { useMasterKey: true });
    await scheduleNextPoll(sport, league, gameId, gameRecord.get("scoreText") || "Initial", 0);
  }

  return { success: true };
});

// -------------------------------------------------------
// 4️⃣  The Live Poller – triggered by QStash every ~4 min
// -------------------------------------------------------
Parse.Cloud.define("liveSportsPoller", async (request) => {
  const { sport, league, gameId, lastScore } = request.params;

  try {
    // ---- fetch live scoreboard from ESPN ----
    const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard`;
    const apiResponse = await Parse.Cloud.httpRequest({ url: espnUrl });
    const events = apiResponse.data.events;

    if (!events) return "No events running.";

    const event = events.find(e => e.id === gameId);
    if (!event) return "Game not found in today's list. Stopping loop.";

    const competition = event.competitions[0];
    const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
    const awayTeam = competition.competitors.find(c => c.homeAway === 'away');

    const homeScore = homeTeam.score;
    const awayScore = awayTeam.score;
    const homeName = homeTeam.team.abbreviation || homeTeam.team.displayName;
    const awayName = awayTeam.team.abbreviation || awayTeam.team.displayName;

    const currentScore = `${awayName} ${awayScore} - ${homeScore} ${homeName}`;
    const gameState = event.status.type.state;          // "pre" | "in" | "post"
    const gameDetail = event.status.type.detail;       // e.g. "4:15 - 4th"

    const isCompleted = gameState === 'post' || event.status.type.completed === true;
    const scoreChanged = (lastScore === "Initial") || (currentScore !== lastScore);

    /* -------------------------------------------------
       ZERO‑WASTE OPTIMISATION
       -------------------------------------------------
       If the score hasn't changed and the game isn't over,
       we reschedule the poll *without* touching the DB.
       This costs 0 Back4App requests for non‑scoring periods.
       ------------------------------------------------- */
    if (!scoreChanged && !isCompleted) {
      await scheduleNextPoll(sport, league, gameId, lastScore, 240); // 4 min delay
      return "Score unchanged. Re‑enqueued loop.";
    }

    // ---- Score changed or game finished – send pushes ----
    const subscriptionQuery = new Parse.Query("GameSubscription");
    subscriptionQuery.equalTo("gameId", gameId);
    subscriptionQuery.limit(1000);
    const subscriptions = await subscriptionQuery.find({ useMasterKey: true });

    const pushPayload = {
      title: isCompleted ? `FINAL: ${currentScore}` : `Live Score: ${currentScore}`,
      body: gameDetail,
      tag: `game-${gameId}`,               // overwrites older notifications for this game
      icon: homeTeam.team.logo || awayTeam.team.logo,
      vibrate: isCompleted ? true : false // only buzz when the game ends
    };

    // Send notifications concurrently
    const pushPromises = subscriptions.map(async (subRecord) => {
      try {
        await webpush.sendNotification(subRecord.get("subscription"), JSON.stringify(pushPayload));
      } catch (error) {
        // Clean up dead subscriptions (410 = gone, 404 = not found)
        if (error.statusCode === 410 || error.statusCode === 404) {
          await subRecord.destroy({ useMasterKey: true });
        }
      }
    });
    await Promise.all(pushPromises);

    // ---- Persist updated state to DB (for the UI board) ----
    const gameQuery = new Parse.Query("ActiveGame");
    gameQuery.equalTo("gameId", gameId);
    const gameRecord = await gameQuery.first({ useMasterKey: true });

    if (gameRecord) {
      gameRecord.set("scoreText", currentScore);
      gameRecord.set("status", gameState);
      if (isCompleted) {
        gameRecord.set("isPolling", false);
      }
      await gameRecord.save(null, { useMasterKey: true });
    }

    // ---- Recursive poll if the game is still active ----
    if (!isCompleted) {
      await scheduleNextPoll(sport, league, gameId, currentScore, 240);
    }

    return "Alerts dispatched, state synchronized.";
  } catch (error) {
    console.error("Poller Error:", error);
    // On unexpected faults, retry in 1 min so the queue doesn’t break
    await scheduleNextPoll(sport, league, gameId, lastScore, 60);
    throw error;
  }
});
