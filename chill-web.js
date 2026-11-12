// Most między interfejsem Chill a serwerem aplikacji w trybie przeglądarki.
(() => {
  if (window.chill) return;

  function cookieValue(name) {
    try {
      for (const part of document.cookie.split(';')) {
        const index = part.indexOf('=');
        if (index < 0) continue;
        if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
      }
    } catch { /* ignore */ }
    return '';
  }

  async function bridge(channel, payload = {}) {
    const response = await fetch('/api/bridge', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-chill-csrf': cookieValue('chill_csrf'),
      },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ channel, payload }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.ok !== true) {
      throw new Error(data?.error || `Serwer odpowiedział kodem ${response.status}.`);
    }
    return data.result;
  }

  function setBadge(count) {
    const value = Number(count) || 0;
    document.title = value > 0 ? `(${value}) Chill` : 'Chill';
  }

  function notify(payload) {
    if (!('Notification' in window)) return;
    const show = () => {
      try {
        const note = new Notification(payload?.title || 'Chill', {
          body: payload?.body || '',
          icon: '/build/icon.png',
        });
        note.onclick = () => { try { window.focus(); } catch { /* ignore */ } };
      } catch { /* ignore */ }
    };
    if (Notification.permission === 'granted') {
      show();
      return;
    }
    if (Notification.permission === 'denied') return;
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') show();
    }).catch(() => {});
  }

  let uiScale = 1;

  function layoutForWidth(width) {
    if (width <= 760) return '760';
    if (width <= 1020) return '1020';
    if (width <= 1180) return '1180';
    return '';
  }

  function syncWebLayout() {
    const root = document.documentElement;
    // Powiększenie zmniejsza efektywną szerokość okna, więc układ
    // przełącza się na węższy wariant tak jak przy zoomie przeglądarki.
    const layout = uiScale > 1 ? layoutForWidth(window.innerWidth / uiScale) : '';
    if (layout) root.dataset.webLayout = layout;
    else delete root.dataset.webLayout;
  }

  function applyUiScale(scale) {
    const value = Number(scale);
    if (!Number.isFinite(value)) return null;
    uiScale = Math.max(0.75, Math.min(1.5, value));
    const root = document.documentElement;
    if (uiScale === 1) {
      root.classList.remove('chill-web-scale');
      root.style.removeProperty('--chill-ui-scale');
      delete root.dataset.webLayout;
      return uiScale;
    }
    root.classList.add('chill-web-scale');
    root.style.setProperty('--chill-ui-scale', String(uiScale));
    syncWebLayout();
    return uiScale;
  }

  window.addEventListener('resize', () => {
    if (uiScale !== 1) syncWebLayout();
  });

  // ---------- Aktualizacje strony ----------
  let webBuild = '';
  let buildCheckBusy = false;

  function isEnglish() {
    return document.documentElement.lang === 'en';
  }

  function showWebUpdateBanner() {
    if (document.getElementById('chillWebUpdate')) return;
    const english = isEnglish();
    const box = document.createElement('div');
    box.id = 'chillWebUpdate';
    box.setAttribute('role', 'status');
    box.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:24px',
      'transform:translateX(-50%)',
      'z-index:2147483000',
      'display:flex',
      'align-items:center',
      'gap:14px',
      'max-width:calc(100vw - 32px)',
      'padding:14px 16px',
      'border-radius:14px',
      'background:#1d242f',
      'color:#eef7f2',
      'border:1px solid rgba(62,224,163,.5)',
      'box-shadow:0 18px 50px rgba(0,0,0,.45)',
      'font:14px system-ui,-apple-system,"Segoe UI",sans-serif',
    ].join(';');
    const text = document.createElement('span');
    text.textContent = english
      ? 'A new version of Chill is available. Reload the page to update.'
      : 'Dostępna jest nowa wersja Chill. Odśwież stronę, aby ją wczytać.';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = english ? 'Reload' : 'Odśwież';
    button.style.cssText = [
      'border:0',
      'border-radius:9px',
      'padding:8px 14px',
      'background:#3ee0a3',
      'color:#082018',
      'font:600 14px system-ui,-apple-system,"Segoe UI",sans-serif',
      'cursor:pointer',
      'white-space:nowrap',
    ].join(';');
    button.addEventListener('click', () => location.reload());
    box.append(text, button);
    document.body.appendChild(box);
  }

  async function checkWebBuild() {
    if (buildCheckBusy) return;
    buildCheckBusy = true;
    try {
      const response = await fetch('/api/version', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return;
      const data = await response.json().catch(() => null);
      const build = String(data?.build || '');
      if (!build) return;
      if (!webBuild) {
        webBuild = build;
        return;
      }
      if (build !== webBuild) showWebUpdateBanner();
    } catch {
      /* połączenie może chwilowo nie działać */
    } finally {
      buildCheckBusy = false;
    }
  }

  function startWebUpdateWatch() {
    void checkWebBuild();
    setInterval(() => { void checkWebBuild(); }, 60_000);
    window.addEventListener('focus', () => { void checkWebBuild(); });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void checkWebBuild();
    });
  }

  startWebUpdateWatch();

  window.chill = {
    platform: 'web',
    web: true,
    isPackaged: false,
    chatPort: Number(location.port) || (location.protocol === 'https:' ? 443 : 80),
    chatUrl: location.origin,

    auth: {
      session: () => bridge('chill:auth-session'),
      login: (payload) => bridge('chill:auth-login', payload),
      register: (payload) => bridge('chill:auth-register', payload),
      logout: () => bridge('chill:auth-logout'),
      updateProfile: (payload) => bridge('chill:auth-update-profile', payload),
      changePassword: (payload) => bridge('chill:auth-change-password', payload),
    },

    app: {
      version: () => bridge('chill:app-version'),
      setUiScale: (scale) => applyUiScale(scale),
      autostartGet: async () => {
        try { return localStorage.getItem('chill.web.autostart') === '1'; } catch { return false; }
      },
      autostartSet: async (enabled) => {
        const value = Boolean(enabled);
        try { localStorage.setItem('chill.web.autostart', value ? '1' : '0'); } catch { /* ignore */ }
        return value;
      },
      setLanguage: (lang) => {
        try { localStorage.setItem('chill.lang', lang === 'en' ? 'en' : 'pl'); } catch { /* ignore */ }
      },
      checkUpdates: () => bridge('chill:update-check'),
      installUpdate: async () => false,
      openExternal: (url) => {
        try {
          const target = new URL(String(url));
          if (target.protocol !== 'http:' && target.protocol !== 'https:') return;
          window.open(target.href, '_blank', 'noopener');
        } catch { /* ignore */ }
      },
      screenSources: async () => [{
        id: 'browser-screen',
        name: 'Ekran lub okno',
        kind: 'screen',
        thumb: null,
        icon: null,
      }],
      pickScreenSource: () => true,
    },

    chat: {
      setBadge,
      notify,
      onActivity: () => {},
      askActivity: () => {},
      onUpdateReady: () => {},
      onUpdateProgress: () => {},
    },

    servers: {
      list: () => bridge('chill:servers-list'),
      create: (payload) => bridge('chill:servers-create', payload),
      saveJoined: (payload) => bridge('chill:servers-save-joined', payload),
      leave: (payload) => bridge('chill:servers-leave', payload),
      invite: (payload) => bridge('chill:servers-invite', payload),
    },

    discord: {
      configGet: () => bridge('chill:discord-config-get'),
      configSet: (payload) => bridge('chill:discord-config-set', payload),
      connect: () => bridge('chill:discord-connect'),
      disconnect: () => bridge('chill:discord-disconnect'),
      cancel: () => bridge('chill:discord-cancel'),
      preview: (payload) => bridge('chill:discord-preview', payload),
      importServer: (payload) => bridge('chill:discord-import', payload),
    },
  };
})();
