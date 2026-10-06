const { app, BrowserWindow, session, ipcMain, dialog, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const origin = 'http://127.0.0.1:47831';
const smoke = process.argv.includes('--smoke');
const smokeReport = process.argv.find(v => v.startsWith('--smoke-report='))?.slice(15);
const screenshot = process.argv.find(v => v.startsWith('--screenshot='))?.slice(13);
const progressScreenshot = process.argv.find(v=>v.startsWith('--progress-screenshot='))?.slice(22);
const navigationScreenshot = process.argv.find(v=>v.startsWith('--navigation-screenshot='))?.slice(24);
let win, server, timeout;
const trusted = sender => sender === win?.webContents && sender.getURL().startsWith(`${origin}/`);
function openMapLink(url) {
  try {const parsed=new URL(url);if(parsed.protocol==='https:' && ['www.openstreetmap.org','maps.google.com','www.google.com','policies.google.com'].includes(parsed.hostname))shell.openExternal(url); }catch{}
}
const csp = "default-src 'self'; script-src 'self' 'unsafe-eval' https://maps.googleapis.com https://maps.gstatic.com; worker-src 'self' blob:; connect-src 'self' https://*.googleapis.com https://*.gstatic.com https://*.google.com; img-src 'self' data: blob: https://tile.openstreetmap.org https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.googleusercontent.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; frame-src https://*.google.com; object-src 'none'; base-uri 'self'";
const visionCsp = "default-src 'none'; script-src 'self' 'unsafe-eval'; connect-src 'self'; img-src 'self' blob: data:; worker-src 'none'";

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { win?.show(); win?.focus(); });
  app.whenReady().then(async () => {
    const root = path.resolve(__dirname, '../dist');
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
    server = http.createServer((req, res) => {
      if (req.method !== 'GET' || req.headers.host !== '127.0.0.1:47831') { res.writeHead(403); return res.end(); }
      let pathname;
      try { pathname = decodeURIComponent(new URL(req.url, origin).pathname); }
      catch { res.writeHead(400); return res.end(); }
      const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (error, bytes) => {
        if (error) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Security-Policy': path.basename(file).startsWith('vision.worker-') ? visionCsp : csp, 'X-Content-Type-Options': 'nosniff' });
        res.end(bytes);
      });
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(47831, '127.0.0.1', resolve); });
    session.defaultSession.setPermissionCheckHandler((wc, permission, requestingOrigin) => trusted(wc) && requestingOrigin === origin && permission === 'media');
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => callback(trusted(wc) && details.isMainFrame !== false && details.requestingUrl?.startsWith(`${origin}/`) && permission === 'media' && !(details.mediaTypes || []).includes('audio')));
    // Defense in depth: Tasks' utilization logger must not reach Google even if its worker policy changes.
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://odml.pa.googleapis.com/*'] }, (_details, callback) => callback({ cancel: true }));
    // Chromium keeps the tile HTTP cache. Identify the desktop application to OSM.
    session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://tile.openstreetmap.org/*'] }, (details, callback) => {
      details.requestHeaders['User-Agent'] = `MapaGestualMLR/${app.getVersion()} (+https://github.com/eeminionn/labTecnologiasEmergentes)`;
      callback({ requestHeaders: details.requestHeaders });
    });
    win = new BrowserWindow({ width: 1440, height: 960, minWidth: 900, minHeight: 650, title: 'Mapa Gestual MLR', backgroundColor: '#f6f8fa', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    win.setMenuBarVisibility(false);
    win.webContents.setWindowOpenHandler(({url}) => {openMapLink(url);return { action: 'deny' };});
    win.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(`${origin}/`)) {event.preventDefault();openMapLink(url);} });
    win.on('blur', () => win.webContents.send('window-blur'));
    ipcMain.handle('map-click', async (event, point) => {
      // Tests restore focus immediately before native input. Production keeps
      // rejecting background input and never activates the window itself.
      if(smoke && trusted(event.sender) && !win.isFocused()){
        app.focus({steal:true});win.focus();await new Promise(resolve=>setTimeout(resolve,80));
      }
      if (!trusted(event.sender) || !win.isFocused() || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
      const [width, height] = win.getContentSize();
      const x = Math.round(point.x), y = Math.round(point.y);
      // Only the map viewport; top bar / footer never accept gesture input.
      if (x < 0 || x >= width || y < 56 || y >= height - 28) return false;
      win.webContents.sendInputEvent({ type: 'mouseMove', x, y });
      win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      return true;
    });
    ipcMain.on('smoke-result', async (event, report) => {
      if (!smoke || !trusted(event.sender)) return;
      if(report.phase==='navigation'){
        if(navigationScreenshot){const picture=await win.webContents.capturePage();fs.writeFileSync(navigationScreenshot,picture.toPNG());}
        return;
      }
      if(report.phase==='progress'){
        if(progressScreenshot){fs.mkdirSync(path.dirname(progressScreenshot),{recursive:true});fs.writeFileSync(progressScreenshot,(await win.webContents.capturePage()).toPNG());}
        return;
      }
      clearTimeout(timeout);
      if (screenshot && report.ok) {
        fs.mkdirSync(path.dirname(screenshot), { recursive: true });
        fs.writeFileSync(screenshot, (await win.webContents.capturePage()).toPNG());
      }
      if (smokeReport) fs.writeFileSync(smokeReport, JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report));
      app.exit(report.ok ? 0 : 1);
    });
    if (smoke) timeout = setTimeout(() => { console.error('Smoke timeout'); app.exit(1); }, 40000);
    await win.loadURL(`${origin}/${smoke ? '?smoke=1' : ''}`);
    // Smoke exercises the same focus-gated native click path as camera input.
    // A hidden window would only test DOM dispatch and miss real input bugs.
    if(smoke){win.show();app.focus({steal:true});win.focus();}
  }).catch(error => { if (!smoke) dialog.showErrorBox('No se pudo iniciar', error.code === 'EADDRINUSE' ? 'El puerto local 47831 está ocupado. Cierra la otra instancia o reinicia el equipo.' : error.message); console.error(error); app.exit(1); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => server?.close());
}
