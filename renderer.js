// API Configuration
// Get your free TMDB API key at: https://www.themoviedb.org/settings/api
const TMDB_API_KEY = '111909b8747aeff1169944069465906c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
const STREAMS_API_BASE = 'https://tlo.sh/mvsapi/api/streams';

// OpenSubtitles API (Optional) - Get your free API key at: https://www.opensubtitles.com/consumers
const OPENSUBTITLES_API_KEY = ''; // Leave empty to use Subdl fallback, or add your OpenSubtitles API key
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
    const tokenResponse = await fetch(
      `${TMDB_BASE_URL}/authentication/token/new?api_key=${TMDB_API_KEY}`
    );
    const tokenData = await tokenResponse.json();
    
    if (!tokenData.success) throw new Error('Failed to get request token');
    
    tmdbSession.requestToken = tokenData.request_token;
    
    // Step 2: Open TMDB auth page in browser
    const authUrl = `https://www.themoviedb.org/authenticate/${tokenData.request_token}`;
    window.electronAPI.openExternal(authUrl);
    
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
    const sessionResponse = await fetch(
      `${TMDB_BASE_URL}/authentication/session/new?api_key=${TMDB_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_token: tmdbSession.requestToken })
      }
    );
    const sessionData = await sessionResponse.json();
    
    if (!sessionData.success) {
      throw new Error('Please approve the request on TMDB first');
    }
    
    tmdbSession.sessionId = sessionData.session_id;
    
    // Step 4: Get account details
    const accountResponse = await fetch(
      `${TMDB_BASE_URL}/account?api_key=${TMDB_API_KEY}&session_id=${tmdbSession.sessionId}`
    );
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

async function toggleFavorite(movieId, add = true) {
  if (!isLoggedIn()) {
    showLoginModal();
    return;
  }
  
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/account/${tmdbSession.accountId}/favorite?api_key=${TMDB_API_KEY}&session_id=${tmdbSession.sessionId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'movie',
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

async function toggleWatchlist(movieId, add = true) {
  if (!isLoggedIn()) {
    showLoginModal();
    return;
  }
  
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/account/${tmdbSession.accountId}/watchlist?api_key=${TMDB_API_KEY}&session_id=${tmdbSession.sessionId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'movie',
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

async function rateMovie(movieId, rating) {
  if (!isLoggedIn()) {
    showLoginModal();
    return;
  }
  
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/movie/${movieId}/rating?api_key=${TMDB_API_KEY}&session_id=${tmdbSession.sessionId}`,
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
      if (currentTab === 'rated') loadListContent('rated');
    }
  } catch (error) {
    console.error('Rating error:', error);
    showToast('Failed to submit rating');
  }
}

async function deleteRating(movieId) {
  if (!isLoggedIn()) return;
  
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/movie/${movieId}/rating?api_key=${TMDB_API_KEY}&session_id=${tmdbSession.sessionId}`,
      { method: 'DELETE' }
    );
    const data = await response.json();
    
    if (data.success) {
      showToast('Rating removed');
      hideRatingModal();
      updateMovieAccountState();
      if (currentTab === 'rated') loadListContent('rated');
    }
  } catch (error) {
    console.error('Delete rating error:', error);
    showToast('Failed to remove rating');
  }
}

async function getMovieAccountState(movieId) {
  if (!isLoggedIn()) return null;
  
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/movie/${movieId}/account_states?api_key=${TMDB_API_KEY}&session_id=${tmdbSession.sessionId}`
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
    let url;
    switch (listType) {
      case 'favorites':
        url = `${TMDB_BASE_URL}/account/${tmdbSession.accountId}/favorite/movies?api_key=${TMDB_API_KEY}&session_id=${tmdbSession.sessionId}`;
        break;
      case 'watchlist':
        url = `${TMDB_BASE_URL}/account/${tmdbSession.accountId}/watchlist/movies?api_key=${TMDB_API_KEY}&session_id=${tmdbSession.sessionId}`;
        break;
      case 'rated':
        url = `${TMDB_BASE_URL}/account/${tmdbSession.accountId}/rated/movies?api_key=${TMDB_API_KEY}&session_id=${tmdbSession.sessionId}`;
        break;
    }
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      displayListResults(listType, data.results);
    } else {
      showListEmpty(listType);
    }
  } catch (error) {
    console.error(`Load ${listType} error:`, error);
    showListEmpty(listType, 'Failed to load');
  }
}

function displayListResults(listType, movies) {
  const listEl = document.getElementById(`${listType}-list`);
  
  listEl.innerHTML = movies.map(movie => {
    const title = escapeHtml(movie.title || 'Unknown Title');
    const year = movie.release_date ? movie.release_date.split('-')[0] : 'Unknown';
    const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';
    const userRating = movie.rating ? ` • ★ ${movie.rating}` : '';
    const poster = movie.poster_path 
      ? `${TMDB_IMAGE_BASE}/w92${movie.poster_path}`
      : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 92 138"%3E%3Crect fill="%231a1a2e" width="92" height="138"/%3E%3C/svg%3E';
    
    return `
      <div class="search-result-item" data-id="${movie.id}">
        <img class="result-poster" src="${poster}" alt="">
        <div class="result-info">
          <h3>${title}</h3>
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
    item.addEventListener('click', () => loadMovie(item.dataset.id));
  });
}

function showListEmpty(listType, message = null) {
  const listEl = document.getElementById(`${listType}-list`);
  const icons = {
    favorites: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    watchlist: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    rated: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'
  };
  const defaultMessages = {
    favorites: 'No favorites yet',
    watchlist: 'Watchlist is empty',
    rated: 'No rated movies'
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
  
  // Show/hide content based on tab
  document.getElementById('favorites-list').classList.toggle('hidden', tabName !== 'favorites');
  document.getElementById('watchlist-list').classList.toggle('hidden', tabName !== 'watchlist');
  document.getElementById('rated-list').classList.toggle('hidden', tabName !== 'rated');
  
  // Handle home tab - show homepage
  if (tabName === 'home') {
    showHomepage();
  } else {
    // Load list content for other tabs
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
      `${TMDB_BASE_URL}/${mediaType}/${mediaId}/credits?api_key=${TMDB_API_KEY}`
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
      fetch(`${TMDB_BASE_URL}/person/${personId}?api_key=${TMDB_API_KEY}`),
      fetch(`${TMDB_BASE_URL}/person/${personId}/combined_credits?api_key=${TMDB_API_KEY}`)
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

// Sidebar Toggle
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menu-toggle');

menuToggle.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  menuToggle.classList.toggle('active');
});

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
      endpoint = `${TMDB_BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1`;
    } else {
      endpoint = `${TMDB_BASE_URL}/search/${currentSearchFilter}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1`;
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
  
  if (!results || results.length === 0) {
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
  
  container.innerHTML = results.map(item => {
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
  
  // Clear existing text tracks
  while (videoPlayer.firstChild) {
    videoPlayer.removeChild(videoPlayer.firstChild);
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
        
        // Check for subtitle tracks in the manifest
        if (hlsInstance.subtitleTracks && hlsInstance.subtitleTracks.length > 0) {
          updateSubtitleSelector(hlsInstance.subtitleTracks, 'hls');
        } else if (currentSubtitles.length > 0) {
          // Use subtitles from stream API
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
    } else {
      showError('Playback Error', 'Your browser does not support HLS playback.');
    }
  } else {
    // Regular video file
    videoPlayer.src = streamUrl;
    videoPlayer.play().catch(console.error);
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
        `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`
      );
      const externalIds = await externalIdsResponse.json();
      imdbId = externalIds.imdb_id;
      } catch (e) {
      // Could not get IMDB ID
    }
    
    // Use IPC to fetch subtitles from main process (bypasses CORS)
    const subtitles = await window.electronAPI.fetchSubtitles({
      type: mediaType,
      tmdbId: tmdbId,
      imdbId: imdbId,
      apiKey: OPENSUBTITLES_API_KEY,
      season: season,
      episode: episode
    });
    
    return subtitles || [];
  } catch (error) {
    console.error('Subtitle fetch error:', error);
    return [];
  }
}

function updateSubtitleSelector(tracks, sourceType) {
  const selector = document.getElementById('subtitle-selector');
  const container = document.getElementById('subtitle-controls');
  
  if (!selector || !container) return;
  
  if (!tracks || tracks.length === 0) {
    container.classList.add('hidden');
    return;
  }
  
  container.classList.remove('hidden');
  
  let options = '<option value="-1">Off</option>';
  
  tracks.forEach((track, idx) => {
    const label = track.name || track.label || track.language || track.lang || `Track ${idx + 1}`;
    const langCode = track.lang || track.language || '';
    options += `<option value="${idx}" data-source="${sourceType}">${label}${langCode ? ` (${langCode})` : ''}</option>`;
  });
  
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
    
    // Set first track as default and showing
    if (idx === 0) {
      track.default = true;
    }
    
    videoPlayer.appendChild(track);
  }
  
  // Enable the first subtitle track
  if (videoPlayer.textTracks.length > 0) {
    videoPlayer.textTracks[0].mode = 'showing';
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

// Settings panel toggle
document.getElementById('subtitle-settings-btn')?.addEventListener('click', () => {
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
  playerContainer.classList.add('hidden');
  loadingState.classList.add('hidden');
  errorState.classList.add('hidden');
}

function showHomepage() {
  hideAllStates();
  homepage.classList.remove('hidden');
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

// ==================== HOMEPAGE ====================

async function loadHomepage() {
  // Load all categories in parallel
  await Promise.all([
    loadCategory('movies-top-rated', 'movie', 'top_rated'),
    loadCategory('movies-popular', 'movie', 'popular'),
    loadCategory('movies-new', 'movie', 'now_playing'),
    loadCategory('tv-top-rated', 'tv', 'top_rated'),
    loadCategory('tv-popular', 'tv', 'popular'),
    loadCategory('tv-new', 'tv', 'on_the_air'),
    loadPopularPeople()
  ]);
}

async function loadPopularPeople() {
  const container = document.getElementById('people-popular');
  if (!container) return;
  
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/person/popular?api_key=${TMDB_API_KEY}&page=1`
    );
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      renderPeopleCards(container, data.results.slice(0, 12));
    } else {
      container.innerHTML = '<p class="no-content">No content available</p>';
    }
  } catch (error) {
    console.error('Failed to load popular people:', error);
    container.innerHTML = '<p class="no-content">Failed to load</p>';
  }
}

function renderPeopleCards(container, people) {
  container.innerHTML = people.map(person => {
    const name = escapeHtml(person.name || 'Unknown');
    const knownFor = person.known_for_department || 'Acting';
    const photo = person.profile_path 
      ? `${TMDB_IMAGE_BASE}/w342${person.profile_path}`
      : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 342 513"%3E%3Crect fill="%231a1a2e" width="342" height="513"/%3E%3Ccircle cx="171" cy="180" r="80" fill="%232a2a4a"/%3E%3Cellipse cx="171" cy="420" rx="120" ry="90" fill="%232a2a4a"/%3E%3C/svg%3E';
    
    return `
      <div class="person-card" data-id="${person.id}">
        <div class="person-card-photo-wrapper">
          <img class="person-card-photo" src="${photo}" alt="" loading="lazy">
          <div class="person-card-overlay">
            <span>View Profile</span>
          </div>
        </div>
        <div class="person-card-info">
          <h4 class="person-card-name">${name}</h4>
          <span class="person-card-dept">${knownFor}</span>
        </div>
      </div>
    `;
  }).join('');
  
  // Add click handlers
  container.querySelectorAll('.person-card').forEach(card => {
    card.addEventListener('click', () => {
      loadPerson(card.dataset.id);
    });
  });
}

async function loadCategory(containerId, mediaType, category) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/${mediaType}/${category}?api_key=${TMDB_API_KEY}&page=1`
    );
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      renderCards(container, data.results.slice(0, 10), mediaType);
    } else {
      container.innerHTML = '<p class="no-content">No content available</p>';
    }
  } catch (error) {
    console.error(`Failed to load ${category}:`, error);
    container.innerHTML = '<p class="no-content">Failed to load</p>';
  }
}

function renderCards(container, items, mediaType) {
  container.innerHTML = items.map(item => {
    const title = escapeHtml(item.title || item.name || 'Unknown');
    const year = (item.release_date || item.first_air_date || '').split('-')[0] || '';
    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
    const poster = item.poster_path 
      ? `${TMDB_IMAGE_BASE}/w342${item.poster_path}`
      : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 342 513"%3E%3Crect fill="%231a1a2e" width="342" height="513"/%3E%3C/svg%3E';
    
    return `
      <div class="media-card" data-id="${item.id}" data-type="${mediaType}">
        <div class="card-poster-wrapper">
          <img class="card-poster" src="${poster}" alt="" loading="lazy">
          <div class="card-trailer" data-id="${item.id}" data-type="${mediaType}">
            <video class="trailer-video" muted loop></video>
            <div class="trailer-loading">
              <div class="loader-small"></div>
            </div>
          </div>
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
        </div>
        <div class="card-info">
          <h4 class="card-title">${title}</h4>
          <span class="card-year">${year}</span>
        </div>
      </div>
    `;
  }).join('');
  
  // Add event listeners to cards
  container.querySelectorAll('.media-card').forEach(card => {
    const id = card.dataset.id;
    const type = card.dataset.type;
    
    // Click to view details
    card.addEventListener('click', () => {
      loadMedia(id, type);
    });
    
    // Hover for trailer preview
    let hoverTimeout;
    card.addEventListener('mouseenter', () => {
      hoverTimeout = setTimeout(() => {
        loadTrailerPreview(card, id, type);
      }, 500); // Delay before loading trailer
    });
    
    card.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimeout);
      stopTrailerPreview(card);
    });
  });
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
    // Fetch details from TMDB
    const response = await fetch(
      `${TMDB_BASE_URL}/${mediaType}/${id}?api_key=${TMDB_API_KEY}`
    );
    
    if (!response.ok) throw new Error('Failed to load details');
    
    const media = await response.json();
    currentMovie = media;
    
    // Fetch stream info
    showLoading('Fetching stream...');
    
    // Build stream URL - TV shows need season/episode
    let streamUrl;
    if (mediaType === 'tv') {
      // Default to season 1 episode 1
      currentSeason = 1;
      currentEpisode = 1;
      streamUrl = `${STREAMS_API_BASE}/tv/${id}/${currentSeason}/${currentEpisode}`;
    } else {
      streamUrl = `${STREAMS_API_BASE}/movie/${id}`;
    }
    
    const streamResponse = await fetch(streamUrl);
    
    let streamData = null;
    if (streamResponse.ok) {
      streamData = await streamResponse.json();
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
  
  // Handle episode selector for TV shows
  const episodeSelector = document.getElementById('episode-selector');
  if (mediaType === 'tv' && media.seasons) {
    episodeSelector.classList.remove('hidden');
    populateSeasonSelector(media);
  } else {
    episodeSelector.classList.add('hidden');
  }
  
  // Process streams (reuse existing stream handling)
  processStreams(streamData);
  
  // Load cast
  loadCast(media.id, mediaType);
  
  // Update account state
  updateMovieAccountState();
}

function populateSeasonSelector(media) {
  const seasonSelect = document.getElementById('season-select');
  const episodeSelect = document.getElementById('episode-select');
  
  // Filter out "Specials" (season 0) and seasons with no episodes
  const validSeasons = media.seasons?.filter(s => s.season_number > 0 && s.episode_count > 0) || [];
  
  // Populate seasons
  seasonSelect.innerHTML = validSeasons.map(season => 
    `<option value="${season.season_number}" data-episodes="${season.episode_count}">
      Season ${season.season_number}
    </option>`
  ).join('');
  
  // Set current season
  seasonSelect.value = currentSeason;
  
  // Populate episodes for selected season
  updateEpisodeSelector();
}

function updateEpisodeSelector() {
  const seasonSelect = document.getElementById('season-select');
  const episodeSelect = document.getElementById('episode-select');
  const selectedOption = seasonSelect.selectedOptions[0];
  
  if (!selectedOption) return;
  
  const episodeCount = parseInt(selectedOption.dataset.episodes) || 10;
  
  episodeSelect.innerHTML = Array.from({ length: episodeCount }, (_, i) => 
    `<option value="${i + 1}">Episode ${i + 1}</option>`
  ).join('');
  
  // Set current episode (reset to 1 if switching seasons)
  episodeSelect.value = currentEpisode <= episodeCount ? currentEpisode : 1;
}

async function loadSelectedEpisode() {
  if (!currentMovie || currentMediaType !== 'tv') return;
  
  const seasonSelect = document.getElementById('season-select');
  const episodeSelect = document.getElementById('episode-select');
  
  currentSeason = parseInt(seasonSelect.value);
  currentEpisode = parseInt(episodeSelect.value);
  
  showLoading(`Loading S${currentSeason}E${currentEpisode}...`);
  
  try {
    const streamUrl = `${STREAMS_API_BASE}/tv/${currentMovie.id}/${currentSeason}/${currentEpisode}`;
    const streamResponse = await fetch(streamUrl);
    
    let streamData = null;
    if (streamResponse.ok) {
      streamData = await streamResponse.json();
    }
    
    // Show details again and update streams
    hideAllStates();
    movieDetails.classList.remove('hidden');
    processStreams(streamData);
    
    // Update play button to show current episode
    const playBtnText = document.querySelector('#play-button span');
    playBtnText.textContent = `Play S${currentSeason}E${currentEpisode}`;
    
    showToast(`Loaded Season ${currentSeason} Episode ${currentEpisode}`);
  } catch (error) {
    console.error('Load episode error:', error);
    showToast('Failed to load episode');
    hideAllStates();
    movieDetails.classList.remove('hidden');
  }
}

// Episode selector event listeners
document.getElementById('season-select')?.addEventListener('change', () => {
  currentEpisode = 1; // Reset episode when changing season
  updateEpisodeSelector();
});

document.getElementById('load-episode-btn')?.addEventListener('click', loadSelectedEpisode);

function processStreams(streamData) {
  const streamInfo = document.getElementById('stream-info');
  const playButton = document.getElementById('play-button');
  
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
      </div>
    `;
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

// Setup video player event listeners for Discord Rich Presence
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
  });
  
  videoPlayer.addEventListener('ended', () => {
    setDiscordBrowsing();
  });
  
  // Update countdown when user seeks in the video
  videoPlayer.addEventListener('seeked', () => {
    if (!videoPlayer.paused) {
      updateDiscordPresence('playing');
    }
  });
  
  // Update presence when duration becomes available
  videoPlayer.addEventListener('durationchange', () => {
    if (!videoPlayer.paused && videoPlayer.duration > 0) {
      updateDiscordPresence('playing');
    }
  });
}

// Initialize Discord Rich Presence listeners (after DOM is ready)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setupDiscordPresenceListeners();
    setDiscordBrowsing(); // Show browsing status on app start
  });
} else {
  setupDiscordPresenceListeners();
  setDiscordBrowsing(); // Show browsing status on app start
}

// Load saved session on startup
loadSession();

// Load homepage content
loadHomepage();

