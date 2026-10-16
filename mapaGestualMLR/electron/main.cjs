const { app, BrowserWindow, session, ipcMain, dialog, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createTwinBridge } = require('./twin-bridge.cjs');

const twinMode = process.argv.includes('--twin-bridge');
const twinPort = Number(process.argv.find(v => v.startsWith('--twin-port='))?.slice(12));
const twinToken = process.argv.find(v => v.startsWith('--twin-token='))?.slice(13);
const twinParent = Number(process.argv.find(v => v.startsWith('--twin-parent='))?.slice(14));
if (twinMode && (!Number.isInteger(twinPort) || twinPort < 1024 || twinPort > 65535 || !/^[A-Za-z0-9_-]{32,128}$/.test(twinToken || ''))) {
  console.error('Twin bridge requires a local port and a private token.');
  app.exit(1);
}
const port = twinMode ? twinPort : 47831;
const origin = `http://127.0.0.1:${port}`;
if (twinMode) {
  // A separate Chromium profile lets the installed gesture app remain open.
  app.setPath('userData', path.join(app.getPath('appData'), 'MapaGestualMLR-Twin'));
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
}
const smoke = process.argv.includes('--smoke');
const smokeReport = process.argv.find(v => v.startsWith('--smoke-report='))?.slice(15);
const screenshot = process.argv.find(v => v.startsWith('--screenshot='))?.slice(13);
const progressScreenshot = process.argv.find(v=>v.startsWith('--progress-screenshot='))?.slice(22);
const navigationScreenshot = process.argv.find(v=>v.startsWith('--navigation-screenshot='))?.slice(24);
let win, server, timeout, leaseSweep, settingsWindow;
let twinDevices = [];
const twinPreferenceFile = twinMode ? path.join(app.getPath('userData'), 'twin-camera.json') : '';
let twinPreferences = {};
if (twinMode) { try { twinPreferences = JSON.parse(fs.readFileSync(twinPreferenceFile, 'utf8')); } catch {} }
function cameraPreferences(value) {
  if (!value || typeof value !== 'object') return {};
  return { cameraId: String(value.cameraId || '').slice(0,256), cameraLabel: String(value.cameraLabel || '').slice(0,256),
    mirror: value.mirror === true, rotation: [0,90,180,270].includes(Number(value.rotation)) ? Number(value.rotation) : 0,
    confidence: [.6,.7,.8].includes(Number(value.confidence)) ? Number(value.confidence) : .7,
    cameraAuto: value.cameraAuto !== false, cameraControls: Object.fromEntries(Object.entries(value.cameraControls || {})
      .filter(([key,number]) => ['contrast','brightness','exposureCompensation'].includes(key) && Number.isFinite(number))) };
}
function settingsData() { return { preferences: cameraPreferences(twinPreferences), devices: twinDevices, ...bridge.status() }; }
async function openTwinSettings() {
  if (!bridge?.isActive()) return;
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.show(); settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({ width: 460, height: 550, resizable: false, title: 'Cámara de la mesa',
    backgroundColor: '#f6f8fa', webPreferences: { preload: path.join(__dirname, 'twin-settings-preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true } });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWindow.webContents.on('will-navigate', event => event.preventDefault());
  settingsWindow.on('closed', () => { settingsWindow = null; });
  await settingsWindow.loadFile(path.join(__dirname, 'twin-settings.html'));
  settingsWindow.show(); settingsWindow.focus();
}
const bridge = twinMode ? createTwinBridge({ token: twinToken, onState: state => {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('twin-control', state);
  if (state.active) { win.webContents.startPainting(); win.webContents.invalidate(); }
  else { win.webContents.stopPainting(); settingsWindow?.close(); }
}, onSettings: () => { openTwinSettings().catch(error => console.error(error)); } }) : null;
const trusted = sender => sender === win?.webContents && sender.getURL().startsWith(`${origin}/`);
function openMapLink(url) {
  try {const parsed=new URL(url);if(parsed.protocol==='https:' && ['www.openstreetmap.org','maps.google.com','www.google.com','policies.google.com'].includes(parsed.hostname))shell.openExternal(url); }catch{}
}
const csp = "default-src 'self'; script-src 'self' 'unsafe-eval' https://maps.googleapis.com https://maps.gstatic.com; worker-src 'self' blob:; connect-src 'self' https://*.googleapis.com https://*.gstatic.com https://*.google.com; img-src 'self' data: blob: https://tile.openstreetmap.org https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.googleusercontent.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; frame-src https://*.google.com; object-src 'none'; base-uri 'self'";
const visionCsp = "default-src 'none'; script-src 'self' 'unsafe-eval'; connect-src 'self'; img-src 'self' blob: data:; worker-src 'none'";

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (!twinMode) { win?.show(); win?.focus(); } });
  app.whenReady().then(async () => {
    const root = path.resolve(__dirname, '../dist');
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
    server = http.createServer(async (req, res) => {
      if (req.headers.host !== `127.0.0.1:${port}`) { res.writeHead(403); return res.end(); }
      let pathname;
      try { pathname = decodeURIComponent(new URL(req.url, origin).pathname); }
      catch { res.writeHead(400); return res.end(); }
      if (bridge && await bridge.route(req, res, pathname)) return;
      if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
      const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (error, bytes) => {
        if (error) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Security-Policy': path.basename(file).startsWith('vision.worker-') ? visionCsp : csp, 'X-Content-Type-Options': 'nosniff' });
        res.end(bytes);
      });
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    session.defaultSession.setPermissionCheckHandler((wc, permission, requestingOrigin) => trusted(wc) && requestingOrigin === origin && permission === 'media' && (!bridge || bridge.isActive()));
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => callback(trusted(wc) && details.isMainFrame !== false && details.requestingUrl?.startsWith(`${origin}/`) && permission === 'media' && !(details.mediaTypes || []).includes('audio') && (!bridge || bridge.isActive())));
    // Defense in depth: Tasks' utilization logger must not reach Google even if its worker policy changes.
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://odml.pa.googleapis.com/*'] }, (_details, callback) => callback({ cancel: true }));
    // Chromium keeps the tile HTTP cache. Identify the desktop application to OSM.
    session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://tile.openstreetmap.org/*'] }, (details, callback) => {
      details.requestHeaders['User-Agent'] = `MapaGestualMLR/${app.getVersion()} (+https://github.com/eeminionn/labTecnologiasEmergentes)`;
      callback({ requestHeaders: details.requestHeaders });
    });
    win = new BrowserWindow({ width: twinMode ? 720 : 1440, height: twinMode ? 950 : 960,
      minWidth: twinMode ? 720 : 900, minHeight: twinMode ? 950 : 650, useContentSize: true,
      show: !twinMode, title: 'Mapa Gestual MLR', backgroundColor: '#f6f8fa',
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true,
        offscreen: twinMode, backgroundThrottling: !twinMode, additionalArguments: twinMode ? ['--mlr-twin-projection'] : [] } });
    win.setMenuBarVisibility(false);
    win.webContents.setWindowOpenHandler(({url}) => {openMapLink(url);return { action: 'deny' };});
    win.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(`${origin}/`)) {event.preventDefault();openMapLink(url);} });
    if (!twinMode) win.on('blur', () => win.webContents.send('window-blur'));
    if (bridge) {
      win.webContents.setFrameRate(15);
      win.webContents.on('paint', (_event, _dirty, image) => {
        if (!bridge.isActive()) return;
        const size = image.getSize();
        bridge.pushFrame((size.width === 720 && size.height === 950 ? image : image.resize({ width: 720, height: 950 })).toJPEG(78));
      });
      ipcMain.on('twin-ready', event => { if (trusted(event.sender)) bridge.rendererReady(); });
      ipcMain.on('twin-renderer-state', (event, data) => { if (trusted(event.sender)) bridge.rendererState(data); });
      ipcMain.handle('twin-config-load', event => trusted(event.sender) ? cameraPreferences(twinPreferences) : {});
      ipcMain.on('twin-camera-devices', (event, devices) => {
        if (!trusted(event.sender) || !Array.isArray(devices)) return;
        twinDevices = devices.slice(0,16).map(device => ({ deviceId: String(device.deviceId || '').slice(0,256), label: String(device.label || '').slice(0,256) }));
        settingsWindow?.webContents.send('twin-settings-data', settingsData());
      });
      const trustedSettings = sender => sender === settingsWindow?.webContents;
      ipcMain.handle('twin-settings-get', event => trustedSettings(event.sender) && bridge.isActive() ? settingsData() : null);
      ipcMain.handle('twin-settings-save', async (event, value) => {
        if (!trustedSettings(event.sender) || !bridge.isActive()) return false;
        twinPreferences = cameraPreferences(value);
        fs.mkdirSync(path.dirname(twinPreferenceFile), { recursive: true });
        fs.writeFileSync(twinPreferenceFile, JSON.stringify(twinPreferences), { mode: 0o600 });
        win.webContents.send('twin-preferences', twinPreferences);
        return true;
      });
      ipcMain.on('twin-settings-close', event => { if (trustedSettings(event.sender)) settingsWindow?.close(); });
      win.webContents.on('render-process-gone', () => bridge.deactivate());
      leaseSweep = setInterval(() => {
        bridge.expire();
        if (Number.isSafeInteger(twinParent) && twinParent > 1) {
          try { process.kill(twinParent,0); }
          catch(error) { if(error.code === 'ESRCH') { bridge.deactivate(); app.quit(); } }
        }
      }, 150);
    }
    ipcMain.handle('map-click', async (event, point, epoch) => {
      // Tests restore focus immediately before native input. Production keeps
      // rejecting background input and never activates the window itself.
      if(smoke && trusted(event.sender) && !win.isFocused()){
        app.focus({steal:true});win.focus();await new Promise(resolve=>setTimeout(resolve,80));
      }
      if (!trusted(event.sender) || (bridge ? !bridge.isActive(epoch) : !win.isFocused()) || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
      const [width, height] = win.getContentSize();
      const x = Math.round(point.x), y = Math.round(point.y);
      // Only the map viewport; top bar / footer never accept gesture input.
      if (x < 0 || x >= width || y < (twinMode ? 0 : 56) || y >= height - (twinMode ? 0 : 28)) return false;
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
    if (bridge && !bridge.isActive()) win.webContents.stopPainting();
    // Smoke exercises the same focus-gated native click path as camera input.
    // A hidden window would only test DOM dispatch and miss real input bugs.
    if(smoke){win.show();app.focus({steal:true});win.focus();}
  }).catch(error => { if (!smoke && !twinMode) dialog.showErrorBox('No se pudo iniciar', error.code === 'EADDRINUSE' ? 'El puerto local 47831 está ocupado. Cierra la otra instancia o reinicia el equipo.' : error.message); console.error(error); app.exit(1); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { clearInterval(leaseSweep); bridge?.deactivate(); server?.close(); });
}
