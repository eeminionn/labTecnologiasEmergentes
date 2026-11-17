const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');

function createCompanionWindow(parent, origin) {
  let window = null;
  let opening = null;
  let state = { mode: 'idle' };
  const fromMap = sender => !parent.isDestroyed() && sender === parent.webContents
    && sender.getURL().startsWith(origin + '/');
  const fromCompanion = sender => window && !window.isDestroyed() && sender === window.webContents
    && sender.getURL() === origin + '/companion.html';

  function sendState() {
    if (window && !window.isDestroyed() && !window.webContents.isLoadingMainFrame()) {
      window.webContents.send('companion-state', state);
    }
  }

  function bounds() {
    const current = screen.getDisplayMatching(parent.getBounds());
    const other = screen.getAllDisplays().find(display => display.id !== current.id);
    const area = (other || current).workArea;
    const width = Math.min(1440, area.width);
    const height = Math.min(960, area.height);
    const inset = other ? 0 : 32;
    return {
      x: area.x + Math.min(inset, Math.max(0, area.width - width)),
      y: area.y + Math.min(inset, Math.max(0, area.height - height)),
      width, height
    };
  }

  async function open({ focus = false } = {}) {
    if (parent.isDestroyed()) return;
    if (opening) {
      try { await opening; }
      catch { return false; }
    }
    if (window && !window.isDestroyed()) {
      if (window.isMinimized()) window.restore();
      if (focus) { window.show(); window.focus(); }
      else if (parent.isVisible()) window.showInactive();
      return;
    }
    const next = new BrowserWindow({
      ...bounds(), minWidth: 900, minHeight: 650, useContentSize: true, show: false,
      title: 'Ficha técnica · La Reina', backgroundColor: '#006a85',
      webPreferences: {
        preload: path.join(__dirname, 'companion-preload.cjs'),
        contextIsolation: true, nodeIntegration: false, sandbox: true
      }
    });
    window = next;
    next.setMenuBarVisibility(false);
    next.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    next.webContents.on('will-navigate', (event, url) => {
      if (url !== origin + '/companion.html') event.preventDefault();
    });
    next.webContents.on('did-finish-load', sendState);
    next.on('closed', () => { if (window === next) window = null; });
    opening = next.loadURL(origin + '/companion.html');
    try {
      await opening;
      if (next.isDestroyed()) return;
      if (focus) { next.show(); next.focus(); }
      else if (parent.isVisible()) next.showInactive();
      return true;
    } catch(error) {
      if(!next.isDestroyed()) {
        next.destroy();
        throw error;
      }
      return false;
    } finally { opening = null; }
  }

  ipcMain.on('companion-publish', (event, value) => {
    if (!fromMap(event.sender) || !value || !['idle', 'agenda', 'previous-session', 'resource', 'sector', 'summary', 'forecast'].includes(value.mode)) return;
    state = value;
    sendState();
  });
  ipcMain.handle('companion-state-request', event => fromCompanion(event.sender) ? state : null);
  ipcMain.handle('companion-open', async event => {
    if (!fromMap(event.sender)) return false;
    await open({ focus: true });
    return true;
  });
  parent.webContents.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => {
    if (isMainFrame) { state = { mode: 'idle' }; sendState(); }
  });
  parent.webContents.on('render-process-gone', () => { state = { mode: 'idle' }; sendState(); });
  parent.on('closed', () => {
    window?.destroy();
    ipcMain.removeAllListeners('companion-publish');
    ipcMain.removeHandler('companion-state-request');
    ipcMain.removeHandler('companion-open');
  });
  return { open };
}

module.exports = { createCompanionWindow };
