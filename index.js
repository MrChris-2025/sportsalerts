const axios = require('axios');

Parse.Cloud.define("registerWebPushInstallation", async (request) => {
  const { installationId, subscription, gameId } = request.params;

  if (!installationId || !subscription) {
    throw new Parse.Error(400, "Installation ID and subscription are required.");
  }

  const subObj = typeof subscription === 'string' ? JSON.parse(subscription) : subscription;

  const Installation = Parse.Object.extend("_Installation");
  const query = new Parse.Query(Installation);
  query.equalTo("installationId", installationId);
  
  let installObj = await query.first({ useMasterKey: true });

  if (!installObj) {
    installObj = new Installation();
    installObj.set("installationId", installationId);
    installObj.set("deviceType", "web");
  }

  installObj.set("pushType", "web");
  installObj.set("deviceToken", subObj.endpoint);
  installObj.set("sub", JSON.stringify(subObj));
  installObj.addUnique("channels", `game_${gameId}`);

  await installObj.save(null, { useMasterKey: true });

  return { success: true };
});

async function pollEspnGameLogic(gameId) {
  const Monitor = Parse.Object.extend("GameMonitor");
  const query = new Parse.Query(Monitor);
  query.equalTo("gameId", String(gameId));
  const monitorObj = await query.first({ useMasterKey: true });

  if (!monitorObj || monitorObj.get("status") === "finished") return;

  const sportPath = monitorObj.get("sportPath") || "baseball/mlb";
  const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/summary?event=${gameId}`;

  try {
    const response = await axios.get(espnUrl);
    const header = response.data?.header;
    const competition = header?.competitions?.[0];
    if (!competition) return;

    const isCompleted = competition?.status?.type?.completed || false;
    const competitors = competition?.competitors || [];
    
    if (competitors.length < 2) return;

    const homeTeam = competitors.find(c => c.homeAway === 'home') || competitors[0];
    const awayTeam = competitors.find(c => c.homeAway === 'away') || competitors[1];

    const awayName = awayTeam.team?.abbreviation || awayTeam.team?.shortDisplayName || 'AWAY';
    const homeName = homeTeam.team?.abbreviation || homeTeam.team?.shortDisplayName || 'HOME';
    const awayScore = awayTeam.score ?? 0;
    const homeScore = homeTeam.score ?? 0;

    const currentScore = `${awayName} ${awayScore} - ${homeName} ${homeScore}`;
    const lastScore = monitorObj.get("lastScore");

    if (lastScore && currentScore !== lastScore) {
      monitorObj.set("lastScore", currentScore);
      
      await Parse.Push.send({
        channels: [`game_${gameId}`],
        data: {
          title: "Score Update 🏆",
          alert: currentScore,
          body: currentScore,
          tag: `game_${gameId}`
        }
      }, { useMasterKey: true });
    } else if (!lastScore) {
      monitorObj.set("lastScore", currentScore);
    }

    if (isCompleted) {
      monitorObj.set("status", "finished");
    }

    await monitorObj.save(null, { useMasterKey: true });
  } catch (error) {
    console.error(`Error polling ESPN event ${gameId} (${sportPath}):`, error.message);
  }
}

Parse.Cloud.define("startGameMonitor", async (request) => {
  const { gameId, sportPath } = request.params;
  if (!gameId) throw new Parse.Error(400, "Game ID is required.");

  const Monitor = Parse.Object.extend("GameMonitor");
  const query = new Parse.Query(Monitor);
  query.equalTo("gameId", String(gameId));
  let monitor = await query.first({ useMasterKey: true });

  if (!monitor) {
    monitor = new Monitor();
    monitor.set("gameId", String(gameId));
  }

  monitor.set("sportPath", sportPath || "baseball/mlb");
  monitor.set("status", "in_progress");
  if (!monitor.get("lastScore")) monitor.set("lastScore", "");
  await monitor.save(null, { useMasterKey: true });

  await pollEspnGameLogic(gameId);

  return { message: `Monitoring initialized for ${sportPath} game ${gameId}` };
});

Parse.Cloud.job("checkActiveGames", async (request) => {
  const Monitor = Parse.Object.extend("GameMonitor");
  const query = new Parse.Query(Monitor);
  query.equalTo("status", "in_progress");

  const activeGames = await query.find({ useMasterKey: true });

  if (activeGames.length === 0) {
    return "No active games to monitor.";
  }

  for (const game of activeGames) {
    await pollEspnGameLogic(game.get("gameId"));
  }

  return `Polled ${activeGames.length} active game(s).`;
});
