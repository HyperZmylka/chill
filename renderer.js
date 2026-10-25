// Chill — logika interfejsu (konta, czat, ustawienia)
'use strict';

const CHILL = window.chill || {};
const WS_URL = 'ws://127.0.0.1:47830/chat';
const $ = (id) => document.getElementById(id);

// ---------- Emoji ----------
const EMOJI_GROUPS = [
  { name: 'Emocje', items: ['😀', '😁', '😂', '🤣', '😊', '😉', '😍', '🥰', '😘', '😋', '😎', '🤩', '🥳', '😏', '😢', '😭', '😤', '😡', '🤬', '😱', '😳', '🤔', '🤨', '😐', '🙄', '😴', '🤯', '🥺', '😬', '🤗', '🤭', '🤫', '😅', '😇', '🙃', '😜', '🤪'] },
  { name: 'Ludzie', items: ['👋', '🤚', '✋', '🖖', '👌', '🤞', '✌️', '🤟', '🤘', '👍', '👎', '👊', '✊', '👏', '🙌', '🤝', '🙏', '💪', '🫶', '🫡'] },
  { name: 'Serca', items: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '✨', '💫'] },
  { name: 'Zwierzęta', items: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦄', '🐝', '🦋', '🐢', '🐙'] },
  { name: 'Jedzenie', items: ['🍕', '🍔', '🍟', '🌮', '🍣', '🍜', '🍩', '🍪', '🎂', '🍰', '🍫', '🍿', '🍎', '🍌', '🍓', '🍇', '🥑', '☕', '🍵', '🧋', '🍺', '🥤'] },
  { name: 'Aktywność', items: ['🎮', '🕹️', '🎧', '🎵', '🎬', '📷', '🎨', '✍️', '📚', '💻', '📱', '🏆', '⚽', '🏀', '🎯', '🎲', '🧩', '🚀', '🛹', '🏋️'] },
  { name: 'Natura', items: ['🌍', '🌙', '⭐', '🌈', '☀️', '🌧️', '❄️', '🔥', '💧', '🌊', '🏔️', '🌲', '🌸', '🍀'] },
  { name: 'Symbole', items: ['✅', '❌', '⚠️', '💡', '🔔', '🔒', '🔑', '📌', '📎', '🗑️', '⏰', '⏳', '🔗', '➕', '➖', '✔️', '❗', '❓', '💤', '🎉', '🎊', '🎁', '💯'] },
];

const EMOJI_KEYWORDS = {
  '😀': 'usmiech radosc', '😂': 'smiech lol', '🤣': 'smiech lol', '😊': 'usmiech', '😍': 'milosc serca oczy',
  '🥰': 'milosc', '😘': 'calus', '😎': 'okulary cool', '🤩': 'gwiazdy wow', '🥳': 'impreza urodziny',
  '😢': 'placz smutek', '😭': 'placz', '😡': 'zlosc', '🤬': 'zlosc', '😱': 'strach', '🤔': 'myslenie',
  '😴': 'sen', '🤯': 'szok', '🥺': 'prosba', '🤗': 'przytulenie', '🤫': 'cisza', '😅': 'nerwowy smiech',
  '👋': 'czesc machanie', '👍': 'ok super', '👎': 'nie', '👏': 'brawo', '🙌': 'brawo', '🤝': 'umowa',
  '🙏': 'prosze dziekuje', '💪': 'sila', '❤️': 'serce milosc', '💔': 'zlamane serce', '✨': 'iskry',
  '🐶': 'pies', '🐱': 'kot', '🦊': 'lis', '🐻': 'niedzwiedz', '🐼': 'panda', '🦄': 'jednorozec',
  '🍕': 'pizza', '🍔': 'burger', '🍟': 'frytki', '🍣': 'sushi', '🍩': 'paczki', '🍪': 'ciastko',
  '🎂': 'tort urodziny', '🍫': 'czekolada', '☕': 'kawa', '🍺': 'piwo', '🧋': 'bubble tea',
  '🎮': 'gra gry pad', '🎧': 'sluchawki muzyka', '🎵': 'muzyka nuta', '🎬': 'film', '📷': 'zdjecie',
  '💻': 'komputer laptop', '📱': 'telefon', '🏆': 'puchar wygrana', '⚽': 'pilka nozna', '🎲': 'kostka',
  '🚀': 'rakieta start', '🌙': 'ksiezyc noc', '⭐': 'gwiazda', '🌈': 'tecza', '☀️': 'slonce',
  '❄️': 'snieg zima', '🔥': 'ogien', '🌊': 'morze fala', '🌸': 'kwiat', '🍀': 'szczescie',
  '✅': 'tak ok', '❌': 'nie blad', '⚠️': 'uwaga', '💡': 'pomysl', '🔔': 'dzwonek', '🔒': 'zamkniete',
  '🎉': 'impreza', '🎁': 'prezent', '💯': 'sto procent', '💤': 'spanie',
};

const EMOJIS = EMOJI_GROUPS.flatMap((g) => g.items.map((char) => ({
  char,
  keys: `${g.name} ${EMOJI_KEYWORDS[char] || ''}`.toLowerCase(),
})));
const EMOJI_BY_CHAR = new Map(EMOJIS.map((e) => [e.char, e]));

// ---------- Stan ----------
let currentUser = null;
let myId = '';
let myName = 'Ty';
let myColor = '#3ee0a3';
let myAbout = '';
let ws = null;
let reconnectTimer = null;
let rooms = [];
let allUsers = [];
let playing = null;
let searchQuery = '';
let current = { kind: 'room', id: 'lounge' };
let profileColor = '#3ee0a3';
let regColor = '#3ee0a3';
let downloadingUpdate = false;
let audioCtx = null;

const history = new Map();
const unread = new Map();
const typingUsers = new Map();

const DEFAULT_PREFS = {
  theme: 'dark',
  accent: '#3ee0a3',
  compact: false,
  notify: true,
  sound: true,
  mentionsOnly: false,
  gameDetect: true,
  status: 'online',
};
let prefs = { ...DEFAULT_PREFS };

// ---------- Pomocnicze ----------
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const initial = (name) => String(name || '?').trim().charAt(0).toUpperCase() || '?';
const statusLabel = (s) => ({ online: 'Online', away: 'Zaraz wracam', dnd: 'Nie przeszkadzać', invisible: 'Niewidoczny', offline: 'Offline' }[s] || 'Online');
const formatTime = (at) => new Date(at || Date.now()).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
const dayKey = (at) => new Date(at || Date.now()).toDateString();
function dayLabel(at) {
  const d = new Date(at || Date.now());
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Dzisiaj';
  if (d.toDateString() === yesterday.toDateString()) return 'Wczoraj';
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

function prefsKey() { return `chill.prefs.${myId || 'guest'}`; }
function recentKey() { return `chill.recent.${myId || 'guest'}`; }

function loadPrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem(prefsKey()) || '{}');
    prefs = { ...DEFAULT_PREFS, ...stored };
  } catch {
    prefs = { ...DEFAULT_PREFS };
  }
}
function savePrefs() {
  try { localStorage.setItem(prefsKey(), JSON.stringify(prefs)); } catch { /* ignore */ }
  localStorage.setItem('chill.theme', prefs.theme);
  localStorage.setItem('chill.accent', prefs.accent);
}

function applyTheme(theme) {
  const value = theme === 'light' ? 'light' : 'dark';
  document.body.dataset.theme = value;
  prefs.theme = value;
  document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.themeChoice === value);
  });
}

function applyAccent(color) {
  const value = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#3ee0a3';
  document.documentElement.style.setProperty('--accent', value);
  document.documentElement.style.setProperty('--accent-2', `color-mix(in srgb, ${value} 58%, #9fe8ff)`);
  prefs.accent = value;
  document.querySelectorAll('[data-accent]').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.accent.toLowerCase() === value.toLowerCase());
  });
}

function toast(text, ms = 2600) {
  const el = $('toast');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.hidden = true; }, 200);
  }, ms);
}

function markColorSelection(container, color) {
  if (!container) return;
  container.querySelectorAll('button').forEach((btn) => {
    const value = btn.dataset.color || btn.dataset.regColor || btn.dataset.accent;
    btn.classList.toggle('selected', value && value.toLowerCase() === String(color).toLowerCase());
  });
}

// ---------- Start ----------
document.addEventListener('DOMContentLoaded', () => {
  document.body.dataset.theme = localStorage.getItem('chill.theme') === 'light' ? 'light' : 'dark';
  applyAccent(localStorage.getItem('chill.accent') || '#3ee0a3');
  bindAuth();
  bindChat();
  bindEmoji();
  bindSettings();
  bindShortcuts();
  boot();
});

async function boot() {
  const started = Date.now();
  let user = null;
  try {
    const result = await CHILL.auth.session();
    if (result && result.ok) user = result.user;
  } catch { /* ignore */ }

  const wait = Math.max(0, 520 - (Date.now() - started));
  setTimeout(() => {
    $('bootSplash').hidden = true;
    if (user) enterApp(user);
    else showAuth('login');
  }, wait);
}

// ============================================================
// AUTORYZACJA
// ============================================================
function bindAuth() {
  $('tabLogin').addEventListener('click', () => switchAuthTab('login'));
  $('tabRegister').addEventListener('click', () => switchAuthTab('register'));
  $('goRegister').addEventListener('click', () => switchAuthTab('register'));
  $('goLogin').addEventListener('click', () => switchAuthTab('login'));

  $('loginForm').addEventListener('submit', handleLogin);
  $('registerForm').addEventListener('submit', handleRegister);

  bindPasswordToggle('toggleLoginPassword', 'loginPassword');
  bindPasswordToggle('toggleRegPassword', 'regPassword');

  $('loginPassword').addEventListener('keyup', (e) => {
    $('capsHint').hidden = !(e.getModifierState && e.getModifierState('CapsLock'));
  });
  $('loginPassword').addEventListener('blur', () => { $('capsHint').hidden = true; });

  $('regPassword').addEventListener('input', updateStrength);
  $('regColors').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-reg-color]');
    if (!btn) return;
    regColor = btn.dataset.regColor;
    markColorSelection($('regColors'), regColor);
  });
  markColorSelection($('regColors'), regColor);
}

function bindPasswordToggle(buttonId, inputId) {
  const btn = $(buttonId);
  const input = $(inputId);
  if (!btn || !input) return;
  btn.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.textContent = show ? 'Ukryj' : 'Pokaż';
    btn.setAttribute('aria-label', show ? 'Ukryj hasło' : 'Pokaż hasło');
    input.focus();
  });
}

function switchAuthTab(mode) {
  const login = mode === 'login';
  $('tabLogin').classList.toggle('active', login);
  $('tabRegister').classList.toggle('active', !login);
  $('tabLogin').setAttribute('aria-selected', String(login));
  $('tabRegister').setAttribute('aria-selected', String(!login));
  $('loginForm').style.display = login ? 'grid' : 'none';
  $('registerForm').style.display = login ? 'none' : 'grid';
  $('authTitle').textContent = login ? 'Witaj ponownie' : 'Zacznij w Chill';
  $('authSubtitle').textContent = login
    ? 'Zaloguj się, aby wrócić do swoich rozmów.'
    : 'Utwórz konto i dołącz do rozmowy w kilka sekund.';
  $('loginError').textContent = '';
  $('registerError').textContent = '';
  setTimeout(() => (login ? $('loginIdentifier') : $('regEmail')).focus(), 40);
}

function showAuth(mode = 'login') {
  $('loginScreen').style.display = 'grid';
  $('chatApp').style.display = 'none';
  $('bootSplash').hidden = true;
  switchAuthTab(mode);
}

function setAuthBusy(buttonId, busy) {
  const btn = $(buttonId);
  if (!btn) return;
  btn.disabled = busy;
  btn.classList.toggle('loading', busy);
}

async function handleLogin(e) {
  e.preventDefault();
  const identifier = $('loginIdentifier').value.trim();
  const password = $('loginPassword').value;
  const errorEl = $('loginError');
  errorEl.textContent = '';

  if (!identifier || !password) {
    errorEl.textContent = 'Podaj login i hasło.';
    return;
  }

  setAuthBusy('loginSubmit', true);
  try {
    const result = await CHILL.auth.login({ identifier, password, remember: $('rememberMe').checked });
    if (!result || !result.ok) {
      errorEl.textContent = result?.error || 'Nie udało się zalogować.';
      return;
    }
    $('loginPassword').value = '';
    enterApp(result.user);
  } catch {
    errorEl.textContent = 'Wystąpił błąd. Spróbuj ponownie.';
  } finally {
    setAuthBusy('loginSubmit', false);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const errorEl = $('registerError');
  errorEl.textContent = '';

  const payload = {
    email: $('regEmail').value.trim(),
    username: $('regUsername').value.trim(),
    displayName: $('regDisplayName').value.trim(),
    password: $('regPassword').value,
    color: regColor,
  };

  if (!payload.email || !payload.username || !payload.password) {
    errorEl.textContent = 'Uzupełnij e-mail, nazwę użytkownika i hasło.';
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) {
    errorEl.textContent = 'Podaj poprawny adres e-mail.';
    return;
  }
  if (!/^[a-zA-Z0-9_.]{3,20}$/.test(payload.username)) {
    errorEl.textContent = 'Nazwa użytkownika: 3–20 znaków (litery, cyfry, _ i .).';
    return;
  }
  if (payload.password.length < 8) {
    errorEl.textContent = 'Hasło musi mieć co najmniej 8 znaków.';
    return;
  }

  setAuthBusy('registerSubmit', true);
  try {
    const result = await CHILL.auth.register(payload);
    if (!result || !result.ok) {
      errorEl.textContent = result?.error || 'Nie udało się utworzyć konta.';
      return;
    }
    $('regPassword').value = '';
    enterApp(result.user);
  } catch {
    errorEl.textContent = 'Wystąpił błąd. Spróbuj ponownie.';
  } finally {
    setAuthBusy('registerSubmit', false);
  }
}

function updateStrength() {
  const value = $('regPassword').value;
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^a-zA-Z0-9]/.test(value)) score += 1;
  score = Math.min(score, 4);

  const bar = $('regStrength');
  const label = $('regStrengthLabel');
  const data = [
    { width: '0%', color: 'var(--danger)', text: 'Użyj co najmniej 8 znaków.' },
    { width: '28%', color: 'var(--danger)', text: 'Słabe hasło' },
    { width: '52%', color: 'var(--warning)', text: 'Średnie hasło' },
    { width: '76%', color: 'var(--accent-2)', text: 'Dobre hasło' },
    { width: '100%', color: 'var(--success)', text: 'Silne hasło' },
  ][value ? score : 0];
  bar.style.width = data.width;
  bar.style.background = data.color;
  label.textContent = data.text;
}

function enterApp(user) {
  currentUser = user;
  myId = user.id;
  myName = user.displayName || user.username;
  myColor = user.color || '#3ee0a3';
  myAbout = user.about || '';
  playing = null;
  current = { kind: 'room', id: 'lounge' };
  rooms = [];
  allUsers = [];
  history.clear();
  unread.clear();
  typingUsers.clear();
  searchQuery = '';

  loadPrefs();
  applyTheme(prefs.theme);
  applyAccent(prefs.accent);

  $('loginScreen').style.display = 'none';
  $('chatApp').style.display = 'grid';
  $('bootSplash').hidden = true;
  $('chatApp').classList.toggle('compact', prefs.compact);
  $('messageSearch').value = '';
  $('searchBar').hidden = true;
  $('conversationSearch').value = '';

  renderIdentity();
  $('settingsUsername').textContent = `@${user.username}`;
  connect();
  loadAppInfo();
  if (CHILL.chat?.askActivity) CHILL.chat.askActivity();
  setTimeout(() => $('messageInput').focus(), 120);
}

function logout() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (ws) {
    ws.onclose = null;
    try { ws.close(); } catch { /* ignore */ }
    ws = null;
  }
  if (CHILL.auth?.logout) CHILL.auth.logout().catch(() => {});

  currentUser = null;
  myId = '';
  rooms = [];
  allUsers = [];
  history.clear();
  unread.clear();
  typingUsers.clear();
  playing = null;
  searchQuery = '';
  $('messages').innerHTML = '';
  $('roomList').innerHTML = '';
  $('dmList').innerHTML = '';
  $('userList').innerHTML = '';
  $('loginPassword').value = '';
  $('loginError').textContent = '';
  document.title = 'Chill';
  if (CHILL.chat?.setBadge) CHILL.chat.setBadge(0);

  showAuth('login');
  toast('Wylogowano');
}

function renderIdentity() {
  if (!currentUser) return;
  $('myAvatar').textContent = initial(myName);
  $('myAvatar').style.background = myColor;
  $('myName').textContent = myName;
  const extra = playing ? ` • ${playing}` : '';
  $('myStatus').textContent = statusLabel(prefs.status) + extra;
  $('settingsAvatar').textContent = initial(myName);
  $('settingsAvatar').style.background = myColor;
  $('settingsName').textContent = myName;
}

// ============================================================
// CZAT
// ============================================================
function bindChat() {
  $('composer').addEventListener('submit', sendCurrentMessage);
  const input = $('messageInput');
  input.addEventListener('input', () => {
    resizeInput();
    $('sendBtn').disabled = !input.value.trim() || !wsReady();
    sendTyping();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('composer').requestSubmit();
    }
  });

  $('logoutBtn').addEventListener('click', logout);
  $('conversationSearch').addEventListener('input', () => {
    renderRooms();
    renderDmList();
  });
  $('searchBtn').addEventListener('click', toggleMessageSearch);
  $('closeSearch').addEventListener('click', () => setMessageSearch(false));
  $('messageSearch').addEventListener('input', () => {
    searchQuery = $('messageSearch').value.trim().toLowerCase();
    renderMessages(false);
  });
  $('membersBtn').addEventListener('click', () => {
    const app = $('chatApp');
    app.classList.toggle('members-closed');
    $('membersBtn').classList.toggle('active', !app.classList.contains('members-closed'));
  });

  if (CHILL.chat?.onActivity) {
    CHILL.chat.onActivity((name) => {
      playing = prefs.gameDetect ? (name || null) : null;
      renderIdentity();
      if (wsReady()) ws.send(JSON.stringify({ type: 'activity', playing }));
    });
  }

  if (CHILL.chat?.onUpdateReady) {
    CHILL.chat.onUpdateReady((info) => showUpdate(info));
  }
  if (CHILL.chat?.onUpdateProgress) {
    CHILL.chat.onUpdateProgress((pct) => {
      if (!downloadingUpdate) return;
      $('updateBtn').textContent = `Pobieram… ${pct}%`;
      $('updateText').textContent = `Pobieranie instalatora — ${pct}%`;
    });
  }
  $('updateBtn').addEventListener('click', async () => {
    if (downloadingUpdate) return;
    downloadingUpdate = true;
    $('updateBtn').disabled = true;
    $('updateBtn').textContent = 'Pobieram… 0%';
    $('updateText').textContent = 'Pobieranie instalatora — 0%';
    try {
      const started = CHILL.app?.installUpdate ? await CHILL.app.installUpdate() : false;
      if (started) {
        $('updateBtn').textContent = 'Uruchamiam instalator…';
        $('updateText').textContent = 'Za chwilę otworzy się instalator. Możesz zamknąć Chill.';
        toast('Pobrano aktualizację — uruchamiam instalator', 4000);
      } else {
        $('updateBtn').disabled = false;
        $('updateBtn').textContent = 'Pobierz ręcznie';
        $('updateText').textContent = 'Otworzyłem stronę pobierania w przeglądarce.';
      }
    } catch {
      $('updateBtn').disabled = false;
      $('updateBtn').textContent = 'Spróbuj ponownie';
    } finally {
      downloadingUpdate = false;
    }
  });
}

function resizeInput() {
  const input = $('messageInput');
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
}

function wsReady() {
  return ws && ws.readyState === WebSocket.OPEN;
}

function connect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (ws) {
    ws.onclose = null;
    try { ws.close(); } catch { /* ignore */ }
    ws = null;
  }
  if (!currentUser) return;

  const socket = new WebSocket(WS_URL);
  ws = socket;

  socket.onopen = () => {
    if (ws !== socket) return;
    socket.send(JSON.stringify({
      type: 'join',
      userId: myId,
      name: myName,
      color: myColor,
      playing: prefs.gameDetect ? playing : null,
    }));
  };

  socket.onmessage = (event) => {
    if (ws !== socket) return;
    try { handleMessage(JSON.parse(event.data)); } catch { /* ignore */ }
  };

  socket.onclose = () => {
    if (ws !== socket) return;
    ws = null;
    if (!currentUser) return;
    reconnectTimer = setTimeout(connect, 2500);
  };

  socket.onerror = () => {};
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'joined': {
      rooms = Array.isArray(msg.rooms) ? msg.rooms : [];
      allUsers = Array.isArray(msg.users) ? msg.users : [];
      history.clear();
      for (const room of rooms) {
        history.set(`room:${room.id}`, Array.isArray(room.messages) ? room.messages.slice(-300) : []);
      }
      for (const [key, list] of Object.entries(msg.dmHistory || {})) {
        const other = key.split('|').find((part) => part !== myId);
        if (other) history.set(`dm:${other}`, Array.isArray(list) ? list.slice(-300) : []);
      }
      if (!isValidConversation()) {
        const first = rooms[0];
        current = first ? { kind: 'room', id: first.id } : { kind: 'room', id: 'lounge' };
      }
      renderRooms();
      renderDmList();
      renderMembers();
      renderHeader();
      renderMessages(false);
      updateBadges();
      if (wsReady()) {
        ws.send(JSON.stringify({ type: 'status', status: prefs.status }));
        if (prefs.gameDetect && playing) ws.send(JSON.stringify({ type: 'activity', playing }));
      }
      break;
    }

    case 'message': {
      const m = msg.message;
      if (!m || m.authorId === myId) return;
      pushHistory(`room:${m.roomId}`, m);
      if (current.kind === 'room' && current.id === m.roomId) {
        const nearBottom = isNearBottom();
        if (!searchQuery) renderMessages(false);
        if (nearBottom || !searchQuery) scrollBottom();
      } else {
        bumpUnread(`room:${m.roomId}`);
        renderRooms();
        updateBadges();
      }
      notifyIncoming(m, rooms.find((r) => r.id === m.roomId)?.name || 'Pokój', current.kind === 'room' && current.id === m.roomId);
      break;
    }

    case 'dm': {
      const m = msg.message;
      if (!m || m.authorId === myId) return;
      const other = m.authorId === myId ? m.to : m.authorId;
      pushHistory(`dm:${other}`, m);
      if (current.kind === 'dm' && current.id === other) {
        if (!searchQuery) renderMessages(false);
        scrollBottom();
      } else {
        bumpUnread(`dm:${other}`);
        renderDmList();
        updateBadges();
      }
      renderMembers();
      const user = allUsers.find((u) => u.id === other);
      notifyIncoming(m, user?.name || 'Wiadomość prywatna', current.kind === 'dm' && current.id === other);
      break;
    }

    case 'user:update':
    case 'users:list': {
      if (Array.isArray(msg.users)) {
        allUsers = msg.users;
        renderDmList();
        renderMembers();
        if (current.kind === 'dm') renderHeader();
      }
      break;
    }

    case 'user:typing': {
      if (msg.userId === myId) return;
      if (msg.roomId && msg.roomId !== current.id) return;
      if (current.kind !== 'room') return;
      if (msg.typing) {
        typingUsers.set(msg.userId, { name: msg.name, until: Date.now() + 1800 });
        clearTimeout(typingUsers.get(msg.userId)._timer);
        const entry = typingUsers.get(msg.userId);
        entry._timer = setTimeout(() => {
          typingUsers.delete(msg.userId);
          renderTyping();
        }, 1800);
      } else {
        typingUsers.delete(msg.userId);
      }
      renderTyping();
      break;
    }

    case 'dm:typing': {
      if (msg.userId === myId) return;
      if (current.kind !== 'dm' || current.id !== msg.userId) return;
      if (msg.typing) {
        typingUsers.set(msg.userId, { name: msg.name, until: Date.now() + 1800 });
        clearTimeout(typingUsers.get(msg.userId)._timer);
        const entry = typingUsers.get(msg.userId);
        entry._timer = setTimeout(() => {
          typingUsers.delete(msg.userId);
          renderTyping();
        }, 1800);
      } else {
        typingUsers.delete(msg.userId);
      }
      renderTyping();
      break;
    }

    case 'profile:updated': {
      if (msg.user) {
        currentUser = { ...currentUser, ...msg.user };
        myName = currentUser.displayName;
        myColor = currentUser.color;
        renderIdentity();
      }
      break;
    }

    case 'auth-error': {
      toast(msg.message || 'Sesja wygasła. Zaloguj się ponownie.', 4000);
      logout();
      break;
    }
  }
}

function isValidConversation() {
  if (current.kind === 'room') return rooms.some((r) => r.id === current.id);
  return allUsers.some((u) => u.id === current.id);
}

function bumpUnread(key) {
  unread.set(key, (unread.get(key) || 0) + 1);
}

function pushHistory(key, message) {
  const list = history.get(key) || [];
  list.push(message);
  if (list.length > 300) list.shift();
  history.set(key, list);
}

function selectConversation(kind, id) {
  current = { kind, id };
  unread.delete(kind === 'room' ? `room:${id}` : `dm:${id}`);
  searchQuery = '';
  $('messageSearch').value = '';
  $('searchBar').hidden = true;
  $('messages').classList.remove('searching');
  typingUsers.clear();
  renderTyping();
  renderRooms();
  renderDmList();
  renderHeader();
  renderMessages(false);
  scrollBottom();
  updateBadges();
  $('messageInput').focus();
}

function renderRoomIcon(room) {
  return `<span class="nav-icon">${esc(room.emoji || '#')}</span>`;
}

function renderRooms() {
  const container = $('roomList');
  if (!container) return;
  const query = $('conversationSearch').value.trim().toLowerCase();
  const list = rooms.filter((room) => !query || room.name.toLowerCase().includes(query) || (room.topic || '').toLowerCase().includes(query));
  container.innerHTML = '';

  if (!list.length) {
    container.innerHTML = '<div class="nav-empty">Brak pokoi</div>';
    return;
  }

  for (const room of list) {
    const key = `room:${room.id}`;
    const isActive = current.kind === 'room' && current.id === room.id;
    const count = isActive ? 0 : unread.get(key) || 0;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `nav-item${isActive ? ' active' : ''}${count ? ' unread' : ''}`;
    button.innerHTML = `
      ${renderRoomIcon(room)}
      <span class="nav-label">${esc(room.name)}</span>
      ${count ? `<span class="nav-badge">${count > 99 ? '99+' : count}</span>` : ''}
    `;
    button.addEventListener('click', () => selectConversation('room', room.id));
    container.appendChild(button);
  }
}

function renderDmList() {
  const container = $('dmList');
  if (!container) return;
  const query = $('conversationSearch').value.trim().toLowerCase();
  const others = allUsers
    .filter((u) => u.id !== myId)
    .filter((u) => !query || u.name.toLowerCase().includes(query) || u.username.toLowerCase().includes(query))
    .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'pl'));

  container.innerHTML = '';
  if (!others.length) {
    container.innerHTML = '<div class="nav-empty">Brak innych kont</div>';
    return;
  }

  for (const user of others) {
    const key = `dm:${user.id}`;
    const isActive = current.kind === 'dm' && current.id === user.id;
    const count = isActive ? 0 : unread.get(key) || 0;
    const status = user.online ? user.status : 'offline';
    const sub = user.playing ? `Gra w ${user.playing}` : statusLabel(status);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `nav-item${isActive ? ' active' : ''}${count ? ' unread' : ''}`;
    button.innerHTML = `
      <span class="nav-avatar" style="background:${esc(user.color)}">
        ${esc(initial(user.name))}
        <span class="status-dot ${esc(status)}"></span>
      </span>
      <span class="nav-label">${esc(user.name)}<span class="nav-sub">${esc(sub)}</span></span>
      ${count ? `<span class="nav-badge">${count > 99 ? '99+' : count}</span>` : ''}
    `;
    button.addEventListener('click', () => selectConversation('dm', user.id));
    container.appendChild(button);
  }
}

function renderMembers() {
  const container = $('userList');
  if (!container) return;
  const online = allUsers.filter((u) => u.online);
  $('onlineBadge').textContent = String(online.length);
  $('onlineBadge').classList.toggle('empty', online.length === 0);

  const sorted = [...allUsers].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'pl'));
  container.innerHTML = '';
  for (const user of sorted) {
    const status = user.online ? user.status : 'offline';
    const sub = user.playing ? `Gra w ${user.playing}` : statusLabel(status);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'member';
    item.innerHTML = `
      <span class="member-avatar" style="background:${esc(user.color)}">
        ${esc(initial(user.name))}
        <span class="status-dot ${esc(status)}"></span>
      </span>
      <span class="member-info">
        <strong>${esc(user.name)}${user.id === myId ? ' (Ty)' : ''}</strong>
        <small>${esc(sub)}</small>
      </span>
    `;
    item.addEventListener('click', () => {
      if (user.id === myId) openSettings('profile');
      else selectConversation('dm', user.id);
    });
    container.appendChild(item);
  }
}

function renderHeader() {
  $('backBtn').style.display = 'none';
  if (current.kind === 'dm') {
    const user = allUsers.find((u) => u.id === current.id);
    const status = user ? (user.online ? user.status : 'offline') : 'offline';
    $('chatEmoji').textContent = initial(user?.name || '?');
    $('chatEmoji').style.background = user?.color || 'var(--panel-2)';
    $('chatEmoji').style.color = '#06251b';
    $('chatName').textContent = user?.name || 'Rozmowa prywatna';
    $('chatSub').textContent = user?.playing ? `Gra w ${user.playing} • ${statusLabel(status)}` : statusLabel(status);
  } else {
    const room = rooms.find((r) => r.id === current.id) || rooms[0];
    $('chatEmoji').textContent = room?.emoji || '#';
    $('chatEmoji').style.background = 'var(--panel-2)';
    $('chatEmoji').style.color = 'var(--text)';
    $('chatName').textContent = room?.name || 'Lounge';
    const online = allUsers.filter((u) => u.online).length;
    $('chatSub').textContent = `${room?.topic || ''}${room?.topic ? ' • ' : ''}${online} online`;
  }
}

function conversationKey() {
  return `${current.kind}:${current.id}`;
}

function renderMessages(scroll = true) {
  const container = $('messages');
  if (!container) return;
  const key = conversationKey();
  let list = history.get(key) || [];

  container.classList.toggle('searching', Boolean(searchQuery));
  container.innerHTML = '';

  if (searchQuery) {
    list = list.filter((m) => String(m.text).toLowerCase().includes(searchQuery));
  }

  if (!list.length) {
    const room = rooms.find((r) => r.id === current.id);
    const user = allUsers.find((u) => u.id === current.id);
    const wrap = document.createElement('div');
    wrap.className = 'empty-chat';
    wrap.innerHTML = searchQuery
      ? `<div class="empty-ico">⌕</div><h3>Brak wyników</h3><p>Nie znaleziono wiadomości pasujących do „${esc($('messageSearch').value.trim())}”.</p>`
      : `<div class="empty-ico">${current.kind === 'room' ? esc(room?.emoji || '💬') : esc(initial(user?.name || '?'))}</div>
         <h3>${current.kind === 'room' ? esc(room?.name || 'Lounge') : esc(user?.name || 'Rozmowa')}</h3>
         <p>${current.kind === 'room' ? 'To początek tego pokoju. Napisz pierwszą wiadomość!' : 'To początek Waszej prywatnej rozmowy.'}</p>`;
    container.appendChild(wrap);
    if (scroll) scrollBottom();
    return;
  }

  let lastDay = '';
  let prev = null;
  for (const message of list) {
    const day = dayKey(message.at);
    if (day !== lastDay) {
      const divider = document.createElement('div');
      divider.className = 'day-divider';
      divider.textContent = dayLabel(message.at);
      container.appendChild(divider);
      lastDay = day;
      prev = null;
    }
    const grouped = prev && prev.authorId === message.authorId && (message.at - prev.at) < 5 * 60 * 1000;
    container.appendChild(buildMessage(message, grouped));
    prev = message;
  }

  if (scroll) scrollBottom();
}

function buildMessage(message, grouped) {
  const own = message.authorId === myId;
  const el = document.createElement('div');
  el.className = `msg${own ? ' own' : ''}${grouped ? ' grouped' : ''}${searchQuery ? ' search-hit' : ''}`;
  el.dataset.id = message.id;

  const avatar = document.createElement('span');
  avatar.className = `msg-avatar${grouped ? ' hidden' : ''}`;
  avatar.style.background = message.authorColor || 'var(--accent)';
  avatar.textContent = initial(message.authorName);

  const main = document.createElement('div');
  main.className = 'msg-main';

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.innerHTML = `<span class="msg-author">${esc(message.authorName)}</span><span class="msg-time">${formatTime(message.at)}</span>`;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = formatMessageText(message.text);

  main.appendChild(meta);
  main.appendChild(bubble);
  el.appendChild(avatar);
  el.appendChild(main);
  return el;
}

function formatMessageText(text) {
  return esc(text)
    .replace(/@([a-zA-Z0-9_.ąćęłńóśźż]{2,20})/gi, '<b>@$1</b>')
    .replace(/\n/g, '\n');
}

function isNearBottom() {
  const el = $('messages');
  return el.scrollHeight - el.scrollTop - el.clientHeight < 140;
}

function scrollBottom() {
  const el = $('messages');
  requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
}

function toggleMessageSearch() {
  const bar = $('searchBar');
  setMessageSearch(bar.hidden);
}

function setMessageSearch(open) {
  $('searchBar').hidden = !open;
  if (open) {
    $('messageSearch').focus();
  } else {
    $('messageSearch').value = '';
    searchQuery = '';
    renderMessages(false);
    scrollBottom();
  }
}

function sendCurrentMessage(e) {
  e.preventDefault();
  const input = $('messageInput');
  const text = input.value.trim();
  if (!text) return;
  if (!wsReady()) {
    toast('Łączę z serwerem — spróbuj za chwilę.');
    connect();
    return;
  }

  const message = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    authorId: myId,
    authorName: myName,
    authorColor: myColor,
    text,
    at: Date.now(),
  };

  if (current.kind === 'dm') {
    message.to = current.id;
    ws.send(JSON.stringify({ type: 'dm', to: current.id, text }));
  } else {
    message.roomId = current.id;
    ws.send(JSON.stringify({ type: 'message', roomId: current.id, text }));
  }

  pushHistory(conversationKey(), message);
  if (searchQuery) {
    setMessageSearch(false);
  } else {
    renderMessages(false);
  }
  scrollBottom();

  input.value = '';
  input.style.height = 'auto';
  $('sendBtn').disabled = true;
  input.focus();
  stopTyping();
}

let typingSent = false;
let typingStopTimer = null;

function sendTyping() {
  if (!wsReady()) return;
  if (!typingSent) {
    typingSent = true;
    const payload = current.kind === 'dm'
      ? { type: 'dm:typing', to: current.id, typing: true }
      : { type: 'typing', roomId: current.id, typing: true };
    ws.send(JSON.stringify(payload));
  }
  clearTimeout(typingStopTimer);
  typingStopTimer = setTimeout(stopTyping, 900);
}

function stopTyping() {
  clearTimeout(typingStopTimer);
  if (!typingSent) return;
  typingSent = false;
  if (!wsReady()) return;
  const payload = current.kind === 'dm'
    ? { type: 'dm:typing', to: current.id, typing: false }
    : { type: 'typing', roomId: current.id, typing: false };
  ws.send(JSON.stringify(payload));
}

function renderTyping() {
  const el = $('typingBar');
  const names = [...typingUsers.values()].map((t) => t.name).filter(Boolean);
  if (!names.length) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  const label = names.length === 1
    ? `${esc(names[0])} pisze`
    : `${esc(names.slice(0, 2).join(', '))}${names.length > 2 ? ` i ${names.length - 2} inne` : ''} piszą`;
  el.hidden = false;
  el.innerHTML = `<span>${label}</span><span class="typing-dots"><span></span><span></span><span></span></span>`;
}

function updateBadges() {
  let total = 0;
  for (const value of unread.values()) total += value;
  if (CHILL.chat?.setBadge) CHILL.chat.setBadge(total);
  document.title = total > 0 ? `(${total}) Chill` : 'Chill';

  let dmTotal = 0;
  for (const [key, value] of unread.entries()) if (key.startsWith('dm:')) dmTotal += value;
  $('dmBadge').textContent = dmTotal > 99 ? '99+' : String(dmTotal);
  $('dmBadge').classList.toggle('empty', dmTotal === 0);
}

// ---------- Powiadomienia ----------
function isMention(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  const handle = `@${String(currentUser?.username || '').toLowerCase()}`;
  const name = `@${String(myName).toLowerCase()}`;
  return (handle.length > 1 && lower.includes(handle)) || lower.includes(name) || lower.includes('@wszyscy');
}

function notifyIncoming(message, where, isCurrent) {
  if (!prefs.notify && !prefs.sound) return;
  if (document.hasFocus() && isCurrent) return;

  const mention = isMention(message.text);
  if (prefs.mentionsOnly && !mention) return;

  if (prefs.notify && CHILL.chat?.notify) {
    CHILL.chat.notify({
      title: mention ? `Wzmianka od ${message.authorName}` : `${message.authorName} • ${where}`,
      body: String(message.text).slice(0, 160),
    });
  }
  if (prefs.sound) playSound(mention);
}

function playSound(mention = false) {
  if (!prefs.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(mention ? 880 : 660, now);
    osc.frequency.exponentialRampToValueAtTime(mention ? 1180 : 784, now + 0.09);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  } catch { /* ignore */ }
}

// ============================================================
// EMOJI
// ============================================================
function bindEmoji() {
  const pop = $('emojiOverlay');
  $('emojiBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    pop.hidden = !pop.hidden;
    if (!pop.hidden) {
      $('emojiSearch').value = '';
      $('emojiSearch').focus();
      renderEmoji('');
      renderRecent();
    }
  });
  $('closeEmoji').addEventListener('click', () => { pop.hidden = true; });
  pop.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => { pop.hidden = true; });
  $('emojiSearch').addEventListener('input', () => renderEmoji($('emojiSearch').value));
  $('emojiSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') pop.hidden = true;
  });
}

function renderEmoji(query) {
  const grid = $('emojiGrid');
  const q = String(query || '').trim().toLowerCase();
  const list = q ? EMOJIS.filter((item) => item.keys.includes(q) || item.char.includes(q)) : EMOJIS;
  grid.innerHTML = '';
  if (!list.length) {
    grid.innerHTML = '<div class="emoji-empty">Nic nie znaleziono</div>';
    return;
  }
  for (const item of list) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'emoji-item';
    button.textContent = item.char;
    button.title = item.keys;
    button.addEventListener('click', () => insertEmoji(item.char));
    grid.appendChild(button);
  }
}

function renderRecent() {
  const container = $('emojiRecent');
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem(recentKey()) || '[]'); } catch { recent = []; }
  container.innerHTML = '';
  for (const char of recent.slice(0, 9)) {
    if (!EMOJI_BY_CHAR.has(char)) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'emoji-item';
    button.textContent = char;
    button.addEventListener('click', () => insertEmoji(char));
    container.appendChild(button);
  }
}

function insertEmoji(char) {
  const input = $('messageInput');
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + char + input.value.slice(end);
  input.selectionStart = input.selectionEnd = start + char.length;
  input.focus();
  resizeInput();
  $('sendBtn').disabled = !input.value.trim();
  saveRecent(char);
  $('emojiOverlay').hidden = true;
}

function saveRecent(char) {
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem(recentKey()) || '[]'); } catch { recent = []; }
  recent = [char, ...recent.filter((c) => c !== char)].slice(0, 12);
  try { localStorage.setItem(recentKey(), JSON.stringify(recent)); } catch { /* ignore */ }
}

// ============================================================
// USTAWIENIA
// ============================================================
function bindSettings() {
  const overlay = $('settingsOverlay');
  $('settingsBtn').addEventListener('click', () => openSettings('profile'));
  $('myProfileBtn').addEventListener('click', () => openSettings('profile'));
  $('closeSettings').addEventListener('click', closeSettings);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSettings(); });

  document.querySelectorAll('[data-settings-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchSettingsTab(btn.dataset.settingsTab));
  });

  $('profileAbout').addEventListener('input', () => {
    $('aboutCount').textContent = `${$('profileAbout').value.length}/160`;
  });
  $('profileColors').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-color]');
    if (!btn) return;
    profileColor = btn.dataset.color;
    markColorSelection($('profileColors'), profileColor);
    $('settingsAvatar').style.background = profileColor;
  });

  $('saveProfile').addEventListener('click', saveProfile);
  $('changePasswordBtn').addEventListener('click', changePassword);

  $('themeChoices').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-choice]');
    if (!btn) return;
    applyTheme(btn.dataset.themeChoice);
    savePrefs();
  });

  $('accentColors').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-accent]');
    if (!btn) return;
    applyAccent(btn.dataset.accent);
    savePrefs();
  });

  $('compactToggle').addEventListener('change', () => {
    prefs.compact = $('compactToggle').checked;
    $('chatApp').classList.toggle('compact', prefs.compact);
    savePrefs();
  });

  $('notifyToggle').addEventListener('change', () => {
    prefs.notify = $('notifyToggle').checked;
    savePrefs();
  });
  $('soundToggle').addEventListener('change', () => {
    prefs.sound = $('soundToggle').checked;
    savePrefs();
    if (prefs.sound) playSound();
  });
  $('mentionsToggle').addEventListener('change', () => {
    prefs.mentionsOnly = $('mentionsToggle').checked;
    savePrefs();
  });
  $('gameDetectToggle').addEventListener('change', () => {
    prefs.gameDetect = $('gameDetectToggle').checked;
    savePrefs();
    if (!prefs.gameDetect) {
      playing = null;
      renderIdentity();
      if (wsReady()) ws.send(JSON.stringify({ type: 'activity', playing: null }));
    }
  });

  $('autostartToggle').addEventListener('change', async () => {
    const wanted = $('autostartToggle').checked;
    try {
      const actual = await CHILL.app.autostartSet(wanted);
      $('autostartToggle').checked = Boolean(actual);
      toast(actual ? 'Chill będzie uruchamiany z Windows' : 'Autostart wyłączony');
    } catch {
      $('autostartToggle').checked = !wanted;
      toast('Nie udało się zmienić autostartu');
    }
  });

  $('checkUpdatesBtn').addEventListener('click', async () => {
    const status = $('updateStatus');
    status.textContent = 'Sprawdzam…';
    $('checkUpdatesBtn').disabled = true;
    try {
      const info = await CHILL.app.checkUpdates();
      status.textContent = info && info.version
        ? `Dostępna wersja ${info.version}.`
        : 'Masz najnowszą wersję Chill.';
    } catch {
      status.textContent = 'Nie udało się sprawdzić aktualizacji.';
    } finally {
      $('checkUpdatesBtn').disabled = false;
    }
  });

  $('statusChoices').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-status]');
    if (!btn) return;
    setStatus(btn.dataset.status);
  });
}

function openSettings(tab = 'profile') {
  if (!currentUser) return;
  $('settingsOverlay').hidden = false;
  switchSettingsTab(tab);
  fillProfileForm();
  applyTheme(prefs.theme);
  applyAccent(prefs.accent);
  $('compactToggle').checked = prefs.compact;
  $('notifyToggle').checked = prefs.notify;
  $('soundToggle').checked = prefs.sound;
  $('mentionsToggle').checked = prefs.mentionsOnly;
  $('gameDetectToggle').checked = prefs.gameDetect;
  $('profileError').textContent = '';
  $('profileSaved').textContent = '';
  $('passwordError').textContent = '';
  $('passwordSaved').textContent = '';
  $('updateStatus').textContent = '';
  loadAutostart();
}

function closeSettings() {
  $('settingsOverlay').hidden = true;
}

function switchSettingsTab(tab) {
  document.querySelectorAll('[data-settings-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.settingsTab === tab);
  });
  document.querySelectorAll('[data-settings-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== tab;
  });
}

function fillProfileForm() {
  $('settingsAvatar').textContent = initial(myName);
  $('settingsAvatar').style.background = profileColor && profileColor !== '' ? profileColor : myColor;
  $('settingsName').textContent = myName;
  $('settingsUsername').textContent = currentUser ? `@${currentUser.username}` : '';
  $('profileDisplayName').value = myName;
  $('profileAbout').value = myAbout || '';
  $('aboutCount').textContent = `${(myAbout || '').length}/160`;
  profileColor = myColor;
  markColorSelection($('profileColors'), profileColor);
  document.querySelectorAll('#statusChoices [data-status]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.status === prefs.status);
  });
}

async function loadAutostart() {
  try {
    const value = await CHILL.app.autostartGet();
    $('autostartToggle').checked = Boolean(value);
  } catch { /* ignore */ }
}

async function loadAppInfo() {
  try {
    const version = await CHILL.app.version();
    $('appVersion').textContent = version || '—';
  } catch {
    $('appVersion').textContent = '—';
  }
}

async function saveProfile() {
  const displayName = $('profileDisplayName').value.trim();
  const about = $('profileAbout').value.trim();
  const errorEl = $('profileError');
  errorEl.textContent = '';

  if (displayName.length < 2 || displayName.length > 32) {
    errorEl.textContent = 'Nazwa musi mieć 2–32 znaki.';
    return;
  }
  if (about.length > 160) {
    errorEl.textContent = 'Opis może mieć maksymalnie 160 znaków.';
    return;
  }

  $('saveProfile').disabled = true;
  try {
    const result = await CHILL.auth.updateProfile({ displayName, about, color: profileColor });
    if (!result || !result.ok) {
      errorEl.textContent = result?.error || 'Nie udało się zapisać profilu.';
      return;
    }
    currentUser = { ...currentUser, ...result.user };
    myName = currentUser.displayName;
    myColor = currentUser.color;
    myAbout = currentUser.about;
    renderIdentity();
    fillProfileForm();
    $('profileSaved').textContent = 'Zapisano';
    toast('Profil zaktualizowany');
    if (wsReady()) ws.send(JSON.stringify({ type: 'profile', displayName: myName, color: myColor, about: myAbout }));
  } catch {
    errorEl.textContent = 'Wystąpił błąd podczas zapisywania.';
  } finally {
    $('saveProfile').disabled = false;
  }
}

async function changePassword() {
  const currentPassword = $('currentPassword').value;
  const newPassword = $('newPassword').value;
  const errorEl = $('passwordError');
  const savedEl = $('passwordSaved');
  errorEl.textContent = '';
  savedEl.textContent = '';

  if (!currentPassword || !newPassword) {
    errorEl.textContent = 'Wpisz obecne i nowe hasło.';
    return;
  }
  if (newPassword.length < 8) {
    errorEl.textContent = 'Nowe hasło musi mieć co najmniej 8 znaków.';
    return;
  }

  $('changePasswordBtn').disabled = true;
  try {
    const result = await CHILL.auth.changePassword({ currentPassword, newPassword });
    if (!result || !result.ok) {
      errorEl.textContent = result?.error || 'Nie udało się zmienić hasła.';
      return;
    }
    $('currentPassword').value = '';
    $('newPassword').value = '';
    savedEl.textContent = 'Hasło zmienione';
    toast('Hasło zostało zmienione');
  } catch {
    errorEl.textContent = 'Wystąpił błąd.';
  } finally {
    $('changePasswordBtn').disabled = false;
  }
}

function setStatus(status) {
  prefs.status = status;
  savePrefs();
  document.querySelectorAll('#statusChoices [data-status]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.status === status);
  });
  renderIdentity();
  if (wsReady()) ws.send(JSON.stringify({ type: 'status', status }));
}

// ---------- Aktualizacje ----------
function showUpdate(info) {
  if (!info || !info.version) return;
  $('updateVersion').textContent = info.version;
  $('updateBanner').hidden = false;
  $('updateBtn').disabled = false;
  $('updateBtn').textContent = 'Aktualizuj';
  $('updateText').textContent = 'Pobierz i uruchom instalator, aby zaktualizować Chill.';
}

// ---------- Skróty ----------
function bindShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('settingsOverlay').hidden) { closeSettings(); return; }
      if (!$('emojiOverlay').hidden) { $('emojiOverlay').hidden = true; return; }
      if (!$('searchBar').hidden) { setMessageSearch(false); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && currentUser) {
      e.preventDefault();
      setMessageSearch(true);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && currentUser) {
      e.preventDefault();
      $('conversationSearch').focus();
    }
  });
}
