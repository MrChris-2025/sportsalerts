const axios = require('axios');

// Registers Web Push installations server-side using Master Key
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
    const homeTeam = competition?.competitors?.find(c => c.homeAway === 'home');
    const awayTeam = competition?.competitors?.find(c => c.homeAway === 'away');
    
    if (!homeTeam || !awayTeam) return;

    const currentScore = `${awayTeam.team.abbreviation} ${awayTeam.score} - ${homeTeam.team.abbreviation} ${homeTeam.score}`;
    const lastScore = monitorObj.get("lastScore");

    if (lastScore && currentScore !== lastScore) {
      monitorObj.set("lastScore", currentScore);
      
      await Parse.Push.send({
        channels: [`game_${gameId}`],
        data: {
          title: "Score Update 🏆",
          alert: currentScore,
          badge: "Increment"
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
    console.error(`Error polling ESPN game ${gameId}:`, error.message);
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
    monitor.set("sportPath", sportPath || "baseball/mlb");
    monitor.set("status", "in_progress");
    monitor.set("lastScore", "");
    await monitor.save(null, { useMasterKey: true });
  }

  await pollEspnGameLogic(gameId);

  return { message: `Monitoring initialized for game ${gameId}` };
});

Parse.Cloud.define("pollEspnGame", async (request) => {
  const { gameId } = request.params;
  await pollEspnGameLogic(gameId);
});
