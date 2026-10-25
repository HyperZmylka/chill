// Most między interfejsem Chill a procesem głównym (tylko bezpieczne API)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chill', {
  platform: process.platform,
  isPackaged: ipcRenderer.sendSync('chill:app-packaged') === true,
  chatPort: Number(process.env.CHILL_PORT) || 47830,

  auth: {
    session: () => ipcRenderer.invoke('chill:auth-session'),
    login: (payload) => ipcRenderer.invoke('chill:auth-login', payload),
    register: (payload) => ipcRenderer.invoke('chill:auth-register', payload),
    logout: () => ipcRenderer.invoke('chill:auth-logout'),
    updateProfile: (payload) => ipcRenderer.invoke('chill:auth-update-profile', payload),
    changePassword: (payload) => ipcRenderer.invoke('chill:auth-change-password', payload),
  },

  app: {
    version: () => ipcRenderer.invoke('chill:app-version'),
    autostartGet: () => ipcRenderer.invoke('chill:autostart-get'),
    autostartSet: (enabled) => ipcRenderer.invoke('chill:autostart-set', Boolean(enabled)),
    checkUpdates: () => ipcRenderer.invoke('chill:update-check'),
    installUpdate: () => ipcRenderer.invoke('chill:update-install'),
    openExternal: (url) => ipcRenderer.send('chill:shell-open-external', String(url)),
    screenSources: () => ipcRenderer.invoke('chill:screen-sources'),
    pickScreenSource: (id) => ipcRenderer.invoke('chill:screen-pick', String(id ?? '')),
  },

  chat: {
    setBadge: (count) => ipcRenderer.send('chill:badge', Number(count) || 0),
    notify: (n) => ipcRenderer.send('chill:notify', { title: n?.title, body: n?.body }),
    onActivity: (cb) => {
      ipcRenderer.on('chill:activity', (_e, name) => cb(name ?? null));
      ipcRenderer.send('chill:activity:ask');
    },
    askActivity: () => ipcRenderer.send('chill:activity:ask'),
    onUpdateReady: (cb) => {
      ipcRenderer.on('chill:update-ready', (_e, data) => cb(data ?? null));
      ipcRenderer.send('chill:update-ask');
    },
    onUpdateProgress: (cb) => {
      ipcRenderer.on('chill:update-progress', (_e, pct) => cb(Number(pct) || 0));
    },
  },

  servers: {
    list: () => ipcRenderer.invoke('chill:servers-list'),
    create: (payload) => ipcRenderer.invoke('chill:servers-create', payload),
    saveJoined: (payload) => ipcRenderer.invoke('chill:servers-save-joined', payload),
    leave: (payload) => ipcRenderer.invoke('chill:servers-leave', payload),
    invite: (payload) => ipcRenderer.invoke('chill:servers-invite', payload),
  },
});
