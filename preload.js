// Most między stroną czatu a Electronem (tylko bezpieczne rzeczy docierają do strony)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yapperDesktop', {
  version: process.env.npm_package_version || '',
  platform: process.platform,
  /** Odznaka na pasku zadań/doku. */
  setBadge: (count) => ipcRenderer.send('yapper:badge', Number(count) || 0),
  /** Powiadomienie natywne. */
  notify: (n) => ipcRenderer.send('yapper:notify', { title: n?.title, body: n?.body, url: n?.url }),
  /** Gra/aktywność użytkownika. */
  onActivity: (cb) => { ipcRenderer.on('yapper:activity', (_e, name) => cb(name ?? null)); ipcRenderer.send('yapper:activity:ask'); },
  /** Czy aplikacja ma własny wybór ekranu. */
  screenPicker: !(process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland'),
  /** Źródła ekranu/okien do udostępniania. */
  screenSources: () => ipcRenderer.invoke('yapper:screen-sources'),
  /** Zapamiętaj wybór do getDisplayMedia. */
  pickScreenSource: (id) => ipcRenderer.invoke('yapper:screen-pick', String(id ?? '')),
  /** Nowa aktualizacja do zainstalowania. */
  onUpdateReady: (cb) => { ipcRenderer.on('yapper:update-ready', (_e, data) => cb(data ?? null)); ipcRenderer.send('yapper:update-ask'); },
  /** Postęp pobierania aktualizacji w procentach. */
  onUpdateProgress: (cb) => { ipcRenderer.on('yapper:update-progress', (_e, pct) => cb(Number(pct) || 0)); },
  /** Zainstaluj aktualizację (pobiera instalator i uruchamia go). */
  installUpdate: () => ipcRenderer.invoke('yapper:update-install'),
  /** Otwórz link w zewnętrznej przeglądarce. */
  shellOpenExternal: (url) => ipcRenderer.send('yapper:shell-open-external', String(url)),
});
