// Back4App Initialization
const appId = 'kgfaEs2YlbM1CBOPiLEGyTNU6TUwsbFayxLUWz6v';
const jsKey = '6mPKe3bdTGIBE237fVV7lRei6N9e5oXR7PArQp4Q';
const restKey = 'qQB0p5G4Mf0MqMiM6Z5zBEnBypzDPsQRGCrpoNVx';
const qStashToken = 'eyJVc2VySUQiOiI0MjFkNGRmZS00YWMwLTRmOTItOGJjYS1lNDdlZWJmOGU3YzEiLCJQYXNzd29yZCI6ImY3NTAyM2RkZTQ0OTRmYWU5NDUzNDUyOGU3MGFmMmU1In0='; // Note: This token might be for QStash auth, not Back4App. Assuming it's needed for QStash interactions.

// Initialize Back4App SDK (Assuming you have it installed via npm/yarn or CDN)
// If using CDN: <script src="https://unpkg.com/parse/dist/parse.min.js"></script>
Parse.initialize(appId, jsKey, restKey);
Parse.serverURL = 'https://parseapi.back4app.com/';

const scoresContainer = document.getElementById('scores-container');
let pollingIntervalId = null; // To store the interval ID for stopping it later

// --- Function to fetch scores from ESPN API (example) ---
// IMPORTANT: You'll need to find a reliable, publicly accessible ESPN API endpoint.
// This is a placeholder and may require reverse-engineering or a different API.
async function fetchLiveScoresFromApi() {
    try {
        // Replace with actual ESPN API endpoint and logic to extract game data
        // For example: const response = await fetch('YOUR_ESPN_API_ENDPOINT');
        // const data = await response.json();

        // --- Mock Data (Replace with actual API call) ---
        const mockApiData = [
            {
                gameId: 'game-123',
                homeTeam: 'Lakers',
                awayTeam: 'Celtics',
                homeScore: 110,
                awayScore: 105,
                status: 'InProgress' // or 'Final', 'Scheduled'
            },
            {
                gameId: 'game-456',
                homeTeam: 'Warriors',
                awayTeam: 'Nets',
                homeScore: 98,
                awayScore: 102,
                status: 'InProgress'
            }
        ];
        // --- End Mock Data ---

        return mockApiData; // Return fetched or mock data
    } catch (error) {
        console.error("Error fetching live scores:", error);
        return [];
    }
}

// --- Function to render scores on the UI ---
function renderScores(scores) {
    scoresContainer.innerHTML = ''; // Clear previous scores

    if (scores.length === 0) {
        scoresContainer.innerHTML = '<div class="loading-message">No live games available right now.</div>';
        return;
    }

    scores.forEach(game => {
        const scoreCard = document.createElement('div');
        scoreCard.classList.add('score-card');
        scoreCard.innerHTML = `
            <div class="game-info">${game.awayTeam} vs ${game.homeTeam}</div>
            <div class="score-details">${game.awayScore} - ${game.homeScore}</div>
            <div class="status">${game.status}</div>
        `;
        scoresContainer.appendChild(scoreCard);
    });
}

// --- Function to get scores from Back4App ---
async function getScoresFromBack4App() {
    const Game = Parse.Object.extend("Game");
    const query = new Parse.Query(Game);
    // You might want to filter for games that are 'InProgress' or 'Scheduled'
    // query.equalTo("gameStatus", "InProgress");
    query.limit(10); // Limit the number of games displayed
    try {
        const results = await query.find();
        return results.map(game => ({
            gameId: game.id, // Use Back4App objectId as gameId for updates
            homeTeam: game.get('homeTeam') || 'Home', // Add defaults if these fields aren't guaranteed
            awayTeam: game.get('awayTeam') || 'Away',
            currentScore: game.get('currentScore') || 'N/A - N/A',
            gameStatus: game.get('gameStatus') || 'Unknown'
        }));
    } catch (error) {
        console.error("Error fetching games from Back4App:", error);
        return [];
    }
}

// --- Function to update Back4App with fetched scores ---
async function updateBack4AppScores(apiScores) {
    const Game = Parse.Object.extend("Game");

    for (const apiGame of apiScores) {
        const query = new Parse.Query(Game);
        query.equalTo("gameId", apiGame.gameId); // Assuming you store ESPN's gameId in Back4App
        let gameObject;

        try {
            const results = await query.find();
            if (results.length > 0) {
                gameObject = results[0]; // Game exists, update it
            } else {
                gameObject = new Game(); // Game doesn't exist, create it
                gameObject.set("gameId", apiGame.gameId); // Store ESPN's gameId
            }

            const newScoreString = `${apiGame.awayTeam} ${apiGame.awayScore} - ${apiGame.homeTeam} ${apiGame.homeScore}`;
            const currentScoreInDB = gameObject.get("currentScore");

            // Only update if score has changed or status is different, or if it's a new game
            if (currentScoreInDB !== newScoreString || gameObject.get("gameStatus") !== apiGame.status) {
                gameObject.set("homeTeam", apiGame.homeTeam);
                gameObject.set("awayTeam", apiGame.awayTeam);
                gameObject.set("currentScore", newScoreString);
                gameObject.set("gameStatus", apiGame.status);
                gameObject.set("lastUpdated", new Date());

                await gameObject.save();
                console.log(`Updated/Created game ${apiGame.gameId} in Back4App.`);

                // If the score has changed significantly, trigger a push notification
                // This logic would typically involve comparing the new score to the old one in DB
                // and checking if the game is still 'InProgress'.
                if (apiGame.status === 'InProgress' && currentScoreInDB !== newScoreString) {
                    sendPushNotification(newScoreString, apiGame.gameId);
                }
            }
        } catch (error) {
            console.error(`Error processing game ${apiGame.gameId}:`, error);
        }
    }
}

// --- Function to send push notifications ---
async function sendPushNotification(score, gameId) {
    console.log(`Attempting to send push for game ${gameId}: ${score}`);
    try {
        const response = await fetch('https://us-central1-cloud.church/functions/send-push', { // Replace with your QStash Cloud Function URL
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${qStashToken}` // Assuming QStash token is used for auth here
            },
            body: JSON.stringify({
                // Target specific users or a topic if available in your push setup
                // For now, sending a general notification
                notification: {
                    title: 'Live Score Update!',
                    body: score,
                },
                data: {
                    gameId: gameId, // Useful for identifying which game was updated
                    // You can add more data here, like deep links to the game
                },
                // VAPID Keys for Web Push
                vapid: {
                    publicKey: 'BA8NXZjt4Aj2NsNFZwFQJPvNHoGdz87nVB_0MJCQdbXFMhgOmkWsd-STbCKtgPIBPrWF7-Umqrili8Ef4xS352E',
                    privateKey: '_fln9kijPK_iYpMTVxPqxDGiIvKZubWZIt_bSi2qBt8' // Note: Private key should NEVER be exposed on the client-side. This must be handled server-side or in a secure Cloud Function.
                },
                 // You might need to specify a tag for payload updates
                tag: `game-${gameId}`
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        console.log('Push notification sent successfully.');
    } catch (error) {
        console.error('Failed to send push notification:', error);
    }
}

// --- Main polling function ---
async function pollForScores() {
    console.log('Polling for scores...');
    const apiScores = await fetchLiveScoresFromApi();
    await updateBack4AppScores(apiScores); // Update database first, then render from DB to ensure consistency
    const dbScores = await getScoresFromBack4App(); // Fetch from DB to render
    renderScores(dbScores);

    // Check if any game is still in progress to continue polling
    const isAnyGameInProgress = apiScores.some(game => game.status === 'InProgress');
    if (!isAnyGameInProgress) {
        console.log('No games in progress. Stopping polling.');
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
    }
}

// --- Initialization ---
async function initApp() {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('/sw.js');
            console.log('Service worker registered successfully.');

            // Request permission for notifications
            const permissionResult = await Notification.requestPermission();
            if (permissionResult === 'granted') {
                console.log('Notification permission granted.');
            } else {
                console.warn('Notification permission denied.');
            }
        } catch (error) {
            console.error('Service worker registration failed:', error);
        }
    } else {
        console.warn('Service workers are not supported in this browser.');
    }

    // Initial load of scores
    await pollForScores();

    // Set up polling interval
    // Poll every 60 seconds if games are in progress
    // This interval should be managed carefully to avoid excessive API calls and QStash triggers
    // Consider triggering this polling from a QStash scheduled event instead of setInterval for better control.
    // However, for client-side UI updates *while the app is open*, setInterval is appropriate.
    pollingIntervalId = setInterval(pollForScores, 60000); // Poll every 60 seconds
}

// Start the application
initApp();
