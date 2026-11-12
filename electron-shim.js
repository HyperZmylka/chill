// Minimalny zamiennik API Electrona dla serwera publicznego.
// Pozwala uruchomić ten sam backend poleceniem `node main.js --server`
// bez instalowania Electrona i bez otwierania okna.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const packageJson = require('./package.json');

const paths = {
  userData: process.env.CHILL_DATA_DIR
    ? path.resolve(process.env.CHILL_DATA_DIR)
    : path.join(process.cwd(), 'chill-data'),
  temp: os.tmpdir(),
  appData: process.env.APPDATA || path.join(os.homedir(), '.config'),
  home: os.homedir(),
  desktop: path.join(os.homedir(), 'Desktop'),
  documents: path.join(os.homedir(), 'Documents'),
  downloads: path.join(os.homedir(), 'Downloads'),
  music: path.join(os.homedir(), 'Music'),
  pictures: path.join(os.homedir(), 'Pictures'),
  videos: path.join(os.homedir(), 'Videos'),
  logs: path.join(os.homedir(), 'logs'),
  crashDumps: path.join(os.homedir(), 'crash-dumps'),
};

function ensureDirectory(directory) {
  try {
    fs.mkdirSync(directory, { recursive: true });
  } catch {
    /* katalog może już istnieć lub nie być dostępny */
  }
  return directory;
}

class BrowserWindow {
  constructor() {
    this.webContents = {
      send() {},
      openDevTools() {},
      once() {},
      on() {},
      setWindowOpenHandler() {},
    };
    this.destroyed = false;
  }

  loadURL() { return Promise.resolve(); }
  loadFile() { return Promise.resolve(); }
  once() { return this; }
  on() { return this; }
  show() {}
  hide() {}
  focus() {}
  close() {}
  destroy() { this.destroyed = true; }
  isDestroyed() { return this.destroyed; }
  isMinimized() { return false; }
  isVisible() { return false; }
  restore() {}
  setSkipTaskbar() {}
  setProgressBar() {}
  setOverlayIcon() {}
  webContentsSend() {}
  get webContents() { return this._webContents || (this._webContents = { send() {} }); }
  set webContents(value) { this._webContents = value; }
}

class Tray {
  setToolTip() {}
  setContextMenu() {}
  setImage() {}
  on() {}
  destroy() {}
  popUpContextMenu() {}
}

const appState = {
  ready: true,
  quitting: false,
  name: 'Chill',
};

const app = {
  setName(name) { appState.name = String(name || 'Chill'); },
  getName() { return appState.name; },
  getVersion() { return packageJson.version; },
  isPackaged: false,
  isReady() { return true; },
  whenReady() { return Promise.resolve(); },
  setPath(key, value) {
    paths[key] = path.resolve(String(value));
    ensureDirectory(paths[key]);
  },
  getPath(key) {
    const directory = paths[key] || paths.userData;
    if (['userData', 'temp', 'appData', 'home', 'desktop', 'documents', 'downloads', 'music', 'pictures', 'videos', 'logs', 'crashDumps'].includes(key)) {
      ensureDirectory(directory);
    }
    return directory;
  },
  requestSingleInstanceLock() { return true; },
  quit() { process.exit(0); },
  exit(code = 0) { process.exit(code); },
  on() {},
  once() {},
  off() {},
  emit() {},
  setAsDefaultProtocolClient() { return true; },
  removeAsDefaultProtocolClient() { return true; },
  setAppUserModelId() {},
  setLoginItemSettings() {},
  getLoginItemSettings() { return { openAtLogin: false, openAsHidden: false }; },
  getFileIcon() { return Promise.resolve({ isEmpty: () => true, toDataURL: () => '' }); },
  dock: { show() {}, hide() {}, setBadge() {}, setIcon() {} },
  userAgentFallback: `Chill/${packageJson.version}`,
  commandLine: { appendSwitch() {} },
  disableHardwareAcceleration() {},
  whenReadyResolved: true,
};

const session = {
  defaultSession: {
    setPermissionRequestHandler() {},
    setPermissionCheckHandler() {},
    setDisplayMediaRequestHandler() {},
    setUserAgent() {},
    clearCache() { return Promise.resolve(); },
    cookies: {
      get() { return Promise.resolve([]); },
      set() { return Promise.resolve(); },
      remove() { return Promise.resolve(); },
    },
  },
  fromPartition() {
    return session.defaultSession;
  },
};

const desktopCapturer = {
  getSources() { return Promise.resolve([]); },
};

const Menu = {
  buildFromTemplate(template) { return { template }; },
  setApplicationMenu() {},
  getApplicationMenu() { return null; },
};

const nativeImage = {
  createFromPath() { return { isEmpty: () => true, toDataURL: () => '', resize: () => nativeImage.createFromPath() }; },
  createEmpty() { return { isEmpty: () => true, toDataURL: () => '', resize: () => nativeImage.createEmpty() }; },
  createFromDataURL() { return { isEmpty: () => true, toDataURL: () => '', resize: () => nativeImage.createEmpty() }; },
};

const shell = {
  openExternal() { return Promise.resolve(); },
  openPath() { return Promise.resolve(''); },
  showItemInFolder() {},
  trashItem() { return Promise.resolve(); },
  beep() {},
};

const ipcMain = {
  handle() {},
  handleOnce() {},
  removeHandler() {},
  on() {},
  once() {},
  off() {},
};

class Notification {
  static isSupported() { return false; }
  constructor() {}
  show() {}
  close() {}
  on() { return this; }
}

class NativeImage {
  createFromPath() { return nativeImage.createFromPath(); }
}

module.exports = {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  shell,
  session,
  desktopCapturer,
  ipcMain,
  Notification,
  NativeImage,
};
