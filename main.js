// Suppress Electron cache warnings - must be at the very top
// These warnings come from Chromium's internal logging (stderr), so we need to filter stderr
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = function(chunk, encoding, fd) {
  if (typeof chunk === 'string') {
    // Filter out cache-related warnings
    if (chunk.includes('backend_impl.cc') || 
        chunk.includes('Messed up entry found') || 
        chunk.includes('Destroying invalid entry') ||
        chunk.includes('WARNING:backend_impl')) {
      return true; // Suppress these warnings
    }
  } else if (Buffer.isBuffer(chunk)) {
    const str = chunk.toString();
    if (str.includes('backend_impl.cc') || 
        str.includes('Messed up entry found') || 
        str.includes('Destroying invalid entry') ||
        str.includes('WARNING:backend_impl')) {
      return true; // Suppress these warnings
    }
  }
  // Call original stderr.write for other output
  return originalStderrWrite(chunk, encoding, fd);
};

// Also override console methods as backup
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
const originalConsoleLog = console.log;

console.warn = function(...args) {
  const message = args.join(' ');
  // Filter out cache-related warnings
  if (message.includes('backend_impl.cc') || 
      message.includes('Messed up entry found') || 
      message.includes('Destroying invalid entry') ||
      message.includes('WARNING:backend_impl')) {
    return; // Suppress these warnings
  }
  // Call original console.warn for other warnings
  originalConsoleWarn.apply(console, args);
};

console.error = function(...args) {
  const message = args.join(' ');
  // Filter out cache-related warnings from error logs too
  if (message.includes('backend_impl.cc') || 
      message.includes('Messed up entry found') || 
      message.includes('Destroying invalid entry') ||
      message.includes('WARNING:backend_impl')) {
    return; // Suppress these warnings
  }
  // Call original console.error for other errors
  originalConsoleError.apply(console, args);
};

console.log = function(...args) {
  const message = args.join(' ');
  // Filter out cache-related warnings from log output too
  if (message.includes('backend_impl.cc') || 
      message.includes('Messed up entry found') || 
      message.includes('Destroying invalid entry') ||
      message.includes('WARNING:backend_impl')) {
    return; // Suppress these warnings
  }
  // Call original console.log for other logs
  originalConsoleLog.apply(console, args);
};

const { app, BrowserWindow, ipcMain, shell, net } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');
const url = require('url');
const zlib = require('zlib');

// Suppress Electron cache warnings via command line (must be before app is ready)
app.commandLine.appendSwitch('disable-logging');
app.commandLine.appendSwitch('log-level', '0');

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
      // Set initial browsing status
      updateDiscordPresence({
        details: 'Browsing Library',
        largeImageKey: 'cinestream',
        largeImageText: 'CineStream'
      });
    });
    
    rpcClient.on('error', (error) => {
      console.error('Discord RPC error:', error);
    });
    
    rpcClient.login({ clientId: DISCORD_CLIENT_ID }).catch(err => {
      console.error('Failed to connect to Discord:', err);
      console.error('Make sure Discord is running and the Client ID is correct');
      rpcClient = null;
    });
  } catch (error) {
    console.error('Discord RPC initialization error:', error);
    rpcClient = null;
  }
}

// Update Discord Rich Presence
function updateDiscordPresence(presence) {
  if (!rpcClient) {
    console.log('Discord RPC client not available - cannot update presence');
    return;
  }
  
  if (!presence) {
    console.warn('No presence data provided');
    return;
  }
  
  try {
    const activity = {
      details: presence.details || 'Browsing',
      largeImageKey: presence.largeImageKey || 'cinestream',
      largeImageText: presence.largeImageText || 'CineStream'
    };
    
    // Add state if provided
    if (presence.state) {
      activity.state = presence.state;
    }
    
    // Add timestamps if provided
    if (presence.startTimestamp) {
      activity.startTimestamp = presence.startTimestamp;
    }
    if (presence.endTimestamp) {
      activity.endTimestamp = presence.endTimestamp;
    }
    
    // Add small image if provided
    if (presence.smallImageKey) {
      activity.smallImageKey = presence.smallImageKey;
      activity.smallImageText = presence.smallImageText;
    }
    
    // Add buttons if provided (max 2 buttons)
    if (presence.buttons && Array.isArray(presence.buttons) && presence.buttons.length > 0) {
      activity.buttons = presence.buttons.slice(0, 2);
    }
    
    rpcClient.setActivity(activity).catch(err => {
      console.error('Error setting Discord activity:', err);
    });
  } catch (error) {
    console.error('Error updating Discord presence:', error.message);
  }
}

function clearDiscordPresence() {
  if (!rpcClient) return;
  
  try {
    rpcClient.clearActivity();
  } catch (error) {
    console.error('Error clearing Discord presence:', error.message);
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

// API Response Cache
const apiCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes in milliseconds

// Cache management functions
function getCachedResponse(cacheKey) {
  const cached = apiCache.get(cacheKey);
  if (!cached) return null;
  
  // Check if cache is still valid
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    apiCache.delete(cacheKey);
    return null;
  }
  
  return cached.data;
}

function setCachedResponse(cacheKey, data) {
  apiCache.set(cacheKey, {
    data: data,
    timestamp: Date.now()
  });
  
  // Clean up old cache entries periodically (keep cache size reasonable)
  if (apiCache.size > 1000) {
    const now = Date.now();
    for (const [key, value] of apiCache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        apiCache.delete(key);
      }
    }
  }
}

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

// Track redirects to prevent loops
const redirectHistory = new Map();
const MAX_REDIRECTS = 3;

// SIMPLIFIED Video stream proxy - just forward requests directly
function proxyVideoStreamRequest(pathname, req, res) {
  const encodedUrl = pathname.replace('/video-stream/', '');
  let streamUrl;
  
  try {
    streamUrl = decodeURIComponent(encodedUrl);
  } catch (error) {
    if (!res.headersSent) {
      res.writeHead(400, { 
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*'
      });
      res.end('Invalid stream URL');
    }
    return;
  }
  
  if (!streamUrl.startsWith('http://') && !streamUrl.startsWith('https://')) {
    if (!res.headersSent) {
      res.writeHead(400, { 
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*'
      });
      res.end('Invalid stream URL');
    }
    return;
  }
  
  // Check redirect count
  const redirectCount = redirectHistory.get(streamUrl) || 0;
  if (redirectCount >= MAX_REDIRECTS) {
    if (!res.headersSent) {
      res.writeHead(500, {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*'
      });
      res.end('Too many redirects');
    }
    redirectHistory.delete(streamUrl);
    return;
  }
  
  // Set timeout on the HTTP response (not the net.request)
  const responseTimeout = setTimeout(() => {
    if (!res.headersSent) {
      res.writeHead(504, { 
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*'
      });
      res.end('Gateway Timeout');
    }
  }, 120000); // 120 seconds - longer than HLS timeout
  
  // Simple direct proxy - no timeouts on request, just forward
  const request = net.request({
    url: streamUrl,
    method: 'GET'
  });
  
  if (req.headers.range) {
    request.setHeader('Range', req.headers.range);
  }
  
  request.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  request.setHeader('Accept', '*/*');
  request.setHeader('Connection', 'keep-alive');
  
  request.on('response', (response) => {
    clearTimeout(responseTimeout);
    const statusCode = response.statusCode;
    
    // Handle error status codes from source
    if (statusCode >= 400) {
      // Forward error status codes
      const errorHeaders = {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*'
      };
      
      let errorBody = '';
      response.on('data', (chunk) => {
        errorBody += chunk.toString();
      });
      
      response.on('end', () => {
        if (!res.headersSent) {
          res.writeHead(statusCode, errorHeaders);
          res.end(`Source server error: ${statusCode}${errorBody ? ' - ' + errorBody.substring(0, 200) : ''}`);
        }
      });
      
      response.on('error', (err) => {
        if (!res.headersSent) {
          res.writeHead(statusCode, errorHeaders);
          res.end(`Source server error: ${statusCode}`);
        }
      });
      return;
    }
    
    // Store content-encoding before processing headers (we need it for decompression)
    const contentEncoding = (response.headers['content-encoding'] || response.headers['Content-Encoding'] || '').toLowerCase();
    
    // Forward all headers
    const headers = {};
    if (response.headers) {
      Object.keys(response.headers).forEach(key => {
        const value = response.headers[key];
        headers[key] = Array.isArray(value) ? value.join(', ') : value;
      });
    }
    
    // Remove content-encoding and transfer-encoding from headers we send to client
    delete headers['content-encoding'];
    delete headers['Content-Encoding'];
    delete headers['transfer-encoding'];
    delete headers['Transfer-Encoding'];
    
    // Add CORS
    headers['Access-Control-Allow-Origin'] = '*';
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Range, Content-Type';
    headers['Access-Control-Expose-Headers'] = 'Content-Length, Content-Range, Accept-Ranges';
    
    if (req.headers.range && statusCode === 206) {
      headers['Accept-Ranges'] = 'bytes';
      headers['Content-Range'] = response.headers['content-range'] || '';
    }
    
    // Check if this is an HLS manifest
    const isManifest = streamUrl.includes('.m3u8') || 
      (headers['content-type'] || headers['Content-Type'] || '').toLowerCase().includes('application/vnd.apple.mpegurl') || 
      (headers['content-type'] || headers['Content-Type'] || '').toLowerCase().includes('application/x-mpegurl');
    
    if (isManifest) {
      let manifestData = '';
      response.on('data', (chunk) => {
        manifestData += chunk.toString();
      });
      
      response.on('end', () => {
        clearTimeout(responseTimeout);
        try {
          const baseUrl = new URL(streamUrl);
          const basePath = baseUrl.origin + baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
          
          const rewrittenManifest = manifestData.split('\n').map(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return line;
            
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
              return `/video-stream/${encodeURIComponent(trimmed)}`;
            } else if (trimmed && !trimmed.startsWith('#')) {
              try {
                const absoluteUrl = new URL(trimmed, basePath).href;
                return `/video-stream/${encodeURIComponent(absoluteUrl)}`;
              } catch {
                return line;
              }
            }
            return line;
          }).join('\n');
          
          if (!res.headersSent) {
            res.writeHead(statusCode, headers);
            res.end(rewrittenManifest);
          }
        } catch (error) {
          if (!res.headersSent) {
            res.writeHead(statusCode, headers);
            res.end(manifestData);
          }
        }
      });
    } else {
      // Stream segments directly - write headers immediately
      if (!res.headersSent) {
        res.writeHead(statusCode, headers);
      }
      
      // Stream data as it arrives
      response.on('data', (chunk) => {
        if (!res.headersSent) {
          try {
            res.write(chunk);
          } catch (err) {
            // Client disconnected - clear timeout
            clearTimeout(responseTimeout);
          }
        } else {
          try {
            res.write(chunk);
          } catch (err) {
            // Client disconnected
          }
        }
      });
      
      response.on('end', () => {
        clearTimeout(responseTimeout);
        if (!res.headersSent) {
          res.end();
        } else {
          res.end();
        }
      });
    }
    
    response.on('error', (err) => {
      clearTimeout(responseTimeout);
      if (!res.headersSent) {
        res.writeHead(500, { 
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        });
        res.end('Response error');
      }
    });
  });
  
  request.on('error', (error) => {
    clearTimeout(responseTimeout);
    if (!res.headersSent) {
      res.writeHead(500, { 
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*'
      });
      res.end('Request error: ' + error.message);
    }
  });
  
  request.end();
}

// Proxy stream API request (for tlo.sh stream API)
async function proxyStreamAPIRequest(pathname, req, res) {
  const STREAMS_API_BASE = 'https://tlo.sh/mvsapi/api/streams';
  
  // Remove /streams-api prefix and construct URL
  let apiPath = pathname.replace('/streams-api', '');
  const streamUrl = `${STREAMS_API_BASE}${apiPath}`;
  
  // Create cache key from full URL
  const cacheKey = `STREAM_API:${streamUrl}`;
  
  try {
    // Check cache first
    const cachedResponse = getCachedResponse(cacheKey);
    if (cachedResponse) {
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'X-Cache': 'HIT'
      });
      res.end(cachedResponse);
      return;
    }
    
    // Cache miss - fetch from API
    const result = await fetchFromMain(streamUrl, { method: 'GET' });
    
    // Only cache successful responses
    if (result.status >= 200 && result.status < 300) {
      setCachedResponse(cacheKey, result.data);
    }
    
    res.writeHead(result.status, { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'X-Cache': 'MISS'
    });
    res.end(result.data);
  } catch (error) {
    console.error('Stream API proxy error:', error);
    res.writeHead(500, { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ error: 'Stream API proxy request failed' }));
  }
}

// Proxy API request to TMDB with method support and caching
async function proxyAPIRequestWithMethod(pathname, req, res) {
  const TMDB_API_KEY = '111909b8747aeff1169944069465906c';
  const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
  
  // Remove /api prefix and construct URL
  let apiPath = pathname.replace('/api', '');
  const separator = apiPath.includes('?') ? '&' : '?';
  const apiUrl = `${TMDB_BASE_URL}${apiPath}${separator}api_key=${TMDB_API_KEY}`;
  
  // Create cache key from full URL (including query params)
  const cacheKey = `${req.method || 'GET'}:${apiUrl}`;
  
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
        
        // POST/DELETE requests are not cached (they modify data)
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
    
    // GET request - check cache first
    const cachedResponse = getCachedResponse(cacheKey);
    if (cachedResponse) {
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'X-Cache': 'HIT'
      });
      res.end(cachedResponse);
      return;
    }
    
    // Cache miss - fetch from API
    const result = await fetchFromMain(apiUrl, options);
    
    // Only cache successful responses
    if (result.status >= 200 && result.status < 300) {
      setCachedResponse(cacheKey, result.data);
    }
    
    res.writeHead(result.status, { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'X-Cache': 'MISS'
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
      
      // Stream API proxy (for tlo.sh stream requests)
      if (pathname.startsWith('/streams-api/')) {
        proxyStreamAPIRequest(pathname, req, res);
        return;
      }
      
      // Video stream proxy (for actual video playback - HLS, MP4, etc.)
      if (pathname.startsWith('/video-stream/')) {
        proxyVideoStreamRequest(pathname, req, res);
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
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('File not found');
          return;
        }
        
        serveStaticFile(normalizedPath, res);
      });
    });
    
    networkServer.listen(port, '0.0.0.0', () => {
      networkServerPort = port;
      networkServerIP = ip;
      console.log(`Network server started on http://${ip}:${port}`);
    });
    
    return { success: true, ip, port };
    } catch (error) {
    console.error('Failed to start network server:', error);
    return { success: false, error: error.message };
  }
}

// Stop network server
function stopNetworkServer() {
  if (networkServer) {
    networkServer.close();
    networkServer = null;
    networkServerPort = null;
    networkServerIP = null;
    return { success: true };
  }
  return { success: false, error: 'Server not running' };
}

// Get network server status
function getNetworkServerStatus() {
  return {
    running: networkServer !== null,
    ip: networkServerIP,
    port: networkServerPort,
    url: networkServer ? `http://${networkServerIP}:${networkServerPort}` : null
  };
}

// ==================== IPC HANDLERS ====================

// Window controls
ipcMain.on('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('close-window', () => {
  if (mainWindow) mainWindow.close();
});

// Network server
ipcMain.handle('network-server-start', async () => {
  return await startNetworkServer();
});

ipcMain.handle('network-server-stop', () => {
  return stopNetworkServer();
});

ipcMain.handle('network-server-status', () => {
  return getNetworkServerStatus();
});

ipcMain.handle('network-get-local-ip', () => {
  return getLocalIPAddress();
});

// Discord Rich Presence
ipcMain.handle('discord-set-presence', (event, presence) => {
  if (presence) {
    updateDiscordPresence(presence);
  }
});

ipcMain.handle('discord-clear-presence', () => {
  clearDiscordPresence();
});

// External links
ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
});

// Subtitles (if needed)
ipcMain.handle('fetch-subtitles', async (event, options) => {
  // Placeholder for subtitle fetching if needed
  return { success: false, error: 'Not implemented' };
});

// ==================== WINDOW MANAGEMENT ====================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    }
  });

  mainWindow.loadFile('index.html');

  // Initialize Discord RPC after window is ready
  mainWindow.webContents.once('did-finish-load', () => {
    initDiscordRPC();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (rpcClient) {
      clearDiscordPresence();
      rpcClient.destroy();
      rpcClient = null;
    }
    if (networkServer) {
      stopNetworkServer();
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (rpcClient) {
    clearDiscordPresence();
    rpcClient.destroy();
    rpcClient = null;
  }
  if (networkServer) {
    stopNetworkServer();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
