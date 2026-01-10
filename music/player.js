/* ========= CONFIGURATION ========= */
const MUSIC_FOLDER = "https://2321564369.github.io/galaxy-test/MUSIC/";
const GITHUB_API_URL = "https://api.github.com/repos/2321564369/galaxy-test/contents/MUSIC";
const CACHE_NAME = 'galaxy-music-cache-v1';

/* ========= SONG DATA ========= */
var songs = [];
var coverFilesCache = null;

/* ========= STATE ========= */
var currentSongs = [];
var index = 0;
var shuffle = false;
var autoplay = false;
var currentSongId = null;
var liked = JSON.parse(localStorage.getItem("likedSongs")) || [];
var playlists = JSON.parse(localStorage.getItem("playlists")) || {};
var currentPlaylist = null;
var playlistToDelete = null;
var isCaching = false;
var cacheProgress = 0;
var totalToCache = 0;

/* ========= ELEMENTS ========= */
var audio = document.getElementById("audio");
var list = document.getElementById("songList");
var cover = document.getElementById("cover");
var now = document.getElementById("nowPlaying");
var progress = document.getElementById("progress");
var volume = document.getElementById("volume");
var timeText = document.getElementById("timeText");
var sortSelect = document.getElementById("sortSelect");
var playlistOptions = document.getElementById("playlistOptions");
var playerHeartBtn = document.getElementById("playerHeartBtn");
var viewTitle = document.getElementById("viewTitle");
var deletePlaylistMessage = document.getElementById("deletePlaylistMessage");
var connectionStatus = document.getElementById("connectionStatus");

/* ========= OFFLINE CACHING SYSTEM ========= */
async function initCache() {
  if (!('caches' in window)) {
    console.log('Cache API not supported');
    return null;
  }
  
  try {
    const cache = await caches.open(CACHE_NAME);
    return cache;
  } catch (error) {
    console.error('Failed to open cache:', error);
    return null;
  }
}

async function cacheSong(song) {
  try {
    const cache = await initCache();
    if (!cache) return false;
    
    // Check if song is already cached
    const cachedResponse = await cache.match(song.file);
    if (cachedResponse) {
      return true;
    }
    
    // Try different URL formats
    let response = null;
    const urlsToTry = [
      song.file,
      song.file.replace('raw.githubusercontent.com/2321564369/galaxy-test/main/MUSIC/', 'https://2321564369.github.io/galaxy-test/MUSIC/'),
      song.file.replace('https://raw.githubusercontent.com/', 'https://2321564369.github.io/galaxy-test/MUSIC/').replace('/2321564369/galaxy-test/main/MUSIC/', '')
    ];
    
    for (const url of urlsToTry) {
      try {
        response = await fetch(url, { 
          mode: 'cors',
          credentials: 'omit'
        });
        if (response.ok) {
          await cache.put(song.file, response.clone());
          console.log(`Cached: ${song.title} from ${url}`);
          return true;
        }
      } catch (err) {
        continue;
      }
    }
    
    return false;
  } catch (error) {
    console.error(`Failed to cache ${song.title}:`, error);
    return false;
  }
}

async function getCachedSong(song) {
  try {
    const cache = await initCache();
    if (!cache) return null;
    
    // Try multiple URL patterns
    const urlsToTry = [
      song.file,
      song.file.replace('raw.githubusercontent.com/2321564369/galaxy-test/main/MUSIC/', 'https://2321564369.github.io/galaxy-test/MUSIC/')
    ];
    
    for (const url of urlsToTry) {
      const cachedResponse = await cache.match(url);
      if (cachedResponse) {
        console.log(`Playing from cache: ${song.title} (${url})`);
        return await cachedResponse.blob();
      }
    }
    return null;
  } catch (error) {
    console.error(`Failed to get cached song ${song.title}:`, error);
    return null;
  }
}

async function isSongCached(song) {
  try {
    const cache = await initCache();
    if (!cache) return false;
    
    // Check both URL patterns
    const urlsToTry = [
      song.file,
      song.file.replace('raw.githubusercontent.com/2321564369/galaxy-test/main/MUSIC/', 'https://2321564369.github.io/galaxy-test/MUSIC/')
    ];
    
    for (const url of urlsToTry) {
      const cachedResponse = await cache.match(url);
      if (cachedResponse) return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

async function cacheAllSongsBackground(songList) {
  if (isCaching || songList.length === 0) return;
  
  isCaching = true;
  totalToCache = songList.length;
  cacheProgress = 0;
  
  console.log(`Starting background cache of ${totalToCache} songs...`);
  
  // Cache songs one by one
  for (let i = 0; i < songList.length; i++) {
    if (!isCaching) break;
    
    const song = songList[i];
    const success = await cacheSong(song);
    
    if (success) {
      cacheProgress++;
      song.cached = true;
      
      // Update every 5 songs or at the end
      if (cacheProgress % 5 === 0 || cacheProgress === totalToCache) {
        updateCachedSongsUI();
        console.log(`Caching progress: ${cacheProgress}/${totalToCache}`);
      }
    }
    
    // Small delay to prevent overwhelming
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  isCaching = false;
  console.log(`Background caching complete: ${cacheProgress}/${totalToCache} songs cached`);
  
  // Final update
  updateCachedSongsUI();
  saveSongsToCache();
}

function updateCachedSongsUI() {
  // Update view title
  const cachedCount = songs.filter(s => s.cached).length;
  if (currentPlaylist === null) {
    const total = songs.length;
    if (cachedCount === total && total > 0) {
      viewTitle.innerText = `All Songs (${total}) ✅`;
    } else if (cachedCount > 0) {
      viewTitle.innerText = `All Songs (${total}) 📥 ${cachedCount}/${total}`;
    } else {
      viewTitle.innerText = `All Songs (${total})`;
    }
  }
  
  // Update song list if we're viewing all songs
  if (currentPlaylist === null) {
    renderSongs(currentSongs);
  }
}

async function clearCache() {
  try {
    if ('caches' in window) {
      await caches.delete(CACHE_NAME);
    }
    // Reset cache status for all songs
    songs.forEach(song => {
      song.cached = false;
    });
    updateCachedSongsUI();
    saveSongsToCache();
    return true;
  } catch (error) {
    console.error("Failed to clear cache:", error);
    return false;
  }
}

function updateConnectionStatus() {
  if (!connectionStatus) return;
  
  if (navigator.onLine) {
    connectionStatus.className = 'connection-status online';
    connectionStatus.innerHTML = '🌐 Online';
  } else {
    connectionStatus.className = 'connection-status offline';
    connectionStatus.innerHTML = '📶 Offline';
    
    // Update view title for offline mode
    if (currentPlaylist === null) {
      const cachedCount = songs.filter(s => s.cached).length;
      const total = songs.length;
      viewTitle.innerText = `All Songs (${cachedCount}/${total} available offline)`;
    }
  }
}

/* ========= FILENAME PARSING ========= */
function parseFilename(filename) {
  const name = filename.replace(/\.mp3$/i, '');
  
  let artist = "Unknown Artist";
  let title = name;
  let album = "Unknown";
  
  if (name.includes(' - ')) {
    const parts = name.split(' - ');
    artist = parts[0].trim();
    const rest = parts.slice(1).join(' - ');
    
    const parenMatch = rest.match(/\(([^)]+)\)/);
    if (parenMatch) {
      album = parenMatch[1].trim();
      title = rest.replace(parenMatch[0], '').trim();
    } else {
      title = rest.trim();
    }
  } else {
    const parenMatch = name.match(/([^(]+)\s*\(([^)]+)\)/);
    if (parenMatch) {
      title = parenMatch[1].trim();
      album = parenMatch[2].trim();
    }
  }
  
  // Clean up common patterns
  if (artist === "Panic! At The Disco") title = "House of Memories";
  if (artist === "3 Doors Down") title = "Kryptonite";
  if (artist === "Drowning Pool") title = "Bodies";
  if (title.includes("Enter Sandman")) artist = "Metallica";
  if (title.includes("Master of Puppets")) artist = "Metallica";
  
  return { artist: artist.trim(), title: title.trim(), album: album.trim() };
}

/* ========= COVER ART SYSTEM ========= */
async function scanForCoverFiles() {
  try {
    const response = await fetch(GITHUB_API_URL);
    const files = await response.json();
    
    coverFilesCache = files
      .filter(file => {
        const name = file.name.toLowerCase();
        return name.endsWith('.png') || 
               name.endsWith('.jpg') || 
               name.endsWith('.jpeg') ||
               name.endsWith('.webp') ||
               name.endsWith('.gif');
      })
      .map(file => file.name);
    
    return coverFilesCache;
  } catch (error) {
    console.error("Error scanning for cover files:", error);
    return [];
  }
}

function findCoverForSong(mp3Filename) {
  if (!coverFilesCache || coverFilesCache.length === 0) return null;
  
  const baseName = mp3Filename.replace(/\.mp3$/i, '').toLowerCase();
  
  const exactMatch = coverFilesCache.find(cover => {
    const coverBase = cover.replace(/\.[^.]+$/, '').toLowerCase();
    return coverBase === baseName;
  });
  
  if (exactMatch) return exactMatch;
  
  const partialMatch = coverFilesCache.find(cover => {
    const coverBase = cover.replace(/\.[^.]+$/, '').toLowerCase();
    return coverBase.includes(baseName) || baseName.includes(coverBase);
  });
  
  if (partialMatch) return partialMatch;
  
  const genericCovers = ['cover.png', 'cover.jpg', 'album.png', 'album.jpg', 'folder.png', 'folder.jpg'];
  for (const generic of genericCovers) {
    if (coverFilesCache.includes(generic)) {
      return generic;
    }
  }
  
  return null;
}

async function getCoverArt(artist, title, filename) {
  const coverFile = findCoverForSong(filename);
  if (coverFile) {
    return `https://raw.githubusercontent.com/2321564369/galaxy-test/main/MUSIC/${encodeURIComponent(coverFile)}`;
  }
  
  const coverMap = {
    "Panic! At The Disco": "https://i1.sndcdn.com/artworks-pmJKYkhBWgQ5wyEM-8y9l8A-t500x500.jpg",
    "3 Doors Down": "https://i1.sndcdn.com/artworks-000061461506-i53bjg-t500x500.jpg",
    "Drowning Pool": "https://i1.sndcdn.com/artworks-iWPxXTl6La9i-0-t500x500.jpg",
    "Metallica": "https://i1.sndcdn.com/artworks-000258189284-6xuusb-t500x500.jpg",
    "Limp Bizkit": "https://i1.sndcdn.com/artworks-UgqpwRjPcqZL-0-t500x500.jpg",
    "Papa Roach": "https://cdn-images.dzcdn.net/images/cover/dd426bbcdfda3442eeb286d87da26fa3/500x500.jpg",
    "Rick Astley": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTMNO_gNGIVzSfgd2rBoQVIepnVpinlrhaRqA&s",
    "Spiderbait": "https://m.media-amazon.com/images/I/51yf2z6ql4L._UXNaN_FMjpg_QL85_.jpg",
    "System Of A Down": "https://cdn-images.dzcdn.net/images/cover/6baa3ad626e859f67bbddae6528fd949/500x500.jpg",
    "_NSYNC": "https://cdn-images.dzcdn.net/images/cover/01fdca2ecf54d678ff005162b5b6cc92/500x500.jpg"
  };
  
  if (coverMap[artist]) {
    return coverMap[artist];
  }
  
  return generateColoredCover(artist);
}

function generateColoredCover(artist) {
  const colors = [
    ['#7c3aed', '#5b21b6'],
    ['#0ea5e9', '#0284c7'],
    ['#10b981', '#059669'],
    ['#f59e0b', '#d97706'],
    ['#ef4444', '#dc2626'],
  ];
  
  const colorSet = colors[artist.length % colors.length];
  const initials = artist
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 3);
  
  return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${colorSet[0]};stop-opacity:1" />
        <stop offset="100%" style="stop-color:${colorSet[1]};stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="500" height="500" fill="url(#grad)"/>
    <text x="250" y="250" font-family="Arial" font-size="80" 
          fill="white" text-anchor="middle" dy=".3em" font-weight="bold">
      ${initials}
    </text>
  </svg>`;
}

/* ========= GITHUB API SCAN ========= */
async function scanWithGitHubAPI() {
  console.log("Scanning with GitHub API...");
  viewTitle.innerText = "Scanning GitHub...";
  list.innerHTML = '<div class="empty"><div class="spinner"></div><p>Scanning music folder...</p></div>';
  
  try {
    const response = await fetch(GITHUB_API_URL, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
    
    const files = await response.json();
    
    const mp3Files = files
      .filter(file => file.type === "file" && file.name.toLowerCase().endsWith('.mp3'))
      .map(file => file.name);
    
    console.log("Found MP3 files:", mp3Files);
    
    if (mp3Files.length > 0) {
      await scanForCoverFiles();
      await loadSongsFromList(mp3Files);
    } else {
      console.warn("No MP3 files found via GitHub API");
      useCachedSongs();
    }
    
  } catch (error) {
    console.error("GitHub API scan failed:", error);
    tryCommonFiles();
  }
}

async function loadSongsFromList(fileList) {
  console.log(`Loading ${fileList.length} songs from list...`);
  
  const loadedSongs = [];
  let loadedCount = 0;
  
  for (let i = 0; i < fileList.length; i++) {
    const filename = fileList[i];
    
    const { artist, title, album } = parseFilename(filename);
    const fileUrl = `https://raw.githubusercontent.com/2321564369/galaxy-test/main/MUSIC/${encodeURIComponent(filename)}`;
    const songCover = await getCoverArt(artist, title, filename);
    
    const song = {
      id: i,
      title: title,
      artist: artist,
      album: album,
      file: fileUrl,
      cover: songCover,
      disabled: false,
      liked: liked.includes(i),
      cached: false,
      duration: 0
    };
    
    loadedSongs.push(song);
    
    loadSongDuration(song).then(duration => {
      song.duration = duration;
      loadedCount++;
      
      if (loadedCount % 3 === 0) {
        viewTitle.innerText = `Loading... (${loadedCount}/${fileList.length})`;
      }
      
      if (loadedCount === fileList.length) {
        finishLoading(loadedSongs);
      }
    }).catch(() => {
      song.duration = 180;
      loadedCount++;
      
      if (loadedCount === fileList.length) {
        finishLoading(loadedSongs);
      }
    });
  }
  
  if (fileList.length === 0) {
    finishLoading([]);
  }
}

async function tryCommonFiles() {
  console.log("Trying common file patterns...");
  viewTitle.innerText = "Checking common files...";
  
  const commonFiles = [
    "Panic! At The Disco - House of Memories.mp3",
    "3 Doors Down - Kryptonite (Official Video).mp3",
    "Drowning Pool - Bodies (Official HD Music Video).mp3",
    "Enter Sandman (Remastered).mp3",
    "Limp Bizkit - Break Stuff (Official Music Video).mp3",
    "Master of Puppets (Remastered).mp3",
    "Papa Roach - Last Resort (Squeaky Clean Version) (Official Music Video).mp3",
    "Rick Astley - Never Gonna Give You Up (Official Music Video) [ ezmp3.cc ].mp3",
    "Spiderbait - Black Betty (Audio).mp3",
    "System Of A Down - Toxicity (Official HD Video).mp3",
    "_NSYNC - Bye Bye Bye (Lyrics) (Deadpool 3 Soundtrack) [ ezmp3.cc ].mp3"
  ];
  
  const foundFiles = [];
  
  for (const filename of commonFiles) {
    try {
      const url = `https://2321564369.github.io/galaxy-test/MUSIC/${encodeURIComponent(filename)}`;
      const response = await fetch(url, { method: 'HEAD' });
      
      if (response.ok) {
        foundFiles.push(filename);
        console.log("✓ Found:", filename);
      }
    } catch (error) {}
  }
  
  const uniqueFiles = [...new Set(foundFiles)];
  
  if (uniqueFiles.length > 0) {
    console.log("Found via file check:", uniqueFiles);
    await scanForCoverFiles();
    await loadSongsFromList(uniqueFiles);
  } else {
    console.log("No files found");
    useCachedSongs();
  }
}

function loadSongDuration(song) {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    
    audio.onloadedmetadata = () => {
      resolve(audio.duration);
    };
    
    audio.onerror = () => {
      resolve(180);
    };
    
    setTimeout(() => {
      resolve(180);
    }, 3000);
    
    audio.src = song.file;
  });
}

async function finishLoading(loadedSongs) {
  songs = loadedSongs;
  console.log(`Loaded ${songs.length} songs`);
  
  // Clear old cache before starting new cache
  await clearCache();
  
  // Save initial state
  saveSongsToCache();
  
  // Load all songs (render them)
  loadAll();
  
  // Start caching songs in the background
  setTimeout(() => {
    cacheAllSongsBackground(songs);
  }, 500);
}

function saveSongsToCache() {
  localStorage.setItem('cachedSongs', JSON.stringify(songs.map(s => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    album: s.album,
    file: s.file,
    cover: s.cover,
    duration: s.duration || 180,
    liked: s.liked || false,
    disabled: s.disabled || false,
    cached: s.cached || false
  }))));
  localStorage.setItem('lastScan', Date.now());
}

function useCachedSongs() {
  console.log("Checking cache...");
  const cached = localStorage.getItem('cachedSongs');
  const lastScan = localStorage.getItem('lastScan');
  
  if (cached && lastScan && (Date.now() - lastScan) < 24 * 60 * 60 * 1000) {
    try {
      songs = JSON.parse(cached);
      console.log(`Loaded ${songs.length} songs from cache`);
      
      // Check which songs are actually cached
      setTimeout(async () => {
        for (let song of songs) {
          song.cached = await isSongCached(song);
        }
        updateCachedSongsUI();
      }, 100);
      
      loadAll();
    } catch (e) {
      console.error("Cache corrupted, scanning...");
      scanWithGitHubAPI();
    }
  } else {
    scanWithGitHubAPI();
  }
}

function rescanSongs() {
  if (confirm("Clear cache and rescan for new songs?\n\nIf you are offline this will clear song list")) {
    localStorage.removeItem('cachedSongs');
    localStorage.removeItem('lastScan');
    
    songs = [];
    currentSongs = [];
    
    viewTitle.innerText = "Scanning...";
    list.innerHTML = '<div class="empty"><div class="spinner"></div><p>Scanning with GitHub API...</p></div>';
    
    scanWithGitHubAPI();
  }
}

/* ========= HELPER FUNCTIONS ========= */
function formatTime(sec) {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ":" + (s < 10 ? "0" + s : s);
}

function updateLikeButton() {
  if (songs[index] && songs[index].liked) {
    playerHeartBtn.classList.add('liked');
  } else {
    playerHeartBtn.classList.remove('liked');
  }
}

function updateProgressBars() {
  if (audio.duration) {
    const progressPercent = (audio.currentTime / audio.duration) * 100;
    progress.style.setProperty('--progress', `${progressPercent}%`);
  }
  
  const volumePercent = audio.volume * 100;
  volume.style.setProperty('--volume', `${volumePercent}%`);
}

/* ========= NEW UI UPDATE FUNCTIONS ========= */
function updateNowPlayingUI(song) {
  // Update player UI immediately
  cover.src = song.cover;
  now.innerText = `${song.title} • ${song.artist}`;
  currentSongId = song.id;
  
  // Update the playing state in the song list
  updatePlayingStateInList();
  
  // Update like button
  updateLikeButton();
}

function updatePlayingStateInList() {
  // Remove playing class from all songs
  document.querySelectorAll('.song').forEach(songEl => {
    songEl.classList.remove('playing');
  });
  
  // Add playing class to currently playing song
  if (currentSongId !== null) {
    const playingSong = document.querySelector(`.song[data-id="${currentSongId}"]`);
    if (playingSong) {
      playingSong.classList.add('playing');
      
      // Scroll the playing song into view
      playingSong.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }
}

function renderSongs(arr) {
  if (!arr || arr.length === 0) {
    list.innerHTML = `
      <div class="empty">
        <p>No songs found</p>
        <button onclick="rescanSongs()" class="scan-btn">Try Scanning Again</button>
      </div>`;
    return;
  }
  
  list.innerHTML = "";

  arr.forEach(function (s) {
    const row = document.createElement("div");
    row.className = "song" + (s.disabled ? " disabled" : "");
    row.dataset.id = s.id;

    const thumb = document.createElement("div");
    thumb.className = "thumb";
    thumb.style.backgroundImage = `url("${s.cover}")`;
    
    // Add offline badge if cached
    if (s.cached) {
      const offlineBadge = document.createElement("div");
      offlineBadge.className = "offline-badge";
      offlineBadge.title = "Available offline";
      offlineBadge.innerHTML = "📥";
      thumb.appendChild(offlineBadge);
    }

    const info = document.createElement("div");
    info.className = "songInfo";
    
    const titleDiv = document.createElement("div");
    titleDiv.className = "songTitle";
    
    // Create title text
    const titleText = document.createTextNode(s.title);
    titleDiv.appendChild(titleText);
    
    // Add offline indicator if cached
    if (s.cached) {
      const offlineIndicator = document.createElement("span");
      offlineIndicator.className = "offline-indicator";
      offlineIndicator.title = "Available offline";
      offlineIndicator.innerHTML = " 📥";
      titleDiv.appendChild(offlineIndicator);
    }
    
    const metaDiv = document.createElement("div");
    metaDiv.className = "songMeta";
    metaDiv.textContent = `${s.artist} • ${s.album} • ${formatTime(s.duration)}`;
    
    info.appendChild(titleDiv);
    info.appendChild(metaDiv);

    const toggle = document.createElement("label");
    toggle.className = "toggle-switch";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !s.disabled;
    checkbox.onchange = function (e) {
      s.disabled = !e.target.checked;
    };

    const slider = document.createElement("span");
    slider.className = "toggle-slider";

    toggle.appendChild(checkbox);
    toggle.appendChild(slider);

    const addBtn = document.createElement("button");
    addBtn.className = "addBtn";
    addBtn.innerHTML = "+";
    addBtn.title = "Add to playlist";
    addBtn.onclick = function(e) {
      e.stopPropagation();
      showAddToPlaylistModal(s.id);
    };

    const likeBtn = document.createElement("button");
    likeBtn.className = "likeBtn";
    likeBtn.title = "Like song";
    likeBtn.onclick = function(e) {
      e.stopPropagation();
      toggleSongLike(s.id);
    };
    
    likeBtn.classList.toggle('liked', s.liked);

    const controlsDiv = document.createElement("div");
    controlsDiv.className = "songControls";
    controlsDiv.appendChild(likeBtn);
    controlsDiv.appendChild(addBtn);
    controlsDiv.appendChild(toggle);

    row.appendChild(thumb);
    row.appendChild(info);
    row.appendChild(controlsDiv);

    row.onclick = function () {
      if (!s.disabled) {
        const playIndex = currentSongs.findIndex(song => song.id === s.id);
        if (playIndex !== -1) play(playIndex);
      }
    };

    list.appendChild(row);
  });
  
  // Update playing state after rendering
  updatePlayingStateInList();
}

/* ========= PLAYBACK FUNCTIONS ========= */
async function play(i) {
  if (!currentSongs || i < 0 || i >= currentSongs.length) return;
  
  index = i;
  const song = currentSongs[i];
  
  console.log("Playing song:", song.title, "Cached:", song.cached);
  
  // Update UI immediately - BEFORE any async operations
  updateNowPlayingUI(song);
  
  // Try to get from cache first
  const cachedBlob = await getCachedSong(song);
  
  if (cachedBlob && (song.cached || !navigator.onLine)) {
    // Play from cache
    const blobUrl = URL.createObjectURL(cachedBlob);
    audio.src = blobUrl;
    
    audio.play().catch(e => {
      console.error("Play error from cache:", e);
      if (navigator.onLine) {
        playFromNetwork(song);
      } else {
        alert(`Cannot play "${song.title}" offline. Song may not be fully cached.`);
      }
    });
  } else if (navigator.onLine) {
    // Play from network
    playFromNetwork(song);
  } else {
    alert(`Cannot play "${song.title}" offline. Song is not cached.`);
    return;
  }
  
  document.querySelector(".icon.play").classList.add("playing");
}

function playFromNetwork(song) {
  let audioUrl = song.file;
  
  if (audioUrl.includes('raw.githubusercontent.com')) {
    const altUrl = audioUrl.replace('raw.githubusercontent.com/2321564369/galaxy-test/main/MUSIC/', 'https://2321564369.github.io/galaxy-test/MUSIC/');
    
    const testAudio = new Audio();
    testAudio.src = audioUrl;
    
    testAudio.oncanplay = () => {
      audio.src = audioUrl;
      continuePlayback();
    };
    
    testAudio.onerror = () => {
      audio.src = altUrl;
      continuePlayback();
    };
    
    setTimeout(() => {
      if (!audio.src) {
        audio.src = altUrl;
        continuePlayback();
      }
    }, 1000);
  } else {
    audio.src = audioUrl;
    continuePlayback();
  }
  
  function continuePlayback() {
    audio.play().catch(e => {
      console.error("Play error:", e);
      // Keep the UI updated even if playback fails
    });
  }
}

function toggle() {
  if (audio.paused) {
    if (!audio.src && currentSongs.length > 0) {
      // If nothing is playing, start playing from beginning
      play(0);
    } else {
      audio.play();
      document.querySelector(".icon.play").classList.add("playing");
    }
  } else {
    audio.pause();
    document.querySelector(".icon.play").classList.remove("playing");
  }
}

function next() {
  if (!currentSongs || currentSongs.length === 0) return;
  
  if (shuffle) {
    const available = currentSongs.filter((s, i) => !s.disabled && i !== index);
    if (available.length === 0) return;
    const randomIndex = Math.floor(Math.random() * available.length);
    play(currentSongs.findIndex(s => s.id === available[randomIndex].id));
  } else {
    let nextIndex = (index + 1) % currentSongs.length;
    let tries = 0;
    while (currentSongs[nextIndex].disabled && tries < currentSongs.length) {
      nextIndex = (nextIndex + 1) % currentSongs.length;
      tries++;
    }
    if (!currentSongs[nextIndex].disabled) {
      play(nextIndex);
    }
  }
}

function prev() {
  if (!currentSongs || currentSongs.length === 0) return;
  
  let prevIndex = (index - 1 + currentSongs.length) % currentSongs.length;
  let tries = 0;
  while (currentSongs[prevIndex].disabled && tries < currentSongs.length) {
    prevIndex = (prevIndex - 1 + currentSongs.length) % currentSongs.length;
    tries++;
  }
  if (!currentSongs[prevIndex].disabled) {
    play(prevIndex);
  }
}

function toggleShuffle() {
  shuffle = !shuffle;
  document.querySelector(".icon.shuffle").classList.toggle("active", shuffle);
}

function toggleAutoplay() {
  autoplay = !autoplay;
  document.querySelector(".icon.autoplay").classList.toggle("active", autoplay);
}

/* ========= AUDIO EVENT HANDLERS ========= */
audio.onended = function () {
  if (autoplay) {
    next();
  } else {
    // Keep the UI showing the last played song
    // Don't clear playing state when song ends
  }
};

audio.ontimeupdate = function () {
  if (audio.duration) {
    const progressValue = (audio.currentTime / audio.duration) * 100 || 0;
    progress.value = progressValue;
    progress.style.setProperty('--progress', `${progressValue}%`);
    timeText.innerText = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
  }
};

audio.onvolumechange = function() {
  const volumeValue = audio.volume * 100;
  volume.value = audio.volume;
  volume.style.setProperty('--volume', `${volumeValue}%`);
};

audio.onloadstart = function() {
  // Show loading state but keep song info visible
  now.innerText = "Loading...";
};

audio.oncanplay = function() {
  // Restore song info when audio is ready
  if (songs[index]) {
    now.innerText = `${songs[index].title} • ${songs[index].artist}`;
  }
};

progress.oninput = function () {
  if (audio.duration) {
    const newTime = (progress.value / 100) * audio.duration;
    audio.currentTime = newTime;
    progress.style.setProperty('--progress', `${progress.value}%`);
  }
};

volume.oninput = function () {
  audio.volume = volume.value;
  volume.style.setProperty('--volume', `${volume.value * 100}%`);
};

/* ========= UI FUNCTIONS ========= */
sortSelect.onchange = function () {
  const v = sortSelect.value;
  const sorted = [...currentSongs];

  if (v === "artist") {
    sorted.sort((a, b) => a.artist.localeCompare(b.artist));
  } else if (v === "album") {
    sorted.sort((a, b) => (a.album || "").localeCompare(b.album || ""));
  }

  currentSongs = sorted;
  renderSongs(currentSongs);
};

function loadAll() {
  currentSongs = songs;
  currentPlaylist = null;
  updateCachedSongsUI();
  renderSongs(currentSongs);
  document.querySelectorAll("#playlists li").forEach(li => li.classList.remove("active"));
  document.querySelectorAll("#playlists li")[0].classList.add("active");
}

function loadLiked() {
  currentSongs = songs.filter(s => s.liked);
  currentPlaylist = "liked";
  viewTitle.innerText = `Liked Songs (${currentSongs.length})`;
  renderSongs(currentSongs);
  document.querySelectorAll("#playlists li").forEach(li => li.classList.remove("active"));
  document.querySelectorAll("#playlists li")[1].classList.add("active");
}

function toggleLike() {
  if (!songs[index]) return;
  
  const song = songs[index];
  song.liked = !song.liked;
  
  if (song.liked) {
    if (!liked.includes(song.id)) liked.push(song.id);
  } else {
    liked = liked.filter(id => id !== song.id);
  }
  
  localStorage.setItem("likedSongs", JSON.stringify(liked));
  updateLikeButton();
  
  const songRow = document.querySelector(`.song[data-id="${song.id}"] .likeBtn`);
  if (songRow) {
    songRow.classList.toggle('liked', song.liked);
  }
}

function toggleSongLike(songId) {
  const song = songs.find(s => s.id === songId);
  if (!song) return;
  
  song.liked = !song.liked;
  
  if (song.liked) {
    if (!liked.includes(song.id)) liked.push(song.id);
  } else {
    liked = liked.filter(id => id !== song.id);
  }
  
  localStorage.setItem("likedSongs", JSON.stringify(liked));
  
  const songRow = document.querySelector(`.song[data-id="${songId}"] .likeBtn`);
  if (songRow) {
    songRow.classList.toggle('liked', song.liked);
  }
  
  if (currentSongId === songId) {
    updateLikeButton();
  }
}

function newPlaylist() {
  document.getElementById("playlistModal").style.display = "flex";
  document.getElementById("playlistName").focus();
}

function createPlaylist() {
  const name = document.getElementById("playlistName").value.trim();
  if (name) {
    if (!playlists[name]) {
      playlists[name] = [];
      localStorage.setItem("playlists", JSON.stringify(playlists));
      renderPlaylists();
    } else {
      alert("A playlist with that name already exists!");
    }
  }
  closeModal();
}

function renderPlaylists() {
  const playlistsList = document.getElementById("playlists");
  while (playlistsList.children.length > 2) {
    playlistsList.removeChild(playlistsList.lastChild);
  }
  
  for (const name in playlists) {
    const li = document.createElement("li");
    li.className = "playlist-item";
    li.onclick = function() { loadPlaylist(name); };
    
    const nameSpan = document.createElement("span");
    nameSpan.className = "playlist-name";
    nameSpan.textContent = name;
    
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-playlist-btn";
    deleteBtn.title = "Delete playlist";
    deleteBtn.innerHTML = "🗑️";
    deleteBtn.onclick = function(e) {
      e.stopPropagation();
      showDeletePlaylistModal(name);
    };
    
    li.appendChild(nameSpan);
    li.appendChild(deleteBtn);
    playlistsList.appendChild(li);
  }
}

function loadPlaylist(name) {
  if (playlists[name]) {
    currentSongs = songs.filter(s => playlists[name].includes(s.id));
    currentPlaylist = name;
    viewTitle.innerText = `${name} (${currentSongs.length})`;
    renderSongs(currentSongs);
    
    document.querySelectorAll("#playlists li").forEach(li => li.classList.remove("active"));
    document.querySelectorAll("#playlists li").forEach(li => {
      if (li.querySelector('.playlist-name') && li.querySelector('.playlist-name').textContent === name) {
        li.classList.add("active");
      }
    });
  }
}

function showDeletePlaylistModal(playlistName) {
  playlistToDelete = playlistName;
  deletePlaylistMessage.textContent = `Are you sure you want to delete "${playlistName}"? This action cannot be undone.`;
  document.getElementById("deletePlaylistModal").style.display = "flex";
}

function confirmDeletePlaylist() {
  if (playlistToDelete && playlists[playlistToDelete]) {
    delete playlists[playlistToDelete];
    localStorage.setItem("playlists", JSON.stringify(playlists));
    
    if (currentPlaylist === playlistToDelete) {
      loadAll();
    }
    
    renderPlaylists();
    playlistToDelete = null;
  }
  
  closeDeleteModal();
}

function closeDeleteModal() {
  document.getElementById("deletePlaylistModal").style.display = "none";
  playlistToDelete = null;
}

function showAddToPlaylistModal(songId) {
  playlistOptions.innerHTML = "";
  currentSongId = songId;
  
  for (const name in playlists) {
    const div = document.createElement("div");
    div.className = "playlist-option";
    div.innerHTML = `
      <span>${name}</span>
      <button onclick="addToPlaylist('${name}', ${songId})">
        ${playlists[name].includes(songId) ? "Remove" : "Add"}
      </button>
    `;
    playlistOptions.appendChild(div);
  }
  
  if (Object.keys(playlists).length === 0) {
    playlistOptions.innerHTML = "<p>No playlists yet. Create one first!</p>";
  }
  
  document.getElementById("addToPlaylistModal").style.display = "flex";
}

function addToPlaylist(playlistName, songId) {
  if (!playlists[playlistName]) playlists[playlistName] = [];
  
  const index = playlists[playlistName].indexOf(songId);
  if (index === -1) {
    playlists[playlistName].push(songId);
  } else {
    playlists[playlistName].splice(index, 1);
  }
  
  localStorage.setItem("playlists", JSON.stringify(playlists));
  showAddToPlaylistModal(songId);
}

function closeModal() {
  document.getElementById("playlistModal").style.display = "none";
  document.getElementById("playlistName").value = "";
}

function closeAddModal() {
  document.getElementById("addToPlaylistModal").style.display = "none";
}

function suggestion() {
  window.open("https://docs.google.com/forms/d/e/1FAIpQLSc2-D2zzAHNZ_qSi5KfAHnb5uIgtaGw2d_cutTVNJEK-UEOSA/viewform", "_blank");
}

/* ========= INITIALIZATION ========= */
window.onload = async function() {
  audio.volume = 0.4;
  
  // Initialize progress bars
  updateProgressBars();
  
  // Initialize connection status
  updateConnectionStatus();
  
  // Add scan button
  const scanBtn = document.createElement("button");
  scanBtn.className = "new-playlist";
  scanBtn.textContent = "🔍 Scan for songs";
  scanBtn.onclick = function() {
    rescanSongs();
  };
  scanBtn.style.marginTop = "10px";
  document.querySelector(".sidebar").appendChild(scanBtn);
  
  // Render existing playlists
  renderPlaylists();
  
  // Listen for online/offline events
  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);
  
  // Start scanning
  viewTitle.innerText = "Loading...";
  list.innerHTML = '<div class="empty"><div class="spinner"></div><p>Connecting to GitHub API...</p></div>';
  
  scanWithGitHubAPI();
  
  window.onclick = function(event) {
    const modals = document.querySelectorAll(".modal");
    modals.forEach(function(modal) {
      if (event.target == modal) {
        if (modal.id === "playlistModal") {
          closeModal();
        } else if (modal.id === "addToPlaylistModal") {
          closeAddModal();
        } else if (modal.id === "deletePlaylistModal") {
          closeDeleteModal();
        }
      }
    });
  };
};
