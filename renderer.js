// API Configuration
// Get your free TMDB API key at: https://www.themoviedb.org/settings/api
const TMDB_API_KEY = '111909b8747aeff1169944069465906c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
const STREAMS_API_BASE = 'https://tlo.sh/mvsapi/api/streams';

// ==================== ACCENT COLOR THEMING ====================

// Palette of accent colors that maintain good contrast with white text
const accentColorPalette = [
  { primary: '#e63946', secondary: '#ff6b6b', glow: 'rgba(230, 57, 70, 0.3)', gradientEnd: '#ff4757' }, // Red
  { primary: '#ff6b9d', secondary: '#ff8fb3', glow: 'rgba(255, 107, 157, 0.3)', gradientEnd: '#ff8fb3' }, // Pink
  { primary: '#4dabf7', secondary: '#74c0fc', glow: 'rgba(77, 171, 247, 0.3)', gradientEnd: '#66d9ef' }, // Blue
  { primary: '#ffd43b', secondary: '#ffec8c', glow: 'rgba(255, 212, 59, 0.3)', gradientEnd: '#ffec8c' }, // Yellow
  { primary: '#868e96', secondary: '#adb5bd', glow: 'rgba(134, 142, 150, 0.3)', gradientEnd: '#adb5bd' }, // Grey
  { primary: '#51cf66', secondary: '#69db7c', glow: 'rgba(81, 207, 102, 0.3)', gradientEnd: '#69db7c' }, // Green
  { primary: '#ff922b', secondary: '#ffa94d', glow: 'rgba(255, 146, 43, 0.3)', gradientEnd: '#ffa94d' }, // Orange
  { primary: '#845ef7', secondary: '#9775fa', glow: 'rgba(132, 94, 247, 0.3)', gradientEnd: '#9775fa' }, // Purple
  { primary: '#20c997', secondary: '#3dd5f3', glow: 'rgba(32, 201, 151, 0.3)', gradientEnd: '#3dd5f3' }, // Teal
  { primary: '#fa5252', secondary: '#ff8787', glow: 'rgba(250, 82, 82, 0.3)', gradientEnd: '#ff8787' }, // Coral
];

// Apply random accent color theme
function applyRandomAccentTheme() {
  // Pick a random color from the palette
  const randomColor = accentColorPalette[Math.floor(Math.random() * accentColorPalette.length)];
  
  // Get the root element
  const root = document.documentElement;
  
  // Convert hex to RGB for rgba
  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }
  
  const rgb = hexToRgb(randomColor.primary);
  const activeBg = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)` : randomColor.glow.replace('0.3', '0.1');
  
  // Apply the accent colors
  root.style.setProperty('--accent-primary', randomColor.primary);
  root.style.setProperty('--accent-secondary', randomColor.secondary);
  root.style.setProperty('--accent-glow', randomColor.glow);
  root.style.setProperty('--accent-active-bg', activeBg);
  root.style.setProperty('--gradient-accent', `linear-gradient(135deg, ${randomColor.primary} 0%, ${randomColor.gradientEnd} 100%)`);
  
  console.log('Applied accent theme:', randomColor.primary);
}

// Apply theme on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyRandomAccentTheme);
} else {
  applyRandomAccentTheme();
}

// Detect if running in browser (not Electron)
const isBrowserMode = typeof window !== 'undefined' && !window.electronAPI;

// Hide Electron-only UI elements in browser mode
if (isBrowserMode) {
  document.addEventListener('DOMContentLoaded', () => {
    // Hide window controls
    const windowControls = document.querySelector('.window-controls');
    if (windowControls) windowControls.style.display = 'none';
    
    // Hide settings button (network sharing only works from Electron app)
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) settingsBtn.style.display = 'none';
  });
}

// Get base URL for API calls - use proxy when in browser mode
function getAPIBaseURL() {
  if (isBrowserMode) {
    // When accessed from browser, use the server's API proxy
    return '/api';
  }
  return TMDB_BASE_URL;
}

// Wrapper for fetch that routes through proxy in browser mode
async function apiFetch(url, options = {}) {
  // If it's already a full URL and we're in browser mode, route through proxy
  if (isBrowserMode && url.startsWith('http')) {
    // Extract the path from TMDB URL
    const urlObj = new URL(url);
    const path = urlObj.pathname + urlObj.search;
    url = `/api${path}`;
  }
  
  return fetch(url, options);
}

// OpenSubtitles API (Optional) - Get your free API key at: https://www.opensubtitles.com/consumers
const OPENSUBTITLES_API_KEY = 'KF58KC3oXaO3M29b334T3BcwIubxksNT'; // Leave empty to use Subdl fallback, or add your OpenSubtitles API key
const OPENSUBTITLES_API_URL = 'https://api.opensubtitles.com/api/v1';

// Discord Rich Presence - GitHub Repository URL
const GITHUB_REPO_URL = 'https://github.com/goonernator/CineStream'; // Replace with your GitHub repository URL

// DOM Elements
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const homepage = document.getElementById('homepage');
const movieDetails = document.getElementById('movie-details');
const playerContainer = document.getElementById('player-container');
const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const videoPlayer = document.getElementById('video-player');

// State
let currentMovie = null;
let currentMediaType = 'movie'; // 'movie' or 'tv'
let currentSeason = 1;
let currentEpisode = 1;
let currentStreamUrl = null;
let currentStreams = [];
let currentSubtitles = [];
let searchTimeout = null;
let hlsInstance = null;
let currentTab = 'home';
let selectedRating = 0;
let trailerCache = {}; // Cache trailers to avoid re-fetching
let streamCache = {}; // Cache stream data to avoid re-fetching
let youtubePlayers = {}; // Store YouTube player instances

// Load stream cache from localStorage
function loadStreamCache() {
  try {
    const saved = localStorage.getItem('stream_cache');
    if (saved) {
      streamCache = JSON.parse(saved);
    }
  } catch (error) {
    console.error('Failed to load stream cache:', error);
    streamCache = {};
  }
}

// Save stream cache to localStorage
function saveStreamCache() {
  try {
    localStorage.setItem('stream_cache', JSON.stringify(streamCache));
  } catch (error) {
    console.error('Failed to save stream cache:', error);
    // If storage is full, clear old entries (keep last 100)
    if (error.name === 'QuotaExceededError') {
      const entries = Object.entries(streamCache);
      if (entries.length > 100) {
        // Keep the most recent 100 entries
        const sorted = entries.sort((a, b) => {
          // Sort by timestamp if available, otherwise keep as is
          return 0;
        });
        streamCache = Object.fromEntries(sorted.slice(-100));
        localStorage.setItem('stream_cache', JSON.stringify(streamCache));
      }
    }
  }
}

// Initialize stream cache on load
loadStreamCache();

// TMDB Account State
let tmdbSession = {
  sessionId: null,
  accountId: null,
  username: null,
  avatar: null,
  requestToken: null
};

// ==================== TMDB AUTHENTICATION ====================

function loadSession() {
  const saved = localStorage.getItem('tmdb_session');
  if (saved) {
    tmdbSession = JSON.parse(saved);
    updateAccountUI();
    return true;
  }
  return false;
}

function saveSession() {
  localStorage.setItem('tmdb_session', JSON.stringify(tmdbSession));
}

function clearSession() {
  tmdbSession = {
    sessionId: null,
    accountId: null,
    username: null,
    avatar: null,
    requestToken: null
  };
  localStorage.removeItem('tmdb_session');
  updateAccountUI();
  showToast('Signed out successfully');
}

function isLoggedIn() {
  return tmdbSession.sessionId !== null;
}

async function startAuthentication() {
  try {
    // Step 1: Get request token
    const apiUrl = isBrowserMode 
      ? `/api/authentication/token/new?api_key=${TMDB_API_KEY}`
      : `${TMDB_BASE_URL}/authentication/token/new?api_key=${TMDB_API_KEY}`;
    
    const tokenResponse = await fetch(apiUrl);
    const tokenData = await tokenResponse.json();
    
    if (!tokenData.success) throw new Error('Failed to get request token');
    
    tmdbSession.requestToken = tokenData.request_token;
    
    // Step 2: Open TMDB auth page in browser
    const authUrl = `https://www.themoviedb.org/authenticate/${tokenData.request_token}`;
    if (window.electronAPI && window.electronAPI.openExternal) {
      window.electronAPI.openExternal(authUrl);
    } else {
      // In browser mode, open in same window
      window.open(authUrl, '_blank');
    }
    
    // Show waiting state
    document.getElementById('start-auth-btn').classList.add('hidden');
    document.getElementById('auth-status').classList.remove('hidden');
    document.getElementById('complete-auth-btn').classList.remove('hidden');
    
  } catch (error) {
    console.error('Auth error:', error);
    showToast('Authentication failed. Please try again.');
  }
}

async function completeAuthentication() {
  try {
    // Step 3: Create session with approved token
    const sessionUrl = isBrowserMode
      ? `/api/authentication/session/new?api_key=${TMDB_API_KEY}`
      : `${TMDB_BASE_URL}/authentication/session/new?api_key=${TMDB_API_KEY}`;
    
    const sessionResponse = await fetch(sessionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_token: tmdbSession.requestToken })
    });
    const sessionData = await sessionResponse.json();
    
    if (!sessionData.success) {
      throw new Error('Please approve the request on TMDB first');
    }
    
    tmdbSession.sessionId = sessionData.session_id;
    
    // Step 4: Get account details
    const accountUrl = isBrowserMode
      ? `/api/account?api_key=${TMDB_API_KEY}&session_id=${tmdbSession.sessionId}`
      : `${TMDB_BASE_URL}/account?api_key=${TMDB_API_KEY}&session_id=${tmdbSession.sessionId}`;
    
    const accountResponse = await fetch(accountUrl);
    const accountData = await accountResponse.json();
    
    tmdbSession.accountId = accountData.id;
    tmdbSession.username = accountData.username;
    tmdbSession.avatar = accountData.avatar?.tmdb?.avatar_path || null;
    
    saveSession();
    updateAccountUI();
    hideLoginModal();
    showToast(`Welcome, ${tmdbSession.username}!`);
    
    // Refresh current tab
    if (currentTab !== 'search') {
      loadListContent(currentTab);
    }
    
  } catch (error) {
    console.error('Session error:', error);
    showToast(error.message || 'Failed to complete authentication');
  }
}

function updateAccountUI() {
  const accountBtn = document.getElementById('account-btn');
  const accountName = document.getElementById('account-name');
  const accountSub = document.getElementById('account-sub');
  const accountAvatar = document.getElementById('account-avatar');
  
  if (isLoggedIn()) {
    accountBtn.classList.remove('logged-out');
    accountBtn.classList.add('logged-in');
    accountName.textContent = tmdbSession.username;
    accountSub.textContent = 'Click to sign out';
    
    if (tmdbSession.avatar) {
      accountAvatar.innerHTML = `<img src="${TMDB_IMAGE_BASE}/w45${tmdbSession.avatar}" alt="">`;
    } else {
      accountAvatar.innerHTML = `<span>${tmdbSession.username.charAt(0).toUpperCase()}</span>`;
    }
  } else {
    accountBtn.classList.add('logged-out');
    accountBtn.classList.remove('logged-in');
    accountName.textContent = 'Sign in to TMDB';
    accountSub.textContent = 'Access favorites & watchlist';
    accountAvatar.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    `;
  }
}

// Account button click handler
document.getElementById('account-btn').addEventListener('click', () => {
  if (isLoggedIn()) {
    if (confirm('Sign out of TMDB?')) {
      clearSession();
    }
  } else {
    showLoginModal();
  }
});

// ==================== FAVORITES, WATCHLIST, RATINGS ====================


async function rateMovie(movieId, rating) {
  if (!isLoggedIn()) {
    showLoginModal();
    return;
  }
  
  try {
    const mediaType = currentMediaType || 'movie';
    const response = await fetch(
      `${getAPIBaseURL()}/${mediaType}/${movieId}/rating?api_key=${TMDB_API_KEY}&session_id=${tmdbSession.sessionId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: rating })
      }
    );
    const data = await response.json();
    
    if (data.success) {
      showToast(`Rated ${rating}/10`);
      hideRatingModal();
      updateMovieAccountState();
    }
  } catch (error) {
    console.error('Rating error:', error);
    showToast('Failed to submit rating');
  }
}

async function deleteRating(movieId) {
  if (!isLoggedIn()) return;
  
  try {
    const mediaType = currentMediaType || 'movie';
    const response = await fetch(
      `${getAPIBaseURL()}/${mediaType}/${movieId}/rating?api_key=${TMDB_API_KEY}&session_id=${tmdbSession.sessionId}`,
      { method: 'DELETE' }
    );
    const data = await response.json();
    
    if (data.success) {
      showToast('Rating removed');
      hideRatingModal();
      updateMovieAccountState();
    }
  } catch (error) {
    console.error('Delete rating error:', error);
    showToast('Failed to remove rating');
  }
}

async function getMovieAccountState(movieId, mediaType = null) {
  if (!isLoggedIn()) return null;
  
  try {
    const type = mediaType || currentMediaType || 'movie';
    const response = await fetch(
      `${getAPIBaseURL()}/${type}/${movieId}/account_states?api_key=${TMDB_API_KEY}&session_id=${tmdbSession.sessionId}`
    );
    return await response.json();
  } catch (error) {
    console.error('Account state error:', error);
    return null;
  }
}

async function updateMovieAccountState() {
  if (!currentMovie || !isLoggedIn()) return;
  
  const state = await getMovieAccountState(currentMovie.id);
  if (!state) return;
  
  const favoriteBtn = document.getElementById('favorite-btn');
  const watchlistBtn = document.getElementById('watchlist-btn');
  const rateBtn = document.getElementById('rate-btn');
  
  // Update favorite button
  if (state.favorite) {
    favoriteBtn.classList.add('active');
    favoriteBtn.querySelector('svg').setAttribute('fill', 'currentColor');
  } else {
    favoriteBtn.classList.remove('active');
    favoriteBtn.querySelector('svg').setAttribute('fill', 'none');
  }
  
  // Update watchlist button
  if (state.watchlist) {
    watchlistBtn.classList.add('active');
    watchlistBtn.querySelector('svg').setAttribute('fill', 'currentColor');
  } else {
    watchlistBtn.classList.remove('active');
    watchlistBtn.querySelector('svg').setAttribute('fill', 'none');
  }
  
  // Update rate button
  if (state.rated && state.rated.value) {
    rateBtn.classList.add('active');
    rateBtn.querySelector('svg').setAttribute('fill', 'currentColor');
    rateBtn.title = `Your rating: ${state.rated.value}/10`;
  } else {
    rateBtn.classList.remove('active');
    rateBtn.querySelector('svg').setAttribute('fill', 'none');
    rateBtn.title = 'Rate Movie';
  }
}

// ==================== LIST LOADING ====================

async function loadListContent(listType) {
  if (!isLoggedIn()) {
    showListEmpty(listType, 'Sign in to view your ' + listType);
    return;
  }
  
  const listEl = document.getElementById(`${listType}-list`);
  listEl.innerHTML = '<div class="search-loading"><div class="loader-small"></div><span>Loading...</span></div>';
  
  try {
    let movieUrl, tvUrl;
    switch (listType) {
      case 'favorites':
        movieUrl = `${getAPIBaseURL()}/account/${tmdbSession.accountId}/favorite/movies?api_key=${TMDB_API_KEY}&session_id=${tmdbSession.sessionId}`;
        tvUrl = `${getAPIBaseURL()}/account/${tmdbSession.accountId}/favorite/tv?api_key=${TMDB_API_KEY}&session_id=${tmdbSession.sessionId}`;
        break;
      case 'watchlist':
        movieUrl = `${TMDB_BASE_URL}/account/${tmdbSession.accountId}/watchlist/movies?api_key=${TMDB_API_KEY}&session_id=${tmdbSession.sessionId}`;
        tvUrl = `${TMDB_BASE_URL}/account/${tmdbSession.accountId}/watchlist/tv?api_key=${TMDB_API_KEY}&session_id=${tmdbSession.sessionId}`;
        break;
    }
    
    // Fetch both movies and TV shows
    const [movieRes, tvRes] = await Promise.all([
      fetch(movieUrl),
      fetch(tvUrl)
    ]);
    const [movieData, tvData] = await Promise.all([
      movieRes.json(),
      tvRes.json()
    ]);
    
    // Tag each item with its media type and merge
    const movies = (movieData.results || []).map(m => ({ ...m, media_type: 'movie' }));
    const tvShows = (tvData.results || []).map(t => ({ ...t, media_type: 'tv' }));
    const combined = [...movies, ...tvShows];
    
    if (combined.length > 0) {
      displayListResults(listType, combined);
    } else {
      showListEmpty(listType);
    }
  } catch (error) {
    console.error(`Load ${listType} error:`, error);
    showListEmpty(listType, 'Failed to load');
  }
}

function displayListResults(listType, items) {
  const listEl = document.getElementById(`${listType}-list`);
  
  listEl.innerHTML = items.map(item => {
    const isTV = item.media_type === 'tv';
    const title = escapeHtml(item.title || item.name || 'Unknown Title');
    const date = isTV ? item.first_air_date : item.release_date;
    const year = date ? date.split('-')[0] : 'Unknown';
    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
    const userRating = item.rating ? ` • ★ ${item.rating}` : '';
    const typeTag = isTV 
      ? '<span class="media-tag media-tag-tv">TV</span>' 
      : '<span class="media-tag media-tag-movie">Movie</span>';
    const poster = item.poster_path 
      ? `${TMDB_IMAGE_BASE}/w92${item.poster_path}`
      : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 92 138"%3E%3Crect fill="%231a1a2e" width="92" height="138"/%3E%3C/svg%3E';
    
    return `
      <div class="search-result-item" data-id="${item.id}" data-type="${item.media_type || 'movie'}" data-list-type="${listType}">
        <img class="result-poster" src="${poster}" alt="">
        <div class="result-info">
          <h3>${title} ${typeTag}</h3>
          <span>${year}${userRating}</span>
        </div>
        <div class="result-rating">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <span>${rating}</span>
        </div>
      </div>
    `;
  }).join('');
  
  listEl.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      const type = item.dataset.type;
      loadMedia(id, type);
    });
  });
}


function showListEmpty(listType, message = null) {
  const listEl = document.getElementById(`${listType}-list`);
  const icons = {
    favorites: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    watchlist: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>'
  };
  const defaultMessages = {
    favorites: 'No favorites yet',
    watchlist: 'Watchlist is empty'
  };
  
  listEl.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${icons[listType]}</svg>
      <p>${message || defaultMessages[listType]}</p>
      <span>${isLoggedIn() ? 'Add movies from search' : 'Sign in to sync'}</span>
    </div>
  `;
}

// ==================== TAB NAVIGATION ====================

document.querySelectorAll('.nav-tab[data-tab]').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;
    switchTab(tabName);
  });
});

function switchTab(tabName) {
  currentTab = tabName;
  
  // Update tab buttons
  document.querySelectorAll('.nav-tab[data-tab]').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });
  
  // Hide homepage
  const homepage = document.getElementById('homepage');
  const listsContainer = document.querySelector('.lists-container');
  
  // Handle home tab - show homepage
  if (tabName === 'home') {
    if (homepage) homepage.classList.remove('hidden');
    if (listsContainer) listsContainer.classList.add('hidden');
  } else {
    // Show lists container and hide homepage
    if (homepage) homepage.classList.add('hidden');
    if (listsContainer) listsContainer.classList.remove('hidden');
    
    // Show/hide specific list content
    document.getElementById('favorites-list')?.classList.toggle('hidden', tabName !== 'favorites');
    document.getElementById('watchlist-list')?.classList.toggle('hidden', tabName !== 'watchlist');
    
    // Load list content for the selected tab
    loadListContent(tabName);
  }
}

// ==================== MODALS ====================

function showLoginModal() {
  document.getElementById('login-modal').classList.remove('hidden');
  document.getElementById('start-auth-btn').classList.remove('hidden');
  document.getElementById('auth-status').classList.add('hidden');
  document.getElementById('complete-auth-btn').classList.add('hidden');
}

function hideLoginModal() {
  document.getElementById('login-modal').classList.add('hidden');
}

function showRatingModal() {
  if (!isLoggedIn()) {
    showLoginModal();
    return;
  }
  
  document.getElementById('rating-modal').classList.remove('hidden');
  document.getElementById('rating-movie-title').textContent = currentMovie?.title || '';
  selectedRating = 0;
  updateStarDisplay(0);
  document.getElementById('rating-value').textContent = 'Select a rating';
}

function hideRatingModal() {
  document.getElementById('rating-modal').classList.add('hidden');
}

function updateStarDisplay(rating) {
  document.querySelectorAll('.star').forEach((star, idx) => {
    star.classList.toggle('active', idx < rating);
  });
}

// ==================== SETTINGS MODAL ====================

let networkServerStatus = {
  running: false,
  ip: null,
  port: null,
  url: null
};

function showSettingsModal() {
  document.getElementById('settings-modal').classList.remove('hidden');
  updateNetworkStatus();
}

function hideSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
}

async function updateNetworkStatus() {
  try {
    if (!window.electronAPI) {
      console.warn('electronAPI not available (running in browser)');
      return;
    }
    const status = await window.electronAPI.getNetworkServerStatus();
    networkServerStatus = status;
    
    const statusElement = document.getElementById('network-status');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const connectionIP = document.getElementById('connection-ip');
    const connectionPort = document.getElementById('connection-port');
    const connectionUrl = document.getElementById('connection-url');
    const toggle = document.getElementById('network-sharing-toggle');
    
    if (status.running) {
      statusElement.classList.remove('hidden');
      statusDot.classList.add('active');
      statusDot.classList.remove('error');
      statusText.textContent = 'Server is running';
      connectionIP.textContent = status.ip || '-';
      connectionPort.textContent = status.port || '-';
      connectionUrl.value = status.url || '-';
      toggle.checked = true;
    } else {
      statusElement.classList.add('hidden');
      statusDot.classList.remove('active', 'error');
      statusText.textContent = 'Server is stopped';
      toggle.checked = false;
    }
  } catch (error) {
    console.error('Failed to get network status:', error);
  }
}

async function toggleNetworkSharing(enabled) {
  if (!window.electronAPI) {
    showToast('Network sharing is only available in the Electron app');
    document.getElementById('network-sharing-toggle').checked = false;
    return;
  }
  
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const statusElement = document.getElementById('network-status');
  
  try {
    if (enabled) {
      statusElement.classList.remove('hidden');
      statusDot.classList.remove('active', 'error');
      statusText.textContent = 'Starting server...';
      
      const result = await window.electronAPI.startNetworkServer();
      
      if (result.success) {
        networkServerStatus = {
          running: true,
          ip: result.ip,
          port: result.port,
          url: result.url
        };
        
        statusDot.classList.add('active');
        statusText.textContent = 'Server is running';
        
        document.getElementById('connection-ip').textContent = result.ip;
        document.getElementById('connection-port').textContent = result.port;
        document.getElementById('connection-url').value = result.url;
        
        showToast(`Network server started on ${result.url}`);
      } else {
        statusDot.classList.add('error');
        statusText.textContent = `Failed to start: ${result.error || 'Unknown error'}`;
        document.getElementById('network-sharing-toggle').checked = false;
        showToast('Failed to start network server');
      }
    } else {
      statusDot.classList.remove('active', 'error');
      statusText.textContent = 'Stopping server...';
      
      const result = await window.electronAPI.stopNetworkServer();
      
      if (result.success) {
        networkServerStatus = {
          running: false,
          ip: null,
          port: null,
          url: null
        };
        
        statusElement.classList.add('hidden');
        showToast('Network server stopped');
      } else {
        showToast('Failed to stop network server');
      }
    }
  } catch (error) {
    console.error('Network sharing toggle error:', error);
    statusDot.classList.add('error');
    statusText.textContent = 'Error occurred';
    document.getElementById('network-sharing-toggle').checked = false;
    showToast('An error occurred');
  }
}

function copyNetworkUrl() {
  const urlInput = document.getElementById('connection-url');
  const url = urlInput.value;
  
  if (url && url !== '-') {
    navigator.clipboard.writeText(url).then(() => {
      showToast('URL copied to clipboard');
      const copyBtn = document.getElementById('copy-url-btn');
      const originalHTML = copyBtn.innerHTML;
      copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';
      setTimeout(() => {
        copyBtn.innerHTML = originalHTML;
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy:', err);
      showToast('Failed to copy URL');
    });
  }
}

// Settings modal event listeners
const settingsBtn = document.getElementById('settings-btn');
if (settingsBtn) {
  settingsBtn.addEventListener('click', showSettingsModal);
}

const settingsModal = document.getElementById('settings-modal');
if (settingsModal) {
  document.getElementById('settings-modal-close').addEventListener('click', hideSettingsModal);
  settingsModal.querySelector('.modal-backdrop').addEventListener('click', hideSettingsModal);
  
  // Periodically update network status when modal is open
  let networkStatusInterval = null;
  settingsModal.addEventListener('transitionend', () => {
    if (!settingsModal.classList.contains('hidden')) {
      updateNetworkStatus();
      networkStatusInterval = setInterval(updateNetworkStatus, 2000);
    } else {
      if (networkStatusInterval) {
        clearInterval(networkStatusInterval);
        networkStatusInterval = null;
      }
    }
  });
}

const networkToggle = document.getElementById('network-sharing-toggle');
if (networkToggle) {
  networkToggle.addEventListener('change', (e) => {
    toggleNetworkSharing(e.target.checked);
  });
}

const copyUrlBtn = document.getElementById('copy-url-btn');
if (copyUrlBtn) {
  copyUrlBtn.addEventListener('click', copyNetworkUrl);
}

// Modal event listeners
document.getElementById('login-modal-close').addEventListener('click', hideLoginModal);
document.getElementById('login-modal').querySelector('.modal-backdrop').addEventListener('click', hideLoginModal);
document.getElementById('start-auth-btn').addEventListener('click', startAuthentication);
document.getElementById('complete-auth-btn').addEventListener('click', completeAuthentication);

document.getElementById('rating-modal-close').addEventListener('click', hideRatingModal);
document.getElementById('rating-modal').querySelector('.modal-backdrop').addEventListener('click', hideRatingModal);

document.querySelectorAll('.star').forEach(star => {
  star.addEventListener('mouseenter', () => {
    updateStarDisplay(parseInt(star.dataset.value));
  });
  star.addEventListener('click', () => {
    selectedRating = parseInt(star.dataset.value);
    updateStarDisplay(selectedRating);
    document.getElementById('rating-value').textContent = `${selectedRating}/10`;
  });
});

document.getElementById('star-rating').addEventListener('mouseleave', () => {
  updateStarDisplay(selectedRating);
});

document.getElementById('submit-rating-btn').addEventListener('click', () => {
  if (selectedRating > 0 && currentMovie) {
    rateMovie(currentMovie.id, selectedRating);
  }
});

document.getElementById('clear-rating-btn').addEventListener('click', () => {
  if (currentMovie) {
    deleteRating(currentMovie.id);
  }
});

// Movie action buttons
document.getElementById('favorite-btn').addEventListener('click', async () => {
  if (!currentMovie) return;
  const state = await getMovieAccountState(currentMovie.id);
  toggleFavorite(currentMovie.id, !state?.favorite);
});

document.getElementById('watchlist-btn').addEventListener('click', async () => {
  if (!currentMovie) return;
  const state = await getMovieAccountState(currentMovie.id);
  toggleWatchlist(currentMovie.id, !state?.watchlist);
});

document.getElementById('rate-btn').addEventListener('click', () => {
  showRatingModal();
});

// ==================== INLINE CAST ====================

let fullCastList = [];

async function loadCast(mediaId, mediaType) {
  const scrollEl = document.getElementById('cast-scroll');
  scrollEl.innerHTML = '<div class="cast-loading-inline"><div class="loader-small"></div></div>';
  
  try {
    const response = await fetch(
      `${getAPIBaseURL()}/${mediaType}/${mediaId}/credits?api_key=${TMDB_API_KEY}`
    );
    const data = await response.json();
    
    if (data.cast && data.cast.length > 0) {
      fullCastList = data.cast;
      displayCastInline(fullCastList.slice(0, 5), fullCastList.length > 5);
    } else {
      fullCastList = [];
      scrollEl.innerHTML = '<div class="cast-empty-inline">No cast information available</div>';
    }
  } catch (error) {
    console.error('Failed to load cast:', error);
    fullCastList = [];
    scrollEl.innerHTML = '<div class="cast-empty-inline">Failed to load cast</div>';
  }
}

function displayCastInline(cast, showViewMore = false) {
  const scrollEl = document.getElementById('cast-scroll');
  
  const castHtml = cast.map(person => {
    const name = escapeHtml(person.name || 'Unknown');
    const character = escapeHtml(person.character || person.roles?.[0]?.character || '');
    const photo = person.profile_path 
      ? `${TMDB_IMAGE_BASE}/w185${person.profile_path}`
      : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 185 278"%3E%3Crect fill="%231a1a2e" width="185" height="278"/%3E%3Ccircle cx="92" cy="100" r="40" fill="%232a2a4a"/%3E%3Cellipse cx="92" cy="220" rx="60" ry="50" fill="%232a2a4a"/%3E%3C/svg%3E';
    
    return `
      <div class="cast-card-inline">
        <img class="cast-photo-inline" src="${photo}" alt="" loading="lazy">
        <span class="cast-name-inline">${name}</span>
        <span class="cast-character-inline">${character}</span>
      </div>
    `;
  }).join('');
  
  const viewMoreBtn = showViewMore ? `
    <button class="cast-view-more" id="cast-view-more">
      <span class="view-more-count">+${fullCastList.length - 5}</span>
      <span>View All</span>
    </button>
  ` : '';
  
  scrollEl.innerHTML = castHtml + viewMoreBtn;
  
  // Add event listener for view more - opens modal
  const viewMoreEl = document.getElementById('cast-view-more');
  if (viewMoreEl) {
    viewMoreEl.addEventListener('click', showCastModal);
  }
}

// ==================== CAST MODAL ====================

function showCastModal() {
  if (!currentMovie || fullCastList.length === 0) return;
  
  const modal = document.getElementById('cast-modal');
  const titleEl = document.getElementById('cast-movie-title');
  const gridEl = document.getElementById('cast-grid');
  
  modal.classList.remove('hidden');
  titleEl.textContent = currentMovie.title || currentMovie.name;
  
  // Display all cast members in grid
  gridEl.innerHTML = fullCastList.map(person => {
    const name = escapeHtml(person.name || 'Unknown');
    const character = escapeHtml(person.character || person.roles?.[0]?.character || '');
    const photo = person.profile_path 
      ? `${TMDB_IMAGE_BASE}/w185${person.profile_path}`
      : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 185 278"%3E%3Crect fill="%231a1a2e" width="185" height="278"/%3E%3Ccircle cx="92" cy="100" r="40" fill="%232a2a4a"/%3E%3Cellipse cx="92" cy="220" rx="60" ry="50" fill="%232a2a4a"/%3E%3C/svg%3E';
    
    return `
      <div class="cast-card">
        <img class="cast-photo" src="${photo}" alt="" loading="lazy">
        <div class="cast-info">
          <span class="cast-name">${name}</span>
          <span class="cast-character">${character}</span>
        </div>
      </div>
    `;
  }).join('');
}

function hideCastModal() {
  document.getElementById('cast-modal').classList.add('hidden');
}

document.getElementById('cast-modal-close').addEventListener('click', hideCastModal);
document.getElementById('cast-modal').querySelector('.modal-backdrop').addEventListener('click', hideCastModal);

// ==================== PERSON DETAILS ====================

async function loadPerson(personId) {
  showLoading('Loading person details...');
  
  try {
    // Fetch person details
    const [personResponse, creditsResponse] = await Promise.all([
      apiFetch(`${getAPIBaseURL()}/person/${personId}?api_key=${TMDB_API_KEY}`),
      apiFetch(`${getAPIBaseURL()}/person/${personId}/combined_credits?api_key=${TMDB_API_KEY}`)
    ]);
    
    const person = await personResponse.json();
    const credits = await creditsResponse.json();
    
    displayPersonDetails(person, credits);
  } catch (error) {
    console.error('Load person error:', error);
    showError('Failed to load person', error.message);
  }
}

function displayPersonDetails(person, credits) {
  hideAllStates();
  document.getElementById('person-details').classList.remove('hidden');
  
  // Set photo
  const photo = document.getElementById('person-photo');
  photo.src = person.profile_path 
    ? `${TMDB_IMAGE_BASE}/h632${person.profile_path}`
    : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450"%3E%3Crect fill="%231a1a2e" width="300" height="450"/%3E%3Ccircle cx="150" cy="160" r="70" fill="%232a2a4a"/%3E%3Cellipse cx="150" cy="380" rx="100" ry="80" fill="%232a2a4a"/%3E%3C/svg%3E';
  
  // Set name
  document.getElementById('person-name').textContent = person.name;
  
  // Set meta info
  const meta = [];
  if (person.known_for_department) {
    meta.push(`<span class="person-meta-item dept">${person.known_for_department}</span>`);
  }
  if (person.birthday) {
    const age = calculateAge(person.birthday, person.deathday);
    meta.push(`<span class="person-meta-item">${formatDate(person.birthday)}${age ? ` (${age} years old)` : ''}</span>`);
  }
  if (person.deathday) {
    meta.push(`<span class="person-meta-item">† ${formatDate(person.deathday)}</span>`);
  }
  if (person.place_of_birth) {
    meta.push(`<span class="person-meta-item">${escapeHtml(person.place_of_birth)}</span>`);
  }
  document.getElementById('person-meta').innerHTML = meta.join('');
  
  // Set biography
  const bio = person.biography || 'No biography available.';
  const bioEl = document.getElementById('person-bio');
  if (bio.length > 600) {
    bioEl.innerHTML = `
      <span class="bio-short">${escapeHtml(bio.substring(0, 600))}...</span>
      <span class="bio-full hidden">${escapeHtml(bio)}</span>
      <button class="bio-toggle" onclick="toggleBio()">Read more</button>
    `;
  } else {
    bioEl.textContent = bio;
  }
  
  // Display filmography
  displayFilmography(credits);
}

function toggleBio() {
  const bioEl = document.getElementById('person-bio');
  const shortEl = bioEl.querySelector('.bio-short');
  const fullEl = bioEl.querySelector('.bio-full');
  const toggleBtn = bioEl.querySelector('.bio-toggle');
  
  if (fullEl.classList.contains('hidden')) {
    shortEl.classList.add('hidden');
    fullEl.classList.remove('hidden');
    toggleBtn.textContent = 'Read less';
  } else {
    shortEl.classList.remove('hidden');
    fullEl.classList.add('hidden');
    toggleBtn.textContent = 'Read more';
  }
}

function displayFilmography(credits) {
  const scrollEl = document.getElementById('filmography-scroll');
  
  // Combine and sort by popularity
  const allCredits = [...(credits.cast || [])];
  allCredits.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  
  // Take top 20 unique items
  const seen = new Set();
  const uniqueCredits = allCredits.filter(item => {
    const key = `${item.media_type}-${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
  
  if (uniqueCredits.length === 0) {
    scrollEl.innerHTML = '<div class="no-content">No filmography available</div>';
    return;
  }
  
  scrollEl.innerHTML = uniqueCredits.map(item => {
    const title = escapeHtml(item.title || item.name || 'Unknown');
    const year = (item.release_date || item.first_air_date || '').split('-')[0] || '';
    const character = item.character ? escapeHtml(item.character) : '';
    const mediaType = item.media_type || 'movie';
    const poster = item.poster_path 
      ? `${TMDB_IMAGE_BASE}/w342${item.poster_path}`
      : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 342 513"%3E%3Crect fill="%231a1a2e" width="342" height="513"/%3E%3C/svg%3E';
    
    return `
      <div class="filmography-card" data-id="${item.id}" data-type="${mediaType}">
        <img class="filmography-poster" src="${poster}" alt="" loading="lazy">
        <div class="filmography-info">
          <span class="filmography-title">${title}</span>
          <span class="filmography-year">${year}</span>
          ${character ? `<span class="filmography-character">as ${character}</span>` : ''}
        </div>
        <span class="filmography-type">${mediaType === 'tv' ? 'TV' : 'Movie'}</span>
      </div>
    `;
  }).join('');
  
  // Add click handlers
  scrollEl.querySelectorAll('.filmography-card').forEach(card => {
    card.addEventListener('click', () => {
      loadMedia(card.dataset.id, card.dataset.type);
    });
  });
}

function calculateAge(birthday, deathday) {
  const birth = new Date(birthday);
  const end = deathday ? new Date(deathday) : new Date();
  let age = end.getFullYear() - birth.getFullYear();
  const monthDiff = end.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// Back to home from person details
document.getElementById('back-to-home-person').addEventListener('click', () => {
  showHomepage();
});

// ==================== TOAST NOTIFICATIONS ====================

function showToast(message, duration = 3000) {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');
  
  toastMessage.textContent = message;
  toast.classList.remove('hidden');
  
  setTimeout(() => {
    toast.classList.add('hidden');
  }, duration);
}

// Window Controls
document.getElementById('minimize-btn').addEventListener('click', () => {
  window.electronAPI.minimizeWindow();
});

document.getElementById('maximize-btn').addEventListener('click', () => {
  window.electronAPI.maximizeWindow();
});

document.getElementById('close-btn').addEventListener('click', () => {
  window.electronAPI.closeWindow();
});

// Sidebar removed - navigation now in title bar

// Search state
let currentSearchFilter = 'multi';
let isSearchOpen = false;

// Search toggle
document.getElementById('search-toggle').addEventListener('click', openSearch);
document.getElementById('search-close').addEventListener('click', closeSearch);

function openSearch() {
  isSearchOpen = true;
  document.getElementById('search-overlay').classList.remove('hidden');
  document.getElementById('search-input').focus();
  document.body.style.overflow = 'hidden';
}

function closeSearch() {
  isSearchOpen = false;
  document.getElementById('search-overlay').classList.add('hidden');
  document.getElementById('search-input').value = '';
  document.body.style.overflow = '';
  showSearchPlaceholder();
}

function showSearchPlaceholder() {
  document.getElementById('search-results').innerHTML = `
    <div class="search-placeholder">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.35-4.35"/>
      </svg>
      <h3>Search for anything</h3>
      <p>Find movies, TV shows, and people</p>
    </div>
  `;
}

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSearchFilter = btn.dataset.filter;
    
    // Re-search with new filter
    const query = document.getElementById('search-input').value.trim();
    if (query.length >= 2) {
      searchContent(query);
    }
  });
});

// Search functionality
searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  const query = e.target.value.trim();
  
  if (query.length < 2) {
    showSearchPlaceholder();
    return;
  }
  
  searchTimeout = setTimeout(() => searchContent(query), 300);
});

// Keyboard shortcut for search
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    if (isSearchOpen) {
      closeSearch();
    } else {
      openSearch();
    }
    return;
  }
  if (e.key === 'Escape' && isSearchOpen) {
    closeSearch();
    return;
  }
  if (e.key === 'Escape' && !playerContainer.classList.contains('hidden')) {
    hidePlayer();
  }
});

async function searchContent(query) {
  showSearchLoading();
  
  try {
    let endpoint;
    if (currentSearchFilter === 'multi') {
      endpoint = `${getAPIBaseURL()}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1`;
    } else {
      endpoint = `${getAPIBaseURL()}/search/${currentSearchFilter}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1`;
    }
    
    const response = await fetch(endpoint);
    
    if (!response.ok) throw new Error('Search failed');
    
    const data = await response.json();
    displaySearchResultsGrid(data.results);
  } catch (error) {
    console.error('Search error:', error);
    showSearchError();
  }
}

function displaySearchResultsGrid(results) {
  const container = document.getElementById('search-results');
  
  // Filter out incomplete items
  const filteredResults = filterIncompleteItems(results || []);
  
  if (filteredResults.length === 0) {
    container.innerHTML = `
      <div class="search-placeholder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <h3>No results found</h3>
        <p>Try a different search term or filter</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = filteredResults.map(item => {
    const mediaType = item.media_type || currentSearchFilter;
    
    if (mediaType === 'person') {
      return renderPersonSearchCard(item);
    } else {
      return renderMediaSearchCard(item, mediaType);
    }
  }).join('');
  
  // Add click handlers
  container.querySelectorAll('.search-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const type = card.dataset.type;
      
      closeSearch();
      
      if (type === 'person') {
        loadPerson(id);
      } else {
        loadMedia(id, type);
      }
    });
  });
}

function renderMediaSearchCard(item, mediaType) {
  const title = escapeHtml(item.title || item.name || 'Unknown');
  const year = (item.release_date || item.first_air_date || '').split('-')[0] || '';
  const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
  const overview = item.overview ? escapeHtml(item.overview.substring(0, 120)) + '...' : '';
  const poster = item.poster_path 
    ? `${TMDB_IMAGE_BASE}/w342${item.poster_path}`
    : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 342 513"%3E%3Crect fill="%231a1a2e" width="342" height="513"/%3E%3C/svg%3E';
  const type = mediaType === 'tv' ? 'TV Show' : 'Movie';
  
  return `
    <div class="search-card" data-id="${item.id}" data-type="${mediaType}">
      <img class="search-card-poster" src="${poster}" alt="" loading="lazy">
      <div class="search-card-content">
        <div class="search-card-header">
          <h3 class="search-card-title">${title}</h3>
          <span class="search-card-type ${mediaType}">${type}</span>
        </div>
        <div class="search-card-meta">
          ${year ? `<span>${year}</span>` : ''}
          <span class="search-card-rating">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            ${rating}
          </span>
        </div>
        ${overview ? `<p class="search-card-overview">${overview}</p>` : ''}
      </div>
    </div>
  `;
}

function renderPersonSearchCard(item) {
  const name = escapeHtml(item.name || 'Unknown');
  const dept = item.known_for_department || 'Acting';
  const knownFor = item.known_for?.slice(0, 2).map(k => escapeHtml(k.title || k.name)).join(', ') || '';
  const photo = item.profile_path 
    ? `${TMDB_IMAGE_BASE}/w185${item.profile_path}`
    : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 185 278"%3E%3Crect fill="%231a1a2e" width="185" height="278"/%3E%3Ccircle cx="92" cy="100" r="40" fill="%232a2a4a"/%3E%3Cellipse cx="92" cy="220" rx="60" ry="50" fill="%232a2a4a"/%3E%3C/svg%3E';
  
  return `
    <div class="search-card person-search-card" data-id="${item.id}" data-type="person">
      <img class="search-card-photo" src="${photo}" alt="" loading="lazy">
      <div class="search-card-content">
        <div class="search-card-header">
          <h3 class="search-card-title">${name}</h3>
          <span class="search-card-type person">${dept}</span>
        </div>
        ${knownFor ? `<p class="search-card-known-for">Known for: ${knownFor}</p>` : ''}
      </div>
    </div>
  `;
}

// Legacy function for backward compatibility
function displaySearchResults(movies) {
  if (!movies || movies.length === 0) {
    searchResults.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p>No movies found</p>
        <span>Try a different search term</span>
      </div>
    `;
    return;
  }
  
  searchResults.innerHTML = movies.slice(0, 20).map(movie => {
    const title = escapeHtml(movie.title || 'Unknown Title');
    const year = movie.release_date ? movie.release_date.split('-')[0] : 'Unknown';
    const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';
    const poster = movie.poster_path 
      ? `${TMDB_IMAGE_BASE}/w92${movie.poster_path}`
      : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 92 138"%3E%3Crect fill="%231a1a2e" width="92" height="138"/%3E%3C/svg%3E';
    
    return `
      <div class="search-result-item" data-id="${movie.id}">
        <img class="result-poster" src="${poster}" alt="">
        <div class="result-info">
          <h3>${title}</h3>
          <span>${year}</span>
        </div>
        <div class="result-rating">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <span>${rating}</span>
        </div>
      </div>
    `;
  }).join('');
  
  // Add click handlers
  document.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => loadMovie(item.dataset.id));
  });
}

async function loadMovie(movieId) {
  // Wrapper for backward compatibility - loads as movie by default
  await loadMedia(movieId, 'movie');
}

// displayMovieDetails is now handled by displayMediaDetails

function showPlayer(streamUrl) {
  hideAllStates();
  playerContainer.classList.remove('hidden');
  
  // Clear existing text tracks and subtitle data to prevent duplicates
  while (videoPlayer.firstChild) {
    videoPlayer.removeChild(videoPlayer.firstChild);
  }
  // Reset currentSubtitles to prevent stale data (will be repopulated if subtitles are found)
  currentSubtitles = [];
  
  // Check if we should resume from a saved position
  const resumeTime = window._resumeTime;
  if (resumeTime) {
    delete window._resumeTime; // Clear after using
  }
  
  // Use HLS.js for m3u8 streams
  if (streamUrl.includes('.m3u8')) {
    if (Hls.isSupported()) {
      // Destroy previous instance if exists
      if (hlsInstance) {
        hlsInstance.destroy();
      }
      
      hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        // Enable subtitle parsing
        enableCEA708Captions: true,
        enableWebVTT: true,
        renderTextTracksNatively: true
      });
      
      hlsInstance.loadSource(streamUrl);
      hlsInstance.attachMedia(videoPlayer);
      
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, async (event, data) => {
        videoPlayer.play().catch(console.error);
        
        // Resume from saved position if available
        if (resumeTime && resumeTime > 0) {
          const setResumeTime = () => {
            if (videoPlayer.duration > 0 && videoPlayer.duration > resumeTime) {
              videoPlayer.currentTime = resumeTime;
            }
          };
          
          // Try immediately and also on loadedmetadata
          videoPlayer.addEventListener('loadedmetadata', setResumeTime, { once: true });
          // Also try after a short delay
          setTimeout(setResumeTime, 500);
        }
        
        // Check for subtitle tracks in the manifest
        // Prioritize HLS embedded subtitles - if they exist, don't add external subtitles
        if (hlsInstance.subtitleTracks && hlsInstance.subtitleTracks.length > 0) {
          // HLS subtitles found - use only these, clear external subtitles
          currentSubtitles = [];
          updateSubtitleSelector(hlsInstance.subtitleTracks, 'hls');
        } else if (currentSubtitles.length > 0) {
          // No HLS subtitles - use subtitles from stream API
          await addExternalSubtitles();
          updateSubtitleSelector(currentSubtitles, 'external');
        } else if (currentMovie) {
          // No embedded subtitles - try fetching from external sources
          showToast('Searching for subtitles...');
          
          const externalSubs = await fetchExternalSubtitles(
            currentMovie.id, 
            currentMediaType,
            currentMediaType === 'tv' ? currentSeason : null,
            currentMediaType === 'tv' ? currentEpisode : null
          );
          
          if (externalSubs.length > 0) {
            currentSubtitles = externalSubs;
            await addExternalSubtitles();
            updateSubtitleSelector(currentSubtitles, 'external');
            showToast(`Found ${externalSubs.length} subtitle track(s)`);
          } else {
            updateSubtitleSelector([], 'none');
            showToast('No subtitles found');
          }
        } else {
          updateSubtitleSelector([], 'none');
        }
      });
      
      // Handle subtitle track switching for HLS
      hlsInstance.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (event, data) => {
        if (data.subtitleTracks && data.subtitleTracks.length > 0) {
          updateSubtitleSelector(data.subtitleTracks, 'hls');
        }
      });
      
      hlsInstance.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS Error:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hlsInstance.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hlsInstance.recoverMediaError();
              break;
            default:
              console.error('Fatal error, cannot recover');
              hidePlayer();
              showError('Playback Error', 'Unable to play this stream. Please try another quality.');
              break;
          }
        }
      });
    } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      videoPlayer.src = streamUrl;
      videoPlayer.play().catch(console.error);
      
      // Resume from saved position if available
      if (resumeTime && resumeTime > 0) {
        const setResumeTime = () => {
          if (videoPlayer.duration > 0 && videoPlayer.duration > resumeTime) {
            videoPlayer.currentTime = resumeTime;
          }
        };
        videoPlayer.addEventListener('loadedmetadata', setResumeTime, { once: true });
        setTimeout(setResumeTime, 500);
      }
    } else {
      showError('Playback Error', 'Your browser does not support HLS playback.');
    }
  } else {
    // Regular video file
    videoPlayer.src = streamUrl;
    videoPlayer.play().catch(console.error);
    
    // Resume from saved position if available
    if (resumeTime && resumeTime > 0) {
      const setResumeTime = () => {
        if (videoPlayer.duration > 0 && videoPlayer.duration > resumeTime) {
          videoPlayer.currentTime = resumeTime;
        }
      };
      videoPlayer.addEventListener('loadedmetadata', setResumeTime, { once: true });
      setTimeout(setResumeTime, 500);
    }
  }
}

// ==================== SUBTITLE/CAPTION FUNCTIONS ====================

// Fetch subtitles via main process (bypasses CORS)
async function fetchExternalSubtitles(tmdbId, mediaType, season = null, episode = null) {
  try {
    // First get the IMDB ID from TMDB
    let imdbId = null;
    try {
      const externalIdsResponse = await fetch(
        `${getAPIBaseURL()}/${mediaType}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`
      );
      const externalIds = await externalIdsResponse.json();
      imdbId = externalIds.imdb_id;
      } catch (e) {
      // Could not get IMDB ID
    }
    
    // Use IPC to fetch subtitles from main process (bypasses CORS)
    // In browser mode, subtitles won't work (requires Electron)
    let subtitles = [];
    if (window.electronAPI && window.electronAPI.fetchSubtitles) {
      subtitles = await window.electronAPI.fetchSubtitles({
        type: mediaType,
        tmdbId: tmdbId,
        imdbId: imdbId,
        apiKey: OPENSUBTITLES_API_KEY,
        season: season,
        episode: episode
      });
    }
    
    return subtitles || [];
  } catch (error) {
    console.error('Subtitle fetch error:', error);
    return [];
  }
}

function updateSubtitleSelector(tracks, sourceType) {
  const selector = document.getElementById('subtitle-selector');
  
  if (!selector) return;
  
  let options = '<option value="-1">Off</option>';
  
  if (tracks && tracks.length > 0) {
    tracks.forEach((track, idx) => {
      const label = track.name || track.label || track.language || track.lang || `Track ${idx + 1}`;
      const langCode = track.lang || track.language || '';
      options += `<option value="${idx}" data-source="${sourceType}">${label}${langCode ? ` (${langCode})` : ''}</option>`;
    });
  }
  
  selector.innerHTML = options;
}

// Convert SRT format to WebVTT format
function srtToVtt(srtContent) {
  // Add WebVTT header
  let vtt = 'WEBVTT\n\n';
  
  // Replace SRT timestamp format (00:00:00,000) with VTT format (00:00:00.000)
  const converted = srtContent
    .replace(/\r\n/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  
  vtt += converted;
  return vtt;
}

// Fetch and convert subtitle to VTT blob
async function fetchAndConvertSubtitle(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error('Failed to fetch subtitle:', response.status);
      return null;
    }
    
    let content = await response.text();
    
    // Check if it's already VTT
    if (!content.trim().startsWith('WEBVTT')) {
      // Convert SRT to VTT
      content = srtToVtt(content);
    }
    
    // Create blob URL
    const blob = new Blob([content], { type: 'text/vtt' });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Error converting subtitle:', error);
    return null;
  }
}

async function addExternalSubtitles() {
  if (!currentSubtitles || currentSubtitles.length === 0) return;
  
  // Check if HLS subtitles exist - if so, don't add external ones (prevent duplicates)
  if (hlsInstance && hlsInstance.subtitleTracks && hlsInstance.subtitleTracks.length > 0) {
    console.log('HLS subtitles detected, skipping external subtitles to prevent duplicates');
    return;
  }
  
  // Check if tracks already exist to prevent duplicates
  const existingTrackCount = Array.from(videoPlayer.children).filter(
    child => child.tagName === 'TRACK'
  ).length;
  
  if (existingTrackCount > 0) {
    console.log('Subtitles already loaded, skipping duplicate load');
    return;
  }
  
  for (let idx = 0; idx < currentSubtitles.length; idx++) {
    const sub = currentSubtitles[idx];
    const subUrl = sub.url || sub.file;
    
    // Fetch and convert to VTT
    const vttUrl = await fetchAndConvertSubtitle(subUrl);
    if (!vttUrl) {
      console.error('Failed to convert subtitle:', sub.label);
      continue;
    }
    
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = sub.label || sub.name || sub.language || `Subtitle ${idx + 1}`;
    track.srclang = sub.lang || sub.language || 'en';
    track.src = vttUrl;
    
    // Don't set default - subtitles should be disabled by default
    track.default = false;
    
    videoPlayer.appendChild(track);
  }
  
  // Keep all subtitle tracks disabled by default
  // User must manually enable them via the selector
  for (let i = 0; i < videoPlayer.textTracks.length; i++) {
    videoPlayer.textTracks[i].mode = 'hidden';
  }
}

function setSubtitleTrack(index, sourceType) {
  if (sourceType === 'hls' && hlsInstance) {
    // For HLS.js embedded subtitles
    hlsInstance.subtitleTrack = index;
    
    // Also update native tracks
    for (let i = 0; i < videoPlayer.textTracks.length; i++) {
      videoPlayer.textTracks[i].mode = i === index ? 'showing' : 'hidden';
    }
  } else {
    // For external/native subtitles
    for (let i = 0; i < videoPlayer.textTracks.length; i++) {
      videoPlayer.textTracks[i].mode = i === index ? 'showing' : 'hidden';
    }
  }
}

// ==================== SUBTITLE CUSTOMIZATION ====================

const defaultSubtitleSettings = {
  fontSize: 24,
  fontColor: '#ffffff',
  bgColor: '#000000',
  bgOpacity: 75,
  fontFamily: 'Outfit, sans-serif',
  textShadow: 'outline'
};

let subtitleSettings = { ...defaultSubtitleSettings };

// Load saved subtitle settings
function loadSubtitleSettings() {
  const saved = localStorage.getItem('subtitleSettings');
  if (saved) {
    subtitleSettings = { ...defaultSubtitleSettings, ...JSON.parse(saved) };
  }
  applySubtitleSettings();
  updateSettingsUI();
}

// Save subtitle settings
function saveSubtitleSettings() {
  localStorage.setItem('subtitleSettings', JSON.stringify(subtitleSettings));
}

// Apply subtitle settings to video
function applySubtitleSettings() {
  const { fontSize, fontColor, bgColor, bgOpacity, fontFamily, textShadow } = subtitleSettings;
  
  // Convert hex to rgba for background
  const r = parseInt(bgColor.slice(1, 3), 16);
  const g = parseInt(bgColor.slice(3, 5), 16);
  const b = parseInt(bgColor.slice(5, 7), 16);
  const bgRgba = `rgba(${r}, ${g}, ${b}, ${bgOpacity / 100})`;
  
  // Text shadow options
  const shadows = {
    none: 'none',
    outline: '1px 1px 2px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.8), 1px -1px 2px rgba(0,0,0,0.8), -1px 1px 2px rgba(0,0,0,0.8)',
    drop: '2px 2px 4px rgba(0,0,0,0.9)',
    raised: '1px 1px 0 rgba(0,0,0,0.5), 2px 2px 0 rgba(0,0,0,0.3)'
  };
  
  // Apply CSS variables
  document.documentElement.style.setProperty('--sub-size', `${fontSize}px`);
  document.documentElement.style.setProperty('--sub-color', fontColor);
  document.documentElement.style.setProperty('--sub-bg', bgRgba);
  document.documentElement.style.setProperty('--sub-font', fontFamily);
  document.documentElement.style.setProperty('--sub-shadow', shadows[textShadow] || shadows.outline);
}

// Update settings UI to match current settings
function updateSettingsUI() {
  const elements = {
    fontSize: document.getElementById('sub-font-size'),
    fontSizeValue: document.getElementById('sub-font-size-value'),
    fontColor: document.getElementById('sub-font-color'),
    bgColor: document.getElementById('sub-bg-color'),
    bgOpacity: document.getElementById('sub-bg-opacity'),
    bgOpacityValue: document.getElementById('sub-bg-opacity-value'),
    fontFamily: document.getElementById('sub-font-family'),
    textShadow: document.getElementById('sub-text-shadow')
  };
  
  if (elements.fontSize) elements.fontSize.value = subtitleSettings.fontSize;
  if (elements.fontSizeValue) elements.fontSizeValue.textContent = `${subtitleSettings.fontSize}px`;
  if (elements.fontColor) elements.fontColor.value = subtitleSettings.fontColor;
  if (elements.bgColor) elements.bgColor.value = subtitleSettings.bgColor;
  if (elements.bgOpacity) elements.bgOpacity.value = subtitleSettings.bgOpacity;
  if (elements.bgOpacityValue) elements.bgOpacityValue.textContent = `${subtitleSettings.bgOpacity}%`;
  if (elements.fontFamily) elements.fontFamily.value = subtitleSettings.fontFamily;
  if (elements.textShadow) elements.textShadow.value = subtitleSettings.textShadow;
}

// Player menu toggle
document.getElementById('player-menu-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const menu = document.getElementById('player-menu');
  if (menu) {
    menu.classList.toggle('hidden');
  }
});

// Close player menu when clicking outside
document.addEventListener('click', (e) => {
  const menu = document.getElementById('player-menu');
  const menuBtn = document.getElementById('player-menu-btn');
  if (menu && !menu.contains(e.target) && !menuBtn?.contains(e.target)) {
    menu.classList.add('hidden');
  }
});

// Subtitle settings panel toggle (inside menu)
document.getElementById('subtitle-settings-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('subtitle-settings-panel')?.classList.toggle('hidden');
});

document.getElementById('settings-close')?.addEventListener('click', () => {
  document.getElementById('subtitle-settings-panel')?.classList.add('hidden');
});

// Font size
document.getElementById('sub-font-size')?.addEventListener('input', (e) => {
  subtitleSettings.fontSize = parseInt(e.target.value);
  document.getElementById('sub-font-size-value').textContent = `${e.target.value}px`;
  applySubtitleSettings();
  saveSubtitleSettings();
});

// Font color
document.getElementById('sub-font-color')?.addEventListener('input', (e) => {
  subtitleSettings.fontColor = e.target.value;
  applySubtitleSettings();
  saveSubtitleSettings();
});

// Background color
document.getElementById('sub-bg-color')?.addEventListener('input', (e) => {
  subtitleSettings.bgColor = e.target.value;
  applySubtitleSettings();
  saveSubtitleSettings();
});

// Background opacity
document.getElementById('sub-bg-opacity')?.addEventListener('input', (e) => {
  subtitleSettings.bgOpacity = parseInt(e.target.value);
  document.getElementById('sub-bg-opacity-value').textContent = `${e.target.value}%`;
  applySubtitleSettings();
  saveSubtitleSettings();
});

// Font family
document.getElementById('sub-font-family')?.addEventListener('change', (e) => {
  subtitleSettings.fontFamily = e.target.value;
  applySubtitleSettings();
  saveSubtitleSettings();
});

// Text shadow
document.getElementById('sub-text-shadow')?.addEventListener('change', (e) => {
  subtitleSettings.textShadow = e.target.value;
  applySubtitleSettings();
  saveSubtitleSettings();
});

// Reset settings
document.getElementById('reset-sub-settings')?.addEventListener('click', () => {
  subtitleSettings = { ...defaultSubtitleSettings };
  applySubtitleSettings();
  updateSettingsUI();
  saveSubtitleSettings();
  showToast('Subtitle settings reset');
});

// Load settings on startup
loadSubtitleSettings();

// Subtitle selector event listener
document.getElementById('subtitle-selector')?.addEventListener('change', (e) => {
  const index = parseInt(e.target.value);
  const sourceType = e.target.options[e.target.selectedIndex]?.dataset?.source || 'external';
  
  if (index === -1) {
    // Turn off all subtitles
    if (hlsInstance) {
      hlsInstance.subtitleTrack = -1;
    }
    for (let i = 0; i < videoPlayer.textTracks.length; i++) {
      videoPlayer.textTracks[i].mode = 'hidden';
    }
    showToast('Subtitles off');
  } else {
    setSubtitleTrack(index, sourceType);
    showToast('Subtitles enabled');
  }
});

// Manual fetch subtitles button
document.getElementById('fetch-subs-btn')?.addEventListener('click', async () => {
  if (!currentMovie) {
    showToast('No movie loaded');
    return;
  }
  
  const btn = document.getElementById('fetch-subs-btn');
  btn.classList.add('loading');
  showToast('Searching for subtitles...');
  
  try {
    const externalSubs = await fetchExternalSubtitles(
      currentMovie.id, 
      currentMediaType,
      currentMediaType === 'tv' ? currentSeason : null,
      currentMediaType === 'tv' ? currentEpisode : null
    );
    
    if (externalSubs.length > 0) {
      currentSubtitles = externalSubs;
      
      // Clear existing tracks and add new ones
      while (videoPlayer.firstChild) {
        videoPlayer.removeChild(videoPlayer.firstChild);
      }
      await addExternalSubtitles();
      updateSubtitleSelector(currentSubtitles, 'external');
      showToast(`Found ${externalSubs.length} subtitle track(s)`);
    } else {
      showToast('No subtitles found for this title');
    }
  } catch (error) {
    console.error('Manual subtitle fetch error:', error);
    showToast('Failed to fetch subtitles');
  } finally {
    btn.classList.remove('loading');
  }
});

function hidePlayer() {
  // Save watch progress before hiding
  saveWatchProgress();
  
  // Hide next episode button
  const nextEpisodeBtn = document.getElementById('next-episode-btn');
  if (nextEpisodeBtn) {
    nextEpisodeBtn.classList.add('hidden');
  }
  
  // Cleanup HLS instance
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
  
  videoPlayer.pause();
  videoPlayer.src = '';
  
  // Clear subtitle tracks
  currentSubtitles = [];
  
  // Set Discord Rich Presence back to browsing
  setDiscordBrowsing();
  
  playerContainer.classList.add('hidden');
  
  
  if (currentMovie) {
    movieDetails.classList.remove('hidden');
  } else {
    showHomepage();
  }
}

// Back button (player)
document.getElementById('back-button').addEventListener('click', hidePlayer);

// Back to home button (details page)
document.getElementById('back-to-home').addEventListener('click', () => {
  currentMovie = null;
  showHomepage();
});

// Back to home button (category results page)
document.getElementById('back-to-category-home')?.addEventListener('click', () => {
  showHomepage();
});

// Back to home button (provider details page)
document.getElementById('back-to-provider-home')?.addEventListener('click', () => {
  showHomepage();
});

// Provider tab switching
document.getElementById('provider-tab-movies')?.addEventListener('click', () => {
  switchProviderTab('movies');
});

document.getElementById('provider-tab-tv')?.addEventListener('click', () => {
  switchProviderTab('tv');
});

// Show category results page
function showCategoryResultsPage(results, categoryName, mediaType) {
  hideAllStates();
  
  const categoryPage = document.getElementById('category-results-page');
  const categoryTitle = document.getElementById('category-results-title');
  const categoryGrid = document.getElementById('category-results-grid');
  
  if (!categoryPage || !categoryTitle || !categoryGrid) return;
  
  // Set title
  categoryTitle.textContent = categoryName;
  
  // Filter out incomplete items
  const filteredResults = filterIncompleteItems(results || []);
  
  // Display results
  if (filteredResults.length === 0) {
    categoryGrid.innerHTML = `
      <div class="search-placeholder" style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width: 64px; height: 64px; margin: 0 auto 20px; opacity: 0.5;">
          <path d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <h3 style="font-size: 20px; margin-bottom: 8px;">No results found</h3>
        <p style="color: var(--text-secondary);">Try a different category</p>
      </div>
    `;
  } else {
    categoryGrid.innerHTML = filteredResults.map(item => {
      return renderMediaSearchCard(item, mediaType);
    }).join('');
    
    // Add click handlers
    categoryGrid.querySelectorAll('.search-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        const type = card.dataset.type;
        loadMedia(id, type);
      });
    });
  }
  
  categoryPage.classList.remove('hidden');
}

// Retry button
document.getElementById('retry-button').addEventListener('click', () => {
  if (currentMovie) {
    loadMovie(currentMovie.id);
  } else {
    hideAllStates();
    welcomeState.classList.remove('hidden');
  }
});

// UI State helpers
function hideAllStates() {
  homepage.classList.add('hidden');
  movieDetails.classList.add('hidden');
  document.getElementById('person-details').classList.add('hidden');
  document.getElementById('category-results-page').classList.add('hidden');
  document.getElementById('provider-details-page').classList.add('hidden');
  playerContainer.classList.add('hidden');
  loadingState.classList.add('hidden');
  errorState.classList.add('hidden');
}

function showHomepage() {
  hideAllStates();
  homepage.classList.remove('hidden');
  const listsContainer = document.querySelector('.lists-container');
  if (listsContainer) listsContainer.classList.add('hidden');
  // Refresh continue watching section to show latest progress
  loadContinueWatching();
}

function showLoading(text = 'Loading...') {
  hideAllStates();
  document.getElementById('loading-text').textContent = text;
  loadingState.classList.remove('hidden');
}

function showError(title, message) {
  hideAllStates();
  document.getElementById('error-message').textContent = message || title;
  errorState.classList.remove('hidden');
}

function showEmptyState() {
  searchResults.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
      </svg>
      <p>Search for a movie to get started</p>
      <span>Try "Shawshank Redemption" or "Inception"</span>
    </div>
  `;
}

function showSearchLoading() {
  const container = document.getElementById('search-results');
  container.innerHTML = `
    <div class="search-loading">
      <div class="loader-small"></div>
      <span>Searching...</span>
    </div>
  `;
}

function showSearchError() {
  const container = document.getElementById('search-results');
  container.innerHTML = `
    <div class="search-placeholder error">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <h3>Search failed</h3>
      <p>Please check your connection and try again</p>
    </div>
  `;
}

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getQualityLabel(resolution, bandwidth) {
  if (!resolution) {
    if (bandwidth) {
      const mbps = (parseInt(bandwidth) / 1000000).toFixed(1);
      return `${mbps} Mbps`;
    }
    return 'Unknown';
  }
  
  // Parse resolution like "1920x1072" or "1280x714"
  const parts = resolution.split('x');
  if (parts.length === 2) {
    const height = parseInt(parts[1]);
    if (height >= 2160) return '4K';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    if (height >= 360) return '360p';
    return `${height}p`;
  }
  
  return resolution;
}

// ==================== WATCH PROGRESS ====================

function saveWatchProgress() {
  if (!currentMovie || !videoPlayer) return;
  
  const currentTime = videoPlayer.currentTime;
  const duration = videoPlayer.duration;
  
  // Only save if video has been watched for at least 30 seconds and is less than 95% complete
  if (currentTime < 30 || (duration > 0 && currentTime / duration > 0.95)) {
    // If near the end, remove from continue watching
    removeWatchProgress(currentMovie.id, currentMediaType);
    return;
  }
  
  const watchProgress = {
    id: currentMovie.id,
    mediaType: currentMediaType,
    title: currentMovie.title || currentMovie.name,
    poster: currentMovie.poster_path,
    currentTime: currentTime,
    duration: duration,
    season: currentMediaType === 'tv' ? currentSeason : null,
    episode: currentMediaType === 'tv' ? currentEpisode : null,
    timestamp: Date.now() // Last watched timestamp for sorting
  };
  
  const key = `watch_progress_${currentMediaType}_${currentMovie.id}`;
  localStorage.setItem(key, JSON.stringify(watchProgress));
  
  // Also maintain a list of keys for quick lookup
  const progressList = JSON.parse(localStorage.getItem('watch_progress_list') || '[]');
  const listKey = `${currentMediaType}_${currentMovie.id}`;
  if (!progressList.includes(listKey)) {
    progressList.push(listKey);
    localStorage.setItem('watch_progress_list', JSON.stringify(progressList));
  }
}

function removeWatchProgress(id, mediaType) {
  const key = `watch_progress_${mediaType}_${id}`;
  localStorage.removeItem(key);
  
  const progressList = JSON.parse(localStorage.getItem('watch_progress_list') || '[]');
  const listKey = `${mediaType}_${id}`;
  const index = progressList.indexOf(listKey);
  if (index > -1) {
    progressList.splice(index, 1);
    localStorage.setItem('watch_progress_list', JSON.stringify(progressList));
  }
}

function getWatchProgress(id, mediaType) {
  const key = `watch_progress_${mediaType}_${id}`;
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : null;
}

function getAllWatchProgress() {
  const progressList = JSON.parse(localStorage.getItem('watch_progress_list') || '[]');
  const progress = [];
  
  for (const listKey of progressList) {
    const [mediaType, id] = listKey.split('_');
    const key = `watch_progress_${mediaType}_${id}`;
    const data = localStorage.getItem(key);
    if (data) {
      try {
        progress.push(JSON.parse(data));
      } catch (e) {
        console.error('Error parsing watch progress:', e);
      }
    }
  }
  
  // Sort by most recently watched
  return progress.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

// ==================== HOMEPAGE ====================

// Load latest movies and TV shows in a large carousel
async function loadLatest() {
  const track = document.getElementById('upcoming-carousel-track');
  const section = document.getElementById('upcoming-section');
  if (!track || !section) return;
  
  try {
    // Fetch latest movies (now playing) and TV shows (on the air)
    // These endpoints return multiple items of the latest content
    const [moviesRes, tvRes] = await Promise.all([
      apiFetch(`${getAPIBaseURL()}/movie/now_playing?api_key=${TMDB_API_KEY}&page=1`),
      apiFetch(`${getAPIBaseURL()}/tv/on_the_air?api_key=${TMDB_API_KEY}&page=1`)
    ]);
    
    const moviesData = await moviesRes.json();
    const tvData = await tvRes.json();
    
    // Combine and filter
    const latestMovies = (moviesData.results || []).map(m => ({ ...m, media_type: 'movie' }));
    const latestTV = (tvData.results || []).map(t => ({ ...t, media_type: 'tv' }));
    const allLatest = [...latestMovies, ...latestTV];
    
    // Filter out incomplete items
    const filteredLatest = filterIncompleteItems(allLatest);
    
    // Shuffle and take top 20
    const shuffled = filteredLatest.sort(() => Math.random() - 0.5).slice(0, 20);
    
    if (shuffled.length === 0) {
      section.style.display = 'none';
      return;
    }
    
    // Render latest carousel cards
    renderUpcomingCarousel(track, shuffled);
    
    // Setup carousel navigation
    setupUpcomingCarousel();
  } catch (error) {
    console.error('Failed to load latest:', error);
    section.style.display = 'none';
  }
}

// Render upcoming carousel cards (larger format)
function renderUpcomingCarousel(container, items) {
  container.innerHTML = items.map(item => {
    const title = escapeHtml(item.title || item.name || 'Unknown');
    const year = (item.release_date || item.first_air_date || '').split('-')[0] || '';
    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
    const poster = item.poster_path 
      ? `${TMDB_IMAGE_BASE}/w500${item.poster_path}`
      : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 750"%3E%3Crect fill="%231a1a2e" width="500" height="750"/%3E%3C/svg%3E';
    const backdrop = item.backdrop_path 
      ? `${TMDB_IMAGE_BASE}/w1280${item.backdrop_path}`
      : poster;
    const overview = item.overview ? escapeHtml(item.overview.substring(0, 150)) + '...' : 'No description available.';
    const mediaType = item.media_type || 'movie';
    
    return `
      <div class="upcoming-card" data-id="${item.id}" data-type="${mediaType}">
        <div class="upcoming-card-backdrop" style="background-image: url('${backdrop}');"></div>
        <div class="upcoming-card-content">
          <div class="upcoming-card-poster">
            <img src="${poster}" alt="${title}" loading="lazy">
          </div>
          <div class="upcoming-card-info">
            <div class="upcoming-card-header">
              <span class="upcoming-card-type">${mediaType === 'tv' ? 'TV Show' : 'Movie'}</span>
              <div class="upcoming-card-rating">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                <span>${rating}</span>
              </div>
            </div>
            <h3 class="upcoming-card-title">${title}</h3>
            <div class="upcoming-card-meta">
              <span>${year}</span>
            </div>
            <p class="upcoming-card-overview">${overview}</p>
            <button class="upcoming-card-play-btn">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              <span>Watch Now</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Add click handlers
  container.querySelectorAll('.upcoming-card').forEach(card => {
    const id = card.dataset.id;
    const type = card.dataset.type;
    
    // Click on card to view details
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.upcoming-card-play-btn')) {
        loadMedia(id, type);
      }
    });
    
    // Click on play button
    const playBtn = card.querySelector('.upcoming-card-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        loadMedia(id, type);
      });
    }
  });
}

// Setup upcoming carousel navigation
function setupUpcomingCarousel() {
  const track = document.getElementById('upcoming-carousel-track');
  const prevBtn = document.getElementById('upcoming-carousel-prev');
  const nextBtn = document.getElementById('upcoming-carousel-next');
  
  if (!track || !prevBtn || !nextBtn) return;
  
  const scrollAmount = 900; // Scroll amount for larger cards
  
  const updateButtons = () => {
    const isAtStart = track.scrollLeft <= 0;
    const isAtEnd = track.scrollLeft >= track.scrollWidth - track.clientWidth - 10;
    
    prevBtn.disabled = isAtStart;
    nextBtn.disabled = isAtEnd;
  };
  
  prevBtn.addEventListener('click', () => {
    track.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
  });
  
  nextBtn.addEventListener('click', () => {
    track.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  });
  
  track.addEventListener('scroll', updateButtons);
  
  // Initial button state
  setTimeout(updateButtons, 100);
}

async function loadContinueWatching() {
  const container = document.getElementById('continue-watching');
  const section = document.getElementById('continue-watching-section');
  if (!container || !section) return;
  
  const progressItems = getAllWatchProgress();
  
  if (progressItems.length === 0) {
    section.style.display = 'none';
    return;
  }
  
  section.style.display = 'block';
  container.innerHTML = '<div class="cards-loading"><div class="loader-small"></div></div>';
  
  try {
    // Fetch full details for each item from TMDB
    const itemsWithDetails = await Promise.all(
      progressItems.slice(0, 10).map(async (progress) => {
        try {
          const response = await fetch(
            `${getAPIBaseURL()}/${progress.mediaType}/${progress.id}?api_key=${TMDB_API_KEY}`
          );
          const details = await response.json();
          return {
            ...details,
            watchProgress: progress
          };
        } catch (error) {
          console.error(`Failed to fetch ${progress.mediaType} ${progress.id}:`, error);
          return null;
        }
      })
    );
    
    const validItems = itemsWithDetails.filter(item => item !== null);
    
    if (validItems.length === 0) {
      section.style.display = 'none';
      return;
    }
    
    renderContinueWatchingCards(container, validItems);
    
    // Setup carousel navigation for continue watching
    setupCarouselNavigation('continue-watching');
  } catch (error) {
    console.error('Failed to load continue watching:', error);
    section.style.display = 'none';
  }
}

function renderContinueWatchingCards(container, items) {
  container.innerHTML = items.map(item => {
    const progress = item.watchProgress;
    const title = escapeHtml(item.title || item.name || 'Unknown');
    const year = (item.release_date || item.first_air_date || '').split('-')[0] || '';
    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
    const poster = item.poster_path 
      ? `${TMDB_IMAGE_BASE}/w342${item.poster_path}`
      : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 342 513"%3E%3Crect fill="%231a1a2e" width="342" height="513"/%3E%3C/svg%3E';
    
    // Calculate progress percentage
    const progressPercent = progress.duration > 0 
      ? Math.min((progress.currentTime / progress.duration) * 100, 100)
      : 0;
    
    // Format time remaining
    const remainingTime = progress.duration - progress.currentTime;
    const hours = Math.floor(remainingTime / 3600);
    const minutes = Math.floor((remainingTime % 3600) / 60);
    const timeText = hours > 0 
      ? `${hours}h ${minutes}m left`
      : `${minutes}m left`;
    
    // Episode info for TV shows
    const episodeInfo = progress.mediaType === 'tv' && progress.season && progress.episode
      ? `S${progress.season}:E${progress.episode}`
      : '';
    
    return `
      <div class="media-card continue-watching-card" data-id="${item.id}" data-type="${progress.mediaType}" data-resume-time="${progress.currentTime}">
        <div class="card-poster-wrapper">
          <img class="card-poster" src="${poster}" alt="" loading="lazy">
          <div class="card-overlay">
            <button class="card-play-btn">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </button>
          </div>
          <div class="card-rating">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            <span>${rating}</span>
          </div>
          <div class="continue-progress-bar">
            <div class="continue-progress-fill" style="width: ${progressPercent}%"></div>
          </div>
        </div>
        <div class="card-info">
          <h4 class="card-title">${title}</h4>
          <span class="card-year">${episodeInfo ? `${episodeInfo} • ` : ''}${timeText}</span>
        </div>
      </div>
    `;
  }).join('');
  
  // Add click handlers - resume from saved position
  container.querySelectorAll('.continue-watching-card').forEach(card => {
    card.addEventListener('click', async () => {
      const id = card.dataset.id;
      const type = card.dataset.type;
      const resumeTime = parseFloat(card.dataset.resumeTime);
      
      // Find the progress data for this item
      const progressItem = items.find(item => 
        item.id === parseInt(id) && item.watchProgress.mediaType === type
      );
      
      if (!progressItem) return;
      
      const progress = progressItem.watchProgress;
      
      // Store resume time in a global variable for use after stream loads
      window._resumeTime = resumeTime;
      
      if (type === 'tv' && progress.season && progress.episode) {
        // For TV shows, fetch media details directly and load the specific episode
        currentSeason = progress.season;
        currentEpisode = progress.episode;
        currentMediaType = 'tv';
        
        showLoading('Loading TV show details...');
        
        try {
          // Fetch TMDB details directly (without using loadMedia which resets season/episode)
          const mediaResponse = await apiFetch(`${getAPIBaseURL()}/tv/${id}?api_key=${TMDB_API_KEY}`);
          if (!mediaResponse.ok) throw new Error('Failed to load TV show details');
          
          const media = await mediaResponse.json();
          currentMovie = media;
          
          // Display media details first (without stream data, we'll load it next)
          displayMediaDetails(media, null, 'tv');
          
          // Now load the specific episode (this will load streams and update UI)
          await loadSelectedEpisode(progress.season, progress.episode);
          
          // Auto-click play button to start playback with resume
          setTimeout(() => {
            const playButton = document.getElementById('play-button');
            if (playButton && !playButton.disabled) {
              playButton.click();
            }
          }, 300);
        } catch (error) {
          console.error('Failed to load TV show:', error);
          showError('Failed to load', error.message);
        }
      } else {
        // For movies, load media and auto-play
        await loadMedia(id, type);
        
        // Auto-click play button to start playback with resume
        setTimeout(() => {
          const playButton = document.getElementById('play-button');
          if (playButton && !playButton.disabled) {
            playButton.click();
          }
        }, 300);
      }
    });
  });
}

async function loadHomepage() {
  // Load latest first, then continue watching, then other categories
  await loadLatest();
  await loadContinueWatching();
  
  // Load all categories in parallel
  await Promise.all([
    loadCategory('movies-top-rated', 'movie', 'top_rated'),
    loadCategory('movies-popular', 'movie', 'popular'),
    loadCategory('movies-new', 'movie', 'now_playing'),
    loadCategory('tv-top-rated', 'tv', 'top_rated'),
    loadCategory('tv-popular', 'tv', 'popular'),
    loadCategory('tv-new', 'tv', 'on_the_air'),
    loadGenres(), // Load genre sections
    loadProviders() // Load provider sections
  ]);
}

async function loadCategory(containerId, mediaType, category) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  try {
    const response = await fetch(
      `${getAPIBaseURL()}/${mediaType}/${category}?api_key=${TMDB_API_KEY}&page=1`
    );
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      const filteredResults = filterIncompleteItems(data.results);
      renderCards(container, filteredResults.slice(0, 10), mediaType);
      
      // Setup carousel navigation for all categories
      setupCarouselNavigation(containerId);
    } else {
      container.innerHTML = '<p class="no-content">No content available</p>';
    }
  } catch (error) {
    console.error(`Failed to load ${category}:`, error);
    container.innerHTML = '<p class="no-content">Failed to load</p>';
  }
}

// ==================== GENRES ====================

// Load genres and display genre carousels
async function loadGenres() {
  const genresContainer = document.getElementById('genres-container');
  if (!genresContainer) return;
  
  try {
    // Fetch movie and TV genres
    const [movieGenresRes, tvGenresRes] = await Promise.all([
      apiFetch(`${getAPIBaseURL()}/genre/movie/list?api_key=${TMDB_API_KEY}`),
      apiFetch(`${getAPIBaseURL()}/genre/tv/list?api_key=${TMDB_API_KEY}`)
    ]);
    
    const movieGenres = await movieGenresRes.json();
    const tvGenres = await tvGenresRes.json();
    
    // Combine and select popular genres (mix of movies and TV)
    const popularGenreIds = [28, 35, 18, 27, 10749, 878, 53, 80, 99, 16]; // Action, Comedy, Drama, Horror, Romance, Sci-Fi, Thriller, Crime, Documentary, Animation
    const selectedGenres = [];
    
    // Get movie genres
    popularGenreIds.slice(0, 6).forEach(genreId => {
      const genre = movieGenres.genres?.find(g => g.id === genreId);
      if (genre) selectedGenres.push({ ...genre, mediaType: 'movie' });
    });
    
    // Get TV genres for remaining
    popularGenreIds.slice(6).forEach(genreId => {
      const genre = tvGenres.genres?.find(g => g.id === genreId);
      if (genre) selectedGenres.push({ ...genre, mediaType: 'tv' });
    });
    
    // Create HTML for each genre
    genresContainer.innerHTML = selectedGenres.map(genre => {
      const containerId = `genre-${genre.id}-${genre.mediaType}`;
      return `
        <div class="category-section">
          <div class="category-header">
            <h3 class="genre-title" data-genre-id="${genre.id}" data-media-type="${genre.mediaType}" style="cursor: pointer;">
              ${escapeHtml(genre.name)} ${genre.mediaType === 'tv' ? 'TV Shows' : 'Movies'}
            </h3>
          </div>
          <div class="carousel-wrapper">
            <button class="carousel-btn carousel-prev" data-carousel="${containerId}" aria-label="Previous">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
            <div class="carousel-container">
              <div class="cards-row carousel-track" id="${containerId}">
                <div class="cards-loading"><div class="loader-small"></div></div>
              </div>
            </div>
            <button class="carousel-btn carousel-next" data-carousel="${containerId}" aria-label="Next">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
    
    // Load content for each genre
    await Promise.all(selectedGenres.map(genre => 
      loadGenreContent(genre.id, genre.mediaType)
    ));
    
    // Setup carousel navigation
    selectedGenres.forEach(genre => {
      const containerId = `genre-${genre.id}-${genre.mediaType}`;
      setupCarouselNavigation(containerId);
    });
    
    // Add click handlers for genre titles
    genresContainer.querySelectorAll('.genre-title').forEach(title => {
      title.addEventListener('click', () => {
        const genreId = parseInt(title.dataset.genreId);
        const mediaType = title.dataset.mediaType;
        showGenreResults(genreId, mediaType, title.textContent.trim());
      });
    });
  } catch (error) {
    console.error('Failed to load genres:', error);
  }
}

// Load content for a specific genre
async function loadGenreContent(genreId, mediaType) {
  const containerId = `genre-${genreId}-${mediaType}`;
  const container = document.getElementById(containerId);
  if (!container) return;
  
  try {
    // Randomize page number (1-5) to show different content each time
    const randomPage = Math.floor(Math.random() * 5) + 1;
    
    const response = await fetch(
      `${TMDB_BASE_URL}/discover/${mediaType}?api_key=${TMDB_API_KEY}&with_genres=${genreId}&page=${randomPage}&sort_by=popularity.desc`
    );
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      // Filter and shuffle results for variety
      const filtered = filterIncompleteItems(data.results);
      const shuffled = filtered.sort(() => Math.random() - 0.5);
      renderCards(container, shuffled.slice(0, 10), mediaType);
    } else {
      container.innerHTML = '<p class="no-content">No content available</p>';
    }
  } catch (error) {
    console.error(`Failed to load genre ${genreId}:`, error);
    container.innerHTML = '<p class="no-content">Failed to load</p>';
  }
}

// Show full page of genre results
async function showGenreResults(genreId, mediaType, genreName) {
  showLoading(`Loading ${genreName}...`);
  
  try {
    // Fetch multiple pages for full results
    const pages = [1, 2, 3, 4, 5];
    const allResults = [];
    
    const responses = await Promise.all(
      pages.map(page =>
        apiFetch(`${getAPIBaseURL()}/discover/${mediaType}?api_key=${TMDB_API_KEY}&with_genres=${genreId}&page=${page}&sort_by=popularity.desc`)
      )
    );
    
    for (const response of responses) {
      const data = await response.json();
      if (data.results) {
        allResults.push(...data.results);
      }
    }
    
    // Remove duplicates
    const uniqueResults = Array.from(new Map(allResults.map(item => [item.id, item])).values());
    
    // Filter out incomplete items
    const filteredResults = filterIncompleteItems(uniqueResults);
    
    // Display on category results page
    showCategoryResultsPage(filteredResults, genreName, mediaType);
  } catch (error) {
    console.error('Failed to load genre results:', error);
    showError('Failed to load', error.message);
  }
}

// ==================== PROVIDERS ====================

// Load watch providers and display provider carousels
async function loadProviders() {
  const providersContainer = document.getElementById('providers-container');
  if (!providersContainer) return;
  
  try {
    // Fetch movie and TV providers
    const [movieProvidersRes, tvProvidersRes] = await Promise.all([
      apiFetch(`${getAPIBaseURL()}/watch/providers/movie?api_key=${TMDB_API_KEY}`),
      apiFetch(`${getAPIBaseURL()}/watch/providers/tv?api_key=${TMDB_API_KEY}`)
    ]);
    
    const movieProviders = await movieProvidersRes.json();
    const tvProviders = await tvProvidersRes.json();
    
    // Regions to filter by (US, CA, UK)
    const targetRegions = ['US', 'CA', 'GB']; // GB is the code for UK in TMDB
    
    // Popular provider IDs to prioritize (Netflix, Disney+, Amazon Prime, Hulu, HBO, etc.)
    const popularProviderIds = [8, 337, 350, 15, 283, 531, 2, 384, 68, 119]; // Netflix, Disney+, Amazon Prime, Hulu, HBO, Apple TV+, Amazon, Max, Paramount+, Starz
    
    const selectedProviders = [];
    
    // Get providers from movie and TV results, filtering by regions
    const allProviders = new Map();
    
    // Process movie providers
    if (movieProviders.results) {
      movieProviders.results.forEach(provider => {
        if (!allProviders.has(provider.provider_id)) {
          allProviders.set(provider.provider_id, {
            ...provider,
            mediaTypes: ['movie']
          });
        } else {
          allProviders.get(provider.provider_id).mediaTypes.push('movie');
        }
      });
    }
    
    // Process TV providers
    if (tvProviders.results) {
      tvProviders.results.forEach(provider => {
        if (!allProviders.has(provider.provider_id)) {
          allProviders.set(provider.provider_id, {
            ...provider,
            mediaTypes: ['tv']
          });
        } else {
          const existing = allProviders.get(provider.provider_id);
          if (!existing.mediaTypes.includes('tv')) {
            existing.mediaTypes.push('tv');
          }
        }
      });
    }
    
    // Filter providers available in target regions and prioritize popular ones
    const availableProviders = Array.from(allProviders.values())
      .filter(provider => {
        // Check if provider is available in any target region
        return targetRegions.some(region => 
          provider.display_priorities && provider.display_priorities[region]
        );
      })
      .sort((a, b) => {
        // Prioritize popular providers
        const aIndex = popularProviderIds.indexOf(a.provider_id);
        const bIndex = popularProviderIds.indexOf(b.provider_id);
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return 0;
      });
    
    // Select top providers (mix of movie and TV)
    const topProviders = availableProviders.slice(0, 10);
    
    // Store providers globally for use in provider details page
    window.providersData = topProviders.map(provider => ({
      id: provider.provider_id,
      name: provider.provider_name,
      logo: provider.logo_path,
      mediaTypes: provider.mediaTypes,
      regions: targetRegions
    }));
    
    // Create HTML for provider cards with logos
    providersContainer.innerHTML = topProviders.map(provider => {
      const providerName = escapeHtml(provider.provider_name || `Provider ${provider.provider_id}`);
      const logoUrl = provider.logo_path 
        ? `${TMDB_IMAGE_BASE}/w500${provider.logo_path}`
        : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"%3E%3Crect fill="%231a1a2e" width="500" height="500"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23a8a8c0" font-family="Arial" font-size="24"%3E${encodeURIComponent(providerName.substring(0, 10))}%3C/text%3E%3C/svg%3E';
      
      return `
        <div class="provider-card" data-provider-id="${provider.provider_id}" style="cursor: pointer;">
          <img src="${logoUrl}" alt="${providerName}" class="provider-card-logo" loading="lazy">
          <span class="provider-card-name">${providerName}</span>
        </div>
      `;
    }).join('');
    
    // Add click handlers for provider cards
    providersContainer.querySelectorAll('.provider-card').forEach(card => {
      card.addEventListener('click', () => {
        const providerId = parseInt(card.dataset.providerId);
        showProviderDetailsPage(providerId);
      });
    });
  } catch (error) {
    console.error('Failed to load providers:', error);
  }
}

// Load content for a specific provider
async function loadProviderContent(providerId, mediaType, regions) {
  const containerId = `provider-${providerId}-${mediaType}`;
  const container = document.getElementById(containerId);
  if (!container) return;
  
  try {
    // Use first region as primary (US)
    const region = regions[0] || 'US';
    
    // Try multiple pages to find content (start with page 1, then try a few more)
    const pagesToTry = [1, 2, 3];
    let data = null;
    
    for (const page of pagesToTry) {
      const response = await fetch(
        `${TMDB_BASE_URL}/discover/${mediaType}?api_key=${TMDB_API_KEY}&with_watch_providers=${providerId}&watch_region=${region}&page=${page}&sort_by=popularity.desc`
      );
      const pageData = await response.json();
      
      if (pageData.results && pageData.results.length > 0) {
        data = pageData;
        break; // Found content, stop trying other pages
      }
    }
    
    if (data && data.results && data.results.length > 0) {
      // Filter and shuffle results for variety
      const filtered = filterIncompleteItems(data.results);
      const shuffled = filtered.sort(() => Math.random() - 0.5);
      renderCards(container, shuffled.slice(0, 10), mediaType);
    } else {
      container.innerHTML = '<p class="no-content">No content available</p>';
    }
  } catch (error) {
    console.error(`Failed to load provider ${providerId}:`, error);
    container.innerHTML = '<p class="no-content">Failed to load</p>';
  }
}

// Show full page of provider results
async function showProviderResults(providerId, mediaType, regions, providerName) {
  showLoading(`Loading ${providerName}...`);
  
  try {
    // Use first region as primary (US)
    const region = regions[0] || 'US';
    
    // Fetch multiple pages for full results
    const pages = [1, 2, 3, 4, 5];
    const allResults = [];
    
    const responses = await Promise.all(
      pages.map(page =>
        apiFetch(`${getAPIBaseURL()}/discover/${mediaType}?api_key=${TMDB_API_KEY}&with_watch_providers=${providerId}&watch_region=${region}&page=${page}&sort_by=popularity.desc`)
      )
    );
    
    for (const response of responses) {
      const data = await response.json();
      if (data.results) {
        allResults.push(...data.results);
      }
    }
    
    // Remove duplicates
    const uniqueResults = Array.from(new Map(allResults.map(item => [item.id, item])).values());
    
    // Filter out incomplete items
    const filteredResults = filterIncompleteItems(uniqueResults);
    
    // Display on category results page
    showCategoryResultsPage(filteredResults, providerName, mediaType);
  } catch (error) {
    console.error('Failed to load provider results:', error);
    showError('Failed to load', error.message);
  }
}

// Show provider details page with Movies and TV Shows tabs
async function showProviderDetailsPage(providerId) {
  hideAllStates();
  
  const providerPage = document.getElementById('provider-details-page');
  const providerLogo = document.getElementById('provider-logo');
  const providerNameEl = document.getElementById('provider-name');
  const moviesGrid = document.getElementById('provider-movies-grid');
  const tvGrid = document.getElementById('provider-tv-grid');
  
  if (!providerPage || !providerLogo || !providerNameEl || !moviesGrid || !tvGrid) return;
  
  // Find provider data
  const provider = window.providersData?.find(p => p.id === providerId);
  if (!provider) {
    showError('Provider not found', 'Unable to load provider information');
    return;
  }
  
  // Set provider info
  const logoUrl = provider.logo 
    ? `${TMDB_IMAGE_BASE}/w500${provider.logo}`
    : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"%3E%3Crect fill="%231a1a2e" width="500" height="500"/%3E%3C/svg%3E';
  providerLogo.src = logoUrl;
  providerLogo.alt = provider.name;
  providerNameEl.textContent = provider.name;
  
  // Show loading state
  moviesGrid.innerHTML = '<div class="cards-loading"><div class="loader-small"></div></div>';
  tvGrid.innerHTML = '<div class="cards-loading"><div class="loader-small"></div></div>';
  
  // Set active tab to Movies by default
  switchProviderTab('movies');
  
  // Load content for both tabs
  const region = provider.regions[0] || 'US';
  
  // Load movies if provider supports movies
  if (provider.mediaTypes.includes('movie')) {
    loadProviderContentForPage(providerId, 'movie', region, moviesGrid);
  } else {
    moviesGrid.innerHTML = '<p class="no-content">No movies available</p>';
  }
  
  // Load TV shows if provider supports TV
  if (provider.mediaTypes.includes('tv')) {
    loadProviderContentForPage(providerId, 'tv', region, tvGrid);
  } else {
    tvGrid.innerHTML = '<p class="no-content">No TV shows available</p>';
  }
  
  providerPage.classList.remove('hidden');
}

// Load provider content for the details page
async function loadProviderContentForPage(providerId, mediaType, region, container) {
  try {
    // Fetch multiple pages for full results
    const pages = [1, 2, 3, 4, 5];
    const allResults = [];
    
    const responses = await Promise.all(
      pages.map(page =>
        apiFetch(`${getAPIBaseURL()}/discover/${mediaType}?api_key=${TMDB_API_KEY}&with_watch_providers=${providerId}&watch_region=${region}&page=${page}&sort_by=popularity.desc`)
      )
    );
    
    for (const response of responses) {
      const data = await response.json();
      if (data.results) {
        allResults.push(...data.results);
      }
    }
    
    // Remove duplicates
    const uniqueResults = Array.from(new Map(allResults.map(item => [item.id, item])).values());
    
    // Filter out incomplete items
    const filteredResults = filterIncompleteItems(uniqueResults);
    
    if (filteredResults.length === 0) {
      container.innerHTML = '<p class="no-content">No content available</p>';
      return;
    }
    
    // Display results in grid
    container.innerHTML = filteredResults.map(item => {
      return renderMediaSearchCard(item, mediaType);
    }).join('');
    
    // Add click handlers
    container.querySelectorAll('.search-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        const type = card.dataset.type;
        loadMedia(id, type);
      });
    });
  } catch (error) {
    console.error(`Failed to load provider ${mediaType}:`, error);
    container.innerHTML = '<p class="no-content">Failed to load</p>';
  }
}

// Switch provider tab
function switchProviderTab(tab) {
  const moviesTab = document.getElementById('provider-tab-movies');
  const tvTab = document.getElementById('provider-tab-tv');
  const moviesGrid = document.getElementById('provider-movies-grid');
  const tvGrid = document.getElementById('provider-tv-grid');
  
  if (tab === 'movies') {
    moviesTab.classList.add('active');
    tvTab.classList.remove('active');
    moviesGrid.classList.remove('hidden');
    tvGrid.classList.add('hidden');
  } else {
    tvTab.classList.add('active');
    moviesTab.classList.remove('active');
    tvGrid.classList.remove('hidden');
    moviesGrid.classList.add('hidden');
  }
}

// Filter function to exclude items missing poster image
function filterIncompleteItems(items) {
  return items.filter(item => {
    // Exclude items without a poster image
    return item.poster_path && item.poster_path.trim() !== '';
  });
}

// Carousel navigation functions
function setupCarouselNavigation(carouselId) {
  const track = document.getElementById(carouselId);
  if (!track) return;
  
  const prevBtn = document.querySelector(`.carousel-prev[data-carousel="${carouselId}"]`);
  const nextBtn = document.querySelector(`.carousel-next[data-carousel="${carouselId}"]`);
  
  if (!prevBtn || !nextBtn) return;
  
  const scrollAmount = 600; // Scroll 600px at a time (approximately 3-4 cards)
  
  const updateButtons = () => {
    const isAtStart = track.scrollLeft <= 0;
    const isAtEnd = track.scrollLeft >= track.scrollWidth - track.clientWidth - 10;
    
    prevBtn.disabled = isAtStart;
    nextBtn.disabled = isAtEnd;
  };
  
  prevBtn.addEventListener('click', () => {
    track.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
  });
  
  nextBtn.addEventListener('click', () => {
    track.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  });
  
  track.addEventListener('scroll', updateButtons);
  
  // Initial button state
  setTimeout(updateButtons, 100);
}

function renderCards(container, items, mediaType) {
  container.innerHTML = items.map((item, index) => {
    const title = escapeHtml(item.title || item.name || 'Unknown');
    const year = (item.release_date || item.first_air_date || '').split('-')[0] || '';
    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
    const poster = item.poster_path 
      ? `${TMDB_IMAGE_BASE}/w342${item.poster_path}`
      : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 342 513"%3E%3Crect fill="%231a1a2e" width="342" height="513"/%3E%3C/svg%3E';
    const overview = item.overview ? escapeHtml(item.overview.substring(0, 150)) : 'No description available.';
    
    return `
      <div class="media-card" data-id="${item.id}" data-type="${mediaType}">
        <div class="card-poster-wrapper">
          <img class="card-poster" src="${poster}" alt="" loading="lazy">
          <div class="card-rating">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            <span>${rating}</span>
          </div>
        </div>
        <div class="card-info">
          <h4 class="card-title">${title}</h4>
          ${year ? `<span class="card-year">${year}</span>` : ''}
        </div>
        <!-- Hovercard - Netflix Style -->
        <div class="card-hovercard">
          <div class="hovercard-poster">
            <img src="${poster}" alt="" loading="lazy">
            <div class="hovercard-trailer" data-id="${item.id}" data-type="${mediaType}">
              <div class="trailer-preview-container"></div>
              <div class="trailer-loading">
                <div class="loader-small"></div>
              </div>
            </div>
          </div>
          <div class="hovercard-content">
            <div class="hovercard-actions">
              <button class="hovercard-action-btn hovercard-play" title="Play">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
              </button>
              <button class="hovercard-action-btn hovercard-favorite" title="Add to Favorites">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </button>
              <button class="hovercard-action-btn hovercard-watchlist" title="Add to Watchlist">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
            </div>
            <div class="hovercard-info">
              <div class="hovercard-match">
                <span>${Math.round(item.vote_average * 10)}% Match</span>
              </div>
              <p class="hovercard-description">${overview}${item.overview && item.overview.length > 150 ? '...' : ''}</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Add event listeners to cards
  container.querySelectorAll('.media-card').forEach(card => {
    const id = card.dataset.id;
    const type = card.dataset.type;
    const hovercard = card.querySelector('.card-hovercard');
    
    // Click to view details (but not if clicking on hovercard buttons)
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.hovercard-actions')) {
        loadMedia(id, type);
      }
    });
    
    // Hover to show hovercard at mouse position
    let hoverTimeout;
    let hideTimeout;
    let mouseX = 0;
    let mouseY = 0;
    let isHovercardVisible = false;
    let lastMouseMoveTime = 0;
    
    // Only update position if hovercard is visible and mouse isn't moving too fast (scrolling)
    card.addEventListener('mousemove', (e) => {
      const now = Date.now();
      const timeSinceLastMove = now - lastMouseMoveTime;
      lastMouseMoveTime = now;
      
      // If mouse is moving very fast (likely scrolling), don't update position
      if (timeSinceLastMove < 50 && isHovercardVisible) {
        return;
      }
      
      mouseX = e.clientX;
      mouseY = e.clientY;
      
      // Only update hovercard position if it's already visible
      if (isHovercardVisible && hovercard) {
        showHovercard(hovercard, mouseX, mouseY, id, type);
      }
    });
    
    card.addEventListener('mouseenter', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      lastMouseMoveTime = Date.now();
      clearTimeout(hoverTimeout);
      clearTimeout(hideTimeout);
      hoverTimeout = setTimeout(() => {
        if (!isHovercardVisible) {
          showHovercard(hovercard, mouseX, mouseY, id, type);
          isHovercardVisible = true;
        }
      }, 400);
    });
    
    card.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimeout);
      isHovercardVisible = false;
      // Delay hiding to allow mouse to move to hovercard
      hideTimeout = setTimeout(() => {
        hideHovercard(hovercard);
      }, 150);
    });
    
    // Keep hovercard open when hovering over it
    if (hovercard) {
      hovercard.addEventListener('mouseenter', () => {
        clearTimeout(hoverTimeout);
        clearTimeout(hideTimeout);
        isHovercardVisible = true;
      });
      
      hovercard.addEventListener('mouseleave', () => {
        isHovercardVisible = false;
        hideHovercard(hovercard);
      });
    }
    
    // Hide hovercard on scroll
    card.addEventListener('wheel', () => {
      if (isHovercardVisible) {
        isHovercardVisible = false;
        hideHovercard(hovercard);
      }
    }, { passive: true });
    
    // Hide hovercard on right-click
    card.addEventListener('contextmenu', () => {
      if (isHovercardVisible) {
        isHovercardVisible = false;
        clearTimeout(hoverTimeout);
        clearTimeout(hideTimeout);
        hideHovercard(hovercard);
      }
    });
    
    // Hide hovercard on right-click (when hovering over hovercard itself)
    if (hovercard) {
      hovercard.addEventListener('contextmenu', () => {
        isHovercardVisible = false;
        clearTimeout(hoverTimeout);
        clearTimeout(hideTimeout);
        hideHovercard(hovercard);
      });
    }
    
    // Setup hovercard buttons
    setupHovercardButtons(card, hovercard, id, type);
  });
}

// Show hovercard - positioned at mouse location
function showHovercard(hovercard, mouseX, mouseY, id, type) {
  if (!hovercard) return;
  
  // Hide all other hovercards first
  document.querySelectorAll('.card-hovercard').forEach(hc => {
    if (hc !== hovercard) {
      hc.style.opacity = '0';
      hc.style.pointerEvents = 'none';
    }
  });
  
  // Move hovercard to body to escape stacking context
  if (hovercard.parentElement !== document.body) {
    document.body.appendChild(hovercard);
  }
  
  const hovercardWidth = 320;
  const hovercardHeight = 380;
  const offset = 15; // Distance from cursor
  
  // Calculate position - prefer right and below cursor
  let left = mouseX + offset;
  let top = mouseY + offset;
  
  // Adjust if hovercard would go off screen right
  if (left + hovercardWidth > window.innerWidth - 20) {
    left = mouseX - hovercardWidth - offset;
  }
  
  // Adjust if hovercard would go off screen bottom
  if (top + hovercardHeight > window.innerHeight - 20) {
    top = mouseY - hovercardHeight - offset;
  }
  
  // Ensure not off left edge
  if (left < 20) {
    left = 20;
  }
  
  // Ensure not off top edge
  if (top < 20) {
    top = 20;
  }
  
  // Set position using fixed positioning
  hovercard.style.position = 'fixed';
  hovercard.style.left = `${left}px`;
  hovercard.style.top = `${top}px`;
  hovercard.style.opacity = '1';
  hovercard.style.pointerEvents = 'auto';
  
  // Load trailer preview after a delay
  setTimeout(() => {
    const trailerContainer = hovercard.querySelector('.hovercard-trailer');
    if (trailerContainer) {
      loadHovercardTrailer(trailerContainer, id, type);
    }
  }, 800);
}

// Hide hovercard
function hideHovercard(hovercard) {
  if (!hovercard) return;
  hovercard.style.opacity = '0';
  hovercard.style.pointerEvents = 'none';
  
  // Stop trailer by removing preview container content and destroying players
  const trailerContainer = hovercard.querySelector('.hovercard-trailer');
  if (trailerContainer) {
    const previewContainer = trailerContainer.querySelector('.trailer-preview-container');
    if (previewContainer) {
      // Stop and destroy any YouTube players
      const playerDiv = previewContainer.querySelector('div[id^="youtube-player"]');
      if (playerDiv && youtubePlayers[playerDiv.id]) {
        try {
          youtubePlayers[playerDiv.id].destroy();
          delete youtubePlayers[playerDiv.id];
        } catch (e) {
          console.error('Error destroying YouTube player:', e);
        }
      }
      previewContainer.innerHTML = '';
    }
  }
}

// Setup hovercard buttons
function setupHovercardButtons(card, hovercard, id, type) {
  if (!hovercard) return;
  
  // Play button
  const playBtn = hovercard.querySelector('.hovercard-play');
  if (playBtn) {
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      loadMedia(id, type);
    });
  }
  
  // Favorite button
  const favoriteBtn = hovercard.querySelector('.hovercard-favorite');
  if (favoriteBtn) {
    favoriteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (isLoggedIn()) {
        const state = await getMovieAccountState(id, type);
        await toggleFavorite(id, !state?.favorite, type);
        updateHovercardFavoriteButton(favoriteBtn, !state?.favorite);
      } else {
        showLoginModal();
      }
    });
    
    // Update button state
    if (isLoggedIn()) {
      getMovieAccountState(id, type).then(state => {
        updateHovercardFavoriteButton(favoriteBtn, state?.favorite);
      });
    }
  }
  
  // Watchlist button
  const watchlistBtn = hovercard.querySelector('.hovercard-watchlist');
  if (watchlistBtn) {
    watchlistBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (isLoggedIn()) {
        const state = await getMovieAccountState(id, type);
        await toggleWatchlist(id, !state?.watchlist, type);
        updateHovercardWatchlistButton(watchlistBtn, !state?.watchlist);
      } else {
        showLoginModal();
      }
    });
    
    // Update button state
    if (isLoggedIn()) {
      getMovieAccountState(id, type).then(state => {
        updateHovercardWatchlistButton(watchlistBtn, state?.watchlist);
      });
    }
  }
}

// Update favorite button state
function updateHovercardFavoriteButton(btn, isFavorite) {
  if (isFavorite) {
    btn.classList.add('active');
    btn.querySelector('svg').setAttribute('fill', 'currentColor');
  } else {
    btn.classList.remove('active');
    btn.querySelector('svg').setAttribute('fill', 'none');
  }
}

// Update watchlist button state
function updateHovercardWatchlistButton(btn, inWatchlist) {
  if (inWatchlist) {
    btn.classList.add('active');
  } else {
    btn.classList.remove('active');
  }
}

// Wait for YouTube IFrame API to load
window.onYouTubeIframeAPIReady = function() {
  console.log('YouTube IFrame API ready');
  window.youtubeAPIReady = true;
};

// Check if YouTube API loaded
if (typeof YT === 'undefined') {
  console.warn('YouTube IFrame API script may not have loaded. Check CSP and network.');
} else {
  console.log('YouTube IFrame API already available');
  window.youtubeAPIReady = true;
}

// Load trailer for hovercard using YouTube IFrame API
async function loadHovercardTrailer(trailerContainer, id, mediaType) {
  const previewContainer = trailerContainer.querySelector('.trailer-preview-container');
  const loading = trailerContainer.querySelector('.trailer-loading');
  
  if (!previewContainer) return;
  
  // Check cache first
  const cacheKey = `${mediaType}-${id}`;
  if (trailerCache[cacheKey] === 'none') {
    return; // No trailer available
  }
  
  // If already loaded, just show it
  if (previewContainer.querySelector('img')) {
    trailerContainer.classList.add('active');
    return;
  }
  
  // Show loading
  trailerContainer.classList.add('active');
  if (loading) loading.classList.add('visible');
  
  try {
    // Fetch videos from TMDB
    const response = await fetch(
      `${TMDB_BASE_URL}/${mediaType}/${id}/videos?api_key=${TMDB_API_KEY}`
    );
    const data = await response.json();
    
    // Find a trailer or teaser
    const trailer = data.results?.find(v => 
      v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')
    );
    
    if (trailer) {
      const youtubeKey = trailer.key;
      
      // Fallback thumbnail
      const thumbnailUrl = `https://img.youtube.com/vi/${youtubeKey}/maxresdefault.jpg`;
      const fallbackThumbnail = `https://img.youtube.com/vi/${youtubeKey}/hqdefault.jpg`;
      
      const img = document.createElement('img');
      img.src = thumbnailUrl;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      img.style.position = 'absolute';
      img.style.top = '0';
      img.style.left = '0';
      img.style.zIndex = '1';
      img.onerror = () => {
        img.src = fallbackThumbnail;
      };
      
      // YouTube autoplay is unreliable (Error 153, autoplay restrictions)
      // Use animated thumbnail preview instead (Netflix-style)
      // Clear container and add thumbnail with animation
      previewContainer.innerHTML = '';
      previewContainer.appendChild(img);
      
      // Add subtle zoom animation to thumbnail (Netflix-style preview)
      img.style.transition = 'transform 8s ease-in-out';
      img.style.transformOrigin = 'center';
      
      // Start animation after a short delay
      setTimeout(() => {
        img.style.transform = 'scale(1.08)';
      }, 300);
      
      // Add play button overlay
      const playOverlay = document.createElement('div');
      playOverlay.className = 'trailer-play-overlay';
      playOverlay.innerHTML = `
        <svg viewBox="0 0 24 24" fill="white">
          <polygon points="8 5 19 12 8 19 8 5"/>
        </svg>
      `;
      
      previewContainer.appendChild(playOverlay);
      
      trailerCache[cacheKey] = youtubeKey;
      if (loading) loading.classList.remove('visible');
    } else {
      trailerCache[cacheKey] = 'none';
      trailerContainer.classList.remove('active');
      if (loading) loading.classList.remove('visible');
    }
  } catch (error) {
    console.error('Failed to load trailer:', error);
    trailerCache[cacheKey] = 'none';
    trailerContainer.classList.remove('active');
    if (loading) loading.classList.remove('visible');
  }
}


// Updated toggle functions to accept mediaType parameter
async function toggleFavorite(movieId, add = true, mediaType = null) {
  if (!isLoggedIn()) {
    showLoginModal();
    return;
  }
  
  const type = mediaType || currentMediaType || 'movie';
  
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/account/${tmdbSession.accountId}/favorite?api_key=${TMDB_API_KEY}&session_id=${tmdbSession.sessionId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: type,
          media_id: movieId,
          favorite: add
        })
      }
    );
    const data = await response.json();
    
    if (data.success) {
      showToast(add ? 'Added to favorites' : 'Removed from favorites');
      updateMovieAccountState();
      if (currentTab === 'favorites') loadListContent('favorites');
    }
  } catch (error) {
    console.error('Favorite error:', error);
    showToast('Failed to update favorites');
  }
}

async function toggleWatchlist(movieId, add = true, mediaType = null) {
  if (!isLoggedIn()) {
    showLoginModal();
    return;
  }
  
  const type = mediaType || currentMediaType || 'movie';
  
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/account/${tmdbSession.accountId}/watchlist?api_key=${TMDB_API_KEY}&session_id=${tmdbSession.sessionId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: type,
          media_id: movieId,
          watchlist: add
        })
      }
    );
    const data = await response.json();
    
    if (data.success) {
      showToast(add ? 'Added to watchlist' : 'Removed from watchlist');
      updateMovieAccountState();
      if (currentTab === 'watchlist') loadListContent('watchlist');
    }
  } catch (error) {
    console.error('Watchlist error:', error);
    showToast('Failed to update watchlist');
  }
}

async function loadTrailerPreview(card, id, mediaType) {
  const trailerContainer = card.querySelector('.card-trailer');
  const video = trailerContainer.querySelector('.trailer-video');
  const loading = trailerContainer.querySelector('.trailer-loading');
  
  // Check cache first
  const cacheKey = `${mediaType}-${id}`;
  if (trailerCache[cacheKey] === 'none') {
    return; // No trailer available
  }
  
  if (trailerCache[cacheKey]) {
    playTrailerVideo(video, trailerCache[cacheKey], trailerContainer);
    return;
  }
  
  // Show loading
  trailerContainer.classList.add('active');
  loading.classList.add('visible');
  
  try {
    // Fetch videos from TMDB
    const response = await fetch(
      `${TMDB_BASE_URL}/${mediaType}/${id}/videos?api_key=${TMDB_API_KEY}`
    );
    const data = await response.json();
    
    // Find a trailer or teaser
    const trailer = data.results?.find(v => 
      v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')
    );
    
    if (trailer) {
      // We'll use a YouTube embed approach since direct video isn't available
      // For now, show a YouTube thumbnail preview
      const thumbnailUrl = `https://img.youtube.com/vi/${trailer.key}/hqdefault.jpg`;
      trailerCache[cacheKey] = thumbnailUrl;
      
      // Create an animated preview using the thumbnail
      video.poster = thumbnailUrl;
      trailerContainer.classList.add('has-preview');
      loading.classList.remove('visible');
    } else {
      trailerCache[cacheKey] = 'none';
      trailerContainer.classList.remove('active');
      loading.classList.remove('visible');
    }
  } catch (error) {
    console.error('Failed to load trailer:', error);
    trailerCache[cacheKey] = 'none';
    trailerContainer.classList.remove('active');
    loading.classList.remove('visible');
  }
}

function playTrailerVideo(video, url, container) {
  container.classList.add('active', 'has-preview');
  video.poster = url;
}

function stopTrailerPreview(card) {
  const trailerContainer = card.querySelector('.card-trailer');
  const video = trailerContainer.querySelector('.trailer-video');
  trailerContainer.classList.remove('active', 'has-preview');
  video.poster = '';
}

// ==================== MEDIA LOADING (MOVIES & TV) ====================

async function loadMedia(id, mediaType = 'movie') {
  showLoading(`Loading ${mediaType === 'tv' ? 'TV show' : 'movie'} details...`);
  currentMediaType = mediaType;
  
  try {
    // Determine season/episode for TV shows
    let streamUrl, cacheKey;
    if (mediaType === 'tv') {
      // Default to season 1 episode 1
      currentSeason = 1;
      currentEpisode = 1;
      streamUrl = `${STREAMS_API_BASE}/tv/${id}/${currentSeason}/${currentEpisode}`;
      cacheKey = `stream_${mediaType}_${id}_${currentSeason}_${currentEpisode}`;
    } else {
      streamUrl = `${STREAMS_API_BASE}/movie/${id}`;
      cacheKey = `stream_${mediaType}_${id}`;
    }
    
    // Check cache first
    let streamData = streamCache[cacheKey] || null;
    
    // Fetch TMDB details and stream info in parallel (if not cached)
    const fetchPromises = [
      apiFetch(`${getAPIBaseURL()}/${mediaType}/${id}?api_key=${TMDB_API_KEY}`)
    ];
    
    if (!streamData) {
      showLoading('Fetching stream...');
      fetchPromises.push(fetch(streamUrl));
    }
    
    const results = await Promise.all(fetchPromises);
    const mediaResponse = results[0];
    const streamResponse = results[1];
    
    if (!mediaResponse.ok) throw new Error('Failed to load details');
    
    const media = await mediaResponse.json();
    currentMovie = media;
    
    // Get stream data from cache or response
    if (!streamData && streamResponse) {
      if (streamResponse.ok) {
        streamData = await streamResponse.json();
        // Cache the stream data
        streamCache[cacheKey] = streamData;
        saveStreamCache();
      }
    } else if (streamData) {
      // Stream was loaded from cache
      console.log('Stream loaded from cache');
    }
    
    displayMediaDetails(media, streamData, mediaType);
  } catch (error) {
    console.error('Load media error:', error);
    showError('Failed to load', error.message);
  }
}

function displayMediaDetails(media, streamData, mediaType) {
  hideAllStates();
  movieDetails.classList.remove('hidden');
  
  // Set backdrop
  const backdrop = document.getElementById('movie-backdrop');
  if (media.backdrop_path) {
    backdrop.style.backgroundImage = `url(${TMDB_IMAGE_BASE}/w1280${media.backdrop_path})`;
  } else {
    backdrop.style.backgroundImage = 'none';
  }
  
  // Set poster
  const poster = document.getElementById('movie-poster');
  poster.src = media.poster_path 
    ? `${TMDB_IMAGE_BASE}/w500${media.poster_path}`
    : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 750"%3E%3Crect fill="%231a1a2e" width="500" height="750"/%3E%3C/svg%3E';
  
  // Set title (movies have 'title', TV has 'name')
  const title = media.title || media.name;
  document.getElementById('movie-title').textContent = title;
  
  // Update play button text
  const playBtnText = document.querySelector('#play-button span');
  playBtnText.textContent = mediaType === 'tv' ? 'Play Episode' : 'Play Movie';
  
  // Set meta info
  const meta = [];
  const releaseDate = media.release_date || media.first_air_date;
  if (releaseDate) {
    meta.push(`<span class="meta-item">${releaseDate.split('-')[0]}</span>`);
  }
  
  // Runtime for movies, episode info for TV
  if (mediaType === 'movie' && media.runtime) {
    const hours = Math.floor(media.runtime / 60);
    const minutes = media.runtime % 60;
    meta.push(`<span class="meta-item">${hours}h ${minutes}m</span>`);
  } else if (mediaType === 'tv') {
    if (media.number_of_seasons) {
      meta.push(`<span class="meta-item">${media.number_of_seasons} Season${media.number_of_seasons > 1 ? 's' : ''}</span>`);
    }
  }
  
  if (media.vote_average) {
    meta.push(`
      <span class="meta-item rating">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
        ${media.vote_average.toFixed(1)}
      </span>
    `);
  }
  
  if (media.genres && media.genres.length > 0) {
    meta.push(`<span class="meta-genres">${media.genres.slice(0, 3).map(g => g.name).join(' • ')}</span>`);
  }
  
  // Add media type badge
  meta.unshift(`<span class="meta-item type-badge">${mediaType === 'tv' ? 'TV Show' : 'Movie'}</span>`);
  
  document.getElementById('movie-meta').innerHTML = meta.join('');
  
  // Set overview
  document.getElementById('movie-overview').textContent = media.overview || 'No overview available.';
  
  // Handle episode list for TV shows
  const episodeListSection = document.getElementById('episode-list-section');
  const episodeSeasonSelect = document.getElementById('episode-season-select');
  if (mediaType === 'tv' && media.seasons) {
    episodeListSection.classList.remove('hidden');
    populateSeasonSelector(media);
    loadEpisodeList(media.id, currentSeason);
  } else {
    episodeListSection.classList.add('hidden');
    // Explicitly hide season selector for movies
    if (episodeSeasonSelect) {
      episodeSeasonSelect.classList.add('hidden');
    }
  }
  
  // Process streams (reuse existing stream handling)
  processStreams(streamData);
  
  // Load cast
  loadCast(media.id, mediaType);
  
  // Update account state
  updateMovieAccountState();
}

function populateSeasonSelector(media) {
  const episodeSeasonSelect = document.getElementById('episode-season-select');
  
  if (!episodeSeasonSelect) return;
  
  // Filter out "Specials" (season 0) and seasons with no episodes
  const validSeasons = media.seasons?.filter(s => s.season_number > 0 && s.episode_count > 0) || [];
  
  // Populate seasons
  const seasonOptions = validSeasons.map(season => 
    `<option value="${season.season_number}" data-episodes="${season.episode_count}">
      Season ${season.season_number}
    </option>`
  ).join('');
  
  episodeSeasonSelect.innerHTML = seasonOptions;
  episodeSeasonSelect.value = currentSeason;
  
  // Show selector for TV shows
  if (currentMediaType === 'tv') {
    episodeSeasonSelect.classList.remove('hidden');
  } else {
    episodeSeasonSelect.classList.add('hidden');
  }
}

async function loadSelectedEpisode(season, episode) {
  if (!currentMovie || currentMediaType !== 'tv') return;
  
  // Use provided season/episode or current values
  if (season !== undefined) currentSeason = season;
  if (episode !== undefined) currentEpisode = episode;
  
  showLoading(`Loading S${currentSeason}E${currentEpisode}...`);
  
  try {
    const cacheKey = `stream_${currentMediaType}_${currentMovie.id}_${currentSeason}_${currentEpisode}`;
    
    // Check cache first
    let streamData = streamCache[cacheKey] || null;
    
    if (!streamData) {
      const streamUrl = `${STREAMS_API_BASE}/tv/${currentMovie.id}/${currentSeason}/${currentEpisode}`;
      const streamResponse = await fetch(streamUrl);
      
      if (streamResponse.ok) {
        streamData = await streamResponse.json();
        // Cache the stream data
        streamCache[cacheKey] = streamData;
        saveStreamCache();
      }
    } else {
      // Stream was cached, load instantly
      showToast(`Loaded Season ${currentSeason} Episode ${currentEpisode} (cached)`);
    }
    
    // Show details again and update streams
    hideAllStates();
    movieDetails.classList.remove('hidden');
    processStreams(streamData);
    
    // Update play button to show current episode
    const playBtnText = document.querySelector('#play-button span');
    playBtnText.textContent = `Play S${currentSeason}E${currentEpisode}`;
    
    if (!streamCache[cacheKey]) {
      showToast(`Loaded Season ${currentSeason} Episode ${currentEpisode}`);
    }
  } catch (error) {
    console.error('Load episode error:', error);
    showToast('Failed to load episode');
    hideAllStates();
    movieDetails.classList.remove('hidden');
  }
}

// Load episodes for a single season
async function loadEpisodeList(tvId, seasonNumber) {
  const episodeListContainer = document.getElementById('episode-list-container');
  
  if (!episodeListContainer) return;
  
  episodeListContainer.innerHTML = '<div class="episode-loading"><div class="loader-small"></div><span>Loading episodes...</span></div>';
  
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/tv/${tvId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}`
    );
    
    if (!response.ok) throw new Error('Failed to load episodes');
    
    const seasonData = await response.json();
    
    if (seasonData.episodes && seasonData.episodes.length > 0) {
      episodeListContainer.innerHTML = seasonData.episodes.map(episode => {
        const thumbnail = episode.still_path 
          ? `${TMDB_IMAGE_BASE}/w300${episode.still_path}`
          : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 169"%3E%3Crect fill="%231a1a2e" width="300" height="169"/%3E%3C/svg%3E';
        
        const title = escapeHtml(episode.name || `Episode ${episode.episode_number}`);
        const description = escapeHtml(episode.overview || 'No description available.');
        const runtime = episode.runtime ? `${episode.runtime} min` : '';
        const rating = episode.vote_average ? episode.vote_average.toFixed(1) : '';
        const airDate = episode.air_date ? new Date(episode.air_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        
        return `
          <div class="episode-item" data-season="${seasonNumber}" data-episode="${episode.episode_number}">
            <div class="episode-thumbnail">
              <img src="${thumbnail}" alt="${title}" loading="lazy">
              <div class="episode-number-badge">E${episode.episode_number}</div>
            </div>
            <div class="episode-info">
              <div class="episode-title-row">
                <span class="episode-number">E${episode.episode_number}</span>
                <h4 class="episode-title">${title}</h4>
              </div>
              <div class="episode-meta">
                ${airDate ? `<span>${airDate}</span>` : ''}
                ${runtime ? `<span class="episode-runtime">${runtime}</span>` : ''}
                ${rating ? `<span class="episode-rating">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                  ${rating}
                </span>` : ''}
              </div>
              <p class="episode-description">${description}</p>
            </div>
          </div>
        `;
      }).join('');
      
      // Add click handlers to episodes
      episodeListContainer.querySelectorAll('.episode-item').forEach(item => {
        item.addEventListener('click', () => {
          const season = parseInt(item.dataset.season);
          const episode = parseInt(item.dataset.episode);
          
          // Update season selector
          const episodeSeasonSelect = document.getElementById('episode-season-select');
          if (episodeSeasonSelect) {
            episodeSeasonSelect.value = season;
          }
          
          // Load the episode
          loadSelectedEpisode(season, episode);
        });
      });
    } else {
      episodeListContainer.innerHTML = '<div class="episode-loading"><span>No episodes available</span></div>';
    }
  } catch (error) {
    console.error('Failed to load episodes:', error);
    episodeListContainer.innerHTML = '<div class="episode-loading"><span>Failed to load episodes</span></div>';
  }
}

// Episode list season selector
document.getElementById('episode-season-select')?.addEventListener('change', (e) => {
  if (currentMovie && currentMediaType === 'tv') {
    const seasonNumber = parseInt(e.target.value);
    currentSeason = seasonNumber;
    loadEpisodeList(currentMovie.id, seasonNumber);
  }
});

function processStreams(streamData) {
  const streamInfo = document.getElementById('stream-info');
  const playButton = document.getElementById('play-button');
  
  if (!playButton) {
    console.error('Play button not found');
    return;
  }
  
  let allStreams = [];
  let allSubtitles = [];
  
  if (streamData && streamData.streams) {
    for (const providerName of Object.keys(streamData.streams)) {
      const provider = streamData.streams[providerName];
      if (provider.streams && Array.isArray(provider.streams)) {
        const qualityStreams = provider.streams
          .filter(s => s.type === 'quality' || s.resolution)
          .map(s => ({
            ...s,
            provider: providerName,
            qualityLabel: getQualityLabel(s.resolution, s.bandwidth)
          }));
        allStreams = allStreams.concat(qualityStreams);
        
        // Extract subtitles/captions
        const subtitleStreams = provider.streams.filter(s => 
          s.type === 'captions' || s.type === 'subtitle' || s.type === 'subtitles'
        );
        allSubtitles = allSubtitles.concat(subtitleStreams.map(s => ({
          ...s,
          provider: providerName
        })));
      }
      
      // Check for subtitles at provider level
      if (provider.subtitles && Array.isArray(provider.subtitles)) {
        allSubtitles = allSubtitles.concat(provider.subtitles.map(s => ({
          ...s,
          provider: providerName
        })));
      }
      if (provider.captions && Array.isArray(provider.captions)) {
        allSubtitles = allSubtitles.concat(provider.captions.map(s => ({
          ...s,
          provider: providerName
        })));
      }
    }
  }
  
  // Check for subtitles at root level
  if (streamData && streamData.subtitles && Array.isArray(streamData.subtitles)) {
    allSubtitles = allSubtitles.concat(streamData.subtitles);
  }
  if (streamData && streamData.captions && Array.isArray(streamData.captions)) {
    allSubtitles = allSubtitles.concat(streamData.captions);
  }
  
  currentSubtitles = allSubtitles;
  
  allStreams.sort((a, b) => {
    const aBandwidth = parseInt(a.bandwidth) || 0;
    const bBandwidth = parseInt(b.bandwidth) || 0;
    return bBandwidth - aBandwidth;
  });
  
  currentStreams = allStreams;
  
  if (allStreams.length > 0) {
    const bestStream = allStreams[0];
    currentStreamUrl = bestStream.url;
    
    streamInfo.innerHTML = `
      <div class="stream-available">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span>Stream available • ${bestStream.qualityLabel}</span>
      </div>
      <div class="stream-qualities">
        ${allStreams.map((s, idx) => `
          <button class="quality-btn ${idx === 0 ? 'active' : ''}" data-url="${s.url}" data-idx="${idx}">
            ${s.qualityLabel}
          </button>
        `).join('')}
      </div>
    `;
    
    streamInfo.querySelectorAll('.quality-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        streamInfo.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentStreamUrl = e.target.dataset.url;
      });
    });
    
    playButton.disabled = false;
    playButton.classList.remove('disabled');
  } else {
    streamInfo.innerHTML = `
      <div class="stream-unavailable">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
        </svg>
        <span>No streams available</span>
        <button class="refresh-streams-btn" id="refresh-streams-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          <span>Get New Streams</span>
        </button>
      </div>
    `;
    
    // Add click handler for refresh button
    const refreshBtn = document.getElementById('refresh-streams-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        await refreshStreams();
      });
    }
    
    playButton.disabled = true;
    playButton.classList.add('disabled');
    currentStreamUrl = null;
  }
  
  playButton.onclick = () => {
    if (currentStreamUrl) {
      showPlayer(currentStreamUrl);
    }
  };
}

// Refresh streams by clearing cache and re-fetching
async function refreshStreams() {
  if (!currentMovie) return;
  
  const refreshBtn = document.getElementById('refresh-streams-btn');
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinning">
        <polyline points="23 4 23 10 17 10"/>
        <polyline points="1 20 1 14 7 14"/>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
      </svg>
      Loading...
    `;
  }
  
  try {
    // Determine cache key and stream URL
    let cacheKey, streamUrl;
    if (currentMediaType === 'tv') {
      cacheKey = `stream_${currentMediaType}_${currentMovie.id}_${currentSeason}_${currentEpisode}`;
      streamUrl = `${STREAMS_API_BASE}/tv/${currentMovie.id}/${currentSeason}/${currentEpisode}`;
    } else {
      cacheKey = `stream_${currentMediaType}_${currentMovie.id}`;
      streamUrl = `${STREAMS_API_BASE}/movie/${currentMovie.id}`;
    }
    
    // Clear cache for this item
    delete streamCache[cacheKey];
    saveStreamCache();
    
    // Re-fetch stream
    showLoading('Fetching new streams...');
    const streamResponse = await fetch(streamUrl);
    
    let streamData = null;
    if (streamResponse.ok) {
      streamData = await streamResponse.json();
      // Cache the new stream data
      streamCache[cacheKey] = streamData;
      saveStreamCache();
    }
    
    // Update UI with new stream data
    hideAllStates();
    movieDetails.classList.remove('hidden');
    processStreams(streamData);
    
    if (streamData && streamData.streams) {
      showToast('New streams fetched successfully');
    } else {
      showToast('No streams found. Please try again later.');
    }
  } catch (error) {
    console.error('Refresh streams error:', error);
    showToast('Failed to fetch new streams');
    // Re-process with empty data to show the button again
    hideAllStates();
    movieDetails.classList.remove('hidden');
    processStreams(null);
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
    }
  }
}

// Initialize
console.log('🎬 CineStream initialized');

// ==================== DISCORD RICH PRESENCE ====================

// Set browsing status when not watching anything
function setDiscordBrowsing() {
  const presence = {
    type: 0, // 0 = playing fuck bot api for not allowing type 3.
    details: 'Browsing Library',
    largeImageKey: 'cinestream',
    largeImageText: 'CineStream'
  };
  
  // Add buttons if GitHub URL is configured
  if (GITHUB_REPO_URL) {
    presence.buttons = [
      {
        label: 'Get CineStream',
        url: GITHUB_REPO_URL
      }
    ];
  }
  
  if (window.electronAPI && window.electronAPI.discordSetPresence) {
    window.electronAPI.discordSetPresence(presence);
  }
}

function updateDiscordPresence(state, details = null) {
  if (!currentMovie) return;
  
  const title = currentMovie.title || currentMovie.name;
  
  // Only show episode info for TV shows, nothing for movies
  let presenceDetails = details;
  if (!presenceDetails && currentMediaType === 'tv') {
    presenceDetails = `S${currentSeason}:E${currentEpisode}`;
  }
  
  const presence = {
    type: 0, // 0 = playing fuck bot api for not allowing type 3.
    details: `Watching ${title}`.length > 128 ? `Watching ${title}`.substring(0, 125) + '...' : `Watching ${title}`,
    largeImageKey: 'cinestream', // users can set custom assets via Discord Developer Portal
    largeImageText: title,
    smallImageKey: state === 'playing' ? 'play' : 'pause',
    smallImageText: state === 'playing' ? 'Watching' : 'Paused'
  };
  
  // Only add state if we have episode info
  if (presenceDetails) {
    presence.state = presenceDetails;
  }
  
  // Timestamps ONLY for playing state (seconds)
  if (state === 'playing') {
    const now = Math.floor(Date.now() / 1000);
    
    if (videoPlayer && videoPlayer.duration > 0 && !isNaN(videoPlayer.duration)) {
      const durationSec = Math.floor(videoPlayer.duration);
      const currentSec = Math.floor(videoPlayer.currentTime || 0);
      presence.startTimestamp = now - currentSec;
      presence.endTimestamp = presence.startTimestamp + durationSec;
    } else if (currentMovie && currentMovie.runtime) {
      const durationSec = currentMovie.runtime * 60;
      presence.startTimestamp = now;
      presence.endTimestamp = presence.startTimestamp + durationSec;
    } else if (currentMediaType === 'tv') {
      const durationSec = 45 * 60;
      presence.startTimestamp = now;
      presence.endTimestamp = presence.startTimestamp + durationSec;
    }
  }
  
  // Add buttons if GitHub URL is configured
  if (GITHUB_REPO_URL) {
    presence.buttons = [
      {
        label: 'Get CineStream',
        url: GITHUB_REPO_URL
      }
    ];
  }
  
  if (window.electronAPI && window.electronAPI.discordSetPresence) {
    window.electronAPI.discordSetPresence(presence);
  }
}

function clearDiscordPresence() {
  if (window.electronAPI && window.electronAPI.discordClearPresence) {
    window.electronAPI.discordClearPresence();
  }
}

// Setup video player event listeners for Discord Rich Presence and watch progress
let lastProgressSave = 0;
const PROGRESS_SAVE_INTERVAL = 10000; // Save every 10 seconds

function setupDiscordPresenceListeners() {
  if (!videoPlayer) {
    console.warn('Video player not found, Discord RPC listeners not set up');
    return;
  }
  
  videoPlayer.addEventListener('play', () => {
    // Small delay to ensure duration is available
    setTimeout(() => updateDiscordPresence('playing'), 500);
  });
  
  videoPlayer.addEventListener('pause', () => {
    updateDiscordPresence('paused');
    saveWatchProgress(); // Save progress on pause
  });
  
  videoPlayer.addEventListener('ended', () => {
    setDiscordBrowsing();
    removeWatchProgress(currentMovie?.id, currentMediaType); // Remove when finished
  });
  
  // Update countdown when user seeks in the video
  videoPlayer.addEventListener('seeked', () => {
    if (!videoPlayer.paused) {
      updateDiscordPresence('playing');
    }
    saveWatchProgress(); // Save progress after seeking
  });
  
  // Update presence when duration becomes available
  videoPlayer.addEventListener('durationchange', () => {
    if (!videoPlayer.paused && videoPlayer.duration > 0) {
      updateDiscordPresence('playing');
    }
  });
  
  // Throttled progress saving during playback
  videoPlayer.addEventListener('timeupdate', () => {
    const now = Date.now();
    if (now - lastProgressSave > PROGRESS_SAVE_INTERVAL) {
      saveWatchProgress();
      lastProgressSave = now;
    }
    
    // Check if we should show next episode button (last 5 minutes for TV shows)
    checkNextEpisodeButton();
  });
}

// ==================== NEXT EPISODE BUTTON ====================

function getNextEpisode() {
  if (!currentMovie || currentMediaType !== 'tv') return null;
  
  const seasons = currentMovie.seasons?.filter(s => s.season_number > 0 && s.episode_count > 0) || [];
  const currentSeasonObj = seasons.find(s => s.season_number === currentSeason);
  
  // Check if there's a next episode in the same season
  if (currentSeasonObj && currentEpisode < currentSeasonObj.episode_count) {
    return {
      season: currentSeason,
      episode: currentEpisode + 1
    };
  }
  
  // Check if there's a next season
  const currentSeasonIndex = seasons.findIndex(s => s.season_number === currentSeason);
  if (currentSeasonIndex >= 0 && currentSeasonIndex < seasons.length - 1) {
    const nextSeason = seasons[currentSeasonIndex + 1];
    return {
      season: nextSeason.season_number,
      episode: 1
    };
  }
  
  // No next episode
  return null;
}

function checkNextEpisodeButton() {
  const nextEpisodeBtn = document.getElementById('next-episode-btn');
  if (!nextEpisodeBtn || !videoPlayer || !videoPlayer.duration) return;
  
  // Only show for TV shows
  if (currentMediaType !== 'tv') {
    nextEpisodeBtn.classList.add('hidden');
    return;
  }
  
  // Check if there's a next episode
  const nextEpisode = getNextEpisode();
  if (!nextEpisode) {
    nextEpisodeBtn.classList.add('hidden');
    return;
  }
  
  // Show button if we're in the last 5 minutes (300 seconds)
  const timeRemaining = videoPlayer.duration - videoPlayer.currentTime;
  if (timeRemaining <= 300 && timeRemaining > 0) {
    nextEpisodeBtn.classList.remove('hidden');
  } else {
    nextEpisodeBtn.classList.add('hidden');
  }
}

// Next episode button click handler (set up after DOM is ready)
function setupNextEpisodeButton() {
  const nextEpisodeBtn = document.getElementById('next-episode-btn');
  if (nextEpisodeBtn) {
    nextEpisodeBtn.addEventListener('click', async () => {
      const nextEpisode = getNextEpisode();
      if (!nextEpisode) return;
      
      // Hide button immediately
      nextEpisodeBtn.classList.add('hidden');
      
      // Load the next episode
      await loadSelectedEpisode(nextEpisode.season, nextEpisode.episode);
      
      // Play the episode
      const playBtn = document.getElementById('play-button');
      if (playBtn) {
        playBtn.click();
      }
    });
  }
}

// Initialize Discord Rich Presence listeners and next episode button (after DOM is ready)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setupDiscordPresenceListeners();
    setupNextEpisodeButton();
    setDiscordBrowsing(); // Show browsing status on app start
  });
} else {
  setupDiscordPresenceListeners();
  setupNextEpisodeButton();
  setDiscordBrowsing(); // Show browsing status on app start
}

// ==================== CONTEXT MENU ====================

let contextMenuData = null;

function showContextMenu(event, itemId, mediaType, isContinueWatching = false, listType = null) {
  event.preventDefault();
  event.stopPropagation();
  
  const contextMenu = document.getElementById('context-menu');
  const addFavoriteItem = document.getElementById('context-add-favorite');
  const removeFavoriteItem = document.getElementById('context-remove-favorite');
  const addWatchlistItem = document.getElementById('context-add-watchlist');
  const removeWatchlistItem = document.getElementById('context-remove-watchlist');
  const removeContinueItem = document.getElementById('context-remove-continue');
  
  // Reset all items
  addFavoriteItem.classList.add('hidden');
  removeFavoriteItem.classList.add('hidden');
  addWatchlistItem.classList.add('hidden');
  removeWatchlistItem.classList.add('hidden');
  removeContinueItem.classList.add('hidden');
  
  // Show appropriate options based on context
  if (listType === 'favorites') {
    // In favorites list - show remove option
    removeFavoriteItem.classList.remove('hidden');
    addWatchlistItem.classList.remove('hidden'); // Can still add to watchlist
  } else if (listType === 'watchlist') {
    // In watchlist - show remove option
    removeWatchlistItem.classList.remove('hidden');
    addFavoriteItem.classList.remove('hidden'); // Can still add to favorites
  } else {
    // Not in a list - show add options
    addFavoriteItem.classList.remove('hidden');
    addWatchlistItem.classList.remove('hidden');
  }
  
  // Show remove from continue watching if applicable
  if (isContinueWatching) {
    removeContinueItem.classList.remove('hidden');
  }
  
  // Store context data
  contextMenuData = {
    id: itemId,
    mediaType: mediaType,
    isContinueWatching: isContinueWatching,
    listType: listType
  };
  
  // Position menu at cursor
  const x = event.clientX;
  const y = event.clientY;
  
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  
  // Ensure menu stays within viewport
  contextMenu.classList.remove('hidden');
  
  // Adjust position if menu would overflow
  setTimeout(() => {
    const rect = contextMenu.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    if (rect.right > windowWidth) {
      contextMenu.style.left = `${windowWidth - rect.width - 10}px`;
    }
    if (rect.bottom > windowHeight) {
      contextMenu.style.top = `${windowHeight - rect.height - 10}px`;
    }
  }, 0);
}

function hideContextMenu() {
  const contextMenu = document.getElementById('context-menu');
  contextMenu.classList.add('hidden');
  contextMenuData = null;
}

// Handle context menu actions
document.getElementById('context-menu').addEventListener('click', async (e) => {
  const action = e.target.closest('.context-menu-item')?.dataset.action;
  if (!action || !contextMenuData) return;
  
  e.stopPropagation();
  
  const { id, mediaType, isContinueWatching, listType } = contextMenuData;
  
  // Temporarily set currentMediaType for the action
  const originalMediaType = currentMediaType;
  currentMediaType = mediaType;
  
  try {
    switch (action) {
      case 'favorite':
        // Check current state first
        if (isLoggedIn()) {
          const state = await getMovieAccountState(id);
          await toggleFavorite(id, !state?.favorite);
        } else {
          showLoginModal();
        }
        break;
        
      case 'remove-favorite':
        if (isLoggedIn()) {
          await toggleFavorite(id, false);
          // Refresh favorites list
          if (listType === 'favorites') {
            loadListContent('favorites');
          }
        }
        break;
        
      case 'watchlist':
        if (isLoggedIn()) {
          const state = await getMovieAccountState(id);
          await toggleWatchlist(id, !state?.watchlist);
        } else {
          showLoginModal();
        }
        break;
        
      case 'remove-watchlist':
        if (isLoggedIn()) {
          await toggleWatchlist(id, false);
          // Refresh watchlist
          if (listType === 'watchlist') {
            loadListContent('watchlist');
          }
        }
        break;
        
      case 'remove-continue':
        if (isContinueWatching) {
          removeWatchProgress(id, mediaType);
          showToast('Removed from Continue Watching');
          // Refresh continue watching section
          loadContinueWatching();
        }
        break;
    }
  } catch (error) {
    console.error('Context menu action error:', error);
  } finally {
    currentMediaType = originalMediaType;
    hideContextMenu();
  }
});

// Close context menu on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('#context-menu')) {
    hideContextMenu();
  }
});

// Close context menu on scroll
document.addEventListener('scroll', hideContextMenu, true);

// Add right-click listeners to all card types
function setupContextMenuListeners() {
  // Homepage media cards
  document.addEventListener('contextmenu', (e) => {
    const card = e.target.closest('.media-card');
    if (card && !card.classList.contains('continue-watching-card')) {
      const id = card.dataset.id;
      const type = card.dataset.type;
      if (id && type) {
        showContextMenu(e, id, type, false);
      }
    }
  });
  
  // Continue watching cards
  document.addEventListener('contextmenu', (e) => {
    const card = e.target.closest('.continue-watching-card');
    if (card) {
      const id = card.dataset.id;
      const type = card.dataset.type;
      if (id && type) {
        showContextMenu(e, id, type, true);
      }
    }
  });
  
  // Search result items (sidebar - watchlist/favorites/rated lists)
  document.addEventListener('contextmenu', (e) => {
    const item = e.target.closest('.search-result-item');
    if (item) {
      const id = item.dataset.id;
      const type = item.dataset.type;
      const listType = item.dataset.listType; // 'favorites', 'watchlist', or 'rated'
      if (id && type) {
        showContextMenu(e, id, type, false, listType || null);
      }
    }
  });
  
  // Search cards (grid view)
  document.addEventListener('contextmenu', (e) => {
    const card = e.target.closest('.search-card');
    if (card) {
      const id = card.dataset.id;
      const type = card.dataset.type;
      if (id && type) {
        showContextMenu(e, id, type, false);
      }
    }
  });
}

// Initialize context menu listeners
setupContextMenuListeners();

// Load saved session on startup
loadSession();

// Show homepage and load content on startup
showHomepage();
loadHomepage();


// ==================== MOBILE-SPECIFIC IMPROVEMENTS ====================

// Prevent zoom on input focus (iOS Safari)
if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
  const inputs = document.querySelectorAll('input[type="text"], input[type="search"], textarea');
  inputs.forEach(input => {
    if (input.style.fontSize !== '16px') {
      input.style.fontSize = '16px';
    }
  });
}

// Improve touch scrolling
if ('ontouchstart' in window) {
  document.body.style.webkitOverflowScrolling = 'touch';
  
  // Add touch-friendly class
  document.body.classList.add('touch-device');
  
  // Prevent double-tap zoom on buttons
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  }, false);
}

// Handle orientation change
let orientationTimeout;
window.addEventListener('orientationchange', () => {
  clearTimeout(orientationTimeout);
  orientationTimeout = setTimeout(() => {
    // Force a repaint to fix layout issues
    window.scrollTo(0, 0);
    if (videoPlayer && !videoPlayer.paused) {
      // Pause and resume video to fix fullscreen issues
      const wasPlaying = !videoPlayer.paused;
      videoPlayer.pause();
      setTimeout(() => {
        if (wasPlaying) videoPlayer.play();
      }, 100);
    }
  }, 100);
});

