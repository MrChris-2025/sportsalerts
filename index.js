const axios = require('axios');

// 1. Triggered on demand when a user toggles alerts on a game card
Parse.Cloud.define("startGameMonitor", async (request) => {
  const { gameId, sportPath } = request.params;

  if (!gameId) throw new Parse.Error(400, "Game ID is required.");

  const Monitor = Parse.Object.extend("GameMonitor");
  const query = new Parse.Query(Monitor);
  query.equalTo("gameId", gameId);
  let monitor = await query.first({ useMasterKey: true });

  if (!monitor) {
    monitor = new Monitor();
    monitor.set("gameId", gameId);
    monitor.set("sportPath", sportPath || "baseball/mlb");
    monitor.set("status", "in_progress");
    monitor.set("lastScore", "");
    await monitor.save(null, { useMasterKey: true });
  }

  // Run immediate initial score check
  Parse.Cloud.run("pollEspnGame", { gameId });

  return { message: `Monitoring initialized for game ${gameId}` };
});

// 2. Polls active games and pushes Web Alerts on score change
Parse.Cloud.define("pollEspnGame", async (request) => {
  const { gameId } = request.params;

  const Monitor = Parse.Object.extend("GameMonitor");
  const query = new Parse.Query(Monitor);
  query.equalTo("gameId", gameId);
  const monitorObj = await query.first({ useMasterKey: true });

  if (!monitorObj || monitorObj.get("status") === "finished") return;

  const sportPath = monitorObj.get("sportPath") || "baseball/mlb";
  const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/summary?event=${gameId}`;

  try {
    const response = await axios.get(espnUrl);
    const header = response.data.header;
    const competition = header?.competitions?.[0];
    const isCompleted = competition?.status?.type?.completed;

    const homeTeam = competition?.competitors?.find(c => c.homeAway === 'home');
    const awayTeam = competition?.competitors?.find(c => c.homeAway === 'away');
    
    if (!homeTeam || !awayTeam) return;

    const currentScore = `${awayTeam.team.abbreviation} ${awayTeam.score} - ${homeTeam.team.abbreviation} ${homeTeam.score}`;
    const lastScore = monitorObj.get("lastScore");

    // Broadcast push alert if score changed
    if (currentScore !== lastScore && lastScore !== "") {
      monitorObj.set("lastScore", currentScore);
      
      await Parse.Push.send({
        channels: [`game_${gameId}`],
        data: {
          title: "Score Update 🏆",
          alert: currentScore,
          badge: "Increment"
        }
      }, { useMasterKey: true });
    } else if (lastScore === "") {
      monitorObj.set("lastScore", currentScore);
    }

    if (isCompleted) {
      monitorObj.set("status", "finished");
    }

    await monitorObj.save(null, { useMasterKey: true });

  } catch (error) {
    console.error(`Error polling ESPN game ${gameId}:`, error.message);
  }
});
