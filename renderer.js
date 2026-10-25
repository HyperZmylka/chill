// Yapper Chat – renderer (logika interfejsu czatu)

const YD = window.yapperDesktop || {};
const WS_URL = 'ws://127.0.0.1:47830/chat';

let ws = null;
let reconnectTimer = null;
let currentRoomId = 'general';
let currentDMId = null;
let unread = new Map();
let typingUsers = new Map();
let myId = 'me';
let myName = 'Ty';
let myColor = '#ff6b4a';
let myAvatarSeed = 'You';
let myAvatar = 'https://api.dicebear.com/7.x/avataaars/svg?seed=You';
let presence = 'online';
let playing = null;
let allUsers = [];

let roomListEl, dmListEl, userListEl, messagesEl, chatNameEl, chatSubEl, chatAvatarEl;
let emptyStateEl, typingBarEl, messageInputEl, sendBtnEl, onlineBadgeEl, dmBadgeEl;
let presenceDotEl, presenceTextEl, myAvatarEl, myNameEl, myStatusEl, playingChipEl, playingTextEl;
let emojiOverlayEl, emojiGridEl, closeEmojiBtn, emojiBtnEl;
let settingsOverlayEl;
let loginScreenEl, chatAppEl, loginNameEl, loginAvatarSeedEl, loginColorEl, loginBtnEl;

// Historia wiadomości trzymana lokalnie (pokoje + DM), żeby nie znikała po przełączeniu
let cachedRooms = [];
const knownRoomIds = new Set(['general', 'random', 'gaming']);
const history = new Map(); // "room:general" | "dm:<userId>" -> wiadomości

const EMOJIS = [
  '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','😘','😗','😙',
  '😚','🙂','🤗','🤩','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯',
  '😪','😫','😴','😌','😛','😜','😝','🤤','😒','😓','😔','😕','🙃','🤑','😲','☹️',
  '🙁','😖','😞','😟','😤','😢','😭','😦','😧','😨','😩','🤯','😳','🥵','🥶','😱',
  '😈','👿','👹','👺','🤡','💩','👻','💀','👽','👾','🤖','🎃','😺','😸','😹','😻',
  '😼','😽','🙀','😿','😾','👋','🤚','🖐','✋','🖖','👌','🤏','✌','🤞','🤟','🤘',
  '🤙','👈','👉','👆','🖕','👇','☝','👍','👎','👊','✊','🤛','🤜','👏','🙌','👐',
  '🤝','🙏','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🦷','🦴','👀','👁','👅',
  '👄','💋','💘','💝','💖','💗','💓','💞','💕','💟','❤','🧡','💛','💚','💙','💜',
  '🤎','🖤','💔','❣','💯','💥','💫','💦','💨','🕳','💬','👁‍🗨','🗨','🗯','💭','💤'
];

function init() {
  roomListEl = document.getElementById('roomList');
  dmListEl = document.getElementById('dmList');
  userListEl = document.getElementById('userList');
  messagesEl = document.getElementById('messages');
  chatNameEl = document.getElementById('chatName');
  chatSubEl = document.getElementById('chatSub');
  chatAvatarEl = document.getElementById('chatAvatar');
  emptyStateEl = document.getElementById('emptyState');
  typingBarEl = document.getElementById('typingBar');
  presenceDotEl = document.getElementById('presenceDot');
  presenceTextEl = document.getElementById('presenceText');
  myAvatarEl = document.getElementById('myAvatar');
  myNameEl = document.getElementById('myName');
  myStatusEl = document.getElementById('myStatus');
  playingChipEl = document.getElementById('playingChip');
  playingTextEl = document.getElementById('playingText');

  emojiOverlayEl = document.getElementById('emojiOverlay');
  emojiGridEl = document.getElementById('emojiGrid');
  closeEmojiBtn = document.getElementById('closeEmoji');
  emojiBtnEl = document.getElementById('emojiBtn');

  settingsOverlayEl = document.getElementById('settingsOverlay');

  loginScreenEl = document.getElementById('loginScreen');
  chatAppEl = document.getElementById('chatApp');
  loginNameEl = document.getElementById('loginName');
  loginAvatarSeedEl = document.getElementById('loginAvatarSeed');
  loginColorEl = document.getElementById('loginColor');
  loginBtnEl = document.getElementById('loginBtn');

  messageInputEl = document.getElementById('messageInput');
  sendBtnEl = document.getElementById('sendBtn');
  onlineBadgeEl = document.getElementById('onlineBadge');
  dmBadgeEl = document.getElementById('dmBadge');

  setupAvatarPicker();
  setupColorPicker();

  loginBtnEl.addEventListener('click', () => {
    const name = loginNameEl.value.trim() || 'Ty';
    myName = name;
    myColor = loginColorEl.value || '#ff6b4a';
    myAvatarSeed = loginAvatarSeedEl.value || 'You';
    myAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${myAvatarSeed}`;
    openChat();
  });

  loginNameEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loginBtnEl.click();
  });

  document.getElementById('composer').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = messageInputEl.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

    const now = Date.now();
    const myMessage = {
      authorId: myId,
      authorName: myName,
      authorColor: myColor,
      authorAvatar: myAvatar,
      text: text,
      at: now,
      own: true
    };

    if (currentDMId) {
      myMessage.to = currentDMId;
      ws.send(JSON.stringify({ type: 'dm', to: currentDMId, text }));
      appendDMMessage(myMessage);
      pushHistory(`dm:${currentDMId}`, myMessage);
    } else {
      myMessage.roomId = currentRoomId;
      ws.send(JSON.stringify({ type: 'message', roomId: currentRoomId, text }));
      appendMessage(myMessage);
      pushHistory(`room:${currentRoomId}`, myMessage);
    }

    messageInputEl.value = '';
    messageInputEl.style.height = 'auto';
    sendBtnEl.disabled = true;
    scrollToBottom();
  });

  messageInputEl.addEventListener('input', () => {
    sendBtnEl.disabled = !messageInputEl.value.trim();
    const h = messageInputEl.scrollHeight;
    messageInputEl.style.height = 'auto';
    messageInputEl.style.height = Math.min(h, 120) + 'px';
    if (ws && ws.readyState === WebSocket.OPEN) {
      const typingPayload = { type: 'typing', typing: true };
      if (currentDMId) {
        typingPayload.type = 'dm:typing';
        typingPayload.to = currentDMId;
      } else {
        typingPayload.type = 'typing';
        typingPayload.roomId = currentRoomId;
      }
      ws.send(JSON.stringify(typingPayload));
      clearTimeout(window._typingStop);
      window._typingStop = setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          const stopPayload = { type: 'typing', typing: false };
          if (currentDMId) {
            stopPayload.type = 'dm:typing';
            stopPayload.to = currentDMId;
          } else {
            stopPayload.type = 'typing';
            stopPayload.roomId = currentRoomId;
          }
          ws.send(JSON.stringify(stopPayload));
        }
      }, 700);
    }
  });

  document.getElementById('statusBtn').addEventListener('click', () => {
    const order = ['online', 'away', 'dnd', 'offline'];
    const i = order.indexOf(presence);
    presence = order[(i + 1) % order.length];
    updatePresenceUI();
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'status', status: presence }));
  });

  document.getElementById('backBtn').addEventListener('click', () => {
    currentRoomId = 'general';
    currentDMId = null;
    renderHeader();
    renderMessages();
  });

  document.getElementById('settingsBtn').addEventListener('click', () => {
    settingsOverlayEl.classList.add('open');
  });
  document.getElementById('closeSettings').addEventListener('click', () => {
    settingsOverlayEl.classList.remove('open');
  });
  document.getElementById('saveSettings').addEventListener('click', () => {
    settingsOverlayEl.classList.remove('open');
    showToast('Ustawienia zapisane');
  });
  document.getElementById('resetSettings').addEventListener('click', () => {
    showToast('Zresetowano ustawienia');
  });
  document.getElementById('logoutBtn').addEventListener('click', () => {
    logout();
  });

  emojiBtnEl.addEventListener('click', () => {
    emojiOverlayEl.classList.add('open');
    renderEmojiGrid();
  });
  closeEmojiBtn.addEventListener('click', () => {
    emojiOverlayEl.classList.remove('open');
  });
  emojiOverlayEl.addEventListener('click', (e) => {
    if (e.target === emojiOverlayEl) emojiOverlayEl.classList.remove('open');
  });

  setTimeout(checkUpdatesOnStart, 3000);

  // Baner aktualizacji wysyłany z procesu głównego (GitHub Releases)
  if (YD.onUpdateReady) {
    YD.onUpdateReady((info) => {
      if (info && info.version) showUpdateBanner(info.version, info.url || '', info.notes || '');
    });
  }

  if (YD.onActivity) {
    YD.onActivity((name) => {
      playing = name || null;
      if (playingChipEl) playingChipEl.style.display = playing ? 'flex' : 'none';
      if (playingTextEl) playingTextEl.textContent = playing ? `Grasz w ${playing}` : 'Brak wykrytej gry';
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'activity', playing }));
    });
  }

  setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'users' }));
  }, 15000);
}

function setupAvatarPicker() {
  const options = document.querySelectorAll('.avatar-option');
  options.forEach(opt => {
    opt.addEventListener('click', () => {
      options.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      loginAvatarSeedEl.value = opt.getAttribute('data-seed');
    });
  });
}

function setupColorPicker() {
  const options = document.querySelectorAll('.color-option');
  options.forEach(opt => {
    opt.addEventListener('click', () => {
      options.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      loginColorEl.value = opt.getAttribute('data-color');
    });
  });
}

function openChat() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('chatApp').style.display = 'flex';
  if (myNameEl) myNameEl.textContent = myName;
  if (myAvatarEl) {
    myAvatarEl.textContent = myName.charAt(0).toUpperCase();
    myAvatarEl.style.background = myColor;
  }
  updatePresenceUI();
  connect();
}

function logout() {
  if (ws) { ws.close(); ws = null; }
  if (reconnectTimer) clearTimeout(reconnectTimer);
  currentRoomId = 'general';
  currentDMId = null;
  unread.clear();
  typingUsers.clear();
  allUsers = [];
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('chatApp').style.display = 'none';
  if (messagesEl) messagesEl.innerHTML = '';
  if (roomListEl) roomListEl.innerHTML = '';
  if (dmListEl) dmListEl.innerHTML = '';
  if (userListEl) userListEl.innerHTML = '';
  if (onlineBadgeEl) onlineBadgeEl.textContent = '0';
  if (dmBadgeEl) dmBadgeEl.textContent = '0';
}

function updatePresenceUI() {
  const labels = { online: 'Online', away: 'Zaraz wracam', dnd: 'Nie przeszkadzać', offline: 'Niewidzialny' };
  if (presenceDotEl) presenceDotEl.className = 'presence ' + presence;
  if (presenceTextEl) presenceTextEl.textContent = labels[presence] || 'Online';
  if (myStatusEl) myStatusEl.textContent = labels[presence] || 'Online';
}

function connect() {
  if (ws) { try { ws.close(); } catch { /* ignore */ } ws = null; }
  if (reconnectTimer) clearTimeout(reconnectTimer);

  const socket = new WebSocket(WS_URL);
  ws = socket;

  socket.onopen = () => {
    if (ws !== socket) return;
    console.log('[chat] Połączono z serwerem');
    socket.send(JSON.stringify({
      type: 'join',
      userId: myId,
      name: myName,
      color: myColor,
      avatar: myAvatar,
      playing: playing || null,
    }));
  };

  socket.onmessage = (ev) => {
    if (ws !== socket) return;
    try { const msg = JSON.parse(ev.data); handleMessage(msg); } catch (e) {}
  };

  socket.onclose = () => {
    if (ws !== socket) return;
    ws = null;
    reconnectTimer = setTimeout(connect, 3000);
    if (chatAppEl && chatAppEl.style.display !== 'none') showToast('Próbuję połączyć się ponownie…', 3000);
  };

  socket.onerror = () => {};
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'joined': {
      for (const room of msg.rooms || []) {
        knownRoomIds.add(room.id);
        if (Array.isArray(room.messages) && room.messages.length) {
          history.set(`room:${room.id}`, room.messages.slice(-200).map((m) => ({ ...m, own: m.authorId === myId })));
        }
      }
      renderRooms(msg.rooms);
      renderUsers(msg.users);
      renderDMList(msg.users);
      renderHeader();
      renderMessages();
      if (emptyStateEl) emptyStateEl.style.display = 'flex';
      break;
    }

    case 'message': {
      const m = msg.message;
      if (m.authorId === myId) break;
      m.own = false;
      pushHistory(`room:${m.roomId}`, m);
      if (m.roomId === currentRoomId && !currentDMId) {
        appendMessage(m);
        scrollToBottom();
      } else {
        unread.set(m.roomId, (unread.get(m.roomId) || 0) + 1);
        renderRooms();
        updateBadges();
        if (!document.hasFocus() && m.authorId !== myId) {
          YD.notify?.({ title: `Nowa wiadomość w ${m.roomId}`, body: `${m.authorName}: ${m.text.slice(0, 80)}`, url: `/room/${m.roomId}` });
        }
      }
      break;
    }

    case 'dm': {
      const m = msg.message;
      if (m.authorId === myId) break;
      m.own = false;
      const dmKey = m.authorId === myId ? m.to : m.authorId;
      pushHistory(`dm:${dmKey}`, m);
      if (currentDMId === m.authorId || currentDMId === m.to) {
        appendDMMessage(m);
        scrollToBottom();
      } else {
        const key = m.authorId === myId ? m.to : m.authorId;
        unread.set(key, (unread.get(key) || 0) + 1);
        renderDMList(allUsers);
        updateBadges();
        if (!document.hasFocus()) {
          YD.notify?.({ title: `Nowa wiadomość od ${m.authorName}`, body: m.text.slice(0, 80), url: `/dm/${m.authorId}` });
        }
      }
      break;
    }

    case 'user:joined': {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'users' }));
      showToast(`${esc(msg.user ? msg.user.name : 'Użytkownik')} dołączył`, 2500);
      break;
    }

    case 'user:left': {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'users' }));
      break;
    }

    case 'users:list': {
      allUsers = msg.users || [];
      renderUsers(allUsers);
      renderDMList(allUsers);
      break;
    }

    case 'typing': {
      if (msg.userId === myId) return;
      if (msg.typing) {
        typingUsers.set(msg.userId, { name: msg.name, roomId: currentRoomId });
        setTimeout(() => { typingUsers.delete(msg.userId); renderTyping(); }, 1200);
      } else {
        typingUsers.delete(msg.userId);
      }
      renderTyping();
      break;
    }

    case 'dm:typing': {
      if (msg.userId === myId) return;
      if (msg.typing && currentDMId === msg.userId) {
        typingUsers.set(msg.userId, { name: msg.name, dmId: currentDMId });
        setTimeout(() => { typingUsers.delete(msg.userId); renderTyping(); }, 1200);
      } else if (!msg.typing) {
        typingUsers.delete(msg.userId);
      }
      renderTyping();
      break;
    }

    case 'yapper:activity': {
      break;
    }

    case 'yapper:update-ready': {
      showUpdateBanner(msg.version || 'nowa wersja', msg.url || '', msg.notes || '');
      break;
    }
  }
}

function updateBadges() {
  let total = 0;
  for (const v of unread.values()) total += v;
  if (YD.setBadge) YD.setBadge(total > 0 ? total : 0);
  if (onlineBadgeEl) onlineBadgeEl.textContent = allUsers.length;
  let dmUnread = 0;
  for (const [key, val] of unread.entries()) {
    if (!knownRoomIds.has(key)) dmUnread += val;
  }
  if (dmBadgeEl) {
    dmBadgeEl.textContent = dmUnread;
    dmBadgeEl.style.display = dmUnread > 0 ? 'inline-block' : 'none';
  }
}

function renderRooms(rooms) {
  if (!roomListEl) return;
  if (Array.isArray(rooms)) {
    cachedRooms = rooms;
    for (const room of rooms) knownRoomIds.add(room.id);
  }
  const list = cachedRooms;
  roomListEl.innerHTML = '';
  const roomOrder = ['general', 'random', 'gaming'];
  const sorted = (list || []).sort((a, b) => roomOrder.indexOf(a.id) - roomOrder.indexOf(b.id));

  for (const room of sorted) {
    const item = document.createElement('div');
    const isActive = (room.id === currentRoomId && !currentDMId);
    item.className = 'room-item' + (isActive ? ' active' : '');
    const unreadCount = unread.get(room.id) || 0;
    const initials = room.name.charAt(0).toUpperCase();

    item.innerHTML = `
      <div class="avatar">${initials}</div>
      <div class="name">${esc(room.name)}</div>
      ${unreadCount > 0 ? `<div class="unread">${unreadCount}</div>` : ''}
    `;
    item.onclick = () => {
      currentRoomId = room.id;
      currentDMId = null;
      unread.delete(room.id);
      updateBadges();
      renderRooms();
      renderDMList(allUsers);
      renderHeader();
      renderMessages();
    };
    roomListEl.appendChild(item);
  }
}

function renderDMList(users) {
  if (!dmListEl) return;
  dmListEl.innerHTML = '';
  const others = users.filter((u) => u.id !== myId);

  for (const u of others) {
    const item = document.createElement('div');
    const isActive = (currentDMId === u.id);
    const unreadCount = unread.get(u.id) || 0;
    const statusColor = u.status === 'online' ? '#22c55e' : u.status === 'away' ? '#fbbf24' : u.status === 'dnd' ? '#ef4444' : '#94a3b8';

    item.className = 'dm-item' + (isActive ? ' active' : '');
    item.innerHTML = `
      <div class="avatar" style="background:${u.color}">${u.name.charAt(0).toUpperCase()}</div>
      <div class="name">${esc(u.name)}</div>
      <div class="status-dot ${u.status || 'offline'}"></div>
      ${unreadCount > 0 ? `<div class="unread">${unreadCount}</div>` : ''}
    `;
    item.onclick = () => {
      currentDMId = u.id;
      currentRoomId = null;
      unread.delete(u.id);
      updateBadges();
      renderRooms();
      renderDMList(users);
      renderHeader();
      renderMessages();
    };
    dmListEl.appendChild(item);
  }
}

function renderUsers(users) {
  if (!userListEl) return;
  userListEl.innerHTML = '';
  const me = users.find((u) => u.id === myId);
  const others = users.filter((u) => u.id !== myId);

  const all = [{ ...me, name: myName, color: myColor, avatar: myAvatar, status: presence, playing }, ...others];

  for (const u of all) {
    const item = document.createElement('div');
    item.className = 'dm-item' + (u.id === myId ? ' active' : '');
    const statusColor = u.status === 'online' ? '#22c55e' : u.status === 'away' ? '#fbbf24' : u.status === 'dnd' ? '#ef4444' : '#94a3b8';
    const playingHtml = u.playing ? `<div class="playing-chip" style="margin-top:4px"><span class="playing-icon">🎮</span><span style="font-size:11px">${esc(u.playing)}</span></div>` : '';
    item.innerHTML = `
      <div class="avatar" style="background:${u.color}">${u.name.charAt(0).toUpperCase()}</div>
      <div class="name">${esc(u.name)}</div>
      <div class="status-dot ${u.status || 'offline'}" title="${u.status || 'offline'}"></div>
      <div style="font-size:10px;color:${statusColor};margin-top:2px">${u.status === 'online' ? 'Aktywny' : u.status === 'away' ? 'Zaraz wracam' : u.status === 'dnd' ? 'Nie przeszkadzać' : 'Nieaktywny'}</div>
      ${playingHtml}
    `;
    userListEl.appendChild(item);
  }

  if (onlineBadgeEl) onlineBadgeEl.textContent = users.length;
  document.title = `Yapper Chat (${users.length} online)`;
  updateBadges();
}

function renderHeader() {
  let room = null;
  if (currentDMId) {
    const user = allUsers.find((u) => u.id === currentDMId);
    room = { name: user ? user.name : 'Użytkownik', sub: user ? 'Wiadomość prywatna' : '', avatar: user ? user.name.charAt(0).toUpperCase() : '?' };
    document.getElementById('backBtn').style.display = 'inline-flex';
  } else {
    room = { general: { name: 'Ogólny', sub: 'Główne miejsce do rozmowy', avatar: 'G' }, random: { name: 'Random', sub: 'Luźne tematy i memy', avatar: 'R' }, gaming: { name: 'Gaming', sub: 'Rozmowy o grach', avatar: 'G' } }[currentRoomId || 'general'] || { name: currentRoomId || 'Ogólny', sub: 'Pokój', avatar: '?' };
    document.getElementById('backBtn').style.display = (currentRoomId === 'general') ? 'none' : 'inline-flex';
  }

  if (chatNameEl) chatNameEl.textContent = room.name;
  if (chatSubEl) chatSubEl.textContent = room.sub;
  if (chatAvatarEl) chatAvatarEl.textContent = room.avatar;

  if (emptyStateEl) emptyStateEl.style.display = (currentRoomId || currentDMId) ? 'none' : 'flex';
}

function renderMessages() {
  if (!messagesEl) return;
  messagesEl.innerHTML = '';
  const key = currentDMId ? `dm:${currentDMId}` : `room:${currentRoomId}`;
  const items = history.get(key) || [];

  if (items.length) {
    for (const m of items) {
      if (currentDMId) appendDMMessage(m);
      else appendMessage(m);
    }
  } else if (!currentDMId && (currentRoomId || 'general') === 'general') {
    const demo = [
      { authorId: 'system', authorName: 'System', authorColor: '#64748b', authorAvatar: '', text: 'Witamy w Yapper Chat! Wybierz pokój po lewej lub użytkownika na liście prywatnych wiadomości.', at: Date.now() - 100000, own: false },
      { authorId: myId, authorName: myName, authorColor: myColor, authorAvatar: myAvatar, text: 'Ten interfejs wygląda znacznie lepiej niż poprzedni Yapper.', at: Date.now() - 50000, own: true },
      { authorId: 'other', authorName: 'Kolega', authorColor: '#8fd45c', authorAvatar: '', text: 'Zgadzam się, ciemny motyw i animacje robią robotę.', at: Date.now() - 30000, own: false },
    ];
    for (const m of demo) appendMessage(m);
  } else {
    const hint = document.createElement('div');
    hint.className = 'messages-empty-hint';
    hint.textContent = currentDMId ? 'To początek Twojej prywatnej rozmowy. Napisz pierwszą wiadomość!' : 'Brak wiadomości w tym pokoju. Napisz coś!';
    messagesEl.appendChild(hint);
  }
  scrollToBottom();
}

function pushHistory(key, m) {
  const arr = history.get(key) || [];
  arr.push(m);
  if (arr.length > 300) arr.shift();
  history.set(key, arr);
}

function appendMessage(m) {
  const div = document.createElement('div');
  div.className = 'message' + (m.own ? ' own' : '');
  const time = new Date(m.at || Date.now()).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

  const initials = (m.authorName || 'U').charAt(0).toUpperCase();
  const avatarHtml = `<div class="message-avatar" style="background:${esc(m.authorColor)}">${initials}</div>`;

  let replyHtml = '';
  if (m.replyTo) replyHtml = `<div class="reply-preview">Odpowiedź na: ${esc(m.replyTo)}</div>`;

  div.innerHTML = `
    ${m.own ? '' : avatarHtml}
    <div class="message-content">
      <div class="message-author">${esc(m.authorName)}</div>
      ${replyHtml}<div>${esc(m.text).replace(/\n/g, '<br>')}</div>
      <div class="message-meta">${time}</div>
    </div>
    ${m.own ? avatarHtml : ''}
  `;
  messagesEl.appendChild(div);
}

function appendDMMessage(m) {
  const div = document.createElement('div');
  div.className = 'message' + (m.authorId === myId ? ' own' : '');
  const time = new Date(m.at || Date.now()).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

  const initials = (m.authorName || 'U').charAt(0).toUpperCase();
  const avatarHtml = `<div class="message-avatar" style="background:${esc(m.authorColor)}">${initials}</div>`;

  div.innerHTML = `
    ${m.authorId === myId ? '' : avatarHtml}
    <div class="message-content">
      <div class="message-author">${esc(m.authorName)}</div>
      <div>${esc(m.text).replace(/\n/g, '<br>')}</div>
      <div class="message-meta">${time}</div>
    </div>
    ${m.authorId === myId ? avatarHtml : ''}
  `;
  messagesEl.appendChild(div);
}

function renderTyping() {
  if (!typingBarEl) return;
  const inRoomOrDM = [...typingUsers.entries()].filter(([id, t]) => id !== myId && (
    (t.roomId && t.roomId === currentRoomId && !currentDMId) ||
    (t.dmId && t.dmId === currentDMId)
  )).map(([id, t]) => t.name);

  if (inRoomOrDM.length === 0) { typingBarEl.style.display = 'none'; return; }
  typingBarEl.style.display = 'flex';
  typingBarEl.innerHTML = `<span>${inRoomOrDM.slice(0, 2).join(', ')}${inRoomOrDM.length > 2 ? ` i ${inRoomOrDM.length - 2} inne` : ''}</span> ${inRoomOrDM.length === 1 ? 'pisze…' : 'piszą…'}<div class="typing-dots"><span></span><span></span><span></span></div>`;
}

function scrollToBottom() {
  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
}

function esc(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function showToast(text, ms = 2500) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = text;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- Automatyczne aktualizacje ----------
let UPDATE_INFO_URL = '';
let updateProgressBound = false;

function showUpdateBanner(version, url = '', notes = '') {
  const b = document.getElementById('updateBanner');
  if (!b) return;
  const vEl = document.getElementById('updateVersion');
  if (vEl) vEl.textContent = version;

  const notesEl = document.getElementById('updateNotes');
  if (notesEl && notes) notesEl.textContent = notes;

  b.style.display = 'flex';
  const btn = document.getElementById('updateBtn');
  if (!btn) return;

  if (YD.onUpdateProgress && !updateProgressBound) {
    updateProgressBound = true;
    YD.onUpdateProgress((pct) => {
      if (btn.disabled) btn.textContent = `Pobieram… ${pct}%`;
    });
  }

  btn.disabled = false;
  btn.textContent = 'Aktualizuj';
  btn.title = 'Pobierz i uruchom instalator nowej wersji';
  btn.onclick = async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = 'Pobieram… 0%';
    try {
      const started = YD.installUpdate ? await YD.installUpdate() : false;
      if (started) {
        btn.textContent = 'Uruchamiam instalator…';
        showToast('Pobrano aktualizację — uruchamiam instalator', 4000);
      } else {
        btn.textContent = 'Pobierz ręcznie';
        btn.disabled = false;
        showToast('Otwieram stronę pobierania w przeglądarce');
      }
    } catch {
      btn.textContent = 'Pobierz ręcznie';
      btn.disabled = false;
    }
  };
}

function checkUpdatesOnStart() {
  fetch('http://127.0.0.1:47830/api/update-check')
    .then((r) => r.json())
    .then((info) => {
      if (info && info.hasUpdate) {
        UPDATE_INFO_URL = info.url || '';
        showUpdateBanner(info.latestVersion || info.version, UPDATE_INFO_URL, info.notes);
      }
    })
    .catch(() => {});
}

// ---------- Emoji picker ----------
function renderEmojiGrid() {
  if (!emojiGridEl) return;
  emojiGridEl.innerHTML = '';
  for (const emoji of EMOJIS) {
    const item = document.createElement('div');
    item.className = 'emoji-item';
    item.textContent = emoji;
    item.title = emoji;
    item.onclick = () => {
      insertEmoji(emoji);
      emojiOverlayEl.classList.remove('open');
    };
    emojiGridEl.appendChild(item);
  }
}

function insertEmoji(emoji) {
  if (!messageInputEl) return;
  const start = messageInputEl.selectionStart;
  const end = messageInputEl.selectionEnd;
  const text = messageInputEl.value;
  messageInputEl.value = text.slice(0, start) + emoji + text.slice(end);
  messageInputEl.selectionStart = messageInputEl.selectionEnd = start + emoji.length;
  messageInputEl.focus();
  sendBtnEl.disabled = !messageInputEl.value.trim();
  const h = messageInputEl.scrollHeight;
  messageInputEl.style.height = 'auto';
  messageInputEl.style.height = Math.min(h, 120) + 'px';
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
