// Chill — logika interfejsu (konta, czat, ustawienia)
'use strict';

const CHILL = window.chill || {};
const WS_URL = `ws://127.0.0.1:${CHILL.chatPort || 47830}/chat`;
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
let servers = [];
let activeServerId = null;
const serverStates = new Map();
let allUsers = [];
let playing = null;
let searchQuery = '';
let current = { kind: 'home' };
let profileColor = '#3ee0a3';
let regColor = '#3ee0a3';
let serverColor = '#3ee0a3';
let downloadingUpdate = false;
let autoUpdateVersion = '';
let currentUpdateInfo = null;
let audioCtx = null;
let mentionState = { start: 0, end: 0, items: [], index: 0 };

const history = new Map();
const unread = new Map();
const typingUsers = new Map();

const DEFAULT_PREFS = {
  theme: 'system',
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
const safeColor = (value, fallback = 'var(--accent)') => (/^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback);
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
  if (prefs.theme === 'dark') prefs.theme = 'gradient';
  else if (prefs.theme === 'light') prefs.theme = 'white';
  else if (!['system', 'black', 'white', 'gradient'].includes(prefs.theme)) prefs.theme = 'system';
}
function savePrefs() {
  try { localStorage.setItem(prefsKey(), JSON.stringify(prefs)); } catch { /* ignore */ }
  localStorage.setItem('chill.theme', prefs.theme);
  localStorage.setItem('chill.accent', prefs.accent);
}

const themeMedia = window.matchMedia('(prefers-color-scheme: light)');

function resolveTheme(theme) {
  if (theme === 'system') return themeMedia.matches ? 'white' : 'black';
  if (theme === 'white') return 'white';
  if (theme === 'black') return 'black';
  return 'gradient';
}

function applyTheme(theme) {
  let mode = ['system', 'black', 'white', 'gradient'].includes(theme) ? theme : 'system';
  if (theme === 'dark') mode = 'gradient';
  if (theme === 'light') mode = 'white';
  document.body.dataset.theme = resolveTheme(mode);
  document.body.dataset.themeMode = mode;
  prefs.theme = mode;
  document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.themeChoice === mode);
  });
}

function syncSystemTheme() {
  if (prefs.theme === 'system') applyTheme('system');
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
  applyTheme(localStorage.getItem('chill.theme') || 'system');
  applyAccent(localStorage.getItem('chill.accent') || '#3ee0a3');
  if (typeof themeMedia.addEventListener === 'function') themeMedia.addEventListener('change', syncSystemTheme);
  bindAuth();
  bindChat();
  bindServers();
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
    ? 'Zaloguj się nazwą użytkownika lub e-mailem.'
    : 'Utwórz konto — nazwa użytkownika i hasło wystarczą.';
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

  if (!payload.username || !payload.password) {
    errorEl.textContent = 'Uzupełnij nazwę użytkownika i hasło.';
    return;
  }
  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) {
    errorEl.textContent = 'Podaj poprawny adres e-mail albo zostaw pole puste.';
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
  current = { kind: 'home' };
  servers = [];
  activeServerId = null;
  serverStates.clear();
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
  loadServers();
  renderSidebar();
  renderHeader();
  renderMessages(false);
  renderMembers();
  updateBadges();
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
  for (const state of serverStates.values()) {
    clearTimeout(state.reconnectTimer);
    if (state.ws) {
      state.ws.onclose = null;
      try { state.ws.close(); } catch { /* ignore */ }
    }
  }
  serverStates.clear();
  if (CHILL.auth?.logout) CHILL.auth.logout().catch(() => {});

  currentUser = null;
  myId = '';
  servers = [];
  activeServerId = null;
  current = { kind: 'home' };
  allUsers = [];
  history.clear();
  unread.clear();
  typingUsers.clear();
  playing = null;
  searchQuery = '';
  $('messages').innerHTML = '';
  $('serverList').innerHTML = '';
  $('channelList').innerHTML = '';
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
// WZMIANKI (@osoba)
// ============================================================
function mentionHandle(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}_.-]/gu, '')
    .slice(0, 32);
}

function mentionCandidates() {
  if (current.kind === 'server') {
    const state = serverState(current.serverId);
    const myMemberId = state?.you?.memberId;
    return (state?.members || [])
      .filter((member) => member.id !== myMemberId)
      .map((member) => ({
        handle: mentionHandle(member.name),
        name: member.name,
        meta: member.owner ? 'Właściciel serwera' : member.online ? 'Online' : 'Offline',
        color: safeColor(member.color, '#3ee0a3'),
        online: Boolean(member.online),
      }))
      .filter((item) => item.handle);
  }

  return allUsers
    .filter((user) => user.id !== myId)
    .map((user) => ({
      handle: mentionHandle(user.username || user.name),
      name: user.name,
      meta: user.online ? statusLabel(user.status) : 'Offline',
      color: safeColor(user.color, '#3ee0a3'),
      online: Boolean(user.online),
    }))
    .filter((item) => item.handle);
}

function currentMentionToken() {
  const input = $('messageInput');
  if (document.activeElement !== input) return null;
  const position = input.selectionStart ?? 0;
  const before = input.value.slice(0, position);
  const match = before.match(/(?:^|[\s([{])@([\p{L}\p{N}_.-]{0,32})$/u);
  if (!match) return null;
  return { start: position - match[1].length - 1, query: match[1] };
}

function hideMentionPop() {
  const pop = $('mentionPop');
  if (pop) pop.hidden = true;
  mentionState = { start: 0, end: 0, items: [], index: 0 };
}

function paintMentionActive() {
  document.querySelectorAll('#mentionPop [data-mention-index]').forEach((button, index) => {
    button.classList.toggle('active', index === mentionState.index);
  });
}

function updateMentionPop() {
  const pop = $('mentionPop');
  if (!pop) return;
  const token = currentMentionToken();
  if (!token) {
    hideMentionPop();
    return;
  }

  const query = token.query.toLowerCase();
  const items = mentionCandidates()
    .filter((item) => !query || item.name.toLowerCase().includes(query) || item.handle.toLowerCase().includes(query))
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(query) || a.handle.toLowerCase().startsWith(query);
      const bStarts = b.name.toLowerCase().startsWith(query) || b.handle.toLowerCase().startsWith(query);
      return Number(bStarts) - Number(aStarts) || Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'pl');
    })
    .slice(0, 8);

  if (!items.length) {
    hideMentionPop();
    return;
  }

  const input = $('messageInput');
  mentionState = { start: token.start, end: input.selectionStart ?? 0, items, index: 0 };
  pop.innerHTML = `${items.map((item, index) => `
    <button type="button" class="mention-item${index === 0 ? ' active' : ''}" data-mention-index="${index}">
      <span class="mention-avatar" style="background:${item.color}">${esc(initial(item.name))}</span>
      <span class="mention-info">
        <strong>${esc(item.name)}</strong>
        <small>@${esc(item.handle)} • ${esc(item.meta)}</small>
      </span>
    </button>
  `).join('')}<div class="mention-foot">↑ ↓ wybierz • Enter wstaw • Esc zamknij</div>`;
  pop.hidden = false;
}

function chooseMention(index = mentionState.index) {
  const item = mentionState.items[index];
  if (!item) return;
  const input = $('messageInput');
  const end = input.selectionStart ?? mentionState.end;
  const next = `${input.value.slice(0, mentionState.start)}@${item.handle} ${input.value.slice(end)}`;
  input.value = next;
  const caret = mentionState.start + item.handle.length + 2;
  input.setSelectionRange(caret, caret);
  hideMentionPop();
  resizeInput();
  $('sendBtn').disabled = !input.value.trim() || !wsReady();
  sendTyping();
  input.focus();
}

function moveMention(step) {
  if (!mentionState.items.length) return;
  mentionState.index = (mentionState.index + step + mentionState.items.length) % mentionState.items.length;
  paintMentionActive();
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
    updateMentionPop();
  });
  input.addEventListener('click', updateMentionPop);
  input.addEventListener('blur', () => setTimeout(hideMentionPop, 90));
  input.addEventListener('keydown', (e) => {
    if (!$('mentionPop').hidden) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveMention(1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveMention(-1);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        chooseMention();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        hideMentionPop();
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      hideMentionPop();
      $('composer').requestSubmit();
    }
  });
  $('mentionPop').addEventListener('mousedown', (e) => {
    const button = e.target.closest('[data-mention-index]');
    if (!button) return;
    e.preventDefault();
    chooseMention(Number(button.dataset.mentionIndex));
  });

  $('logoutBtn').addEventListener('click', logout);
  $('conversationSearch').addEventListener('input', () => {
    renderSidebar();
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
      $('updateProgress').style.width = `${pct}%`;
      $('updateText').textContent = `Pobieranie aktualizacji — ${pct}%`;
    });
  }
  $('updateBtn').addEventListener('click', () => startUpdateInstall(true));
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
      allUsers = Array.isArray(msg.users) ? msg.users : [];
      history.clear();
      for (const [key, list] of Object.entries(msg.dmHistory || {})) {
        const other = key.split('|').find((part) => part !== myId);
        if (other) history.set(`dm:${other}`, Array.isArray(list) ? list.slice(-300) : []);
      }
      if (!isValidConversation()) current = { kind: 'home' };
      renderSidebar();
      renderHeader();
      renderMessages(false);
      renderMembers();
      updateBadges();
      if (wsReady()) {
        ws.send(JSON.stringify({ type: 'status', status: prefs.status }));
        if (prefs.gameDetect && playing) ws.send(JSON.stringify({ type: 'activity', playing }));
      }
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
        renderServers();
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

function randomMemberId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function parseInvite(raw) {
  let text = String(raw || '').trim();
  if (!text) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `chill://${text}`;
  if (!/^chill:\/\//i.test(text)) return null;
  let url;
  try {
    url = new URL(text.replace(/^chill:\/\//i, 'http://'));
  } catch {
    return null;
  }
  const host = url.hostname;
  const port = url.port || '47830';
  const invite = decodeURIComponent(url.pathname.replace(/^\/+/, '')).trim().toUpperCase();
  if (!host || !/^[a-zA-Z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.')) return null;
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) return null;
  if (!/^[A-Z0-9]{4,16}$/.test(invite)) return null;
  return { address: `${host}:${port}`, invite };
}

function connectServer(server) {
  const state = ensureServerState(server);
  if (state.fatal) return;
  if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) return;
  clearTimeout(state.reconnectTimer);
  state.attempts += 1;
  state.status = 'connecting';
  state.error = '';
  renderServers();
  if (activeServerId === server.id) {
    renderHeader();
    renderMessages(false);
  }

  let socket;
  try {
    socket = new WebSocket(`ws://${server.address}/chat`);
  } catch {
    state.status = 'offline';
    state.error = 'Nieprawidłowy adres serwera.';
    renderServers();
    return;
  }
  state.ws = socket;

  socket.onopen = () => {
    if (state.ws !== socket) return;
    const memberId = server.owner ? myId : server.memberId;
    socket.send(JSON.stringify({
      type: 'join-server',
      invite: server.invite,
      memberId,
      name: myName,
      color: myColor,
      ownerKey: server.owner ? server.ownerKey : undefined,
    }));
  };

  socket.onmessage = (event) => {
    if (state.ws !== socket) return;
    try {
      handleServerFrame(server.id, JSON.parse(event.data));
    } catch { /* ignore */ }
  };

  socket.onclose = () => {
    if (state.ws !== socket) return;
    state.ws = null;
    if (state.status === 'online' || state.status === 'connecting') state.status = 'offline';
    state.you = null;
    state.members = state.members.map((member) => ({ ...member, online: false }));
    renderServers();
    if (activeServerId === server.id) {
      renderSidebar();
      renderHeader();
      renderMessages(false);
      renderMembers();
      updateComposer();
    }
    if (currentUser && !state.fatal) scheduleServerReconnect(server.id);
  };

  socket.onerror = () => {};
}

function scheduleServerReconnect(serverId) {
  const state = serverState(serverId);
  if (!state || !currentUser || state.fatal) return;
  clearTimeout(state.reconnectTimer);
  const delay = Math.min(15_000, 3_000 + state.attempts * 1_500);
  state.reconnectTimer = setTimeout(() => {
    const latest = serverState(serverId);
    if (!latest || !currentUser || latest.fatal) return;
    connectServer(latest.server);
  }, delay);
}

function handleServerFrame(serverId, msg) {
  const state = serverState(serverId);
  if (!state) return;

  switch (msg.type) {
    case 'server:joined': {
      state.status = 'online';
      state.fatal = false;
      state.error = '';
      state.attempts = 0;
      state.you = msg.you || null;
      state.channels = Array.isArray(msg.server?.channels) ? msg.server.channels : [];
      state.members = Array.isArray(msg.members) ? msg.members : [];
      if (msg.server) {
        state.server = {
          ...state.server,
          id: msg.server.id || state.server.id,
          name: msg.server.name || state.server.name,
          icon: msg.server.icon || '',
          color: msg.server.color || state.server.color,
          invite: msg.server.invite || state.server.invite,
          ownerId: msg.server.ownerId,
          owner: Boolean(state.you?.owner),
        };
        const entry = servers.find((item) => item.id === serverId);
        if (entry) Object.assign(entry, {
          name: state.server.name,
          icon: state.server.icon,
          color: state.server.color,
          invite: state.server.invite,
          owner: state.server.owner,
        });
      }

      for (const key of [...history.keys()]) {
        if (key.startsWith(`server:${serverId}:`)) history.delete(key);
      }
      for (const [channelId, list] of Object.entries(msg.messages || {})) {
        history.set(`server:${serverId}:${channelId}`, Array.isArray(list) ? list.slice(-300) : []);
      }

      if (activeServerId === serverId) {
        if (!state.channels.some((channel) => channel.id === current.id)) {
          current = { kind: 'server', serverId, id: state.channels[0]?.id || '' };
        }
        state.lastChannelId = current.id || state.lastChannelId;
        renderSidebar();
        renderHeader();
        renderMessages(false);
        renderMembers();
        updateComposer();
      }
      renderServers();
      updateBadges();
      break;
    }

    case 'server:members': {
      state.members = Array.isArray(msg.members) ? msg.members : [];
      if (activeServerId === serverId) {
        renderMembers();
        renderHeader();
      }
      break;
    }

    case 'server:channels': {
      state.channels = Array.isArray(msg.channels) ? msg.channels : [];
      if (activeServerId === serverId) {
        if (current.kind === 'server' && !state.channels.some((channel) => channel.id === current.id)) {
          current = { kind: 'server', serverId, id: state.channels[0]?.id || '' };
        }
        renderSidebar();
        renderHeader();
        renderMessages(false);
        updateComposer();
      }
      break;
    }

    case 'server:message': {
      const message = msg.message;
      if (!message || !message.channelId) return;
      const key = `server:${serverId}:${message.channelId}`;
      pushHistory(key, message);
      const active = current.kind === 'server' && current.serverId === serverId && current.id === message.channelId;
      const own = message.authorId === state.you?.memberId;
      if (active) {
        const nearBottom = isNearBottom();
        if (!searchQuery) renderMessages(false);
        if (nearBottom || !searchQuery) scrollBottom();
      } else if (!own) {
        bumpUnread(key);
        renderSidebar();
        updateBadges();
      }
      if (!own) {
        const channel = state.channels.find((item) => item.id === message.channelId);
        notifyIncoming(message, channel ? `#${channel.name} • ${state.server.name}` : state.server.name, active);
      }
      break;
    }

    case 'server:typing': {
      if (msg.channelId && (current.kind !== 'server' || current.serverId !== serverId || current.id !== msg.channelId)) return;
      if (msg.userId === state.you?.memberId) return;
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

    case 'server:error': {
      state.error = String(msg.message || 'Wystąpił błąd serwera.');
      toast(state.error);
      if (msg.code === 'not-found' || msg.code === 'invalid-invite') {
        state.fatal = true;
        state.status = 'offline';
        const socket = state.ws;
        state.ws = null;
        if (socket) {
          socket.onclose = null;
          try { socket.close(); } catch { /* ignore */ }
        }
      }
      renderServers();
      if (activeServerId === serverId) {
        renderHeader();
        renderMessages(false);
        updateComposer();
      }
      break;
    }

    case 'server:deleted': {
      const owned = Boolean(state.you?.owner);
      removeServerLocally(serverId);
      if (!state.fatal && !owned && CHILL.servers?.leave) CHILL.servers.leave({ id: serverId }).catch(() => {});
      if (!owned) toast('Serwer został usunięty przez właściciela.');
      break;
    }
  }
}

function removeServerLocally(serverId) {
  const state = serverState(serverId);
  if (state) {
    clearTimeout(state.reconnectTimer);
    if (state.ws) {
      state.ws.onclose = null;
      try { state.ws.close(); } catch { /* ignore */ }
    }
  }
  serverStates.delete(serverId);
  servers = servers.filter((server) => server.id !== serverId);
  for (const key of [...unread.keys()]) {
    if (key.startsWith(`server:${serverId}:`)) unread.delete(key);
  }
  if (activeServerId === serverId) selectHome();
  else {
    renderSidebar();
    renderMessages(false);
    renderMembers();
    updateBadges();
  }
}

async function probeServer(parsed, memberId) {
  return new Promise((resolve, reject) => {
    let socket;
    let done = false;
    let timer;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket?.close(); } catch { /* ignore */ }
      fn(value);
    };
    try {
      socket = new WebSocket(`ws://${parsed.address}/chat`);
    } catch {
      reject(new Error('Nieprawidłowy adres serwera.'));
      return;
    }
    timer = setTimeout(() => finish(reject, new Error('Serwer nie odpowiada. Sprawdź adres i spróbuj ponownie.')), 10_000);
    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: 'join-server',
        invite: parsed.invite,
        memberId,
        name: myName,
        color: myColor,
      }));
    };
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'server:joined') finish(resolve, msg);
        else if (msg.type === 'server:error') finish(reject, new Error(msg.message || 'Nie udało się dołączyć do serwera.'));
      } catch { /* ignore */ }
    };
    socket.onerror = () => finish(reject, new Error('Nie można połączyć się z serwerem.'));
    socket.onclose = () => finish(reject, new Error('Serwer przerwał połączenie.'));
  });
}

function bindServers() {
  $('homeBtn').addEventListener('click', selectHome);
  $('addServerBtn').addEventListener('click', () => openServerModal('create'));
  $('closeServerModal').addEventListener('click', closeServerModal);
  $('serverOverlay').addEventListener('click', (e) => {
    if (e.target === $('serverOverlay')) closeServerModal();
  });

  document.querySelectorAll('[data-server-tab]').forEach((button) => {
    button.addEventListener('click', () => switchServerTab(button.dataset.serverTab));
  });

  $('serverColors').addEventListener('click', (e) => {
    const button = e.target.closest('[data-server-color]');
    if (!button) return;
    serverColor = button.dataset.serverColor;
    markColorSelection($('serverColors'), serverColor);
  });
  markColorSelection($('serverColors'), serverColor);

  $('createServerBtn').addEventListener('click', createServer);
  $('joinServerBtn').addEventListener('click', joinServer);
  $('serverInvite').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      joinServer();
    }
  });
  $('serverName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      createServer();
    }
  });

  $('inviteBtn').addEventListener('click', openInviteModal);
  $('closeInviteModal').addEventListener('click', () => { $('inviteOverlay').hidden = true; });
  $('inviteOverlay').addEventListener('click', (e) => {
    if (e.target === $('inviteOverlay')) $('inviteOverlay').hidden = true;
  });
  $('copyInviteBtn').addEventListener('click', () => {
    copyText($('inviteLink').textContent).then(() => {
      $('inviteSaved').textContent = 'Skopiowano';
      setTimeout(() => { $('inviteSaved').textContent = ''; }, 2500);
    }).catch(() => toast('Nie udało się skopiować linku.'));
  });
  $('leaveServerBtn').addEventListener('click', leaveActiveServer);

  $('addChannelBtn').addEventListener('click', () => {
    const form = $('channelForm');
    form.hidden = !form.hidden;
    if (!form.hidden) $('channelName').focus();
  });
  $('channelForm').addEventListener('submit', createChannelFromForm);
  $('channelName').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $('channelForm').hidden = true;
      $('channelName').value = '';
    }
  });
}

function openServerModal(tab = 'create') {
  if (!currentUser) return;
  $('serverOverlay').hidden = false;
  $('serverName').value = '';
  $('serverInvite').value = '';
  $('createServerError').textContent = '';
  $('joinServerError').textContent = '';
  serverColor = '#3ee0a3';
  markColorSelection($('serverColors'), serverColor);
  switchServerTab(tab);
}

function closeServerModal() {
  $('serverOverlay').hidden = true;
  $('createServerBtn').disabled = false;
  $('joinServerBtn').disabled = false;
}

function switchServerTab(tab) {
  const target = tab === 'join' ? 'join' : 'create';
  document.querySelectorAll('[data-server-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.serverTab === target);
  });
  document.querySelectorAll('[data-server-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.serverPanel !== target;
  });
  setTimeout(() => (target === 'join' ? $('serverInvite') : $('serverName')).focus(), 40);
}

async function createServer() {
  const name = $('serverName').value.trim();
  const errorEl = $('createServerError');
  errorEl.textContent = '';
  if (name.length < 2 || name.length > 40) {
    errorEl.textContent = 'Nazwa serwera musi mieć 2–40 znaków.';
    return;
  }
  $('createServerBtn').disabled = true;
  try {
    const result = await CHILL.servers.create({ name, color: serverColor });
    if (!result || !result.ok) {
      errorEl.textContent = result?.error || 'Nie udało się utworzyć serwera.';
      return;
    }
    upsertServer(result.server);
    const state = ensureServerState(result.server);
    state.server = result.server;
    closeServerModal();
    selectServer(result.server.id);
    connectServer(result.server);
    toast(`Serwer „${result.server.name}” utworzony`);
  } catch {
    errorEl.textContent = 'Wystąpił błąd podczas tworzenia serwera.';
  } finally {
    $('createServerBtn').disabled = false;
  }
}

async function joinServer() {
  const raw = $('serverInvite').value.trim();
  const errorEl = $('joinServerError');
  errorEl.textContent = '';
  const parsed = parseInvite(raw);
  if (!parsed) {
    errorEl.textContent = 'Wklej pełny link, np. chill://192.168.1.5:47830/AB12CD.';
    return;
  }
  $('joinServerBtn').disabled = true;
  errorEl.textContent = 'Łączę…';
  try {
    const known = servers.find((server) => server.invite === parsed.invite && (server.address === parsed.address || server.owner));
    if (known) {
      closeServerModal();
      selectServer(known.id);
      connectServer(known);
      toast('Już należysz do tego serwera');
      return;
    }
    const memberId = randomMemberId();
    const data = await probeServer(parsed, memberId);
    const result = await CHILL.servers.saveJoined({
      address: parsed.address,
      invite: parsed.invite,
      server: data.server,
      memberId,
    });
    if (!result || !result.ok) throw new Error(result?.error || 'Nie udało się zapisać serwera.');
    upsertServer(result.server);
    ensureServerState(result.server);
    closeServerModal();
    selectServer(result.server.id);
    connectServer(result.server);
    toast(`Dołączono do „${result.server.name}”`);
    errorEl.textContent = '';
  } catch (err) {
    errorEl.textContent = err.message || 'Nie udało się dołączyć do serwera.';
  } finally {
    $('joinServerBtn').disabled = false;
    if (!errorEl.textContent) errorEl.textContent = '';
  }
}

function createChannelFromForm(e) {
  e.preventDefault();
  const state = serverState(activeServerId);
  if (!state || state.status !== 'online' || !state.you?.owner || !state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  const name = $('channelName').value.trim();
  if (!name) return;
  state.ws.send(JSON.stringify({ type: 'server:channel:create', name }));
  $('channelName').value = '';
  $('channelForm').hidden = true;
}

async function openInviteModal() {
  const state = serverState(activeServerId);
  if (!state) return;
  $('inviteOverlay').hidden = false;
  $('inviteServerName').textContent = state.server.name;
  $('inviteSaved').textContent = '';
  $('leaveServerBtn').textContent = state.you?.owner ? 'Usuń serwer' : 'Opuść serwer';
  resetLeaveConfirm();
  $('inviteLink').textContent = state.server.shareLink || `chill://${state.server.address}/${state.server.invite}`;
  if (CHILL.servers?.invite) {
    try {
      const result = await CHILL.servers.invite({ id: state.server.id });
      if (result?.ok && result.shareLink) {
        state.server.shareLink = result.shareLink;
        $('inviteLink').textContent = result.shareLink;
      }
    } catch { /* ignore */ }
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) throw new Error('copy failed');
    return true;
  }
}

let leaveArmed = false;
let leaveTimer = null;

function resetLeaveConfirm() {
  leaveArmed = false;
  clearTimeout(leaveTimer);
  const state = serverState(activeServerId);
  $('leaveServerBtn').textContent = state?.you?.owner ? 'Usuń serwer' : 'Opuść serwer';
  $('leaveServerBtn').disabled = false;
}

async function leaveActiveServer() {
  const state = serverState(activeServerId);
  if (!state) return;
  if (!leaveArmed) {
    leaveArmed = true;
    $('leaveServerBtn').textContent = state.you?.owner ? 'Kliknij ponownie, aby usunąć' : 'Kliknij ponownie, aby opuścić';
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(resetLeaveConfirm, 3500);
    return;
  }
  clearTimeout(leaveTimer);
  leaveArmed = false;
  $('leaveServerBtn').disabled = true;
  const id = state.server.id;
  const deleted = Boolean(state.you?.owner);
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    try { state.ws.send(JSON.stringify({ type: 'server:leave' })); } catch { /* ignore */ }
  }
  try {
    const result = await CHILL.servers.leave({ id });
    if (!result || !result.ok) {
      toast(result?.error || 'Nie udało się opuścić serwera.');
      resetLeaveConfirm();
      return;
    }
    $('inviteOverlay').hidden = true;
    removeServerLocally(id);
    toast(deleted ? 'Serwer został usunięty' : 'Opuszczono serwer');
  } catch {
    toast('Wystąpił błąd. Spróbuj ponownie.');
    resetLeaveConfirm();
  }
}

function isValidConversation() {
  if (current.kind === 'dm') return allUsers.some((u) => u.id === current.id);
  if (current.kind === 'server') {
    const state = serverState(current.serverId);
    return Boolean(state && state.channels.some((channel) => channel.id === current.id));
  }
  return current.kind === 'home';
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
  activeServerId = null;
  current = { kind, id };
  hideMentionPop();
  unread.delete(kind === 'dm' ? `dm:${id}` : conversationKey());
  searchQuery = '';
  $('messageSearch').value = '';
  $('searchBar').hidden = true;
  $('conversationSearch').value = '';
  $('messages').classList.remove('searching');
  typingUsers.clear();
  renderTyping();
  renderSidebar();
  renderHeader();
  renderMessages(false);
  renderMembers();
  updateComposer();
  scrollBottom();
  updateBadges();
  $('messageInput').focus();
}

function serverState(id) {
  return serverStates.get(id) || null;
}

function ensureServerState(server) {
  let state = serverStates.get(server.id);
  if (!state) {
    state = {
      server,
      ws: null,
      status: 'offline',
      channels: [],
      members: [],
      you: null,
      error: '',
      reconnectTimer: null,
      attempts: 0,
      lastChannelId: null,
      fatal: false,
    };
    serverStates.set(server.id, state);
  } else {
    state.server = { ...state.server, ...server };
  }
  return state;
}

async function loadServers() {
  if (!CHILL.servers?.list) return;
  try {
    const result = await CHILL.servers.list();
    if (!result || !result.ok) {
      if (result?.error) toast(result.error);
      return;
    }
    servers = Array.isArray(result.servers) ? result.servers : [];
    renderServers();
    for (const server of servers) connectServer(server);
    if (activeServerId && !servers.some((server) => server.id === activeServerId)) selectHome();
    else renderSidebar();
  } catch {
    toast('Nie udało się wczytać serwerów.');
  }
}

function upsertServer(server) {
  const index = servers.findIndex((item) => item.id === server.id);
  if (index >= 0) servers[index] = { ...servers[index], ...server };
  else servers.push(server);
  renderServers();
}

function unreadCountFor(prefix) {
  let total = 0;
  for (const [key, value] of unread.entries()) if (key.startsWith(prefix)) total += value;
  return total;
}

function selectHome() {
  activeServerId = null;
  current = { kind: 'home' };
  hideMentionPop();
  typingUsers.clear();
  searchQuery = '';
  $('conversationSearch').value = '';
  $('messageSearch').value = '';
  $('searchBar').hidden = true;
  $('channelForm').hidden = true;
  $('messages').classList.remove('searching');
  renderSidebar();
  renderHeader();
  renderMessages(false);
  renderMembers();
  updateComposer();
  updateBadges();
}

function selectServer(id) {
  const server = servers.find((item) => item.id === id);
  if (!server) return;
  hideMentionPop();
  const state = ensureServerState(server);
  activeServerId = id;
  if (!state.ws && !state.fatal) connectServer(state.server);
  let channelId = state.lastChannelId;
  if (!state.channels.some((channel) => channel.id === channelId)) channelId = state.channels[0]?.id || '';
  state.lastChannelId = channelId;
  current = { kind: 'server', serverId: id, id: channelId };
  if (channelId) unread.delete(`server:${id}:${channelId}`);
  searchQuery = '';
  $('conversationSearch').value = '';
  $('messageSearch').value = '';
  $('searchBar').hidden = true;
  $('messages').classList.remove('searching');
  typingUsers.clear();
  renderSidebar();
  renderHeader();
  renderMessages(false);
  renderMembers();
  updateComposer();
  updateBadges();
  $('messageInput').focus();
}

function selectChannel(channelId) {
  const state = serverState(activeServerId);
  if (!state || !state.channels.some((channel) => channel.id === channelId)) return;
  hideMentionPop();
  state.lastChannelId = channelId;
  current = { kind: 'server', serverId: activeServerId, id: channelId };
  unread.delete(`server:${activeServerId}:${channelId}`);
  searchQuery = '';
  $('messageSearch').value = '';
  $('searchBar').hidden = true;
  $('messages').classList.remove('searching');
  typingUsers.clear();
  renderTyping();
  renderSidebar();
  renderHeader();
  renderMessages(false);
  renderMembers();
  updateComposer();
  scrollBottom();
  updateBadges();
  $('messageInput').focus();
}

function renderSidebar() {
  if (!currentUser) return;
  const state = activeServerId ? serverState(activeServerId) : null;
  $('serverBanner').hidden = !state;
  $('channelsGroup').hidden = !state;
  $('dmGroup').hidden = Boolean(state);
  $('conversationSearch').placeholder = state ? 'Szukaj kanału' : 'Szukaj rozmowy';
  $('inviteBtn').hidden = !state;
  if (state) {
    $('serverBannerName').textContent = state.server.name;
    $('serverBannerAvatar').textContent = state.server.icon || initial(state.server.name);
    $('serverBannerAvatar').style.background = safeColor(state.server.color, 'var(--panel-2)');
    $('serverOwnerPill').hidden = !state.you?.owner;
    $('addChannelBtn').hidden = !(state.you?.owner && state.status === 'online');
    renderChannels();
  } else {
    $('channelForm').hidden = true;
    renderDmList();
  }
  renderServers();
}

function renderServers() {
  const container = $('serverList');
  if (!container) return;
  container.innerHTML = '';

  for (const server of servers) {
    const state = serverState(server.id);
    const count = unreadCountFor(`server:${server.id}:`);
    const color = safeColor(server.color, '#3ee0a3');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `server-btn${activeServerId === server.id ? ' active' : ''}${count ? ' unread' : ''}${state?.status === 'online' ? '' : ' offline'}`;
    button.title = `${server.name}${state?.status === 'online' ? '' : state?.status === 'connecting' ? ' — łączenie…' : ' — offline'}`;
    button.innerHTML = `
      <span class="server-avatar" style="background:linear-gradient(145deg, ${esc(color)}, color-mix(in srgb, ${esc(color)} 55%, #7cc8ff))">${esc(server.icon || initial(server.name))}</span>
      ${count ? `<span class="server-badge">${count > 99 ? '99+' : count}</span>` : ''}
      ${state?.status === 'online' ? '' : '<span class="server-status-dot"></span>'}
    `;
    button.addEventListener('click', () => selectServer(server.id));
    container.appendChild(button);
  }

  $('homeBtn').classList.toggle('active', activeServerId === null);
  const dmTotal = unreadCountFor('dm:');
  const homeBadge = $('homeBadge');
  if (homeBadge) {
    homeBadge.hidden = dmTotal === 0;
    homeBadge.textContent = dmTotal > 99 ? '99+' : String(dmTotal);
  }
}

function renderChannels() {
  const container = $('channelList');
  if (!container) return;
  const state = serverState(activeServerId);
  if (!state) {
    container.innerHTML = '';
    return;
  }
  const query = $('conversationSearch').value.trim().toLowerCase();
  const list = state.channels.filter((channel) => !query || channel.name.toLowerCase().includes(query));
  container.innerHTML = '';

  if (!list.length) {
    container.innerHTML = `<div class="nav-empty">${state.status === 'online' ? 'Brak kanałów' : 'Łączę z serwerem…'}</div>`;
    return;
  }

  for (const channel of list) {
    const key = `server:${state.server.id}:${channel.id}`;
    const isActive = current.kind === 'server' && current.serverId === state.server.id && current.id === channel.id;
    const count = isActive ? 0 : unread.get(key) || 0;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `nav-item${isActive ? ' active' : ''}${count ? ' unread' : ''}`;
    button.innerHTML = `
      <span class="nav-icon">#</span>
      <span class="nav-label">${esc(channel.name)}</span>
      ${count ? `<span class="nav-badge">${count > 99 ? '99+' : count}</span>` : ''}
    `;
    button.addEventListener('click', () => selectChannel(channel.id));
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
      <span class="nav-avatar" style="background:${safeColor(user.color, '#3ee0a3')}">
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
  const state = activeServerId ? serverState(activeServerId) : null;

  if (state) {
    const sorted = [...state.members].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'pl'));
    const online = sorted.filter((member) => member.online).length;
    $('onlineBadge').textContent = String(online);
    $('onlineBadge').classList.toggle('empty', online === 0);
    container.innerHTML = '';
    if (!sorted.length) {
      container.innerHTML = '<div class="nav-empty">Brak członków</div>';
      return;
    }
    for (const member of sorted) {
      const status = member.online ? 'online' : 'offline';
      const sub = member.owner ? 'Właściciel serwera' : member.online ? 'Online' : 'Offline';
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'member';
      item.innerHTML = `
        <span class="member-avatar" style="background:${safeColor(member.color, '#3ee0a3')}">
          ${esc(initial(member.name))}
          <span class="status-dot ${esc(status)}"></span>
        </span>
        <span class="member-info">
          <strong>${esc(member.name)}${member.id === state.you?.memberId ? ' (Ty)' : ''}</strong>
          <small>${esc(sub)}</small>
        </span>
      `;
      if (member.id === state.you?.memberId) item.addEventListener('click', () => openSettings('profile'));
      container.appendChild(item);
    }
    return;
  }

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
      <span class="member-avatar" style="background:${safeColor(user.color, '#3ee0a3')}">
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
    $('chatEmoji').style.background = safeColor(user?.color, 'var(--panel-2)');
    $('chatEmoji').style.color = '#06251b';
    $('chatName').textContent = user?.name || 'Rozmowa prywatna';
    $('chatSub').textContent = user?.playing ? `Gra w ${user.playing} • ${statusLabel(status)}` : statusLabel(status);
  } else if (current.kind === 'server') {
    const state = serverState(current.serverId);
    const channel = state?.channels.find((item) => item.id === current.id);
    const online = state ? state.members.filter((member) => member.online).length : 0;
    $('chatEmoji').textContent = '#';
    $('chatEmoji').style.background = safeColor(state?.server.color, 'var(--panel-2)');
    $('chatEmoji').style.color = '#06251b';
    $('chatName').textContent = channel?.name || state?.server.name || 'Serwer';
    $('chatSub').textContent = state
      ? `${state.server.name} • ${state.status === 'online' ? `${online} online` : state.status === 'connecting' ? 'łączenie…' : 'offline'}`
      : '';
  } else {
    $('chatEmoji').textContent = 'C';
    $('chatEmoji').style.background = 'linear-gradient(140deg, var(--accent), var(--accent-2))';
    $('chatEmoji').style.color = '#05231a';
    $('chatName').textContent = 'Wiadomości prywatne';
    $('chatSub').textContent = servers.length ? 'Wybierz rozmowę lub serwer' : 'Utwórz lub dołącz do serwera';
  }
  updateComposer();
}

function updateComposer() {
  const input = $('messageInput');
  const state = current.kind === 'server' ? serverState(current.serverId) : null;
  const channel = state?.channels.find((item) => item.id === current.id);
  const enabled = current.kind === 'dm' || (current.kind === 'server' && state?.status === 'online' && Boolean(channel));
  $('composer').hidden = !enabled;
  input.disabled = !enabled;
  if (current.kind === 'dm') {
    const user = allUsers.find((u) => u.id === current.id);
    input.placeholder = `Napisz do ${user?.name || 'rozmówcy'}…`;
  } else if (current.kind === 'server' && channel) {
    input.placeholder = `Napisz na #${channel.name}…`;
  } else {
    input.placeholder = 'Wybierz kanał, aby napisać…';
  }
  $('sendBtn').disabled = !enabled || !input.value.trim();
  $('typingBar').hidden = !enabled || typingUsers.size === 0;
}

function conversationKey() {
  if (current.kind === 'server') return `server:${current.serverId}:${current.id}`;
  if (current.kind === 'dm') return `dm:${current.id}`;
  return 'home';
}

function addEmptyAction(wrap, label, className, handler) {
  const actions = wrap.querySelector('.empty-actions');
  if (!actions) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', handler);
  actions.appendChild(button);
}

function renderMessages(scroll = true) {
  const container = $('messages');
  if (!container) return;
  const key = conversationKey();
  let list = history.get(key) || [];

  container.classList.toggle('searching', Boolean(searchQuery));
  container.innerHTML = '';

  if (current.kind === 'home') {
    const wrap = document.createElement('div');
    wrap.className = 'empty-chat';
    if (!servers.length) {
      wrap.innerHTML = `
        <div class="empty-ico">C</div>
        <h3>Zacznij od serwera</h3>
        <p>Nie masz jeszcze żadnego serwera. Utwórz własny albo dołącz kodem zaproszenia od znajomego.</p>
        <div class="empty-actions"></div>
      `;
      addEmptyAction(wrap, 'Utwórz serwer', 'btn-primary', () => openServerModal('create'));
      addEmptyAction(wrap, 'Dołącz kodem', 'btn-secondary', () => openServerModal('join'));
    } else {
      wrap.innerHTML = `
        <div class="empty-ico">💬</div>
        <h3>Wiadomości prywatne</h3>
        <p>Wybierz rozmowę z listy po lewej. Prywatne wiadomości działają między kontami na tym komputerze.</p>
      `;
    }
    container.appendChild(wrap);
    updateComposer();
    return;
  }

  if (current.kind === 'server') {
    const state = serverState(current.serverId);
    if (!state || state.status !== 'online') {
      const wrap = document.createElement('div');
      wrap.className = 'empty-chat';
      if (state?.status === 'connecting') {
        wrap.innerHTML = `<div class="empty-ico">◌</div><h3>Łączę z serwerem…</h3><p>${esc(state.server.name)}</p>`;
      } else {
        wrap.innerHTML = `
          <div class="empty-ico">⚠</div>
          <h3>Serwer offline</h3>
          <p>${esc(state?.error || `Nie można połączyć się z ${state?.server.name || 'serwerem'}.`)}</p>
          <div class="empty-actions"></div>
        `;
        if (state) {
          addEmptyAction(wrap, 'Spróbuj ponownie', 'btn-secondary', () => {
            state.fatal = false;
            state.attempts = 0;
            connectServer(state.server);
          });
        }
      }
      container.appendChild(wrap);
      updateComposer();
      return;
    }
    if (!current.id) {
      const wrap = document.createElement('div');
      wrap.className = 'empty-chat';
      wrap.innerHTML = `<div class="empty-ico">#</div><h3>Brak kanałów</h3><p>Ten serwer nie ma jeszcze żadnego kanału.</p><div class="empty-actions"></div>`;
      if (state.you?.owner) {
        addEmptyAction(wrap, 'Utwórz kanał', 'btn-primary', () => {
          $('channelForm').hidden = false;
          $('channelName').focus();
        });
      }
      container.appendChild(wrap);
      updateComposer();
      return;
    }
  }

  if (searchQuery) {
    list = list.filter((m) => String(m.text).toLowerCase().includes(searchQuery));
  }

  if (!list.length) {
    const state = current.kind === 'server' ? serverState(current.serverId) : null;
    const channel = state?.channels.find((item) => item.id === current.id);
    const user = current.kind === 'dm' ? allUsers.find((u) => u.id === current.id) : null;
    const wrap = document.createElement('div');
    wrap.className = 'empty-chat';
    wrap.innerHTML = searchQuery
      ? `<div class="empty-ico">⌕</div><h3>Brak wyników</h3><p>Nie znaleziono wiadomości pasujących do „${esc($('messageSearch').value.trim())}”.</p>`
      : current.kind === 'server'
        ? `<div class="empty-ico">#</div><h3>#${esc(channel?.name || 'kanał')}</h3><p>To początek tego kanału. Napisz pierwszą wiadomość!</p>`
        : `<div class="empty-ico">${esc(initial(user?.name || '?'))}</div><h3>${esc(user?.name || 'Rozmowa')}</h3><p>To początek Waszej prywatnej rozmowy.</p>`;
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
  const own = current.kind === 'server'
    ? message.authorId === serverState(current.serverId)?.you?.memberId
    : message.authorId === myId;
  const el = document.createElement('div');
  el.className = `msg${own ? ' own' : ''}${grouped ? ' grouped' : ''}${searchQuery ? ' search-hit' : ''}`;
  el.dataset.id = message.id;

  const avatar = document.createElement('span');
  avatar.className = `msg-avatar${grouped ? ' hidden' : ''}`;
  avatar.style.background = safeColor(message.authorColor, 'var(--accent)');
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
    .replace(/@([\p{L}\p{N}_.-]{2,32})/gu, '<b>@$1</b>')
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
  hideMentionPop();
  const input = $('messageInput');
  const text = input.value.trim();
  if (!text) return;
  if (current.kind === 'home') {
    toast('Wybierz rozmowę lub kanał, aby napisać.');
    return;
  }

  if (current.kind === 'server') {
    const state = serverState(current.serverId);
    const channel = state?.channels.find((item) => item.id === current.id);
    if (!state || !state.ws || state.ws.readyState !== WebSocket.OPEN || !channel) {
      toast('Łączę z serwerem — spróbuj za chwilę.');
      return;
    }
    state.ws.send(JSON.stringify({ type: 'server:message', channelId: channel.id, text }));
  } else {
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
      to: current.id,
      text,
      at: Date.now(),
    };
    ws.send(JSON.stringify({ type: 'dm', to: current.id, text }));
    pushHistory(conversationKey(), message);
  }

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
  const state = current.kind === 'server' ? serverState(current.serverId) : null;
  const socket = current.kind === 'dm'
    ? (wsReady() ? ws : null)
    : state?.ws && state.ws.readyState === WebSocket.OPEN ? state.ws : null;
  if (!socket) return;
  if (!typingSent) {
    typingSent = true;
    const payload = current.kind === 'dm'
      ? { type: 'dm:typing', to: current.id, typing: true }
      : { type: 'server:typing', channelId: current.id, typing: true };
    socket.send(JSON.stringify(payload));
  }
  clearTimeout(typingStopTimer);
  typingStopTimer = setTimeout(stopTyping, 900);
}

function stopTyping() {
  clearTimeout(typingStopTimer);
  if (!typingSent) return;
  typingSent = false;
  const state = current.kind === 'server' ? serverState(current.serverId) : null;
  const socket = current.kind === 'dm'
    ? (wsReady() ? ws : null)
    : state?.ws && state.ws.readyState === WebSocket.OPEN ? state.ws : null;
  if (!socket) return;
  const payload = current.kind === 'dm'
    ? { type: 'dm:typing', to: current.id, typing: false }
    : { type: 'server:typing', channelId: current.id, typing: false };
  socket.send(JSON.stringify(payload));
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

  const homeBadge = $('homeBadge');
  if (homeBadge) {
    homeBadge.hidden = dmTotal === 0;
    homeBadge.textContent = dmTotal > 99 ? '99+' : String(dmTotal);
  }
}

// ---------- Powiadomienia ----------
function isMention(text) {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  const handle = mentionHandle(currentUser?.username).toLowerCase();
  const myHandle = mentionHandle(myName).toLowerCase();
  const rawName = String(myName || '').toLowerCase();
  return (handle && lower.includes(`@${handle}`))
    || (myHandle && lower.includes(`@${myHandle}`))
    || (rawName && lower.includes(`@${rawName}`))
    || lower.includes('@wszyscy');
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
    for (const state of serverStates.values()) {
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ type: 'server:profile', name: myName, color: myColor }));
      }
    }
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
  currentUpdateInfo = info;
  $('updateVersion').textContent = info.version;
  $('updateBanner').hidden = false;
  $('updateProgress').style.width = '0%';

  if (!CHILL.isPackaged) {
    $('updateText').textContent = 'Dostępna jest nowsza wersja Chill.';
    $('updateBtn').hidden = false;
    $('updateBtn').disabled = false;
    $('updateBtn').textContent = 'Pobierz ręcznie';
    return;
  }

  $('updateBtn').hidden = true;
  $('updateText').textContent = 'Aktualizacja pobiera się i zainstaluje automatycznie…';
  if (autoUpdateVersion === info.version) return;
  autoUpdateVersion = info.version;
  setTimeout(() => startUpdateInstall(false), 900);
}

async function startUpdateInstall(manual) {
  if (downloadingUpdate) return;
  if (!CHILL.app?.installUpdate) {
    $('updateText').textContent = 'Nie można uruchomić aktualizacji w tej wersji.';
    return;
  }

  downloadingUpdate = true;
  $('updateBtn').disabled = true;
  $('updateBtn').hidden = true;
  $('updateProgress').style.width = '0%';
  $('updateText').textContent = 'Pobieranie aktualizacji — 0%';

  try {
    const started = await CHILL.app.installUpdate();
    if (started) {
      $('updateText').textContent = 'Uruchamiam instalator — Chill za chwilę się zamknie.';
      $('updateProgress').style.width = '100%';
      toast('Pobrano aktualizację — uruchamiam instalator', 4000);
    } else {
      $('updateText').textContent = 'Automatyczna aktualizacja nie powiodła się. Pobierz instalator ręcznie.';
      $('updateBtn').hidden = false;
      $('updateBtn').disabled = false;
      $('updateBtn').textContent = 'Pobierz ręcznie';
      if (manual && currentUpdateInfo?.url) CHILL.app.openExternal?.(currentUpdateInfo.url);
    }
  } catch {
    $('updateText').textContent = 'Nie udało się pobrać aktualizacji. Spróbuj ponownie.';
    $('updateBtn').hidden = false;
    $('updateBtn').disabled = false;
    $('updateBtn').textContent = 'Spróbuj ponownie';
  } finally {
    downloadingUpdate = false;
  }
}

// ---------- Skróty ----------
function bindShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('serverOverlay').hidden) { closeServerModal(); return; }
      if (!$('inviteOverlay').hidden) { $('inviteOverlay').hidden = true; return; }
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
