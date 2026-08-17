Parse.initialize("kgfaEs2YlbM1CBOPiLEGyTNU6TUwsbFayxLUWz6v", "qQB0p5G4Mf0MqMiM6Z5zBEnBypzDPsQRGCrpoNVx");
Parse.serverURL = 'https://parseapi.back4app.com/';

const VAPID_PUBLIC_KEY = "BA8NXZjt4Aj2NsNFZwFQJPvNHoGdz87nVB_0MJCQdbXFMhgOmkWsd-STbCKtgPIBPrWF7-Umqrili8Ef4xS352E";
let currentSport = "basketball";
let currentLeague = "nba";
let fetchInterval = null;
let countdownIntervals = [];

document.addEventListener("DOMContentLoaded", () => {
  const datePicker = document.getElementById("gameDatePicker");
  datePicker.value = new Date().toISOString().split('T')[0];
  updateClock();
  setInterval(updateClock, 1000);
  startPolling();
});

function updateClock() {
  const now = new Date();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  document.getElementById("clock").innerText = `${hours}:${minutes} ${ampm}`;
}

function selectLeague(button) {
  document.querySelectorAll(".league-btn").forEach(btn => btn.classList.remove("active"));
  button.classList.add("active");
  currentSport = button.dataset.sport;
  currentLeague = button.dataset.league;
  updateScoreboardCards();
}

function onDateOrLeagueChange() {
  updateScoreboardCards();
}

function clearCountdowns() {
  countdownIntervals.forEach(clearInterval);
  countdownIntervals = [];
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeToAlerts(gameId) {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Notification permission denied.');
      return;
    }

    if (!('serviceWorker' in navigator)) return;
    const registration = await navigator.serviceWorker.register('./sw.js');
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    await Parse.Cloud.run("subscribeToGame", {
      gameId,
      sport: currentSport,
      league: currentLeague,
      subscription: subscription.toJSON()
    });

    const btn = document.getElementById(`btn-${gameId}`);
    if (btn) {
      btn.innerText = "ALERTS ENABLED ✓";
      btn.disabled = true;
    }
  } catch (err) {
    console.error("Subscription Error:", err);
    alert("Failed to subscribe: " + err.message);
  }
}

async function updateScoreboardCards() {
  clearCountdowns();
  const selectedDate = document.getElementById("gameDatePicker").value.replace(/-/g, "");
  const container = document.getElementById('scoreboard');

  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${currentSport}/${currentLeague}/scoreboard?dates=${selectedDate}`);
    const data = await response.json();

    if (!data.events || data.events.length === 0) {
      container.innerHTML = `<div class="empty-state">No games scheduled for this date.</div>`;
      return;
    }

    container.innerHTML = '';

    data.events.forEach(event => {
      const gameId = event.id;
      const comp = event.competitions[0];
      const statusType = event.status.type;
      const state = statusType.state;
      const gameDate = new Date(event.date);

      const formattedTime = gameDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const formattedDate = gameDate.toLocaleDateString([], { month: 'short', day: 'numeric' });

      const home = comp.competitors.find(c => c.homeAway === 'home');
      const away = comp.competitors.find(c => c.homeAway === 'away');

      const homeColor = home.team.color ? `#${home.team.color}` : 'rgba(255,255,255,0.05)';
      const awayColor = away.team.color ? `#${away.team.color}` : 'rgba(255,255,255,0.05)';

      let liveDetail = comp.status ? comp.status.type.detail : statusType.detail;
      let extraInfo = buildExtraDetails(currentSport, comp, liveDetail, state);

      const card = document.createElement('div');
      card.className = 'card glass';
      card.id = `card-${gameId}`;

      let countdownHTML = '';
      if (state === 'pre') {
        countdownHTML = `<div class="details-box">Starts in: <span class="countdown" id="cd-${gameId}">--:--:--</span></div>`;
        setupCountdown(gameId, gameDate);
      }

      card.innerHTML = `
        <div class="card-header">
          <span>${formattedDate} • ${formattedTime}</span>
          <span class="${state === 'in' ? 'live-badge' : ''}">${state === 'in' ? '● LIVE' : statusType.shortDetail}</span>
        </div>

        <div class="team-row" style="background: linear-gradient(90deg, ${awayColor}33, transparent)">
          <div class="team-info">
            <img class="team-logo" src="${away.team.logo || ''}" alt="">
            <span class="team-name">${away.team.abbreviation || away.team.displayName}</span>
          </div>
          <span class="team-score">${away.score || '0'}</span>
        </div>

        <div class="team-row" style="background: linear-gradient(90deg, ${homeColor}33, transparent)">
          <div class="team-info">
            <img class="team-logo" src="${home.team.logo || ''}" alt="">
            <span class="team-name">${home.team.abbreviation || home.team.displayName}</span>
          </div>
          <span class="team-score">${home.score || '0'}</span>
        </div>

        ${extraInfo ? `<div class="details-box">${extraInfo}</div>` : ''}
        ${countdownHTML}

        <button class="alert-btn" id="btn-${gameId}" onclick="subscribeToAlerts('${gameId}')">ENABLE ALERTS</button>
      `;

      container.appendChild(card);
    });
  } catch (error) {
    console.error("Scoreboard fetch failed:", error);
    container.innerHTML = `<div class="empty-state">Unable to load scores.</div>`;
  }
}

function buildExtraDetails(sport, comp, detail, state) {
  if (state !== 'in') return '';

  const situation = comp.situation;
  if (!situation) return detail;

  if (sport === 'baseball') {
    const balls = situation.balls ?? 0;
    const strikes = situation.strikes ?? 0;
    const outs = situation.outs ?? 0;
    const onFirst = situation.onFirst ? '1B' : '';
    const onSecond = situation.onSecond ? '2B' : '';
    const onThird = situation.onThird ? '3B' : '';
    const bases = [onFirst, onSecond, onThird].filter(Boolean).join(',') || 'Empty';
    return `${detail} | Count: ${balls}-${strikes}, ${outs} Out | Runners: ${bases}`;
  }

  if (sport === 'football') {
    const down = situation.down || 0;
    const distance = situation.distance || 0;
    const yardLine = situation.yardLine || 0;
    const possession = situation.possessionText || '';
    return `${detail} | ${down > 0 ? down + 'th & ' + distance : ''} at ${yardLine} ${possession ? '(' + possession + ')' : ''}`;
  }

  if (sport === 'basketball' || sport === 'hockey') {
    const clock = situation.clock || comp.status?.displayClock || '';
    const period = situation.period || comp.status?.period || '';
    return `Q${period} - ${clock} remaining`;
  }

  return detail;
}

function setupCountdown(gameId, targetDate) {
  const timer = setInterval(() => {
    const now = new Date().getTime();
    const diff = targetDate.getTime() - now;

    const el = document.getElementById(`cd-${gameId}`);
    if (!el) return;

    if (diff <= 0) {
      el.innerText = "Starting...";
      clearInterval(timer);
      return;
    }

    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    el.innerText = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, 1000);

  countdownIntervals.push(timer);
}

function startPolling() {
  if (fetchInterval) clearInterval(fetchInterval);
  updateScoreboardCards();
  fetchInterval = setInterval(updateScoreboardCards, 30000);
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    startPolling();
  } else {
    if (fetchInterval) clearInterval(fetchInterval);
    clearCountdowns();
  }
});
