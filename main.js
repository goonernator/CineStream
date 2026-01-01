const { app, BrowserWindow, ipcMain, shell, net } = require('electron');
const path = require('path');

let mainWindow;
let rpcClient = null;
let RPC = null;

// Try to load discord-rpc (optional dependency)
try {
  RPC = require('discord-rpc');
} catch (error) {
  console.log('Discord RPC not available:', error.message);
}

// Discord Rich Presence Client ID
// To use your own custom assets, create a Discord application at https://discord.com/developers/applications
// and replace this with your Client ID
const DISCORD_CLIENT_ID = '1456220475645497354'; // Placeholder - users should replace with their own

// Initialize Discord Rich Presence
function initDiscordRPC() {
  if (!RPC) {
    console.log('Discord RPC not available - skipping initialization');
    return;
  }
  
  try {
    rpcClient = new RPC.Client({ transport: 'ipc' });
    
    rpcClient.on('ready', () => {
      console.log('Discord Rich Presence connected');
    });
    
    rpcClient.login({ clientId: DISCORD_CLIENT_ID }).catch(err => {
      console.log('Discord RPC login failed (this is OK if Discord is not running):', err.message);
      rpcClient = null;
    });
  } catch (error) {
    console.log('Discord RPC initialization failed (this is OK if Discord is not running):', error.message);
    rpcClient = null;
  }
}

// Update Discord Rich Presence
function updateDiscordPresence(presence) {
  if (!rpcClient) return;
  
  try {
    rpcClient.setActivity(presence).catch(err => {
      console.log('Failed to update Discord presence:', err.message);
    });
  } catch (error) {
    console.log('Error updating Discord presence:', error.message);
  }
}

// Clear Discord Rich Presence
function clearDiscordPresence() {
  if (!rpcClient) return;
  
  try {
    rpcClient.clearActivity().catch(err => {
      console.log('Failed to clear Discord presence:', err.message);
    });
  } catch (error) {
    console.log('Error clearing Discord presence:', error.message);
  }
}

// Helper function to make HTTP requests from main process (bypasses CORS)
async function fetchFromMain(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = net.request({
      url,
      method: options.method || 'GET'
    });
    
    // Set headers after creating request
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        request.setHeader(key, value);
      }
    }
    
    let responseData = '';
    
    request.on('response', (response) => {
      response.on('data', (chunk) => {
        responseData += chunk.toString();
      });
      
      response.on('end', () => {
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          data: responseData
        });
      });
    });
    
    request.on('error', (error) => {
      console.error('Request error:', error);
      reject(error);
    });
    
    if (options.body) {
      request.write(options.body);
    }
    
    request.end();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0f',
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile('index.html');

  // Handle window controls
  ipcMain.on('minimize-window', () => {
    mainWindow.minimize();
  });

  ipcMain.on('maximize-window', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('close-window', () => {
    mainWindow.close();
  });

  // Handle opening external URLs
  ipcMain.handle('open-external', async (event, url) => {
    await shell.openExternal(url);
  });

  // Handle Discord Rich Presence updates
  ipcMain.handle('discord-set-presence', async (event, presence) => {
    updateDiscordPresence(presence);
  });

  ipcMain.handle('discord-clear-presence', async (event) => {
    clearDiscordPresence();
  });

  // Handle subtitle fetching (bypasses CORS)
  ipcMain.handle('fetch-subtitles', async (event, { type, tmdbId, imdbId, apiKey, season, episode }) => {
    try {
      // Try OpenSubtitles first if API key provided
      if (apiKey && imdbId) {
        const searchUrl = type === 'tv' && season && episode
          ? `https://api.opensubtitles.com/api/v1/subtitles?imdb_id=${imdbId}&languages=en&season_number=${season}&episode_number=${episode}`
          : `https://api.opensubtitles.com/api/v1/subtitles?imdb_id=${imdbId}&languages=en`;
        
        const searchResult = await fetchFromMain(searchUrl, {
          headers: {
            'Api-Key': apiKey,
            'Content-Type': 'application/json',
            'User-Agent': 'CineStream v1.0.0'
          }
        });
        
        if (searchResult.ok) {
          const data = JSON.parse(searchResult.data);
          if (data.data && data.data.length > 0) {
            const subtitles = [];
            for (const sub of data.data.slice(0, 5)) {
              const fileId = sub.attributes?.files?.[0]?.file_id;
              if (!fileId) continue;
              
              try {
                const downloadResult = await fetchFromMain('https://api.opensubtitles.com/api/v1/download', {
                  method: 'POST',
                  headers: {
                    'Api-Key': apiKey,
                    'Content-Type': 'application/json',
                    'User-Agent': 'CineStream v1.0.0',
                    'Accept': 'application/json'
                  },
                  body: JSON.stringify({ file_id: fileId })
                });
                
                if (downloadResult.ok) {
                  const downloadData = JSON.parse(downloadResult.data);
                  if (downloadData.link) {
                    subtitles.push({
                      url: downloadData.link,
                      label: sub.attributes?.language || 'English',
                      lang: sub.attributes?.language || 'en',
                      source: 'OpenSubtitles'
                    });
                  }
                }
              } catch (downloadError) {
                // Skip failed downloads
              }
            }
            if (subtitles.length > 0) return subtitles;
          }
        }
      }
      
      // Fallback: Try subdl.com as alternative
      const subdlUrl = type === 'tv' && season && episode
        ? `https://api.subdl.com/api/v1/subtitles?tmdb_id=${tmdbId}&type=tv&season_number=${season}&episode_number=${episode}&languages=en`
        : `https://api.subdl.com/api/v1/subtitles?tmdb_id=${tmdbId}&type=movie&languages=en`;
      
      const subdlResult = await fetchFromMain(subdlUrl);
      
      if (subdlResult.ok) {
        const data = JSON.parse(subdlResult.data);
        if (data.subtitles && data.subtitles.length > 0) {
          return data.subtitles.slice(0, 5).map(sub => ({
            url: `https://dl.subdl.com${sub.url}`,
            label: sub.language || sub.lang || 'English',
            lang: sub.lang || 'en',
            source: 'Subdl'
          }));
        }
      }
      
      return [];
    } catch (error) {
      return [];
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  initDiscordRPC();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (rpcClient) {
      rpcClient.destroy().catch(() => {});
    }
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

