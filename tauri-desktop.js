// Most między interfejsem Chill a powłoką Tauri.
// Działa tylko wtedy, gdy strona została otwarta w oknie Tauri z dostępem do IPC.
(() => {
  const tauri = window.__TAURI__;
  if (!tauri || !tauri.core || !tauri.core.invoke || !window.chill) return;

  const invoke = tauri.core.invoke;
  const listen = tauri.event?.listen;
  const app = window.chill;

  app.platform = 'tauri';
  app.web = false;
  app.isPackaged = true;

  const call = (name, args) => invoke(name, args);

  const dispatchInvite = (raw) => {
    const value = String(raw || '').trim();
    if (!value) return;
    app.pendingInvite = value;
    try { sessionStorage.setItem('chill.pendingInvite', value); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('chill:invite', { detail: value }));
  };
  const pullInvite = () => {
    call('chill_take_pending_invite').then(dispatchInvite).catch(() => {});
  };
  if (listen) {
    void listen('chill://invite', () => pullInvite());
  }
  pullInvite();

  app.app = app.app || {};
  app.app.version = () => call('chill_version');
  app.app.autostartGet = () => call('chill_autostart_get');
  app.app.autostartSet = (enabled) => call('chill_autostart_set', { enabled: Boolean(enabled) });
  app.app.openExternal = (url) => call('chill_open_external', { url: String(url) });
  app.app.screenSources = () => call('chill_screen_sources');
  app.app.pickScreenSource = () => true;
  app.app.checkUpdates = () => call('chill_update_check');
  app.app.installUpdate = () => call('chill_update_install');

  app.chat = app.chat || {};
  app.chat.setBadge = (count) => {
    void call('chill_set_badge', { count: Math.max(0, Number(count) || 0) });
  };
  app.chat.notify = (payload) => {
    void call('chill_notify', {
      title: String(payload?.title || 'Chill'),
      body: String(payload?.body || ''),
    });
  };
  app.chat.onActivity = (callback) => {
    if (!listen) return;
    void listen('chill://activity', (event) => callback(event.payload));
  };
  app.chat.askActivity = () => {
    void call('chill_activity_ask');
  };
  app.chat.onUpdateReady = (callback) => {
    if (!listen) return;
    void listen('chill://update-ready', (event) => callback(event.payload));
  };
  app.chat.onUpdateProgress = (callback) => {
    if (!listen) return;
    void listen('chill://update-progress', (event) => callback(event.payload));
  };

  const nativeOpen = window.open.bind(window);
  window.open = (url, ...args) => {
    try {
      const target = new URL(String(url), location.href);
      if (target.protocol === 'http:' || target.protocol === 'https:') {
        void call('chill_open_external', { url: target.href });
        return null;
      }
    } catch { /* ignore */ }
    return nativeOpen(url, ...args);
  };

  invoke('chill_version')
    .then((version) => {
      document.documentElement.dataset.runtime = 'tauri';
      document.title = `Chill ${version}`;
    })
    .catch(() => {});
})();
