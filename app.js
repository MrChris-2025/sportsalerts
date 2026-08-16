// -------------------------------------------------------
// app.js – Front‑end that fetches ESPN directly and
// respects the Page‑Visibility API (keeps DB requests at 0)
// -------------------------------------------------------

let fetchInterval = null;

// Dynamically set sport / league (you can replace these or fetch from a UI)
const SPORT = "basketball";
const LEAGUE  = "nba";

async function updateScoreboardCards() {
  try {
    const response = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/${SPORT}/${LEAGUE}/scoreboard`
    );
    const data = await response.json();

    const container = document.getElementById('games');
    container.innerHTML = '';   // clear previous cards

    // Process each event that is currently “in” the game
    data.events.forEach(event => {
      const gameId = event.id;
      const status = event.status.type.detail;
      const homeScore = event.competitions[0].competitors[0].score;
      const awayScore = event.competitions[0].competitors[1].score;

      const homeName = event.competitions[0].competitors[0].team.abbreviation ||
                       event.competitions[0].competitors[0].team.displayName;
      const awayName = event.competitions[0].competitors[1].team.abbreviation ||
                       event.competitions[0].competitors[1].team.displayName;

      const card = document.createElement('div');
      card.className = 'game-card';
      card.innerHTML = `
        <strong>${awayName}</strong> <span class="score" id="score-${gameId}">${awayScore} - ${homeScore}</span>
        <span class="status" id="status-${gameId}">${status}</span>
      `;
      container.appendChild(card);
    });
  } catch (error) {
    console.error("Direct score fetching error:", error);
  }
}

function startPolling() {
  if (fetchInterval) clearInterval(fetchInterval);
  updateScoreboardCards(); // immediate first load
  // 30‑second interval – you can bump this to 45s or 60s if you hit ESPN rate limits
  fetchInterval = setInterval(updateScoreboardCards, 30000);
}

function stopPolling() {
  clearInterval(fetchInterval);
}

// When the user switches tabs / minimizes the window, stop polling to save battery/data
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    startPolling();
  } else {
    stopPolling();
  }
});

// Kick‑off once the page loads
startPolling();
