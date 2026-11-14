// Chill — logika interfejsu (konta, czat, ustawienia)
'use strict';

const CHILL = window.chill || {};
const VOICE = window.CHILL_VOICE;
const ATTACHMENTS = window.CHILL_ATTACHMENTS;
const APPEARANCE = window.CHILL_APPEARANCE;
const CHAT_BASE = CHILL.chatUrl || `http://127.0.0.1:${CHILL.chatPort || 47830}`;
const WS_URL = `${CHAT_BASE.replace(/^http/, 'ws')}/chat`;
function localChatAddress() {
  if (CHILL.web && location.host) return location.host;
  return `127.0.0.1:${CHILL.chatPort || 47830}`;
}
const $ = (id) => document.getElementById(id);

// ---------- GIF-y (statyczny katalog GIPHY + KLIPY + Tenor) ----------
const GIFS = Array.isArray(window.CHILL_GIFS) ? window.CHILL_GIFS : [];
const GIF_BASE = 'https://media.giphy.com/media';
const GIF_ID_RE = /^[A-Za-z0-9]{5,40}$/;
const GIF_MESSAGE_RE = /^https:\/\/media\.giphy\.com\/media\/([A-Za-z0-9]{5,40})\/giphy\.gif$/;
const KLIPY_MEDIA_RE = /^https:\/\/static2?\.klipy\.com\/ii\/[a-f0-9]{32}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[A-Za-z0-9]+\.(?:webp|gif)$/;
const KLIPY_PAGE_RE = /^[a-z0-9][a-z0-9-]{2,79}$/;
const TENOR_MEDIA_RE = /^https:\/\/media1?\.tenor\.com\/(?:m\/)?[A-Za-z0-9_%-]{6,40}\/[A-Za-z0-9._~%-]+\.(?:webp|gif)$/;
const TENOR_PAGE_RE = /^https:\/\/tenor\.com\/view\/[A-Za-z0-9_%~-]{2,200}$/;
const GIF_ALL_CATEGORIES = 'Wszystkie';
const GIF_KLIPY_CATEGORY = 'KLIPY';
const GIF_TENOR_CATEGORY = 'Tenor';
const GIF_CATEGORY_QUERY = {
  Popularne: 'popular trending',
  Reakcje: 'reactions reaction reakcja',
  Śmieszne: 'funny',
  Zwierzęta: 'animals pets',
  Jedzenie: 'food drink',
  Gry: 'games gaming gra',
  KLIPY: 'klipy',
  Tenor: 'tenor memy memes',
};
const GIF_QUERY_ALIASES = {
  serce: ['serca'],
  serca: ['serce'],
  koty: ['kot'],
  psy: ['pies'],
  ciasta: ['ciasto'],
  gry: ['gra'],
  gra: ['gry'],
  reakcja: ['reakcje'],
  reakcje: ['reakcja'],
};
let gifState = { category: GIF_ALL_CATEGORIES, query: '' };
let gifPreviewObserver = null;
let gifPageObserver = null;
let gifRemoteState = { query: '', next: '', items: [], loading: false, done: false, error: '', requestId: 0 };
let gifSearchTimer = null;
const GIF_KLIPY_API_KEY_STORAGE = 'chill:klipy-api-key';
const GIF_KLIPY_API_KEY_DEFAULT = 'dVJ1dUigwpzYSxwJuOyiXZycOZlwyYqO7XJ3RkYSITJch8SLwr0O47qhSQHiPcXB';
const GIF_KLIPY_API = 'https://api.klipy.com/v2';

const GIF_BY_ID = new Map();
const KLIPY_BY_URL = new Map();
const TENOR_BY_URL = new Map();
for (const gif of GIFS) {
  if (!gif) continue;
  if (gif.source === 'klipy') {
    if (KLIPY_MEDIA_RE.test(String(gif.webp || ''))) KLIPY_BY_URL.set(gif.webp, gif);
    if (KLIPY_MEDIA_RE.test(String(gif.gif || ''))) KLIPY_BY_URL.set(gif.gif, gif);
  } else if (gif.source === 'tenor') {
    if (TENOR_MEDIA_RE.test(String(gif.webp || ''))) TENOR_BY_URL.set(gif.webp, gif);
    if (TENOR_MEDIA_RE.test(String(gif.gif || ''))) TENOR_BY_URL.set(gif.gif, gif);
  } else if (GIF_ID_RE.test(String(gif.id || ''))) {
    GIF_BY_ID.set(gif.id, gif);
  }
}

// ---------- Naklejki ----------
const STICKER_PACK = window.CHILL_STICKER_PACK && typeof window.CHILL_STICKER_PACK === 'object'
  ? window.CHILL_STICKER_PACK
  : null;
const STICKERS = Array.isArray(STICKER_PACK?.stickers) ? STICKER_PACK.stickers : [];
const STICKER_ALL_CATEGORIES = 'Wszystkie';
const STICKER_MESSAGE_RE = /^chill-sticker:\/\/([a-z0-9-]{2,40})$/;
const STICKER_BY_ID = STICKER_PACK?.byId instanceof Map
  ? STICKER_PACK.byId
  : new Map(STICKERS.map((sticker) => [sticker.id, sticker]));
let stickerState = { category: STICKER_ALL_CATEGORIES, query: '' };

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
let myProfileHandle = '';
let myAvatar = '';
let myBanner = null;
let myBadges = ['piwo'];
let myGames = [];
let ws = null;
let reconnectTimer = null;
let servers = [];
let activeServerId = null;
const serverStates = new Map();
let allUsers = [];
let friends = [];
let friendState = { friends: [], incoming: [], outgoing: [] };
let pendingAttachment = null;
let attachmentUploading = false;
let spotifyPanelOpen = false;
let profileTarget = null;
let profileSelectedGame = '';
let profileGamesExpanded = false;
let profileTimer = null;
let profileGameSince = 0;
let playing = null;
let playingIcon = '';
let playingPlatform = '';
let playingSince = null;
let searchQuery = '';
let localVoiceKey = '';
let voiceSession = null;
let voiceStarting = false;
let voiceAudio = null;
let voicePlayback = { messageId: '', url: '', duration: 0, playing: false, voice: null, retried: false };
const voiceTokenWaiters = new Map();
let liveVoice = null;
let liveVoicePlayback = null;
let liveVoiceCaptureToken = 0;
let liveVoiceShareToken = 0;
let liveVoiceScreen = null;
let screenSharePicker = { sources: [], tab: 'screen', loading: false, busy: false, error: '' };
const liveVoiceSpeaking = new Map();
let current = { kind: 'home' };
let miniGamesInstalled = [];
const miniGameDownloads = new Map();
let miniGameSession = null;
let miniGameCurrent = null;
let miniGameStarted = false;
let miniGamePaused = false;
let miniGameEnded = false;
let profileColor = '#3ee0a3';
let profileAvatar = '';
let profileBanner = null;
let profileBadges = ['piwo'];
let profileGames = [];
let bannerDraft = null;
let regColor = '#3ee0a3';
let serverColor = '#3ee0a3';
let downloadingUpdate = false;
let autoUpdateVersion = '';
let currentUpdateInfo = null;
let audioCtx = null;
let micTest = null;
let mentionState = { start: 0, end: 0, items: [], index: 0 };
let channelType = 'text';
let editingChannelId = null;
let menuChannelId = null;
let serverSettingsColor = '#3ee0a3';
let serverSettingsBanner = 'graphite';
let serverSettingsTraits = [];
let serverSettingsGames = [];
let serverSettingsIconValue = '';
let serverSettingsIconDraft = '';
let serverProfileColor = '#3ee0a3';

const SERVER_BANNER_IDS = ['graphite', 'rose', 'crimson', 'ember', 'gold', 'violet', 'azure', 'aqua', 'lime', 'slate'];
const SERVER_TRAIT_LIMIT = 5;
const SERVER_TRAIT_LENGTH = 24;
const SERVER_GAME_LIMIT = 5;
const SERVER_GAME_LENGTH = 24;
const SERVER_DESCRIPTION_LENGTH = 280;
const SERVER_ICON_CHOICES = [
  '🎮', '🕹️', '🎧', '🎯', '⚔️', '🛡️', '🔥', '⚡',
  '🌙', '🌊', '🐺', '🦊', '🐉', '🦅', '💎', '🚀',
  '🧩', '🎲', '🏆', '🍕', '☕', '🌿', '👾', '💬',
];
const SERVER_GAME_CHOICES = [
  'Minecraft', 'Roblox', 'Fortnite', 'CS2', 'League of Legends',
  'Valorant', 'GTA V', 'Among Us', 'Rocket League', 'Apex Legends',
  'Dota 2', 'Overwatch 2', 'Rust', 'Terraria', 'Stardew Valley', 'Elden Ring',
];
const SERVER_TRAIT_EMOJI = '🙂';
let deleteChannelId = null;
let pendingChannelDelete = false;
let channelPrefs = {};
let inviteChannel = null;
let inviteRequestSeq = 0;
let discordConfig = { clientId: '', redirectUri: 'http://localhost:47831/callback' };
let discordUser = null;
let discordGuilds = [];
let discordPreviewData = null;
let discordBusy = false;
let discordEditingConfig = false;

const history = new Map();
const unread = new Map();
const typingUsers = new Map();

const DEFAULT_PREFS = {
  theme: 'system',
  accent: '#3ee0a3',
  shape: 'soft',
  background: 'default',
  messageStyle: 'bubbles',
  fontScale: 'normal',
  uiScale: 1,
  reduceMotion: false,
  highContrast: false,
  compact: false,
  notify: true,
  sound: true,
  mentionsOnly: false,
  gameDetect: true,
  status: 'online',
  lang: 'pl',
  showAllChannels: true,
  hideMutedChannels: false,
  micMuted: false,
  deafened: false,
  audioInput: '',
  audioOutput: '',
  outputVolume: 100,
  noiseSuppression: true,
  autoGainControl: true,
  echoCancellation: false,
};
let prefs = { ...DEFAULT_PREFS };
let authMode = 'login';

// ---------- Tłumaczenia / i18n ----------
const I18N_EN = {
  // Ekran logowania
  'Twoja przestrzeń na spokojne rozmowy': 'Your space for calm conversations',
  'Pogadajmy.<br><span>Bez pośpiechu.</span>': "Let's talk.<br><span>No rush.</span>",
  'Własne serwery, kanały tematyczne i prywatne wiadomości — wszystko, co potrzebne, żeby po prostu pogadać, w jednym miejscu.': 'Your own servers, topic channels and private messages — everything you need to simply chat, all in one place.',
  'Serwery i kanały tworzone przez Ciebie': 'Servers and channels made by you',
  'Zaproszenia linkiem i rozmowy 1:1': 'Invite links and one-on-one chats',
  'Emoji, statusy i historia, która zostaje': 'Emoji, statuses and history that stays',
  'Konta przechowywane lokalnie • bez chmury': 'Accounts stored locally • no cloud',
  'Zaloguj się': 'Log in',
  'Utwórz konto': 'Create account',
  'Witaj ponownie': 'Welcome back',
  'Zacznij w Chill': 'Get started with Chill',
  'Zaloguj się nazwą użytkownika lub e-mailem.': 'Log in with your username or email.',
  'Utwórz konto — nazwa użytkownika i hasło wystarczą.': 'Create an account — a username and password are enough.',
  'Nazwa użytkownika lub e-mail': 'Username or email',
  'np. kasia lub ty@chill.app': 'e.g. kate or you@chill.app',
  'Hasło': 'Password',
  'Pokaż': 'Show',
  'Ukryj': 'Hide',
  'Pokaż hasło': 'Show password',
  'Ukryj hasło': 'Hide password',
  'Zapamiętaj mnie': 'Remember me',
  'Caps Lock włączony': 'Caps Lock is on',
  'Nie masz jeszcze konta?': "Don't have an account yet?",
  'Utwórz je w 10 sekund': 'Create one in 10 seconds',
  'Nazwa użytkownika': 'Username',
  'np. kasia': 'e.g. kate',
  'E-mail': 'Email',
  'opcjonalnie': 'optional',
  'np. ty@chill.app': 'e.g. you@chill.app',
  'Nazwa wyświetlana': 'Display name',
  'Jak mają Cię widzieć inni?': 'How should others see you?',
  'Minimum 8 znaków': 'At least 8 characters',
  'Kolor profilu': 'Profile color',
  'Miętowy': 'Mint',
  'Błękitny': 'Sky blue',
  'Brzoskwiniowy': 'Peach',
  'Różowy': 'Pink',
  'Lawendowy': 'Lavender',
  'Żółty': 'Yellow',
  'Użyj co najmniej 8 znaków.': 'Use at least 8 characters.',
  'Słabe hasło': 'Weak password',
  'Średnie hasło': 'Medium password',
  'Dobre hasło': 'Good password',
  'Silne hasło': 'Strong password',
  'Masz już konto?': 'Already have an account?',
  'Konto i historia rozmów są zapisane tylko na tym komputerze. Hasło jest szyfrowane lokalnie (scrypt).': 'Your account and chat history are stored only on this computer. The password is encrypted locally (scrypt).',
  'Konto, serwery i historia rozmów są zapisane na serwerze Chill. Hasło jest chronione skrótem scrypt.': 'Your account, servers and chat history are stored on the Chill server. The password is protected with scrypt.',
  'Podaj login i hasło.': 'Enter your username and password.',
  'Nie udało się zalogować.': 'Could not log in.',
  'Wystąpił błąd. Spróbuj ponownie.': 'Something went wrong. Try again.',
  'Uzupełnij nazwę użytkownika i hasło.': 'Fill in your username and password.',
  'Podaj poprawny adres e-mail albo zostaw pole puste.': 'Enter a valid email address or leave the field empty.',
  'Podaj poprawny adres e-mail lub zostaw pole puste.': 'Enter a valid email address or leave the field empty.',
  'Adres e-mail jest zbyt długi.': 'The email address is too long.',
  'Nazwa wyświetlana musi mieć 2–32 znaki.': 'The display name must be 2–32 characters.',
  'Hasło jest zbyt długie.': 'The password is too long.',
  'Konto z tym adresem e-mail już istnieje.': 'An account with this email address already exists.',
  'Ta nazwa użytkownika jest już zajęta.': 'This username is already taken.',
  'Nieprawidłowy login lub hasło.': 'Incorrect username or password.',
  'Konto nie istnieje.': 'The account does not exist.',
  'Wybierz poprawny kolor.': 'Choose a valid color.',
  'Obecne hasło jest nieprawidłowe.': 'The current password is incorrect.',
  'Nowe hasło jest zbyt długie.': 'The new password is too long.',
  'Nazwa użytkownika: 3–20 znaków (litery, cyfry, _ i .).': 'Username: 3–20 characters (letters, digits, _ and .).',
  'Hasło musi mieć co najmniej 8 znaków.': 'The password must be at least 8 characters.',
  'Nie udało się utworzyć konta.': 'Could not create the account.',
  'Sesja wygasła. Zaloguj się ponownie.': 'Your session expired. Log in again.',

  // Aplikacja / nawigacja
  'Serwery': 'Servers',
  'Wiadomości prywatne': 'Direct messages',
  'Lista serwerów': 'Server list',
  'Dodaj serwer': 'Add server',
  'Kanały': 'Channels',
  'Nowy kanał': 'New channel',
  'właściciel': 'owner',
  'Szukaj rozmowy': 'Search conversations',
  'Szukaj kanału': 'Search channels',
  'Ustawienia': 'Settings',
  'Wyloguj': 'Log out',
  'Edytuj profil': 'Edit profile',
  'Wstecz': 'Back',
  'Zaproś do serwera': 'Invite to server',
  'Zaproś': 'Invite',
  'Szukaj w wiadomościach': 'Search messages',
  'Zamknij': 'Close',
  'Pokaż członków': 'Show members',
  'Emoji': 'Emoji',
  'Szukaj emoji…': 'Search emoji…',
  'Szukaj GIF-ów…': 'Search GIFs…',
  'Wklej klucz API KLIPY z partner.klipy.com. Klucz zapisze się tylko na tym urządzeniu.': 'Paste your KLIPY API key from partner.klipy.com. It will be stored only on this device.',
  'Wyniki z internetu wymagają klucza KLIPY.': 'Online results need a KLIPY API key.',
  'Skonfiguruj klucz API': 'Set up API key',
  'Nie udało się pobrać GIF-ów. Sprawdź klucz API i połączenie.': 'Could not load GIFs. Check the API key and connection.',
  'Ładowanie GIF-ów…': 'Loading GIFs…',
  'Przewiń, aby załadować więcej': 'Scroll to load more',
  'Naklejki': 'Stickers',
  'Naklejka': 'Sticker',
  'Szukaj naklejek…': 'Search stickers…',
  'Wiadomość głosowa': 'Voice message',
  'Głosówka': 'Voice message',
  'Nagraj wiadomość głosową': 'Record a voice message',
  'Nagrywanie…': 'Recording…',
  'Wyślij nagranie': 'Send recording',
  'Anuluj nagrywanie': 'Cancel recording',
  'Wysyłanie…': 'Sending…',
  'Odtwórz wiadomość głosową': 'Play voice message',
  'Wstrzymaj wiadomość głosową': 'Pause voice message',
  'Przewiń wiadomość głosową': 'Seek voice message',
  'Nie udało się nagrać wiadomości głosowej.': 'Could not record the voice message.',
  'Nie udało się włączyć mikrofonu. Sprawdź uprawnienia w systemie.': 'Could not access the microphone. Check system permissions.',
  'Nagranie jest za krótkie.': 'The recording is too short.',
  'Nie udało się wysłać wiadomości głosowej.': 'Could not send the voice message.',
  'Sesja głosowa wygasła — połącz ponownie.': 'The voice session expired — reconnect.',
  'Nagranie jest za duże.': 'The recording is too large.',
  'Nieobsługiwany format nagrania.': 'Unsupported recording format.',
  'Nie można teraz nagrywać — połącz z serwerem.': 'Cannot record right now — connect to the server.',
  'Połącz z serwerem, aby odtworzyć głosówkę.': 'Connect to the server to play the voice message.',
  'Nie można odtworzyć wiadomości głosowej.': 'Could not play the voice message.',
  'Maksymalna długość nagrania to 120 sekund.': 'The maximum recording length is 120 seconds.',
  'Nie wysłano nagrania — zmieniono rozmowę.': 'Recording not sent — the conversation changed.',
  'Dodaj plik': 'Add file',
  'Upuść plik, aby go wysłać': 'Drop a file to send it',
  'Możesz dodać opis w polu wiadomości.': 'You can add a caption in the message field.',
  'Usuń załącznik': 'Remove attachment',
  'Przeciągnij plik tutaj': 'Drag a file here',
  'Wyślij plik': 'Send file',
  'Nie udało się wysłać pliku.': 'Could not send the file.',
  'Plik jest za duży. Maksymalny rozmiar to 12 MB.': 'The file is too large. The maximum size is 12 MB.',
  'Nie można teraz dodać pliku — połącz z serwerem.': 'Cannot add a file right now — connect to the server.',
  'Załącznik': 'Attachment',
  'Pobierz plik': 'Download file',
  'Otwórz plik': 'Open file',
  'Wysyłanie pliku…': 'Sending file…',
  'Zaproszenie do znajomych': 'Friend request',
  'Zaproszenia do znajomych': 'Friend requests',
  'Akceptuj': 'Accept',
  'Odrzuć': 'Decline',
  'Anuluj zaproszenie': 'Cancel request',
  'Usuń znajomego': 'Remove friend',
  'Wyślij zaproszenie': 'Send friend request',
  'Zaproszenie wysłane': 'Friend request sent',
  'Zaproszenie oczekuje': 'Friend request pending',
  'Zaproszenie zaakceptowane': 'Friend request accepted',
  'Nie udało się wysłać zaproszenia.': 'Could not send the friend request.',
  'Ta osoba musi zaakceptować zaproszenie, zanim będziecie mogli pisać.': 'This person must accept the request before you can message each other.',
  'Możecie teraz pisać do siebie.': 'You can message each other now.',
  'Aby wysłać wiadomość, najpierw zaczekaj na akceptację zaproszenia.': 'Wait for the friend request to be accepted before messaging.',
  'Brak znajomych — dodaj osobę z listy członków': 'No friends — add someone from the member list',
  'Nowe zaproszenie do znajomych': 'New friend request',
  'Nowe zaproszenie do znajomych: {name}': 'New friend request from {name}',
  'Odrzucono zaproszenie.': 'Friend request declined.',
  'Usunięto znajomego.': 'Friend removed.',
  'Spotify': 'Spotify',
  'Muzyka dla całego kanału': 'Music for the whole channel',
  'Odtwórz': 'Play',
  'Wyłącz muzykę': 'Stop music',
  'Otwórz Spotify': 'Open Spotify',
  'Link Spotify lub nazwa utworu…': 'Spotify link or track name…',
  'Wklej link do utworu, albumu lub playlisty Spotify. Wszyscy na kanale zobaczą ten sam odtwarzacz.': 'Paste a Spotify track, album or playlist link. Everyone in the channel will see the same player.',
  'Jeśli wpiszesz nazwę utworu, otworzymy wyszukiwarkę Spotify — skopiuj link i wklej go tutaj.': 'If you enter a track name, we will open Spotify search — copy the link and paste it here.',
  'Nieprawidłowy link Spotify.': 'Invalid Spotify link.',
  'Muzyka została wyłączona.': 'Music has been stopped.',
  'Dodane przez {name}': 'Added by {name}',
  'Odtwarzacz jest zsynchronizowany dla wszystkich na kanale.': 'The player is synced for everyone in the channel.',
  'Spotify jest dostępne na kanałach głosowych.': 'Spotify is available in voice channels.',
  'Otworzyliśmy wyszukiwarkę Spotify — skopiuj link do utworu i wklej go tutaj.': 'We opened Spotify search — copy the track link and paste it here.',
  'Nie udało się włączyć muzyki.': 'Could not start the music.',
  'Utwór': 'Track',
  'Album': 'Album',
  'Playlista': 'Playlist',
  'Odcinek': 'Episode',
  'Podcast': 'Podcast',
  'Artysta': 'Artist',
  'Otwórz w aplikacji': 'Open in the app',
  'Kopiuj link do aplikacji': 'Copy app link',
  'Wszystkie': 'All',
  'Popularne': 'Popular',
  'Reakcje': 'Reactions',
  'Śmieszne': 'Funny',
  'Zwierzęta': 'Animals',
  'Jedzenie': 'Food',
  'Impreza': 'Party',
  'Emocje': 'Emotions',
  'Gry': 'Games',
  'Otwórz GIF': 'Open GIF',
  'Członkowie': 'Members',
  'Napisz wiadomość…': 'Write a message…',
  'Wyślij': 'Send',
  'Nowa wersja': 'New version',
  'Pobierz ręcznie': 'Download manually',

  // Dźwięk / mikrofon
  'Wycisz mikrofon': 'Mute microphone',
  'Włącz mikrofon': 'Unmute microphone',
  'Wybierz mikrofon': 'Choose microphone',
  'Wycisz dźwięk': 'Mute audio',
  'Włącz dźwięk': 'Unmute audio',
  'Wybierz słuchawki': 'Choose headphones',
  'Mikrofon': 'Microphone',
  'Wejście audio': 'Audio input',
  'Słuchawki': 'Headphones',
  'Wyjście audio': 'Audio output',
  'Urządzenie': 'Device',
  'Domyślne urządzenie': 'Default device',
  'Brak dostępnych urządzeń': 'No devices available',
  'Ładowanie urządzeń…': 'Loading devices…',
  'Urządzenie {n}': 'Device {n}',
  'Ustawienie zapisuje się lokalnie.': 'This setting is saved locally.',
  'Nawiązano połączenie': 'Voice connected',
  'Łączenie z kanałem głosowym…': 'Connecting to voice channel…',
  'Dołącz do kanału głosowego': 'Join voice channel',
  'Przenieś się tutaj': 'Move here',
  '1 osoba na kanale': '1 person in the channel',
  '{count} osoby na kanale': '{count} people in the channel',
  '{count} osób na kanale': '{count} people in the channel',
  'Kanał jest pusty': 'The channel is empty',
  'Jesteś na kanale {name}': 'You are in {name}',
  'Zaproś na kanał głosowy': 'Invite to voice channel',
  'Brak dostępu do mikrofonu. Dołączono w trybie słuchania.': 'No microphone access. Joined in listen-only mode.',
  'Nie udało się dołączyć do kanału głosowego.': 'Could not join the voice channel.',
  'Kanał głosowy został usunięty.': 'The voice channel was deleted.',
  'Rozłączono z kanałem głosowym.': 'Disconnected from the voice channel.',
  'Mikrofon wyłączony': 'Microphone off',
  'Słuchawki wyłączone': 'Headphones off',
  'Nikt nie jest teraz na tym kanale': 'No one is in this channel right now',
  'Dołącz i zacznij rozmowę.': 'Join and start talking.',
  'Ustawienia głosu': 'Voice settings',
  'Otwórz kanał głosowy': 'Open voice channel',
  'Udostępnij ekran': 'Share screen',
  'Zakończ udostępnianie': 'Stop sharing',
  'Udostępniasz ekran': 'You are sharing your screen',
  'Udostępnia ekran': 'Sharing screen',
  '{name} udostępnia ekran': '{name} is sharing a screen',
  'Udostępniony ekran': 'Shared screen',
  'Udostępniony ekran: {name}': 'Shared screen: {name}',
  'Oczekiwanie na obraz…': 'Waiting for video…',
  'Wybierz cały ekran albo okno aplikacji.': 'Choose an entire screen or an application window.',
  'Cały ekran': 'Entire screen',
  'Aplikacja': 'Application',
  'Brak dostępnych ekranów.': 'No screens available.',
  'Brak dostępnych okien.': 'No windows available.',
  'Ładowanie źródeł…': 'Loading sources…',
  'Wybierz ekran lub okno aplikacji.': 'Choose a screen or application window.',
  'Odśwież': 'Refresh',
  'Nie udało się pobrać listy ekranów.': 'Could not load the screen list.',
  'Nie udało się rozpocząć udostępniania ekranu.': 'Could not start screen sharing.',
  'Udostępnianie ekranu zakończone.': 'Screen sharing ended.',
  'Udostępnianie ekranu nie jest dostępne.': 'Screen sharing is not available.',
  'Najpierw dołącz do kanału głosowego.': 'Join a voice channel first.',
  'Ktoś już udostępnia ekran na tym kanale.': 'Someone is already sharing a screen in this channel.',
  'Ty': 'You',
  'Konto': 'Account',
  'Wyloguj się': 'Log out',
  'Wylogowanie kończy sesję na tym urządzeniu. Konto i historia pozostaną zapisane.': 'Logging out ends the session on this device. Your account and history stay saved.',

  // Profil / ustawienia
  'Dodaj do znajomych': 'Add friend',
  'Napisz wiadomość': 'Send message',
  'Profil': 'Profile',
  'Wygląd': 'Appearance',
  'Język': 'Language',
  'Powiadomienia': 'Notifications',
  'Aplikacja': 'App',
  'Twój profil': 'Your profile',
  'Tak widzą Cię inni na serwerach i wiadomościach prywatnych.': 'This is how others see you on servers and in direct messages.',
  'Status': 'Status',
  'Online': 'Online',
  'Zaraz wracam': 'Away',
  'Nie przeszkadzać': 'Do not disturb',
  'Niewidoczny': 'Invisible',
  'Offline': 'Offline',
  'O mnie': 'About me',
  'Krótko o sobie…': 'A few words about yourself…',
  'Zapisz profil': 'Save profile',
  'Bezpieczeństwo': 'Security',
  'Obecne hasło': 'Current password',
  'Nowe hasło': 'New password',
  'Zmień hasło': 'Change password',
  'Dopasuj Chill do siebie. Zmiany zapisują się od razu.': 'Make Chill yours. Changes save instantly.',
  'Skala interfejsu': 'Interface scale',
  'Przywróć 100%': 'Restore 100%',
  'Skaluje całą aplikację, łącznie z oknami ustawień i menu. Domyślnie 100%.': 'Scales the entire app, including settings windows and menus. Defaults to 100%.',
  'Motyw': 'Theme',
  'Systemowy': 'System',
  'Czarny': 'Black',
  'Biały': 'White',
  'Gradient': 'Gradient',
  'Kolor akcentu': 'Accent color',
  'Kompaktowe wiadomości': 'Compact messages',
  'Mniejszy odstęp między wiadomościami': 'Less spacing between messages',
  'Dostępność': 'Accessibility',
  'Głos i dźwięk': 'Voice & sound',
  'Presety wyglądu': 'Appearance presets',
  'Miękki i spokojny': 'Soft and calm',
  'Płaski, ciemny, fioletowy': 'Flat, dark, blurple',
  'Prosty i monochromatyczny': 'Simple and monochrome',
  'Fioletowa poświata': 'Purple glow',
  'Zorza': 'Aurora',
  'Zachód słońca': 'Sunset',
  'Ciepłe pomarańcze': 'Warm oranges',
  'Chłodny błękit': 'Cool blue',
  'Kształt interfejsu': 'Interface shape',
  'Miękki': 'Soft',
  'Zaokrąglony': 'Rounded',
  'Kwadratowy': 'Square',
  'Tło aplikacji': 'App background',
  'Domyślne': 'Default',
  'Las': 'Forest',
  'Mono': 'Mono',
  'Styl wiadomości': 'Message style',
  'Dymki': 'Bubbles',
  'Płaski (Discord)': 'Flat (Discord)',
  'Własny kolor': 'Custom color',
  'Zielony': 'Green',
  'Czerwony': 'Red',
  'Fuksja': 'Fuchsia',
  'Cyjan': 'Cyan',
  'Złoty': 'Gold',
  'Dostosuj czytelność, rozmiar tekstu i animacje.': 'Adjust readability, text size and motion.',
  'Rozmiar tekstu wiadomości': 'Message text size',
  'Mały': 'Small',
  'Normalny': 'Normal',
  'Duży': 'Large',
  'Ogranicz animacje': 'Reduce motion',
  'Wyłącz animacje i płynne przewijanie': 'Turn off animations and smooth scrolling',
  'Wysoki kontrast': 'High contrast',
  'Mocniejsze obramowania i czytelniejszy tekst': 'Stronger borders and clearer text',
  'Te ustawienia działają od razu i są zapisywane na tym koncie.': 'These settings apply instantly and are saved to this account.',
  'Wybierz mikrofon, sprawdź jego poziom i dopasuj dźwięk.': 'Choose a microphone, check its level and adjust the sound.',
  'Słuchawki / głośniki': 'Headphones / speakers',
  'Test mikrofonu': 'Microphone test',
  'Sprawdź, czy Chill Cię słyszy.': 'Check that Chill can hear you.',
  'Poziom mikrofonu': 'Microphone level',
  'Kliknij „Test mikrofonu”, aby sprawdzić poziom.': 'Click “Microphone test” to check the level.',
  'Zatrzymaj test': 'Stop test',
  'Poziom mikrofonu: {value}%': 'Microphone level: {value}%',
  'Nie udało się uruchomić testu mikrofonu.': 'Could not start the microphone test.',
  'Redukcja szumów': 'Noise suppression',
  'Usuwa stały szum w tle': 'Removes constant background noise',
  'Automatyczna głośność': 'Automatic gain control',
  'Wyrównuje głośność mowy': 'Evens out speech volume',
  'Usuwanie echa': 'Echo cancellation',
  'Przydatne przy głośnikach; może ściszyć głosówki': 'Useful with speakers; may make voice notes quieter',
  'Głośność wiadomości głosowych': 'Voice message volume',
  'Odtwórz dźwięk testowy': 'Play test sound',
  'Ustawienia mikrofonu dotyczą nowych nagrań. Głośność zmienia odtwarzanie wiadomości głosowych.': 'Microphone settings apply to new recordings. Volume changes voice message playback.',
  'Wybierz język interfejsu Chill. Zmiana działa od razu.': 'Choose the Chill interface language. Changes apply instantly.',
  'Język interfejsu': 'Interface language',
  'Ustawienie języka jest zapisywane na tym koncie i nie zmienia historii rozmów.': 'The language setting is saved to this account and does not change your chat history.',
  'Wybierz, kiedy Chill ma Ci przerywać.': 'Choose when Chill should interrupt you.',
  'Powiadomienia systemowe': 'System notifications',
  'Dymki, gdy okno jest w tle': 'Pop-ups while the window is in the background',
  'Dźwięk nowej wiadomości': 'New message sound',
  'Delikatny sygnał przy odbiorze': 'A subtle sound when a message arrives',
  'Tylko wzmianki': 'Mentions only',
  'Powiadamiaj wyłącznie o @nazwa': 'Notify only about @name',
  'Ustawienia systemowe i aktualizacje.': 'System settings and updates.',
  'Uruchamiaj z Windows': 'Launch with Windows',
  'Chill startuje w tle po zalogowaniu': 'Chill starts in the background after you log in',
  'Wykrywanie gier': 'Game detection',
  'Pokazuj „Gra w …” na profilu': 'Show “Playing …” on your profile',
  'Wersja Chill': 'Chill version',
  'Sprawdź aktualizacje': 'Check for updates',
  'Konta i historia są przechowywane lokalnie w folderze danych aplikacji. Odinstalowanie Chill usuwa także te dane.': 'Accounts and history are stored locally in the app data folder. Uninstalling Chill also removes this data.',

  // Serwery / zaproszenia / kanały
  'Utwórz własną przestrzeń albo dołącz kodem zaproszenia od znajomych.': 'Create your own space or join with an invite code from friends.',
  'Utwórz serwer': 'Create server',
  'Dołącz kodem': 'Join with code',
  'Nazwa serwera': 'Server name',
  'np. Ekipa z podwórka': 'e.g. The neighborhood crew',
  'Kolor serwera': 'Server color',
  'Link zaproszenia': 'Invite link',
  'Poproś właściciela serwera o link. Działa w sieci lokalnej, a po przekierowaniu portu 47830 — także przez internet.': 'Ask the server owner for a link. It works on the local network, and through the internet after forwarding port 47830.',
  'Dołącz do serwera': 'Join server',
  'Kopiuj': 'Copy',
  'Wyślij ten link znajomemu. Musi mieć uruchomiony Chill i wpisać go w oknie "Dołącz kodem".': 'Send this link to a friend. They need Chill running and must enter it in the "Join with code" window.',
  'Wyślij ten link znajomemu. Otworzy go w przeglądarce i dołączy do serwera po zalogowaniu.': 'Send this link to a friend. They will open it in a browser and join the server after signing in.',
  'Wybierz typ kanału i nadaj mu nazwę.': 'Choose the channel type and give it a name.',
  'Typ kanału': 'Channel type',
  'Do pisania': 'Text',
  'Głosowy': 'Voice',
  'Nazwa kanału': 'Channel name',
  'np. ogólny': 'e.g. general',
  'Anuluj': 'Cancel',
  'Stwórz': 'Create',
  'Usuń kanał': 'Delete channel',
  'Usunąć kanał?': 'Delete channel?',
  'Tej operacji nie można cofnąć. Historia wiadomości w kanale zostanie usunięta.': "This action cannot be undone. The channel's message history will be deleted.",
  'Zaproś do kanału': 'Invite to channel',
  'Przypnij kanał na górę': 'Pin channel to top',
  'Odepnij kanał': 'Unpin channel',
  'Kopiuj link': 'Copy link',
  'Wycisz kanał': 'Mute channel',
  'Wyłącz wyciszenie': 'Unmute channel',
  'Ustawienia powiadomień': 'Notification settings',
  'Powiadomienia kanału': 'Channel notifications',
  'Wszystkie wiadomości': 'All messages',
  'Nic': 'Nothing',
  'Przenieś do…': 'Move to…',
  'Przenieś przed kanał': 'Move before channel',
  'Na koniec listy': 'To the end of the list',
  'Brak innych kanałów': 'No other channels',
  'Edytuj kanał': 'Edit channel',
  'Powiel kanał': 'Duplicate channel',
  'Stwórz kanał tekstowy': 'Create text channel',
  'Zapisz': 'Save',
  'Zmień nazwę kanału. Historia wiadomości pozostanie bez zmian.': 'Change the channel name. Message history will stay unchanged.',
  'Akcje kanału': 'Channel actions',
  'Przypięty': 'Pinned',
  'Wyciszony': 'Muted',
  'Powiadomienia kanału: {level}': 'Channel notifications: {level}',
  'Skopiowano link do kanału.': 'Channel link copied.',
  'Odpięto kanał „{name}”.': 'Channel “{name}” unpinned.',
  'Przypięto kanał „{name}” na górze.': 'Channel “{name}” pinned to top.',
  'Włączono powiadomienia dla kanału „{name}”.': 'Notifications enabled for channel “{name}”.',
  'Wyciszono kanał „{name}”.': 'Channel “{name}” muted.',
  'Nazwa kanału „{name}” została zmieniona.': 'Channel name changed to “{name}”.',
  'Kanał „{name}” został powielony.': 'Channel “{name}” duplicated.',
  'Kanał „{name}” został przeniesiony.': 'Channel “{name}” moved.',
  'Nie udało się przenieść kanału.': 'Could not move the channel.',
  'Nie udało się powielić kanału.': 'Could not duplicate the channel.',

  // Import z Discord
  'Z Discord': 'From Discord',
  'Jednorazowa konfiguracja': 'One-time setup',
  'Utwórz darmową aplikację Discord i skopiuj jej Application ID. Chill użyje jej tylko do sprawdzenia, które serwery sam stworzyłeś.': 'Create a free Discord application and copy its Application ID. Chill uses it only to check which servers you created yourself.',
  'Wejdź na Discord Developer Portal i utwórz nową aplikację.': 'Open Discord Developer Portal and create a new application.',
  'W zakładce OAuth2 dodaj Redirect URI:': 'In the OAuth2 tab, add this Redirect URI:',
  'Włącz Public Client i skopiuj Application ID.': 'Enable Public Client and copy the Application ID.',
  'Kopiuj Redirect URI': 'Copy Redirect URI',
  'Otwórz Discord Developer Portal': 'Open Discord Developer Portal',
  'Client ID aplikacji Discord': 'Discord application Client ID',
  'Zapisz i połącz': 'Save and connect',
  'Konto połączone': 'Account connected',
  'Rozłącz': 'Disconnect',
  'Połącz konto Discord, aby zobaczyć tylko serwery, które sam stworzyłeś. Serwery, do których tylko dołączyłeś, nie będą widoczne.': 'Connect your Discord account to see only the servers you created yourself. Servers you merely joined will not be shown.',
  'Połącz z Discord': 'Connect Discord',
  'Wybierz swój serwer Discord': 'Choose your Discord server',
  'Widzisz tylko serwery, które sam stworzyłeś.': 'Only servers you created yourself are shown.',
  'Link szablonu serwera': 'Server template link',
  'np. https://discord.new/AbCd1234': 'e.g. https://discord.new/AbCd1234',
  'W Discord otwórz Ustawienia serwera → Szablon serwera → Utwórz szablon i skopiuj link. Zaimportujemy kanały tekstowe i głosowe.': 'In Discord, open Server Settings → Server Template → Create Template and copy the link. We will import text and voice channels.',
  'Podejrzyj kanały': 'Preview channels',
  'Importuj serwer': 'Import server',
  'Zmień Client ID': 'Change Client ID',
  'Brak własnych serwerów': 'No servers you own',
  'Nie masz serwerów, których jesteś właścicielem. Import dostępny jest tylko dla własnych serwerów.': 'You have no servers that you own. Import is available only for your own servers.',
  'Czekam na potwierdzenie w przeglądarce…': 'Waiting for confirmation in your browser…',
  'Sprawdzam szablon…': 'Checking the template…',
  'Importuję serwer…': 'Importing the server…',
  'Zapisuję konfigurację…': 'Saving configuration…',
  'Kanały do importu: {count}': 'Channels to import: {count}',
  'Szablon: {name}': 'Template: {name}',
  'Ten szablon nie zawiera obsługiwanych kanałów — utworzymy kanał ogólny.': 'This template has no supported channels — we will create a general channel.',
  'Szablon ma {total} kanałów — zaimportujemy pierwsze {count}.': 'The template has {total} channels — we will import the first {count}.',
  'Pominięto nieobsługiwane kanały: {count}.': 'Unsupported channels skipped: {count}.',
  'Zaimportowano „{name}” (kanały: {count})': 'Imported “{name}” (channels: {count})',
  'Nie udało się połączyć z Discord.': 'Could not connect to Discord.',
  'Najpierw podaj Client ID aplikacji Discord.': 'First enter the Discord application Client ID.',
  'Client ID musi składać się z 15–21 cyfr. Skopiuj Application ID z Discord Developer Portal.': 'The Client ID must contain 15–21 digits. Copy the Application ID from Discord Developer Portal.',
  'Połączanie z Discord już trwa.': 'A Discord connection is already in progress.',
  'Połącz się z Discord, aby zaimportować serwer.': 'Connect Discord to import a server.',
  'Sesja Discord wygasła. Połącz się ponownie.': 'Your Discord session expired. Connect again.',
  'Brak połączenia z Discord. Sprawdź internet i spróbuj ponownie.': 'No connection to Discord. Check your internet and try again.',
  'Discord chwilowo ogranicza liczbę żądań. Spróbuj za chwilę.': 'Discord is temporarily rate limiting requests. Try again in a moment.',
  'Discord nie udostępnił wymaganych danych. Połącz ponownie i zaakceptuj dostęp do serwerów.': 'Discord did not share the required data. Connect again and allow access to your servers.',
  'Nie jesteś właścicielem tego serwera Discord. Import dostępny jest tylko dla serwerów, które sam stworzyłeś.': 'You are not the owner of this Discord server. Import is available only for servers you created yourself.',
  'Nie znaleziono wybranego serwera Discord na Twoim koncie.': 'The selected Discord server was not found on your account.',
  'Wklej poprawny link szablonu, np. https://discord.new/AbCd1234.': 'Paste a valid template link, e.g. https://discord.new/AbCd1234.',
  'Nie udało się pobrać szablonu Discord. Sprawdź link i spróbuj ponownie.': 'Could not download the Discord template. Check the link and try again.',
  'Ten szablon należy do innego serwera Discord. Wybierz szablon swojego serwera.': 'This template belongs to a different Discord server. Choose a template from your own server.',
  'Serwer „{name}” został już zaimportowany.': 'The server “{name}” has already been imported.',
  'Nie udało się zapisać zaimportowanego serwera na dysku.': 'Could not save the imported server to disk.',
  'Port 47831 jest zajęty. Zamknij program, który go używa, i spróbuj ponownie.': 'Port 47831 is in use. Close the program using it and try again.',
  'Nie otrzymano odpowiedzi od Discord. Spróbuj ponownie.': 'No response from Discord. Try again.',
  'Połączanie z Discord zostało anulowane.': 'The Discord connection was cancelled.',
  'Anulowano logowanie w Discord.': 'Discord login was cancelled.',
  'Discord odrzucił logowanie. Spróbuj ponownie.': 'Discord rejected the login. Try again.',
  'Nie udało się uruchomić lokalnego połączenia z Discord. Spróbuj ponownie.': 'Could not start the local Discord connection. Try again.',
  'Nie udało się otworzyć przeglądarki. Spróbuj ponownie.': 'Could not open the browser. Try again.',
  'Sesja wygasła. Zaloguj się ponownie.': 'Your session expired. Log in again.',
  'Nie udało się zapisać konfiguracji Discord na dysku.': 'Could not save the Discord configuration to disk.',
  'Nie udało się zweryfikować konta Discord. Spróbuj ponownie.': 'Could not verify the Discord account. Try again.',
  'Discord zwrócił nieprawidłową listę serwerów. Spróbuj ponownie.': 'Discord returned an invalid server list. Try again.',
  'Discord nie zwrócił tokenu dostępu. Spróbuj ponownie.': 'Discord did not return an access token. Try again.',
  'Discord nie zwrócił kodu autoryzacji. Spróbuj ponownie.': 'Discord did not return an authorization code. Try again.',
  'Import z Discord jest niedostępny w tej wersji.': 'Discord import is unavailable in this version.',
  'Wybierz serwer Discord z listy.': 'Choose a Discord server from the list.',
  'Nie udało się pobrać danych z Discord. Spróbuj ponownie.': 'Could not fetch data from Discord. Try again.',

  // Komunikaty dynamiczne
  'Wylogowano': 'Logged out',
  'Właściciel serwera': 'Server owner',
  '(Ty)': '(You)',
  'Gra w {game}': 'Playing {game}',
  'Teraz grasz': 'Playing now',
  'Gra w {game} • {status}': 'Playing {game} • {status}',
  'Brak kanałów': 'No channels',
  'Łączę z serwerem…': 'Connecting to the server…',
  'Serwer offline': 'Server offline',
  'Spróbuj ponownie': 'Try again',
  'Ten serwer nie ma jeszcze żadnego kanału.': 'This server does not have any channels yet.',
  'Utwórz kanał': 'Create channel',
  'Brak wyników': 'No results',
  'Nie znaleziono wiadomości pasujących do „{query}”.': 'No messages matching “{query}” were found.',
  'To początek tego kanału. Napisz pierwszą wiadomość!': 'This is the beginning of this channel. Write the first message!',
  'To początek Waszej prywatnej rozmowy': 'This is the beginning of your private conversation',
  ' przez serwer {name}': ' via the server {name}',
  'Rozmowa': 'Conversation',
  'Zacznij od serwera': 'Start with a server',
  'Nie masz jeszcze żadnego serwera. Utwórz własny albo dołącz kodem zaproszenia od znajomego.': "You don't have a server yet. Create your own or join with an invite code from a friend.",
  'Wybierz rozmowę z listy po lewej. Pisz do kont na tym komputerze i do znajomych dodanych z serwerów.': 'Choose a conversation from the list on the left. Message accounts on this computer and friends added from servers.',
  'Wybierz rozmowę lub serwer': 'Choose a conversation or server',
  'Utwórz lub dołącz do serwera': 'Create or join a server',
  'Wybierz rozmowę lub kanał, aby napisać.': 'Choose a conversation or channel to write.',
  'Łączę z serwerem — spróbuj za chwilę.': 'Connecting to the server — try again in a moment.',
  'Ta rozmowa nie jest już dostępna.': 'This conversation is no longer available.',
  'Serwer jest offline — spróbuj, gdy połączenie wróci.': 'The server is offline — try again when the connection returns.',
  'Serwer jest offline — wiadomości wrócą po połączeniu': 'The server is offline — messages will return when connected',
  'Napisz do {name}…': 'Message {name}…',
  'Napisz na #{name}…': 'Message #{name}…',
  'Wybierz kanał, aby napisać…': 'Choose a channel to write…',
  '{name} pisze': '{name} is typing',
  '{names} piszą': '{names} are typing',
  ' i {count} inne': ' and {count} more',
  '↑ ↓ wybierz • Enter wstaw • Esc zamknij': '↑ ↓ navigate • Enter insert • Esc close',
  'Wzmianka od {name}': 'Mention from {name}',
  'Wiadomość prywatna': 'Direct message',
  'wiadomość prywatna': 'direct message',
  'Wystąpił błąd serwera.': 'A server error occurred.',
  'Nazwa kanału może mieć maksymalnie 32 znaki.': 'The channel name can be at most 32 characters.',
  'Profil: {name}': 'Profile: {name}',
  'Serwer': 'Server',
  'Serwer:': 'Server:',
  'serwerem': 'the server',
  'rozmówcy': 'them',
  'Rozmowa prywatna': 'Direct message',
  'Rozmowa niedostępna': 'Conversation unavailable',
  'Użytkownik': 'User',
  'Gość': 'Guest',
  'Znajomy': 'Friend',
  'Nic nie znaleziono': 'Nothing found',
  'Brak znajomych — kliknij osobę na liście członków': 'No friends — click someone in the member list',
  'Brak członków': 'No members',
  'Dodaj tę osobę do znajomych, aby zacząć prywatną rozmowę.': 'Add this person as a friend to start a private conversation.',
  'Ta osoba wysłała Ci zaproszenie do znajomych.': 'This person sent you a friend request.',
  'Połącz z serwerem, aby zobaczyć załącznik.': 'Connect to the server to view the attachment.',
  'Nie wysłano pliku — zmieniono rozmowę.': 'File not sent — the conversation changed.',
  'Nie można wysłać wiadomości.': 'Could not send the message.',
  'Masz tę osobę w znajomych.': 'This person is in your friends list.',
  'Konto lokalne — możesz napisać od razu.': 'Local account — you can message right away.',
  'Ta osoba jest teraz online na serwerze.': 'This person is online on the server.',
  'Ta osoba jest teraz offline.': 'This person is offline.',
  'Brak opisu profilu.': 'No profile description.',
  'Serwer: {name}': 'Server: {name}',
  'połączenie offline': 'connection offline',
  'Dodano {name} do znajomych': 'Added {name} as a friend',
  'Nie udało się dodać do znajomych.': 'Could not add this person as a friend.',
  'Kanał głosowy': 'Voice channel',
  'Ten kanał jest przeznaczony na rozmowy głosowe.': 'This channel is for voice conversations.',
  'Kanały głosowe nie obsługują wiadomości tekstowych.': 'Voice channels do not support text messages.',
  'Tylko właściciel serwera może tworzyć kanały.': 'Only the server owner can create channels.',
  'Tylko właściciel serwera może usuwać kanały.': 'Only the server owner can delete channels.',
  'Tylko właściciel serwera może zarządzać kanałami.': 'Only the server owner can manage channels.',
  'Podaj poprawną nazwę kanału.': 'Enter a valid channel name.',
  'Kanał o tej nazwie już istnieje.': 'A channel with this name already exists.',
  'Nie znaleziono kanału.': 'Channel not found.',
  'Kanał „{name}” został usunięty.': 'Channel “{name}” was deleted.',
  'Kanał „{name}” utworzony.': 'Channel “{name}” created.',
  'Nie udało się utworzyć kanału.': 'Could not create the channel.',
  'Nie udało się usunąć kanału.': 'Could not delete the channel.',
  'Kanał „{name}” zostanie usunięty wraz z historią wiadomości.': 'Channel “{name}” will be deleted together with its message history.',
  'Skopiowano': 'Copied',
  'Nie udało się skopiować linku.': 'Could not copy the link.',
  'Kliknij ponownie, aby usunąć': 'Click again to delete',
  'Kliknij ponownie, aby opuścić': 'Click again to leave',
  'Usuń serwer': 'Delete server',
  'Opuść serwer': 'Leave server',
  'Serwer został usunięty': 'Server deleted',
  'Opuszczono serwer': 'Left the server',
  'Nie udało się opuścić serwera.': 'Could not leave the server.',
  'Serwer został usunięty przez właściciela.': 'The server was deleted by its owner.',
  'Serwer „{name}” utworzony': 'Server “{name}” created',
  'Dołączono do „{name}”': 'Joined “{name}”',
  'Już należysz do tego serwera': 'You are already a member of this server',
  'Nazwa serwera musi mieć 2–40 znaków.': 'The server name must be 2–40 characters.',
  'Nie udało się utworzyć serwera.': 'Could not create the server.',
  'Wystąpił błąd podczas tworzenia serwera.': 'An error occurred while creating the server.',
  'Wklej pełny link, np. chill://192.168.1.5:47830/AB12CD.': 'Paste the full link, e.g. chill://192.168.1.5:47830/AB12CD.',
  'Wklej link zaproszenia, np. chill://192.168.1.5:47830/AB12CD lub https://chill.example.com/?invite=AB12CD.': 'Paste an invite link, e.g. chill://192.168.1.5:47830/AB12CD or https://chill.example.com/?invite=AB12CD.',
  'Nie udało się dołączyć do serwera z linku.': 'Could not join the server from the link.',
  'Przygotowuję link internetowy… Pierwsze uruchomienie może potrwać chwilę.': 'Preparing an internet link… The first run may take a moment.',
  'Link pochodzi od właściciela serwera.': 'The link comes from the server owner.',
  'Link działa przez internet. Możesz wysłać go każdemu.': 'The link works over the internet. You can send it to anyone.',
  'Nie udało się włączyć dostępu z internetu. Link działa tylko w sieci lokalnej.': 'Could not enable internet access. The link works only on the local network.',
  'Link działa przez internet.': 'The link works over the internet.',
  'Link działa tylko w sieci lokalnej.': 'The link works only on the local network.',
  'Spróbuj ponownie': 'Try again',
  'Przygotowuję link…': 'Preparing the link…',
  'Dostęp z internetu niedostępny — skopiowano link lokalny.': 'Internet access is unavailable — copied the local link.',
  'Zbyt wiele prób. Spróbuj ponownie za chwilę.': 'Too many attempts. Try again in a moment.',
  'Nie udało się dołączyć do serwera.': 'Could not join the server.',
  'Nie udało się zapisać serwera.': 'Could not save the server.',
  'Łączę…': 'Connecting…',
  'Nie udało się wczytać serwerów.': 'Could not load servers.',
  'Nieprawidłowy adres serwera.': 'Invalid server address.',
  'Serwer nie odpowiada. Sprawdź adres i spróbuj ponownie.': 'The server is not responding. Check the address and try again.',
  'Nie można połączyć się z serwerem.': 'Cannot connect to the server.',
  'Serwer przerwał połączenie.': 'The server closed the connection.',
  'Nie można połączyć się z {name}.': 'Cannot connect to {name}.',
  'Nie znaleziono serwera o tym kodzie zaproszenia.': 'No server was found with this invite code.',
  'Nieprawidłowy kod zaproszenia.': 'Invalid invite code.',
  'Ta osoba nie jest już członkiem serwera.': 'This person is no longer a member of the server.',
  'Nie wskazano serwera.': 'No server specified.',
  'Nie należysz do tego serwera.': 'You are not a member of this server.',
  'Nie znaleziono serwera.': 'Server not found.',
  'Nieprawidłowy identyfikator serwera.': 'Invalid server identifier.',
  'Serwer przesłał nieprawidłowy identyfikator.': 'The server sent an invalid identifier.',
  'Kanał został usunięty przez właściciela.': 'The channel was deleted by the owner.',

  // Profile / ustawienia — komunikaty
  'Nazwa musi mieć 2–32 znaki.': 'The name must be 2–32 characters.',
  'Opis może mieć maksymalnie 160 znaków.': 'The description can be at most 160 characters.',
  'Nie udało się zapisać profilu.': 'Could not save the profile.',
  'Zapisano': 'Saved',
  'Profil zaktualizowany': 'Profile updated',
  'Wystąpił błąd podczas zapisywania.': 'An error occurred while saving.',
  'Wpisz obecne i nowe hasło.': 'Enter your current and new password.',
  'Nowe hasło musi mieć co najmniej 8 znaków.': 'The new password must be at least 8 characters.',
  'Nie udało się zmienić hasła.': 'Could not change the password.',
  'Hasło zmienione': 'Password changed',
  'Hasło zostało zmienione': 'Password changed',
  'Wystąpił błąd.': 'Something went wrong.',
  'Chill będzie uruchamiany z Windows': 'Chill will launch with Windows',
  'Autostart wyłączony': 'Autostart disabled',
  'Nie udało się zmienić autostartu': 'Could not change autostart',
  'Sprawdzam…': 'Checking…',
  'Dostępna wersja {version}.': 'Version {version} is available.',
  'Masz najnowszą wersję Chill.': 'You have the latest version of Chill.',
  'Nie udało się sprawdzić aktualizacji.': 'Could not check for updates.',

  // Aktualizacje
  'Aktualizacja pobiera się automatycznie…': 'The update is downloading automatically…',
  'Dostępna jest nowsza wersja Chill.': 'A newer version of Chill is available.',
  'Aktualizacja pobiera się i zainstaluje automatycznie…': 'The update is downloading and will install automatically…',
  'Nie można uruchomić aktualizacji w tej wersji.': 'The update cannot be started in this version.',
  'Pobieranie aktualizacji — {pct}%': 'Downloading update — {pct}%',
  'Uruchamiam instalator — Chill za chwilę się zamknie.': 'Starting the installer — Chill will close in a moment.',
  'Pobrano aktualizację — uruchamiam instalator': 'Update downloaded — starting the installer',
  'Automatyczna aktualizacja nie powiodła się. Pobierz instalator ręcznie.': 'Automatic update failed. Download the installer manually.',
  'Nie udało się pobrać aktualizacji. Spróbuj ponownie.': 'Could not download the update. Try again.',

  // Profil — baner, avatar, odznaki i gry
  'Avatar': 'Avatar',
  'Wgraj avatar': 'Upload avatar',
  'Domyślny avatar': 'Default avatar',
  'Baner profilu': 'Profile banner',
  'Wgraj baner': 'Upload banner',
  'Własny baner': 'Custom banner',
  'Kolor 1': 'Color 1',
  'Kolor 2': 'Color 2',
  'Wzór': 'Pattern',
  'Brak': 'None',
  'Kropki': 'Dots',
  'Siatka': 'Grid',
  'Fale': 'Waves',
  'Gwiazdy': 'Stars',
  'Skos': 'Diagonal',
  'Zastosuj własny baner': 'Apply custom banner',
  'Odznaki': 'Badges',
  'Kolekcja gier': 'Game collection',
  'Dodaj grę': 'Add game',
  'Nazwa gry': 'Game name',
  'Usuń grę': 'Remove game',
  'Wpisz nazwę gry.': 'Enter a game name.',
  'Kolekcja może mieć maksymalnie 12 gier.': 'The collection can contain at most 12 games.',
  'Ta gra jest już w kolekcji.': 'This game is already in the collection.',
  'Możesz wybrać maksymalnie 5 odznak.': 'You can select at most 5 badges.',
  'Nie udało się odczytać obrazu.': 'Could not read the image.',
  'Brak gier w kolekcji.': 'No games in the collection.',
  'Pokaż wszystkie gry': 'Show all games',
  'Clipping {game}': 'Clipping {game}',
  'Obserwuj na Medal': 'Follow on Medal',
  'Obserwujesz na Medal': 'Following on Medal',
  'Obserwujesz {game} na Medal': 'Following {game} on Medal',
  'Przestano obserwować {game}': 'Stopped following {game}',
  'Pobierz Medal': 'Download Medal',
  'Brak wspólnych znajomych i serwerów': 'No mutual friends or servers',
  'Serwer jest offline - spróbuj ponownie po połączeniu.': 'The server is offline - try again once connected.',
  'Ten kanał nie jest kanałem głosowym.': 'This channel is not a voice channel.',
  'Inne': 'Other',
  'Mięta': 'Mint',
  'Ocean': 'Ocean',
  'Zachód': 'Sunset',
  'Neon': 'Neon',
  'Chill': 'Chill',
  'Discord': 'Discord',
  'Minimal': 'Minimal',

  // Menu serwera / ustawienia serwera
  'Menu serwera': 'Server menu',
  'Wzmocnienie serwera': 'Server boost',
  'Zaproś na serwer': 'Invite to server',
  'Tag serwera': 'Server tag',
  'Ustawienia serwera': 'Server settings',
  'Wgląd w serwer': 'Server insights',
  'Utworzenie kanału': 'Create channel',
  'Stwórz kategorię': 'Create category',
  'Stwórz wydarzenie': 'Create event',
  'Katalog aplikacji': 'App directory',
  'Pokaż wszystkie kanały': 'Show all channels',
  'Ustawienia prywatności': 'Privacy settings',
  'Edytuj profil serwerowy': 'Edit server profile',
  'Ukryj wyciszone kanały': 'Hide muted channels',
  'Działania bezpieczeństwa': 'Security actions',
  'Zgłoś atak': 'Report raid',
  'Kopiuj ID serwera': 'Copy server ID',
  'Wkrótce': 'Soon',
  'Ta funkcja pojawi się wkrótce.': 'This feature is coming soon.',
  'Zmień nazwę, ikonę, tag i kolor serwera.': 'Change the server name, icon, tag and color.',
  'Ikona serwera': 'Server icon',
  'np. 🐺': 'e.g. 🐺',
  'Tag serwera (opcjonalnie)': 'Server tag (optional)',
  'np. WOLF': 'e.g. WOLF',
  'Krótki tag widoczny przy nazwie serwera.': 'A short tag shown next to the server name.',
  'Zapisz zmiany': 'Save changes',
  'Ustawienia serwera zostały zapisane.': 'Server settings saved.',
  'Nie udało się zapisać ustawień serwera.': 'Could not save server settings.',
  'Tylko właściciel serwera może edytować ustawienia serwera.': 'Only the server owner can edit server settings.',
  'Statystyki i aktywność serwera.': 'Server statistics and activity.',
  'Kanały tekstowe': 'Text channels',
  'Kanały głosowe': 'Voice channels',
  'Wiadomości': 'Messages',
  'Kod zaproszenia': 'Invite code',
  'Utworzono serwer {date}': 'Server created on {date}',
  'Zmień, jak widzą Cię inni na tym serwerze.': 'Change how others see you on this server.',
  'Nazwa na serwerze': 'Server nickname',
  'Profil serwerowy zaktualizowany': 'Server profile updated.',
  'Nazwa na serwerze musi mieć 2–32 znaki.': 'The server nickname must be 2–32 characters.',
  'Opuścić serwer?': 'Leave server?',
  'Czy na pewno chcesz opuścić serwer „{name}”? Będziesz mógł dołączyć ponownie, jeśli otrzymasz nowe zaproszenie.': 'Are you sure you want to leave “{name}”? You can rejoin if you receive a new invite.',
  'Skopiowano ID serwera.': 'Server ID copied.',
  'Nie udało się skopiować ID serwera.': 'Could not copy the server ID.',
  'Tag serwera: {tag}': 'Server tag: {tag}',
  'Ten serwer nie ma jeszcze tagu.': 'This server does not have a tag yet.',
  'Ustawienia prywatności serwera pojawią się wkrótce.': 'Server privacy settings are coming soon.',
  'Wszystkie kanały są widoczne.': 'All channels are visible.',
  'Wszystkie kanały są ukryte.': 'All channels are hidden.',
  'Wyciszone kanały są ukryte.': 'Muted channels are hidden.',

  // Mini Gierki
  'Mini Gierki': 'Mini Games',
  'Gry wbudowane': 'Built-in games',
  'Krótkie gry w Chillu. Pobierz jednym kliknięciem i zagraj bez wychodzenia z aplikacji.': 'Short games inside Chill. Download in one click and play without leaving the app.',
  'gry w katalogu': 'games in the catalog',
  'zainstalowane': 'installed',
  'Działa lokalnie': 'Runs locally',
  'Każda gra jest oryginalną mini-produkcją Chill. Pobieranie jest lokalne — pliki zostają na tym komputerze.': 'Every game is an original Chill mini-production. Downloads are local — files stay on this computer.',
  'Gotowa do pobrania — działa lokalnie': 'Ready to download — runs locally',
  'Zainstalowana': 'Installed',
  'gotowa do gry': 'ready to play',
  'Pobieranie…': 'Downloading…',
  'Pobierz': 'Download',
  'Graj': 'Play',
  'Pobrano {game}': 'Downloaded {game}',
  'Nie udało się uruchomić gry.': 'Could not start the game.',
  'Pobieraj i graj lokalnie — bez instalowania dużych klientów': 'Download and play locally — no big clients required',
  'Wyjdź': 'Exit',
  'Wróć': 'Back',
  'Pauza': 'Pause',
  'Wznów': 'Resume',
  'Start': 'Start',
  'Zwycięstwo!': 'Victory!',
  'Koniec gry': 'Game over',
  'Wygrana!': 'Victory!',
  'Porażka': 'Defeat',
  'Zagraj ponownie': 'Play again',
  'Eliminacje': 'Eliminations',
  'Żywi': 'Alive',
  'Broń': 'Weapon',
  'Amunicja': 'Ammo',
  'Przeładowanie…': 'Reloading…',
  'Kliknij, aby przejąć mysz': 'Click to capture the mouse',
  'Strzał: LPM / Spacja': 'Shoot: LMB / Space',
  'Runda': 'Round',
  'Czas': 'Time',
  'Dash': 'Dash',
  'Przetrwałeś do końca i wygrałeś Ostatni Krąg. Eliminacje: {kills}.': 'You survived to the end and won Last Circle. Eliminations: {kills}.',
  'Miejsce {placement} z 12 • Eliminacje: {kills}.': 'Placement {placement} of 12 • Eliminations: {kills}.',
  'Pokonałeś bota {player}:{bot}.': 'You defeated the bot {player}:{bot}.',
  'Bot wygrał {bot}:{player}.': 'The bot won {bot}:{player}.',
  'Gra zatrzymana. Wróć, gdy będziesz gotowy.': 'Game paused. Come back when you are ready.',
  'Mini gra': 'Mini game',
  'Grane lokalnie': 'Played locally',
  'ESC — pauza • Mysz — celowanie • WASD — ruch': 'ESC — pause • Mouse — aim • WASD — move',
  'Pobierz grę': 'Download game',
  'Uruchom grę': 'Launch game',
  'Twoja biblioteka': 'Your library',
  'Katalog gier': 'Game catalog',
  'Oryginalne mini gry Chill': 'Original Chill mini games',

  // Daty / statusy
  'Dzisiaj': 'Today',
  'Wczoraj': 'Yesterday',
  'łączenie…': 'connecting…',
  'kanał': 'channel',

  // Ustawienia serwera — profil serwerowy
  'Ikona': 'Icon',
  'Baner': 'Banner',
  'Cechy': 'Traits',
  'Opis': 'Description',
  'Dodaj': 'Add',
  'Dodaj cechę…': 'Add a trait…',
  'Szukaj gry…': 'Search for a game…',
  'Nazwa i tag': 'Name and tag',
  'Profil serwerowy': 'Server profile',
  'Zaangażowanie': 'Engagement',
  'Korzyści ze wzmocnień': 'Boosts',
  'Nastrój': 'Mood',
  'Panel dźwięków': 'Soundboard',
  'Osoby': 'People',
  'Role': 'Roles',
  'Zaproszenia': 'Invites',
  'Dostęp': 'Access',
  'Aplikacje': 'Apps',
  'Integracje': 'Integrations',
  'Moderacja': 'Moderation',
  'Konfiguracja zabezpieczeń': 'Safety setup',
  'Dziennik zdarzeń': 'Audit log',
  'Bany': 'Bans',
  'Przegląd społeczności': 'Community overview',
  'Wprowadzenie': 'Onboarding',
  'Szablon serwera': 'Server template',
  'Tak Twój serwer widzą inni członkowie.': 'This is how other members see your server.',
  'Zmień ikonę serwera': 'Change server icon',
  'Usuń ikonę': 'Remove icon',
  'Wybierz emoji lub znak, który najlepiej opisze Twój serwer.': 'Choose an emoji or character that best describes your server.',
  'Wybierz gradient widoczny na karcie podglądu serwera.': 'Choose the gradient shown on the server preview card.',
  'Dodaj maksymalnie 5 cech, aby przedstawić obszar zainteresowania i charakterystykę swojego serwera.': "Add up to 5 traits to show your server's interests and character.",
  'Jak powstał Twój serwer? Dlaczego warto do niego dołączyć?': 'How did your server start? Why should people join?',
  'Odpowiedz innym o tym serwerze.': 'Tell others about this server.',
  'W jakie gry grają członkowie Twojego serwera?': 'Which games do your server members play?',
  'Te informacje widzą wszyscy członkowie serwera.': 'Everyone on the server can see this information.',
  'Grafit': 'Graphite',
  'Róż': 'Rose',
  'Czerwień': 'Crimson',
  'Pomarańcz': 'Orange',
  'Złoto': 'Gold',
  'Fiolet': 'Violet',
  'Błękit': 'Azure',
  'Turkus': 'Aqua',
  'Limonka': 'Lime',
  'Stal': 'Slate',
  '{n} online': '{n} online',
  '{n} członków': '{n} members',
  'Zał. {date}': 'Created {date}',
  'Usuń cechę {name}': 'Remove trait {name}',
  'Ustaw ikonę {icon}': 'Set icon {icon}',
  'Ta cecha jest już dodana.': 'This trait is already added.',
  'Możesz dodać maksymalnie 5 cech.': 'You can add up to 5 traits.',
  'Usuń grę {name}': 'Remove game {name}',
  'Dodaj „{name}”': 'Add “{name}”',
  'Brak pasujących gier.': 'No matching games.',
  'Możesz dodać maksymalnie 5 gier.': 'You can add up to 5 games.',
  'Ta gra jest już dodana.': 'This game is already added.',
  'Usunąć serwer?': 'Delete server?',
  'Czy na pewno chcesz usunąć serwer „{name}”? Tej operacji nie można cofnąć.': 'Are you sure you want to delete the server “{name}”? This action cannot be undone.',
};

function t(text, vars = null) {
  let out = prefs.lang === 'en' ? (I18N_EN[text] ?? text) : text;
  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    }
  }
  return out;
}

function translateError(message) {
  const text = String(message ?? '');
  if (prefs.lang === 'en') {
    const attempts = text.match(/^Zbyt wiele prób\. Spróbuj ponownie za (\d+) s\.$/);
    if (attempts) return `Too many attempts. Try again in ${attempts[1]} s.`;
  }
  return t(text);
}

function translateStaticDom() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const value = el.dataset.i18n;
    if (value) el.textContent = t(value);
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const value = el.dataset.i18nHtml;
    if (value) el.innerHTML = t(value);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const value = el.dataset.i18nPlaceholder;
    if (value) el.placeholder = t(value);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const value = el.dataset.i18nTitle;
    if (value) el.title = t(value);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    const value = el.dataset.i18nAriaLabel;
    if (value) el.setAttribute('aria-label', t(value));
  });
}

function updateAuthCopy() {
  const title = $('authTitle');
  const subtitle = $('authSubtitle');
  if (!title || !subtitle) return;
  if (authMode === 'register') {
    title.textContent = t('Zacznij w Chill');
    subtitle.textContent = t('Utwórz konto — nazwa użytkownika i hasło wystarczą.');
  } else {
    title.textContent = t('Witaj ponownie');
    subtitle.textContent = t('Zaloguj się nazwą użytkownika lub e-mailem.');
  }
  const foot = $('authFoot');
  if (foot) {
    foot.textContent = CHILL.web
      ? t('Konto, serwery i historia rozmów są zapisane na serwerze Chill. Hasło jest chronione skrótem scrypt.')
      : t('Konto i historia rozmów są zapisane tylko na tym komputerze. Hasło jest szyfrowane lokalnie (scrypt).');
  }
}

function refreshPasswordToggles() {
  for (const [buttonId, inputId] of [['toggleLoginPassword', 'loginPassword'], ['toggleRegPassword', 'regPassword']]) {
    const btn = $(buttonId);
    const input = $(inputId);
    if (!btn || !input) continue;
    const show = input.type === 'password';
    btn.textContent = t(show ? 'Pokaż' : 'Ukryj');
    btn.setAttribute('aria-label', t(show ? 'Pokaż hasło' : 'Ukryj hasło'));
  }
}

function applyLanguage(lang, persist = false) {
  const next = lang === 'en' ? 'en' : 'pl';
  prefs.lang = next;
  document.documentElement.lang = next;
  if (persist) {
    try { localStorage.setItem('chill.lang', next); } catch { /* ignore */ }
  }
  CHILL.app?.setLanguage?.(next);
  document.querySelectorAll('[data-language]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.language === next);
  });
  translateStaticDom();
  updateAuthCopy();
  refreshPasswordToggles();
  if (micTest) refreshMicTestUi();
  if (!currentUser) return;
  renderIdentity();
  if (audioDevicesLoaded) renderAudioDeviceLists();
  renderSidebar();
  renderHeader();
  renderMessages(false);
  renderMembers();
  updateComposer();
  if ($('gifOverlay') && !$('gifOverlay').hidden) {
    renderGifCategories();
    renderGifs();
  }
  if ($('stickerOverlay') && !$('stickerOverlay').hidden) {
    renderStickerCategories();
    renderStickers();
  }
  renderTyping();
  updateBadges();
  if (!$('userProfileOverlay').hidden) renderUserProfile();
  if (!$('channelDeleteOverlay').hidden && deleteChannelId) updateChannelDeleteCopy();
  const updateText = $('updateText');
  if (updateText && currentUpdateInfo) {
    if (downloadingUpdate) updateText.textContent = t('Pobieranie aktualizacji — {pct}%', { pct: 0 });
    else if (CHILL.isPackaged) updateText.textContent = t('Aktualizacja pobiera się i zainstaluje automatycznie…');
    else updateText.textContent = t('Dostępna jest nowsza wersja Chill.');
  }
  if (!$('settingsOverlay').hidden) fillProfileForm();
  if ($('serverSettingsOverlay') && !$('serverSettingsOverlay').hidden) {
    $('serverSettingsIconChoices').textContent = '';
    $('serverSettingsIconPicker').hidden = true;
    renderServerSettingsTraits();
    renderServerSettingsGames();
    updateServerSettingsPreview();
  }
}


// ---------- Pomocnicze ----------
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const initial = (name) => String(name || '?').trim().charAt(0).toUpperCase() || '?';
const safeColor = (value, fallback = 'var(--accent)') => (/^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback);
const statusLabel = (s) => t({ online: 'Online', away: 'Zaraz wracam', dnd: 'Nie przeszkadzać', invisible: 'Niewidoczny', offline: 'Offline' }[s] || 'Online');
const formatTime = (at) => new Date(at || Date.now()).toLocaleTimeString(prefs.lang === 'en' ? 'en-US' : 'pl-PL', { hour: '2-digit', minute: '2-digit' });
const dayKey = (at) => new Date(at || Date.now()).toDateString();
function dayLabel(at) {
  const d = new Date(at || Date.now());
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return t('Dzisiaj');
  if (d.toDateString() === yesterday.toDateString()) return t('Wczoraj');
  return d.toLocaleDateString(prefs.lang === 'en' ? 'en-US' : 'pl-PL', { day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
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
  if (APPEARANCE) Object.assign(prefs, APPEARANCE.normalizeAppearance(prefs));
  else if (!['system', 'black', 'white', 'gradient', 'discord'].includes(prefs.theme)) prefs.theme = 'system';
  if (prefs.lang !== 'en') prefs.lang = 'pl';
  prefs.compact = Boolean(prefs.compact);
  prefs.showAllChannels = prefs.showAllChannels !== false;
  prefs.hideMutedChannels = prefs.hideMutedChannels === true;
  prefs.micMuted = Boolean(prefs.micMuted);
  prefs.deafened = Boolean(prefs.deafened);
  prefs.audioInput = typeof prefs.audioInput === 'string' ? prefs.audioInput : '';
  prefs.audioOutput = typeof prefs.audioOutput === 'string' ? prefs.audioOutput : '';
  const volume = Number(prefs.outputVolume);
  prefs.outputVolume = Number.isFinite(volume) ? Math.max(0, Math.min(100, Math.round(volume))) : 100;
  prefs.noiseSuppression = prefs.noiseSuppression !== false;
  prefs.autoGainControl = prefs.autoGainControl !== false;
  prefs.echoCancellation = prefs.echoCancellation === true;
}
function savePrefs() {
  try { localStorage.setItem(prefsKey(), JSON.stringify(prefs)); } catch { /* ignore */ }
  localStorage.setItem('chill.theme', prefs.theme);
  localStorage.setItem('chill.accent', prefs.accent);
  localStorage.setItem('chill.lang', prefs.lang);
}

function channelPrefsKey() { return `chill.channelPrefs.${myId || 'guest'}`; }

function loadChannelPrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem(channelPrefsKey()) || '{}');
    channelPrefs = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  } catch {
    channelPrefs = {};
  }
}

function saveChannelPrefs() {
  try { localStorage.setItem(channelPrefsKey(), JSON.stringify(channelPrefs)); } catch { /* ignore */ }
}

function channelSettings(serverId, channelId) {
  const raw = channelPrefs?.[serverId]?.[channelId];
  return {
    pinned: raw?.pinned === true,
    muted: raw?.muted === true,
    notify: ['all', 'mentions', 'none'].includes(raw?.notify) ? raw.notify : 'all',
  };
}

function setChannelSettings(serverId, channelId, patch) {
  if (!serverId || !channelId) return { pinned: false, muted: false, notify: 'all' };
  if (!channelPrefs[serverId] || typeof channelPrefs[serverId] !== 'object') channelPrefs[serverId] = {};
  const next = { ...channelSettings(serverId, channelId), ...patch };
  if (!next.pinned && !next.muted && next.notify === 'all') delete channelPrefs[serverId][channelId];
  else channelPrefs[serverId][channelId] = next;
  saveChannelPrefs();
  return channelSettings(serverId, channelId);
}

const themeMedia = window.matchMedia('(prefers-color-scheme: light)');

function resolveTheme(theme) {
  if (theme === 'system') return themeMedia.matches ? 'white' : 'black';
  if (theme === 'white') return 'white';
  if (theme === 'black') return 'black';
  if (theme === 'discord') return 'discord';
  return 'gradient';
}

function applyTheme(theme) {
  const themes = APPEARANCE?.THEMES || ['system', 'black', 'white', 'gradient', 'discord'];
  let mode = themes.includes(theme) ? theme : 'system';
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
  const value = APPEARANCE ? APPEARANCE.normalizeColor(color) : (/^#[0-9a-f]{6}$/i.test(color || '') ? color : '#3ee0a3');
  const ink = APPEARANCE ? APPEARANCE.readableInk(value) : '#05271c';
  const second = `color-mix(in srgb, ${value} 58%, #9fe8ff)`;
  for (const root of [document.documentElement, document.body]) {
    if (!root) continue;
    root.style.setProperty('--accent', value);
    root.style.setProperty('--accent-2', second);
    root.style.setProperty('--accent-ink', ink);
  }
  prefs.accent = value;
  document.querySelectorAll('[data-accent]').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.accent.toLowerCase() === value.toLowerCase());
  });
  const custom = $('customAccent');
  if (custom) custom.value = value;
  const customValue = $('customAccentValue');
  if (customValue) customValue.textContent = value.toUpperCase();
  const wrap = $('customAccentWrap');
  if (wrap) {
    const isPreset = [...document.querySelectorAll('[data-accent]')]
      .some((btn) => btn.dataset.accent.toLowerCase() === value.toLowerCase());
    wrap.classList.toggle('selected', !isPreset);
  }
}

function applyUiScale(value) {
  const factor = APPEARANCE ? APPEARANCE.normalizeUiScale(value) : 1;
  prefs.uiScale = factor;
  if (CHILL.app?.setUiScale) CHILL.app.setUiScale(factor);
  const range = $('uiScaleRange');
  if (range) range.value = String(Math.round(factor * 100));
  const label = $('uiScaleValue');
  if (label) label.textContent = `${Math.round(factor * 100)}%`;
}

function applyAppearance() {
  if (!APPEARANCE) return;
  Object.assign(prefs, APPEARANCE.normalizeAppearance(prefs));
  document.body.dataset.shape = prefs.shape;
  document.body.dataset.background = prefs.background;
  document.body.dataset.msgStyle = prefs.messageStyle;
  document.body.dataset.fontScale = prefs.fontScale;
  document.body.dataset.motion = prefs.reduceMotion ? 'reduced' : 'full';
  document.body.dataset.contrast = prefs.highContrast ? 'high' : 'normal';
  applyAccent(prefs.accent);
  applyUiScale(prefs.uiScale);
  syncAppearanceControls();
}

function syncAppearanceControls() {
  document.querySelectorAll('[data-shape-choice]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.shapeChoice === prefs.shape);
  });
  document.querySelectorAll('[data-background-choice]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.backgroundChoice === prefs.background);
  });
  document.querySelectorAll('[data-message-style]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.messageStyle === prefs.messageStyle);
  });
  document.querySelectorAll('[data-font-scale]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.fontScale === prefs.fontScale);
  });
  const preset = APPEARANCE ? APPEARANCE.matchPreset(prefs) : 'custom';
  document.querySelectorAll('[data-appearance-preset]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.appearancePreset === preset);
  });
  const reduceMotion = $('reduceMotionToggle');
  if (reduceMotion) reduceMotion.checked = Boolean(prefs.reduceMotion);
  const highContrast = $('highContrastToggle');
  if (highContrast) highContrast.checked = Boolean(prefs.highContrast);
}

function syncVoiceControls() {
  const volume = $('outputVolumeRange');
  if (volume) volume.value = String(prefs.outputVolume);
  const volumeValue = $('outputVolumeValue');
  if (volumeValue) volumeValue.textContent = `${prefs.outputVolume}%`;
  const noise = $('noiseSuppressionToggle');
  if (noise) noise.checked = Boolean(prefs.noiseSuppression);
  const gain = $('autoGainToggle');
  if (gain) gain.checked = Boolean(prefs.autoGainControl);
  const echo = $('echoCancelToggle');
  if (echo) echo.checked = Boolean(prefs.echoCancellation);
}

function applyAppearancePreset(id) {
  const preset = APPEARANCE?.preset(id);
  if (!preset) return;
  Object.assign(prefs, preset);
  applyTheme(prefs.theme);
  applyAppearance();
  savePrefs();
}

function applyVoiceVolume() {
  const value = Number(prefs.outputVolume);
  const volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value / 100)) : 1;
  if (voiceAudio) voiceAudio.volume = volume;
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
  const target = String(color || '').toLowerCase();
  container.querySelectorAll('button').forEach((btn) => {
    const value = btn.dataset.color || btn.dataset.regColor || btn.dataset.serverColor || btn.dataset.accent || '';
    btn.classList.toggle('selected', Boolean(value) && value.toLowerCase() === target);
  });
}

// ---------- Start ----------
document.addEventListener('DOMContentLoaded', () => {
  const savedLang = localStorage.getItem('chill.lang');
  if (savedLang === 'en' || savedLang === 'pl') prefs.lang = savedLang;
  applyTheme(localStorage.getItem('chill.theme') || 'system');
  applyAccent(localStorage.getItem('chill.accent') || '#3ee0a3');
  applyLanguage(prefs.lang);
  if (typeof themeMedia.addEventListener === 'function') themeMedia.addEventListener('change', syncSystemTheme);
  bindAuth();
  bindChat();
  bindServers();
  bindEmoji();
  bindSticker();
  bindGif();
  bindVoice();
  bindSettings();
  bindAudioControls();
  bindLiveVoice();
  bindUserProfile();
  bindShortcuts();
  bindMiniGames();
  captureInviteFromLocation();
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
    btn.textContent = t(show ? 'Ukryj' : 'Pokaż');
    btn.setAttribute('aria-label', t(show ? 'Ukryj hasło' : 'Pokaż hasło'));
    input.focus();
  });
}

function switchAuthTab(mode) {
  const login = mode === 'login';
  authMode = login ? 'login' : 'register';
  $('tabLogin').classList.toggle('active', login);
  $('tabRegister').classList.toggle('active', !login);
  $('tabLogin').setAttribute('aria-selected', String(login));
  $('tabRegister').setAttribute('aria-selected', String(!login));
  $('loginForm').style.display = login ? 'grid' : 'none';
  $('registerForm').style.display = login ? 'none' : 'grid';
  updateAuthCopy();
  $('loginError').textContent = '';
  $('registerError').textContent = '';
  setTimeout(() => (login ? $('loginIdentifier') : $('regEmail')).focus(), 40);
}

function showAuth(mode = 'login') {
  $('loginScreen').style.display = 'grid';
  $('chatApp').style.display = 'none';
  $('bootSplash').hidden = true;
  if (CHILL.app?.setUiScale) CHILL.app.setUiScale(1);
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
    errorEl.textContent = t('Podaj login i hasło.');
    return;
  }

  setAuthBusy('loginSubmit', true);
  try {
    const result = await CHILL.auth.login({ identifier, password, remember: $('rememberMe').checked });
    if (!result || !result.ok) {
      errorEl.textContent = result?.error ? translateError(result.error) : t('Nie udało się zalogować.');
      return;
    }
    $('loginPassword').value = '';
    enterApp(result.user);
  } catch {
    errorEl.textContent = t('Wystąpił błąd. Spróbuj ponownie.');
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
    errorEl.textContent = t('Uzupełnij nazwę użytkownika i hasło.');
    return;
  }
  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) {
    errorEl.textContent = t('Podaj poprawny adres e-mail albo zostaw pole puste.');
    return;
  }
  if (!/^[a-zA-Z0-9_.]{3,20}$/.test(payload.username)) {
    errorEl.textContent = t('Nazwa użytkownika: 3–20 znaków (litery, cyfry, _ i .).');
    return;
  }
  if (payload.password.length < 8) {
    errorEl.textContent = t('Hasło musi mieć co najmniej 8 znaków.');
    return;
  }

  setAuthBusy('registerSubmit', true);
  try {
    const result = await CHILL.auth.register(payload);
    if (!result || !result.ok) {
      errorEl.textContent = result?.error ? translateError(result.error) : t('Nie udało się utworzyć konta.');
      return;
    }
    $('regPassword').value = '';
    enterApp(result.user);
  } catch {
    errorEl.textContent = t('Wystąpił błąd. Spróbuj ponownie.');
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
  label.textContent = t(data.text);
}

function enterApp(user) {
  resetVoiceSession();
  closeMiniGame();
  currentUser = user;
  myId = user.id;
  myName = user.displayName || user.username;
  myColor = user.color || '#3ee0a3';
  myAbout = user.about || '';
  myProfileHandle = user.handle || handleForProfile(user);
  myAvatar = safeProfileAvatar(user.avatar);
  myBanner = safeProfileBanner(user.banner);
  myBadges = safeBadges(user.badges);
  myGames = Array.isArray(user.games) ? user.games : [];
  playing = null;
  playingIcon = '';
  playingPlatform = '';
  playingSince = null;
  localVoiceKey = '';
  current = { kind: 'home' };
  servers = [];
  activeServerId = null;
  serverStates.clear();
  allUsers = [];
  friends = [];
  profileTarget = null;
  history.clear();
  unread.clear();
  typingUsers.clear();
  searchQuery = '';

  loadPrefs();
  loadChannelPrefs();
  loadMiniGamesInstalled();
  applyTheme(prefs.theme);
  applyAccent(prefs.accent);
  applyAppearance();
  syncVoiceControls();
  applyLanguage(prefs.lang, true);
  loadFriends();

  $('loginScreen').style.display = 'none';
  $('chatApp').style.display = 'grid';
  $('bootSplash').hidden = true;
  $('chatApp').classList.toggle('compact', prefs.compact);
  $('messageSearch').value = '';
  $('searchBar').hidden = true;
  $('conversationSearch').value = '';

  renderIdentity();
  refreshAudioDevices();
  $('settingsUsername').textContent = `@${user.username}`;
  connect();
  loadServers().then(() => { void consumePendingInvite(); });
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
  stopLiveVoice({ silent: true, localOnly: true });
  resetVoiceSession();
  closeMiniGame();
  for (const entry of miniGameDownloads.values()) clearInterval(entry.timer);
  miniGameDownloads.clear();
  miniGamesInstalled = [];
  updateMiniGamesBadge();
  localVoiceKey = '';
  closeAudioMenus();
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
  channelPrefs = {};
  closeChannelMenu();
  servers = [];
  activeServerId = null;
  current = { kind: 'home' };
  allUsers = [];
  friends = [];
  profileTarget = null;
  history.clear();
  unread.clear();
  typingUsers.clear();
  playing = null;
  playingIcon = '';
  playingPlatform = '';
  playingSince = null;
  searchQuery = '';
  $('messages').innerHTML = '';
  $('serverList').innerHTML = '';
  $('channelList').innerHTML = '';
  $('dmList').innerHTML = '';
  $('userList').innerHTML = '';
  $('loginPassword').value = '';
  $('loginError').textContent = '';
  closeEmojiPicker();
  closeGifPicker();
  $('settingsOverlay').hidden = true;
  document.title = 'Chill';
  if (CHILL.chat?.setBadge) CHILL.chat.setBadge(0);

  showAuth('login');
  toast(t('Wylogowano'));
}

function renderIdentity() {
  if (!currentUser) return;
  applyAvatar($('myAvatar'), myName, myColor, myAvatar);
  $('myName').textContent = myName;
  const handle = myProfileHandle || currentUser.handle || currentUser.username || mentionHandle(myName);
  $('myHandle').textContent = handle ? `@${handle}` : '';
  const status = prefs.status || 'online';
  const statusText = statusLabel(status) + (playing ? ` • ${t('Gra w {game}', { game: playing })}` : '');
  $('myStatusDot').className = `status-dot ${status}`;
  $('myStatusDot').title = statusText;
  $('myProfileBtn').setAttribute('aria-label', `${t('Edytuj profil')} • ${statusText}`);
  applyAvatar($('settingsAvatar'), myName, myColor, myAvatar);
  $('settingsName').textContent = myName;
  renderAudioState();
}

// ============================================================
// MIKROFON / SŁUCHAWKI
// ============================================================
let audioDevices = { input: [], output: [] };
let audioDevicesLoaded = false;
let audioRefreshToken = 0;
let activeAudioMenu = null;
let audioMenuTrigger = null;

function normalizeAudioDevices(raw, kind) {
  const seen = new Set();
  const list = [];
  for (const device of raw) {
    if (device.kind !== kind) continue;
    if (!device.deviceId || device.deviceId === 'default' || device.deviceId === 'communications') continue;
    if (seen.has(device.deviceId)) continue;
    seen.add(device.deviceId);
    list.push({ id: device.deviceId, label: String(device.label || '').trim() });
  }
  return list;
}

function reconcileAudioDevice(kind, devices) {
  const key = kind === 'mic' ? 'audioInput' : 'audioOutput';
  if (!prefs[key]) return;
  if (devices.some((device) => device.id === prefs[key])) return;
  prefs[key] = '';
  savePrefs();
}

async function refreshAudioDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    audioDevicesLoaded = true;
    renderAudioDeviceLists();
    return;
  }
  const token = ++audioRefreshToken;
  try {
    const raw = await navigator.mediaDevices.enumerateDevices();
    if (token !== audioRefreshToken) return;
    const inputs = normalizeAudioDevices(raw, 'audioinput');
    const outputs = normalizeAudioDevices(raw, 'audiooutput');
    audioDevices = { input: inputs, output: outputs };
    reconcileAudioDevice('mic', inputs);
    reconcileAudioDevice('output', outputs);
    audioDevicesLoaded = true;
  } catch {
    if (token !== audioRefreshToken) return;
    audioDevicesLoaded = true;
  } finally {
    if (token === audioRefreshToken) renderAudioDeviceLists();
  }
}

function createAudioDeviceButton(kind, id, label, selected) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'audio-device';
  button.dataset.audioKind = kind;
  button.dataset.deviceId = id;
  button.setAttribute('role', 'menuitemradio');
  button.setAttribute('aria-checked', String(Boolean(selected)));
  button.title = label;

  const name = document.createElement('span');
  name.className = 'audio-device-name';
  name.textContent = label;

  const check = document.createElement('span');
  check.className = 'audio-device-check';
  check.setAttribute('aria-hidden', 'true');
  check.textContent = selected ? '✓' : '';

  button.append(name, check);
  button.addEventListener('click', () => chooseAudioDevice(kind, id));
  return button;
}

function renderAudioDeviceList(kind) {
  const list = $(kind === 'mic' ? 'micDeviceList' : 'outputDeviceList');
  if (!list) return;
  const devices = kind === 'mic' ? audioDevices.input : audioDevices.output;
  const selectedId = kind === 'mic' ? prefs.audioInput : prefs.audioOutput;
  const selectedExists = devices.some((device) => device.id === selectedId);

  list.replaceChildren();
  list.appendChild(createAudioDeviceButton(kind, '', t('Domyślne urządzenie'), !selectedId || !selectedExists));

  if (!audioDevicesLoaded) {
    const loading = document.createElement('div');
    loading.className = 'audio-device-empty';
    loading.textContent = t('Ładowanie urządzeń…');
    list.appendChild(loading);
    return;
  }

  if (!devices.length) {
    const empty = document.createElement('div');
    empty.className = 'audio-device-empty';
    empty.textContent = t('Brak dostępnych urządzeń');
    list.appendChild(empty);
    return;
  }

  devices.forEach((device, index) => {
    list.appendChild(createAudioDeviceButton(
      kind,
      device.id,
      device.label || t('Urządzenie {n}', { n: index + 1 }),
      device.id === selectedId,
    ));
  });
}

function renderAudioDeviceLists() {
  renderAudioDeviceList('mic');
  renderAudioDeviceList('output');
  renderSettingsAudioDevices();
}

function fillSettingsAudioSelect(select, kind) {
  if (!select) return;
  const devices = kind === 'mic' ? audioDevices.input : audioDevices.output;
  const selectedId = kind === 'mic' ? prefs.audioInput : prefs.audioOutput;
  const selectedExists = devices.some((device) => device.id === selectedId);

  select.replaceChildren();
  const fallback = document.createElement('option');
  fallback.value = '';
  fallback.textContent = t('Domyślne urządzenie');
  select.appendChild(fallback);

  if (!audioDevicesLoaded) {
    const loading = document.createElement('option');
    loading.value = '';
    loading.textContent = t('Ładowanie urządzeń…');
    loading.disabled = true;
    select.appendChild(loading);
  } else if (!devices.length) {
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = t('Brak dostępnych urządzeń');
    empty.disabled = true;
    select.appendChild(empty);
  } else {
    devices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.id;
      option.textContent = device.label || t('Urządzenie {n}', { n: index + 1 });
      select.appendChild(option);
    });
  }

  select.value = selectedExists ? selectedId : '';
}

function renderSettingsAudioDevices() {
  fillSettingsAudioSelect($('settingsMicSelect'), 'mic');
  fillSettingsAudioSelect($('settingsOutputSelect'), 'output');
}

function chooseAudioDevice(kind, id) {
  if (kind === 'mic') stopMicTest();
  const key = kind === 'mic' ? 'audioInput' : 'audioOutput';
  prefs[key] = String(id || '');
  savePrefs();
  closeAudioMenus(true);
  renderSettingsAudioDevices();
  if (kind === 'mic' && liveVoice) restartLiveVoiceCapture();
  if (kind === 'output' && liveVoicePlayback?.context && typeof liveVoicePlayback.context.setSinkId === 'function') {
    void liveVoicePlayback.context.setSinkId(prefs.audioOutput).catch(() => {});
  }
}

function setMicMuted(muted) {
  prefs.micMuted = Boolean(muted);
  savePrefs();
  renderAudioState();
  if (liveVoice) {
    if (!prefs.micMuted && !liveVoice.captureNode) void startLiveVoiceCapture();
    sendLiveVoiceUpdate();
    syncLiveVoiceButtons();
  }
}

function setDeafened(deafened) {
  prefs.deafened = Boolean(deafened);
  savePrefs();
  renderAudioState();
  if (liveVoice) {
    updateLiveVoiceOutputGain();
    sendLiveVoiceUpdate();
    syncLiveVoiceButtons();
  }
}

function renderAudioState() {
  const micBtn = $('micBtn');
  const outputBtn = $('outputBtn');
  if (!micBtn || !outputBtn) return;

  const muted = Boolean(prefs.micMuted);
  const deafened = Boolean(prefs.deafened);

  micBtn.classList.toggle('muted', muted);
  micBtn.title = t(muted ? 'Włącz mikrofon' : 'Wycisz mikrofon');
  micBtn.setAttribute('aria-label', micBtn.title);
  micBtn.setAttribute('aria-pressed', String(muted));

  outputBtn.classList.toggle('muted', deafened);
  outputBtn.title = t(deafened ? 'Włącz dźwięk' : 'Wycisz dźwięk');
  outputBtn.setAttribute('aria-label', outputBtn.title);
  outputBtn.setAttribute('aria-pressed', String(deafened));

  const micMenuBtn = $('micMenuBtn');
  if (micMenuBtn) {
    micMenuBtn.title = t('Wybierz mikrofon');
    micMenuBtn.setAttribute('aria-label', t('Wybierz mikrofon'));
  }
  const outputMenuBtn = $('outputMenuBtn');
  if (outputMenuBtn) {
    outputMenuBtn.title = t('Wybierz słuchawki');
    outputMenuBtn.setAttribute('aria-label', t('Wybierz słuchawki'));
  }

  const micToggle = $('micToggleItem');
  if (micToggle) {
    micToggle.classList.toggle('on', muted);
    micToggle.setAttribute('aria-checked', String(muted));
  }
  const outputToggle = $('outputToggleItem');
  if (outputToggle) {
    outputToggle.classList.toggle('on', deafened);
    outputToggle.setAttribute('aria-checked', String(deafened));
  }
  syncLiveVoiceButtons();
}

function refreshMicTestUi() {
  const btn = $('micTestBtn');
  if (btn) {
    btn.textContent = t(micTest ? 'Zatrzymaj test' : 'Test mikrofonu');
    btn.classList.toggle('testing', Boolean(micTest));
    btn.setAttribute('aria-pressed', String(Boolean(micTest)));
  }
  const status = $('micTestStatus');
  if (!status) return;
  if (micTest) status.textContent = t('Poziom mikrofonu: {value}%', { value: micTest.lastLevel || 0 });
  else status.textContent = t('Kliknij „Test mikrofonu”, aby sprawdzić poziom.');
}

function stopMicTest() {
  if (!micTest) {
    refreshMicTestUi();
    return;
  }
  const test = micTest;
  micTest = null;
  cancelAnimationFrame(test.raf);
  try { test.source.disconnect(); } catch { /* ignore */ }
  try { test.stream.getTracks().forEach((track) => track.stop()); } catch { /* ignore */ }
  try { test.context.close(); } catch { /* ignore */ }
  const level = $('micTestLevel');
  if (level) level.style.width = '0%';
  const meter = $('micTestMeter');
  if (meter) meter.setAttribute('aria-valuenow', '0');
  refreshMicTestUi();
}

async function toggleMicTest() {
  if (micTest) {
    stopMicTest();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    toast(t('Nie udało się uruchomić testu mikrofonu.'));
    return;
  }
  const btn = $('micTestBtn');
  if (btn) btn.disabled = true;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  let stream = null;
  let context = null;
  try {
    stream = await requestMicrophone();
    if (!Ctx) throw new Error('no audio context');
    context = new Ctx({ sampleRate: 48000 });
    if (context.state === 'suspended') await context.resume().catch(() => {});
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    micTest = {
      stream,
      context,
      source,
      analyser,
      data,
      raf: 0,
      lastLevel: 0,
      lastUi: 0,
    };
    stream = null;
    context = null;
    refreshMicTestUi();
    const tick = () => {
      if (!micTest) return;
      micTest.analyser.getByteTimeDomainData(micTest.data);
      let sum = 0;
      for (const sample of micTest.data) {
        const value = (sample - 128) / 128;
        sum += value * value;
      }
      const rms = Math.sqrt(sum / micTest.data.length);
      const db = 20 * Math.log10(Math.max(rms, 0.000001));
      const level = Math.max(0, Math.min(100, Math.round(((db + 60) / 60) * 100)));
      if (level !== micTest.lastLevel) {
        micTest.lastLevel = level;
        const fill = $('micTestLevel');
        if (fill) fill.style.width = `${level}%`;
        const meter = $('micTestMeter');
        if (meter) meter.setAttribute('aria-valuenow', String(level));
      }
      const now = performance.now();
      if (now - micTest.lastUi > 160) {
        micTest.lastUi = now;
        const status = $('micTestStatus');
        if (status) status.textContent = t('Poziom mikrofonu: {value}%', { value: micTest.lastLevel });
      }
      micTest.raf = requestAnimationFrame(tick);
    };
    tick();
  } catch {
    try { stream?.getTracks().forEach((track) => track.stop()); } catch { /* ignore */ }
    try { context?.close(); } catch { /* ignore */ }
    toast(t('Nie udało się uruchomić testu mikrofonu.'));
  } finally {
    if (btn) btn.disabled = false;
  }
}

function positionAudioMenu(menu, trigger) {
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(264, window.innerWidth - 24);
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
  menu.style.width = `${width}px`;
  menu.style.left = `${left}px`;
  menu.style.bottom = `${Math.max(12, window.innerHeight - rect.top + 8)}px`;
}

function closeAudioMenus(returnFocus = false) {
  if (!activeAudioMenu) return;
  const menu = activeAudioMenu === 'mic' ? $('micMenu') : $('outputMenu');
  const trigger = audioMenuTrigger;
  if (menu) menu.hidden = true;
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
  activeAudioMenu = null;
  audioMenuTrigger = null;
  if (returnFocus && trigger) trigger.focus({ preventScroll: true });
}

function toggleAudioMenu(kind, trigger) {
  if (activeAudioMenu === kind) {
    closeAudioMenus(true);
    return;
  }
  closeAudioMenus();
  const menu = kind === 'mic' ? $('micMenu') : $('outputMenu');
  if (!menu) return;
  activeAudioMenu = kind;
  audioMenuTrigger = trigger;
  menu.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  renderAudioDeviceList(kind);
  positionAudioMenu(menu, trigger);
  refreshAudioDevices();
  const first = menu.querySelector('button:not([disabled])');
  if (first) requestAnimationFrame(() => first.focus({ preventScroll: true }));
}

function bindAudioControls() {
  $('micBtn').addEventListener('click', () => {
    setMicMuted(!prefs.micMuted);
    closeAudioMenus();
  });
  $('outputBtn').addEventListener('click', () => {
    setDeafened(!prefs.deafened);
    closeAudioMenus();
  });
  $('micMenuBtn').addEventListener('click', () => toggleAudioMenu('mic', $('micMenuBtn')));
  $('outputMenuBtn').addEventListener('click', () => toggleAudioMenu('output', $('outputMenuBtn')));
  $('micToggleItem').addEventListener('click', () => setMicMuted(!prefs.micMuted));
  $('outputToggleItem').addEventListener('click', () => setDeafened(!prefs.deafened));

  document.addEventListener('pointerdown', (event) => {
    if (!activeAudioMenu || !(event.target instanceof Element)) return;
    if (event.target.closest('.audio-menu') || event.target.closest('.me-split')) return;
    closeAudioMenus();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !activeAudioMenu) return;
    event.preventDefault();
    event.stopPropagation();
    closeAudioMenus(true);
  }, true);

  window.addEventListener('resize', () => closeAudioMenus());
  document.addEventListener('scroll', (event) => {
    if (!activeAudioMenu) return;
    if (event.target instanceof Element && event.target.closest('.audio-menu')) return;
    closeAudioMenus();
  }, true);

  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => {
      refreshAudioDevices();
    });
  }
}

// ============================================================
// KANAŁY GŁOSOWE
// ============================================================
const LIVE_VOICE_RATE = 24000;
const LIVE_SCREEN_FPS = 10;
const LIVE_SCREEN_MAX_WIDTH = 1280;
const LIVE_SCREEN_MAX_HEIGHT = 720;
const LIVE_SCREEN_QUALITY = 0.6;
const LIVE_SCREEN_MAX_BYTES = 190 * 1024;
const LIVE_SCREEN_MAGIC = new Uint8Array([0x43, 0x53, 0x53, 0x01]);
const VOICE_SVGS = {
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><path d="M12 19v3"></path><path d="M8 22h8"></path></svg>',
  micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><path d="M12 19v3"></path><path d="M8 22h8"></path><path d="M3 3 21 21"></path></svg>',
  headphones: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"></path></svg>',
  headphonesOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"></path><path d="M3 3 21 21"></path></svg>',
  phoneOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><path d="M22 2 2 22"></path></svg>',
  signal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12.55a11 11 0 0 1 14 0"></path><path d="M8.5 16.03a6 6 0 0 1 7 0"></path><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"></circle></svg>',
  invite: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8" cy="7" r="4"></circle><path d="M19 8v6"></path><path d="M22 11h-6"></path></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect></svg>',
  voice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>',
  screen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="19" height="13" rx="2"></rect><path d="M8 21h8"></path><path d="M12 16.5V21"></path></svg>',
  screenOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="19" height="13" rx="2"></rect><path d="M8 21h8"></path><path d="M12 16.5V21"></path><path d="M3 3 21 21"></path></svg>',
};

function normalizeVoiceParticipant(raw) {
  const memberId = String(raw?.memberId || raw?.id || '').slice(0, 64);
  if (!memberId) return null;
  return {
    memberId,
    name: String(raw?.name || 'Gość').slice(0, 32),
    color: safeColor(raw?.color, '#3ee0a3'),
    muted: Boolean(raw?.muted),
    deafened: Boolean(raw?.deafened),
    sharing: Boolean(raw?.sharing),
    shareName: String(raw?.shareName || '').slice(0, 80),
  };
}

function voiceParticipants(state, channelId) {
  if (!state?.voiceRooms || !channelId) return [];
  const list = state.voiceRooms.get(channelId);
  return Array.isArray(list) ? list : [];
}

// ---------- Spotify na kanałach głosowych ----------
const SPOTIFY_KINDS = new Set(['track', 'album', 'playlist', 'episode', 'show', 'artist']);

function parseSpotifyLink(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  let kind = '';
  let id = '';
  const uri = /^spotify:(track|album|playlist|episode|show|artist):([A-Za-z0-9]{16,64})$/i.exec(text);
  if (uri) {
    kind = uri[1].toLowerCase();
    id = uri[2];
  } else {
    let candidate = text;
    if (!/^https?:\/\//i.test(candidate)) {
      if (!/^(open\.spotify\.com|embed\.spotify\.com)\//i.test(candidate)) return null;
      candidate = `https://${candidate}`;
    }
    let url;
    try {
      url = new URL(candidate);
    } catch {
      return null;
    }
    const host = url.hostname.toLowerCase();
    if (host !== 'open.spotify.com' && host !== 'embed.spotify.com' && host !== 'play.spotify.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'embed') parts.shift();
    if (parts[0] === 'intl-pl') parts.shift();
    if (parts.length < 2 || !SPOTIFY_KINDS.has(parts[0].toLowerCase())) return null;
    kind = parts[0].toLowerCase();
    id = parts[1];
  }
  if (!SPOTIFY_KINDS.has(kind) || !/^[A-Za-z0-9]{16,64}$/.test(id)) return null;
  return {
    kind,
    id,
    url: `https://open.spotify.com/${kind}/${id}`,
    embed: `https://open.spotify.com/embed/${kind}/${id}?utm_source=generator&theme=0`,
  };
}

function spotifyKindLabel(kind) {
  return t({
    track: 'Utwór',
    album: 'Album',
    playlist: 'Playlista',
    episode: 'Odcinek',
    show: 'Podcast',
    artist: 'Artysta',
  }[kind] || 'Spotify');
}

function spotifyRoomState(state, channelId) {
  return state?.spotifyRooms?.get(String(channelId || '')) || null;
}

function activeVoiceChannel() {
  if (current.kind !== 'server') return null;
  return serverState(current.serverId)?.channels.find((item) => item.id === current.id && item.type === 'voice') || null;
}

function renderSpotifyPanel(state, channel) {
  const panel = $('spotifyPanel');
  const toggle = $('spotifyToggle');
  if (!panel || !toggle) return;
  const isVoice = channel?.type === 'voice';
  toggle.hidden = !isVoice;
  if (!isVoice) {
    panel.hidden = true;
    return;
  }
  panel.hidden = !spotifyPanelOpen;
  toggle.classList.toggle('active', spotifyPanelOpen);
  if (!spotifyPanelOpen) return;

  const item = spotifyRoomState(state, channel.id);
  const now = $('spotifyNow');
  const empty = $('spotifyEmpty');
  const frame = $('spotifyFrame');
  if (now) now.hidden = !item;
  if (empty) empty.hidden = Boolean(item);
  if (!item) {
    if (frame) frame.removeAttribute('src');
    return;
  }
  if (frame && frame.getAttribute('src') !== item.embed) frame.setAttribute('src', item.embed);
  const title = $('spotifyTitle');
  if (title) title.textContent = item.title || spotifyKindLabel(item.kind);
  const by = $('spotifyBy');
  if (by) {
    by.textContent = item.byName
      ? t('Dodane przez {name}', { name: item.byName })
      : spotifyKindLabel(item.kind);
  }
  const hint = $('spotifyHint');
  if (hint) hint.textContent = t('Odtwarzacz jest zsynchronizowany dla wszystkich na kanale.');
}

function spotifySocket(serverId) {
  const state = serverState(serverId);
  if (!state?.ws || state.ws.readyState !== WebSocket.OPEN) return null;
  return state.ws;
}

function setSpotifyMusic(channelId, link) {
  if (current.kind !== 'server') return false;
  const state = serverState(current.serverId);
  const socket = spotifySocket(current.serverId);
  if (!state || !socket) {
    toast(t('Łączę z serwerem — spróbuj za chwilę.'));
    return false;
  }
  try {
    socket.send(JSON.stringify({
      type: 'spotify:set',
      channelId,
      url: link.url,
      title: spotifyKindLabel(link.kind),
    }));
    return true;
  } catch {
    toast(t('Nie udało się włączyć muzyki.'));
    return false;
  }
}

function clearSpotifyMusic(channelId) {
  const socket = current.kind === 'server' ? spotifySocket(current.serverId) : null;
  if (!socket) {
    toast(t('Łączę z serwerem — spróbuj za chwilę.'));
    return;
  }
  try {
    socket.send(JSON.stringify({ type: 'spotify:clear', channelId }));
  } catch { /* ignore */ }
}

function openSpotifySearch(query) {
  const phrase = String(query || '').trim();
  if (!phrase) return;
  const url = `https://open.spotify.com/search/${encodeURIComponent(phrase)}`;
  if (CHILL.app?.openExternal) CHILL.app.openExternal(url);
  else window.open(url, '_blank', 'noopener');
}

function bindSpotifyPanel() {
  $('spotifyToggle')?.addEventListener('click', () => {
    spotifyPanelOpen = !spotifyPanelOpen;
    if (spotifyPanelOpen) {
      const state = current.kind === 'server' ? serverState(current.serverId) : null;
      const channel = state?.channels.find((item) => item.id === current.id);
      renderSpotifyPanel(state, channel);
      setTimeout(() => $('spotifyInput')?.focus(), 30);
    } else {
      renderSpotifyPanel(current.kind === 'server' ? serverState(current.serverId) : null, activeVoiceChannel());
    }
  });
  $('closeSpotify')?.addEventListener('click', () => {
    spotifyPanelOpen = false;
    renderSpotifyPanel(current.kind === 'server' ? serverState(current.serverId) : null, activeVoiceChannel());
  });
  $('spotifyForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (current.kind !== 'server') return;
    const input = $('spotifyInput');
    const state = serverState(current.serverId);
    const channel = state?.channels.find((item) => item.id === current.id);
    if (!channel || channel.type !== 'voice') {
      toast(t('Spotify jest dostępne na kanałach głosowych.'));
      return;
    }
    const value = String(input?.value || '').trim();
    if (!value) return;
    const link = parseSpotifyLink(value);
    if (!link) {
      openSpotifySearch(value);
      toast(t('Otworzyliśmy wyszukiwarkę Spotify — skopiuj link do utworu i wklej go tutaj.'));
      return;
    }
    if (setSpotifyMusic(channel.id, link) && input) input.value = '';
  });
  $('spotifyOpenBtn')?.addEventListener('click', () => {
    if (current.kind !== 'server') return;
    const item = spotifyRoomState(serverState(current.serverId), current.id);
    if (!item?.url) return;
    if (CHILL.app?.openExternal) CHILL.app.openExternal(item.url);
    else window.open(item.url, '_blank', 'noopener');
  });
  $('spotifyClearBtn')?.addEventListener('click', () => {
    if (current.kind !== 'server') return;
    clearSpotifyMusic(current.id);
  });
}

function voiceChannelFor(serverId, channelId) {
  return serverState(serverId)?.channels.find((channel) => channel.id === channelId) || null;
}

function liveVoiceConnectedHere(serverId, channelId) {
  return Boolean(liveVoice && liveVoice.serverId === serverId && liveVoice.channelId === channelId);
}

function voiceSocket(serverId) {
  const state = serverState(serverId);
  if (!state?.ws || state.ws.readyState !== WebSocket.OPEN) return null;
  return state.ws;
}

function sendLiveVoiceJoin() {
  if (!liveVoice) return false;
  const socket = voiceSocket(liveVoice.serverId);
  if (!socket) return false;
  try {
    socket.send(JSON.stringify({
      type: 'voice:join',
      channelId: liveVoice.channelId,
      muted: Boolean(prefs.micMuted),
      deafened: Boolean(prefs.deafened),
    }));
    return true;
  } catch {
    return false;
  }
}

function sendLiveVoiceUpdate() {
  if (!liveVoice) return;
  const socket = voiceSocket(liveVoice.serverId);
  if (!socket) return;
  try {
    socket.send(JSON.stringify({
      type: 'voice:update',
      muted: Boolean(prefs.micMuted),
      deafened: Boolean(prefs.deafened),
    }));
  } catch { /* ignore */ }
}

function stopLiveVoiceCapture(call) {
  if (!call) return;
  if (liveVoice === call) liveVoiceCaptureToken += 1;
  try { if (call.captureNode) call.captureNode.onaudioprocess = null; } catch { /* ignore */ }
  try { call.captureSource?.disconnect(); } catch { /* ignore */ }
  try { call.captureNode?.disconnect(); } catch { /* ignore */ }
  try { call.captureSink?.disconnect(); } catch { /* ignore */ }
  try { call.stream?.getTracks().forEach((track) => track.stop()); } catch { /* ignore */ }
  try { call.processing?.stream?.getTracks().forEach((track) => track.stop()); } catch { /* ignore */ }
  try { call.processing?.context?.close?.(); } catch { /* ignore */ }
  try { call.captureContext?.close?.(); } catch { /* ignore */ }
  call.stream = null;
  call.processing = null;
  call.captureContext = null;
  call.captureSource = null;
  call.captureNode = null;
  call.captureSink = null;
  call.micReady = false;
}

async function startLiveVoiceCapture() {
  const call = liveVoice;
  if (!call || call.captureNode) return;
  if (!navigator.mediaDevices?.getUserMedia) return;
  const token = ++liveVoiceCaptureToken;
  let stream = null;
  let processing = null;
  let context = null;
  try {
    stream = await requestMicrophone();
    if (liveVoice !== call || token !== liveVoiceCaptureToken) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    processing = createVoiceProcessing(stream);
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('no audio context');
    context = new Ctx({ sampleRate: 24000, latencyHint: 'interactive' });
    if (context.state === 'suspended') await context.resume().catch(() => {});
    const source = context.createMediaStreamSource(processing.stream || stream);
    const node = context.createScriptProcessor(1024, 1, 1);
    const sink = context.createGain();
    const sourceRate = context.sampleRate;
    sink.gain.value = 0;
    node.onaudioprocess = (event) => {
      if (liveVoice !== call || token !== liveVoiceCaptureToken) return;
      if (prefs.micMuted) return;
      const input = event.inputBuffer.getChannelData(0);
      if (!input.length) return;
      // Kontekst może działać z inną częstotliwością niż 24 kHz — zawsze
      // resamplujemy do formatu przesyłanego przez serwer.
      const ratio = sourceRate / LIVE_VOICE_RATE;
      const length = ratio === 1 ? input.length : Math.max(1, Math.round(input.length / ratio));
      let sum = 0;
      const pcm = new Int16Array(length);
      for (let i = 0; i < length; i += 1) {
        const position = i * ratio;
        const index = Math.floor(position);
        const fraction = position - index;
        const first = input[index] || 0;
        const second = input[Math.min(input.length - 1, index + 1)] || first;
        const value = Math.max(-1, Math.min(1, first + (second - first) * fraction));
        sum += value * value;
        pcm[i] = value < 0 ? value * 0x8000 : value * 0x7fff;
      }
      if (Math.sqrt(sum / length) > 0.012) {
        const selfId = serverState(call.serverId)?.you?.memberId;
        if (selfId) markVoiceSpeaking(selfId);
      }
      const socket = voiceSocket(call.serverId);
      if (call.status !== 'offline' && socket) {
        try { socket.send(pcm.buffer); } catch { /* ignore */ }
      }
    };
    source.connect(node);
    node.connect(sink);
    sink.connect(context.destination);
    call.stream = stream;
    call.processing = processing;
    call.captureContext = context;
    call.captureSource = source;
    call.captureNode = node;
    call.captureSink = sink;
    call.micReady = true;
    stream = null;
    processing = null;
    context = null;
  } catch {
    try { stream?.getTracks().forEach((track) => track.stop()); } catch { /* ignore */ }
    try { processing?.stream?.getTracks().forEach((track) => track.stop()); } catch { /* ignore */ }
    try { processing?.context?.close?.(); } catch { /* ignore */ }
    try { context?.close?.(); } catch { /* ignore */ }
    if (liveVoice !== call || token !== liveVoiceCaptureToken) return;
    call.micReady = false;
    if (!prefs.micMuted) {
      setMicMuted(true);
      toast(t('Brak dostępu do mikrofonu. Dołączono w trybie słuchania.'));
    }
  }
}

function restartLiveVoiceCapture() {
  if (!liveVoice) return;
  const call = liveVoice;
  stopLiveVoiceCapture(call);
  void startLiveVoiceCapture();
}

function ensureLiveVoicePlayback() {
  if (liveVoicePlayback) return liveVoicePlayback;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    const context = new Ctx({ sampleRate: 24000, latencyHint: 'interactive' });
    if (context.state === 'suspended') void context.resume().catch(() => {});
    const gain = context.createGain();
    const volume = Math.max(0, Math.min(100, Number(prefs.outputVolume) || 0)) / 100;
    gain.gain.value = prefs.deafened ? 0 : volume;
    gain.connect(context.destination);
    if (prefs.audioOutput && typeof context.setSinkId === 'function') {
      void context.setSinkId(prefs.audioOutput).catch(() => {});
    }
    liveVoicePlayback = { context, gain, members: new Map() };
    return liveVoicePlayback;
  } catch {
    return null;
  }
}

function updateLiveVoiceOutputGain() {
  if (!liveVoicePlayback) return;
  const volume = Math.max(0, Math.min(100, Number(prefs.outputVolume) || 0)) / 100;
  try {
    liveVoicePlayback.gain.gain.value = prefs.deafened ? 0 : volume;
  } catch { /* ignore */ }
}

function teardownLiveVoicePlayback() {
  const playback = liveVoicePlayback;
  liveVoicePlayback = null;
  if (!playback) return;
  try { playback.context.close(); } catch { /* ignore */ }
  playback.members.clear();
}

function markVoiceSpeaking(memberId) {
  const key = String(memberId || '');
  if (!key) return;
  let entry = liveVoiceSpeaking.get(key);
  if (!entry) {
    entry = { timer: 0, active: false };
    liveVoiceSpeaking.set(key, entry);
  }
  if (!entry.active) {
    entry.active = true;
    setVoiceSpeakingUi(key, true);
  }
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    entry.active = false;
    entry.timer = 0;
    setVoiceSpeakingUi(key, false);
    liveVoiceSpeaking.delete(key);
  }, 280);
}

function setVoiceSpeakingUi(memberId, speaking) {
  document.querySelectorAll('[data-voice-member]').forEach((el) => {
    if (el.dataset.voiceMember === memberId) el.classList.toggle('speaking', speaking);
  });
}

function clearLiveVoiceSpeaking() {
  for (const entry of liveVoiceSpeaking.values()) clearTimeout(entry.timer);
  document.querySelectorAll('[data-voice-member].speaking').forEach((el) => el.classList.remove('speaking'));
  liveVoiceSpeaking.clear();
}

function handleLiveVoiceAudio(serverId, data) {
  if (!liveVoice || liveVoice.serverId !== serverId) return;
  if (!(data instanceof ArrayBuffer)) return;
  const bytes = new Uint8Array(data);
  if (bytes.length < 4 || bytes[0] !== 1) return;
  const idLength = bytes[1];
  if (!idLength || bytes.length < 2 + idLength + 2) return;
  const memberId = new TextDecoder().decode(bytes.subarray(2, 2 + idLength));
  const state = serverState(serverId);
  if (!memberId || memberId === state?.you?.memberId) return;
  const offset = 2 + idLength;
  const sampleCount = Math.floor((bytes.length - offset) / 2);
  if (!sampleCount) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, sampleCount * 2);
  let sum = 0;
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    const value = view.getInt16(i * 2, true) / 32768;
    samples[i] = value;
    sum += value * value;
  }
  if (Math.sqrt(sum / sampleCount) > 0.012) markVoiceSpeaking(memberId);
  if (prefs.deafened) return;

  const playback = ensureLiveVoicePlayback();
  if (!playback) return;
  const { context } = playback;
  if (context.state === 'suspended') void context.resume().catch(() => {});
  let source;
  try {
    const buffer = context.createBuffer(1, sampleCount, LIVE_VOICE_RATE);
    buffer.getChannelData(0).set(samples);
    source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(playback.gain);
    const entry = playback.members.get(memberId) || { nextTime: 0 };
    const now = context.currentTime;
    let when = Math.max(now + 0.06, entry.nextTime || 0);
    if (when > now + 0.4) when = now + 0.06;
    source.start(when);
    entry.nextTime = when + buffer.duration;
    playback.members.set(memberId, entry);
  } catch { /* ignore */ }
}

// ---------- Udostępnianie ekranu ----------
function resetLiveVoiceScreen(sharerId = '') {
  liveVoiceScreen = sharerId ? { sharerId, decoding: false, lastAt: 0 } : null;
  const canvas = $('voiceScreenCanvas');
  if (canvas) {
    try {
      canvas.width = 16;
      canvas.height = 9;
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    } catch { /* ignore */ }
  }
  const placeholder = $('voiceScreenPlaceholder');
  if (placeholder) placeholder.hidden = false;
}

function paintVoiceScreenFrame(source, sharerId) {
  if (sharerId && liveVoiceScreen?.sharerId !== sharerId) return;
  const section = $('voiceViewScreen');
  const canvas = $('voiceScreenCanvas');
  if (!section || section.hidden || !canvas) return;
  const width = Number(source.width || source.videoWidth || 0);
  const height = Number(source.height || source.videoHeight || 0);
  if (!width || !height) return;
  try {
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(source, 0, 0, width, height);
    const placeholder = $('voiceScreenPlaceholder');
    if (placeholder) placeholder.hidden = true;
  } catch { /* ignore */ }
}

function handleLiveVoiceScreen(serverId, data) {
  if (!liveVoice || liveVoice.serverId !== serverId) return;
  if (!(data instanceof ArrayBuffer)) return;
  const bytes = new Uint8Array(data);
  if (bytes.length < 6 || bytes[0] !== 2) return;
  const idLength = bytes[1];
  if (!idLength || bytes.length < 2 + idLength + 2) return;
  const memberId = new TextDecoder().decode(bytes.subarray(2, 2 + idLength));
  const state = serverState(serverId);
  if (!memberId || memberId === state?.you?.memberId) return;
  if (!liveVoiceScreen || liveVoiceScreen.sharerId !== memberId) return;
  const participant = voiceParticipants(state, liveVoice.channelId)
    .find((item) => item.memberId === memberId);
  if (!participant?.sharing) return;
  const section = $('voiceViewScreen');
  if (!section || section.hidden) return;
  if (current.kind !== 'server' || current.serverId !== serverId || current.id !== liveVoice.channelId) return;
  if (liveVoiceScreen.decoding) return;
  liveVoiceScreen.decoding = true;
  const offset = 2 + idLength;
  const blob = new Blob([bytes.subarray(offset)], { type: 'image/jpeg' });
  if (typeof createImageBitmap !== 'function') {
    liveVoiceScreen.decoding = false;
    return;
  }
  createImageBitmap(blob).then((bitmap) => {
    if (!liveVoiceScreen || liveVoiceScreen.sharerId !== memberId) {
      bitmap.close?.();
      return;
    }
    liveVoiceScreen.decoding = false;
    liveVoiceScreen.lastAt = Date.now();
    paintVoiceScreenFrame(bitmap, memberId);
    bitmap.close?.();
  }).catch(() => {
    if (liveVoiceScreen) liveVoiceScreen.decoding = false;
  });
}

function syncVoiceScreenView(state, channel) {
  const section = $('voiceViewScreen');
  const view = $('voiceView');
  if (!section || !view) return;
  const connectedHere = liveVoiceConnectedHere(state.server.id, channel.id);
  const participants = voiceParticipants(state, channel.id);
  const selfId = state.you?.memberId;
  let sharer = participants.find((item) => item.sharing) || null;
  const localSharing = Boolean(connectedHere && liveVoice?.sharing);
  if (localSharing && (!sharer || sharer.memberId === selfId)) {
    sharer = {
      memberId: selfId || 'self',
      name: state.you?.name || myName || t('Ty'),
      sharing: true,
      shareName: liveVoice.shareName || '',
      self: true,
    };
  }
  if (!sharer) {
    section.hidden = true;
    view.classList.remove('sharing');
    resetLiveVoiceScreen();
    return;
  }
  const isSelf = localSharing && (!sharer.memberId || sharer.memberId === selfId || sharer.self);
  if (!isSelf) {
    if (!liveVoiceScreen || liveVoiceScreen.sharerId !== sharer.memberId) {
      resetLiveVoiceScreen(sharer.memberId);
    }
  } else {
    liveVoiceScreen = null;
    const placeholder = $('voiceScreenPlaceholder');
    if (placeholder) placeholder.hidden = Boolean(liveVoice?.screenLastFrameAt);
  }
  section.hidden = false;
  view.classList.add('sharing');
  const tag = $('voiceScreenTagText');
  if (tag) {
    tag.textContent = isSelf
      ? t('Udostępniasz ekran')
      : t('{name} udostępnia ekran', { name: sharer.name });
  }
  const label = $('voiceScreenCanvas');
  if (label) {
    label.setAttribute('aria-label', isSelf
      ? t('Udostępniasz ekran')
      : t('Udostępniony ekran: {name}', { name: sharer.name }));
  }
}

function sendVoiceShareState(call, sharing) {
  const socket = voiceSocket(call.serverId);
  if (!socket) return;
  try {
    socket.send(JSON.stringify({
      type: 'voice:share',
      sharing: Boolean(sharing),
      name: sharing ? call.shareName : '',
    }));
  } catch { /* ignore */ }
}

function stopScreenCapture(call) {
  if (!call) return;
  if (liveVoice === call) liveVoiceShareToken += 1;
  if (call.shareTimer) clearInterval(call.shareTimer);
  call.shareTimer = 0;
  call.shareEncoding = false;
  try { call.shareStream?.getTracks().forEach((track) => track.stop()); } catch { /* ignore */ }
  try {
    if (call.shareVideo) {
      call.shareVideo.pause?.();
      call.shareVideo.srcObject = null;
    }
  } catch { /* ignore */ }
  call.shareStream = null;
  call.shareVideo = null;
  call.shareCanvas = null;
  call.sharing = false;
  call.shareName = '';
  call.screenLastFrameAt = 0;
}

function stopScreenShare({ silent = false, localOnly = false } = {}) {
  const call = liveVoice;
  if (!call) return;
  const wasSharing = Boolean(call.sharing);
  stopScreenCapture(call);
  if (!localOnly) sendVoiceShareState(call, false);
  if (activeServerId === call.serverId) {
    renderChannels();
    renderVoiceConnectedPanel();
    if (current.kind === 'server' && current.serverId === call.serverId && current.id === call.channelId) {
      renderMessages(false);
    }
  }
  if (!silent && wasSharing) toast(t('Udostępnianie ekranu zakończone.'));
}

async function sendScreenFrameBlob(call, blob) {
  if (!call || liveVoice !== call || !call.sharing) return;
  const socket = voiceSocket(call.serverId);
  if (!socket || socket.bufferedAmount > 2 * 1024 * 1024) return;
  let data;
  try {
    data = await blob.arrayBuffer();
  } catch {
    return;
  }
  if (!call.sharing || liveVoice !== call) return;
  const frame = new Uint8Array(LIVE_SCREEN_MAGIC.length + data.byteLength);
  frame.set(LIVE_SCREEN_MAGIC, 0);
  frame.set(new Uint8Array(data), LIVE_SCREEN_MAGIC.length);
  try {
    const socketNow = voiceSocket(call.serverId);
    if (socketNow && socketNow.bufferedAmount <= 2 * 1024 * 1024) socketNow.send(frame.buffer);
  } catch { /* ignore */ }
}

function encodeScreenFrame(canvas, quality = LIVE_SCREEN_QUALITY) {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        if (blob.size > LIVE_SCREEN_MAX_BYTES) {
          if (quality > 0.3) {
            resolve(encodeScreenFrame(canvas, Math.max(0.3, quality - 0.14)));
          } else {
            resolve(null);
          }
          return;
        }
        resolve(blob);
      }, 'image/jpeg', quality);
    } catch {
      resolve(null);
    }
  });
}

async function queueScreenFrame(call) {
  if (!call || liveVoice !== call || !call.sharing || call.shareEncoding) return;
  const video = call.shareVideo;
  const canvas = call.shareCanvas;
  if (!video || !canvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
  const scale = Math.min(1, LIVE_SCREEN_MAX_WIDTH / video.videoWidth, LIVE_SCREEN_MAX_HEIGHT / video.videoHeight);
  const width = Math.max(2, Math.round((video.videoWidth * scale) / 2) * 2);
  const height = Math.max(2, Math.round((video.videoHeight * scale) / 2) * 2);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d');
  if (!context) return;
  try {
    context.drawImage(video, 0, 0, width, height);
  } catch {
    return;
  }
  call.screenLastFrameAt = Date.now();
  if (current.kind === 'server' && current.serverId === call.serverId && current.id === call.channelId) {
    paintVoiceScreenFrame(canvas);
  }
  call.shareEncoding = true;
  const blob = await encodeScreenFrame(canvas);
  call.shareEncoding = false;
  if (!blob || liveVoice !== call || !call.sharing) return;
  await sendScreenFrameBlob(call, blob);
}

async function startScreenShare(source) {
  const call = liveVoice;
  if (!call || call.status !== 'connected') {
    toast(t('Najpierw dołącz do kanału głosowego.'));
    return false;
  }
  if (call.sharing) return true;
  if (!navigator.mediaDevices?.getDisplayMedia) {
    toast(t('Udostępnianie ekranu nie jest dostępne.'));
    return false;
  }
  const token = ++liveVoiceShareToken;
  let stream = null;
  let video = null;
  try {
    if (source?.id && CHILL.app?.pickScreenSource) {
      const picked = CHILL.app.pickScreenSource(source.id);
      if (!picked) throw new Error('source');
    }
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: LIVE_SCREEN_FPS, max: LIVE_SCREEN_FPS } },
      audio: false,
    });
    if (liveVoice !== call || token !== liveVoiceShareToken) {
      stream.getTracks().forEach((track) => track.stop());
      return false;
    }
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('no-track');
    video = document.createElement('video');
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play().catch(() => {});
    if (liveVoice !== call || token !== liveVoiceShareToken) {
      stream.getTracks().forEach((item) => item.stop());
      return false;
    }
    call.shareStream = stream;
    call.shareVideo = video;
    call.shareCanvas = document.createElement('canvas');
    call.shareName = String(source?.name || track.label || '').slice(0, 80);
    call.sharing = true;
    call.screenLastFrameAt = 0;
    call.shareEncoding = false;
    track.addEventListener('ended', () => {
      if (liveVoice === call && call.sharing) {
        stopScreenShare({ silent: true });
        toast(t('Udostępnianie ekranu zakończone.'));
      }
    });
    sendVoiceShareState(call, true);
    call.shareTimer = setInterval(() => { void queueScreenFrame(call); }, Math.round(1000 / LIVE_SCREEN_FPS));
    void queueScreenFrame(call);
    if (liveVoice === call) {
      if (activeServerId === call.serverId) {
        renderChannels();
        renderVoiceConnectedPanel();
        if (current.kind === 'server' && current.serverId === call.serverId && current.id === call.channelId) {
          renderMessages(false);
        }
      }
    }
    stream = null;
    video = null;
    return true;
  } catch (error) {
    try { stream?.getTracks().forEach((track) => track.stop()); } catch { /* ignore */ }
    try {
      if (video) {
        video.pause?.();
        video.srcObject = null;
      }
    } catch { /* ignore */ }
    if (liveVoice === call && token === liveVoiceShareToken) {
      call.shareStream = null;
      call.shareVideo = null;
      call.shareCanvas = null;
      call.sharing = false;
      call.shareName = '';
      call.screenLastFrameAt = 0;
    }
    const cancelled = error?.name === 'NotAllowedError' || error?.name === 'AbortError';
    if (!cancelled) toast(t('Nie udało się rozpocząć udostępniania ekranu.'));
    return false;
  }
}

function closeScreenSharePicker() {
  const overlay = $('screenShareOverlay');
  if (overlay) overlay.hidden = true;
  screenSharePicker.busy = false;
}

function renderScreenSharePicker() {
  const overlay = $('screenShareOverlay');
  if (!overlay || overlay.hidden) return;
  overlay.querySelectorAll('[data-screen-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.screenTab === screenSharePicker.tab);
  });
  const grid = $('screenShareGrid');
  const note = $('screenShareNote');
  if (note) {
    note.textContent = screenSharePicker.error
      || (screenSharePicker.loading ? t('Ładowanie źródeł…') : t('Wybierz ekran lub okno aplikacji.'));
    note.classList.toggle('error', Boolean(screenSharePicker.error));
  }
  if (!grid) return;
  if (screenSharePicker.loading) {
    grid.innerHTML = `<div class="screen-share-loading">${esc(t('Ładowanie źródeł…'))}</div>`;
    return;
  }
  const sources = screenSharePicker.sources.filter((item) => item.kind === screenSharePicker.tab);
  if (!sources.length) {
    grid.innerHTML = `<div class="screen-share-empty">${esc(t(screenSharePicker.tab === 'screen' ? 'Brak dostępnych ekranów.' : 'Brak dostępnych okien.'))}</div>`;
    return;
  }
  grid.innerHTML = sources.map((source) => {
    const thumb = source.thumb
      ? `<img src="${esc(source.thumb)}" alt="" loading="lazy">`
      : `<span class="screen-source-fallback" aria-hidden="true">${screenSharePicker.tab === 'screen' ? '🖥' : '🪟'}</span>`;
    return `
      <button type="button" class="screen-source${screenSharePicker.busy ? ' busy' : ''}" data-screen-source="${esc(source.id)}"${screenSharePicker.busy ? ' disabled' : ''} title="${esc(source.name || (screenSharePicker.tab === 'screen' ? t('Cały ekran') : t('Aplikacja')))}">
        <span class="screen-source-thumb">${thumb}</span>
        <span class="screen-source-name">${source.icon ? `<img class="screen-source-icon" src="${esc(source.icon)}" alt="">` : ''}${esc(source.name || (screenSharePicker.tab === 'screen' ? t('Cały ekran') : t('Aplikacja')))}</span>
      </button>
    `;
  }).join('');
}

async function loadScreenShareSources() {
  screenSharePicker.loading = true;
  screenSharePicker.error = '';
  renderScreenSharePicker();
  try {
    if (!CHILL.app?.screenSources) throw new Error('unsupported');
    const sources = await CHILL.app.screenSources();
    if (!Array.isArray(sources)) throw new Error('invalid');
    screenSharePicker.sources = sources
      .filter((source) => source && source.id)
      .map((source) => ({
        id: String(source.id),
        name: String(source.name || '').slice(0, 120),
        kind: source.kind === 'screen' ? 'screen' : 'window',
        thumb: source.thumb || null,
        icon: source.icon || null,
      }))
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, prefs.lang === 'en' ? 'en' : 'pl'));
  } catch {
    screenSharePicker.sources = [];
    screenSharePicker.error = t('Nie udało się pobrać listy ekranów.');
  } finally {
    screenSharePicker.loading = false;
    renderScreenSharePicker();
  }
}

async function openScreenSharePicker() {
  if (!liveVoice || liveVoice.status !== 'connected') {
    toast(t('Najpierw dołącz do kanału głosowego.'));
    return;
  }
  if (liveVoice.sharing) {
    stopScreenShare();
    return;
  }
  // Tauri (WebView2) i strona publiczna korzystają z systemowego wyboru
  // ekranu/okna. Tylko Electron ma własny picker z miniaturami źródeł.
  if (CHILL.app?.screenPicker === 'native') {
    void startScreenShare(null);
    return;
  }
  if (!CHILL.app?.screenSources) {
    toast(t('Udostępnianie ekranu nie jest dostępne.'));
    return;
  }
  const overlay = $('screenShareOverlay');
  if (!overlay) return;
  screenSharePicker = { sources: [], tab: 'screen', loading: true, busy: false, error: '' };
  overlay.hidden = false;
  renderScreenSharePicker();
  await loadScreenShareSources();
}

async function chooseScreenShareSource(id) {
  if (screenSharePicker.busy) return;
  const source = screenSharePicker.sources.find((item) => item.id === id);
  if (!source) return;
  screenSharePicker.busy = true;
  screenSharePicker.error = '';
  renderScreenSharePicker();
  const ok = await startScreenShare(source);
  if (ok) {
    closeScreenSharePicker();
    return;
  }
  screenSharePicker.busy = false;
  screenSharePicker.error = t('Nie udało się rozpocząć udostępniania ekranu.');
  renderScreenSharePicker();
}

function joinLiveVoice(serverId, channelId) {
  const state = serverState(serverId);
  const channel = state?.channels.find((item) => item.id === channelId);
  if (!state || state.status !== 'online') {
    toast(t('Serwer jest offline - spróbuj ponownie po połączeniu.'));
    return;
  }
  if (!channel || channel.type !== 'voice') {
    toast(t('Ten kanał nie jest kanałem głosowym.'));
    return;
  }
  if (liveVoice && liveVoice.serverId === serverId && liveVoice.channelId === channelId) {
    renderVoiceConnectedPanel();
    if (current.kind === 'server' && current.serverId === serverId && current.id === channelId) renderMessages(false);
    return;
  }
  if (liveVoice) stopLiveVoice({ silent: true });
  const call = {
    serverId,
    channelId,
    status: 'connecting',
    micReady: false,
    stream: null,
    processing: null,
    captureContext: null,
    captureSource: null,
    captureNode: null,
    captureSink: null,
    sharing: false,
    shareName: '',
    shareStream: null,
    shareVideo: null,
    shareCanvas: null,
    shareTimer: 0,
    shareEncoding: false,
    screenLastFrameAt: 0,
  };
  liveVoice = call;
  renderSidebar();
  renderVoiceConnectedPanel();
  if (current.kind === 'server' && current.serverId === serverId && current.id === channelId) {
    renderHeader();
    renderMessages(false);
  }
  updateComposer();
  if (!sendLiveVoiceJoin()) {
    stopLiveVoice({ silent: true, localOnly: true });
    toast(t('Nie udało się dołączyć do kanału głosowego.'));
    return;
  }
  void startLiveVoiceCapture();
}

function stopLiveVoice({ silent = false, localOnly = false, reason = '' } = {}) {
  const call = liveVoice;
  if (!call) return;
  liveVoiceShareToken += 1;
  if (call.sharing) stopScreenCapture(call);
  liveVoice = null;
  if (!localOnly) {
    const socket = voiceSocket(call.serverId);
    if (socket) {
      try { socket.send(JSON.stringify({ type: 'voice:leave' })); } catch { /* ignore */ }
    }
  }
  stopLiveVoiceCapture(call);
  resetLiveVoiceScreen();
  closeScreenSharePicker();
  teardownLiveVoicePlayback();
  clearLiveVoiceSpeaking();
  if (activeServerId === call.serverId) renderSidebar();
  renderVoiceConnectedPanel();
  if (current.kind === 'server' && current.serverId === call.serverId && current.id === call.channelId) {
    renderHeader();
    renderMessages(false);
  }
  updateComposer();
  if (!silent) toast(reason || t('Rozłączono z kanałem głosowym.'));
}

function renderVoiceConnectedPanel() {
  const panel = $('voiceConnectPanel');
  if (!panel) return;
  if (!liveVoice) {
    panel.hidden = true;
    return;
  }
  const state = serverState(liveVoice.serverId);
  const channel = state?.channels.find((item) => item.id === liveVoice.channelId);
  if (!state || !channel) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  panel.classList.toggle('connecting', liveVoice.status === 'connecting');
  panel.classList.toggle('sharing', Boolean(liveVoice.sharing));
  const status = $('voiceConnectStatus');
  if (status) {
    status.textContent = liveVoice.status === 'connecting'
      ? t('Łączenie z kanałem głosowym…')
      : liveVoice.sharing
        ? t('Udostępniasz ekran')
        : t('Nawiązano połączenie');
  }
  const label = $('voiceConnectChannel');
  if (label) label.textContent = `${state.server.name} / ${channel.name}`;
  const shareButton = $('voiceConnectShare');
  if (shareButton) {
    const shareLabel = t(liveVoice.sharing ? 'Zakończ udostępnianie' : 'Udostępnij ekran');
    shareButton.classList.toggle('active', Boolean(liveVoice.sharing));
    shareButton.title = shareLabel;
    shareButton.setAttribute('aria-label', shareLabel);
  }
}

function voiceControlButton(action, icon, label, extraClass = '') {
  return `<button type="button" class="voice-ctrl${extraClass}" data-voice-action="${action}" title="${esc(label)}" aria-label="${esc(label)}">${icon}<span class="voice-ctrl-label">${esc(label)}</span></button>`;
}

function renderVoiceView(state, channel) {
  const view = $('voiceView');
  if (!view || !state || !channel) return;
  document.body.classList.add('voice-stage');
  const participants = voiceParticipants(state, channel.id);
  const connectedHere = liveVoiceConnectedHere(state.server.id, channel.id);
  const otherCall = liveVoice && !connectedHere
    ? voiceChannelFor(liveVoice.serverId, liveVoice.channelId)
    : null;
  $('voiceViewName').textContent = channel.name;

  let summary;
  if (connectedHere && liveVoice.status === 'connecting') {
    summary = t('Łączenie z kanałem głosowym…');
  } else if (participants.length === 1) {
    summary = t('1 osoba na kanale');
  } else if (participants.length > 1) {
    const count = participants.length;
    const mod10 = count % 10;
    const mod100 = count % 100;
    const few = mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14);
    summary = few
      ? t('{count} osoby na kanale', { count })
      : t('{count} osób na kanale', { count });
  } else {
    summary = t('Kanał jest pusty');
  }
  if (otherCall) summary = `${summary} • ${t('Jesteś na kanale {name}', { name: otherCall.name })}`;
  $('voiceViewSub').textContent = summary;

  const tiles = participants.map((participant) => {
    const speaking = liveVoiceSpeaking.get(participant.memberId)?.active;
    const self = participant.memberId === state.you?.memberId;
    const flags = [
      participant.sharing ? `<span class="voice-tile-flag sharing" title="${esc(t('Udostępnia ekran'))}" aria-label="${esc(t('Udostępnia ekran'))}">${VOICE_SVGS.screen}</span>` : '',
      participant.muted ? `<span class="voice-tile-flag" title="${esc(t('Mikrofon wyłączony'))}" aria-label="${esc(t('Mikrofon wyłączony'))}">${VOICE_SVGS.micOff}</span>` : '',
      participant.deafened ? `<span class="voice-tile-flag" title="${esc(t('Słuchawki wyłączone'))}" aria-label="${esc(t('Słuchawki wyłączone'))}">${VOICE_SVGS.headphonesOff}</span>` : '',
    ].join('');
    return `
      <button type="button" class="voice-tile${speaking ? ' speaking' : ''}${self ? ' self' : ''}" data-voice-member="${esc(participant.memberId)}" data-voice-profile-member="${esc(participant.memberId)}" style="--voice-color:${esc(participant.color)}" title="${esc(participant.name)}">
        <span class="voice-tile-avatar">${esc(initial(participant.name))}</span>
        <span class="voice-tile-name">${esc(participant.name)}${self ? ` <span class="voice-you-pill">${esc(t('Ty'))}</span>` : ''}</span>
        ${flags ? `<span class="voice-tile-flags">${flags}</span>` : ''}
      </button>
    `;
  }).join('');
  $('voiceViewTiles').innerHTML = tiles;
  $('voiceViewEmpty').hidden = participants.length > 0 || connectedHere;

  const muted = Boolean(prefs.micMuted);
  const deafened = Boolean(prefs.deafened);
  const sharing = Boolean(liveVoice?.sharing);
  let controls;
  if (connectedHere) {
    controls = [
      voiceControlButton('mic', muted ? VOICE_SVGS.micOff : VOICE_SVGS.mic, t(muted ? 'Włącz mikrofon' : 'Wycisz mikrofon'), muted ? ' muted' : ''),
      voiceControlButton('deafen', deafened ? VOICE_SVGS.headphonesOff : VOICE_SVGS.headphones, t(deafened ? 'Włącz dźwięk' : 'Wycisz dźwięk'), deafened ? ' muted' : ''),
      voiceControlButton('screen', sharing ? VOICE_SVGS.screenOff : VOICE_SVGS.screen, t(sharing ? 'Zakończ udostępnianie' : 'Udostępnij ekran'), sharing ? ' sharing' : ''),
      voiceControlButton('settings', VOICE_SVGS.settings, t('Ustawienia głosu')),
      voiceControlButton('invite', VOICE_SVGS.invite, t('Zaproś na kanał głosowy')),
      `<button type="button" class="voice-ctrl leave" data-voice-action="leave" title="${esc(t('Rozłącz'))}" aria-label="${esc(t('Rozłącz'))}">${VOICE_SVGS.phoneOff}<span class="voice-ctrl-label">${esc(t('Rozłącz'))}</span></button>`,
    ].join('');
  } else {
    const label = otherCall ? t('Przenieś się tutaj') : t('Dołącz do kanału głosowego');
    controls = [
      `<button type="button" class="voice-ctrl join" data-voice-action="join" title="${esc(label)}" aria-label="${esc(label)}">${VOICE_SVGS.voice}<span class="voice-ctrl-label">${esc(label)}</span></button>`,
      voiceControlButton('invite', VOICE_SVGS.invite, t('Zaproś na kanał głosowy')),
    ].join('');
  }
  $('voiceViewControls').innerHTML = controls;
  $('voiceViewInvite').hidden = state.status !== 'online';
  renderSpotifyPanel(state, channel);
  syncVoiceScreenView(state, channel);
}

function syncLiveVoiceButtons() {
  const mic = document.querySelector('#voiceViewControls [data-voice-action="mic"]');
  if (mic) {
    const muted = Boolean(prefs.micMuted);
    mic.classList.toggle('muted', muted);
    mic.innerHTML = `${muted ? VOICE_SVGS.micOff : VOICE_SVGS.mic}<span class="voice-ctrl-label">${esc(t(muted ? 'Włącz mikrofon' : 'Wycisz mikrofon'))}</span>`;
    mic.title = t(muted ? 'Włącz mikrofon' : 'Wycisz mikrofon');
    mic.setAttribute('aria-label', mic.title);
  }
  const deafen = document.querySelector('#voiceViewControls [data-voice-action="deafen"]');
  if (deafen) {
    const deafened = Boolean(prefs.deafened);
    deafen.classList.toggle('muted', deafened);
    deafen.innerHTML = `${deafened ? VOICE_SVGS.headphonesOff : VOICE_SVGS.headphones}<span class="voice-ctrl-label">${esc(t(deafened ? 'Włącz dźwięk' : 'Wycisz dźwięk'))}</span>`;
    deafen.title = t(deafened ? 'Włącz dźwięk' : 'Wycisz dźwięk');
    deafen.setAttribute('aria-label', deafen.title);
  }
  const screen = document.querySelector('#voiceViewControls [data-voice-action="screen"]');
  if (screen) {
    const sharing = Boolean(liveVoice?.sharing);
    screen.classList.toggle('sharing', sharing);
    screen.innerHTML = `${sharing ? VOICE_SVGS.screenOff : VOICE_SVGS.screen}<span class="voice-ctrl-label">${esc(t(sharing ? 'Zakończ udostępnianie' : 'Udostępnij ekran'))}</span>`;
    screen.title = t(sharing ? 'Zakończ udostępnianie' : 'Udostępnij ekran');
    screen.setAttribute('aria-label', screen.title);
  }
}

function openLiveVoiceChannel() {
  if (!liveVoice) return;
  const { serverId, channelId } = liveVoice;
  if (activeServerId !== serverId) selectServer(serverId);
  selectChannel(channelId);
}

function handleVoiceAction(action) {
  if (!action) return;
  if (action === 'mic') {
    setMicMuted(!prefs.micMuted);
    return;
  }
  if (action === 'deafen') {
    setDeafened(!prefs.deafened);
    return;
  }
  if (action === 'screen') {
    if (liveVoice?.sharing) stopScreenShare();
    else void openScreenSharePicker();
    return;
  }
  if (action === 'settings') {
    openSettings('voice');
    return;
  }
  if (action === 'invite') {
    const state = current.kind === 'server' ? serverState(current.serverId) : null;
    const channel = state?.channels.find((item) => item.id === current.id);
    if (channel) void openInviteModal(channel);
    return;
  }
  if (action === 'leave') {
    stopLiveVoice({ reason: t('Rozłączono z kanałem głosowym.') });
    return;
  }
  if (action === 'join' && current.kind === 'server') {
    joinLiveVoice(current.serverId, current.id);
  }
}

function bindLiveVoice() {
  bindSpotifyPanel();
  $('voiceConnectLeave')?.addEventListener('click', () => {
    stopLiveVoice({ reason: t('Rozłączono z kanałem głosowym.') });
  });
  $('voiceConnectOpen')?.addEventListener('click', openLiveVoiceChannel);
  $('voiceConnectInvite')?.addEventListener('click', () => {
    if (!liveVoice) return;
    const channel = voiceChannelFor(liveVoice.serverId, liveVoice.channelId);
    if (channel) void openInviteModal(channel);
  });
  $('voiceConnectSettings')?.addEventListener('click', () => openSettings('voice'));
  $('voiceConnectShare')?.addEventListener('click', () => {
    if (liveVoice?.sharing) stopScreenShare();
    else void openScreenSharePicker();
  });
  $('closeScreenShare')?.addEventListener('click', closeScreenSharePicker);
  $('screenShareOverlay')?.addEventListener('click', (event) => {
    if (event.target === $('screenShareOverlay')) closeScreenSharePicker();
  });
  $('screenShareRefresh')?.addEventListener('click', () => { void loadScreenShareSources(); });
  $('screenShareTabs')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-screen-tab]');
    if (!button) return;
    screenSharePicker.tab = button.dataset.screenTab === 'window' ? 'window' : 'screen';
    renderScreenSharePicker();
  });
  $('screenShareGrid')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-screen-source]');
    if (!button) return;
    void chooseScreenShareSource(button.dataset.screenSource);
  });
  $('voiceViewInvite')?.addEventListener('click', () => {
    if (current.kind !== 'server') return;
    const channel = serverState(current.serverId)?.channels.find((item) => item.id === current.id);
    if (channel) void openInviteModal(channel);
  });
  $('voiceViewControls')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-voice-action]');
    if (button) handleVoiceAction(button.dataset.voiceAction);
  });
  $('voiceViewTiles')?.addEventListener('click', (event) => {
    const tile = event.target.closest('[data-voice-profile-member]');
    if (!tile || current.kind !== 'server') return;
    const participant = voiceParticipants(serverState(current.serverId), current.id)
      .find((item) => item.memberId === tile.dataset.voiceProfileMember);
    openServerProfile(current.serverId, tile.dataset.voiceProfileMember, participant || {});
  });
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
        meta: member.owner ? t('Właściciel serwera') : member.online ? t('Online') : t('Offline'),
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
      meta: user.online ? statusLabel(user.status) : t('Offline'),
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
      return Number(bStarts) - Number(aStarts) || Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, prefs.lang === 'en' ? 'en' : 'pl');
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
  `).join('')}<div class="mention-foot">${t('↑ ↓ wybierz • Enter wstaw • Esc zamknij')}</div>`;
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
  $('attachBtn')?.addEventListener('click', () => $('attachmentInput')?.click());
  $('attachmentInput')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) setPendingAttachment(file);
  });
  $('composerAttachmentRemove')?.addEventListener('click', () => clearPendingAttachment());
  bindAttachmentDrop();
  input.addEventListener('input', () => {
    resizeInput();
    refreshComposerSendState();
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
    CHILL.chat.onActivity((data) => {
      const activity = normalizeActivity(data);
      const next = prefs.gameDetect ? activity.name : null;
      const nextIcon = next ? activity.icon : '';
      const nextPlatform = next ? activity.platform : '';
      const changed = next !== playing || nextIcon !== playingIcon || nextPlatform !== playingPlatform;
      if (next !== playing) playingSince = next ? Date.now() : null;
      playing = next;
      playingIcon = nextIcon;
      playingPlatform = nextPlatform;
      renderIdentity();
      if (!$('userProfileOverlay').hidden) renderUserProfile();
      if (changed) broadcastActivity();
    });
  }

  if (CHILL.chat?.onUpdateReady) {
    CHILL.chat.onUpdateReady((info) => showUpdate(info));
  }
  if (CHILL.chat?.onUpdateProgress) {
    CHILL.chat.onUpdateProgress((pct) => {
      if (!downloadingUpdate) return;
      $('updateProgress').style.width = `${pct}%`;
      $('updateText').textContent = t('Pobieranie aktualizacji — {pct}%', { pct });
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

function currentActivityState() {
  const active = prefs.gameDetect ? playing : null;
  return {
    playing: active || null,
    playingIcon: active ? playingIcon || null : null,
    playingPlatform: active ? playingPlatform || null : null,
    playingSince: active ? playingSince : null,
  };
}

function broadcastActivity() {
  const activity = currentActivityState();
  if (wsReady()) ws.send(JSON.stringify({ type: 'activity', ...activity }));
  for (const state of serverStates.values()) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ type: 'server:activity', ...activity }));
    }
  }
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
      handle: myProfileHandle,
      avatar: myAvatar,
      banner: myBanner,
      badges: myBadges,
      games: myGames,
      about: myAbout,
      ...currentActivityState(),
    }));
  };

  socket.onmessage = (event) => {
    if (ws !== socket) return;
    try { handleMessage(JSON.parse(event.data)); } catch { /* ignore */ }
  };

  socket.onclose = () => {
    if (ws !== socket) return;
    ws = null;
    localVoiceKey = '';
    if (current.kind === 'dm' && !String(current.id).startsWith('srv:')) {
      resetVoicePlayback();
      if (voiceSession) cancelVoiceRecording(true);
    }
    if (!currentUser) return;
    reconnectTimer = setTimeout(connect, 2500);
  };

  socket.onerror = () => {};
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'joined': {
      allUsers = Array.isArray(msg.users) ? msg.users : [];
      friendState = { friends: [], incoming: [], outgoing: [] };
      localVoiceKey = String(msg.voiceKey || '');
      for (const key of [...history.keys()]) {
        if (key.startsWith('dm:') && !key.startsWith('dm:srv:')) history.delete(key);
      }
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
        if (prefs.gameDetect && playing) ws.send(JSON.stringify({ type: 'activity', ...currentActivityState() }));
      }
      if (!$('userProfileOverlay').hidden) renderUserProfile();
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
      notifyIncoming(m, user?.name || t('Wiadomość prywatna'), current.kind === 'dm' && current.id === other);
      break;
    }

    case 'friends:state': {
      const before = new Set((friendState.incoming || []).map((item) => item.id));
      friendState = {
        friends: Array.isArray(msg.friends) ? msg.friends.filter((id) => typeof id === 'string') : [],
        incoming: Array.isArray(msg.incoming) ? msg.incoming.filter((item) => item && typeof item.id === 'string') : [],
        outgoing: Array.isArray(msg.outgoing) ? msg.outgoing.filter((item) => item && typeof item.id === 'string') : [],
      };
      const fresh = friendState.incoming.filter((item) => !before.has(item.id));
      if (fresh.length && document.visibilityState !== 'hidden') {
        const person = allUsers.find((user) => user.id === fresh[0].id);
        toast(t('Nowe zaproszenie do znajomych: {name}', { name: person?.name || t('Użytkownik') }));
      }
      renderDmList();
      renderMembers();
      if (current.kind === 'dm') renderHeader();
      if (!$('userProfileOverlay').hidden) renderUserProfile();
      break;
    }

    case 'friends:error': {
      toast(msg.message ? translateError(msg.message) : t('Nie udało się wysłać zaproszenia.'));
      break;
    }

    case 'dm:error': {
      toast(msg.message ? translateError(msg.message) : t('Nie można wysłać wiadomości.'));
      break;
    }

    case 'user:update':
    case 'users:list': {
      if (Array.isArray(msg.users)) {
        allUsers = msg.users;
        renderDmList();
        renderMembers();
        if (current.kind === 'dm') renderHeader();
        if (!$('userProfileOverlay').hidden) renderUserProfile();
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
        myAbout = currentUser.about || '';
        myProfileHandle = currentUser.handle || myProfileHandle;
        myAvatar = safeProfileAvatar(currentUser.avatar);
        myBanner = safeProfileBanner(currentUser.banner);
        myBadges = safeBadges(currentUser.badges);
        myGames = Array.isArray(currentUser.games) ? currentUser.games : [];
        renderIdentity();
        if (!$('settingsOverlay').hidden) fillProfileForm();
      }
      break;
    }

    case 'voice:token': {
      resolveVoiceToken(msg);
      break;
    }

    case 'auth-error': {
      toast(msg.message ? translateError(msg.message) : t('Sesja wygasła. Zaloguj się ponownie.'), 4000);
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
  let url;
  let protocol = 'chill:';
  try {
    if (/^https?:\/\//i.test(text)) {
      url = new URL(text);
      protocol = url.protocol;
    } else if (/^chill:\/\//i.test(text)) {
      url = new URL(text.replace(/^chill:\/\//i, 'http://'));
    } else {
      return null;
    }
  } catch {
    return null;
  }
  const host = url.hostname;
  const tlsParam = url.searchParams.get('tls') === '1' || url.searchParams.get('secure') === '1';
  const secure = protocol === 'https:' || tlsParam;
  const port = url.port || (secure ? '443' : (protocol === 'http:' ? '80' : '47830'));
  const pathCode = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, '')).split('/').filter(Boolean).pop() || '';
  const invite = String(url.searchParams.get('invite') || url.searchParams.get('code') || pathCode).trim().toUpperCase();
  const channelId = String(url.searchParams.get('channel') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  if (!host || !/^[a-zA-Z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.')) return null;
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) return null;
  if (!/^[A-Z0-9]{4,16}$/.test(invite)) return null;
  return {
    address: `${host}:${port}`,
    invite,
    channelId,
    secure,
    web: protocol === 'http:' || protocol === 'https:',
  };
}

const PENDING_INVITE_KEY = 'chill.pendingInvite';

window.addEventListener('chill:invite', (event) => {
  const raw = String(event.detail || '').trim();
  if (!raw) return;
  try { sessionStorage.setItem(PENDING_INVITE_KEY, raw); } catch { /* ignore */ }
  void consumePendingInvite();
});

function captureInviteFromLocation() {
  try {
    const url = new URL(location.href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
    const raw = url.searchParams.get('invite')
      || url.searchParams.get('code')
      || hashParams.get('invite')
      || hashParams.get('code')
      || '';
    if (!raw) return;
    const stored = /^https?:\/\//i.test(raw)
      ? raw
      : `${url.origin}/?invite=${encodeURIComponent(raw)}`;
    sessionStorage.setItem(PENDING_INVITE_KEY, stored);
    url.searchParams.delete('invite');
    url.searchParams.delete('code');
    hashParams.delete('invite');
    hashParams.delete('code');
    url.hash = hashParams.toString();
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  } catch { /* ignore */ }
}

async function consumePendingInvite() {
  if (!currentUser) return;
  let raw = '';
  try { raw = sessionStorage.getItem(PENDING_INVITE_KEY) || ''; } catch { /* ignore */ }
  if (!raw) return;
  try { sessionStorage.removeItem(PENDING_INVITE_KEY); } catch { /* ignore */ }
  const result = await joinServerInvite(raw, { silent: true });
  if (!result?.ok) {
    toast(result?.error || t('Nie udało się dołączyć do serwera z linku.'));
    return;
  }
  if (result.known) toast(t('Już należysz do tego serwera'));
  else if (result.server) toast(t('Dołączono do „{name}”', { name: result.server.name }));
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
    socket = new WebSocket(`${server.secure ? 'wss' : 'ws'}://${server.address}/chat`);
  } catch {
    state.status = 'offline';
    state.error = t('Nieprawidłowy adres serwera.');
    renderServers();
    return;
  }
  state.ws = socket;
  socket.binaryType = 'arraybuffer';

  socket.onopen = () => {
    if (state.ws !== socket) return;
    const memberId = server.owner ? myId : server.memberId;
    socket.send(JSON.stringify({
      type: 'join-server',
      invite: server.invite,
      memberId,
      name: myName,
      color: myColor,
      handle: myProfileHandle,
      avatar: myAvatar,
      banner: myBanner,
      badges: myBadges,
      games: myGames,
      about: myAbout,
      ...currentActivityState(),
      ownerKey: server.owner ? server.ownerKey : undefined,
    }));
  };

  socket.onmessage = (event) => {
    if (state.ws !== socket) return;
    if (typeof event.data !== 'string') {
      if (event.data instanceof ArrayBuffer) {
        const kind = event.data.byteLength ? new Uint8Array(event.data, 0, 1)[0] : 0;
        if (kind === 2) handleLiveVoiceScreen(server.id, event.data);
        else handleLiveVoiceAudio(server.id, event.data);
      }
      return;
    }
    try {
      handleServerFrame(server.id, JSON.parse(event.data));
    } catch { /* ignore */ }
  };

  socket.onclose = () => {
    if (state.ws !== socket) return;
    state.ws = null;
    state.voiceKey = '';
    if (liveVoice?.serverId === server.id) stopLiveVoice({ silent: true, localOnly: true });
    if ((current.kind === 'server' && current.serverId === server.id)
      || (current.kind === 'dm' && String(current.id).startsWith(`srv:${server.id}:`))) {
      resetVoicePlayback();
    }
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
      state.voiceKey = String(msg.voiceKey || '');
      state.voiceRooms = new Map();
      for (const room of Array.isArray(msg.voice) ? msg.voice : []) {
        const channelId = String(room?.channelId || '');
        if (!channelId) continue;
        const participants = (Array.isArray(room.participants) ? room.participants : [])
          .map(normalizeVoiceParticipant)
          .filter(Boolean);
        if (participants.length) state.voiceRooms.set(channelId, participants);
      }
      state.spotifyRooms = new Map();
      for (const room of Array.isArray(msg.spotify) ? msg.spotify : []) {
        const channelId = String(room?.channelId || '');
        if (channelId && room?.state?.embed) state.spotifyRooms.set(channelId, room.state);
      }
      state.channels = (Array.isArray(msg.server?.channels) ? msg.server.channels : []).map((channel) => ({
        ...channel,
        type: channel.type === 'voice' ? 'voice' : 'text',
      }));
      state.members = Array.isArray(msg.members) ? msg.members : [];
      if (msg.server) {
        state.server = {
          ...state.server,
          id: msg.server.id || state.server.id,
          name: msg.server.name || state.server.name,
          icon: msg.server.icon || '',
          color: msg.server.color || state.server.color,
          invite: msg.server.invite || state.server.invite,
          tag: normalizeServerTag(msg.server.tag || state.server.tag),
          banner: normalizeServerBannerId(msg.server.banner || state.server.banner),
          description: String(msg.server.description || '').slice(0, SERVER_DESCRIPTION_LENGTH),
          traits: normalizeServerTextList(msg.server.traits || [], SERVER_TRAIT_LIMIT, SERVER_TRAIT_LENGTH),
          games: normalizeServerTextList(msg.server.games || [], SERVER_GAME_LIMIT, SERVER_GAME_LENGTH),
          ownerId: msg.server.ownerId,
          owner: Boolean(state.you?.owner),
        };
        const entry = servers.find((item) => item.id === serverId);
        if (entry) Object.assign(entry, {
          name: state.server.name,
          icon: state.server.icon,
          color: state.server.color,
          invite: state.server.invite,
          tag: state.server.tag,
          banner: state.server.banner,
          description: state.server.description,
          traits: state.server.traits,
          games: state.server.games,
          owner: state.server.owner,
        });
      }

      for (const key of [...history.keys()]) {
        if (key.startsWith(`server:${serverId}:`)) history.delete(key);
      }
      for (const [channelId, list] of Object.entries(msg.messages || {})) {
        history.set(`server:${serverId}:${channelId}`, Array.isArray(list) ? list.slice(-300) : []);
      }

      const dmPrefix = `dm:${serverFriendId(serverId, '')}`;
      for (const key of [...history.keys()]) {
        if (key.startsWith(dmPrefix)) history.delete(key);
      }
      for (const [key, list] of Object.entries(msg.dms || {})) {
        const parts = String(key).split('|');
        const other = parts.length === 2 ? parts.find((part) => part !== state.you?.memberId) : null;
        const messages = Array.isArray(list) ? list.slice(-300) : [];
        if (!other) continue;
        const dmId = serverFriendId(serverId, other);
        history.set(`dm:${dmId}`, messages);
        const member = state.members.find((item) => item.id === other);
        const inbound = messages.find((item) => item?.authorId === other);
        if (member) upsertServerFriend(serverId, member);
        else if (inbound) upsertServerFriend(serverId, { id: other, name: inbound.authorName, color: inbound.authorColor });
      }

      if (activeServerId === serverId) {
        const pendingChannel = String(state.pendingChannelId || '');
        state.pendingChannelId = '';
        if (pendingChannel && state.channels.some((channel) => channel.id === pendingChannel)) {
          current = { kind: 'server', serverId, id: pendingChannel };
        } else if (!state.channels.some((channel) => channel.id === current.id)) {
          current = { kind: 'server', serverId, id: state.channels[0]?.id || '' };
        }
        state.lastChannelId = current.id || state.lastChannelId;
        renderSidebar();
        renderHeader();
        renderMessages(false);
        renderMembers();
        updateComposer();
      } else if (!activeServerId) {
        renderDmList();
      }
      renderServers();
      updateBadges();
      break;
    }

    case 'voice:joined': {
      const channelId = String(msg.channelId || '');
      if (!liveVoice || liveVoice.serverId !== serverId || liveVoice.channelId !== channelId) return;
      liveVoice.status = 'connected';
      const participants = (Array.isArray(msg.participants) ? msg.participants : [])
        .map(normalizeVoiceParticipant)
        .filter(Boolean);
      if (participants.length) state.voiceRooms.set(channelId, participants);
      if (msg.spotify?.embed) state.spotifyRooms.set(channelId, msg.spotify);
      else if (msg.spotify === null) state.spotifyRooms.delete(channelId);
      if (activeServerId === serverId) {
        renderChannels();
        if (current.kind === 'server' && current.serverId === serverId && current.id === channelId) {
          renderHeader();
          renderMessages(false);
        }
      }
      renderVoiceConnectedPanel();
      break;
    }

    case 'server:spotify': {
      const channelId = String(msg.channelId || '');
      if (!channelId) break;
      if (msg.state?.embed) state.spotifyRooms.set(channelId, msg.state);
      else state.spotifyRooms.delete(channelId);
      if (current.kind === 'server' && current.serverId === serverId && current.id === channelId) {
        const channel = state.channels.find((item) => item.id === channelId);
        renderSpotifyPanel(state, channel);
      }
      break;
    }

    case 'voice:token': {
      resolveVoiceToken(msg);
      break;
    }

    case 'spotify:error': {
      toast(msg.message ? translateError(msg.message) : t('Nieprawidłowy link Spotify.'));
      break;
    }

    case 'voice:share-denied': {
      if (!liveVoice || liveVoice.serverId !== serverId) return;
      stopScreenShare({ silent: true, localOnly: true });
      toast(t('Ktoś już udostępnia ekran na tym kanale.'));
      break;
    }

    case 'server:info': {
      const info = msg.server;
      if (!info || info.id !== serverId) break;
      state.server = {
        ...state.server,
        name: info.name || state.server.name,
        icon: typeof info.icon === 'string' ? info.icon : state.server.icon,
        color: info.color || state.server.color,
        tag: normalizeServerTag(info.tag),
        banner: normalizeServerBannerId(info.banner || state.server.banner),
        description: String(info.description ?? state.server.description ?? '').slice(0, SERVER_DESCRIPTION_LENGTH),
        traits: normalizeServerTextList(info.traits || state.server.traits || [], SERVER_TRAIT_LIMIT, SERVER_TRAIT_LENGTH),
        games: normalizeServerTextList(info.games || state.server.games || [], SERVER_GAME_LIMIT, SERVER_GAME_LENGTH),
        invite: info.invite || state.server.invite,
        createdAt: Number(info.createdAt) || state.server.createdAt,
        owner: Boolean(state.you?.owner),
      };
      const entry = servers.find((item) => item.id === serverId);
      if (entry) Object.assign(entry, {
        name: state.server.name,
        icon: state.server.icon,
        color: state.server.color,
        invite: state.server.invite,
        tag: state.server.tag,
        banner: state.server.banner,
        description: state.server.description,
        traits: state.server.traits,
        games: state.server.games,
      });
      if (activeServerId === serverId) {
        renderSidebar();
        renderHeader();
      }
      renderServers();
      if (!$('serverSettingsOverlay').hidden) {
        $('saveServerSettings').disabled = false;
        if (msg.actorId === state.you?.memberId) {
          closeServerSettings();
          toast(t('Ustawienia serwera zostały zapisane.'));
        } else {
          populateServerSettings(state);
        }
      }
      break;
    }

    case 'server:members': {
      state.members = Array.isArray(msg.members) ? msg.members : [];
      syncServerFriends(serverId);
      if (activeServerId === serverId) {
        renderMembers();
        renderHeader();
      }
      renderDmList();
      if (current.kind === 'dm' && current.id.startsWith(`srv:${serverId}:`)) {
        renderHeader();
        updateComposer();
      }
      if (!$('userProfileOverlay').hidden) renderUserProfile();
      break;
    }

    case 'server:voice': {
      const channelId = String(msg.channelId || '');
      if (!channelId) return;
      const participants = (Array.isArray(msg.participants) ? msg.participants : [])
        .map(normalizeVoiceParticipant)
        .filter(Boolean);
      if (participants.length) state.voiceRooms.set(channelId, participants);
      else state.voiceRooms.delete(channelId);
      if (liveVoice && liveVoice.serverId === serverId && liveVoice.channelId === channelId) {
        const selfId = state.you?.memberId;
        if (selfId && !participants.some((participant) => participant.memberId === selfId)) {
          stopLiveVoice({ silent: true });
        } else if (liveVoice.status === 'connecting' && selfId) {
          liveVoice.status = 'connected';
        }
      }
      if (activeServerId === serverId) {
        renderChannels();
        if (current.kind === 'server' && current.serverId === serverId && current.id === channelId) {
          renderHeader();
          renderMessages(false);
        }
      }
      renderVoiceConnectedPanel();
      break;
    }

    case 'server:channels': {
      state.channels = (Array.isArray(msg.channels) ? msg.channels : []).map((channel) => ({
        ...channel,
        type: channel.type === 'voice' ? 'voice' : 'text',
      }));
      if (activeServerId === serverId) {
        if (current.kind === 'server' && !state.channels.some((channel) => channel.id === current.id)) {
          current = { kind: 'server', serverId, id: state.channels[0]?.id || '' };
          state.lastChannelId = current.id || null;
        }
        if (menuChannelId && !state.channels.some((channel) => channel.id === menuChannelId)) closeChannelMenu();
        renderSidebar();
        renderHeader();
        renderMessages(false);
        renderMembers();
        updateComposer();
      }
      break;
    }

    case 'server:channel:created': {
      const channel = msg.channel;
      if (!channel?.id) break;
      const normalized = { ...channel, type: channel.type === 'voice' ? 'voice' : 'text' };
      if (!state.channels.some((item) => item.id === normalized.id)) state.channels.push(normalized);
      closeChannelModal();
      if (activeServerId === serverId) {
        selectChannel(normalized.id);
        toast(t('Kanał „{name}” utworzony.', { name: normalized.name }));
      }
      break;
    }

    case 'server:channel:renamed': {
      const channel = msg.channel;
      if (!channel?.id) break;
      const normalized = { ...channel, type: channel.type === 'voice' ? 'voice' : 'text' };
      const index = state.channels.findIndex((item) => item.id === normalized.id);
      if (index >= 0) state.channels[index] = { ...state.channels[index], ...normalized };
      else state.channels.push(normalized);
      if (editingChannelId === normalized.id) closeChannelModal();
      if (msg.actorId === state.you?.memberId) {
        toast(t('Nazwa kanału „{name}” została zmieniona.', { name: normalized.name }));
      }
      break;
    }

    case 'server:channel:duplicated': {
      const channel = msg.channel;
      if (!channel?.id) break;
      const normalized = { ...channel, type: channel.type === 'voice' ? 'voice' : 'text' };
      if (!state.channels.some((item) => item.id === normalized.id)) state.channels.push(normalized);
      history.set(`server:${serverId}:${normalized.id}`, Array.isArray(msg.messages) ? msg.messages.slice(-300) : []);
      if (msg.actorId === state.you?.memberId) {
        toast(t('Kanał „{name}” został powielony.', { name: normalized.name }));
        if (activeServerId === serverId) selectChannel(normalized.id);
      }
      break;
    }

    case 'server:channel:moved': {
      if (msg.actorId === state.you?.memberId) {
        toast(t('Kanał „{name}” został przeniesiony.', { name: msg.name || '' }));
      }
      break;
    }

    case 'server:channel:deleted': {
      if (msg.actorId === state.you?.memberId) {
        toast(t('Kanał „{name}” został usunięty.', { name: msg.name || '' }));
      }
      if (deleteChannelId === msg.channelId) {
        pendingChannelDelete = false;
        deleteChannelId = null;
        $('channelDeleteOverlay').hidden = true;
        $('confirmDeleteChannel').disabled = false;
      }
      if (menuChannelId === msg.channelId) closeChannelMenu();
      if (liveVoice?.serverId === serverId && liveVoice.channelId === msg.channelId) {
        stopLiveVoice({ silent: true });
        toast(t('Kanał głosowy został usunięty.'));
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
        notifyIncoming(
          message,
          channel ? `#${channel.name} • ${state.server.name}` : state.server.name,
          active,
          { serverId, channelId: message.channelId },
        );
      }
      break;
    }

    case 'server:dm': {
      const message = msg.message;
      if (!message || !message.authorId) return;
      if (message.authorId === state.you?.memberId) return;
      const other = String(message.authorId);
      const dmId = serverFriendId(serverId, other);
      const key = `dm:${dmId}`;
      pushHistory(key, message);
      const member = state.members.find((item) => item.id === other);
      upsertServerFriend(serverId, member || {
        id: other,
        name: message.authorName,
        color: message.authorColor,
      });
      const active = current.kind === 'dm' && current.id === dmId;
      if (active) {
        if (!searchQuery) renderMessages(false);
        scrollBottom();
        renderHeader();
        updateBadges();
      } else {
        bumpUnread(key);
        renderSidebar();
        updateBadges();
      }
      notifyIncoming(message, `${state.server.name} • ${t('wiadomość prywatna')}`, active);
      break;
    }

    case 'server:dm:typing': {
      const from = String(msg.from || '');
      if (!from || from === state.you?.memberId) return;
      const dmId = serverFriendId(serverId, from);
      if (current.kind !== 'dm' || current.id !== dmId) return;
      if (msg.typing) {
        clearTimeout(typingUsers.get(from)?._timer);
        const entry = { name: msg.name || t('Znajomy'), until: Date.now() + 1800 };
        entry._timer = setTimeout(() => {
          typingUsers.delete(from);
          renderTyping();
        }, 1800);
        typingUsers.set(from, entry);
      } else {
        clearTimeout(typingUsers.get(from)?._timer);
        typingUsers.delete(from);
      }
      renderTyping();
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
      state.error = translateError(msg.message || 'Wystąpił błąd serwera.');
      toast(state.error);
      if (msg.code === 'voice-channel' && liveVoice?.serverId === serverId) {
        stopLiveVoice({ silent: true });
      }
      if (!$('channelOverlay').hidden && ['invalid-channel', 'channel-exists', 'forbidden', 'voice-channel'].includes(msg.code)) {
        $('channelError').textContent = state.error;
        $('createChannelBtn').disabled = false;
      }
      if (!$('channelDeleteOverlay').hidden && ['invalid-channel', 'forbidden'].includes(msg.code)) {
        pendingChannelDelete = false;
        $('confirmDeleteChannel').disabled = false;
      }
      if (!$('serverSettingsOverlay').hidden && ['invalid-name', 'forbidden'].includes(msg.code)) {
        $('serverSettingsError').textContent = state.error;
        $('saveServerSettings').disabled = false;
      }
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
      if (!owned) toast(t('Serwer został usunięty przez właściciela.'));
      break;
    }
  }
}

function removeServerLocally(serverId) {
  if (liveVoice?.serverId === serverId) stopLiveVoice({ silent: true, localOnly: true });
  const state = serverState(serverId);
  if (state) {
    clearTimeout(state.reconnectTimer);
    if (state.ws) {
      state.ws.onclose = null;
      try { state.ws.close(); } catch { /* ignore */ }
    }
  }
  if ((current.kind === 'server' && current.serverId === serverId)
    || (current.kind === 'dm' && String(current.id).startsWith(`srv:${serverId}:`))) {
    resetVoiceSession();
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
      socket = new WebSocket(`${parsed.secure ? 'wss' : 'ws'}://${parsed.address}/chat`);
    } catch {
      reject(new Error(t('Nieprawidłowy adres serwera.')));
      return;
    }
    timer = setTimeout(() => finish(reject, new Error(t('Serwer nie odpowiada. Sprawdź adres i spróbuj ponownie.'))), 15_000);
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
        else if (msg.type === 'server:error') finish(reject, new Error(translateError(msg.message || 'Nie udało się dołączyć do serwera.')));
        else if (msg.type === 'auth-error') finish(reject, new Error(translateError(msg.message || 'Sesja wygasła. Zaloguj się ponownie.')));
      } catch { /* ignore */ }
    };
    socket.onerror = () => finish(reject, new Error(t('Nie można połączyć się z serwerem.')));
    socket.onclose = () => finish(reject, new Error(t('Serwer przerwał połączenie.')));
  });
}

function bindServers() {
  $('homeBtn').addEventListener('click', selectHome);
  $('addServerBtn').addEventListener('click', () => openServerModal('create'));
  $('closeServerModal').addEventListener('click', closeServerModal);
  $('serverOverlay').addEventListener('click', (e) => {
    if (e.target === $('serverOverlay')) closeServerModal();
  });

  // Menu serwera
  $('serverBanner').addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleServerMenu();
  });
  $('serverBanner').addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openServerMenu();
  });
  $('serverMenu').addEventListener('click', (event) => {
    event.stopPropagation();
    const button = event.target.closest('[data-server-action]');
    if (button) handleServerAction(button.dataset.serverAction);
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest('#serverMenu') || event.target.closest('#serverBanner')) return;
    closeServerMenu();
  });
  document.addEventListener('keydown', (event) => {
    const menu = $('serverMenu');
    if (!menu || menu.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeServerMenu();
      $('serverBanner').focus({ preventScroll: true });
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = [...menu.querySelectorAll('button:not([disabled])')].filter((item) => item.offsetParent !== null);
      if (!items.length) return;
      const index = items.indexOf(document.activeElement);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    }
  });
  window.addEventListener('resize', closeServerMenu);
  document.addEventListener('scroll', (event) => {
    const menu = $('serverMenu');
    if (menu && (event.target === menu || menu.contains(event.target))) return;
    closeServerMenu();
  }, true);

  // Ustawienia serwera
  $('closeServerSettings').addEventListener('click', closeServerSettings);
  $('cancelServerSettings').addEventListener('click', closeServerSettings);
  $('serverSettingsOverlay').addEventListener('click', (event) => {
    if (event.target === $('serverSettingsOverlay')) closeServerSettings();
  });
  $('serverSettingsColors').addEventListener('click', (event) => {
    const button = event.target.closest('[data-server-color]');
    if (!button) return;
    serverSettingsColor = button.dataset.serverColor;
    markColorSelection($('serverSettingsColors'), serverSettingsColor);
    updateServerSettingsPreview();
  });
  ['serverSettingsName', 'serverSettingsTag'].forEach((id) => {
    $(id).addEventListener('input', updateServerSettingsPreview);
  });
  $('serverSettingsDescription').addEventListener('input', updateServerSettingsDescriptionCount);
  $('serverSettingsName').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveServerSettings();
    }
  });
  $('saveServerSettings').addEventListener('click', saveServerSettings);

  $('serverSettingsBanners').addEventListener('click', (event) => {
    const button = event.target.closest('[data-server-banner]');
    if (!button) return;
    serverSettingsBanner = normalizeServerBannerId(button.dataset.serverBanner);
    renderServerSettingsBanners();
    updateServerSettingsPreview();
  });

  $('serverSettingsChangeIcon').addEventListener('click', () => {
    const picker = $('serverSettingsIconPicker');
    picker.hidden = !picker.hidden;
    if (picker.hidden) return;
    renderServerSettingsIconChoices();
    renderServerSettingsIconState();
  });
  $('serverSettingsClearIcon').addEventListener('click', () => {
    serverSettingsIconValue = '';
    $('serverSettingsIcon').value = '';
    $('serverSettingsIconPicker').hidden = true;
    renderServerSettingsIconState();
    updateServerSettingsPreview();
  });
  $('serverSettingsIconChoices').addEventListener('click', (event) => {
    const button = event.target.closest('[data-server-icon]');
    if (!button) return;
    serverSettingsIconValue = button.dataset.serverIcon;
    $('serverSettingsIcon').value = serverSettingsIconValue;
    $('serverSettingsIconPicker').hidden = true;
    renderServerSettingsIconState();
    updateServerSettingsPreview();
  });

  $('serverSettingsAddTrait').addEventListener('click', addServerSettingsTrait);
  $('serverSettingsTraitInput').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addServerSettingsTrait();
  });
  $('serverSettingsTraits').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-trait]');
    if (!button) return;
    const index = Number(button.dataset.removeTrait);
    if (!Number.isInteger(index) || index < 0) return;
    serverSettingsTraits.splice(index, 1);
    renderServerSettingsTraits();
    updateServerSettingsPreview();
  });

  $('serverSettingsGameSearch').addEventListener('input', renderServerSettingsGameMenu);
  $('serverSettingsGameSearch').addEventListener('focus', renderServerSettingsGameMenu);
  $('serverSettingsGameSearch').addEventListener('click', renderServerSettingsGameMenu);
  $('serverSettingsGameSearch').addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      $('serverSettingsGameMenu').hidden = true;
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const option = $('serverSettingsGameMenu').querySelector('[data-game-option]');
    if (option) {
      addServerSettingsGame(option.dataset.gameOption);
      return;
    }
    const query = $('serverSettingsGameSearch').value.replace(/\s+/g, ' ').trim();
    if (query) addServerSettingsGame(query);
  });
  $('serverSettingsGameMenu').addEventListener('mousedown', (event) => event.preventDefault());
  $('serverSettingsGameMenu').addEventListener('click', (event) => {
    const button = event.target.closest('[data-game-option]');
    if (button) addServerSettingsGame(button.dataset.gameOption);
  });
  $('serverSettingsGames').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-game]');
    if (!button) return;
    const index = Number(button.dataset.removeGame);
    if (!Number.isInteger(index) || index < 0) return;
    serverSettingsGames.splice(index, 1);
    renderServerSettingsGames();
    updateServerSettingsPreview();
  });

  $('serverSettingsNav').addEventListener('click', (event) => {
    const button = event.target.closest('[data-server-nav]');
    if (button) handleServerSettingsNav(button.dataset.serverNav);
  });

  $('serverSettingsScroll').addEventListener('click', (event) => {
    if (!event.target.closest('#serverSettingsIconPicker') && !event.target.closest('#serverSettingsChangeIcon')) {
      $('serverSettingsIconPicker').hidden = true;
    }
    if (!event.target.closest('.server-game-picker')) {
      $('serverSettingsGameMenu').hidden = true;
    }
  });

  // Wgląd w serwer
  $('closeServerInsight').addEventListener('click', closeServerInsights);
  $('closeServerInsightBtn').addEventListener('click', closeServerInsights);
  $('serverInsightOverlay').addEventListener('click', (event) => {
    if (event.target === $('serverInsightOverlay')) closeServerInsights();
  });

  // Profil serwerowy
  $('closeServerProfile').addEventListener('click', closeServerProfileEditor);
  $('cancelServerProfile').addEventListener('click', closeServerProfileEditor);
  $('serverProfileOverlay').addEventListener('click', (event) => {
    if (event.target === $('serverProfileOverlay')) closeServerProfileEditor();
  });
  $('serverProfileColors').addEventListener('click', (event) => {
    const button = event.target.closest('[data-color]');
    if (!button) return;
    serverProfileColor = button.dataset.color;
    markColorSelection($('serverProfileColors'), serverProfileColor);
    updateServerProfilePreview();
  });
  $('serverProfileName').addEventListener('input', updateServerProfilePreview);
  $('serverProfileName').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveServerProfile();
    }
  });
  $('saveServerProfile').addEventListener('click', saveServerProfile);

  // Opuszczanie serwera z menu
  $('closeLeaveServer').addEventListener('click', closeLeaveServerConfirm);
  $('cancelLeaveServer').addEventListener('click', closeLeaveServerConfirm);
  $('leaveServerOverlay').addEventListener('click', (event) => {
    if (event.target === $('leaveServerOverlay')) closeLeaveServerConfirm();
  });
  $('confirmLeaveServer').addEventListener('click', confirmLeaveServerFromMenu);

  document.querySelectorAll('[data-server-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.serverTab;
      if (target === 'discord') void initDiscordPanel();
      switchServerTab(target);
    });
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

  // Import z Discord
  $('openDiscordPortal').addEventListener('click', () => {
    CHILL.app?.openExternal?.('https://discord.com/developers/applications');
  });
  $('copyDiscordRedirect').addEventListener('click', () => {
    copyText($('discordRedirectUri').textContent).then(() => {
      toast(t('Skopiowano'));
    }).catch(() => toast(t('Nie udało się skopiować linku.')));
  });
  $('discordSaveConfigBtn').addEventListener('click', saveDiscordConfig);
  $('discordClientId').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveDiscordConfig();
    }
  });
  $('discordConnectBtn').addEventListener('click', connectDiscord);
  $('discordDisconnectBtn').addEventListener('click', disconnectDiscord);
  $('discordChangeConfig').addEventListener('click', () => {
    discordEditingConfig = true;
    $('discordClientId').value = discordConfig.clientId;
    renderDiscordPanel();
    setTimeout(() => $('discordClientId').focus(), 30);
  });
  $('discordSetupCancel').addEventListener('click', () => {
    discordEditingConfig = false;
    setDiscordSetupError('');
    renderDiscordPanel();
  });
  $('discordGuildSelect').addEventListener('change', () => {
    clearDiscordPreview();
    setDiscordImportError('');
  });
  $('discordTemplate').addEventListener('input', () => {
    clearDiscordPreview();
    setDiscordImportError('');
    updateDiscordActionState();
  });
  $('discordTemplate').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      previewDiscordImport();
    }
  });
  $('discordPreviewBtn').addEventListener('click', previewDiscordImport);
  $('discordImportBtn').addEventListener('click', importDiscordServer);

  $('inviteBtn').addEventListener('click', () => { void openInviteModal(); });
  $('closeInviteModal').addEventListener('click', () => {
    inviteRequestSeq += 1;
    $('inviteOverlay').hidden = true;
  });
  $('inviteOverlay').addEventListener('click', (e) => {
    if (e.target === $('inviteOverlay')) {
      inviteRequestSeq += 1;
      $('inviteOverlay').hidden = true;
    }
  });
  $('copyInviteBtn').addEventListener('click', () => {
    copyText($('inviteLink').textContent).then(() => {
      $('inviteSaved').textContent = t('Skopiowano');
      setTimeout(() => { $('inviteSaved').textContent = ''; }, 2500);
    }).catch(() => toast(t('Nie udało się skopiować linku.')));
  });
  $('copyInviteAppBtn')?.addEventListener('click', () => {
    const value = $('inviteAppLink')?.textContent || '';
    if (!value || value === 'chill://…') return;
    copyText(value).then(() => {
      $('inviteSaved').textContent = t('Skopiowano');
      setTimeout(() => { $('inviteSaved').textContent = ''; }, 2500);
    }).catch(() => toast(t('Nie udało się skopiować linku.')));
  });
  $('openInviteAppBtn')?.addEventListener('click', () => {
    const value = $('inviteAppLink')?.textContent || '';
    if (!value || value === 'chill://…') return;
    if (CHILL.web) {
      window.location.href = value;
    } else if (CHILL.app?.openExternal) {
      CHILL.app.openExternal(value);
    } else {
      window.location.href = value;
    }
  });
  $('retryInviteTunnel').addEventListener('click', () => { void openInviteModal(inviteChannel); });
  $('leaveServerBtn').addEventListener('click', leaveActiveServer);

  // Kanały — tworzenie (tylko właściciel)
  $('addChannelBtn').addEventListener('click', openChannelModal);
  $('closeChannelModal').addEventListener('click', closeChannelModal);
  $('cancelChannelBtn').addEventListener('click', closeChannelModal);
  $('channelOverlay').addEventListener('click', (e) => {
    if (e.target === $('channelOverlay')) closeChannelModal();
  });
  $('channelTypeChoices').addEventListener('click', (e) => {
    const button = e.target.closest('[data-channel-type]');
    if (!button) return;
    selectChannelType(button.dataset.channelType);
  });
  $('createChannelBtn').addEventListener('click', createChannelFromModal);
  $('newChannelName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      createChannelFromModal();
    }
  });

  // Menu kontekstowe kanału
  $('channelMenu').addEventListener('click', (event) => {
    event.stopPropagation();
    const submenu = event.target.closest('[data-submenu]');
    if (submenu) {
      toggleChannelSubmenu(submenu.dataset.submenu);
      return;
    }
    const notifyOption = event.target.closest('[data-notify-level]');
    if (notifyOption) {
      setChannelNotifyLevel(notifyOption.dataset.notifyLevel);
      return;
    }
    const moveOption = event.target.closest('[data-move-target]');
    if (moveOption) {
      moveChannelTo(moveOption.dataset.moveTarget);
      return;
    }
    const action = event.target.closest('[data-channel-action]');
    if (action) handleChannelAction(action.dataset.channelAction);
  });
  document.addEventListener('click', closeChannelMenu);
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('#channelMenu')) closeChannelMenu();
  });
  document.addEventListener('keydown', (event) => {
    const menu = $('channelMenu');
    if (menu.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeChannelMenu();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = [...menu.querySelectorAll('button:not([disabled])')].filter((item) => item.offsetParent !== null);
      if (!items.length) return;
      const index = items.indexOf(document.activeElement);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    }
  });
  window.addEventListener('resize', closeChannelMenu);
  document.addEventListener('scroll', closeChannelMenu, true);

  // Potwierdzenie usunięcia kanału
  $('closeChannelDelete').addEventListener('click', closeChannelDelete);
  $('cancelDeleteChannel').addEventListener('click', closeChannelDelete);
  $('channelDeleteOverlay').addEventListener('click', (e) => {
    if (e.target === $('channelDeleteOverlay')) closeChannelDelete();
  });
  $('confirmDeleteChannel').addEventListener('click', confirmDeleteChannel);
}

function canManageChannels() {
  const state = serverState(activeServerId);
  return Boolean(state && state.status === 'online' && state.you?.owner && state.ws && state.ws.readyState === WebSocket.OPEN);
}

function openChannelModal() {
  if (!canManageChannels()) return;
  editingChannelId = null;
  channelType = 'text';
  selectChannelType(channelType);
  if ($('channelModalTitle')) $('channelModalTitle').textContent = t('Nowy kanał');
  if ($('channelModalLead')) $('channelModalLead').textContent = t('Wybierz typ kanału i nadaj mu nazwę.');
  if ($('channelTypeField')) $('channelTypeField').hidden = false;
  $('newChannelName').value = '';
  $('channelError').textContent = '';
  $('createChannelBtn').textContent = t('Stwórz');
  $('createChannelBtn').disabled = false;
  $('channelOverlay').hidden = false;
  setTimeout(() => $('newChannelName').focus(), 40);
}

function openChannelEdit(channel) {
  if (!channel || !canManageChannels()) return;
  editingChannelId = channel.id;
  channelType = channel.type === 'voice' ? 'voice' : 'text';
  selectChannelType(channelType);
  if ($('channelModalTitle')) $('channelModalTitle').textContent = t('Edytuj kanał');
  if ($('channelModalLead')) $('channelModalLead').textContent = t('Zmień nazwę kanału. Historia wiadomości pozostanie bez zmian.');
  if ($('channelTypeField')) $('channelTypeField').hidden = true;
  $('newChannelName').value = channel.name;
  $('channelError').textContent = '';
  $('createChannelBtn').textContent = t('Zapisz');
  $('createChannelBtn').disabled = false;
  $('channelOverlay').hidden = false;
  setTimeout(() => {
    $('newChannelName').focus();
    $('newChannelName').select();
  }, 40);
}

function closeChannelModal() {
  editingChannelId = null;
  $('channelOverlay').hidden = true;
  $('newChannelName').value = '';
  $('channelError').textContent = '';
  $('createChannelBtn').disabled = false;
}

function selectChannelType(type) {
  channelType = type === 'voice' ? 'voice' : 'text';
  document.querySelectorAll('#channelTypeChoices [data-channel-type]').forEach((button) => {
    button.classList.toggle('active', button.dataset.channelType === channelType);
  });
}

function createChannelFromModal() {
  const state = serverState(activeServerId);
  if (!state || !canManageChannels()) {
    closeChannelModal();
    return;
  }
  const name = $('newChannelName').value.trim();
  const errorEl = $('channelError');
  errorEl.textContent = '';
  if (!name) {
    errorEl.textContent = t('Podaj poprawną nazwę kanału.');
    $('newChannelName').focus();
    return;
  }
  if (name.length > 32) {
    errorEl.textContent = t('Nazwa kanału może mieć maksymalnie 32 znaki.');
    return;
  }
  if (editingChannelId) {
    const channel = state.channels.find((item) => item.id === editingChannelId);
    if (!channel) {
      closeChannelModal();
      return;
    }
    if (channel.name === name) {
      closeChannelModal();
      return;
    }
    $('createChannelBtn').disabled = true;
    state.ws.send(JSON.stringify({ type: 'server:channel:rename', channelId: channel.id, name }));
    return;
  }
  $('createChannelBtn').disabled = true;
  state.ws.send(JSON.stringify({ type: 'server:channel:create', name, channelType }));
}

function currentMenuChannel() {
  return serverState(activeServerId)?.channels.find((item) => item.id === menuChannelId) || null;
}

function closeChannelSubmenus() {
  document.querySelectorAll('#channelMenu .context-sub').forEach((sub) => {
    sub.hidden = true;
    sub.style.top = '';
    sub.classList.remove('open-left');
  });
  document.querySelectorAll('#channelMenu [data-submenu]').forEach((button) => {
    button.setAttribute('aria-expanded', 'false');
  });
}

function toggleChannelSubmenu(name) {
  const sub = name === 'notify' ? $('notifyChannelSubmenu') : $('moveChannelSubmenu');
  const parent = name === 'notify' ? $('notifyChannelBtn') : $('moveChannelBtn');
  if (!sub || !parent) return;
  const open = sub.hidden;
  closeChannelSubmenus();
  if (!open) return;
  sub.hidden = false;
  parent.setAttribute('aria-expanded', 'true');
  const parentRect = parent.getBoundingClientRect();
  if (parentRect.right + sub.offsetWidth + 12 > window.innerWidth) sub.classList.add('open-left');
  const subHeight = sub.offsetHeight;
  if (parentRect.top + subHeight > window.innerHeight - 8) {
    const top = Math.max(8 - parentRect.top, window.innerHeight - 8 - subHeight - parentRect.top);
    sub.style.top = `${top}px`;
  }
}

function channelNotifyLabel(level) {
  if (level === 'none') return t('Nic');
  if (level === 'mentions') return t('Tylko wzmianki');
  return t('Wszystkie wiadomości');
}

function buildMoveChannelOptions() {
  const container = $('moveChannelOptions');
  const state = serverState(activeServerId);
  const channel = currentMenuChannel();
  if (!container || !state || !channel) return;
  if (state.channels.length < 2) {
    container.innerHTML = `<div class="context-sub-empty">${esc(t('Brak innych kanałów'))}</div>`;
    return;
  }
  const currentIndex = state.channels.findIndex((item) => item.id === channel.id);
  const rows = state.channels.map((target, index) => {
    const selected = target.id === channel.id;
    const noop = !selected && index === currentIndex + 1;
    const icon = target.type === 'voice' ? '🔊' : '#';
    return `
      <button type="button" class="context-sub-item${selected ? ' selected' : ''}" role="menuitem" data-move-target="${esc(target.id)}"${selected || noop ? ' disabled' : ''}>
        <span class="context-check" aria-hidden="true">${selected ? '✓' : ''}</span>
        <span class="context-icon" aria-hidden="true">${icon}</span>
        <span class="context-sub-label">${esc(target.name)}</span>
      </button>
    `;
  }).join('');
  const endDisabled = currentIndex === state.channels.length - 1;
  container.innerHTML = `${rows}<div class="context-sub-sep"></div>
    <button type="button" class="context-sub-item" role="menuitem" data-move-target="__end__"${endDisabled ? ' disabled' : ''}>
      <span class="context-check" aria-hidden="true"></span>
      <span class="context-icon" aria-hidden="true">⬇</span>
      <span class="context-sub-label">${esc(t('Na koniec listy'))}</span>
    </button>`;
}

function updateChannelMenu() {
  const state = serverState(activeServerId);
  const channel = currentMenuChannel();
  if (!state || !channel) return;
  const settings = channelSettings(state.server.id, channel.id);
  if ($('pinChannelLabel')) $('pinChannelLabel').textContent = settings.pinned ? t('Odepnij kanał') : t('Przypnij kanał na górę');
  if ($('muteChannelLabel')) $('muteChannelLabel').textContent = settings.muted ? t('Wyłącz wyciszenie') : t('Wycisz kanał');
  document.querySelectorAll('#notifyChannelSubmenu [data-notify-level]').forEach((button) => {
    const selected = button.dataset.notifyLevel === settings.notify;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-checked', String(selected));
  });
  buildMoveChannelOptions();
  closeChannelSubmenus();
}

function openChannelMenu(event, channel) {
  const state = serverState(activeServerId);
  if (!channel || !state?.you?.owner || state.status !== 'online') return;
  closeServerMenu();
  event?.preventDefault?.();
  event?.stopPropagation?.();
  menuChannelId = channel.id;
  updateChannelMenu();
  const menu = $('channelMenu');
  menu.hidden = false;
  const rect = menu.getBoundingClientRect();
  const anchor = event?.currentTarget?.getBoundingClientRect?.();
  let x = Number(event?.clientX) || (anchor ? anchor.right + 6 : 280);
  let y = Number(event?.clientY) || (anchor ? anchor.top - 4 : 120);
  x = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
  y = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  if (event?.type === 'keydown') {
    const first = menu.querySelector('button:not([disabled])');
    if (first) requestAnimationFrame(() => first.focus({ preventScroll: true }));
  }
}

function closeChannelMenu() {
  menuChannelId = null;
  closeChannelSubmenus();
  const menu = $('channelMenu');
  if (menu) menu.hidden = true;
}

function normalizeServerTag(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function serverMenuButton(action, icon, label, options = {}) {
  const classes = `context-item${options.danger ? ' danger' : ''}`;
  const role = options.check === undefined ? 'menuitem' : 'menuitemcheckbox';
  const checked = options.check === undefined ? '' : ` aria-checked="${options.check ? 'true' : 'false'}"`;
  const check = options.check === undefined
    ? ''
    : `<span class="server-menu-check${options.check ? ' checked' : ''}" aria-hidden="true">✓</span>`;
  const badge = options.badge
    ? `<span class="context-badge${options.tag ? ' server-tag-pill' : ''}">${esc(options.badge)}</span>`
    : '';
  return `<button type="button" class="${classes}" data-server-action="${esc(action)}" role="${role}"${checked}>
    <span class="context-icon" aria-hidden="true">${icon}</span>
    <span class="server-menu-label">${esc(label)}</span>
    ${badge}${check}
  </button>`;
}

function serverMenuSeparator() {
  return '<div class="context-sep" role="separator"></div>';
}

function renderServerMenu() {
  const state = serverState(activeServerId);
  const menu = $('serverMenu');
  if (!menu) return;
  if (!state) {
    closeServerMenu();
    return;
  }
  const owner = Boolean(state.you?.owner);
  const tag = normalizeServerTag(state.server.tag);
  const previousFocus = menu.contains(document.activeElement) ? document.activeElement.dataset.serverAction : '';
  const previousScroll = menu.scrollTop;
  $('serverMenuAvatar').textContent = state.server.icon || initial(state.server.name);
  $('serverMenuAvatar').style.background = safeColor(state.server.color, 'var(--panel-2)');
  $('serverMenuName').textContent = state.server.name;
  $('serverMenuOwnerPill').hidden = !owner;

  const soon = t('Wkrótce');
  const rows = [];
  rows.push(serverMenuButton('boost', '💎', t('Wzmocnienie serwera'), { badge: soon }));
  if (!owner) {
    rows.push(serverMenuButton('tag', '🏷', t('Tag serwera'), tag ? { badge: tag, tag: true } : {}));
  }
  rows.push(serverMenuSeparator());
  rows.push(serverMenuButton('invite', '👥', t('Zaproś na serwer')));
  if (owner) {
    rows.push(serverMenuButton('settings', '⚙️', t('Ustawienia serwera')));
    rows.push(serverMenuButton('insights', '📊', t('Wgląd w serwer')));
    rows.push(serverMenuButton('create-channel', '➕', t('Utworzenie kanału')));
    rows.push(serverMenuButton('category', '📁', t('Stwórz kategorię'), { badge: soon }));
    rows.push(serverMenuButton('event', '🗓', t('Stwórz wydarzenie'), { badge: soon }));
    rows.push(serverMenuButton('apps', '🧩', t('Katalog aplikacji'), { badge: soon }));
  } else {
    rows.push(serverMenuButton('apps', '🧩', t('Katalog aplikacji'), { badge: soon }));
  }
  rows.push(serverMenuSeparator());
  rows.push(serverMenuButton('show-all', '👁', t('Pokaż wszystkie kanały'), { check: prefs.showAllChannels !== false }));
  rows.push(serverMenuButton('notifications', '🔔', t('Ustawienia powiadomień')));
  rows.push(serverMenuButton('privacy', '🛡', t('Ustawienia prywatności'), { badge: soon }));
  rows.push(serverMenuSeparator());
  rows.push(serverMenuButton('edit-profile', '✏️', t('Edytuj profil serwerowy')));
  rows.push(serverMenuButton('hide-muted', '🔇', t('Ukryj wyciszone kanały'), { check: Boolean(prefs.hideMutedChannels) }));
  rows.push(serverMenuSeparator());
  if (owner) {
    rows.push(serverMenuButton('security', '🔒', t('Działania bezpieczeństwa'), { badge: soon, danger: true }));
    rows.push(serverMenuButton('report', '🚨', t('Zgłoś atak'), { badge: soon, danger: true }));
  } else {
    rows.push(serverMenuButton('leave', '🚪', t('Opuść serwer'), { danger: true }));
  }
  rows.push(serverMenuSeparator());
  rows.push(serverMenuButton('copy-id', '🆔', t('Kopiuj ID serwera')));
  $('serverMenuItems').innerHTML = rows.join('');
  menu.scrollTop = previousScroll;
  if (previousFocus) {
    menu.querySelector(`[data-server-action="${previousFocus}"]`)?.focus({ preventScroll: true });
  }
}

function syncServerMenuScroll() {
  const menu = $('serverMenu');
  if (!menu || menu.hidden) return;
  menu.classList.toggle('has-scroll', menu.scrollHeight > menu.clientHeight + 1);
}

function openServerMenu() {
  const state = serverState(activeServerId);
  if (!state) return;
  closeChannelMenu();
  closeAudioMenus();
  renderServerMenu();
  const menu = $('serverMenu');
  const banner = $('serverBanner');
  menu.hidden = false;
  menu.style.maxHeight = '';
  banner.setAttribute('aria-expanded', 'true');
  const anchor = banner.getBoundingClientRect();
  const maxBelow = window.innerHeight - anchor.bottom - 14;
  const maxAbove = anchor.top - 14;
  let top = anchor.bottom + 6;
  if (maxBelow >= 220 || maxBelow >= maxAbove) {
    menu.style.maxHeight = `${Math.max(180, maxBelow)}px`;
  } else {
    menu.style.maxHeight = `${Math.max(180, Math.min(menu.getBoundingClientRect().height, maxAbove))}px`;
    top = Math.max(8, anchor.top - 6 - menu.getBoundingClientRect().height);
  }
  syncServerMenuScroll();
  let left = anchor.left;
  left = Math.max(8, Math.min(left, window.innerWidth - menu.getBoundingClientRect().width - 8));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.scrollTop = 0;
}

function closeServerMenu() {
  const menu = $('serverMenu');
  if (menu) menu.hidden = true;
  $('serverBanner')?.setAttribute('aria-expanded', 'false');
}

function toggleServerMenu() {
  if ($('serverMenu').hidden) openServerMenu();
  else closeServerMenu();
}

function handleServerAction(action) {
  const state = serverState(activeServerId);
  if (!state || !action) {
    closeServerMenu();
    return;
  }
  if (action === 'show-all') {
    prefs.showAllChannels = !prefs.showAllChannels;
    savePrefs();
    renderChannels();
    renderServerMenu();
    return;
  }
  if (action === 'hide-muted') {
    prefs.hideMutedChannels = !prefs.hideMutedChannels;
    savePrefs();
    renderChannels();
    renderServerMenu();
    return;
  }
  closeServerMenu();
  if (action === 'boost' || action === 'category' || action === 'event' || action === 'apps' || action === 'security' || action === 'report') {
    toast(t('Ta funkcja pojawi się wkrótce.'));
    return;
  }
  if (action === 'tag') {
    const tag = normalizeServerTag(state.server.tag);
    toast(tag ? t('Tag serwera: {tag}', { tag }) : t('Ten serwer nie ma jeszcze tagu.'));
    return;
  }
  if (action === 'invite') {
    void openInviteModal();
    return;
  }
  if (action === 'settings') {
    openServerSettings();
    return;
  }
  if (action === 'insights') {
    openServerInsights();
    return;
  }
  if (action === 'create-channel') {
    openChannelModal();
    return;
  }
  if (action === 'notifications') {
    openSettings('notifications');
    return;
  }
  if (action === 'privacy') {
    toast(t('Ustawienia prywatności serwera pojawią się wkrótce.'));
    return;
  }
  if (action === 'edit-profile') {
    openServerProfileEditor();
    return;
  }
  if (action === 'leave') {
    openLeaveServerConfirm();
    return;
  }
  if (action === 'copy-id') {
    copyText(state.server.id)
      .then(() => toast(t('Skopiowano ID serwera.')))
      .catch(() => toast(t('Nie udało się skopiować ID serwera.')));
  }
}

function normalizeServerBannerId(value) {
  const id = String(value || '').trim().toLowerCase();
  return SERVER_BANNER_IDS.includes(id) ? id : 'graphite';
}

function normalizeServerTextList(value, limit, maxLength) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const text = String(item || '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
    if (!text) continue;
    const key = text.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function serverSettingsBannerClass(id) {
  return `banner-${normalizeServerBannerId(id)}`;
}

function serverSettingsIconValueNow() {
  return String($('serverSettingsIcon')?.value || serverSettingsIconValue || '').trim().slice(0, 4);
}

function renderServerSettingsBanners() {
  document.querySelectorAll('#serverSettingsBanners [data-server-banner]').forEach((button) => {
    const selected = button.dataset.serverBanner === serverSettingsBanner;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const preview = $('serverSettingsBannerPreview');
  if (preview) preview.className = `server-settings-banner-preview ${serverSettingsBannerClass(serverSettingsBanner)}`;
}

function renderServerSettingsIconChoices() {
  const container = $('serverSettingsIconChoices');
  if (!container || container.childElementCount) return;
  const current = serverSettingsIconValueNow();
  const fragment = document.createDocumentFragment();
  for (const icon of SERVER_ICON_CHOICES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'server-icon-choice';
    button.dataset.serverIcon = icon;
    button.textContent = icon;
    button.setAttribute('aria-label', t('Ustaw ikonę {icon}', { icon }));
    button.classList.toggle('selected', icon === current);
    fragment.append(button);
  }
  container.append(fragment);
}

function renderServerSettingsIconState() {
  const state = serverState(activeServerId);
  const name = $('serverSettingsName').value.trim() || t('Serwer');
  const icon = serverSettingsIconValueNow();
  const current = $('serverSettingsIconCurrent');
  if (current) {
    current.textContent = icon || initial(name);
    current.style.color = icon ? '' : '#fff';
    current.style.background = icon ? 'var(--panel-2)' : safeColor(serverSettingsColor, state?.server?.color || '#3ee0a3');
  }
  document.querySelectorAll('#serverSettingsIconChoices [data-server-icon]').forEach((button) => {
    button.classList.toggle('selected', button.dataset.serverIcon === icon);
  });
}

function renderServerSettingsTraits() {
  const container = $('serverSettingsTraits');
  if (!container) return;
  container.textContent = '';
  const fragment = document.createDocumentFragment();
  serverSettingsTraits.forEach((trait, index) => {
    const chip = document.createElement('span');
    chip.className = 'server-settings-chip';
    const emoji = document.createElement('span');
    emoji.className = 'server-settings-chip-emoji';
    emoji.textContent = SERVER_TRAIT_EMOJI;
    emoji.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'server-settings-chip-text';
    text.textContent = trait;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.removeTrait = String(index);
    remove.setAttribute('aria-label', t('Usuń cechę {name}', { name: trait }));
    remove.textContent = '✕';
    chip.append(emoji, text, remove);
    fragment.append(chip);
  });
  container.append(fragment);
  const full = serverSettingsTraits.length >= SERVER_TRAIT_LIMIT;
  $('serverSettingsAddTrait').disabled = full;
  $('serverSettingsTraitInput').disabled = full;
}

function addServerSettingsTrait() {
  const input = $('serverSettingsTraitInput');
  if (!input || input.disabled) return;
  const text = input.value.replace(/\s+/g, ' ').trim().slice(0, SERVER_TRAIT_LENGTH);
  if (!text) {
    input.focus();
    return;
  }
  if (serverSettingsTraits.some((trait) => trait.toLocaleLowerCase() === text.toLocaleLowerCase())) {
    toast(t('Ta cecha jest już dodana.'));
    return;
  }
  if (serverSettingsTraits.length >= SERVER_TRAIT_LIMIT) {
    toast(t('Możesz dodać maksymalnie 5 cech.'));
    return;
  }
  serverSettingsTraits.push(text);
  input.value = '';
  renderServerSettingsTraits();
  updateServerSettingsPreview();
  input.focus();
}

function renderServerSettingsGames() {
  const container = $('serverSettingsGames');
  if (!container) return;
  container.textContent = '';
  const fragment = document.createDocumentFragment();
  serverSettingsGames.forEach((game, index) => {
    const chip = document.createElement('span');
    chip.className = 'server-settings-chip';
    const emoji = document.createElement('span');
    emoji.className = 'server-settings-chip-emoji';
    emoji.textContent = '🎮';
    emoji.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'server-settings-chip-text';
    text.textContent = game;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.removeGame = String(index);
    remove.setAttribute('aria-label', t('Usuń grę {name}', { name: game }));
    remove.textContent = '✕';
    chip.append(emoji, text, remove);
    fragment.append(chip);
  });
  container.append(fragment);
  if ($('serverSettingsGameSearch')) $('serverSettingsGameSearch').disabled = serverSettingsGames.length >= SERVER_GAME_LIMIT;
}

function renderServerSettingsGameMenu() {
  const menu = $('serverSettingsGameMenu');
  const input = $('serverSettingsGameSearch');
  if (!menu || !input || input.disabled) {
    if (menu) menu.hidden = true;
    return;
  }
  const query = input.value.replace(/\s+/g, ' ').trim();
  const lower = query.toLocaleLowerCase();
  const existing = new Set(serverSettingsGames.map((game) => game.toLocaleLowerCase()));
  const options = SERVER_GAME_CHOICES
    .filter((game) => !existing.has(game.toLocaleLowerCase()))
    .filter((game) => !lower || game.toLocaleLowerCase().includes(lower));
  menu.textContent = '';
  const fragment = document.createDocumentFragment();
  for (const game of options.slice(0, 8)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'server-game-option';
    button.dataset.gameOption = game;
    button.textContent = game;
    fragment.append(button);
  }
  const canCreate = query.length >= 2
    && !SERVER_GAME_CHOICES.some((game) => game.toLocaleLowerCase() === lower)
    && !existing.has(lower);
  if (canCreate) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'server-game-option';
    button.dataset.gameOption = query;
    button.textContent = t('Dodaj „{name}”', { name: query });
    fragment.append(button);
  }
  if (!fragment.childElementCount) {
    const empty = document.createElement('p');
    empty.className = 'server-game-empty';
    empty.textContent = t('Brak pasujących gier.');
    fragment.append(empty);
  }
  menu.append(fragment);
  menu.hidden = false;
}

function addServerSettingsGame(name) {
  const game = String(name || '').replace(/\s+/g, ' ').trim().slice(0, SERVER_GAME_LENGTH);
  if (!game) return;
  if (serverSettingsGames.length >= SERVER_GAME_LIMIT) {
    toast(t('Możesz dodać maksymalnie 5 gier.'));
    return;
  }
  if (serverSettingsGames.some((item) => item.toLocaleLowerCase() === game.toLocaleLowerCase())) {
    toast(t('Ta gra jest już dodana.'));
    return;
  }
  serverSettingsGames.push(game);
  $('serverSettingsGameSearch').value = '';
  renderServerSettingsGames();
  renderServerSettingsGameMenu();
  updateServerSettingsPreview();
  $('serverSettingsGameSearch').focus();
}

function updateServerSettingsDescriptionCount() {
  const counter = $('serverSettingsDescriptionCount');
  const field = $('serverSettingsDescription');
  if (counter && field) counter.textContent = String(field.value.length);
}

function updateServerSettingsPreview() {
  const state = serverState(activeServerId);
  const name = $('serverSettingsName').value.trim() || t('Serwer');
  const icon = serverSettingsIconValueNow();
  const tag = normalizeServerTag($('serverSettingsTag').value);
  $('serverSettingsAvatar').textContent = icon || initial(name);
  $('serverSettingsAvatar').style.background = safeColor(serverSettingsColor, state?.server?.color || 'var(--panel-2)');
  $('serverSettingsPreviewName').textContent = name;
  $('serverSettingsPreviewTag').textContent = tag;
  $('serverSettingsPreviewTag').hidden = !tag;
  const online = (state?.members || []).filter((member) => member.online).length;
  const total = (state?.members || []).length;
  $('serverSettingsPreviewOnline').textContent = t('{n} online', { n: online });
  $('serverSettingsPreviewMembers').textContent = prefs.lang === 'en'
    ? `${total} ${total === 1 ? 'member' : 'members'}`
    : (total === 1 ? '1 członek' : `${total} członków`);
  const createdAt = Number(state?.server?.createdAt) || Date.now();
  const date = new Date(createdAt).toLocaleDateString(prefs.lang === 'en' ? 'en-US' : 'pl-PL', {
    month: 'short',
    year: 'numeric',
  });
  $('serverSettingsPreviewCreated').textContent = t('Zał. {date}', { date });
  const tags = [
    ...serverSettingsGames.map((game) => ({ text: game, game: true })),
    ...serverSettingsTraits.map((trait) => ({ text: trait, game: false })),
  ].slice(0, 6);
  $('serverSettingsPreviewTags').innerHTML = tags
    .map((item) => `<span class="server-preview-tag${item.game ? ' game' : ''}">${esc(item.text)}</span>`)
    .join('');
  renderServerSettingsIconState();
}

function populateServerSettings(state) {
  if (!state) return;
  serverSettingsColor = safeColor(state.server.color, '#3ee0a3');
  serverSettingsBanner = normalizeServerBannerId(state.server.banner);
  serverSettingsTraits = normalizeServerTextList(state.server.traits || [], SERVER_TRAIT_LIMIT, SERVER_TRAIT_LENGTH);
  serverSettingsGames = normalizeServerTextList(state.server.games || [], SERVER_GAME_LIMIT, SERVER_GAME_LENGTH);
  serverSettingsIconValue = String(state.server.icon || '').slice(0, 4);
  $('serverSettingsName').value = state.server.name || '';
  $('serverSettingsIcon').value = serverSettingsIconValue;
  $('serverSettingsIconCurrent').textContent = serverSettingsIconValue || initial(state.server.name || '');
  $('serverSettingsTag').value = normalizeServerTag(state.server.tag);
  $('serverSettingsDescription').value = String(state.server.description || '').slice(0, SERVER_DESCRIPTION_LENGTH);
  $('serverSettingsTraitInput').value = '';
  $('serverSettingsGameSearch').value = '';
  $('serverSettingsIconPicker').hidden = true;
  $('serverSettingsGameMenu').hidden = true;
  markColorSelection($('serverSettingsColors'), serverSettingsColor);
  renderServerSettingsBanners();
  renderServerSettingsTraits();
  renderServerSettingsGames();
  updateServerSettingsDescriptionCount();
  updateServerSettingsPreview();
}

function openServerSettings() {
  const state = serverState(activeServerId);
  if (!state?.you?.owner) return;
  populateServerSettings(state);
  $('serverSettingsError').textContent = '';
  $('saveServerSettings').disabled = false;
  const scroll = $('serverSettingsScroll');
  if (scroll) scroll.scrollTop = 0;
  document.querySelectorAll('#serverSettingsNav [data-server-nav]').forEach((button) => {
    button.classList.toggle('active', button.dataset.serverNav === 'profile');
  });
  $('serverSettingsOverlay').hidden = false;
  document.querySelector('.server-settings-card')?.focus({ preventScroll: true });
}

function closeServerSettings() {
  $('serverSettingsOverlay').hidden = true;
  $('serverSettingsIconPicker').hidden = true;
  $('serverSettingsGameMenu').hidden = true;
  $('serverSettingsError').textContent = '';
  $('saveServerSettings').disabled = false;
}

function saveServerSettings() {
  const state = serverState(activeServerId);
  if (!state?.you?.owner) {
    closeServerSettings();
    return;
  }
  const errorEl = $('serverSettingsError');
  errorEl.textContent = '';
  const name = $('serverSettingsName').value.trim();
  if (name.length < 2 || name.length > 40) {
    errorEl.textContent = t('Nazwa serwera musi mieć 2–40 znaków.');
    $('serverSettingsName').focus();
    return;
  }
  if (!state.ws || state.status !== 'online' || state.ws.readyState !== WebSocket.OPEN) {
    errorEl.textContent = t('Serwer jest offline — spróbuj, gdy połączenie wróci.');
    return;
  }
  const icon = serverSettingsIconValueNow();
  const tag = normalizeServerTag($('serverSettingsTag').value);
  const description = $('serverSettingsDescription').value.trim().slice(0, SERVER_DESCRIPTION_LENGTH);
  $('saveServerSettings').disabled = true;
  try {
    state.ws.send(JSON.stringify({
      type: 'server:update',
      name,
      icon,
      tag,
      color: serverSettingsColor,
      banner: serverSettingsBanner,
      description,
      traits: [...serverSettingsTraits],
      games: [...serverSettingsGames],
    }));
  } catch {
    $('saveServerSettings').disabled = false;
    errorEl.textContent = t('Nie udało się zapisać ustawień serwera.');
  }
}

function scrollServerSettingsSection(id) {
  const section = $(id);
  if (!section) return;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openDeleteServerConfirmFromSettings() {
  const state = serverState(activeServerId);
  if (!state?.you?.owner) return;
  $('leaveServerTitle').textContent = t('Usunąć serwer?');
  $('leaveServerText').textContent = t('Czy na pewno chcesz usunąć serwer „{name}”? Tej operacji nie można cofnąć.', { name: state.server.name });
  $('confirmLeaveServer').textContent = t('Usuń serwer');
  $('confirmLeaveServer').disabled = false;
  $('leaveServerOverlay').hidden = false;
}

function handleServerSettingsNav(target) {
  if (!target) return;
  document.querySelectorAll('#serverSettingsNav [data-server-nav]').forEach((button) => {
    button.classList.toggle('active', button.dataset.serverNav === target);
  });
  if (target === 'profile') {
    $('serverSettingsScroll').scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  if (target === 'tag') {
    scrollServerSettingsSection('serverSettingsSectionIdentity');
    return;
  }
  if (target === 'invites') {
    closeServerSettings();
    void openInviteModal();
    return;
  }
  if (target === 'insights') {
    closeServerSettings();
    openServerInsights();
    return;
  }
  if (target === 'delete') {
    closeServerSettings();
    openDeleteServerConfirmFromSettings();
    return;
  }
  toast(t('Ta funkcja pojawi się wkrótce.'));
}

function openServerInsights() {
  const state = serverState(activeServerId);
  if (!state?.you?.owner) return;
  const totalMessages = state.channels.reduce((sum, channel) => {
    return sum + (history.get(`server:${state.server.id}:${channel.id}`)?.length || 0);
  }, 0);
  $('serverInsightServer').textContent = state.server.name;
  $('serverInsightMembers').textContent = String(state.members.length);
  $('serverInsightOnline').textContent = String(state.members.filter((member) => member.online).length);
  $('serverInsightTextChannels').textContent = String(state.channels.filter((channel) => channel.type !== 'voice').length);
  $('serverInsightVoiceChannels').textContent = String(state.channels.filter((channel) => channel.type === 'voice').length);
  $('serverInsightMessages').textContent = String(totalMessages);
  $('serverInsightInvite').textContent = state.server.invite || '—';
  const createdAt = Number(state.server.createdAt) || Date.now();
  const date = new Date(createdAt).toLocaleDateString(prefs.lang === 'en' ? 'en-US' : 'pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  $('serverInsightCreated').textContent = t('Utworzono serwer {date}', { date });
  $('serverInsightOverlay').hidden = false;
}

function closeServerInsights() {
  $('serverInsightOverlay').hidden = true;
}

function serverProfileSelf(state) {
  return state?.members.find((member) => member.id === state.you?.memberId) || null;
}

function updateServerProfilePreview() {
  const state = serverState(activeServerId);
  const name = $('serverProfileName').value.trim() || t('Gość');
  $('serverProfileAvatar').textContent = initial(name);
  $('serverProfileAvatar').style.background = safeColor(serverProfileColor, 'var(--panel-2)');
  $('serverProfilePreviewName').textContent = name;
  $('serverProfileServerName').textContent = state?.server?.name || '';
}

function openServerProfileEditor() {
  const state = serverState(activeServerId);
  if (!state) return;
  const me = serverProfileSelf(state);
  $('serverProfileName').value = me?.name || myName || '';
  serverProfileColor = safeColor(me?.color || myColor, '#3ee0a3');
  markColorSelection($('serverProfileColors'), serverProfileColor);
  $('serverProfileError').textContent = '';
  $('saveServerProfile').disabled = false;
  updateServerProfilePreview();
  $('serverProfileOverlay').hidden = false;
  setTimeout(() => {
    $('serverProfileName').focus();
    $('serverProfileName').select();
  }, 40);
}

function closeServerProfileEditor() {
  $('serverProfileOverlay').hidden = true;
  $('serverProfileError').textContent = '';
  $('saveServerProfile').disabled = false;
}

function saveServerProfile() {
  const state = serverState(activeServerId);
  if (!state) {
    closeServerProfileEditor();
    return;
  }
  const errorEl = $('serverProfileError');
  errorEl.textContent = '';
  const name = $('serverProfileName').value.trim();
  if (name.length < 2 || name.length > 32) {
    errorEl.textContent = t('Nazwa na serwerze musi mieć 2–32 znaki.');
    $('serverProfileName').focus();
    return;
  }
  if (!state.ws || state.status !== 'online' || state.ws.readyState !== WebSocket.OPEN) {
    errorEl.textContent = t('Serwer jest offline — spróbuj, gdy połączenie wróci.');
    return;
  }
  $('saveServerProfile').disabled = true;
  try {
    state.ws.send(JSON.stringify({ type: 'server:profile', name, color: serverProfileColor }));
    closeServerProfileEditor();
    toast(t('Profil serwerowy zaktualizowany'));
  } catch {
    $('saveServerProfile').disabled = false;
    errorEl.textContent = t('Wystąpił błąd. Spróbuj ponownie.');
  }
}

function openLeaveServerConfirm() {
  const state = serverState(activeServerId);
  if (!state || state.you?.owner) return;
  $('leaveServerTitle').textContent = t('Opuścić serwer?');
  $('leaveServerText').textContent = t('Czy na pewno chcesz opuścić serwer „{name}”? Będziesz mógł dołączyć ponownie, jeśli otrzymasz nowe zaproszenie.', { name: state.server.name });
  $('confirmLeaveServer').textContent = t('Opuść serwer');
  $('confirmLeaveServer').disabled = false;
  $('leaveServerOverlay').hidden = false;
}

function closeLeaveServerConfirm() {
  $('leaveServerOverlay').hidden = true;
  $('confirmLeaveServer').disabled = false;
}

async function confirmLeaveServerFromMenu() {
  $('confirmLeaveServer').disabled = true;
  await leaveActiveServer(true);
  closeLeaveServerConfirm();
}

function setChannelNotifyLevel(level) {
  if (!['all', 'mentions', 'none'].includes(level)) return;
  const state = serverState(activeServerId);
  const channel = currentMenuChannel();
  if (!state || !channel) {
    closeChannelMenu();
    return;
  }
  setChannelSettings(state.server.id, channel.id, { notify: level });
  closeChannelMenu();
  toast(t('Powiadomienia kanału: {level}', { level: channelNotifyLabel(level) }));
}

function moveChannelTo(targetId) {
  const state = serverState(activeServerId);
  const channel = currentMenuChannel();
  closeChannelMenu();
  if (!state || !channel || !canManageChannels()) return;
  try {
    state.ws.send(JSON.stringify({ type: 'server:channel:move', channelId: channel.id, targetId }));
  } catch {
    toast(t('Nie udało się przenieść kanału.'));
  }
}

function handlePinChannel(channel) {
  const state = serverState(activeServerId);
  if (!state || !channel) return;
  const settings = channelSettings(state.server.id, channel.id);
  setChannelSettings(state.server.id, channel.id, { pinned: !settings.pinned });
  closeChannelMenu();
  renderSidebar();
  toast(settings.pinned
    ? t('Odpięto kanał „{name}”.', { name: channel.name })
    : t('Przypięto kanał „{name}” na górze.', { name: channel.name }));
}

function handleMuteChannel(channel) {
  const state = serverState(activeServerId);
  if (!state || !channel) return;
  const settings = channelSettings(state.server.id, channel.id);
  setChannelSettings(state.server.id, channel.id, { muted: !settings.muted });
  closeChannelMenu();
  renderSidebar();
  toast(settings.muted
    ? t('Włączono powiadomienia dla kanału „{name}”.', { name: channel.name })
    : t('Wyciszono kanał „{name}”.', { name: channel.name }));
}

function handleChannelAction(action) {
  const state = serverState(activeServerId);
  const channel = currentMenuChannel();
  if (!state || !channel) {
    closeChannelMenu();
    return;
  }
  if (action === 'invite') {
    closeChannelMenu();
    void openInviteModal(channel);
    return;
  }
  if (action === 'pin') {
    handlePinChannel(channel);
    return;
  }
  if (action === 'copy') {
    closeChannelMenu();
    void copyChannelInvite(state, channel);
    return;
  }
  if (action === 'mute') {
    handleMuteChannel(channel);
    return;
  }
  if (action === 'edit') {
    closeChannelMenu();
    openChannelEdit(channel);
    return;
  }
  if (action === 'duplicate') {
    closeChannelMenu();
    if (!canManageChannels()) return;
    try {
      state.ws.send(JSON.stringify({ type: 'server:channel:duplicate', channelId: channel.id }));
    } catch {
      toast(t('Nie udało się powielić kanału.'));
    }
    return;
  }
  if (action === 'create-text') {
    closeChannelMenu();
    openChannelModal();
    return;
  }
  if (action === 'delete') {
    closeChannelMenu();
    openChannelDelete(channel);
    return;
  }
}

function updateChannelDeleteCopy() {
  const channel = serverState(activeServerId)?.channels.find((item) => item.id === deleteChannelId);
  $('channelDeleteText').textContent = channel
    ? t('Kanał „{name}” zostanie usunięty wraz z historią wiadomości.', { name: channel.name })
    : '';
}

function openChannelDelete(channel) {
  const state = serverState(activeServerId);
  if (!channel || !state?.you?.owner || state.status !== 'online') return;
  deleteChannelId = channel.id;
  pendingChannelDelete = false;
  updateChannelDeleteCopy();
  $('confirmDeleteChannel').disabled = false;
  $('channelDeleteOverlay').hidden = false;
}

function closeChannelDelete() {
  deleteChannelId = null;
  pendingChannelDelete = false;
  $('channelDeleteOverlay').hidden = true;
  $('confirmDeleteChannel').disabled = false;
}

function confirmDeleteChannel() {
  if (pendingChannelDelete) return;
  const state = serverState(activeServerId);
  const channel = state?.channels.find((item) => item.id === deleteChannelId);
  if (!state || !channel || !canManageChannels()) {
    toast(t('Nie udało się usunąć kanału.'));
    closeChannelDelete();
    return;
  }
  pendingChannelDelete = true;
  $('confirmDeleteChannel').disabled = true;
  state.ws.send(JSON.stringify({ type: 'server:channel:delete', channelId: channel.id }));
}

function openServerModal(tab = 'create') {
  if (!currentUser) return;
  $('serverOverlay').hidden = false;
  const card = $('serverOverlay').querySelector('.server-card');
  if (card) card.scrollTop = 0;
  $('serverName').value = '';
  $('serverInvite').value = '';
  $('createServerError').textContent = '';
  $('joinServerError').textContent = '';
  serverColor = '#3ee0a3';
  markColorSelection($('serverColors'), serverColor);
  switchServerTab(tab);
  if (tab === 'discord') void initDiscordPanel();
}

function closeServerModal() {
  $('serverOverlay').hidden = true;
  $('createServerBtn').disabled = false;
  $('joinServerBtn').disabled = false;
  clearDiscordPreview();
  try { CHILL.discord?.cancel?.().catch(() => {}); } catch { /* ignore */ }
}

function switchServerTab(tab) {
  const target = tab === 'join' ? 'join' : tab === 'discord' ? 'discord' : 'create';
  document.querySelectorAll('[data-server-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.serverTab === target);
  });
  document.querySelectorAll('[data-server-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.serverPanel !== target;
  });
  setTimeout(() => {
    if (target === 'join') {
      $('serverInvite').focus();
    } else if (target === 'discord') {
      if (!$('discordSetup').hidden) $('discordClientId').focus();
      else if (!$('discordWizard').hidden) $('discordGuildSelect').focus();
      else if (!$('discordLogin').hidden) $('discordConnectBtn').focus();
    } else {
      $('serverName').focus();
    }
  }, 40);
}

async function createServer() {
  const name = $('serverName').value.trim();
  const errorEl = $('createServerError');
  errorEl.textContent = '';
  if (name.length < 2 || name.length > 40) {
    errorEl.textContent = t('Nazwa serwera musi mieć 2–40 znaków.');
    return;
  }
  $('createServerBtn').disabled = true;
  try {
    const result = await CHILL.servers.create({ name, color: serverColor });
    if (!result || !result.ok) {
      errorEl.textContent = result?.error ? translateError(result.error) : t('Nie udało się utworzyć serwera.');
      return;
    }
    upsertServer(result.server);
    const state = ensureServerState(result.server);
    state.server = result.server;
    closeServerModal();
    selectServer(result.server.id);
    connectServer(result.server);
    toast(t('Serwer „{name}” utworzony', { name: result.server.name }));
  } catch {
    errorEl.textContent = t('Wystąpił błąd podczas tworzenia serwera.');
  } finally {
    $('createServerBtn').disabled = false;
  }
}

async function joinServerInvite(raw) {
  const parsed = parseInvite(raw);
  if (!parsed) {
    return {
      ok: false,
      error: t('Wklej link zaproszenia, np. chill://192.168.1.5:47830/AB12CD lub https://chill.example.com/?invite=AB12CD.'),
    };
  }
  const known = servers.find((server) => server.invite === parsed.invite
    && ((server.address === parsed.address && Boolean(server.secure) === Boolean(parsed.secure)) || server.owner));
  if (known) {
    selectServer(known.id);
    connectServer(known);
    focusInvitedChannel(known.id, parsed.channelId);
    return { ok: true, known: true, server: known };
  }
  const memberId = randomMemberId();
  try {
    const data = await probeServer(parsed, memberId);
    const result = await CHILL.servers.saveJoined({
      address: parsed.address,
      secure: parsed.secure,
      invite: parsed.invite,
      server: data.server,
      memberId,
    });
    if (!result || !result.ok) {
      return {
        ok: false,
        error: result?.error ? translateError(result.error) : t('Nie udało się zapisać serwera.'),
      };
    }
    upsertServer(result.server);
    ensureServerState(result.server);
    selectServer(result.server.id);
    connectServer(result.server);
    focusInvitedChannel(result.server.id, parsed.channelId);
    return { ok: true, server: result.server };
  } catch (err) {
    return { ok: false, error: err?.message || t('Nie udało się dołączyć do serwera.') };
  }
}

async function joinServer() {
  const raw = $('serverInvite').value.trim();
  const errorEl = $('joinServerError');
  errorEl.textContent = '';
  const parsed = parseInvite(raw);
  if (!parsed) {
    errorEl.textContent = t('Wklej link zaproszenia, np. chill://192.168.1.5:47830/AB12CD lub https://chill.example.com/?invite=AB12CD.');
    return;
  }
  $('joinServerBtn').disabled = true;
  errorEl.textContent = t('Łączę…');
  const outcome = await joinServerInvite(raw);
  $('joinServerBtn').disabled = false;
  if (!outcome.ok) {
    errorEl.textContent = outcome.error;
    return;
  }
  closeServerModal();
  errorEl.textContent = '';
  if (outcome.known) toast(t('Już należysz do tego serwera'));
  else if (outcome.server) toast(t('Dołączono do „{name}”', { name: outcome.server.name }));
}

// ---------- Import z Discord ----------
function discordErrorText(result) {
  const messages = {
    'auth': 'Sesja wygasła. Zaloguj się ponownie.',
    'needs-setup': 'Najpierw podaj Client ID aplikacji Discord.',
    'invalid-client-id': 'Client ID musi składać się z 15–21 cyfr. Skopiuj Application ID z Discord Developer Portal.',
    'config-save': 'Nie udało się zapisać konfiguracji Discord na dysku.',
    'oauth-busy': 'Połączanie z Discord już trwa.',
    'needs-connect': 'Połącz się z Discord, aby zaimportować serwer.',
    'unauthorized': 'Sesja Discord wygasła. Połącz się ponownie.',
    'network': 'Brak połączenia z Discord. Sprawdź internet i spróbuj ponownie.',
    'rate-limit': 'Discord chwilowo ogranicza liczbę żądań. Spróbuj za chwilę.',
    'forbidden': 'Discord nie udostępnił wymaganych danych. Połącz ponownie i zaakceptuj dostęp do serwerów.',
    'not-owner': 'Nie jesteś właścicielem tego serwera Discord. Import dostępny jest tylko dla serwerów, które sam stworzyłeś.',
    'guild-missing': 'Nie znaleziono wybranego serwera Discord na Twoim koncie.',
    'invalid-template': 'Wklej poprawny link szablonu, np. https://discord.new/AbCd1234.',
    'template-error': 'Nie udało się pobrać szablonu Discord. Sprawdź link i spróbuj ponownie.',
    'template-mismatch': 'Ten szablon należy do innego serwera Discord. Wybierz szablon swojego serwera.',
    'already-imported': 'Serwer „{name}” został już zaimportowany.',
    'save-failed': 'Nie udało się zapisać zaimportowanego serwera na dysku.',
    'port-busy': 'Port 47831 jest zajęty. Zamknij program, który go używa, i spróbuj ponownie.',
    'timeout': 'Nie otrzymano odpowiedzi od Discord. Spróbuj ponownie.',
    'cancelled': 'Połączanie z Discord zostało anulowane.',
    'oauth-denied': 'Anulowano logowanie w Discord.',
    'oauth-failed': 'Discord odrzucił logowanie. Spróbuj ponownie.',
    'oauth-server': 'Nie udało się uruchomić lokalnego połączenia z Discord. Spróbuj ponownie.',
    'browser': 'Nie udało się otworzyć przeglądarki. Spróbuj ponownie.',
    'discord-error': 'Nie udało się pobrać danych z Discord. Spróbuj ponownie.',
  };
  const template = messages[result?.code];
  if (template) return t(template, { name: result?.serverName || '' });
  return result?.error ? translateError(result.error) : t('Nie udało się połączyć z Discord.');
}

function setDiscordSetupError(message = '') {
  const el = $('discordSetupError');
  if (el) el.textContent = message;
}

function setDiscordImportError(message = '') {
  const el = $('discordImportError');
  if (el) el.textContent = message;
}

function updateDiscordActionState() {
  const templateInput = $('discordTemplate');
  const guildSelect = $('discordGuildSelect');
  const hasGuild = Boolean(guildSelect?.value);
  const hasTemplate = Boolean(templateInput?.value.trim());
  const previewBtn = $('discordPreviewBtn');
  const importBtn = $('discordImportBtn');
  if (previewBtn) previewBtn.disabled = discordBusy || !hasGuild || !hasTemplate;
  if (importBtn) importBtn.disabled = discordBusy || !discordPreviewData;
  const guildDisabled = discordBusy || !discordGuilds.length;
  if (guildSelect) guildSelect.disabled = guildDisabled;
  for (const id of ['discordSaveConfigBtn', 'discordConnectBtn', 'discordDisconnectBtn', 'discordChangeConfig', 'discordSetupCancel']) {
    const button = $(id);
    if (button) button.disabled = discordBusy;
  }
  const clientInput = $('discordClientId');
  if (clientInput) clientInput.disabled = discordBusy;
  if (templateInput) templateInput.disabled = discordBusy;
}

function setDiscordBusy(busy, status = '') {
  discordBusy = Boolean(busy);
  const statusEl = $('discordStatus');
  if (statusEl) statusEl.textContent = discordBusy && status ? t(status) : '';
  updateDiscordActionState();
}

function renderDiscordPanel() {
  const hasConfig = Boolean(discordConfig.clientId);
  const setupVisible = !hasConfig || discordEditingConfig;
  $('discordSetup').hidden = !setupVisible;
  $('discordMain').hidden = setupVisible;
  $('discordChangeConfig').hidden = !hasConfig || setupVisible;
  $('discordSetupCancel').hidden = !hasConfig || !discordEditingConfig;
  $('discordAccount').hidden = !discordUser;
  $('discordLogin').hidden = Boolean(discordUser);
  $('discordWizard').hidden = !discordUser;

  if (discordUser) {
    $('discordAccountName').textContent = discordUser.displayName || discordUser.username || 'Discord';
    const avatar = $('discordAvatar');
    if (discordUser.avatarUrl) {
      avatar.textContent = '';
      avatar.style.backgroundImage = `url("${discordUser.avatarUrl}")`;
    } else {
      avatar.textContent = initial(discordUser.displayName || discordUser.username || 'D');
      avatar.style.backgroundImage = '';
    }
  }

  renderDiscordGuilds();
  renderDiscordPreview();
  updateDiscordActionState();
}

function renderDiscordGuilds() {
  const select = $('discordGuildSelect');
  if (!select) return;
  const previous = select.value;
  select.innerHTML = '';
  if (!discordGuilds.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = t('Brak własnych serwerów');
    select.appendChild(option);
  } else {
    for (const guild of discordGuilds) {
      const option = document.createElement('option');
      option.value = guild.id;
      option.textContent = guild.name;
      select.appendChild(option);
    }
    if (discordGuilds.some((guild) => guild.id === previous)) select.value = previous;
  }
  updateDiscordActionState();
}

function renderDiscordPreview() {
  const box = $('discordPreview');
  if (!box) return;
  box.innerHTML = '';
  if (!discordPreviewData) {
    box.hidden = true;
    updateDiscordActionState();
    return;
  }

  const data = discordPreviewData;
  box.hidden = false;

  const head = document.createElement('div');
  head.className = 'discord-preview-head';
  const title = document.createElement('strong');
  title.textContent = t('Kanały do importu: {count}', { count: data.channels.length });
  head.appendChild(title);
  if (data.name) {
    const name = document.createElement('span');
    name.textContent = t('Szablon: {name}', { name: data.name });
    head.appendChild(name);
  }
  box.appendChild(head);

  if (data.truncated) {
    const note = document.createElement('p');
    note.className = 'discord-preview-note';
    note.textContent = t('Szablon ma {total} kanałów — zaimportujemy pierwsze {count}.', {
      total: data.total,
      count: data.channels.length,
    });
    box.appendChild(note);
  }
  if (data.skipped > 0) {
    const note = document.createElement('p');
    note.className = 'discord-preview-note';
    note.textContent = t('Pominięto nieobsługiwane kanały: {count}.', { count: data.skipped });
    box.appendChild(note);
  }

  if (!data.channels.length) {
    const empty = document.createElement('p');
    empty.className = 'discord-preview-empty';
    empty.textContent = t('Ten szablon nie zawiera obsługiwanych kanałów — utworzymy kanał ogólny.');
    box.appendChild(empty);
    updateDiscordActionState();
    return;
  }

  const list = document.createElement('div');
  list.className = 'discord-channel-list';
  for (const channel of data.channels) {
    const row = document.createElement('div');
    row.className = 'discord-channel';
    const icon = document.createElement('span');
    icon.className = 'discord-channel-icon';
    icon.textContent = channel.type === 'voice' ? '🔊' : '#';
    const name = document.createElement('span');
    name.className = 'discord-channel-name';
    name.textContent = channel.name;
    const type = document.createElement('span');
    type.className = 'discord-channel-type';
    type.textContent = t(channel.type === 'voice' ? 'Głosowy' : 'Tekstowy');
    row.append(icon, name, type);
    list.appendChild(row);
  }
  box.appendChild(list);
  updateDiscordActionState();
}

function clearDiscordPreview() {
  discordPreviewData = null;
  renderDiscordPreview();
}

async function initDiscordPanel() {
  discordEditingConfig = false;
  discordPreviewData = null;
  discordBusy = false;
  discordUser = null;
  discordGuilds = [];
  setDiscordSetupError('');
  setDiscordImportError('');
  const statusEl = $('discordStatus');
  if (statusEl) statusEl.textContent = '';
  $('discordClientId').value = discordConfig.clientId || '';
  $('discordRedirectUri').textContent = discordConfig.redirectUri;
  renderDiscordPanel();

  if (!CHILL.discord) {
    setDiscordSetupError(t('Import z Discord jest niedostępny w tej wersji.'));
    return;
  }

  try {
    const info = await CHILL.discord.configGet();
    if (!info || !info.ok) {
      setDiscordSetupError(discordErrorText(info));
      return;
    }
    discordConfig.clientId = info.clientId || '';
    discordConfig.redirectUri = info.redirectUri || discordConfig.redirectUri;
    discordUser = info.connected ? info.user || null : null;
    discordGuilds = info.connected && Array.isArray(info.guilds) ? info.guilds : [];
    $('discordClientId').value = discordConfig.clientId;
    $('discordRedirectUri').textContent = discordConfig.redirectUri;
    renderDiscordPanel();
    if (discordUser && !discordGuilds.length) {
      setDiscordImportError(t('Nie masz serwerów, których jesteś właścicielem. Import dostępny jest tylko dla własnych serwerów.'));
    }
  } catch {
    setDiscordSetupError(t('Nie udało się połączyć z Discord.'));
  }
}

async function saveDiscordConfig() {
  if (discordBusy || !CHILL.discord) return;
  const clientId = $('discordClientId').value.trim();
  setDiscordSetupError('');
  if (!/^\d{15,21}$/.test(clientId)) {
    setDiscordSetupError(t('Client ID musi składać się z 15–21 cyfr. Skopiuj Application ID z Discord Developer Portal.'));
    $('discordClientId').focus();
    return;
  }

  setDiscordBusy(true, 'Zapisuję konfigurację…');
  try {
    const result = await CHILL.discord.configSet({ clientId });
    if (!result || !result.ok) {
      setDiscordSetupError(discordErrorText(result));
      return;
    }
    discordConfig.clientId = result.clientId || clientId;
    discordConfig.redirectUri = result.redirectUri || discordConfig.redirectUri;
    discordEditingConfig = false;
    discordUser = null;
    discordGuilds = [];
    setDiscordSetupError('');
    renderDiscordPanel();
  } catch {
    setDiscordSetupError(t('Nie udało się zapisać konfiguracji Discord na dysku.'));
    return;
  } finally {
    setDiscordBusy(false);
  }
  await connectDiscord();
}

async function connectDiscord() {
  if (discordBusy || !CHILL.discord) return;
  setDiscordImportError('');
  setDiscordSetupError('');
  setDiscordBusy(true, 'Czekam na potwierdzenie w przeglądarce…');
  try {
    const result = await CHILL.discord.connect();
    if ($('serverOverlay').hidden) return;
    if (!result || !result.ok) {
      if (result?.code === 'needs-setup' || result?.code === 'invalid-client-id') {
        discordEditingConfig = true;
        renderDiscordPanel();
        setDiscordSetupError(discordErrorText(result));
        return;
      }
      setDiscordImportError(discordErrorText(result));
      return;
    }
    discordUser = result.user || null;
    discordGuilds = Array.isArray(result.guilds) ? result.guilds : [];
    discordPreviewData = null;
    renderDiscordPanel();
    if (!discordGuilds.length) {
      setDiscordImportError(t('Nie masz serwerów, których jesteś właścicielem. Import dostępny jest tylko dla własnych serwerów.'));
    }
  } catch {
    if (!$('serverOverlay').hidden) setDiscordImportError(t('Nie udało się połączyć z Discord.'));
  } finally {
    setDiscordBusy(false);
  }
}

async function disconnectDiscord() {
  if (discordBusy || !CHILL.discord) return;
  setDiscordBusy(true);
  try { await CHILL.discord.disconnect(); } catch { /* ignore */ }
  discordUser = null;
  discordGuilds = [];
  discordPreviewData = null;
  setDiscordImportError('');
  setDiscordSetupError('');
  renderDiscordPanel();
  setDiscordBusy(false);
}

async function previewDiscordImport() {
  if (discordBusy || !CHILL.discord) return;
  const guildId = $('discordGuildSelect').value;
  const template = $('discordTemplate').value.trim();
  setDiscordImportError('');
  if (!guildId) {
    setDiscordImportError(t('Wybierz serwer Discord z listy.'));
    return;
  }
  if (!template) {
    setDiscordImportError(t('Wklej poprawny link szablonu, np. https://discord.new/AbCd1234.'));
    return;
  }

  discordPreviewData = null;
  renderDiscordPreview();
  setDiscordBusy(true, 'Sprawdzam szablon…');
  try {
    const result = await CHILL.discord.preview({ guildId, template });
    if ($('serverOverlay').hidden) return;
    if (!result || !result.ok) {
      setDiscordImportError(discordErrorText(result));
      return;
    }
    discordPreviewData = {
      ...result.template,
      guildId,
      templateInput: template,
    };
    renderDiscordPreview();
  } catch {
    if (!$('serverOverlay').hidden) setDiscordImportError(t('Nie udało się pobrać szablonu Discord. Sprawdź link i spróbuj ponownie.'));
  } finally {
    setDiscordBusy(false);
  }
}

async function importDiscordServer() {
  if (discordBusy || !discordPreviewData || !CHILL.discord) return;
  const { guildId, templateInput } = discordPreviewData;
  setDiscordImportError('');
  setDiscordBusy(true, 'Importuję serwer…');
  try {
    const result = await CHILL.discord.importServer({ guildId, template: templateInput });
    if (!result || !result.ok) {
      const message = discordErrorText(result);
      if ($('serverOverlay').hidden) toast(message);
      else setDiscordImportError(message);
      return;
    }
    upsertServer(result.server);
    const state = ensureServerState(result.server);
    state.server = result.server;
    closeServerModal();
    selectServer(result.server.id);
    connectServer(result.server);
    toast(t('Zaimportowano „{name}” (kanały: {count})', {
      name: result.server.name,
      count: result.server.channels.length,
    }));
  } catch {
    if (!$('serverOverlay').hidden) setDiscordImportError(t('Nie udało się zapisać zaimportowanego serwera na dysku.'));
  } finally {
    setDiscordBusy(false);
  }
}

function createChannelFromForm(e) {
  e.preventDefault();
}

function serverShareBase(state) {
  return state.server.shareLink
    || `chill://${state.server.address}/${state.server.invite}${state.server.secure ? '?tls=1' : ''}`;
}

function appendChannelToLink(link, channel) {
  const base = String(link || '');
  if (!base || !channel?.id) return base;
  return `${base}${base.includes('?') ? '&' : '?'}channel=${encodeURIComponent(channel.id)}`;
}

function inviteAppLink(webLink, invite) {
  const base = String(webLink || '');
  if (!base) return '';
  if (base.startsWith('chill://')) return base;
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    const code = String(invite || url.searchParams.get('invite') || '').trim();
    if (!code) return '';
    return `chill://${url.host}/${encodeURIComponent(code)}${url.protocol === 'https:' ? '?tls=1' : ''}`;
  } catch {
    return '';
  }
}

function updateInviteLinks(state, link, channel) {
  const webLink = String(link || '');
  if ($('inviteLink')) $('inviteLink').textContent = webLink;
  const app = channel ? appendChannelToLink(inviteAppLink(webLink, state.server.invite), channel) : inviteAppLink(webLink, state.server.invite);
  const box = $('inviteAppBox');
  if (box) box.hidden = !app;
  if ($('inviteAppLink')) $('inviteAppLink').textContent = app;
}

function channelShareLink(state, channel) {
  return appendChannelToLink(serverShareBase(state), channel);
}

async function resolveServerInviteWithin(state, timeoutMs) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, timeout: true }), timeoutMs);
  });
  try {
    return await Promise.race([resolveServerInvite(state), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function copyChannelInvite(state, channel) {
  let base = serverShareBase(state);
  let internet = null;
  if (state.you?.owner && CHILL.servers?.invite) {
    toast(t('Przygotowuję link…'));
    const result = await resolveServerInviteWithin(state, 15_000);
    if (result?.ok && result.shareLink) {
      base = result.shareLink;
      internet = Boolean(result.internet);
    }
  }
  try {
    await copyText(appendChannelToLink(base, channel));
    if (internet === false) toast(t('Dostęp z internetu niedostępny — skopiowano link lokalny.'));
    else toast(t('Skopiowano link do kanału.'));
  } catch {
    toast(t('Nie udało się skopiować linku.'));
  }
}

function focusInvitedChannel(serverId, channelId) {
  if (!channelId) return;
  const state = serverState(serverId);
  if (!state) return;
  state.pendingChannelId = channelId;
  if (state.channels.some((channel) => channel.id === channelId)) {
    state.pendingChannelId = '';
    selectChannel(channelId);
  }
}

async function resolveServerInvite(state) {
  if (!state || !CHILL.servers?.invite) return null;
  try {
    const result = await CHILL.servers.invite({ id: state.server.id });
    if (result?.ok && result.shareLink) state.server.shareLink = result.shareLink;
    return result || null;
  } catch (error) {
    return { ok: false, error: String(error?.message || error || '') };
  }
}

async function openInviteModal(channel = null) {
  const state = serverState(activeServerId);
  if (!state) return;
  const seq = ++inviteRequestSeq;
  inviteChannel = channel?.id ? channel : null;
  const invitedChannel = inviteChannel;
  const owner = Boolean(state.you?.owner);
  $('inviteOverlay').hidden = false;
  if ($('inviteTitle')) $('inviteTitle').textContent = invitedChannel ? t('Zaproś do kanału') : t('Zaproś do serwera');
  $('inviteServerName').textContent = invitedChannel
    ? `${state.server.name} • #${invitedChannel.name}`
    : state.server.name;
  $('inviteSaved').textContent = '';
  if ($('inviteHint')) {
    $('inviteHint').textContent = CHILL.web
      ? t('Wyślij ten link znajomemu. Otworzy go w przeglądarce i dołączy do serwera po zalogowaniu.')
      : t('Wyślij ten link znajomemu. Musi mieć uruchomiony Chill i wpisać go w oknie "Dołącz kodem".');
  }
  $('leaveServerBtn').textContent = owner ? t('Usuń serwer') : t('Opuść serwer');
  resetLeaveConfirm();
  const link = (base) => invitedChannel ? appendChannelToLink(base, invitedChannel) : base;
  updateInviteLinks(state, link(serverShareBase(state)), invitedChannel);

  const statusEl = $('inviteNetworkStatus');
  const retryBtn = $('retryInviteTunnel');
  const copyBtn = $('copyInviteBtn');
  if (statusEl) {
    statusEl.hidden = false;
    statusEl.classList.remove('error');
    statusEl.textContent = owner
      ? t('Przygotowuję link internetowy… Pierwsze uruchomienie może potrwać chwilę.')
      : t('Link pochodzi od właściciela serwera.');
  }
  if (retryBtn) retryBtn.hidden = true;
  if (copyBtn) copyBtn.disabled = owner;

  if (!CHILL.servers?.invite) {
    if (copyBtn) copyBtn.disabled = false;
    return;
  }
  const result = await resolveServerInvite(state);
  if (seq !== inviteRequestSeq) return;
  if (copyBtn) copyBtn.disabled = false;
  if (result?.ok && result.shareLink) updateInviteLinks(state, link(result.shareLink), invitedChannel);

  if (owner) {
    if (result?.internet) {
      if (statusEl) statusEl.textContent = t('Link działa przez internet. Możesz wysłać go każdemu.');
    } else {
      if (statusEl) {
        statusEl.textContent = t('Nie udało się włączyć dostępu z internetu. Link działa tylko w sieci lokalnej.');
        statusEl.classList.add('error');
      }
      if (retryBtn) retryBtn.hidden = false;
    }
  } else if (statusEl) {
    statusEl.textContent = result?.internet
      ? t('Link działa przez internet.')
      : t('Link działa tylko w sieci lokalnej.');
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
  $('leaveServerBtn').textContent = state?.you?.owner ? t('Usuń serwer') : t('Opuść serwer');
  $('leaveServerBtn').disabled = false;
}

async function leaveActiveServer(force = false) {
  const state = serverState(activeServerId);
  if (!state) return;
  if (!leaveArmed && !force) {
    leaveArmed = true;
    $('leaveServerBtn').textContent = state.you?.owner ? t('Kliknij ponownie, aby usunąć') : t('Kliknij ponownie, aby opuścić');
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
      toast(result?.error ? translateError(result.error) : t('Nie udało się opuścić serwera.'));
      resetLeaveConfirm();
      return;
    }
    $('inviteOverlay').hidden = true;
    removeServerLocally(id);
    toast(deleted ? t('Serwer został usunięty') : t('Opuszczono serwer'));
  } catch {
    toast(t('Wystąpił błąd. Spróbuj ponownie.'));
    resetLeaveConfirm();
  }
}

function isValidConversation() {
  if (current.kind === 'dm') return Boolean(dmEntry(current.id));
  if (current.kind === 'server') {
    const state = serverState(current.serverId);
    return Boolean(state && state.channels.some((channel) => channel.id === current.id));
  }
  return current.kind === 'home' || current.kind === 'minigames';
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
  closeServerMenu();
  resetVoiceSession();
  clearPendingAttachment();
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
      voiceRooms: new Map(),
      spotifyRooms: new Map(),
      voiceKey: '',
      error: '',
      reconnectTimer: null,
      attempts: 0,
      lastChannelId: null,
      pendingChannelId: '',
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
      if (result?.error) toast(translateError(result.error));
      return;
    }
    servers = Array.isArray(result.servers) ? result.servers : [];
    renderServers();
    for (const server of servers) connectServer(server);
    if (activeServerId && !servers.some((server) => server.id === activeServerId)) selectHome();
    else renderSidebar();
  } catch {
    toast(t('Nie udało się wczytać serwerów.'));
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
  closeServerMenu();
  resetVoiceSession();
  activeServerId = null;
  current = { kind: 'home' };
  hideMentionPop();
  typingUsers.clear();
  searchQuery = '';
  $('conversationSearch').value = '';
  $('messageSearch').value = '';
  $('searchBar').hidden = true;
  $('messages').classList.remove('searching');
  renderSidebar();
  renderHeader();
  renderMessages(false);
  renderMembers();
  updateComposer();
  updateBadges();
}

function selectMiniGames() {
  closeServerMenu();
  resetVoiceSession();
  activeServerId = null;
  current = { kind: 'minigames' };
  hideMentionPop();
  typingUsers.clear();
  searchQuery = '';
  $('conversationSearch').value = '';
  $('messageSearch').value = '';
  $('searchBar').hidden = true;
  $('messages').classList.remove('searching');
  renderSidebar();
  renderHeader();
  renderMessages(false);
  renderMembers();
  updateComposer();
  updateBadges();
  $('messages').scrollTop = 0;
}

function selectServer(id) {
  const server = servers.find((item) => item.id === id);
  if (!server) return;
  closeServerMenu();
  resetVoiceSession();
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
  closeServerMenu();
  resetVoiceSession();
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
  $('conversationSearch').placeholder = t(state ? 'Szukaj kanału' : 'Szukaj rozmowy');
  const activeChannel = state && current.kind === 'server' && current.serverId === state.server.id
    ? state.channels.find((channel) => channel.id === current.id)
    : null;
  $('inviteBtn').hidden = !state || activeChannel?.type === 'voice';
  if (state) {
    $('serverBannerName').textContent = state.server.name;
    $('serverBannerAvatar').textContent = state.server.icon || initial(state.server.name);
    $('serverBannerAvatar').style.background = safeColor(state.server.color, 'var(--panel-2)');
    $('serverOwnerPill').hidden = !state.you?.owner;
    $('addChannelBtn').hidden = !(state.you?.owner && state.status === 'online');
    renderChannels();
  } else {
    renderDmList();
  }
  renderServers();
  const miniGamesBtn = $('miniGamesBtn');
  if (miniGamesBtn) miniGamesBtn.classList.toggle('active', current.kind === 'minigames');
  updateMiniGamesBadge();
  renderVoiceConnectedPanel();
  if (!$('serverMenu').hidden) renderServerMenu();
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
    button.title = `${server.name}${state?.status === 'online' ? '' : state?.status === 'connecting' ? ` — ${t('łączenie…')}` : ` — ${t('Offline').toLowerCase()}`}`;
    button.innerHTML = `
      <span class="server-avatar" style="background:linear-gradient(145deg, ${esc(color)}, color-mix(in srgb, ${esc(color)} 55%, #7cc8ff))">${esc(server.icon || initial(server.name))}</span>
      ${count ? `<span class="server-badge">${count > 99 ? '99+' : count}</span>` : ''}
      ${state?.status === 'online' ? '' : '<span class="server-status-dot"></span>'}
    `;
    button.addEventListener('click', () => selectServer(server.id));
    container.appendChild(button);
  }

  $('homeBtn').classList.toggle('active', activeServerId === null && current.kind !== 'minigames');
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
  const activeChannelId = current.kind === 'server' && current.serverId === state.server.id ? current.id : '';
  const list = state.channels
    .map((channel, index) => ({
      channel,
      index,
      settings: channelSettings(state.server.id, channel.id),
    }))
    .filter(({ channel, settings }) => {
      if (query && !channel.name.toLowerCase().includes(query)) return false;
      const active = channel.id === activeChannelId;
      if (!prefs.showAllChannels && channel.type === 'voice' && !active) {
        if (!voiceParticipants(state, channel.id).length && !liveVoiceConnectedHere(state.server.id, channel.id)) return false;
      }
      if (prefs.hideMutedChannels && settings.muted && !active) {
        if (!(unread.get(`server:${state.server.id}:${channel.id}`) || 0)) return false;
      }
      return true;
    })
    .sort((a, b) => Number(b.settings.pinned) - Number(a.settings.pinned) || a.index - b.index);
  container.innerHTML = '';

  if (!list.length) {
    let label = t('Łączę z serwerem…');
    if (state.status === 'online') {
      label = state.channels.length ? t('Wszystkie kanały są ukryte.') : t('Brak kanałów');
    }
    container.innerHTML = `<div class="nav-empty">${esc(label)}</div>`;
    return;
  }

  for (const entry of list) {
    const { channel, settings } = entry;
    const key = `server:${state.server.id}:${channel.id}`;
    const isActive = current.kind === 'server' && current.serverId === state.server.id && current.id === channel.id;
    const count = isActive ? 0 : unread.get(key) || 0;
    const voice = channel.type === 'voice';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `nav-item${voice ? ' voice-channel' : ''}${isActive ? ' active' : ''}${count ? ' unread' : ''}${settings.pinned ? ' pinned' : ''}${settings.muted ? ' muted' : ''}`;
    button.title = voice ? t('Kanał głosowy') : `#${channel.name}`;
    if (state.you?.owner) button.setAttribute('aria-haspopup', 'menu');
    button.innerHTML = `
      <span class="nav-icon${voice ? ' voice-icon' : ''}">${voice ? '🔊' : '#'}</span>
      <span class="nav-label">${esc(channel.name)}</span>
      ${settings.pinned ? `<span class="nav-pin" title="${esc(t('Przypięty'))}" aria-hidden="true">📌</span>` : ''}
      ${settings.muted ? `<span class="nav-muted" title="${esc(t('Wyciszony'))}" aria-hidden="true">🔇</span>` : ''}
      ${count ? `<span class="nav-badge">${count > 99 ? '99+' : count}</span>` : ''}
    `;
    button.addEventListener('click', (event) => {
      if (voice) {
        selectChannel(channel.id);
        joinLiveVoice(state.server.id, channel.id);
        return;
      }
      if (!state.you?.owner) {
        selectChannel(channel.id);
        return;
      }
      openChannelMenu(event, channel);
      selectChannel(channel.id);
    });
    button.addEventListener('contextmenu', (e) => {
      if (!state.you?.owner) return;
      openChannelMenu(e, channel);
    });
    button.addEventListener('keydown', (event) => {
      if (!state.you?.owner) return;
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        openChannelMenu(event, channel);
      }
    });
    container.appendChild(button);

    if (voice) {
      const participants = voiceParticipants(state, channel.id);
      const connectedHere = liveVoiceConnectedHere(state.server.id, channel.id);
      if (participants.length || connectedHere) {
        const group = document.createElement('div');
        group.className = 'voice-members';
        for (const participant of participants) {
          const speaking = liveVoiceSpeaking.get(participant.memberId)?.active;
          const row = document.createElement('button');
          row.type = 'button';
          row.className = `voice-member${speaking ? ' speaking' : ''}`;
          row.dataset.voiceMember = participant.memberId;
          row.title = participant.name;
          const flags = [
            participant.sharing ? `<span class="voice-member-flag sharing" title="${esc(t('Udostępnia ekran'))}">${VOICE_SVGS.screen}</span>` : '',
            participant.muted ? `<span class="voice-member-flag" title="${esc(t('Mikrofon wyłączony'))}">${VOICE_SVGS.micOff}</span>` : '',
            participant.deafened ? `<span class="voice-member-flag" title="${esc(t('Słuchawki wyłączone'))}">${VOICE_SVGS.headphonesOff}</span>` : '',
          ].join('');
          row.innerHTML = `
            <span class="voice-member-avatar" style="background:${esc(participant.color)}">${esc(initial(participant.name))}</span>
            <span class="voice-member-name">${esc(participant.name)}</span>
            ${flags ? `<span class="voice-member-flags">${flags}</span>` : ''}
          `;
          row.addEventListener('click', () => {
            openServerProfile(state.server.id, participant.memberId, participant);
          });
          group.appendChild(row);
        }
        const invite = document.createElement('button');
        invite.type = 'button';
        invite.className = 'voice-invite-row';
        invite.innerHTML = `
          <span class="voice-invite-ico" aria-hidden="true">+</span>
          <span>${esc(t('Zaproś na kanał głosowy'))}</span>
          <span class="voice-invite-arrow" aria-hidden="true">›</span>
        `;
        invite.addEventListener('click', () => { void openInviteModal(channel); });
        group.appendChild(invite);
        container.appendChild(group);
      }
    }
  }
}

function friendsKey() {
  return `chill.friends.${myId}`;
}

function loadFriends() {
  try {
    const stored = JSON.parse(localStorage.getItem(friendsKey()) || '[]');
    friends = Array.isArray(stored)
      ? stored.filter((item) => item && item.kind === 'server' && item.dmId && item.serverId && item.memberId)
      : [];
  } catch {
    friends = [];
  }
}

function saveFriends() {
  try {
    localStorage.setItem(friendsKey(), JSON.stringify(friends));
  } catch { /* ignore */ }
}

function serverFriendId(serverId, memberId) {
  return `srv:${serverId}:${memberId}`;
}

function accountById(id) {
  return allUsers.find((user) => user.id === id) || null;
}

function isAccountFriend(id) {
  return Boolean(id) && friendState.friends.includes(id);
}

function incomingFriendRequest(id) {
  return (friendState.incoming || []).find((item) => item.id === id) || null;
}

function outgoingFriendRequest(id) {
  return (friendState.outgoing || []).find((item) => item.id === id) || null;
}

function sendFriendAction(type, payload = {}) {
  if (!wsReady()) {
    toast(t('Łączę z serwerem — spróbuj za chwilę.'));
    return false;
  }
  ws.send(JSON.stringify({ type, ...payload }));
  return true;
}

function requestAccountFriend(id) {
  if (!id || id === myId) return;
  if (isAccountFriend(id)) return;
  if (outgoingFriendRequest(id)) {
    toast(t('Zaproszenie wysłane'));
    return;
  }
  if (incomingFriendRequest(id)) {
    sendFriendAction('friends:accept', { from: id });
    return;
  }
  if (sendFriendAction('friends:request', { to: id })) toast(t('Zaproszenie wysłane'));
}

function acceptAccountFriend(id) {
  if (!id) return;
  sendFriendAction('friends:accept', { from: id });
}

function declineAccountFriend(id) {
  if (!id) return;
  sendFriendAction('friends:decline', { from: id });
  toast(t('Odrzucono zaproszenie.'));
}

function removeAccountFriend(id) {
  if (!id) return;
  sendFriendAction('friends:remove', { id });
  toast(t('Usunięto znajomego.'));
}

function friendByDmId(dmId) {
  return friends.find((item) => item.dmId === dmId) || null;
}

function friendByServerMember(serverId, memberId) {
  return friends.find((item) => item.kind === 'server' && item.serverId === serverId && item.memberId === memberId) || null;
}

function serverFriendDisplay(friend) {
  const state = serverState(friend.serverId);
  const member = state?.members.find((item) => item.id === friend.memberId);
  const online = Boolean(member?.online);
  return {
    dmId: friend.dmId,
    name: member?.name || friend.name || t('Znajomy'),
    avatar: member?.avatar || friend.avatar || '',
    color: safeColor(member?.color || friend.color, '#3ee0a3'),
    online,
    owner: Boolean(member?.owner),
    serverId: friend.serverId,
    memberId: friend.memberId,
    serverName: state?.server?.name || friend.serverName || t('Serwer'),
    serverOnline: state?.status === 'online',
    playing: online ? String(member?.playing || '').trim() || null : null,
    playingIcon: online ? safeGameIcon(member?.playingIcon) : '',
    playingPlatform: online ? safeGamePlatform(member?.playingPlatform) : '',
  };
}

function dmEntry(dmId) {
  const friend = friendByDmId(dmId);
  if (friend) {
    return { ...serverFriendDisplay(friend), kind: 'server', friend, username: '', about: '' };
  }
  const user = allUsers.find((item) => item.id === dmId);
  if (!user) return null;
  return {
    dmId,
    kind: 'local',
    friend: null,
    name: user.name,
    username: user.username,
    avatar: user.avatar,
    color: user.color,
    online: Boolean(user.online),
    status: user.online ? user.status : 'offline',
    about: user.about || '',
    playing: user.online ? String(user.playing || '').trim() || null : null,
    playingIcon: user.online ? safeGameIcon(user.playingIcon) : '',
    playingPlatform: user.online ? safeGamePlatform(user.playingPlatform) : '',
    serverName: '',
    serverOnline: true,
  };
}

function upsertServerFriend(serverId, member) {
  if (!serverId || !member?.id) return null;
  const dmId = serverFriendId(serverId, member.id);
  let friend = friends.find((item) => item.dmId === dmId);
  const serverName = serverState(serverId)?.server?.name || '';
  if (!friend) {
    friend = {
      kind: 'server',
      dmId,
      serverId,
      memberId: member.id,
      name: String(member.name || t('Znajomy')).slice(0, 32),
      color: safeColor(member.color, '#3ee0a3'),
      serverName,
      addedAt: Date.now(),
    };
    friends.push(friend);
  } else {
    if (member.name) friend.name = String(member.name).slice(0, 32);
    if (member.color) friend.color = safeColor(member.color, '#3ee0a3');
    if (serverName) friend.serverName = serverName;
  }
  saveFriends();
  return friend;
}

function syncServerFriends(serverId) {
  const state = serverState(serverId);
  if (!state) return;
  let changed = false;
  for (const friend of friends) {
    if (friend.serverId !== serverId) continue;
    const member = state.members.find((item) => item.id === friend.memberId);
    if (!member) continue;
    const name = String(member.name || friend.name).slice(0, 32);
    const color = safeColor(member.color, friend.color);
    if (friend.name !== name || friend.color !== color) {
      friend.name = name;
      friend.color = color;
      changed = true;
    }
  }
  if (state.server?.name) {
    for (const friend of friends) {
      if (friend.serverId !== serverId || friend.serverName === state.server.name) continue;
      friend.serverName = state.server.name;
      changed = true;
    }
  }
  if (changed) saveFriends();
}

function renderDmList() {
  const container = $('dmList');
  if (!container) return;
  const query = $('conversationSearch').value.trim().toLowerCase();
  const entries = [];
  const seen = new Set();

  for (const id of friendState.friends || []) {
    const user = accountById(id);
    if (!user || user.id === myId || seen.has(user.id)) continue;
    seen.add(user.id);
    const status = user.online ? user.status : 'offline';
    const playing = user.online ? String(user.playing || '').trim() : '';
    entries.push({
      kind: 'dm',
      dmId: user.id,
      name: user.name,
      avatar: user.avatar,
      color: user.color,
      online: Boolean(user.online),
      status,
      playing: playing || null,
      playingIcon: playing ? safeGameIcon(user.playingIcon) : '',
      sub: playing ? t('Gra w {game}', { game: playing }) : statusLabel(status),
      search: `${user.name} ${user.username || ''}`,
      sortGroup: 0,
    });
  }

  for (const friend of friends.filter((item) => item.kind === 'server')) {
    if (seen.has(friend.memberId) || accountById(friend.memberId)) continue;
    const info = serverFriendDisplay(friend);
    seen.add(info.dmId);
    entries.push({
      kind: 'dm',
      dmId: friend.dmId,
      name: info.name,
      avatar: '',
      color: info.color,
      online: info.online,
      status: info.online ? 'online' : 'offline',
      playing: info.playing,
      playingIcon: info.playingIcon,
      sub: `${info.serverName} • ${info.online ? t('Online') : t('Offline')}`,
      search: `${info.name} ${info.serverName}`,
      sortGroup: 0,
    });
  }

  for (const request of friendState.incoming || []) {
    const user = accountById(request.id);
    if (!user || seen.has(`${user.id}:in`) || user.id === myId) continue;
    seen.add(`${user.id}:in`);
    entries.push({
      kind: 'incoming',
      requestId: user.id,
      name: user.name,
      avatar: user.avatar,
      color: user.color,
      online: Boolean(user.online),
      status: user.online ? user.status : 'offline',
      sub: t('Zaproszenie do znajomych'),
      search: `${user.name} ${user.username || ''}`,
      sortGroup: 1,
    });
  }

  for (const request of friendState.outgoing || []) {
    const user = accountById(request.id);
    if (!user || seen.has(`${user.id}:out`) || user.id === myId) continue;
    seen.add(`${user.id}:out`);
    entries.push({
      kind: 'outgoing',
      requestId: user.id,
      name: user.name,
      avatar: user.avatar,
      color: user.color,
      online: Boolean(user.online),
      status: user.online ? user.status : 'offline',
      sub: t('Zaproszenie oczekuje'),
      search: `${user.name} ${user.username || ''}`,
      sortGroup: 2,
    });
  }

  const filtered = entries
    .filter((entry) => !query || entry.search.toLowerCase().includes(query))
    .sort((a, b) => (a.sortGroup - b.sortGroup)
      || Number(b.online) - Number(a.online)
      || a.name.localeCompare(b.name, prefs.lang === 'en' ? 'en' : 'pl'));

  container.innerHTML = '';
  if (!filtered.length) {
    container.innerHTML = `<div class="nav-empty">${esc(t('Brak znajomych — dodaj osobę z listy członków'))}</div>`;
    return;
  }

  for (const entry of filtered) {
    if (entry.kind !== 'dm') {
      const row = document.createElement('div');
      row.className = `nav-request ${entry.kind}`;
      row.innerHTML = `
        <span class="nav-avatar">
          <span class="status-dot ${esc(entry.status)}"></span>
        </span>
        <span class="nav-label">${esc(entry.name)}<span class="nav-sub">${esc(entry.sub)}</span></span>
      `;
      applyAvatar(row.querySelector('.nav-avatar'), entry.name, entry.color, entry.avatar);
      if (entry.kind === 'incoming') {
        const actions = document.createElement('span');
        actions.className = 'nav-request-actions';
        const accept = document.createElement('button');
        accept.type = 'button';
        accept.className = 'nav-request-btn accept';
        accept.title = t('Akceptuj');
        accept.setAttribute('aria-label', t('Akceptuj'));
        accept.textContent = '✓';
        accept.addEventListener('click', (event) => {
          event.stopPropagation();
          acceptAccountFriend(entry.requestId);
        });
        const decline = document.createElement('button');
        decline.type = 'button';
        decline.className = 'nav-request-btn decline';
        decline.title = t('Odrzuć');
        decline.setAttribute('aria-label', t('Odrzuć'));
        decline.textContent = '✕';
        decline.addEventListener('click', (event) => {
          event.stopPropagation();
          declineAccountFriend(entry.requestId);
        });
        actions.append(accept, decline);
        row.appendChild(actions);
      } else {
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'nav-request-cancel';
        cancel.title = t('Anuluj zaproszenie');
        cancel.setAttribute('aria-label', t('Anuluj zaproszenie'));
        cancel.textContent = '✕';
        cancel.addEventListener('click', (event) => {
          event.stopPropagation();
          removeAccountFriend(entry.requestId);
        });
        row.appendChild(cancel);
      }
      container.appendChild(row);
      continue;
    }

    const key = `dm:${entry.dmId}`;
    const isActive = current.kind === 'dm' && current.id === entry.dmId;
    const count = isActive ? 0 : unread.get(key) || 0;
    const subHtml = entry.playing ? activitySubHtml(entry.playing, entry.playingIcon) : esc(entry.sub);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `nav-item${isActive ? ' active' : ''}${count ? ' unread' : ''}`;
    button.innerHTML = `
      <span class="nav-avatar">
        <span class="status-dot ${esc(entry.status)}"></span>
      </span>
      <span class="nav-label">${esc(entry.name)}<span class="nav-sub${entry.playing ? ' playing' : ''}">${subHtml}</span></span>
      ${count ? `<span class="nav-badge">${count > 99 ? '99+' : count}</span>` : ''}
    `;
    applyAvatar(button.querySelector('.nav-avatar'), entry.name, entry.color, entry.avatar);
    button.addEventListener('click', () => selectConversation('dm', entry.dmId));
    container.appendChild(button);
  }
}

function renderMembers() {
  const container = $('userList');
  if (!container) return;
  const state = activeServerId ? serverState(activeServerId) : null;

  if (state) {
    const sorted = [...state.members].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, prefs.lang === 'en' ? 'en' : 'pl'));
    const online = sorted.filter((member) => member.online).length;
    $('onlineBadge').textContent = String(online);
    $('onlineBadge').classList.toggle('empty', online === 0);
    container.innerHTML = '';
    if (!sorted.length) {
      container.innerHTML = `<div class="nav-empty">${esc(t('Brak członków'))}</div>`;
      return;
    }
    for (const member of sorted) {
      const status = member.online ? 'online' : 'offline';
      const playing = member.online ? String(member.playing || '').trim() : '';
      const sub = member.owner ? t('Właściciel serwera') : member.online ? t('Online') : t('Offline');
      const subHtml = playing ? activitySubHtml(playing, member.playingIcon) : esc(sub);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'member';
      item.innerHTML = `
        <span class="member-avatar">
          <span class="status-dot ${esc(status)}"></span>
        </span>
        <span class="member-info">
          <strong>${esc(member.name)}${member.id === state.you?.memberId ? ` ${esc(t('(Ty)'))}` : ''}</strong>
          <small class="${playing ? 'playing' : ''}">${subHtml}</small>
        </span>
      `;
      applyAvatar(item.querySelector('.member-avatar'), member.name, member.color, member.avatar);
      if (member.id === state.you?.memberId) item.addEventListener('click', () => openSettings('profile'));
      else item.addEventListener('click', () => openServerProfile(state.server.id, member.id, member));
      container.appendChild(item);
    }
    return;
  }

  const online = allUsers.filter((u) => u.online);
  $('onlineBadge').textContent = String(online.length);
  $('onlineBadge').classList.toggle('empty', online.length === 0);

  const sorted = [...allUsers].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, prefs.lang === 'en' ? 'en' : 'pl'));
  container.innerHTML = '';
  for (const user of sorted) {
    const status = user.online ? user.status : 'offline';
    const playing = user.online ? String(user.playing || '').trim() : '';
    const sub = playing ? t('Gra w {game}', { game: playing }) : statusLabel(status);
    const subHtml = playing ? activitySubHtml(playing, user.playingIcon) : esc(sub);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'member';
    item.innerHTML = `
      <span class="member-avatar">
        <span class="status-dot ${esc(status)}"></span>
      </span>
      <span class="member-info">
        <strong>${esc(user.name)}${user.id === myId ? ` ${esc(t('(Ty)'))}` : ''}</strong>
        <small class="${playing ? 'playing' : ''}">${subHtml}</small>
      </span>
    `;
    applyAvatar(item.querySelector('.member-avatar'), user.name, user.color, user.avatar);
    item.addEventListener('click', () => {
      if (user.id === myId) openSettings('profile');
      else openLocalProfile(user.id, user);
    });
    container.appendChild(item);
  }
}

const PROFILE_BADGES = {
  piwo: { label: 'PIWO', icon: '🍺' },
  chill: { label: 'CHILL', icon: '❄️' },
  og: { label: 'OG', icon: '🌿' },
  vip: { label: 'VIP', icon: '💎' },
  dev: { label: 'DEV', icon: '🛠️' },
};

const BANNER_PRESETS = {
  black: { label: 'Czarny', colors: ['#000000', '#050807'] },
  mint: { label: 'Mięta', colors: ['#06241b', '#3ee0a3'] },
  ocean: { label: 'Ocean', colors: ['#071a33', '#2f9fe0'] },
  sunset: { label: 'Zachód', colors: ['#2b142b', '#ff7aa2'] },
  forest: { label: 'Las', colors: ['#071e14', '#7fb069'] },
  neon: { label: 'Neon', colors: ['#150a2a', '#b8a1ff'] },
};

const PROFILE_IMAGE_RE = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i;
const GAME_ICON_RE = /^data:image\/png;base64,[a-z0-9+/=]+$/i;
const GAME_ICON_MAX = 120_000;
const GAME_PLATFORMS = new Set([
  'medal', 'steam', 'roblox', 'epic', 'gog', 'xbox', 'ea', 'ubisoft',
  'battlenet', 'riot', 'minecraft', 'itch', 'other',
]);
const AVATAR_PRESETS = ['🐱', '🦊', '🐼', '🐸', '🦉', '🐺', '🦄', '👾'];
const GAME_ICON_RULES = [
  [/roblox/i, '🧱'], [/minecraft/i, '⛏️'], [/counter-strike|\bcs2\b|cs:go/i, '🔫'],
  [/fortnite/i, '🪂'], [/valorant/i, '🎯'], [/league of legends/i, '⚔️'],
  [/grand theft auto|\bgta\b/i, '🚗'], [/rocket league/i, '⚽'], [/among us/i, '👾'],
  [/genshin/i, '🌸'], [/elden ring/i, '🗡️'], [/cyberpunk/i, '🌆'], [/\bosu!/i, '🎵'],
  [/apex/i, '🪂'], [/overwatch/i, '🛡️'], [/\brust\b/i, '⛏️'], [/dota/i, '🛡️'],
  [/palworld/i, '🐾'], [/medal/i, '🏅'],
];

function safeProfileAvatar(value) {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= 260_000 && PROFILE_IMAGE_RE.test(text)) return text;
  if (text.length <= 24 && !/[\u0000-\u001f<>"'&]/u.test(text)) return text;
  return '';
}

function safeGameIcon(value) {
  const text = String(value || '');
  if (!text || text.length > GAME_ICON_MAX || !GAME_ICON_RE.test(text)) return '';
  return text;
}

function safeGamePlatform(value) {
  const platform = String(value || '').toLowerCase();
  return GAME_PLATFORMS.has(platform) ? platform : '';
}

function normalizeActivity(data) {
  if (typeof data === 'string') {
    const name = String(data).replace(/\s+/g, ' ').trim().slice(0, 40);
    return { name: name || null, icon: '', platform: '' };
  }
  if (!data || typeof data !== 'object') return { name: null, icon: '', platform: '' };
  const name = String(data.name || data.playing || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return {
    name: name || null,
    icon: safeGameIcon(data.icon || data.playingIcon),
    platform: safeGamePlatform(data.platform || data.playingPlatform),
  };
}

const DEFAULT_PROFILE_BANNER = { kind: 'preset', preset: 'black' };

function safeProfileBanner(value) {
  if (!value || typeof value !== 'object') return { ...DEFAULT_PROFILE_BANNER };
  if (value.kind === 'preset' && BANNER_PRESETS[value.preset]) {
    return { kind: 'preset', preset: value.preset };
  }
  if (value.kind === 'image' && value.image && String(value.image).length <= 720_000 && PROFILE_IMAGE_RE.test(String(value.image))) {
    return { kind: 'image', image: String(value.image) };
  }
  if (value.kind === 'custom') {
    const colors = Array.isArray(value.colors) ? value.colors : [];
    const pattern = ['none', 'dots', 'grid', 'waves', 'stars', 'diagonal'].includes(value.pattern) ? value.pattern : 'none';
    const emoji = String(value.emoji || '').trim().slice(0, 24);
    return {
      kind: 'custom',
      colors: [safeColor(colors[0], '#07110d'), safeColor(colors[1], '#3ee0a3')],
      pattern,
      emoji: /[\u0000-\u001f<>"'&]/u.test(emoji) ? '' : emoji,
    };
  }
  return { ...DEFAULT_PROFILE_BANNER };
}

function handleForProfile(user) {
  const stored = String(user?.handle || '').trim().toLowerCase();
  if (/^[a-z0-9_.]{3,32}$/.test(stored)) return stored;
  const base = String(user?.username || user?.name || 'osoba').toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20) || 'osoba';
  const digits = String(user?.id || '').replace(/\D/g, '');
  const suffix = (digits.slice(-5) || String(Date.now()).slice(-5)).padStart(5, '0');
  return `${base}_${suffix}`.slice(0, 32);
}

function applyAvatar(el, name, color, avatar) {
  if (!el) return;
  const value = safeProfileAvatar(avatar);
  const statusDot = el.querySelector(':scope > .status-dot');
  el.classList.toggle('avatar-photo', Boolean(value && PROFILE_IMAGE_RE.test(value)));
  el.classList.toggle('avatar-emoji', Boolean(value && !PROFILE_IMAGE_RE.test(value)));
  el.style.backgroundImage = '';
  el.style.background = safeColor(color, '#3ee0a3');
  el.textContent = '';
  if (value && PROFILE_IMAGE_RE.test(value)) {
    el.style.backgroundImage = `url("${value}")`;
  } else if (value) {
    el.textContent = value;
  } else {
    el.textContent = initial(name);
  }
  if (statusDot) el.appendChild(statusDot);
}

function applyBanner(el, banner) {
  if (!el) return;
  const patternEl = el.querySelector('.banner-pattern');
  const emojiEl = el.querySelector('.banner-emoji');
  const safe = safeProfileBanner(banner);
  el.dataset.pattern = 'none';
  el.style.background = '#000';
  el.style.backgroundImage = '';
  el.style.backgroundSize = '';
  el.style.backgroundPosition = '';
  if (emojiEl) emojiEl.textContent = '';
  if (!safe) return;
  if (safe.kind === 'image' && safe.image) {
    el.style.backgroundImage = `url("${safe.image}")`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    return;
  }
  if (safe.kind === 'preset') {
    const preset = BANNER_PRESETS[safe.preset] || BANNER_PRESETS.black;
    el.style.background = `linear-gradient(135deg, ${preset.colors[0]}, ${preset.colors[1]})`;
    return;
  }
  if (safe.kind === 'custom') {
    el.style.background = `linear-gradient(135deg, ${safe.colors[0]}, ${safe.colors[1]})`;
    el.dataset.pattern = safe.pattern || 'none';
    if (emojiEl) emojiEl.textContent = safe.emoji || '';
  }
}

function safeBadges(list) {
  if (!Array.isArray(list)) return ['piwo'];
  return [...new Set(list.map((item) => String(item || '').toLowerCase()).filter((item) => PROFILE_BADGES[item]))].slice(0, 5);
}

function gameIconFor(title) {
  const text = String(title || '');
  for (const [re, icon] of GAME_ICON_RULES) if (re.test(text)) return icon;
  return initial(text) || '🎮';
}

function activitySubHtml(title, icon, extra = '') {
  const text = String(title || '').trim();
  if (!text) return '';
  const image = safeGameIcon(icon);
  const visual = image
    ? `<img class="member-game-icon" src="${esc(image)}" alt="">`
    : `<span class="member-game-emoji" aria-hidden="true">${esc(gameIconFor(text))}</span>`;
  const suffix = extra ? `<span class="member-game-extra">${esc(extra)}</span>` : '';
  return `${visual}<span>${esc(t('Gra w {game}', { game: text }))}</span>${suffix}`;
}

function gameColorFor(title) {
  let hash = 0;
  for (let i = 0; i < String(title).length; i += 1) hash = (hash * 31 + String(title).charCodeAt(i)) | 0;
  return `hsl(${Math.abs(hash) % 360} 54% 42%)`;
}

function platformLabel(platform) {
  return {
    medal: 'Medal',
    steam: 'Steam',
    roblox: 'Roblox',
    epic: 'Epic Games',
    gog: 'GOG',
    xbox: 'Xbox',
    ea: 'EA',
    ubisoft: 'Ubisoft',
    battlenet: 'Battle.net',
    riot: 'Riot Games',
    minecraft: 'Minecraft',
    itch: 'itch.io',
    other: t('Inne'),
  }[platform] || 'Medal';
}

function formatPlaytime(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function sharedServersFor(userId) {
  const result = [];
  for (const state of serverStates.values()) {
    if (!state?.members?.some((member) => member.id === userId)) continue;
    result.push(state.server.id);
  }
  return result;
}

function mutualFriendsFor(sharedServers, targetId) {
  const seen = new Set();
  for (const serverId of sharedServers) {
    const state = serverState(serverId);
    for (const member of state?.members || []) {
      if (member.id === targetId || member.id === myId) continue;
      if (friendByServerMember(serverId, member.id)) seen.add(member.id);
    }
  }
  return seen.size;
}

function followedGamesKey() {
  return `chill.followedGames.${myId || 'anon'}`;
}

function followedGames() {
  try {
    const saved = JSON.parse(localStorage.getItem(followedGamesKey()) || '[]');
    return new Set(Array.isArray(saved) ? saved.map((item) => String(item)) : []);
  } catch {
    return new Set();
  }
}

function toggleFollowedGame(title) {
  const set = followedGames();
  const key = String(title || '');
  if (set.has(key)) set.delete(key);
  else set.add(key);
  try { localStorage.setItem(followedGamesKey(), JSON.stringify([...set])); } catch { /* ignore */ }
  return set.has(key);
}

function gameUrlFor(game) {
  const title = String(game?.title || '').trim();
  const query = encodeURIComponent(title);
  switch (game?.platform) {
    case 'steam': return `https://store.steampowered.com/search/?term=${query}`;
    case 'roblox': return `https://www.roblox.com/discover/?Keyword=${query}`;
    case 'epic': return `https://store.epicgames.com/en-US/browse?q=${query}`;
    case 'gog': return `https://www.gog.com/en/games?query=${query}`;
    case 'xbox': return `https://www.xbox.com/en-US/search?q=${query}`;
    case 'ea': return `https://www.ea.com/games?q=${query}`;
    case 'ubisoft': return `https://store.ubisoft.com/search?q=${query}`;
    case 'battlenet': return `https://shop.battle.net/search?q=${query}`;
    case 'riot': return `https://www.riotgames.com/en/games`;
    case 'minecraft': return 'https://www.minecraft.net/';
    case 'itch': return `https://itch.io/search?q=${query}`;
    case 'medal': return `https://medal.tv/search?query=${query}`;
    default: return `https://www.google.com/search?q=${query}`;
  }
}

function renderGameTile(game, compact = false) {
  const title = String(game?.title || '');
  const color = safeColor(game?.color, '') || gameColorFor(title);
  const icon = safeGameIcon(game?.icon);
  const visual = icon
    ? `<img class="profile-game-img" src="${esc(icon)}" alt="">`
    : `<span aria-hidden="true">${esc(gameIconFor(title))}</span>`;
  return `<button type="button" class="profile-game-tile${compact ? ' compact' : ''}" data-game-title="${esc(title)}" title="${esc(title)}" style="--game-color:${esc(color)}">${visual}${compact ? '' : `<small>${esc(title)}</small>`}</button>`;
}

function openLocalProfile(userId, fallback = {}) {
  if (!userId) return;
  if (userId === myId) {
    openSettings('profile');
    return;
  }
  const user = allUsers.find((item) => item.id === userId) || {
    id: userId,
    name: fallback.name || t('Użytkownik'),
    username: fallback.username || mentionHandle(fallback.name),
    handle: handleForProfile({ id: userId, username: fallback.username || fallback.name }),
    color: fallback.color || '#3ee0a3',
    about: '',
    online: false,
    status: 'offline',
  };
  profileTarget = { kind: 'local', user };
  profileSelectedGame = '';
  profileGamesExpanded = false;
  $('userProfileError').textContent = '';
  renderUserProfile();
  $('userProfileOverlay').hidden = false;
}

function openServerProfile(serverId, memberId, fallback = {}) {
  const state = serverState(serverId);
  if (state?.you?.memberId && state.you.memberId === memberId) {
    openSettings('profile');
    return;
  }
  const member = state?.members.find((item) => item.id === memberId) || {
    id: memberId,
    name: fallback.name || t('Gość'),
    color: fallback.color || '#3ee0a3',
    owner: Boolean(fallback.owner),
    online: false,
    handle: handleForProfile({ id: memberId, username: fallback.name }),
  };
  profileTarget = { kind: 'server', serverId, member };
  profileSelectedGame = '';
  profileGamesExpanded = false;
  $('userProfileError').textContent = '';
  renderUserProfile();
  $('userProfileOverlay').hidden = false;
}

function closeUserProfile() {
  $('userProfileOverlay').hidden = true;
  stopProfileTimer();
  profileTarget = null;
}

function profileBadgesHtml(badges) {
  return safeBadges(badges).map((id) => {
    const badge = PROFILE_BADGES[id];
    return `<span class="profile-badge" data-badge="${id}"><span aria-hidden="true">${badge.icon}</span>${esc(badge.label)}</span>`;
  }).join('');
}

function profileGameList(profile) {
  const games = (Array.isArray(profile.games) ? profile.games : [])
    .map((game) => ({
      title: String(game?.title || '').trim(),
      platform: GAME_PLATFORMS.has(String(game?.platform || '').toLowerCase()) ? String(game.platform).toLowerCase() : 'medal',
      color: safeColor(game?.color, '') || gameColorFor(String(game?.title || '')),
    }))
    .filter((game) => game.title);
  const playing = String(profile.playing || '').trim();
  const playingIcon = safeGameIcon(profile.playingIcon);
  const playingPlatform = safeGamePlatform(profile.playingPlatform) || 'other';
  if (playing) {
    const existing = games.find((game) => game.title.toLowerCase() === playing.toLowerCase());
    if (existing) {
      existing.playing = true;
      existing.icon = playingIcon;
      if (existing.platform === 'medal' || !existing.platform) existing.platform = playingPlatform;
    } else {
      games.unshift({
        title: playing,
        platform: playingPlatform,
        color: gameColorFor(playing),
        playing: true,
        icon: playingIcon,
      });
    }
  }
  if (profileSelectedGame) {
    const selected = games.find((game) => game.title.toLowerCase() === String(profileSelectedGame).toLowerCase());
    if (selected) selected.selected = true;
  }
  return games;
}

function profileSharedSummary(friends, servers) {
  if (!friends && !servers) return t('Brak wspólnych znajomych i serwerów');
  const friendText = prefs.lang === 'en'
    ? (friends === 1 ? '1 mutual friend' : `${friends} mutual friends`)
    : (friends === 1 ? '1 wspólny znajomy' : `${friends} wspólnych znajomych`);
  const serverText = prefs.lang === 'en'
    ? (servers === 1 ? '1 shared server' : `${servers} shared servers`)
    : (servers === 1 ? '1 wspólny serwer' : (servers >= 2 && servers <= 4 ? `${servers} wspólne serwery` : `${servers} wspólnych serwerów`));
  return `${friendText} • ${serverText}`;
}

function profileStatusText(profile, online) {
  if (!online) return t('Offline');
  if (profile.owner) return t('Właściciel serwera');
  return statusLabel(profile.status || 'online');
}

function updateProfileGameTime() {
  const el = $('userProfileGameTime');
  if (!el) return;
  el.textContent = profileGameSince > 0 ? formatPlaytime(Date.now() - profileGameSince) : '0:00:00';
}

function startProfileTimer() {
  if (profileTimer) return;
  profileTimer = setInterval(updateProfileGameTime, 1000);
}

function stopProfileTimer() {
  if (profileTimer) clearInterval(profileTimer);
  profileTimer = null;
}

function renderUserProfile() {
  const target = profileTarget;
  if (!target) return;

  const isServer = target.kind === 'server';
  if (isServer) {
    const live = serverState(target.serverId)?.members.find((item) => item.id === target.member.id);
    if (live) target.member = { ...target.member, ...live };
  } else {
    const live = allUsers.find((item) => item.id === target.user.id);
    if (live) target.user = { ...target.user, ...live };
  }

  const source = isServer ? target.member : target.user;
  const name = source.name || (isServer ? t('Gość') : t('Użytkownik'));
  const handle = source.handle || handleForProfile({ id: source.id, username: source.username || source.name });
  const online = Boolean(source.online);
  const color = safeColor(source.color, '#3ee0a3');
  const about = String(source.about || '').trim();
  const games = profileGameList(source);
  const shared = sharedServersFor(source.id);
  const mutual = mutualFriendsFor(shared, source.id);
  const serverStateEntry = isServer ? serverState(target.serverId) : null;
  const serverName = serverStateEntry?.server?.name || t('Serwer');
  const statusText = profileStatusText({ owner: source.owner, status: source.status }, online);
  const friend = isServer ? friendByServerMember(target.serverId, source.id) : null;

  applyBanner($('userProfileBanner'), source.banner || { kind: 'preset', preset: 'black' });
  applyAvatar($('userProfileAvatar'), name, color, source.avatar);
  const presence = $('userProfilePresence');
  presence.className = `profile-presence ${online ? 'online' : 'offline'}`;
  presence.title = online ? t('Online') : t('Offline');
  $('userProfileName').textContent = name;
  $('userProfileHandle').textContent = `@${handle}`;
  $('userProfileStatus').textContent = statusText;
  $('userProfileStatus').classList.toggle('offline', !online);
  const badges = safeBadges(source.badges);
  $('userProfileBadges').innerHTML = profileBadgesHtml(badges);
  $('userProfileBadges').hidden = badges.length === 0;

  const fallbackAbout = isServer
    ? (online ? t('Ta osoba jest teraz online na serwerze.') : t('Ta osoba jest teraz offline.'))
    : t('Brak opisu profilu.');
  $('userProfileAbout').textContent = about || fallbackAbout;
  $('userProfileShared').textContent = profileSharedSummary(mutual, shared.length);
  $('userProfileShared').classList.toggle('empty', mutual === 0 && shared.length === 0);

  const serverBox = $('userProfileServer');
  if (isServer) {
    serverBox.hidden = false;
    serverBox.innerHTML = `${esc(t('Serwer:'))} <strong>${esc(serverName)}</strong>${serverStateEntry?.status === 'online' ? '' : ` • ${esc(t('połączenie offline'))}`}`;
  } else {
    serverBox.hidden = true;
    serverBox.textContent = '';
  }

  $('userProfileGameCount').textContent = games.length ? `${games.length}` : '';
  const strip = $('userProfileGameStrip');
  const empty = $('userProfileGamesEmpty');
  empty.hidden = games.length > 0;
  strip.hidden = games.length === 0;
  if (games.length) {
    const visible = profileGamesExpanded ? games : games.slice(0, 6);
    const hiddenCount = games.length - visible.length;
    strip.innerHTML = visible.map((game) => renderGameTile(game, true)).join('')
      + (hiddenCount > 0 ? `<button type="button" class="profile-game-tile more" data-game-more="${hiddenCount}" title="${esc(t('Pokaż wszystkie gry'))}">+${hiddenCount}</button>` : '');
  } else {
    strip.innerHTML = '';
  }

  let activeGame = null;
  if (profileSelectedGame) {
    activeGame = games.find((game) => game.title.toLowerCase() === String(profileSelectedGame).toLowerCase()) || null;
  }
  if (!activeGame) activeGame = games.find((game) => game.playing) || games[0] || null;

  const card = $('userProfileGameCard');
  if (activeGame) {
    const isMedalGame = (activeGame.platform || 'medal') === 'medal';
    const baseTitle = activeGame.title.replace(/\s+with\s+Medal$/i, '');
    const displayTitle = isMedalGame ? `${baseTitle} with Medal` : baseTitle;
    const isPlaying = Boolean(activeGame.playing || (source.playing && String(source.playing).toLowerCase() === activeGame.title.toLowerCase()));
    const liveIcon = isPlaying ? safeGameIcon(activeGame.icon || source.playingIcon) : '';
    profileGameSince = isPlaying ? (Number(source.playingSince) || 0) : 0;
    card.hidden = false;
    const iconEl = $('userProfileGameIcon');
    iconEl.classList.toggle('has-image', Boolean(liveIcon));
    iconEl.innerHTML = liveIcon ? `<img src="${esc(liveIcon)}" alt="">` : '';
    if (!liveIcon) iconEl.textContent = gameIconFor(activeGame.title);
    iconEl.style.background = safeColor(activeGame.color, '') || gameColorFor(activeGame.title);
    $('userProfileGameTitle').textContent = displayTitle;
    $('userProfileGameDesc').textContent = isMedalGame
      ? t('Clipping {game}', { game: displayTitle })
      : `${platformLabel(activeGame.platform)}${isPlaying ? ` • ${t('Teraz grasz')}` : ''}`;
    const follow = $('profileGameFollow');
    const download = $('profileGameDownload');
    follow.hidden = !isMedalGame;
    download.hidden = !isMedalGame;
    const followed = followedGames().has(activeGame.title);
    follow.dataset.gameTitle = activeGame.title;
    follow.textContent = followed ? t('Obserwujesz na Medal') : t('Obserwuj na Medal');
    follow.classList.toggle('active', followed);
    updateProfileGameTime();
    startProfileTimer();
  } else {
    profileGameSince = 0;
    card.hidden = true;
    stopProfileTimer();
  }

  const addBtn = $('addFriendBtn');
  const dmBtn = $('dmFriendBtn');
  const note = $('userProfileNote');
  const account = isServer ? accountById(source.id) : (accountById(source.id) || source);
  const accountFriend = account ? isAccountFriend(account.id) : false;
  const incoming = account ? incomingFriendRequest(account.id) : null;
  const outgoing = account ? outgoingFriendRequest(account.id) : null;
  const legacyFriend = isServer ? friendByServerMember(target.serverId, source.id) : null;

  addBtn.hidden = account ? accountFriend : Boolean(friend);
  dmBtn.hidden = account ? !accountFriend : (isServer && !legacyFriend);
  dmBtn.disabled = false;
  addBtn.disabled = Boolean(outgoing);
  if (account) {
    addBtn.textContent = incoming ? t('Akceptuj') : outgoing ? t('Zaproszenie wysłane') : t('Dodaj do znajomych');
  } else {
    addBtn.textContent = t('Dodaj do znajomych');
  }
  dmBtn.textContent = t('Napisz wiadomość');

  if (account && accountFriend) {
    note.textContent = t('Możecie teraz pisać do siebie.');
  } else if (account && incoming) {
    note.textContent = t('Ta osoba wysłała Ci zaproszenie do znajomych.');
  } else if (account && outgoing) {
    note.textContent = t('Ta osoba musi zaakceptować zaproszenie, zanim będziecie mogli pisać.');
  } else if (account) {
    note.textContent = t('Dodaj tę osobę do znajomych, aby zacząć prywatną rozmowę.');
  } else if (legacyFriend) {
    note.textContent = t('Masz tę osobę w znajomych.');
  } else {
    note.textContent = t('Dodaj tę osobę do znajomych, aby zacząć prywatną rozmowę.');
  }
}

function addProfileFriend() {
  const target = profileTarget;
  if (!target) return;
  const member = target.kind === 'server'
    ? (serverState(target.serverId)?.members.find((item) => item.id === target.member.id) || target.member)
    : target.user;
  const account = accountById(member.id);
  if (account) {
    if (isAccountFriend(account.id)) {
      renderUserProfile();
      return;
    }
    if (incomingFriendRequest(account.id)) acceptAccountFriend(account.id);
    else requestAccountFriend(account.id);
    return;
  }
  if (target.kind !== 'server') return;
  const friend = upsertServerFriend(target.serverId, member);
  if (!friend) {
    $('userProfileError').textContent = t('Nie udało się dodać do znajomych.');
    return;
  }
  renderDmList();
  renderUserProfile();
  renderMembers();
  toast(t('Dodano {name} do znajomych', { name: friend.name }));
}

function messageProfileFriend() {
  const target = profileTarget;
  if (!target) return;
  const member = target.kind === 'server' ? target.member : target.user;
  const account = accountById(member.id) || (target.kind === 'local' ? member : null);
  if (account) {
    if (!isAccountFriend(account.id)) {
      toast(t('Aby wysłać wiadomość, najpierw zaczekaj na akceptację zaproszenia.'));
      return;
    }
    closeUserProfile();
    selectConversation('dm', account.id);
    return;
  }
  if (target.kind === 'server') {
    const friend = friendByServerMember(target.serverId, member.id);
    if (!friend) {
      toast(t('Aby wysłać wiadomość, najpierw zaczekaj na akceptację zaproszenia.'));
      return;
    }
    closeUserProfile();
    selectConversation('dm', friend.dmId);
  }
}

function bindUserProfile() {
  $('closeUserProfile').addEventListener('click', closeUserProfile);
  $('userProfileOverlay').addEventListener('click', (e) => {
    if (e.target === $('userProfileOverlay')) closeUserProfile();
  });
  $('addFriendBtn').addEventListener('click', addProfileFriend);
  $('dmFriendBtn').addEventListener('click', messageProfileFriend);
  $('userProfileGameStrip').addEventListener('click', (e) => {
    const more = e.target.closest('[data-game-more]');
    if (more) {
      profileGamesExpanded = true;
      renderUserProfile();
      return;
    }
    const tile = e.target.closest('[data-game-title]');
    if (!tile) return;
    profileSelectedGame = tile.dataset.gameTitle;
    renderUserProfile();
  });
  $('profileGameFollow').addEventListener('click', () => {
    const title = $('profileGameFollow').dataset.gameTitle;
    if (!title) return;
    const followed = toggleFollowedGame(title);
    $('profileGameFollow').textContent = followed ? t('Obserwujesz na Medal') : t('Obserwuj na Medal');
    $('profileGameFollow').classList.toggle('active', followed);
    toast(followed ? t('Obserwujesz {game} na Medal', { game: title }) : t('Przestano obserwować {game}', { game: title }));
  });
  $('profileGameDownload').addEventListener('click', () => {
    CHILL.app?.openExternal?.('https://medal.tv/download');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('userProfileOverlay').hidden) {
      e.preventDefault();
      closeUserProfile();
    }
  });
}

function renderHeader() {
  $('backBtn').style.display = 'none';
  $('searchBtn').hidden = current.kind === 'minigames';
  if (current.kind === 'dm') {
    const entry = dmEntry(current.id);
    const status = entry ? (entry.online ? entry.status : 'offline') : 'offline';
    $('chatEmoji').textContent = initial(entry?.name || '?');
    $('chatEmoji').style.background = safeColor(entry?.color, 'var(--panel-2)');
    $('chatEmoji').style.color = '#06251b';
    $('chatName').textContent = entry?.name || t('Rozmowa prywatna');
    if (!entry) {
      $('chatSub').textContent = t('Rozmowa niedostępna');
    } else if (entry.kind === 'server') {
      $('chatSub').innerHTML = entry.playing
        ? activitySubHtml(entry.playing, entry.playingIcon, entry.serverName)
        : esc(`${entry.serverName} • ${entry.online ? t('Online') : t('Offline')}`);
    } else if (entry.playing) {
      $('chatSub').innerHTML = `${activitySubHtml(entry.playing, entry.playingIcon)}<span class="member-game-extra"> • ${esc(statusLabel(status))}</span>`;
    } else {
      $('chatSub').textContent = statusLabel(status);
    }
  } else if (current.kind === 'server') {
    const state = serverState(current.serverId);
    const channel = state?.channels.find((item) => item.id === current.id);
    const online = state ? state.members.filter((member) => member.online).length : 0;
    const isVoice = channel?.type === 'voice';
    $('chatEmoji').textContent = isVoice ? '🔊' : '#';
    $('chatEmoji').style.background = safeColor(state?.server.color, 'var(--panel-2)');
    $('chatEmoji').style.color = '#06251b';
    $('chatName').textContent = channel?.name || state?.server.name || t('Serwer');
    $('chatSub').textContent = state
      ? `${state.server.name} • ${isVoice ? t('Kanał głosowy') : state.status === 'online' ? `${online} ${t('Online').toLowerCase()}` : state.status === 'connecting' ? t('łączenie…') : t('Offline').toLowerCase()}`
      : '';
  } else if (current.kind === 'minigames') {
    $('chatEmoji').textContent = '🎮';
    $('chatEmoji').style.background = 'linear-gradient(140deg, var(--accent), var(--accent-2))';
    $('chatEmoji').style.color = '#05231a';
    $('chatName').textContent = t('Mini Gierki');
    $('chatSub').textContent = t('Pobieraj i graj lokalnie — bez instalowania dużych klientów');
  } else {
    $('chatEmoji').textContent = 'C';
    $('chatEmoji').style.background = 'linear-gradient(140deg, var(--accent), var(--accent-2))';
    $('chatEmoji').style.color = '#05231a';
    $('chatName').textContent = t('Wiadomości prywatne');
    $('chatSub').textContent = servers.length ? t('Wybierz rozmowę lub serwer') : t('Utwórz lub dołącz do serwera');
  }
  updateComposer();
}

function updateComposer() {
  const input = $('messageInput');
  const state = current.kind === 'server' ? serverState(current.serverId) : null;
  const channel = state?.channels.find((item) => item.id === current.id);
  const entry = current.kind === 'dm' ? dmEntry(current.id) : null;
  const dmServerOnline = entry?.kind === 'server' ? serverState(entry.serverId)?.status === 'online' : true;
  const isVoice = channel?.type === 'voice';
  const enabled = current.kind === 'dm'
    ? Boolean(entry) && dmServerOnline
    : current.kind === 'server' && state?.status === 'online' && Boolean(channel) && !isVoice;
  const recording = Boolean(voiceSession);
  if (!enabled && voiceSession) cancelVoiceRecording(true);
  $('composer').hidden = !enabled;
  input.disabled = !enabled || recording;
  $('voiceBtn').hidden = !enabled || recording;
  if (current.kind === 'dm') {
    if (entry?.kind === 'server') {
      input.placeholder = enabled
        ? t('Napisz do {name}…', { name: entry.name })
        : t('Serwer jest offline — wiadomości wrócą po połączeniu');
    } else {
      input.placeholder = t('Napisz do {name}…', { name: entry?.name || t('rozmówcy') });
    }
  } else if (current.kind === 'server' && channel) {
    input.placeholder = isVoice ? t('Kanał głosowy') : t('Napisz na #{name}…', { name: channel.name });
  } else {
    input.placeholder = t('Wybierz kanał, aby napisać…');
  }
  $('sendBtn').disabled = !enabled || recording || attachmentUploading || (!input.value.trim() && !pendingAttachment);
  $('typingBar').hidden = !enabled || recording || typingUsers.size === 0;
  if (!enabled) {
    closeEmojiPicker();
    closeStickerPicker();
    closeGifPicker();
  }
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
  const voiceView = $('voiceView');
  if (voiceView) voiceView.hidden = true;
  document.body.classList.remove('voice-stage');
  container.hidden = false;
  const key = conversationKey();
  let list = history.get(key) || [];

  container.classList.toggle('searching', Boolean(searchQuery));
  container.innerHTML = '';

  if (current.kind === 'minigames') {
    renderMiniGamesHub(container);
    updateComposer();
    return;
  }

  if (current.kind === 'home') {
    const wrap = document.createElement('div');
    wrap.className = 'empty-chat';
    if (!servers.length) {
      wrap.innerHTML = `
        <div class="empty-ico">C</div>
        <h3>${esc(t('Zacznij od serwera'))}</h3>
        <p>${esc(t('Nie masz jeszcze żadnego serwera. Utwórz własny albo dołącz kodem zaproszenia od znajomego.'))}</p>
        <div class="empty-actions"></div>
      `;
      addEmptyAction(wrap, t('Utwórz serwer'), 'btn-primary', () => openServerModal('create'));
      addEmptyAction(wrap, t('Dołącz kodem'), 'btn-secondary', () => openServerModal('join'));
    } else {
      wrap.innerHTML = `
        <div class="empty-ico">💬</div>
        <h3>${esc(t('Wiadomości prywatne'))}</h3>
        <p>${esc(t('Wybierz rozmowę z listy po lewej. Pisz do kont na tym komputerze i do znajomych dodanych z serwerów.'))}</p>
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
        wrap.innerHTML = `<div class="empty-ico">◌</div><h3>${esc(t('Łączę z serwerem…'))}</h3><p>${esc(state.server.name)}</p>`;
      } else {
        wrap.innerHTML = `
          <div class="empty-ico">⚠</div>
          <h3>${esc(t('Serwer offline'))}</h3>
          <p>${esc(state?.error || t('Nie można połączyć się z {name}.', { name: state?.server.name || t('serwerem') }))}</p>
          <div class="empty-actions"></div>
        `;
        if (state) {
          addEmptyAction(wrap, t('Spróbuj ponownie'), 'btn-secondary', () => {
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
      wrap.innerHTML = `<div class="empty-ico">#</div><h3>${esc(t('Brak kanałów'))}</h3><p>${esc(t('Ten serwer nie ma jeszcze żadnego kanału.'))}</p><div class="empty-actions"></div>`;
      if (state.you?.owner) {
        addEmptyAction(wrap, t('Utwórz kanał'), 'btn-primary', openChannelModal);
      }
      container.appendChild(wrap);
      updateComposer();
      return;
    }
    const activeChannel = state.channels.find((item) => item.id === current.id);
    if (activeChannel?.type === 'voice') {
      container.hidden = true;
      if (voiceView) {
        voiceView.hidden = false;
        renderVoiceView(state, activeChannel);
      }
      updateComposer();
      return;
    }
  }

  if (searchQuery) {
    list = list.filter((m) => {
      const sticker = stickerMessageDescriptor(m.text);
      if (sticker) return stickerSearchText(sticker).includes(searchQuery);
      const voice = VOICE ? VOICE.parse(m.text) : null;
      if (voice) return VOICE.searchText.includes(searchQuery);
      return String(m.text).toLowerCase().includes(searchQuery);
    });
  }

  if (!list.length) {
    const state = current.kind === 'server' ? serverState(current.serverId) : null;
    const channel = state?.channels.find((item) => item.id === current.id);
    const entry = current.kind === 'dm' ? dmEntry(current.id) : null;
    const wrap = document.createElement('div');
    wrap.className = 'empty-chat';
    if (searchQuery) {
      wrap.innerHTML = `<div class="empty-ico">⌕</div><h3>${esc(t('Brak wyników'))}</h3><p>${esc(t('Nie znaleziono wiadomości pasujących do „{query}”.', { query: $('messageSearch').value.trim() }))}</p>`;
    } else if (current.kind === 'server') {
      wrap.innerHTML = `<div class="empty-ico">#</div><h3>#${esc(channel?.name || t('kanał'))}</h3><p>${esc(t('To początek tego kanału. Napisz pierwszą wiadomość!'))}</p>`;
    } else {
      const via = entry?.kind === 'server' ? t(' przez serwer {name}', { name: entry.serverName }) : '';
      wrap.innerHTML = `<div class="empty-ico">${esc(initial(entry?.name || '?'))}</div><h3>${esc(entry?.name || t('Rozmowa'))}</h3><p>${esc(t('To początek Waszej prywatnej rozmowy'))}${esc(via)}.</p>`;
    }
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
  syncVoicePlayers();

  if (scroll) scrollBottom();
}

function buildMessage(message, grouped) {
  const dm = current.kind === 'dm' ? dmEntry(current.id) : null;
  const serverStateEntry = current.kind === 'server'
    ? serverState(current.serverId)
    : dm?.kind === 'server' ? serverState(dm.serverId) : null;
  const own = current.kind === 'server' || dm?.kind === 'server'
    ? message.authorId === serverStateEntry?.you?.memberId
    : message.authorId === myId;
  const el = document.createElement('div');
  el.className = `msg${own ? ' own' : ''}${grouped ? ' grouped' : ''}${searchQuery ? ' search-hit' : ''}`;
  el.dataset.id = message.id;

  const openAuthor = () => {
    if (own) {
      openSettings('profile');
      return;
    }
    if (current.kind === 'server') {
      openServerProfile(current.serverId, message.authorId, {
        name: message.authorName,
        color: message.authorColor,
      });
      return;
    }
    if (dm?.kind === 'server') {
      openServerProfile(dm.serverId, message.authorId, {
        name: message.authorName,
        color: message.authorColor,
      });
      return;
    }
    openLocalProfile(message.authorId, {
      name: message.authorName,
      color: message.authorColor,
    });
  };

  const avatar = document.createElement('span');
  avatar.className = `msg-avatar clickable${grouped ? ' hidden' : ''}`;
  avatar.style.background = safeColor(message.authorColor, 'var(--accent)');
  avatar.textContent = initial(message.authorName);
  avatar.setAttribute('role', 'button');
  avatar.tabIndex = 0;
  avatar.title = t('Profil: {name}', { name: message.authorName });
  avatar.addEventListener('click', openAuthor);
  avatar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openAuthor();
    }
  });

  const main = document.createElement('div');
  main.className = 'msg-main';

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.innerHTML = `<span class="msg-author clickable">${esc(message.authorName)}</span><span class="msg-time">${formatTime(message.at)}</span>`;
  meta.querySelector('.msg-author')?.addEventListener('click', openAuthor);

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const sticker = stickerMessageDescriptor(message.text);
  const voice = VOICE ? VOICE.parse(message.text) : null;
  const attachment = ATTACHMENTS ? ATTACHMENTS.parse(message.text) : null;
  if (sticker) {
    bubble.classList.add('bubble-sticker');
    const img = document.createElement('img');
    img.className = 'chat-sticker';
    img.src = stickerDataUrl(sticker);
    img.alt = stickerLabel(sticker);
    img.title = `${t('Naklejka')} • ${stickerLabel(sticker)}`;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    bubble.appendChild(img);
  } else if (voice) {
    bubble.classList.add('bubble-voice');
    bubble.appendChild(buildVoicePlayer(message, voice));
  } else if (attachment) {
    bubble.classList.add('bubble-attachment');
    bubble.appendChild(buildAttachmentBlock(attachment));
    if (attachment.caption) {
      const caption = document.createElement('div');
      caption.className = 'chat-attachment-caption';
      caption.innerHTML = formatMessageText(attachment.caption);
      bubble.appendChild(caption);
    }
  } else {
    const gif = gifMessageDescriptor(message.text);
    const chatUrl = gif ? gifChatSource(gif) : '';
    if (gif && chatUrl) {
      bubble.classList.add('bubble-gif');
      const fallbackUrl = gifChatFallback(gif);
      const openUrl = gifOpenUrl(gif);
      const img = document.createElement('img');
      img.className = 'chat-gif';
      img.src = chatUrl;
      img.alt = 'GIF';
      img.title = gifAttributionLabel(gif);
      const source = gifSource(gif);
      if ((source === 'klipy' || source === 'tenor') && gif.w > 0 && gif.h > 0) {
        img.width = gif.w;
        img.height = gif.h;
      }
      img.loading = 'lazy';
      img.decoding = 'async';
      img.draggable = false;
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => {
        if (img.dataset.fallback !== '1' && fallbackUrl && fallbackUrl !== chatUrl) {
          img.dataset.fallback = '1';
          img.src = fallbackUrl;
          return;
        }
        img.remove();
        const fallback = document.createElement('button');
        fallback.type = 'button';
        fallback.className = 'chat-gif-fallback';
        fallback.textContent = t('Otwórz GIF');
        fallback.title = openUrl;
        fallback.addEventListener('click', () => {
          if (openUrl) CHILL.app?.openExternal?.(openUrl);
        });
        bubble.appendChild(fallback);
      });
      bubble.appendChild(img);
    } else {
      bubble.innerHTML = formatMessageText(message.text);
    }
  }

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

// ============================================================
// WIADOMOŚCI GŁOSOWE
// ============================================================
const VOICE_PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.4v13.2c0 .8.9 1.3 1.5.8l9.8-6.6c.6-.4.6-1.2 0-1.6L9.5 4.6C8.9 4.1 8 4.6 8 5.4z" fill="currentColor"/></svg>';
const VOICE_PAUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>';
const VOICE_BITRATE = 64000;

function voiceMessageDescriptor(text) {
  return VOICE ? VOICE.parse(text) : null;
}

function voiceTransport() {
  if (current.kind === 'server') {
    const state = serverState(current.serverId);
    const channel = state?.channels.find((item) => item.id === current.id);
    if (!state || state.status !== 'online' || !state.ws || state.ws.readyState !== WebSocket.OPEN) return null;
    if (!channel || channel.type === 'voice' || !state.voiceKey) return null;
    const address = state.server.address || (state.server.owner ? localChatAddress() : '');
    if (!address) return null;
    return { address, scope: `server:${state.server.id}`, secure: Boolean(state.server.secure), key: state.voiceKey, conversationKey: conversationKey() };
  }
  if (current.kind === 'dm') {
    const entry = dmEntry(current.id);
    if (!entry) return null;
    if (entry.kind === 'server') {
      const state = serverState(entry.serverId);
      if (!state || state.status !== 'online' || !state.ws || state.ws.readyState !== WebSocket.OPEN || !state.voiceKey) return null;
      const address = state.server.address || (state.server.owner ? localChatAddress() : '');
      if (!address) return null;
      return { address, scope: `server:${state.server.id}`, secure: Boolean(state.server.secure), key: state.voiceKey, conversationKey: conversationKey() };
    }
    if (!wsReady() || !localVoiceKey) return null;
    return { address: localChatAddress(), scope: 'local', secure: location.protocol === 'https:', key: localVoiceKey, conversationKey: conversationKey() };
  }
  return null;
}

function voiceSourceUrl(voice) {
  const transport = voiceTransport();
  if (!transport || !voice || !voice.id) return '';
  return `${transport.secure ? 'https' : 'http'}://${transport.address}/voice/${voice.id}?key=${encodeURIComponent(transport.key)}`;
}

function voiceSocketForScope(scope) {
  if (scope.startsWith('server:')) {
    const serverId = scope.slice(7);
    const state = serverState(serverId)
      || (current.kind === 'dm' ? serverState(dmEntry(current.id)?.serverId) : null);
    return state?.ws || null;
  }
  return ws;
}

function requestVoiceToken(scope) {
  const socket = voiceSocketForScope(scope);
  if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.resolve('');
  return new Promise((resolve) => {
    const previous = voiceTokenWaiters.get(scope);
    if (previous) {
      clearTimeout(previous.timer);
      previous.resolve('');
    }
    const timer = setTimeout(() => {
      voiceTokenWaiters.delete(scope);
      resolve('');
    }, 5000);
    voiceTokenWaiters.set(scope, { resolve, timer });
    try {
      socket.send(JSON.stringify({ type: 'voice:refresh', scope }));
    } catch {
      clearTimeout(timer);
      voiceTokenWaiters.delete(scope);
      resolve('');
    }
  });
}

function resolveVoiceToken(msg) {
  const scope = String(msg.scope || '');
  const key = String(msg.key || '');
  const waiter = voiceTokenWaiters.get(scope);
  if (waiter) {
    clearTimeout(waiter.timer);
    voiceTokenWaiters.delete(scope);
    waiter.resolve(key);
  }
  if (!key || !scope) return;
  if (scope === 'local') {
    localVoiceKey = key;
    return;
  }
  if (scope.startsWith('server:')) {
    const state = serverState(scope.slice(7));
    if (state) state.voiceKey = key;
  }
}

async function retryVoicePlayback() {
  const active = voicePlayback;
  const transport = voiceTransport();
  if (!active.messageId || !active.voice || !transport) return false;
  const key = await requestVoiceToken(transport.scope);
  if (!key || voicePlayback.messageId !== active.messageId) return false;
  if (transport.scope === 'local') {
    localVoiceKey = key;
  } else {
    const state = serverState(transport.scope.slice(7));
    if (state) state.voiceKey = key;
  }
  const url = `${transport.secure ? 'https' : 'http'}://${transport.address}/voice/${active.voice.id}?key=${encodeURIComponent(key)}`;
  const audio = ensureVoiceAudio();
  active.url = url;
  active.playing = true;
  audio.dataset.messageId = active.messageId;
  audio.dataset.url = url;
  audio.src = url;
  updateVoicePlayerUi();
  try {
    await audio.play();
    return true;
  } catch {
    active.playing = false;
    updateVoicePlayerUi();
    return false;
  }
}

function attachmentSourceUrl(attachment) {
  const transport = voiceTransport();
  if (!transport || !attachment || !attachment.id) return '';
  return `${transport.secure ? 'https' : 'http'}://${transport.address}/attachment/${attachment.id}?key=${encodeURIComponent(transport.key)}`;
}

function attachmentOpen(attachment, url) {
  if (!url) return;
  if (CHILL.app?.openExternal) {
    CHILL.app.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener');
}

function buildAttachmentBlock(attachment) {
  const wrap = document.createElement('div');
  const kind = ATTACHMENTS ? ATTACHMENTS.kind(attachment.mime) : 'file';
  wrap.className = `chat-attachment ${kind}`;
  const url = attachmentSourceUrl(attachment);
  if (!url) {
    wrap.classList.add('offline');
    wrap.innerHTML = `<span class="chat-attachment-icon" aria-hidden="true">📎</span><span class="chat-attachment-info"><strong>${esc(attachment.name)}</strong><small>${esc(t('Połącz z serwerem, aby zobaczyć załącznik.'))}</small></span>`;
    return wrap;
  }

  if (kind === 'image') {
    const link = document.createElement('a');
    link.className = 'chat-attachment-image-link';
    link.href = url;
    link.rel = 'noopener noreferrer';
    link.title = t('Otwórz plik');
    const img = document.createElement('img');
    img.className = 'chat-attachment-image';
    img.src = url;
    img.alt = attachment.name;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('click', (event) => {
      event.preventDefault();
      attachmentOpen(attachment, url);
    });
    link.appendChild(img);
    wrap.appendChild(link);
    const meta = document.createElement('span');
    meta.className = 'chat-attachment-name';
    meta.textContent = attachment.name;
    wrap.appendChild(meta);
    return wrap;
  }

  if (kind === 'video') {
    const video = document.createElement('video');
    video.className = 'chat-attachment-video';
    video.controls = true;
    video.preload = 'metadata';
    video.src = url;
    wrap.appendChild(video);
    const meta = document.createElement('span');
    meta.className = 'chat-attachment-name';
    meta.textContent = attachment.name;
    wrap.appendChild(meta);
    return wrap;
  }

  if (kind === 'audio') {
    const audio = document.createElement('audio');
    audio.className = 'chat-attachment-audio';
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = url;
    wrap.appendChild(audio);
    const meta = document.createElement('span');
    meta.className = 'chat-attachment-name';
    meta.textContent = attachment.name;
    wrap.appendChild(meta);
    return wrap;
  }

  const link = document.createElement('a');
  link.className = 'chat-attachment-file';
  link.href = url;
  link.download = attachment.name;
  link.rel = 'noopener noreferrer';
  link.innerHTML = `
    <span class="chat-attachment-icon" aria-hidden="true">📎</span>
    <span class="chat-attachment-info">
      <strong>${esc(attachment.name)}</strong>
      <small>${esc(ATTACHMENTS ? ATTACHMENTS.formatSize(attachment.size) : '')} • ${esc(t('Pobierz plik'))}</small>
    </span>
  `;
  link.addEventListener('click', (event) => {
    if (CHILL.app?.openExternal) {
      event.preventDefault();
      CHILL.app.openExternal(url);
    }
  });
  wrap.appendChild(link);
  return wrap;
}

function handleVoicePlaybackFailure(messageId) {
  if (!voicePlayback.messageId || voicePlayback.messageId !== messageId) return;
  voicePlayback.playing = false;
  updateVoicePlayerUi();
  if (voicePlayback.retried) {
    toast(t('Nie można odtworzyć wiadomości głosowej.'));
    return;
  }
  voicePlayback.retried = true;
  void retryVoicePlayback().then((ok) => {
    if (!ok) toast(t('Nie można odtworzyć wiadomości głosowej.'));
  });
}

function ensureVoiceAudio() {
  if (voiceAudio) {
    applyVoiceVolume();
    return voiceAudio;
  }
  voiceAudio = new Audio();
  voiceAudio.preload = 'metadata';
  voiceAudio.addEventListener('timeupdate', () => updateVoicePlayerUi());
  voiceAudio.addEventListener('loadedmetadata', () => {
    if (voiceAudio.dataset.messageId === voicePlayback.messageId && Number.isFinite(voiceAudio.duration)) {
      voicePlayback.duration = voiceAudio.duration;
    }
    updateVoicePlayerUi();
  });
  voiceAudio.addEventListener('play', () => {
    voicePlayback.playing = true;
    updateVoicePlayerUi();
  });
  voiceAudio.addEventListener('pause', () => {
    if (voiceAudio.ended) return;
    voicePlayback.playing = false;
    updateVoicePlayerUi();
  });
  voiceAudio.addEventListener('ended', () => {
    voicePlayback.playing = false;
    try { voiceAudio.currentTime = 0; } catch { /* ignore */ }
    updateVoicePlayerUi();
  });
  voiceAudio.addEventListener('error', () => {
    if (!voicePlayback.messageId) return;
    handleVoicePlaybackFailure(voicePlayback.messageId);
  });
  applyVoiceVolume();
  return voiceAudio;
}

function syncVoicePlayers() {
  updateVoicePlayerUi();
}

function updateVoicePlayerUi() {
  const audio = voiceAudio;
  const activeId = voicePlayback.messageId;
  document.querySelectorAll('.voice-player').forEach((player) => {
    const playBtn = player.querySelector('.voice-play');
    const fill = player.querySelector('.voice-track-fill');
    const time = player.querySelector('.voice-time');
    const stored = Number(player.dataset.duration) || 0;
    const active = Boolean(activeId) && player.dataset.voiceId === activeId
      && Boolean(audio) && audio.dataset.messageId === activeId;
    const total = active && Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration
      : stored;
    if (!active) {
      player.classList.remove('active');
      if (playBtn) {
        playBtn.innerHTML = VOICE_PLAY_ICON;
        playBtn.setAttribute('aria-label', t('Odtwórz wiadomość głosową'));
        playBtn.setAttribute('aria-pressed', 'false');
        playBtn.title = t('Odtwórz wiadomość głosową');
      }
      if (fill) fill.style.width = '0%';
      if (time) time.textContent = VOICE ? VOICE.formatDuration(total) : '0:00';
      return;
    }
    player.classList.add('active');
    const current = Math.max(0, Math.min(audio.currentTime || 0, total || 0));
    const ratio = total > 0 ? current / total : 0;
    if (playBtn) {
      playBtn.innerHTML = voicePlayback.playing ? VOICE_PAUSE_ICON : VOICE_PLAY_ICON;
      const label = voicePlayback.playing ? t('Wstrzymaj wiadomość głosową') : t('Odtwórz wiadomość głosową');
      playBtn.setAttribute('aria-label', label);
      playBtn.setAttribute('aria-pressed', String(voicePlayback.playing));
      playBtn.title = label;
    }
    if (fill) fill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    if (time) {
      time.textContent = total > 0
        ? `${VOICE ? VOICE.formatDuration(current) : '0:00'} / ${VOICE ? VOICE.formatDuration(total) : '0:00'}`
        : '0:00';
    }
  });
}

function toggleVoicePlayback(message, voice) {
  if (!VOICE) return;
  const url = voiceSourceUrl(voice);
  if (!url) {
    toast(t('Połącz z serwerem, aby odtworzyć głosówkę.'));
    return;
  }
  const audio = ensureVoiceAudio();
  if (voicePlayback.messageId === message.id && audio.dataset.url === url) {
    if (audio.paused) {
      voicePlayback.playing = true;
      voicePlayback.retried = false;
      audio.play().catch(() => handleVoicePlaybackFailure(message.id));
    } else {
      audio.pause();
    }
    updateVoicePlayerUi();
    return;
  }

  try { audio.pause(); } catch { /* ignore */ }
  voicePlayback = {
    messageId: message.id,
    url,
    duration: voice.seconds || 0,
    playing: true,
    voice,
    retried: false,
  };
  audio.dataset.messageId = message.id;
  audio.dataset.url = url;
  audio.src = url;
  updateVoicePlayerUi();
  audio.play().catch(() => handleVoicePlaybackFailure(message.id));
}

function seekVoicePlayback(message, voice, ratio) {
  const audio = ensureVoiceAudio();
  if (voicePlayback.messageId !== message.id || audio.dataset.url !== voiceSourceUrl(voice)) {
    toggleVoicePlayback(message, voice);
    return;
  }
  const total = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (voice.seconds || 0);
  if (!total) return;
  const next = Math.max(0, Math.min(total, total * ratio));
  try { audio.currentTime = next; } catch { /* ignore */ }
  updateVoicePlayerUi();
}

function resetVoicePlayback() {
  if (voiceAudio) {
    try { voiceAudio.pause(); } catch { /* ignore */ }
    voiceAudio.removeAttribute('src');
    voiceAudio.dataset.messageId = '';
    voiceAudio.dataset.url = '';
    try { voiceAudio.load(); } catch { /* ignore */ }
  }
  voicePlayback = { messageId: '', url: '', duration: 0, playing: false, voice: null, retried: false };
}

function buildVoicePlayer(message, voice) {
  const player = document.createElement('div');
  player.className = 'voice-player';
  player.dataset.voiceId = message.id;
  player.dataset.duration = String(voice.seconds || 0);

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'voice-play';
  playBtn.innerHTML = VOICE_PLAY_ICON;
  playBtn.setAttribute('aria-label', t('Odtwórz wiadomość głosową'));
  playBtn.setAttribute('aria-pressed', 'false');
  playBtn.title = t('Odtwórz wiadomość głosową');
  playBtn.addEventListener('click', () => toggleVoicePlayback(message, voice));

  const track = document.createElement('button');
  track.type = 'button';
  track.className = 'voice-track';
  track.setAttribute('aria-label', t('Przewiń wiadomość głosową'));
  track.title = t('Przewiń wiadomość głosową');
  const rail = document.createElement('span');
  rail.className = 'voice-track-rail';
  const fill = document.createElement('span');
  fill.className = 'voice-track-fill';
  rail.appendChild(fill);
  track.appendChild(rail);
  track.addEventListener('click', (event) => {
    if (event.detail === 0) {
      toggleVoicePlayback(message, voice);
      return;
    }
    const rect = track.getBoundingClientRect();
    if (!rect.width) return;
    seekVoicePlayback(message, voice, (event.clientX - rect.left) / rect.width);
  });
  track.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const active = voicePlayback.messageId === message.id
      && Boolean(voiceAudio) && voiceAudio.dataset.url === voiceSourceUrl(voice);
    if (!active) {
      toggleVoicePlayback(message, voice);
      return;
    }
    const total = Number.isFinite(voiceAudio.duration) && voiceAudio.duration > 0
      ? voiceAudio.duration
      : (voice.seconds || 0);
    const ratio = total > 0 ? (voiceAudio.currentTime || 0) / total : 0;
    let next = ratio;
    if (event.key === 'ArrowRight') next = Math.min(1, ratio + 0.05);
    else if (event.key === 'ArrowLeft') next = Math.max(0, ratio - 0.05);
    else if (event.key === 'End') next = 1;
    else next = 0;
    seekVoicePlayback(message, voice, next);
  });

  const time = document.createElement('span');
  time.className = 'voice-time';
  time.textContent = VOICE ? VOICE.formatDuration(voice.seconds) : '0:00';

  player.append(playBtn, track, time);
  return player;
}

function pickVoiceMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
  ];
  for (const candidate of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    } catch { /* ignore */ }
  }
  return '';
}

async function requestMicrophone() {
  const constraints = {
    audio: {
      echoCancellation: prefs.echoCancellation === true,
      noiseSuppression: prefs.noiseSuppression !== false,
      autoGainControl: prefs.autoGainControl !== false,
      channelCount: 1,
      sampleRate: 48000,
    },
    video: false,
  };
  if (prefs.audioInput) constraints.audio.deviceId = { exact: prefs.audioInput };
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    if (prefs.audioInput && ['OverconstrainedError', 'NotFoundError', 'NotReadableError'].includes(err?.name)) {
      const audio = { ...constraints.audio };
      delete audio.deviceId;
      try {
        return await navigator.mediaDevices.getUserMedia({ audio, video: false });
      } catch { /* poniżej ostatnia próba */ }
      return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
    throw err;
  }
}

function createVoiceProcessing(stream) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return { stream, context: null };
  try {
    const context = new Ctx({ sampleRate: 48000 });
    if (context.state === 'suspended') void context.resume().catch(() => {});
    const source = context.createMediaStreamSource(stream);
    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 70;
    highpass.Q.value = 0.7;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 18;
    compressor.ratio.value = 2.5;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.25;
    const makeup = context.createGain();
    makeup.gain.value = prefs.autoGainControl !== false ? 1.15 : 1.0;
    const destination = context.createMediaStreamDestination();
    destination.channelCount = 1;
    destination.channelCountMode = 'explicit';
    destination.channelInterpretation = 'speakers';
    source.connect(highpass);
    highpass.connect(compressor);
    compressor.connect(makeup);
    makeup.connect(destination);
    if (!destination.stream.getAudioTracks().length) {
      void context.close().catch(() => {});
      return { stream, context: null };
    }
    return { stream: destination.stream, context };
  } catch {
    return { stream, context: null };
  }
}

function stopVoiceCapture(session) {
  for (const source of [session?.stream, session?.recordStream]) {
    if (!source) continue;
    try { source.getTracks().forEach((track) => track.stop()); } catch { /* ignore */ }
  }
  try { session?.processing?.context?.close?.(); } catch { /* ignore */ }
}

function openVoiceRecorder(stream, mimeType) {
  const options = { audioBitsPerSecond: VOICE_BITRATE };
  try {
    return new MediaRecorder(stream, mimeType ? { ...options, mimeType } : options);
  } catch {
    try { return new MediaRecorder(stream); } catch { return null; }
  }
}

function showVoiceRecordingUi() {
  $('composer').classList.add('recording');
  $('voiceRecording').hidden = false;
  $('voiceRecording').classList.remove('sending');
  $('voiceRecTime').textContent = '0:00';
  $('voiceSendBtn').disabled = false;
  $('voiceCancelBtn').disabled = false;
  $('messageInput').disabled = true;
  $('sendBtn').disabled = true;
  $('voiceBtn').hidden = true;
}

function setVoiceSendingUi() {
  $('voiceRecording').classList.add('sending');
  $('voiceRecTime').textContent = t('Wysyłanie…');
  $('voiceSendBtn').disabled = true;
  $('voiceCancelBtn').disabled = true;
}

function formatRecordingClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

async function startVoiceRecording() {
  if (voiceSession || voiceStarting) return;
  stopMicTest();
  if (!VOICE || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    toast(t('Nie udało się nagrać wiadomości głosowej.'));
    return;
  }
  const transport = voiceTransport();
  if (!transport) {
    toast(t('Nie można teraz nagrywać — połącz z serwerem.'));
    return;
  }
  voiceStarting = true;
  try {
    await beginVoiceRecording(transport);
  } finally {
    voiceStarting = false;
  }
}

async function beginVoiceRecording(transport) {
  const targetKey = transport.conversationKey;
  closeEmojiPicker();
  closeStickerPicker();
  closeGifPicker();
  hideMentionPop();
  resetVoicePlayback();

  let stream;
  try {
    stream = await requestMicrophone();
  } catch {
    toast(t('Nie udało się włączyć mikrofonu. Sprawdź uprawnienia w systemie.'), 4200);
    return;
  }
  if (conversationKey() !== targetKey || !voiceTransport()) {
    stream.getTracks().forEach((track) => track.stop());
    return;
  }

  const mimeType = pickVoiceMime();
  const processing = createVoiceProcessing(stream);
  let recordStream = processing.stream;
  let recorder = openVoiceRecorder(recordStream, mimeType);
  if (!recorder && recordStream !== stream) {
    try { processing.context?.close?.(); } catch { /* ignore */ }
    processing.context = null;
    recordStream = stream;
    recorder = openVoiceRecorder(recordStream, mimeType);
  }
  if (!recorder) {
    stopVoiceCapture({ stream, recordStream, processing });
    toast(t('Nie udało się nagrać wiadomości głosowej.'));
    return;
  }

  const session = {
    recorder,
    stream,
    recordStream,
    processing,
    chunks: [],
    startedAt: performance.now(),
    duration: 0,
    mode: 'send',
    mimeType: recorder.mimeType || mimeType || 'audio/webm',
    conversationKey: targetKey,
    timer: null,
    tick: null,
    stopping: false,
    finalized: false,
    finished: false,
    cancelled: false,
    silent: false,
  };
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) session.chunks.push(event.data);
  };
  recorder.onerror = () => {
    if (session.stopping) return;
    session.cancelled = true;
    session.silent = true;
    stopVoiceRecording('cancel');
    toast(t('Nie udało się nagrać wiadomości głosowej.'));
  };
  recorder.onstop = () => { void finalizeVoiceRecording(session); };

  try {
    recorder.start(250);
  } catch {
    stopVoiceCapture(session);
    toast(t('Nie udało się nagrać wiadomości głosowej.'));
    return;
  }

  voiceSession = session;
  showVoiceRecordingUi();
  session.tick = setInterval(() => {
    if (voiceSession !== session) return;
    const elapsed = Math.min(VOICE.MAX_SECONDS, (performance.now() - session.startedAt) / 1000);
    $('voiceRecTime').textContent = formatRecordingClock(elapsed);
  }, 200);
  session.timer = setTimeout(() => {
    if (voiceSession !== session || session.stopping) return;
    toast(t('Maksymalna długość nagrania to 120 sekund.'));
    stopVoiceRecording('send');
  }, VOICE.MAX_SECONDS * 1000);
}

function stopVoiceRecording(mode = 'send') {
  const session = voiceSession;
  if (!session || session.stopping || session.finalized) return;
  session.mode = mode === 'cancel' ? 'cancel' : 'send';
  session.duration = Math.min(VOICE.MAX_SECONDS, (performance.now() - session.startedAt) / 1000);
  session.stopping = true;
  if (session.mode === 'cancel') session.cancelled = true;
  clearInterval(session.tick);
  clearTimeout(session.timer);
  session.tick = null;
  session.timer = null;
  if (session.mode === 'send') setVoiceSendingUi();
  try {
    if (session.recorder.state !== 'inactive') session.recorder.stop();
    else void finalizeVoiceRecording(session);
  } catch {
    void finalizeVoiceRecording(session);
  }
}

function cancelVoiceRecording(silent = false) {
  const session = voiceSession;
  if (!session) return;
  session.cancelled = true;
  session.silent = Boolean(silent);
  session.mode = 'cancel';
  if (session.finalized) {
    finishVoiceSession(session);
    return;
  }
  stopVoiceRecording('cancel');
}

async function finalizeVoiceRecording(session) {
  if (session.finalized) return;
  session.finalized = true;
  clearInterval(session.tick);
  clearTimeout(session.timer);
  session.tick = null;
  session.timer = null;
  if (!session.duration) {
    session.duration = Math.min(VOICE.MAX_SECONDS, (performance.now() - session.startedAt) / 1000);
  }
  stopVoiceCapture(session);

  if (session.mode === 'cancel' || session.cancelled) {
    finishVoiceSession(session);
    return;
  }
  if (!session.chunks.length || session.duration < VOICE.MIN_SECONDS) {
    finishVoiceSession(session);
    if (!session.silent) toast(t('Nagranie jest za krótkie.'));
    return;
  }

  const blob = new Blob(session.chunks, { type: session.mimeType || 'audio/webm' });
  if (!blob.size) {
    finishVoiceSession(session);
    if (!session.silent) toast(t('Nie udało się nagrać wiadomości głosowej.'));
    return;
  }

  try {
    const uploaded = await uploadVoiceBlob(blob, session.duration);
    if (session.cancelled || voiceSession !== session) {
      void deleteVoiceUpload(uploaded);
      return;
    }
    if (conversationKey() !== session.conversationKey) {
      void deleteVoiceUpload(uploaded);
      toast(t('Nie wysłano nagrania — zmieniono rozmowę.'));
      return;
    }
    if (!deliverMessage(uploaded.token)) {
      void deleteVoiceUpload(uploaded);
      throw new Error(t('Nie udało się wysłać wiadomości głosowej.'));
    }
  } catch (err) {
    if (!session.cancelled && !session.silent) {
      toast(err?.message || t('Nie udało się wysłać wiadomości głosowej.'), 4200);
    }
  } finally {
    finishVoiceSession(session);
  }
}

function finishVoiceSession(session) {
  if (session.finished) return;
  session.finished = true;
  if (voiceSession === session) voiceSession = null;
  restoreVoiceComposer();
}

function restoreVoiceComposer() {
  const composer = $('composer');
  if (!composer) return;
  composer.classList.remove('recording');
  $('voiceRecording').hidden = true;
  $('voiceRecording').classList.remove('sending');
  $('voiceRecTime').textContent = '0:00';
  $('voiceSendBtn').disabled = false;
  $('voiceCancelBtn').disabled = false;
  const enabled = !composer.hidden;
  $('messageInput').disabled = !enabled;
  $('voiceBtn').hidden = !enabled;
  refreshComposerSendState();
}

async function uploadVoiceBlob(blob, seconds) {
  if (!VOICE) throw new Error(t('Nie udało się wysłać wiadomości głosowej.'));
  const transport = voiceTransport();
  if (!transport) throw new Error(t('Sesja głosowa wygasła — połącz ponownie.'));
  const url = `${transport.secure ? 'https' : 'http'}://${transport.address}/voice?key=${encodeURIComponent(transport.key)}&d=${encodeURIComponent(VOICE.clampSeconds(seconds))}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': blob.type || 'audio/webm' },
      body: blob,
      signal: controller.signal,
    });
  } catch {
    throw new Error(t('Nie udało się wysłać wiadomości głosowej.'));
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let error = '';
    try { error = (await response.json())?.error || ''; } catch { /* ignore */ }
    if (response.status === 413 || error === 'too-large') throw new Error(t('Nagranie jest za duże.'));
    if (response.status === 415 || error === 'unsupported-type') throw new Error(t('Nieobsługiwany format nagrania.'));
    if (response.status === 401) throw new Error(t('Sesja głosowa wygasła — połącz ponownie.'));
    throw new Error(t('Nie udało się wysłać wiadomości głosowej.'));
  }

  const data = await response.json().catch(() => null);
  if (!data || !data.ok || !data.id) throw new Error(t('Nie udało się wysłać wiadomości głosowej.'));
  return {
    token: VOICE.token(data.id, data.duration || seconds),
    id: data.id,
    address: transport.address,
    secure: transport.secure,
    key: transport.key,
  };
}

async function deleteVoiceUpload(uploaded) {
  if (!uploaded || !uploaded.id || !uploaded.address || !uploaded.key) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(`${uploaded.secure ? 'https' : 'http'}://${uploaded.address}/voice/${uploaded.id}?key=${encodeURIComponent(uploaded.key)}`, {
      method: 'DELETE',
      signal: controller.signal,
    });
  } catch { /* nagranie usunie późniejsze sprzątanie */ } finally {
    clearTimeout(timeout);
  }
}

function resetVoiceSession() {
  if (voiceSession) cancelVoiceRecording(true);
  resetVoicePlayback();
}

function bindVoice() {
  if (!$('voiceBtn')) return;
  $('voiceBtn').addEventListener('click', () => { void startVoiceRecording(); });
  $('voiceCancelBtn').addEventListener('click', () => cancelVoiceRecording());
  $('voiceSendBtn').addEventListener('click', () => stopVoiceRecording('send'));
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !voiceSession) return;
    event.preventDefault();
    event.stopPropagation();
    cancelVoiceRecording();
  }, true);
  window.addEventListener('beforeunload', () => {
    if (voiceSession) cancelVoiceRecording(true);
  });
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

function clearPendingAttachment() {
  if (pendingAttachment?.previewUrl) {
    try { URL.revokeObjectURL(pendingAttachment.previewUrl); } catch { /* ignore */ }
  }
  pendingAttachment = null;
  const box = $('composerAttachment');
  if (box) box.hidden = true;
  const thumb = $('composerAttachmentThumb');
  if (thumb) {
    thumb.style.backgroundImage = '';
    thumb.textContent = '📎';
  }
  refreshComposerSendState();
}

function refreshComposerSendState() {
  const input = $('messageInput');
  if (!input) return;
  const enabled = !$('composer')?.hidden && !voiceSession;
  $('sendBtn').disabled = !enabled || attachmentUploading || (!input.value.trim() && !pendingAttachment);
  const attach = $('attachBtn');
  if (attach) attach.disabled = !enabled || attachmentUploading;
}

function setPendingAttachment(file) {
  if (!file || !ATTACHMENTS) return;
  if (!voiceTransport()) {
    toast(t('Nie można teraz dodać pliku — połącz z serwerem.'));
    return;
  }
  if (file.size > ATTACHMENTS.MAX_BYTES) {
    toast(t('Plik jest za duży. Maksymalny rozmiar to 12 MB.'), 4200);
    return;
  }
  clearPendingAttachment();
  const previewUrl = ATTACHMENTS.kind(file.type) === 'image' ? URL.createObjectURL(file) : '';
  pendingAttachment = {
    file,
    name: ATTACHMENTS.safeName(file.name),
    mime: ATTACHMENTS.normalizeMime(file.type),
    size: file.size,
    previewUrl,
  };
  const box = $('composerAttachment');
  const thumb = $('composerAttachmentThumb');
  const name = $('composerAttachmentName');
  const meta = $('composerAttachmentMeta');
  if (box) box.hidden = false;
  if (name) name.textContent = pendingAttachment.name;
  if (meta) meta.textContent = `${ATTACHMENTS.formatSize(file.size)} • ${t('Wyślij plik')}`;
  if (thumb) {
    if (previewUrl) {
      thumb.textContent = '';
      thumb.style.backgroundImage = `url("${previewUrl}")`;
    } else {
      thumb.style.backgroundImage = '';
      thumb.textContent = '📎';
    }
  }
  $('messageInput').focus();
  refreshComposerSendState();
}

async function sendAttachmentMessage(caption) {
  if (!pendingAttachment || attachmentUploading) return;
  const transport = voiceTransport();
  if (!transport) {
    toast(t('Nie można teraz dodać pliku — połącz z serwerem.'));
    return;
  }
  const targetKey = conversationKey();
  const attachment = pendingAttachment;
  attachmentUploading = true;
  refreshComposerSendState();
  const url = `${transport.secure ? 'https' : 'http'}://${transport.address}/attachment?key=${encodeURIComponent(transport.key)}&n=${encodeURIComponent(attachment.name)}&m=${encodeURIComponent(attachment.mime)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': attachment.mime || 'application/octet-stream' },
      body: attachment.file,
      signal: controller.signal,
    });
    let data = null;
    try { data = await response.json(); } catch { /* ignore */ }
    if (!response.ok || !data?.ok || !data.id) {
      if (response.status === 413 || data?.error === 'too-large') {
        throw new Error(t('Plik jest za duży. Maksymalny rozmiar to 12 MB.'));
      }
      throw new Error(t('Nie udało się wysłać pliku.'));
    }
    if (conversationKey() !== targetKey) {
      toast(t('Nie wysłano pliku — zmieniono rozmowę.'));
      return;
    }
    const token = ATTACHMENTS.token(data.id, data.name || attachment.name, data.mime || attachment.mime, data.size || attachment.size);
    const text = caption ? `${token}\n${caption}` : token;
    if (!deliverMessage(text)) throw new Error(t('Nie udało się wysłać pliku.'));
    clearPendingAttachment();
    const input = $('messageInput');
    input.value = '';
    resizeInput();
    $('sendBtn').disabled = true;
    input.focus();
  } catch (error) {
    toast(error?.message || t('Nie udało się wysłać pliku.'), 4200);
  } finally {
    clearTimeout(timeout);
    attachmentUploading = false;
    refreshComposerSendState();
  }
}

function sendCurrentMessage(e) {
  if (e?.preventDefault) e.preventDefault();
  hideMentionPop();
  if (attachmentUploading) return;
  const input = $('messageInput');
  const text = input.value.trim();
  if (pendingAttachment) {
    void sendAttachmentMessage(text);
    return;
  }
  if (!text) return;
  if (!deliverMessage(text)) return;

  input.value = '';
  input.style.height = 'auto';
  $('sendBtn').disabled = true;
  input.focus();
  stopTyping();
}

let dropDepth = 0;

function bindAttachmentDrop() {
  const main = $('main');
  if (!main) return;
  const hint = $('dropHint');
  const show = () => {
    if (current.kind === 'home' || current.kind === 'minigames') return;
    if (hint) hint.hidden = false;
  };
  const hide = () => {
    dropDepth = 0;
    if (hint) hint.hidden = true;
  };
  main.addEventListener('dragenter', (event) => {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
    event.preventDefault();
    dropDepth += 1;
    show();
  });
  main.addEventListener('dragover', (event) => {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
  main.addEventListener('dragleave', (event) => {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
    dropDepth = Math.max(0, dropDepth - 1);
    if (!dropDepth) hide();
  });
  main.addEventListener('drop', (event) => {
    const files = event.dataTransfer?.files;
    if (!files || !files.length) return;
    event.preventDefault();
    hide();
    setPendingAttachment(files[0]);
  });
  const input = $('messageInput');
  if (input) {
    input.addEventListener('paste', (event) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind !== 'file') continue;
        const file = item.getAsFile();
        if (!file) continue;
        event.preventDefault();
        setPendingAttachment(file);
        break;
      }
    });
  }
}

function deliverMessage(text) {
  if (current.kind === 'home' || current.kind === 'minigames') {
    toast(t('Wybierz rozmowę lub kanał, aby napisać.'));
    return false;
  }

  if (current.kind === 'server') {
    const state = serverState(current.serverId);
    const channel = state?.channels.find((item) => item.id === current.id);
    if (!state || !state.ws || state.ws.readyState !== WebSocket.OPEN || !channel) {
      toast(t('Łączę z serwerem — spróbuj za chwilę.'));
      return false;
    }
    if (channel.type === 'voice') {
      toast(t('Kanały głosowe nie obsługują wiadomości tekstowych.'));
      return false;
    }
    state.ws.send(JSON.stringify({ type: 'server:message', channelId: channel.id, text }));
  } else {
    const entry = dmEntry(current.id);
    if (!entry) {
      toast(t('Ta rozmowa nie jest już dostępna.'));
      return false;
    }

    if (entry.kind === 'server') {
      const state = serverState(entry.serverId);
      if (!state || state.status !== 'online' || !state.ws || state.ws.readyState !== WebSocket.OPEN || !state.you) {
        toast(t('Serwer jest offline — spróbuj, gdy połączenie wróci.'));
        return false;
      }
      if (accountById(entry.memberId) && !isAccountFriend(entry.memberId)) {
        toast(t('Aby wysłać wiadomość, najpierw zaczekaj na akceptację zaproszenia.'));
        return false;
      }
      const message = {
        id: `sdm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        authorId: state.you.memberId,
        authorName: myName,
        authorColor: myColor,
        to: entry.memberId,
        text,
        at: Date.now(),
      };
      state.ws.send(JSON.stringify({ type: 'server:dm', to: entry.memberId, text }));
      pushHistory(conversationKey(), message);
    } else {
      if (!isAccountFriend(current.id)) {
        toast(t('Aby wysłać wiadomość, najpierw zaczekaj na akceptację zaproszenia.'));
        return false;
      }
      if (!wsReady()) {
        toast(t('Łączę z serwerem — spróbuj za chwilę.'));
        connect();
        return false;
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
  }

  if (searchQuery) {
    setMessageSearch(false);
  } else {
    renderMessages(false);
  }
  scrollBottom();
  return true;
}

let typingSent = false;
let typingStopTimer = null;

function typingTransport() {
  if (current.kind === 'dm') {
    const entry = dmEntry(current.id);
    if (!entry) return null;
    if (entry.kind === 'server') {
      const state = serverState(entry.serverId);
      if (!state || state.status !== 'online' || !state.ws || state.ws.readyState !== WebSocket.OPEN) return null;
      return { socket: state.ws, payload: { type: 'server:dm:typing', to: entry.memberId } };
    }
    return wsReady() ? { socket: ws, payload: { type: 'dm:typing', to: current.id } } : null;
  }
  if (current.kind === 'server') {
    const state = serverState(current.serverId);
    if (!state || state.status !== 'online' || !state.ws || state.ws.readyState !== WebSocket.OPEN) return null;
    const channel = state.channels.find((item) => item.id === current.id);
    if (!channel || channel.type === 'voice') return null;
    return { socket: state.ws, payload: { type: 'server:typing', channelId: current.id } };
  }
  return null;
}

function sendTyping() {
  const transport = typingTransport();
  if (!transport) return;
  if (!typingSent) {
    typingSent = true;
    transport.socket.send(JSON.stringify({ ...transport.payload, typing: true }));
  }
  clearTimeout(typingStopTimer);
  typingStopTimer = setTimeout(stopTyping, 900);
}

function stopTyping() {
  clearTimeout(typingStopTimer);
  if (!typingSent) return;
  typingSent = false;
  const transport = typingTransport();
  if (!transport) return;
  transport.socket.send(JSON.stringify({ ...transport.payload, typing: false }));
}

function renderTyping() {
  const el = $('typingBar');
  const names = [...typingUsers.values()].map((t) => t.name).filter(Boolean);
  if (!names.length) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  const safeNames = names.map((name) => esc(name));
  let label;
  if (safeNames.length === 1) {
    label = t('{name} pisze', { name: safeNames[0] });
  } else {
    label = t('{names} piszą', { names: safeNames.slice(0, 2).join(', ') });
    if (names.length > 2) label += t(' i {count} inne', { count: names.length - 2 });
  }
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

// ---------- Mini Gierki ----------
function miniGameCatalog() {
  return Array.isArray(CHILL_MINIGAMES?.catalog) ? CHILL_MINIGAMES.catalog : [];
}

function miniGameById(id) {
  return miniGameCatalog().find((game) => game.id === id) || null;
}

function miniGameLabel(game, field) {
  if (!game) return '';
  const en = game[`${field}En`];
  const pl = game[`${field}Pl`];
  return prefs.lang === 'en' ? (en || pl || '') : (pl || en || '');
}

function miniGameTags(game) {
  const tags = prefs.lang === 'en' ? game.tagsEn : game.tagsPl;
  return Array.isArray(tags) ? tags : [];
}

function miniGamesStorageKey() {
  return `chill.minigames.${myId || 'guest'}`;
}

function loadMiniGamesInstalled() {
  try {
    miniGamesInstalled = CHILL_MINIGAMES?.normalizeInstalled(localStorage.getItem(miniGamesStorageKey())) || [];
  } catch {
    miniGamesInstalled = [];
  }
  updateMiniGamesBadge();
}

function saveMiniGamesInstalled() {
  try {
    localStorage.setItem(miniGamesStorageKey(), JSON.stringify(miniGamesInstalled));
  } catch { /* ignore */ }
  updateMiniGamesBadge();
}

function updateMiniGamesBadge() {
  const badge = $('miniGamesCount');
  if (!badge) return;
  badge.textContent = String(miniGameCatalog().length);
  badge.title = t('Katalog gier');
}

function isMiniGameInstalled(gameId) {
  return miniGamesInstalled.includes(gameId);
}

function updateMiniGameDownloadUi(card, gameId) {
  const entry = miniGameDownloads.get(gameId);
  if (!card || !entry) return;
  const pct = Math.min(100, Math.floor(entry.pct));
  const status = card.querySelector('.minigame-status');
  if (status) {
    status.innerHTML = `<span>${esc(t('Pobieranie…'))}</span> <strong>${pct}%</strong><div class="minigame-progress"><span style="width:${pct}%"></span></div>`;
  }
  const button = card.querySelector('.mini-game-action');
  if (button) {
    button.disabled = true;
    button.textContent = t('Pobieranie…');
  }
}

function buildMiniGameCard(game) {
  const installed = isMiniGameInstalled(game.id);
  const download = miniGameDownloads.get(game.id);
  const pct = download ? Math.min(100, Math.floor(download.pct)) : 0;
  const card = document.createElement('article');
  card.className = `minigame-card${installed ? ' installed' : ''}`;
  card.dataset.gameId = game.id;
  const tags = miniGameTags(game).map((tag) => `<span class="minigame-tag">${esc(tag)}</span>`).join('');
  const status = download
    ? `<span>${esc(t('Pobieranie…'))}</span> <strong>${pct}%</strong><div class="minigame-progress"><span style="width:${pct}%"></span></div>`
    : installed
      ? `<strong>${esc(t('Zainstalowana'))}</strong> • ${esc(t('gotowa do gry'))}`
      : esc(t('Gotowa do pobrania — działa lokalnie'));
  card.innerHTML = `
    <div class="minigame-cover">
      <span class="minigame-cover-genre">${esc(miniGameLabel(game, 'genre'))}</span>
      <span class="minigame-cover-icon" aria-hidden="true">${esc(game.icon)}</span>
    </div>
    <div class="minigame-card-body">
      <h3>${esc(miniGameLabel(game, 'title'))}</h3>
      <p class="minigame-card-tagline">${esc(miniGameLabel(game, 'tagline'))}</p>
      <p class="minigame-card-desc">${esc(miniGameLabel(game, 'description'))}</p>
      <div class="minigame-tags">${tags}</div>
    </div>
    <div class="minigame-card-foot">
      <div class="minigame-status">${status}</div>
      <button type="button" class="btn-primary mini-game-action"${download ? ' disabled' : ''}>${esc(download ? t('Pobieranie…') : installed ? t('Graj') : t('Pobierz'))}</button>
    </div>
  `;
  const action = card.querySelector('.mini-game-action');
  if (action) {
    action.addEventListener('click', () => {
      if (isMiniGameInstalled(game.id)) launchMiniGame(game.id);
      else startMiniGameDownload(game.id);
    });
  }
  return card;
}

function renderMiniGamesHub(container) {
  if (!container) return;
  container.classList.remove('searching');
  container.innerHTML = '';
  const games = miniGameCatalog();
  const installedCount = miniGamesInstalled.filter((id) => games.some((game) => game.id === id)).length;
  const hub = document.createElement('div');
  hub.className = 'minigames-hub';

  const hero = document.createElement('section');
  hero.className = 'minigames-hero';
  hero.innerHTML = `
    <span class="minigames-kicker">${esc(t('Gry wbudowane'))}</span>
    <h2>${esc(t('Mini Gierki'))}</h2>
    <p>${esc(t('Krótkie gry w Chillu. Pobierz jednym kliknięciem i zagraj bez wychodzenia z aplikacji.'))}</p>
    <div class="minigames-hero-meta">
      <span class="minigames-hero-chip"><strong>${games.length}</strong> ${esc(t('gry w katalogu'))}</span>
      <span class="minigames-hero-chip"><strong>${installedCount}</strong> ${esc(t('zainstalowane'))}</span>
      <span class="minigames-hero-chip">${esc(t('Działa lokalnie'))}</span>
    </div>
  `;
  hub.appendChild(hero);

  const grid = document.createElement('div');
  grid.className = 'minigames-grid';
  for (const game of games) grid.appendChild(buildMiniGameCard(game));
  hub.appendChild(grid);

  const note = document.createElement('p');
  note.className = 'minigames-footnote';
  note.textContent = t('Każda gra jest oryginalną mini-produkcją Chill. Pobieranie jest lokalne — pliki zostają na tym komputerze.');
  hub.appendChild(note);

  container.appendChild(hub);
}

function startMiniGameDownload(gameId) {
  const game = miniGameById(gameId);
  if (!game || isMiniGameInstalled(gameId) || miniGameDownloads.has(gameId)) return;
  const entry = { pct: 0, timer: 0 };
  entry.timer = setInterval(() => {
    entry.pct = Math.min(100, entry.pct + 5 + Math.random() * 9);
    const card = document.querySelector(`.minigame-card[data-game-id="${gameId}"]`);
    if (card) updateMiniGameDownloadUi(card, gameId);
    if (entry.pct < 100) return;
    clearInterval(entry.timer);
    miniGameDownloads.delete(gameId);
    if (!isMiniGameInstalled(gameId)) {
      miniGamesInstalled.push(gameId);
      saveMiniGamesInstalled();
    }
    if (current.kind === 'minigames') {
      const messages = $('messages');
      const scrollTop = messages ? messages.scrollTop : 0;
      renderMiniGamesHub(messages);
      if (messages) messages.scrollTop = scrollTop;
    }
    toast(t('Pobrano {game}', { game: miniGameLabel(game, 'title') }));
  }, 110);
  miniGameDownloads.set(gameId, entry);
  const card = document.querySelector(`.minigame-card[data-game-id="${gameId}"]`);
  if (card) updateMiniGameDownloadUi(card, gameId);
}

function createMiniGameSession(game) {
  if (!CHILL_MINIGAMES?.createGame) {
    toast(t('Nie udało się uruchomić gry.'));
    return false;
  }
  if (miniGameSession) {
    try { miniGameSession.destroy(); } catch { /* ignore */ }
    miniGameSession = null;
  }
  try {
    miniGameSession = CHILL_MINIGAMES.createGame(game.id, $('minigameCanvas'), {
      language: prefs.lang,
      onHud: (state) => renderMiniGameHud(state),
      onEnd: (result) => finishMiniGame(result),
    });
    miniGameSession.resize();
    return true;
  } catch {
    toast(t('Nie udało się uruchomić gry.'));
    return false;
  }
}

function showMiniGameSplash({ mode, kicker, title, text, controls = '', primary, secondary }) {
  const splash = $('minigameSplash');
  if (!splash) return;
  splash.dataset.mode = mode;
  splash.hidden = false;
  $('minigameSplashKicker').textContent = kicker;
  $('minigameSplashTitle').textContent = title;
  $('minigameSplashText').textContent = text;
  const controlsEl = $('minigameSplashControls');
  controlsEl.textContent = controls;
  controlsEl.hidden = !controls;
  $('minigameSplashPrimary').textContent = primary;
  const secondaryBtn = $('minigameSplashSecondary');
  secondaryBtn.hidden = !secondary;
  secondaryBtn.textContent = secondary || '';
  try { $('minigameSplashPrimary').focus({ preventScroll: true }); } catch { /* ignore */ }
}

function showMiniGameIntro() {
  const game = miniGameCurrent;
  if (!game) return;
  showMiniGameSplash({
    mode: 'intro',
    kicker: t('Mini Gierki'),
    title: miniGameLabel(game, 'title'),
    text: miniGameLabel(game, 'description'),
    controls: miniGameLabel(game, 'controls'),
    primary: t('Start'),
    secondary: t('Wróć'),
  });
}

function launchMiniGame(gameId) {
  const game = miniGameById(gameId);
  if (!game || !isMiniGameInstalled(gameId)) return;
  miniGameCurrent = game;
  miniGameEnded = false;
  miniGameStarted = false;
  miniGamePaused = false;
  $('minigameOverlay').hidden = false;
  $('minigameTitle').textContent = miniGameLabel(game, 'title');
  $('minigameSub').textContent = miniGameLabel(game, 'genre');
  $('minigameHud').innerHTML = '';
  $('minigamePauseBtn').disabled = true;
  $('minigamePauseBtn').textContent = t('Pauza');
  $('minigameSplash').hidden = true;
  if (!createMiniGameSession(game)) {
    closeMiniGame();
    return;
  }
  showMiniGameIntro();
}

function startMiniGame() {
  if (!miniGameSession || miniGameEnded) return;
  $('minigameSplash').hidden = true;
  miniGameStarted = true;
  miniGamePaused = false;
  $('minigamePauseBtn').disabled = false;
  $('minigamePauseBtn').textContent = t('Pauza');
  miniGameSession.start();
  try { $('minigameCanvas').focus({ preventScroll: true }); } catch { /* ignore */ }
}

function pauseMiniGame() {
  if (!miniGameSession || miniGameEnded || !miniGameStarted || miniGamePaused) return;
  miniGameSession.pause();
  miniGamePaused = true;
  $('minigamePauseBtn').textContent = t('Wznów');
  showMiniGameSplash({
    mode: 'pause',
    kicker: t('Pauza'),
    title: t('Pauza'),
    text: t('Gra zatrzymana. Wróć, gdy będziesz gotowy.'),
    primary: t('Wznów'),
    secondary: t('Wyjdź'),
  });
}

function resumeMiniGame() {
  if (!miniGameSession || miniGameEnded) return;
  $('minigameSplash').hidden = true;
  miniGamePaused = false;
  miniGameStarted = true;
  $('minigamePauseBtn').disabled = false;
  $('minigamePauseBtn').textContent = t('Pauza');
  miniGameSession.resume();
  try { $('minigameCanvas').focus({ preventScroll: true }); } catch { /* ignore */ }
}

function toggleMiniGamePause() {
  if (!miniGameSession || miniGameEnded || !miniGameStarted) return;
  if (miniGamePaused) resumeMiniGame();
  else pauseMiniGame();
}

function finishMiniGame(result) {
  if (!miniGameCurrent) return;
  miniGameEnded = true;
  miniGameStarted = false;
  miniGamePaused = false;
  $('minigamePauseBtn').disabled = true;
  $('minigamePauseBtn').textContent = t('Pauza');

  let title = t('Koniec gry');
  let text = '';
  if (result?.mode === 'battle') {
    if (result.winner === 'player') {
      title = t('Zwycięstwo!');
      text = t('Przetrwałeś do końca i wygrałeś Ostatni Krąg. Eliminacje: {kills}.', { kills: result.kills || 0 });
    } else {
      text = t('Miejsce {placement} z 12 • Eliminacje: {kills}.', { placement: result.placement || 12, kills: result.kills || 0 });
    }
  } else if (result?.mode === 'duel') {
    title = result.winner === 'player' ? t('Wygrana!') : t('Porażka');
    text = result.winner === 'player'
      ? t('Pokonałeś bota {player}:{bot}.', { player: result.playerScore ?? 0, bot: result.botScore ?? 0 })
      : t('Bot wygrał {bot}:{player}.', { bot: result.botScore ?? 0, player: result.playerScore ?? 0 });
  }

  showMiniGameSplash({
    mode: 'end',
    kicker: t('Mini Gierki'),
    title,
    text,
    primary: t('Zagraj ponownie'),
    secondary: t('Wyjdź'),
  });
}

function restartMiniGame() {
  if (!miniGameCurrent) return;
  miniGameEnded = false;
  miniGameStarted = false;
  miniGamePaused = false;
  $('minigameHud').innerHTML = '';
  $('minigamePauseBtn').disabled = true;
  $('minigamePauseBtn').textContent = t('Pauza');
  if (!createMiniGameSession(miniGameCurrent)) {
    closeMiniGame();
    return;
  }
  showMiniGameIntro();
}

function closeMiniGame() {
  const overlay = $('minigameOverlay');
  const wasOpen = Boolean(overlay && !overlay.hidden);
  if (miniGameSession) {
    try { miniGameSession.destroy(); } catch { /* ignore */ }
    miniGameSession = null;
  }
  miniGameCurrent = null;
  miniGameStarted = false;
  miniGamePaused = false;
  miniGameEnded = false;
  if (overlay) overlay.hidden = true;
  const splash = $('minigameSplash');
  if (splash) splash.hidden = true;
  const hud = $('minigameHud');
  if (hud) hud.innerHTML = '';
  const pause = $('minigamePauseBtn');
  if (pause) {
    pause.disabled = true;
    pause.textContent = t('Pauza');
  }
  if (wasOpen && currentUser) {
    try { $('miniGamesBtn')?.focus({ preventScroll: true }); } catch { /* ignore */ }
  }
}

function renderMiniGameHud(state) {
  const hud = $('minigameHud');
  if (!hud || !state) return;
  if (state.mode === 'battle') {
    const hp = Math.max(0, Math.min(100, Number(state.hp) || 0));
    const shield = Math.max(0, Math.min(60, Number(state.shield) || 0));
    const mag = Math.max(0, Number(state.ammoMag) || 0);
    const reserve = Math.max(0, Number(state.ammoReserve) || 0);
    const reloading = Boolean(state.reloading);
    hud.innerHTML = `
      <div class="mg-hud-left">
        <div class="mg-player-line">${esc(state.playerName || t('Ty'))}<span>HP</span></div>
        <div class="mg-bar mg-bar-health${hp <= 30 ? ' low' : ''}"><span style="width:${hp}%"></span><b>${hp}</b></div>
        <div class="mg-bar mg-bar-shield"><span style="width:${(shield / 60) * 100}%"></span><b>${shield}</b></div>
      </div>
      <div class="mg-hud-center">
        <span class="mg-stat"><small>${esc(t('Żywi'))}</small><strong>${state.alive}/12</strong></span>
        <span class="mg-stat"><small>${esc(t('Eliminacje'))}</small><strong>${state.kills}</strong></span>
        <span class="mg-stat"><small>${esc(t('Broń'))}</small><strong>${esc(state.weapon)}</strong></span>
      </div>
      <div class="mg-hud-right">
        <span class="mg-storm${state.outside ? ' danger' : ''}">${esc(state.stormLabel)}</span>
        <span class="mg-ammo${reloading ? ' reloading' : ''}${mag === 0 && !reloading ? ' empty' : ''}"><small>${esc(reloading ? t('Przeładowanie…') : t('Amunicja'))}</small><strong>${mag}</strong><em>/${reserve}</em></span>
        <span class="mg-hint-chip">${esc(state.locked ? 'WASD · Shift · Space · E · R' : t('Kliknij, aby przejąć mysz'))}</span>
      </div>
    `;
    return;
  }
  if (state.mode === 'duel') {
    const hp = Math.max(0, Math.min(100, Number(state.hp) || 0));
    const shield = Math.max(0, Math.min(60, Number(state.shield) || 0));
    const dash = Math.max(0, Math.min(100, Number(state.dash) || 0));
    hud.innerHTML = `
      <div class="mg-hud-left">
        <div class="mg-player-line">${esc(state.playerName || t('Ty'))}<span>HP</span></div>
        <div class="mg-bar mg-bar-health${hp <= 30 ? ' low' : ''}"><span style="width:${hp}%"></span><b>${hp}</b></div>
        <div class="mg-bar mg-bar-shield"><span style="width:${(shield / 60) * 100}%"></span><b>${shield}</b></div>
      </div>
      <div class="mg-hud-center">
        <span class="mg-scoreboard"><span>${esc(state.playerName)}</span><strong>${state.scorePlayer}</strong><em>:</em><strong>${state.scoreBot}</strong><span>${esc(state.opponentName)}</span></span>
        <span class="mg-stat"><small>${esc(t('Runda'))}</small><strong>${state.round}</strong></span>
        <span class="mg-timer">${esc(t('Czas'))} ${state.timer}s</span>
      </div>
      <div class="mg-hud-right">
        <div class="mg-dash-label"><span>${esc(t('Dash'))}</span><span>${dash}%</span></div>
        <div class="mg-bar mg-bar-dash"><span style="width:${dash}%"></span></div>
        <span class="mg-hint-chip">${esc(t('Strzał: LPM / Spacja'))}</span>
      </div>
    `;
    return;
  }
  hud.innerHTML = '';
}

function bindMiniGames() {
  const nav = $('miniGamesBtn');
  if (nav) nav.addEventListener('click', selectMiniGames);

  const close = $('minigameClose');
  if (close) close.addEventListener('click', closeMiniGame);

  const pause = $('minigamePauseBtn');
  if (pause) pause.addEventListener('click', toggleMiniGamePause);

  const primary = $('minigameSplashPrimary');
  if (primary) {
    primary.addEventListener('click', () => {
      const mode = $('minigameSplash').dataset.mode;
      if (mode === 'end') restartMiniGame();
      else if (mode === 'pause') resumeMiniGame();
      else startMiniGame();
    });
  }

  const secondary = $('minigameSplashSecondary');
  if (secondary) secondary.addEventListener('click', closeMiniGame);
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
    || lower.includes('@wszyscy')
    || lower.includes('@everyone');
}

function notifyIncoming(message, where, isCurrent, channelContext = null) {
  const settings = channelContext
    ? channelSettings(channelContext.serverId, channelContext.channelId)
    : null;
  if (settings && (settings.muted || settings.notify === 'none')) return;
  if (!prefs.notify && !prefs.sound) return;
  if (document.hasFocus() && isCurrent) return;

  const mention = isMention(message.text);
  if (settings?.notify === 'mentions' && !mention) return;
  if (prefs.mentionsOnly && !mention) return;
  const sticker = stickerMessageDescriptor(message.text);
  const voice = voiceMessageDescriptor(message.text);

  if (prefs.notify && CHILL.chat?.notify) {
    CHILL.chat.notify({
      title: mention ? t('Wzmianka od {name}', { name: message.authorName }) : `${message.authorName} • ${where}`,
      body: sticker
        ? `${t('Naklejka')} • ${stickerLabel(sticker)}`
        : voice
          ? `${t('Wiadomość głosowa')} • ${VOICE ? VOICE.formatDuration(voice.seconds) : ''}`
          : gifMessageDescriptor(message.text) ? 'GIF' : String(message.text).slice(0, 160),
    });
  }
  if (prefs.sound) playSound(mention);
}

function playSound(mention = false, force = false) {
  if (!force && (!prefs.sound || prefs.deafened)) return;
  try {
    if (audioCtx?.state === 'closed') audioCtx = null;
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') void audioCtx.resume().catch(() => {});
    const now = audioCtx.currentTime;
    const master = audioCtx.createGain();
    const testLevel = force ? Math.max(0, Math.min(1, Number(prefs.outputVolume) / 100)) : 1;
    master.gain.value = 0.85 * testLevel;
    master.connect(audioCtx.destination);
    const notes = mention ? [659.25, 830.61, 987.77] : [783.99, 1046.5];
    notes.forEach((frequency, index) => {
      const start = now + index * 0.075;
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(mention ? 0.09 : 0.075, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.46);
      const fundamental = audioCtx.createOscillator();
      fundamental.type = 'sine';
      fundamental.frequency.setValueAtTime(frequency, start);
      const harmonic = audioCtx.createOscillator();
      harmonic.type = 'sine';
      harmonic.frequency.setValueAtTime(frequency * 2, start);
      const harmonicGain = audioCtx.createGain();
      harmonicGain.gain.value = 0.14;
      fundamental.connect(gain);
      harmonic.connect(harmonicGain);
      harmonicGain.connect(gain);
      gain.connect(master);
      fundamental.start(start);
      harmonic.start(start);
      fundamental.stop(start + 0.5);
      harmonic.stop(start + 0.5);
    });
  } catch { /* ignore */ }
}

// ============================================================
// EMOJI
// ============================================================
function bindEmoji() {
  const pop = $('emojiOverlay');
  $('emojiBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const opening = pop.hidden;
    pop.hidden = !pop.hidden;
    if (opening) {
      closeStickerPicker();
      closeGifPicker();
      $('emojiSearch').value = '';
      $('emojiSearch').focus();
      renderEmoji('');
      renderRecent();
    }
  });
  $('closeEmoji').addEventListener('click', closeEmojiPicker);
  pop.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', closeEmojiPicker);
  $('emojiSearch').addEventListener('input', () => renderEmoji($('emojiSearch').value));
  $('emojiSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeEmojiPicker();
    }
  });
}

function closeEmojiPicker() {
  const pop = $('emojiOverlay');
  if (pop) pop.hidden = true;
}

function renderEmoji(query) {
  const grid = $('emojiGrid');
  const q = String(query || '').trim().toLowerCase();
  const list = q ? EMOJIS.filter((item) => item.keys.includes(q) || item.char.includes(q)) : EMOJIS;
  grid.innerHTML = '';
  if (!list.length) {
    grid.innerHTML = `<div class="emoji-empty">${esc(t('Nic nie znaleziono'))}</div>`;
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
  closeEmojiPicker();
}

function saveRecent(char) {
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem(recentKey()) || '[]'); } catch { recent = []; }
  recent = [char, ...recent.filter((c) => c !== char)].slice(0, 12);
  try { localStorage.setItem(recentKey(), JSON.stringify(recent)); } catch { /* ignore */ }
}

// ============================================================
// NAKLEJKI
// ============================================================
function bindSticker() {
  const pop = $('stickerOverlay');
  const search = $('stickerSearch');
  if (!pop || !search) return;

  $('stickerBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const opening = pop.hidden;
    pop.hidden = !pop.hidden;
    $('stickerBtn').setAttribute('aria-expanded', String(!pop.hidden));
    if (opening) {
      closeEmojiPicker();
      closeGifPicker();
      hideMentionPop();
      stickerState.query = '';
      search.value = '';
      renderStickerCategories();
      renderStickers();
      search.focus();
    }
  });
  $('closeSticker').addEventListener('click', closeStickerPicker);
  pop.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', closeStickerPicker);

  search.addEventListener('input', () => {
    const wasSearching = Boolean(stickerState.query.trim());
    stickerState.query = search.value;
    const isSearching = Boolean(stickerState.query.trim());
    if (wasSearching !== isSearching) renderStickerCategories();
    renderStickers();
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeStickerPicker();
    }
  });
  $('stickerCategories').addEventListener('click', (e) => {
    const button = e.target.closest('[data-sticker-category]');
    if (!button) return;
    stickerState.category = button.dataset.stickerCategory;
    stickerState.query = '';
    search.value = '';
    renderStickerCategories();
    renderStickers();
    search.focus();
  });
}

function closeStickerPicker() {
  const pop = $('stickerOverlay');
  if (pop) pop.hidden = true;
  const button = $('stickerBtn');
  if (button) button.setAttribute('aria-expanded', 'false');
}

function renderStickerCategories() {
  const container = $('stickerCategories');
  if (!container) return;
  const categories = [STICKER_ALL_CATEGORIES, ...(STICKER_PACK?.categories || [])]
    .filter((category, index, list) => category && list.indexOf(category) === index);
  const searching = Boolean(stickerState.query.trim());
  container.innerHTML = '';
  for (const category of categories) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sticker-category';
    button.dataset.stickerCategory = category;
    button.textContent = t(category);
    const active = !searching && stickerState.category === category;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    container.appendChild(button);
  }
}

function stickerSearchText(sticker) {
  const fromPack = STICKER_PACK?.searchText?.(sticker);
  if (fromPack) return fromPack;
  return `${sticker?.labelPl || ''} ${sticker?.labelEn || ''} ${sticker?.category || ''} ${sticker?.tags || ''}`.toLowerCase();
}

function renderStickers() {
  const grid = $('stickerGrid');
  if (!grid) return;
  const terms = foldGifText(stickerState.query).split(/\s+/).filter(Boolean);
  const list = STICKERS.filter((sticker) => {
    if (!sticker || !STICKER_BY_ID.has(sticker.id)) return false;
    if (!terms.length) {
      return stickerState.category === STICKER_ALL_CATEGORIES || sticker.category === stickerState.category;
    }
    const haystack = foldGifText(stickerSearchText(sticker));
    return terms.every((term) => haystack.includes(term));
  });
  grid.innerHTML = '';
  grid.classList.toggle('is-empty', !list.length);
  if (!list.length) {
    grid.innerHTML = `<div class="sticker-empty">${esc(t('Nic nie znaleziono'))}</div>`;
    return;
  }
  for (const sticker of list) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sticker-item';
    button.title = stickerLabel(sticker);
    button.setAttribute('aria-label', `${t('Naklejka')}: ${stickerLabel(sticker)}`);
    const img = document.createElement('img');
    img.src = stickerDataUrl(sticker);
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    const label = document.createElement('span');
    label.className = 'sticker-item-label';
    label.textContent = stickerLabel(sticker);
    button.appendChild(img);
    button.appendChild(label);
    button.addEventListener('click', () => sendSticker(sticker));
    grid.appendChild(button);
  }
}

function sendSticker(sticker) {
  if (!sticker || !STICKER_BY_ID.has(sticker.id) || $('composer').hidden) return;
  const token = STICKER_PACK?.token?.(sticker.id) || `chill-sticker://${sticker.id}`;
  hideMentionPop();
  if (!deliverMessage(token)) return;
  closeStickerPicker();
  stopTyping();
  $('messageInput').focus();
}

function stickerMessageDescriptor(text) {
  const match = String(text ?? '').trim().match(STICKER_MESSAGE_RE);
  return match ? STICKER_BY_ID.get(match[1]) || null : null;
}

function stickerLabel(sticker) {
  if (!sticker) return t('Naklejka');
  const fromPack = STICKER_PACK?.label?.(sticker, prefs.lang);
  if (fromPack) return fromPack;
  return prefs.lang === 'en' ? (sticker.labelEn || sticker.labelPl) : (sticker.labelPl || sticker.labelEn);
}

function stickerDataUrl(sticker) {
  return STICKER_PACK?.dataUrl?.(sticker) || '';
}

// ============================================================
// GIF-Y
// ============================================================
function bindGif() {
  const pop = $('gifOverlay');
  const search = $('gifSearch');
  $('gifBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const opening = pop.hidden;
    pop.hidden = !pop.hidden;
    $('gifBtn').setAttribute('aria-expanded', String(!pop.hidden));
    if (opening) {
      closeEmojiPicker();
      closeStickerPicker();
      gifState.query = '';
      search.value = '';
      renderGifCategories();
      loadGifResults(true);
      search.focus();
    }
  });
  $('closeGif').addEventListener('click', closeGifPicker);
  pop.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', closeGifPicker);
  search.addEventListener('input', () => {
    const wasSearching = Boolean(gifState.query.trim());
    gifState.query = search.value;
    const isSearching = Boolean(gifState.query.trim());
    if (wasSearching !== isSearching) renderGifCategories();
    clearTimeout(gifSearchTimer);
    gifSearchTimer = setTimeout(() => loadGifResults(true), 300);
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeGifPicker();
    }
  });
  $('gifCategories').addEventListener('click', (e) => {
    const button = e.target.closest('[data-gif-category]');
    if (!button) return;
    gifState.category = button.dataset.gifCategory;
    gifState.query = '';
    search.value = '';
    renderGifCategories();
    loadGifResults(true);
    search.focus();
  });
  $('gifApiBtn')?.addEventListener('click', () => {
    const currentKey = getKlipyApiKey();
    const key = window.prompt(t('Wklej klucz API KLIPY z partner.klipy.com. Klucz zapisze się tylko na tym urządzeniu.'), currentKey);
    if (key === null) return;
    const trimmed = key.trim();
    try {
      if (trimmed) localStorage.setItem(GIF_KLIPY_API_KEY_STORAGE, trimmed);
      else localStorage.removeItem(GIF_KLIPY_API_KEY_STORAGE);
    } catch { /* storage can be unavailable in private mode */ }
    loadGifResults(true);
  });
  $('giphyLink').addEventListener('click', () => {
    CHILL.app?.openExternal?.('https://giphy.com');
  });
  $('klipyLink').addEventListener('click', () => {
    CHILL.app?.openExternal?.('https://klipy.com');
  });
  $('tenorLink').addEventListener('click', () => {
    CHILL.app?.openExternal?.('https://tenor.com');
  });
}

function closeGifPicker() {
  const pop = $('gifOverlay');
  if (pop) pop.hidden = true;
  if (gifPreviewObserver) {
    gifPreviewObserver.disconnect();
    gifPreviewObserver = null;
  }
  if (gifPageObserver) {
    gifPageObserver.disconnect();
    gifPageObserver = null;
  }
  const button = $('gifBtn');
  if (button) button.setAttribute('aria-expanded', 'false');
}

function getKlipyApiKey() {
  try { return String(localStorage.getItem(GIF_KLIPY_API_KEY_STORAGE) || '').trim(); }
  catch { return ''; }
}

function klipyQueryForPicker() {
  const typed = gifState.query.trim();
  if (typed) return typed;
  if (gifState.category === GIF_KLIPY_CATEGORY || gifState.category === GIF_ALL_CATEGORIES) return 'trending';
  return GIF_CATEGORY_QUERY[gifState.category] || gifState.category;
}

function mapKlipyResult(item) {
  if (!item || item.type === 'ad') return null;
  const formats = item.media_formats || {};
  const full = formats.gif?.url || formats.mediumgif?.url || '';
  const preview = formats.tinygif?.url || formats.nanogif?.url || formats.preview?.url || full;
  const dimensions = formats.tinygif?.dims || formats.preview?.dims || formats.gif?.dims || [0, 0];
  if (!KLIPY_MEDIA_RE.test(full) || !KLIPY_MEDIA_RE.test(preview)) return null;
  return {
    source: 'klipy', id: String(item.id || ''), title: String(item.title || item.content_description || 'GIF'),
    category: 'KLIPY', tags: Array.isArray(item.tags) ? item.tags.join(' ') : '',
    w: Number(dimensions[0]) || 0, h: Number(dimensions[1]) || 0,
    gif: full, webp: preview, page: String(item.itemurl || item.url || ''),
  };
}

async function loadGifResults(reset = false) {
  const key = getKlipyApiKey();
  if (!key) {
    gifRemoteState = { query: '', next: '', items: [], loading: false, done: true, error: '', requestId: gifRemoteState.requestId + 1 };
    renderGifs();
    return;
  }
  const query = klipyQueryForPicker();
  if (reset) {
    gifRemoteState = { query, next: '', items: [], loading: false, done: false, error: '', requestId: gifRemoteState.requestId + 1 };
  } else if (gifRemoteState.loading || gifRemoteState.done || gifRemoteState.query !== query) return;
  const requestId = gifRemoteState.requestId;
  gifRemoteState.loading = true;
  renderGifs();
  const params = new URLSearchParams({ key, q: query, limit: '30', country: 'PL', locale: 'pl_PL', contentfilter: 'high', media_filter: 'gif,tinygif,nanogif' });
  if (gifRemoteState.next) params.set('pos', gifRemoteState.next);
  try {
    const response = await fetch(`${GIF_KLIPY_API}/search?${params}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (requestId !== gifRemoteState.requestId) return;
    const incoming = (Array.isArray(data.results) ? data.results : []).map(mapKlipyResult).filter(Boolean);
    gifRemoteState.items = reset ? incoming : gifRemoteState.items.concat(incoming);
    gifRemoteState.next = String(data.next || '');
    gifRemoteState.done = !gifRemoteState.next || incoming.length === 0;
    gifRemoteState.error = '';
  } catch (error) {
    if (requestId === gifRemoteState.requestId) gifRemoteState.error = error?.message || 'error';
  } finally {
    if (requestId === gifRemoteState.requestId) {
      gifRemoteState.loading = false;
      renderGifs();
    }
  }
}

function renderGifCategories() {
  const container = $('gifCategories');
  if (!container) return;
  const categories = [GIF_ALL_CATEGORIES];
  if (GIFS.some((gif) => gif?.source === 'klipy')) categories.push(GIF_KLIPY_CATEGORY);
  if (GIFS.some((gif) => gif?.source === 'tenor')) categories.push(GIF_TENOR_CATEGORY);
  for (const gif of GIFS) {
    if (gif?.category && !categories.includes(gif.category)) categories.push(gif.category);
  }
  const searching = Boolean(gifState.query.trim());
  container.innerHTML = '';
  for (const category of categories) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gif-category';
    button.dataset.gifCategory = category;
    button.textContent = t(category);
    const active = !searching && gifState.category === category;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    container.appendChild(button);
  }
}

function renderGifs() {
  const grid = $('gifGrid');
  if (!grid) return;
  const query = foldGifText(gifState.query);
  const terms = query.split(/\s+/).filter(Boolean);
  const hasApiKey = Boolean(getKlipyApiKey());
  const list = hasApiKey ? gifRemoteState.items : GIFS.filter((gif) => {
    if (!isGifEntry(gif)) return false;
    if (terms.length) {
      const categorySearch = GIF_CATEGORY_QUERY[gif.category] || '';
      const source = gifSource(gif);
      const haystack = foldGifText(`${gif.title} ${gif.category} ${source} ${categorySearch} ${gif.tags}`);
      return terms.every((term) => {
        if (haystack.includes(term)) return true;
        return (GIF_QUERY_ALIASES[term] || []).some((alias) => haystack.includes(alias));
      });
    }
    if (gifState.category === GIF_ALL_CATEGORIES) return true;
    if (gifState.category === GIF_KLIPY_CATEGORY) return gif.source === 'klipy';
    if (gifState.category === GIF_TENOR_CATEGORY) return gif.source === 'tenor';
    return gif.category === gifState.category;
  });
  if (gifPreviewObserver) {
    gifPreviewObserver.disconnect();
    gifPreviewObserver = null;
  }
  if (gifPageObserver) {
    gifPageObserver.disconnect();
    gifPageObserver = null;
  }
  grid.innerHTML = '';
  grid.classList.toggle('is-empty', !list.length);
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'gif-empty';
    empty.textContent = !hasApiKey && gifState.query.trim()
      ? t('Wyniki z internetu wymagają klucza KLIPY.')
      : gifRemoteState.error ? t('Nie udało się pobrać GIF-ów. Sprawdź klucz API i połączenie.')
        : gifRemoteState.loading ? t('Ładowanie GIF-ów…') : t('Nic nie znaleziono');
    grid.appendChild(empty);
    if (!hasApiKey && gifState.query.trim()) {
      const setup = document.createElement('button');
      setup.type = 'button';
      setup.className = 'gif-inline-setup';
      setup.textContent = t('Skonfiguruj klucz API');
      setup.addEventListener('click', () => $('gifApiBtn')?.click());
      empty.appendChild(document.createElement('br'));
      empty.appendChild(setup);
    }
    return;
  }
  const columns = [document.createElement('div'), document.createElement('div')];
  for (const column of columns) {
    column.className = 'gif-column';
    grid.appendChild(column);
  }
  const observer = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const img = entry.target;
          observer.unobserve(img);
          if (img.dataset.src && !img.getAttribute('src')) img.src = img.dataset.src;
        }
      }, { root: grid, rootMargin: '320px 0px' })
    : null;
  gifPreviewObserver = observer;
  list.forEach((gif, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gif-item';
    button.title = gif.title || 'GIF';
    button.setAttribute('aria-label', gif.title || 'GIF');
    const preview = gifPreviewSource(gif);
    const fallback = gifPreviewFallbackSource(gif);
    const tiny = gifPreviewTinySource(gif);
    const img = document.createElement('img');
    img.dataset.src = preview;
    img.alt = gif.title || 'GIF';
    if (gif.w > 0 && gif.h > 0) {
      img.width = gif.w;
      img.height = gif.h;
    }
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      if (img.dataset.fallback !== '1' && fallback && fallback !== preview) {
        img.dataset.fallback = '1';
        img.src = fallback;
        return;
      }
      if (img.dataset.fallback !== '2' && tiny && tiny !== fallback) {
        img.dataset.fallback = '2';
        img.src = tiny;
        return;
      }
      img.remove();
      const label = document.createElement('span');
      label.className = 'gif-missing-label';
      label.textContent = 'GIF';
      button.appendChild(label);
    });
    button.appendChild(img);
    button.addEventListener('click', () => sendGif(gif));
    columns[index % 2].appendChild(button);
    if (observer) observer.observe(img);
    else img.src = img.dataset.src;
  });
  if (hasApiKey && (gifRemoteState.loading || !gifRemoteState.done)) {
    const sentinel = document.createElement('div');
    sentinel.className = 'gif-load-more';
    sentinel.textContent = gifRemoteState.loading ? t('Ładowanie GIF-ów…') : t('Przewiń, aby załadować więcej');
    grid.appendChild(sentinel);
    if (!gifRemoteState.loading && typeof IntersectionObserver === 'function') {
      gifPageObserver = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          gifPageObserver?.disconnect();
          gifPageObserver = null;
          loadGifResults(false);
        }
      }, { root: grid, rootMargin: '240px 0px' });
      gifPageObserver.observe(sentinel);
    }
  }
}

function sendGif(gif) {
  if (!isGifEntry(gif) || $('composer').hidden) return;
  const url = gifMessageUrl(gif);
  if (!url) return;
  if (gifSource(gif) === 'klipy' && gif.id && getKlipyApiKey()) {
    const params = new URLSearchParams({ key: getKlipyApiKey(), id: gif.id, q: klipyQueryForPicker(), country: 'PL', locale: 'pl_PL' });
    fetch(`${GIF_KLIPY_API}/registershare?${params}`).catch(() => {});
  }
  hideMentionPop();
  if (!deliverMessage(url)) return;
  closeGifPicker();
  stopTyping();
  $('messageInput').focus();
}

function gifMessageDescriptor(text) {
  const value = String(text ?? '').trim();
  const match = value.match(GIF_MESSAGE_RE);
  if (match) {
    const id = match[1];
    return GIF_BY_ID.get(id) || { source: 'giphy', id, title: 'GIF', w: 0, h: 0 };
  }
  const knownKlipy = KLIPY_BY_URL.get(value);
  if (knownKlipy) return knownKlipy;
  const knownTenor = TENOR_BY_URL.get(value);
  if (knownTenor) return knownTenor;
  if (KLIPY_MEDIA_RE.test(value)) {
    return {
      source: 'klipy',
      id: '',
      title: 'GIF',
      w: 0,
      h: 0,
      webp: value.endsWith('.webp') ? value : '',
      gif: value.endsWith('.gif') ? value : '',
    };
  }
  if (!TENOR_MEDIA_RE.test(value)) return null;
  return {
    source: 'tenor',
    id: '',
    title: 'GIF',
    w: 0,
    h: 0,
    webp: value.endsWith('.webp') ? value : '',
    gif: value.endsWith('.gif') ? value : '',
    page: '',
  };
}

function gifSource(gif) {
  if (gif?.source === 'klipy') return 'klipy';
  if (gif?.source === 'tenor') return 'tenor';
  return 'giphy';
}

function gifMessageUrl(gif) {
  const source = gifSource(gif);
  if (source === 'klipy') {
    return KLIPY_MEDIA_RE.test(String(gif?.gif || '')) ? gif.gif : '';
  }
  if (source === 'tenor') {
    return TENOR_MEDIA_RE.test(String(gif?.gif || '')) ? gif.gif : '';
  }
  return gifFullUrl(gif?.id);
}

function gifChatSource(gif) {
  const source = gifSource(gif);
  if (source === 'klipy') return gif?.webp || gif?.gif || '';
  if (source === 'tenor') {
    if (TENOR_MEDIA_RE.test(String(gif?.webp || ''))) return gif.webp;
    return TENOR_MEDIA_RE.test(String(gif?.gif || '')) ? gif.gif : '';
  }
  return gifChatUrl(gif?.id);
}

function gifChatFallback(gif) {
  const source = gifSource(gif);
  if (source === 'klipy') return gif?.gif || gif?.webp || '';
  if (source === 'tenor') {
    if (TENOR_MEDIA_RE.test(String(gif?.gif || ''))) return gif.gif;
    return TENOR_MEDIA_RE.test(String(gif?.webp || '')) ? gif.webp : '';
  }
  return gifFullUrl(gif?.id);
}

function gifOpenUrl(gif) {
  const source = gifSource(gif);
  if (source === 'klipy') {
    if (/^https:\/\/(?:www\.)?klipy\.com\//.test(String(gif?.page || ''))) return gif.page;
    const id = String(gif?.id || '');
    if (KLIPY_PAGE_RE.test(id)) return `https://klipy.com/gifs/${id}`;
    return gif?.gif || gif?.webp || '';
  }
  if (source === 'tenor') {
    if (TENOR_PAGE_RE.test(String(gif?.page || ''))) return gif.page;
    return gif?.gif || gif?.webp || '';
  }
  return gifFullUrl(gif?.id);
}

function gifAttributionLabel(gif) {
  const source = gifSource(gif);
  if (source === 'klipy') return 'GIF • KLIPY';
  if (source === 'tenor') return 'GIF • Tenor';
  return 'GIF • GIPHY';
}

function isGifEntry(gif) {
  if (!gif) return false;
  const source = gifSource(gif);
  if (source === 'klipy') {
    return KLIPY_MEDIA_RE.test(String(gif.webp || ''))
      && KLIPY_MEDIA_RE.test(String(gif.gif || ''))
      && Number(gif.w) > 0
      && Number(gif.h) > 0;
  }
  if (source === 'tenor') {
    return TENOR_MEDIA_RE.test(String(gif.webp || ''))
      && TENOR_MEDIA_RE.test(String(gif.gif || ''))
      && Number(gif.w) > 0
      && Number(gif.h) > 0;
  }
  return GIF_ID_RE.test(String(gif.id || ''));
}

function gifPreviewSource(gif) {
  const source = gifSource(gif);
  if (source === 'klipy') return gif?.webp || gif?.gif || '';
  if (source === 'tenor') {
    if (TENOR_MEDIA_RE.test(String(gif?.webp || ''))) return gif.webp;
    return TENOR_MEDIA_RE.test(String(gif?.gif || '')) ? gif.gif : '';
  }
  return gifPreviewUrl(gif?.id);
}

function gifPreviewFallbackSource(gif) {
  const source = gifSource(gif);
  if (source === 'klipy') return gif?.gif || gif?.webp || '';
  if (source === 'tenor') {
    if (TENOR_MEDIA_RE.test(String(gif?.gif || ''))) return gif.gif;
    return TENOR_MEDIA_RE.test(String(gif?.webp || '')) ? gif.webp : '';
  }
  return gifPreviewFallbackUrl(gif?.id);
}

function gifPreviewTinySource(gif) {
  if (gifSource(gif) === 'klipy') return '';
  if (gifSource(gif) === 'tenor') return '';
  return gifTinyPreviewUrl(gif?.id);
}

function gifUrl(id, file) {
  return GIF_ID_RE.test(String(id ?? '')) ? `${GIF_BASE}/${id}/${file}` : '';
}

function gifFullUrl(id) { return gifUrl(id, 'giphy.gif'); }
function gifChatUrl(id) { return gifUrl(id, 'giphy.webp'); }
function gifPreviewUrl(id) { return gifUrl(id, '200w.webp'); }
function gifPreviewFallbackUrl(id) { return gifUrl(id, '200w.gif'); }
function gifTinyPreviewUrl(id) { return gifUrl(id, 'giphy-preview.gif'); }

function foldGifText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
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
  $('profileDisplayName').addEventListener('input', renderProfileEditorPreview);
  $('profileColors').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-color]');
    if (!btn) return;
    profileColor = btn.dataset.color;
    markColorSelection($('profileColors'), profileColor);
    renderProfileEditorPreview();
  });

  $('avatarPresets').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-avatar-emoji]');
    if (!btn) return;
    profileAvatar = btn.dataset.avatarEmoji;
    renderProfileEditorPreview();
  });
  $('avatarResetBtn').addEventListener('click', () => {
    profileAvatar = '';
    renderProfileEditorPreview();
  });
  $('avatarUploadBtn').addEventListener('click', () => $('avatarUpload').click());
  $('avatarUpload').addEventListener('change', async () => {
    const file = $('avatarUpload').files?.[0];
    if (!file) return;
    try {
      profileAvatar = await readProfileImage(file, 'avatar');
      $('profileError').textContent = '';
      renderProfileEditorPreview();
    } catch {
      $('profileError').textContent = t('Nie udało się odczytać obrazu.');
    } finally {
      $('avatarUpload').value = '';
    }
  });

  $('bannerPresets').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-banner-preset]');
    if (!btn) return;
    profileBanner = { kind: 'preset', preset: btn.dataset.bannerPreset };
    renderProfileEditorPreview();
  });
  $('bannerUploadBtn').addEventListener('click', () => $('bannerUpload').click());
  $('bannerUpload').addEventListener('change', async () => {
    const file = $('bannerUpload').files?.[0];
    if (!file) return;
    try {
      const image = await readProfileImage(file, 'banner');
      profileBanner = { kind: 'image', image };
      $('profileError').textContent = '';
      renderProfileEditorPreview();
    } catch {
      $('profileError').textContent = t('Nie udało się odczytać obrazu.');
    } finally {
      $('bannerUpload').value = '';
    }
  });
  $('bannerCustomApply').addEventListener('click', () => {
    profileBanner = safeProfileBanner({
      kind: 'custom',
      colors: [$('bannerColorOne').value, $('bannerColorTwo').value],
      pattern: $('bannerPattern').value,
      emoji: $('bannerEmoji').value,
    }) || { kind: 'preset', preset: 'black' };
    renderProfileEditorPreview();
  });

  $('badgeChoices').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-badge]');
    if (!btn) return;
    const id = btn.dataset.badge;
    if (!PROFILE_BADGES[id]) return;
    if (profileBadges.includes(id)) profileBadges = profileBadges.filter((item) => item !== id);
    else if (profileBadges.length >= 5) {
      toast(t('Możesz wybrać maksymalnie 5 odznak.'));
      return;
    } else profileBadges = [...profileBadges, id];
    renderProfileEditorPreview();
  });

  $('addGameBtn').addEventListener('click', addGameFromEditor);
  $('newGameTitle').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addGameFromEditor();
    }
  });
  $('gameEditorList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-game]');
    if (!btn) return;
    const index = Number(btn.dataset.removeGame);
    if (!Number.isInteger(index) || index < 0 || index >= profileGames.length) return;
    profileGames.splice(index, 1);
    renderProfileEditorPreview();
  });

  $('saveProfile').addEventListener('click', saveProfile);
  $('changePasswordBtn').addEventListener('click', changePassword);

  $('themeChoices').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-choice]');
    if (!btn) return;
    applyTheme(btn.dataset.themeChoice);
    applyAppearance();
    savePrefs();
  });

  $('appearancePresets').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-appearance-preset]');
    if (!btn) return;
    applyAppearancePreset(btn.dataset.appearancePreset);
  });

  $('uiScaleRange').addEventListener('input', () => {
    const percent = Number($('uiScaleRange').value);
    prefs.uiScale = APPEARANCE ? APPEARANCE.normalizeUiScale(percent / 100) : 1;
    const label = $('uiScaleValue');
    if (label) label.textContent = `${Math.round(prefs.uiScale * 100)}%`;
  });

  $('uiScaleRange').addEventListener('change', () => {
    applyUiScale(prefs.uiScale);
    savePrefs();
  });

  $('uiScaleReset').addEventListener('click', () => {
    applyUiScale(APPEARANCE?.UI_SCALE_DEFAULT ?? 1);
    savePrefs();
  });

  $('shapeChoices').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-shape-choice]');
    if (!btn) return;
    prefs.shape = btn.dataset.shapeChoice;
    applyAppearance();
    savePrefs();
  });

  $('backgroundChoices').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-background-choice]');
    if (!btn) return;
    prefs.background = btn.dataset.backgroundChoice;
    applyAppearance();
    savePrefs();
  });

  $('messageStyleChoices').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-message-style]');
    if (!btn) return;
    prefs.messageStyle = btn.dataset.messageStyle;
    applyAppearance();
    savePrefs();
  });

  $('fontScaleChoices').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-font-scale]');
    if (!btn) return;
    prefs.fontScale = btn.dataset.fontScale;
    applyAppearance();
    savePrefs();
  });

  $('reduceMotionToggle').addEventListener('change', () => {
    prefs.reduceMotion = $('reduceMotionToggle').checked;
    applyAppearance();
    savePrefs();
  });

  $('highContrastToggle').addEventListener('change', () => {
    prefs.highContrast = $('highContrastToggle').checked;
    applyAppearance();
    savePrefs();
  });

  $('customAccent').addEventListener('input', () => {
    prefs.accent = $('customAccent').value;
    applyAppearance();
    savePrefs();
  });

  $('languageChoices').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-language]');
    if (!btn) return;
    applyLanguage(btn.dataset.language, true);
    savePrefs();
  });

  $('accentColors').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-accent]');
    if (!btn) return;
    applyAccent(btn.dataset.accent);
    applyAppearance();
    savePrefs();
  });

  $('compactToggle').addEventListener('change', () => {
    prefs.compact = $('compactToggle').checked;
    $('chatApp').classList.toggle('compact', prefs.compact);
    savePrefs();
  });

  $('settingsMicSelect').addEventListener('change', () => {
    chooseAudioDevice('mic', $('settingsMicSelect').value);
  });
  $('settingsOutputSelect').addEventListener('change', () => {
    chooseAudioDevice('output', $('settingsOutputSelect').value);
  });
  $('micTestBtn').addEventListener('click', () => { void toggleMicTest(); });
  $('noiseSuppressionToggle').addEventListener('change', () => {
    prefs.noiseSuppression = $('noiseSuppressionToggle').checked;
    savePrefs();
    if (liveVoice) restartLiveVoiceCapture();
  });
  $('autoGainToggle').addEventListener('change', () => {
    prefs.autoGainControl = $('autoGainToggle').checked;
    savePrefs();
    if (liveVoice) restartLiveVoiceCapture();
  });
  $('echoCancelToggle').addEventListener('change', () => {
    prefs.echoCancellation = $('echoCancelToggle').checked;
    savePrefs();
    if (liveVoice) restartLiveVoiceCapture();
  });
  $('outputVolumeRange').addEventListener('input', () => {
    prefs.outputVolume = Number($('outputVolumeRange').value);
    updateLiveVoiceOutputGain();
    $('outputVolumeValue').textContent = `${prefs.outputVolume}%`;
    applyVoiceVolume();
    savePrefs();
  });
  $('testSoundBtn').addEventListener('click', () => playSound(false, true));

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
      playingIcon = '';
      playingPlatform = '';
      playingSince = null;
      renderIdentity();
      broadcastActivity();
    }
  });

  $('autostartToggle').addEventListener('change', async () => {
    const wanted = $('autostartToggle').checked;
    try {
      const actual = await CHILL.app.autostartSet(wanted);
      $('autostartToggle').checked = Boolean(actual);
      toast(actual ? t('Chill będzie uruchamiany z Windows') : t('Autostart wyłączony'));
    } catch {
      $('autostartToggle').checked = !wanted;
      toast(t('Nie udało się zmienić autostartu'));
    }
  });

  $('checkUpdatesBtn').addEventListener('click', async () => {
    const status = $('updateStatus');
    status.textContent = t('Sprawdzam…');
    $('checkUpdatesBtn').disabled = true;
    try {
      const info = await CHILL.app.checkUpdates();
      status.textContent = info && info.version
        ? t('Dostępna wersja {version}.', { version: info.version })
        : t('Masz najnowszą wersję Chill.');
    } catch {
      status.textContent = t('Nie udało się sprawdzić aktualizacji.');
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
  closeAudioMenus();
  $('settingsOverlay').hidden = false;
  switchSettingsTab(tab);
  fillProfileForm();
  applyTheme(prefs.theme);
  applyAppearance();
  syncVoiceControls();
  refreshMicTestUi();
  $('compactToggle').checked = prefs.compact;
  $('notifyToggle').checked = prefs.notify;
  $('soundToggle').checked = prefs.sound;
  $('mentionsToggle').checked = prefs.mentionsOnly;
  $('gameDetectToggle').checked = prefs.gameDetect;
  document.querySelectorAll('[data-language]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.language === prefs.lang);
  });
  $('profileError').textContent = '';
  $('profileSaved').textContent = '';
  $('passwordError').textContent = '';
  $('passwordSaved').textContent = '';
  $('updateStatus').textContent = '';
  refreshAudioDevices();
  loadAutostart();
}

function closeSettings() {
  stopMicTest();
  $('settingsOverlay').hidden = true;
}

function switchSettingsTab(tab) {
  if (tab !== 'voice') stopMicTest();
  document.querySelectorAll('[data-settings-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.settingsTab === tab);
  });
  document.querySelectorAll('[data-settings-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== tab;
  });
  if (tab === 'voice') {
    renderSettingsAudioDevices();
    refreshAudioDevices();
  }
}

function renderGameEditor() {
  const list = $('gameEditorList');
  if (!list) return;
  $('gamesCount').textContent = `${profileGames.length}/12`;
  if (!profileGames.length) {
    list.innerHTML = `<p class="profile-empty">${esc(t('Brak gier w kolekcji.'))}</p>`;
    return;
  }
  list.innerHTML = profileGames.map((game, index) => {
    const color = safeColor(game.color, '') || gameColorFor(game.title);
    return `<div class="game-editor-row" data-game-index="${index}">
      <span class="game-editor-icon" style="--game-color:${esc(color)}" aria-hidden="true">${esc(gameIconFor(game.title))}</span>
      <span class="game-editor-title">${esc(game.title)}</span>
      <small>${esc(platformLabel(game.platform))}</small>
      <button type="button" class="icon-btn game-editor-remove" data-remove-game="${index}" title="${esc(t('Usuń grę'))}" aria-label="${esc(t('Usuń grę'))}">✕</button>
    </div>`;
  }).join('');
}

function renderProfileEditorPreview() {
  if (!$('settingsAvatar')) return;
  const draftName = String($('profileDisplayName')?.value || myName).trim() || myName;
  applyAvatar($('settingsAvatar'), draftName, profileColor || myColor, profileAvatar);
  applyBanner($('profileBannerPreview'), profileBanner || { kind: 'preset', preset: 'black' });
  $('settingsName').textContent = draftName;
  $('settingsUsername').textContent = currentUser ? `@${currentUser.username}` : '';
  $('settingsHandle').textContent = `@${myProfileHandle || handleForProfile(currentUser || { username: myName })}`;
  $('settingsBadgesPreview').innerHTML = profileBadgesHtml(profileBadges);
  document.querySelectorAll('#avatarPresets [data-avatar-emoji]').forEach((btn) => {
    btn.classList.toggle('selected', profileAvatar === btn.dataset.avatarEmoji);
  });
  document.querySelectorAll('#bannerPresets [data-banner-preset]').forEach((btn) => {
    btn.classList.toggle('selected', profileBanner?.kind === 'preset' && profileBanner.preset === btn.dataset.bannerPreset);
  });
  document.querySelectorAll('#badgeChoices [data-badge]').forEach((btn) => {
    btn.classList.toggle('selected', profileBadges.includes(btn.dataset.badge));
  });
  if (profileBanner?.kind === 'custom') {
    $('bannerColorOne').value = profileBanner.colors[0];
    $('bannerColorTwo').value = profileBanner.colors[1];
    $('bannerPattern').value = profileBanner.pattern;
    $('bannerEmoji').value = profileBanner.emoji || '';
  }
  renderGameEditor();
}

function fillProfileForm() {
  profileColor = myColor;
  profileAvatar = myAvatar;
  profileBanner = myBanner;
  profileBadges = safeBadges(myBadges);
  profileGames = (Array.isArray(myGames) ? myGames : []).map((game) => ({ ...game }));
  $('profileDisplayName').value = myName;
  $('profileAbout').value = myAbout || '';
  $('aboutCount').textContent = `${(myAbout || '').length}/160`;
  markColorSelection($('profileColors'), profileColor);
  document.querySelectorAll('#statusChoices [data-status]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.status === prefs.status);
  });
  renderProfileEditorPreview();
}

function readProfileImage(file, kind) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//i.test(String(file.type || ''))) {
      reject(new Error('format'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('image'));
      img.onload = () => {
        try {
          const square = kind === 'avatar';
          const maxWidth = square ? 256 : 960;
          const maxHeight = square ? 256 : 320;
          const ratio = Math.min(1, maxWidth / img.width, maxHeight / img.height);
          const width = Math.max(1, Math.round(img.width * ratio));
          const height = Math.max(1, Math.round(img.height * ratio));
          const canvas = document.createElement('canvas');
          canvas.width = square ? 256 : width;
          canvas.height = square ? 256 : height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#0b1210';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          if (square) {
            const side = Math.min(img.width, img.height);
            const sx = Math.max(0, (img.width - side) / 2);
            const sy = Math.max(0, (img.height - side) / 2);
            ctx.drawImage(img, sx, sy, side, side, 0, 0, 256, 256);
          } else {
            ctx.drawImage(img, 0, 0, width, height);
          }
          resolve(canvas.toDataURL('image/jpeg', square ? 0.87 : 0.82));
        } catch {
          reject(new Error('image'));
        }
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function addGameFromEditor() {
  const input = $('newGameTitle');
  const title = String(input.value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!title) {
    $('profileError').textContent = t('Wpisz nazwę gry.');
    return;
  }
  if (profileGames.length >= 12) {
    $('profileError').textContent = t('Kolekcja może mieć maksymalnie 12 gier.');
    return;
  }
  if (profileGames.some((game) => game.title.toLowerCase() === title.toLowerCase())) {
    $('profileError').textContent = t('Ta gra jest już w kolekcji.');
    return;
  }
  profileGames.push({
    title,
    platform: $('newGamePlatform').value || 'medal',
    color: gameColorFor(title),
  });
  input.value = '';
  $('profileError').textContent = '';
  renderProfileEditorPreview();
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
    errorEl.textContent = t('Nazwa musi mieć 2–32 znaki.');
    return;
  }
  if (about.length > 160) {
    errorEl.textContent = t('Opis może mieć maksymalnie 160 znaków.');
    return;
  }

  $('saveProfile').disabled = true;
  try {
    const result = await CHILL.auth.updateProfile({
      displayName,
      about,
      color: profileColor,
      avatar: profileAvatar,
      banner: profileBanner,
      badges: profileBadges,
      games: profileGames,
    });
    if (!result || !result.ok) {
      errorEl.textContent = result?.error ? translateError(result.error) : t('Nie udało się zapisać profilu.');
      return;
    }
    currentUser = { ...currentUser, ...result.user };
    myName = currentUser.displayName;
    myColor = currentUser.color;
    myAbout = currentUser.about;
    myProfileHandle = currentUser.handle || myProfileHandle;
    myAvatar = safeProfileAvatar(currentUser.avatar);
    myBanner = safeProfileBanner(currentUser.banner);
    myBadges = safeBadges(currentUser.badges);
    myGames = Array.isArray(currentUser.games) ? currentUser.games : [];
    renderIdentity();
    fillProfileForm();
    $('profileSaved').textContent = t('Zapisano');
    toast(t('Profil zaktualizowany'));
    const patch = {
      displayName: myName,
      name: myName,
      color: myColor,
      about: myAbout,
      handle: myProfileHandle,
      avatar: myAvatar,
      banner: myBanner,
      badges: myBadges,
      games: myGames,
    };
    if (wsReady()) ws.send(JSON.stringify({ type: 'profile', ...patch }));
    for (const state of serverStates.values()) {
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ type: 'server:profile', ...patch }));
      }
    }
    if (!$('userProfileOverlay').hidden) renderUserProfile();
  } catch {
    errorEl.textContent = t('Wystąpił błąd podczas zapisywania.');
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
    errorEl.textContent = t('Wpisz obecne i nowe hasło.');
    return;
  }
  if (newPassword.length < 8) {
    errorEl.textContent = t('Nowe hasło musi mieć co najmniej 8 znaków.');
    return;
  }

  $('changePasswordBtn').disabled = true;
  try {
    const result = await CHILL.auth.changePassword({ currentPassword, newPassword });
    if (!result || !result.ok) {
      errorEl.textContent = result?.error ? translateError(result.error) : t('Nie udało się zmienić hasła.');
      return;
    }
    $('currentPassword').value = '';
    $('newPassword').value = '';
    savedEl.textContent = t('Hasło zmienione');
    toast(t('Hasło zostało zmienione'));
  } catch {
    errorEl.textContent = t('Wystąpił błąd.');
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
    $('updateText').textContent = t('Dostępna jest nowsza wersja Chill.');
    $('updateBtn').hidden = false;
    $('updateBtn').disabled = false;
    $('updateBtn').textContent = t('Pobierz ręcznie');
    return;
  }

  $('updateBtn').hidden = true;
  $('updateText').textContent = t('Aktualizacja pobiera się i zainstaluje automatycznie…');
  if (autoUpdateVersion === info.version) return;
  autoUpdateVersion = info.version;
  setTimeout(() => startUpdateInstall(false), 900);
}

async function startUpdateInstall(manual) {
  if (downloadingUpdate) return;
  if (!CHILL.app?.installUpdate) {
    $('updateText').textContent = t('Nie można uruchomić aktualizacji w tej wersji.');
    return;
  }

  downloadingUpdate = true;
  $('updateBtn').disabled = true;
  $('updateBtn').hidden = true;
  $('updateProgress').style.width = '0%';
  $('updateText').textContent = t('Pobieranie aktualizacji — {pct}%', { pct: 0 });

  try {
    const started = await CHILL.app.installUpdate();
    if (started) {
      $('updateText').textContent = t('Uruchamiam instalator — Chill za chwilę się zamknie.');
      $('updateProgress').style.width = '100%';
      toast(t('Pobrano aktualizację — uruchamiam instalator'), 4000);
    } else {
      $('updateText').textContent = t('Automatyczna aktualizacja nie powiodła się. Pobierz instalator ręcznie.');
      $('updateBtn').hidden = false;
      $('updateBtn').disabled = false;
      $('updateBtn').textContent = t('Pobierz ręcznie');
      if (manual && currentUpdateInfo?.url) CHILL.app.openExternal?.(currentUpdateInfo.url);
    }
  } catch {
    $('updateText').textContent = t('Nie udało się pobrać aktualizacji. Spróbuj ponownie.');
    $('updateBtn').hidden = false;
    $('updateBtn').disabled = false;
    $('updateBtn').textContent = t('Spróbuj ponownie');
  } finally {
    downloadingUpdate = false;
  }
}

// ---------- Skróty ----------
function bindShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('minigameOverlay') && !$('minigameOverlay').hidden) {
        if (miniGameEnded) closeMiniGame();
        else if (miniGamePaused) resumeMiniGame();
        else toggleMiniGamePause();
        return;
      }
      if ($('screenShareOverlay') && !$('screenShareOverlay').hidden) { closeScreenSharePicker(); return; }
      if ($('serverSettingsOverlay') && !$('serverSettingsOverlay').hidden) {
        if (!$('serverSettingsIconPicker').hidden) { $('serverSettingsIconPicker').hidden = true; return; }
        if (!$('serverSettingsGameMenu').hidden) { $('serverSettingsGameMenu').hidden = true; return; }
        closeServerSettings();
        return;
      }
      if (!$('serverOverlay').hidden) { closeServerModal(); return; }
      if (!$('inviteOverlay').hidden) { $('inviteOverlay').hidden = true; return; }
      if (!$('settingsOverlay').hidden) { closeSettings(); return; }
      if (!$('stickerOverlay').hidden) { closeStickerPicker(); return; }
      if (!$('gifOverlay').hidden) { closeGifPicker(); return; }
      if (!$('emojiOverlay').hidden) { closeEmojiPicker(); return; }
      if (!$('searchBar').hidden) { setMessageSearch(false); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && currentUser && current.kind !== 'minigames') {
      e.preventDefault();
      setMessageSearch(true);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && currentUser) {
      e.preventDefault();
      $('conversationSearch').focus();
    }
  });
}
