/**
 * WebSocket Bridge + Static File Server
 * - Serves frontend static files from project root on HTTP port 8080
 * - Accepts WebSocket upgrade requests and proxies each WS connection
 *   to the Java TCP chat server (localhost:5000). Messages are newline
 *   delimited on the Java TCP side.
 *
 * Usage: node ws-bridge.js
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const net = require('net');

const PORT = process.env.PORT || 8080;
const JAVA_HOST = 'localhost';
const JAVA_PORT = 5000;
const PUBLIC_DIR = path.resolve(__dirname);

function send404(res) {
  res.statusCode = 404;
  res.end('Not found');
}

function serveStatic(req, res) {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/login.html';
  const filePath = path.join(PUBLIC_DIR, decodeURIComponent(reqPath));

  // prevent path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) return send404(res);

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return send404(res);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.html' ? 'text/html' :
                 ext === '.js' ? 'application/javascript' :
                 ext === '.css' ? 'text/css' :
                 ext === '.png' ? 'image/png' :
                 ext === '.svg' ? 'image/svg+xml' : 'application/octet-stream';
    res.writeHead(200, {'Content-Type': mime});
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  // health endpoint
  if (req.url === '/health') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true}));
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  // only handle websocket upgrades
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws, req) => {
  console.log('[Bridge] Browser client connected from', req.socket.remoteAddress);
  // Create TCP connection to Java server
  const javaSocket = net.createConnection(JAVA_PORT, JAVA_HOST, () => {
    console.log('[Bridge] Connected to Java server at', JAVA_HOST + ':' + JAVA_PORT);
  });

  let buffer = '';

  javaSocket.on('data', (data) => {
    const text = data.toString('utf8');
    buffer += text;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    lines.forEach(line => {
      if (line.trim()) {
        try { ws.send(line); } catch (e) { /* ignore */ }
      }
    });
  });

  javaSocket.on('error', (err) => {
    console.error('[Bridge] Java socket error:', err.message);
    try { ws.close(); } catch (e) {}
  });

  javaSocket.on('close', () => {
    console.log('[Bridge] Java socket closed');
    try { ws.close(); } catch (e) {}
  });

  ws.on('message', (message) => {
    const text = message.toString();
    console.log('[Bridge] Browser -> Java:', text);
    if (javaSocket && !javaSocket.destroyed) javaSocket.write(text + '\n');
  });

  ws.on('close', () => {
    console.log('[Bridge] Browser disconnected');
    if (javaSocket && !javaSocket.destroyed) javaSocket.end();
  });

  ws.on('error', (err) => {
    console.error('[Bridge] WebSocket error:', err && err.message);
    if (javaSocket && !javaSocket.destroyed) javaSocket.destroy();
  });
});

server.listen(PORT, () => {
  console.log(`[Bridge] HTTP+WS bridge listening on http://localhost:${PORT}`);
  console.log(`[Bridge] Proxying WebSocket connections to Java server ${JAVA_HOST}:${JAVA_PORT}`);
});
