const { app, BrowserWindow, ipcMain, shell, net } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');
const url = require('url');

let mainWindow;
let rpcClient = null;
let RPC = null;
let networkServer = null;
let networkServerPort = null;
let networkServerIP = null;

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

// ==================== NETWORK SERVER ====================

// Get local network IP address
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (i.e. 127.0.0.1) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// Find available port starting from 3000
async function findAvailablePort(startPort = 3000) {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Try next port
        findAvailablePort(startPort + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}

// MIME types for file serving
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

// Serve static file
function serveStaticFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
      return;
    }
    
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// Proxy stream request (for LiveTV channels)
function proxyStreamRequest(pathname, req, res) {
  // Extract the encoded stream URL from path
  // Format: /stream/{encoded_url}
  const encodedUrl = pathname.replace('/stream/', '');
  let streamUrl;
  
  try {
    streamUrl = decodeURIComponent(encodedUrl);
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Invalid stream URL');
    return;
  }
  
  // Validate URL
  if (!streamUrl.startsWith('http://') && !streamUrl.startsWith('https://')) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Invalid stream URL');
    return;
  }
  
  // Use net.request to fetch the stream
  const request = net.request({
    url: streamUrl,
    method: 'GET'
  });
  
  // Forward range header if present (for video seeking)
  if (req.headers.range) {
    request.setHeader('Range', req.headers.range);
  }
  
  // Set user agent to avoid blocking
  request.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  
  request.on('response', (response) => {
    // Forward status code
    const statusCode = response.statusCode;
    
    // Forward headers (important for HLS)
    const headers = {};
    response.headers && Object.keys(response.headers).forEach(key => {
      const value = response.headers[key];
      if (Array.isArray(value)) {
        headers[key] = value.join(', ');
      } else {
        headers[key] = value;
      }
    });
    
    // Set CORS headers
    headers['Access-Control-Allow-Origin'] = '*';
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Range, Content-Type';
    headers['Access-Control-Expose-Headers'] = 'Content-Length, Content-Range, Accept-Ranges';
    
    // Handle range requests for video streaming
    if (req.headers.range && response.statusCode === 206) {
      headers['Accept-Ranges'] = 'bytes';
      headers['Content-Range'] = response.headers['content-range'] || '';
    }
    
    // Check if this is an HLS manifest (.m3u8)
    const isManifest = streamUrl.includes('.m3u8') || headers['content-type']?.includes('application/vnd.apple.mpegurl') || headers['content-type']?.includes('application/x-mpegURL');
    
    if (isManifest) {
      // For HLS manifests, we need to rewrite URLs in the manifest
      let manifestData = '';
      
      response.on('data', (chunk) => {
        manifestData += chunk.toString();
      });
      
      response.on('end', () => {
        // Rewrite URLs in the manifest to go through proxy
        try {
          const baseUrl = new URL(streamUrl);
          const basePath = baseUrl.origin + baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
          
          // Rewrite absolute and relative URLs to use proxy
          const rewrittenManifest = manifestData
            .split('\n')
            .map(line => {
              const originalLine = line;
              line = line.trim();
              
              // Skip comments and empty lines
              if (!line || line.startsWith('#')) {
                return originalLine; // Preserve original formatting
              }
              
              // If it's a URL line (not a comment)
              if (line && !line.startsWith('#')) {
                let segmentUrl = line;
                
                // Convert relative URLs to absolute
                if (segmentUrl.startsWith('http://') || segmentUrl.startsWith('https://')) {
                  // Already absolute, use as-is
                } else if (segmentUrl.startsWith('/')) {
                  // Absolute path from domain root
                  segmentUrl = baseUrl.origin + segmentUrl;
                } else if (segmentUrl.startsWith('../')) {
                  // Relative path going up
                  const pathParts = baseUrl.pathname.split('/').filter(p => p);
                  const upCount = (segmentUrl.match(/\.\.\//g) || []).length;
                  const newPath = pathParts.slice(0, -upCount - 1).join('/');
                  segmentUrl = baseUrl.origin + '/' + newPath + '/' + segmentUrl.replace(/\.\.\//g, '');
                } else {
                  // Relative path in same directory
                  segmentUrl = basePath + segmentUrl;
                }
                
                // Rewrite to use proxy
                return `/stream/${encodeURIComponent(segmentUrl)}`;
              }
              
              return originalLine; // Preserve original formatting
            })
            .join('\n');
        
          headers['Content-Type'] = 'application/vnd.apple.mpegurl';
          headers['Content-Length'] = Buffer.byteLength(rewrittenManifest);
          
          res.writeHead(statusCode, headers);
          res.end(rewrittenManifest);
        } catch (error) {
          console.error('Error rewriting HLS manifest:', error);
          // If manifest rewriting fails, try to send original manifest
          res.writeHead(statusCode, headers);
          res.end(manifestData);
        }
      });
    } else {
      // For non-manifest files (segments), just pipe the data
      res.writeHead(statusCode, headers);
      
      response.on('data', (chunk) => {
        res.write(chunk);
      });
      
      response.on('end', () => {
        res.end();
      });
    }
  });
  
  request.on('error', (error) => {
    console.error('Stream proxy error:', error);
    res.writeHead(500, { 
      'Content-Type': 'text/plain',
      'Access-Control-Allow-Origin': '*'
    });
    res.end('Stream proxy error: ' + error.message);
  });
  
  request.end();
}

// Proxy API request to TMDB with method support
async function proxyAPIRequestWithMethod(pathname, req, res) {
  const TMDB_API_KEY = '111909b8747aeff1169944069465906c';
  const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
  
  // Remove /api prefix and construct URL
  let apiPath = pathname.replace('/api', '');
  const separator = apiPath.includes('?') ? '&' : '?';
  const apiUrl = `${TMDB_BASE_URL}${apiPath}${separator}api_key=${TMDB_API_KEY}`;
  
  try {
    const options = {
      method: req.method || 'GET',
      headers: {}
    };
    
    // Forward request body for POST/DELETE
    if (req.method === 'POST' || req.method === 'DELETE') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        if (body) {
          options.body = body;
          options.headers['Content-Type'] = 'application/json';
        }
        
        try {
          const result = await fetchFromMain(apiUrl, options);
          res.writeHead(result.status, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          });
          res.end(result.data);
        } catch (error) {
          console.error('Proxy error:', error);
          res.writeHead(500, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify({ error: 'Proxy request failed' }));
        }
      });
      return;
    }
    
    // GET request
    const result = await fetchFromMain(apiUrl, options);
    res.writeHead(result.status, { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(result.data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.writeHead(500, { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ error: 'Proxy request failed' }));
  }
}

// Start network server
async function startNetworkServer() {
  if (networkServer) {
    return { success: false, error: 'Server already running' };
  }
  
  try {
    const port = await findAvailablePort(3000);
    const ip = getLocalIPAddress();
    
    networkServer = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url, true);
      const pathname = parsedUrl.pathname;
      
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
      
      // API proxy
      if (pathname.startsWith('/api/')) {
        proxyAPIRequestWithMethod(pathname, req, res);
        return;
      }
      
      // Stream proxy for LiveTV channels
      if (pathname.startsWith('/stream/')) {
        proxyStreamRequest(pathname, req, res);
        return;
      }
      
      // Serve static files
      let filePath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
      const fullPath = path.join(__dirname, filePath);
      
      // Security: prevent directory traversal
      const normalizedPath = path.normalize(fullPath);
      if (!normalizedPath.startsWith(path.normalize(__dirname))) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
      }
      
      // Check if file exists
      fs.access(normalizedPath, fs.constants.F_OK, (err) => {
        if (err) {
          // If file doesn't exist, serve index.html for SPA routing
          if (filePath !== 'index.html') {
            const indexPath = path.join(__dirname, 'index.html');
            serveStaticFile(indexPath, res);
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
          }
        } else {
          serveStaticFile(normalizedPath, res);
        }
      });
    });
    
    return new Promise((resolve, reject) => {
      networkServer.listen(port, '0.0.0.0', () => {
        networkServerPort = port;
        networkServerIP = ip;
        console.log(`Network server started on http://${ip}:${port}`);
        resolve({ 
          success: true, 
          ip: ip, 
          port: port,
          url: `http://${ip}:${port}`
        });
      });
      
      networkServer.on('error', (err) => {
        console.error('Network server error:', err);
        networkServer = null;
        networkServerPort = null;
        networkServerIP = null;
        reject({ success: false, error: err.message });
      });
    });
  } catch (error) {
    console.error('Failed to start network server:', error);
    return { success: false, error: error.message };
  }
}

// Stop network server
function stopNetworkServer() {
  return new Promise((resolve) => {
    if (networkServer) {
      networkServer.close(() => {
        console.log('Network server stopped');
        networkServer = null;
        networkServerPort = null;
        networkServerIP = null;
        resolve({ success: true });
      });
    } else {
      resolve({ success: true });
    }
  });
}

// Get network server status
function getNetworkServerStatus() {
  return {
    running: networkServer !== null,
    ip: networkServerIP,
    port: networkServerPort,
    url: networkServer && networkServerIP && networkServerPort 
      ? `http://${networkServerIP}:${networkServerPort}` 
      : null
  };
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
      preload: path.join(__dirname, 'preload.js'),
      autoplayPolicy: 'no-user-gesture-required'
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

  // Network server IPC handlers
  ipcMain.handle('network-server-start', async () => {
    return await startNetworkServer();
  });

  ipcMain.handle('network-server-stop', async () => {
    return await stopNetworkServer();
  });

  ipcMain.handle('network-server-status', () => {
    return getNetworkServerStatus();
  });

  ipcMain.handle('network-get-local-ip', () => {
    return getLocalIPAddress();
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
    // Stop network server on app quit
    if (networkServer) {
      stopNetworkServer();
    }
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

