// Chill — logika interfejsu (konta, czat, ustawienia)
'use strict';

const CHILL = window.chill || {};
const VOICE = window.CHILL_VOICE;
const WS_URL = `ws://127.0.0.1:${CHILL.chatPort || 47830}/chat`;
const $ = (id) => document.getElementById(id);

// ---------- GIF-y (statyczny katalog GIPHY + KLIPY) ----------
const GIFS = Array.isArray(window.CHILL_GIFS) ? window.CHILL_GIFS : [];
const GIF_BASE = 'https://media.giphy.com/media';
const GIF_ID_RE = /^[A-Za-z0-9]{5,40}$/;
const GIF_MESSAGE_RE = /^https:\/\/media\.giphy\.com\/media\/([A-Za-z0-9]{5,40})\/giphy\.gif$/;
const KLIPY_MEDIA_RE = /^https:\/\/static2?\.klipy\.com\/ii\/[a-f0-9]{32}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[A-Za-z0-9]+\.(?:webp|gif)$/;
const KLIPY_PAGE_RE = /^[a-z0-9][a-z0-9-]{2,79}$/;
const GIF_ALL_CATEGORIES = 'Wszystkie';
const GIF_KLIPY_CATEGORY = 'KLIPY';
const GIF_CATEGORY_QUERY = {
  Popularne: 'popular trending',
  Reakcje: 'reactions reaction reakcja',
  Śmieszne: 'funny',
  Zwierzęta: 'animals pets',
  Jedzenie: 'food drink',
  Gry: 'games gaming gra',
  KLIPY: 'klipy',
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

const GIF_BY_ID = new Map();
const KLIPY_BY_URL = new Map();
for (const gif of GIFS) {
  if (!gif) continue;
  if (gif.source === 'klipy') {
    if (KLIPY_MEDIA_RE.test(String(gif.webp || ''))) KLIPY_BY_URL.set(gif.webp, gif);
    if (KLIPY_MEDIA_RE.test(String(gif.gif || ''))) KLIPY_BY_URL.set(gif.gif, gif);
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
let ws = null;
let reconnectTimer = null;
let servers = [];
let activeServerId = null;
const serverStates = new Map();
let allUsers = [];
let friends = [];
let profileTarget = null;
let playing = null;
let searchQuery = '';
let localVoiceKey = '';
let voiceSession = null;
let voiceStarting = false;
let voiceAudio = null;
let voicePlayback = { messageId: '', url: '', duration: 0, playing: false };
let current = { kind: 'home' };
let profileColor = '#3ee0a3';
let regColor = '#3ee0a3';
let serverColor = '#3ee0a3';
let downloadingUpdate = false;
let autoUpdateVersion = '';
let currentUpdateInfo = null;
let audioCtx = null;
let mentionState = { start: 0, end: 0, items: [], index: 0 };
let channelType = 'text';
let menuChannelId = null;
let deleteChannelId = null;
let pendingChannelDelete = false;
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
  compact: false,
  notify: true,
  sound: true,
  mentionsOnly: false,
  gameDetect: true,
  status: 'online',
  lang: 'pl',
  micMuted: false,
  deafened: false,
  audioInput: '',
  audioOutput: '',
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
  'Motyw': 'Theme',
  'Systemowy': 'System',
  'Czarny': 'Black',
  'Biały': 'White',
  'Gradient': 'Gradient',
  'Kolor akcentu': 'Accent color',
  'Kompaktowe wiadomości': 'Compact messages',
  'Mniejszy odstęp między wiadomościami': 'Less spacing between messages',
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
  'Wyślij ten link znajomemu. Musi mieć uruchomiony Chill i wpisać go w oknie „Dołącz kodem”.': 'Send this link to a friend. They need Chill running and must enter it in the “Join with code” window.',
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

  // Daty / statusy
  'Dzisiaj': 'Today',
  'Wczoraj': 'Yesterday',
  'łączenie…': 'connecting…',
  'kanał': 'channel',
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
  else if (!['system', 'black', 'white', 'gradient'].includes(prefs.theme)) prefs.theme = 'system';
  if (prefs.lang !== 'en') prefs.lang = 'pl';
  prefs.micMuted = Boolean(prefs.micMuted);
  prefs.deafened = Boolean(prefs.deafened);
  prefs.audioInput = typeof prefs.audioInput === 'string' ? prefs.audioInput : '';
  prefs.audioOutput = typeof prefs.audioOutput === 'string' ? prefs.audioOutput : '';
}
function savePrefs() {
  try { localStorage.setItem(prefsKey(), JSON.stringify(prefs)); } catch { /* ignore */ }
  localStorage.setItem('chill.theme', prefs.theme);
  localStorage.setItem('chill.accent', prefs.accent);
  localStorage.setItem('chill.lang', prefs.lang);
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
  bindUserProfile();
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
  currentUser = user;
  myId = user.id;
  myName = user.displayName || user.username;
  myColor = user.color || '#3ee0a3';
  myAbout = user.about || '';
  playing = null;
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
  applyTheme(prefs.theme);
  applyAccent(prefs.accent);
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
  resetVoiceSession();
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
  $('myAvatar').textContent = initial(myName);
  $('myAvatar').style.background = myColor;
  $('myName').textContent = myName;
  const handle = currentUser.username || mentionHandle(myName);
  $('myHandle').textContent = handle ? `@${handle}` : '';
  const status = prefs.status || 'online';
  const statusText = statusLabel(status) + (playing ? ` • ${t('Gra w {game}', { game: playing })}` : '');
  $('myStatusDot').className = `status-dot ${status}`;
  $('myStatusDot').title = statusText;
  $('myProfileBtn').setAttribute('aria-label', `${t('Edytuj profil')} • ${statusText}`);
  $('settingsAvatar').textContent = initial(myName);
  $('settingsAvatar').style.background = myColor;
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
}

function chooseAudioDevice(kind, id) {
  const key = kind === 'mic' ? 'audioInput' : 'audioOutput';
  prefs[key] = String(id || '');
  savePrefs();
  closeAudioMenus(true);
}

function setMicMuted(muted) {
  prefs.micMuted = Boolean(muted);
  savePrefs();
  renderAudioState();
}

function setDeafened(deafened) {
  prefs.deafened = Boolean(deafened);
  savePrefs();
  renderAudioState();
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
      notifyIncoming(m, user?.name || t('Wiadomość prywatna'), current.kind === 'dm' && current.id === other);
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
    state.error = t('Nieprawidłowy adres serwera.');
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
    state.voiceKey = '';
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
        if (!state.channels.some((channel) => channel.id === current.id)) {
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

    case 'server:members': {
      state.members = Array.isArray(msg.members) ? msg.members : [];
      syncServerFriends(serverId);
      if (activeServerId === serverId) {
        renderMembers();
        renderHeader();
      }
      if (current.kind === 'dm' && current.id.startsWith(`srv:${serverId}:`)) {
        renderDmList();
        renderHeader();
        updateComposer();
      }
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
      if (!$('channelOverlay').hidden && ['invalid-channel', 'channel-exists', 'forbidden', 'voice-channel'].includes(msg.code)) {
        $('channelError').textContent = state.error;
        $('createChannelBtn').disabled = false;
      }
      if (!$('channelDeleteOverlay').hidden && ['invalid-channel', 'forbidden'].includes(msg.code)) {
        pendingChannelDelete = false;
        $('confirmDeleteChannel').disabled = false;
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
      socket = new WebSocket(`ws://${parsed.address}/chat`);
    } catch {
      reject(new Error(t('Nieprawidłowy adres serwera.')));
      return;
    }
    timer = setTimeout(() => finish(reject, new Error(t('Serwer nie odpowiada. Sprawdź adres i spróbuj ponownie.'))), 10_000);
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

  $('inviteBtn').addEventListener('click', openInviteModal);
  $('closeInviteModal').addEventListener('click', () => { $('inviteOverlay').hidden = true; });
  $('inviteOverlay').addEventListener('click', (e) => {
    if (e.target === $('inviteOverlay')) $('inviteOverlay').hidden = true;
  });
  $('copyInviteBtn').addEventListener('click', () => {
    copyText($('inviteLink').textContent).then(() => {
      $('inviteSaved').textContent = t('Skopiowano');
      setTimeout(() => { $('inviteSaved').textContent = ''; }, 2500);
    }).catch(() => toast(t('Nie udało się skopiować linku.')));
  });
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
  $('channelMenu').addEventListener('click', (e) => e.stopPropagation());
  $('deleteChannelBtn').addEventListener('click', () => {
    const state = serverState(activeServerId);
    const channel = state?.channels.find((item) => item.id === menuChannelId);
    closeChannelMenu();
    if (!channel) return;
    openChannelDelete(channel);
  });
  document.addEventListener('click', closeChannelMenu);
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('#channelMenu')) closeChannelMenu();
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
  channelType = 'text';
  selectChannelType(channelType);
  $('newChannelName').value = '';
  $('channelError').textContent = '';
  $('createChannelBtn').disabled = false;
  $('channelOverlay').hidden = false;
  setTimeout(() => $('newChannelName').focus(), 40);
}

function closeChannelModal() {
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
  $('createChannelBtn').disabled = true;
  state.ws.send(JSON.stringify({ type: 'server:channel:create', name, channelType }));
}

function openChannelMenu(event, channel) {
  const state = serverState(activeServerId);
  if (!channel || !state?.you?.owner || state.status !== 'online') return;
  event.preventDefault();
  event.stopPropagation();
  menuChannelId = channel.id;
  const menu = $('channelMenu');
  menu.hidden = false;
  const rect = menu.getBoundingClientRect();
  const x = Math.max(8, Math.min(event.clientX, window.innerWidth - rect.width - 8));
  const y = Math.max(8, Math.min(event.clientY, window.innerHeight - rect.height - 8));
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  $('deleteChannelBtn').focus();
}

function closeChannelMenu() {
  menuChannelId = null;
  const menu = $('channelMenu');
  if (menu) menu.hidden = true;
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

async function joinServer() {
  const raw = $('serverInvite').value.trim();
  const errorEl = $('joinServerError');
  errorEl.textContent = '';
  const parsed = parseInvite(raw);
  if (!parsed) {
    errorEl.textContent = t('Wklej pełny link, np. chill://192.168.1.5:47830/AB12CD.');
    return;
  }
  $('joinServerBtn').disabled = true;
  errorEl.textContent = t('Łączę…');
  try {
    const known = servers.find((server) => server.invite === parsed.invite && (server.address === parsed.address || server.owner));
    if (known) {
      closeServerModal();
      selectServer(known.id);
      connectServer(known);
      toast(t('Już należysz do tego serwera'));
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
    if (!result || !result.ok) throw new Error(result?.error ? translateError(result.error) : t('Nie udało się zapisać serwera.'));
    upsertServer(result.server);
    ensureServerState(result.server);
    closeServerModal();
    selectServer(result.server.id);
    connectServer(result.server);
    toast(t('Dołączono do „{name}”', { name: result.server.name }));
    errorEl.textContent = '';
  } catch (err) {
    errorEl.textContent = err.message || t('Nie udało się dołączyć do serwera.');
  } finally {
    $('joinServerBtn').disabled = false;
    if (!errorEl.textContent) errorEl.textContent = '';
  }
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

async function openInviteModal() {
  const state = serverState(activeServerId);
  if (!state) return;
  $('inviteOverlay').hidden = false;
  $('inviteServerName').textContent = state.server.name;
  $('inviteSaved').textContent = '';
  $('leaveServerBtn').textContent = state.you?.owner ? t('Usuń serwer') : t('Opuść serwer');
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
  $('leaveServerBtn').textContent = state?.you?.owner ? t('Usuń serwer') : t('Opuść serwer');
  $('leaveServerBtn').disabled = false;
}

async function leaveActiveServer() {
  const state = serverState(activeServerId);
  if (!state) return;
  if (!leaveArmed) {
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
  resetVoiceSession();
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
      voiceKey: '',
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

function selectServer(id) {
  const server = servers.find((item) => item.id === id);
  if (!server) return;
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
  $('inviteBtn').hidden = !state;
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
    container.innerHTML = `<div class="nav-empty">${state.status === 'online' ? esc(t('Brak kanałów')) : esc(t('Łączę z serwerem…'))}</div>`;
    return;
  }

  for (const channel of list) {
    const key = `server:${state.server.id}:${channel.id}`;
    const isActive = current.kind === 'server' && current.serverId === state.server.id && current.id === channel.id;
    const count = isActive ? 0 : unread.get(key) || 0;
    const voice = channel.type === 'voice';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `nav-item${voice ? ' voice-channel' : ''}${isActive ? ' active' : ''}${count ? ' unread' : ''}`;
    button.title = voice ? t('Kanał głosowy') : `#${channel.name}`;
    button.innerHTML = `
      <span class="nav-icon${voice ? ' voice-icon' : ''}">${voice ? '🔊' : '#'}</span>
      <span class="nav-label">${esc(channel.name)}</span>
      ${count ? `<span class="nav-badge">${count > 99 ? '99+' : count}</span>` : ''}
    `;
    button.addEventListener('click', () => selectChannel(channel.id));
    button.addEventListener('contextmenu', (e) => {
      if (!state.you?.owner) return;
      openChannelMenu(e, channel);
    });
    container.appendChild(button);
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

function friendByDmId(dmId) {
  return friends.find((item) => item.dmId === dmId) || null;
}

function friendByServerMember(serverId, memberId) {
  return friends.find((item) => item.kind === 'server' && item.serverId === serverId && item.memberId === memberId) || null;
}

function serverFriendDisplay(friend) {
  const state = serverState(friend.serverId);
  const member = state?.members.find((item) => item.id === friend.memberId);
  return {
    dmId: friend.dmId,
    name: member?.name || friend.name || t('Znajomy'),
    color: safeColor(member?.color || friend.color, '#3ee0a3'),
    online: Boolean(member?.online),
    owner: Boolean(member?.owner),
    serverId: friend.serverId,
    memberId: friend.memberId,
    serverName: state?.server?.name || friend.serverName || t('Serwer'),
    serverOnline: state?.status === 'online',
  };
}

function dmEntry(dmId) {
  const friend = friendByDmId(dmId);
  if (friend) {
    return { ...serverFriendDisplay(friend), kind: 'server', friend, username: '', about: '', playing: null };
  }
  const user = allUsers.find((item) => item.id === dmId);
  if (!user) return null;
  return {
    dmId,
    kind: 'local',
    friend: null,
    name: user.name,
    username: user.username,
    color: user.color,
    online: Boolean(user.online),
    status: user.online ? user.status : 'offline',
    about: user.about || '',
    playing: user.playing || null,
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

  for (const user of allUsers) {
    if (user.id === myId) continue;
    const status = user.online ? user.status : 'offline';
    entries.push({
      dmId: user.id,
      name: user.name,
      color: user.color,
      online: Boolean(user.online),
      status,
      sub: user.playing ? t('Gra w {game}', { game: user.playing }) : statusLabel(status),
      search: `${user.name} ${user.username || ''}`,
    });
  }

  for (const friend of friends.filter((item) => item.kind === 'server')) {
    const info = serverFriendDisplay(friend);
    entries.push({
      dmId: friend.dmId,
      name: info.name,
      color: info.color,
      online: info.online,
      status: info.online ? 'online' : 'offline',
      sub: `${info.serverName} • ${info.online ? t('Online') : t('Offline')}`,
      search: `${info.name} ${info.serverName}`,
    });
  }

  const filtered = entries
    .filter((entry) => !query || entry.search.toLowerCase().includes(query))
    .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, prefs.lang === 'en' ? 'en' : 'pl'));

  container.innerHTML = '';
  if (!filtered.length) {
    container.innerHTML = `<div class="nav-empty">${esc(t('Brak znajomych — kliknij osobę na liście członków'))}</div>`;
    return;
  }

  for (const entry of filtered) {
    const key = `dm:${entry.dmId}`;
    const isActive = current.kind === 'dm' && current.id === entry.dmId;
    const count = isActive ? 0 : unread.get(key) || 0;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `nav-item${isActive ? ' active' : ''}${count ? ' unread' : ''}`;
    button.innerHTML = `
      <span class="nav-avatar" style="background:${safeColor(entry.color, '#3ee0a3')}">
        ${esc(initial(entry.name))}
        <span class="status-dot ${esc(entry.status)}"></span>
      </span>
      <span class="nav-label">${esc(entry.name)}<span class="nav-sub">${esc(entry.sub)}</span></span>
      ${count ? `<span class="nav-badge">${count > 99 ? '99+' : count}</span>` : ''}
    `;
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
      const sub = member.owner ? t('Właściciel serwera') : member.online ? t('Online') : t('Offline');
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'member';
      item.innerHTML = `
        <span class="member-avatar" style="background:${safeColor(member.color, '#3ee0a3')}">
          ${esc(initial(member.name))}
          <span class="status-dot ${esc(status)}"></span>
        </span>
        <span class="member-info">
          <strong>${esc(member.name)}${member.id === state.you?.memberId ? ` ${esc(t('(Ty)'))}` : ''}</strong>
          <small>${esc(sub)}</small>
        </span>
      `;
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
    const sub = user.playing ? t('Gra w {game}', { game: user.playing }) : statusLabel(status);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'member';
    item.innerHTML = `
      <span class="member-avatar" style="background:${safeColor(user.color, '#3ee0a3')}">
        ${esc(initial(user.name))}
        <span class="status-dot ${esc(status)}"></span>
      </span>
      <span class="member-info">
        <strong>${esc(user.name)}${user.id === myId ? ` ${esc(t('(Ty)'))}` : ''}</strong>
        <small>${esc(sub)}</small>
      </span>
    `;
    item.addEventListener('click', () => {
      if (user.id === myId) openSettings('profile');
      else openLocalProfile(user.id, user);
    });
    container.appendChild(item);
  }
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
    color: fallback.color || '#3ee0a3',
    about: '',
    online: false,
    status: 'offline',
  };
  profileTarget = { kind: 'local', user };
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
  };
  profileTarget = { kind: 'server', serverId, member };
  $('userProfileError').textContent = '';
  renderUserProfile();
  $('userProfileOverlay').hidden = false;
}

function closeUserProfile() {
  $('userProfileOverlay').hidden = true;
  profileTarget = null;
}

function renderUserProfile() {
  const target = profileTarget;
  if (!target) return;

  const isServer = target.kind === 'server';
  const name = isServer ? target.member.name : target.user.name;
  const color = isServer ? target.member.color : target.user.color;
  const online = isServer ? Boolean(target.member.online) : Boolean(target.user.online);
  const friend = isServer ? friendByServerMember(target.serverId, target.member.id) : null;
  const serverStateEntry = isServer ? serverState(target.serverId) : null;
  const serverName = serverStateEntry?.server?.name || t('Serwer');
  const statusText = isServer
    ? target.member.owner ? t('Właściciel serwera') : online ? t('Online') : t('Offline')
    : online ? statusLabel(target.user.status) : t('Offline');

  $('userProfileAvatar').textContent = initial(name);
  $('userProfileAvatar').style.background = safeColor(color, '#3ee0a3');
  $('userProfileName').textContent = name;
  $('userProfileHandle').textContent = isServer
    ? `@${mentionHandle(name) || 'osoba'}`
    : `@${target.user.username || mentionHandle(name)}`;
  $('userProfileStatus').textContent = target.user?.playing && !isServer
    ? `${statusText} • ${t('Gra w {game}', { game: target.user.playing })}`
    : statusText;
  $('userProfileStatus').classList.toggle('offline', !online);
  $('userProfileAbout').textContent = isServer
    ? (online ? t('Ta osoba jest teraz online na serwerze.') : t('Ta osoba jest teraz offline.'))
    : (target.user.about || t('Brak opisu profilu.'));

  const serverBox = $('userProfileServer');
  if (isServer) {
    serverBox.hidden = false;
    serverBox.innerHTML = `${esc(t('Serwer:'))} <strong>${esc(serverName)}</strong>${serverStateEntry?.status === 'online' ? '' : ` • ${esc(t('połączenie offline'))}`}`;
  } else {
    serverBox.hidden = true;
    serverBox.textContent = '';
  }

  const addBtn = $('addFriendBtn');
  const dmBtn = $('dmFriendBtn');
  const note = $('userProfileNote');
  addBtn.hidden = !isServer || Boolean(friend);
  dmBtn.hidden = isServer && !friend;
  dmBtn.disabled = false;
  addBtn.disabled = false;
  addBtn.textContent = t('Dodaj do znajomych');
  dmBtn.textContent = t('Napisz wiadomość');

  if (isServer && !friend) {
    note.textContent = t('Dodaj tę osobę do znajomych, aby zacząć prywatną rozmowę.');
  } else if (isServer) {
    note.textContent = t('Masz tę osobę w znajomych.');
  } else {
    note.textContent = t('Konto lokalne — możesz napisać od razu.');
  }
}

function addProfileFriend() {
  const target = profileTarget;
  if (!target || target.kind !== 'server') return;
  const state = serverState(target.serverId);
  const member = state?.members.find((item) => item.id === target.member.id) || target.member;
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
  const dmId = target.kind === 'server'
    ? serverFriendId(target.serverId, target.member.id)
    : target.user.id;
  closeUserProfile();
  selectConversation('dm', dmId);
}

function bindUserProfile() {
  $('closeUserProfile').addEventListener('click', closeUserProfile);
  $('userProfileOverlay').addEventListener('click', (e) => {
    if (e.target === $('userProfileOverlay')) closeUserProfile();
  });
  $('addFriendBtn').addEventListener('click', addProfileFriend);
  $('dmFriendBtn').addEventListener('click', messageProfileFriend);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('userProfileOverlay').hidden) {
      e.preventDefault();
      closeUserProfile();
    }
  });
}

function renderHeader() {
  $('backBtn').style.display = 'none';
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
      $('chatSub').textContent = `${entry.serverName} • ${entry.online ? t('Online') : t('Offline')}`;
    } else {
      $('chatSub').textContent = entry.playing
        ? t('Gra w {game} • {status}', { game: entry.playing, status: statusLabel(status) })
        : statusLabel(status);
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
  $('sendBtn').disabled = !enabled || recording || !input.value.trim();
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
      const wrap = document.createElement('div');
      wrap.className = 'empty-chat voice-empty';
      wrap.innerHTML = `
        <div class="empty-ico">🔊</div>
        <h3>${esc(t('Kanał głosowy'))}</h3>
        <p>${esc(t('Ten kanał jest przeznaczony na rozmowy głosowe.'))}</p>
      `;
      container.appendChild(wrap);
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
      if (gifSource(gif) === 'klipy' && gif.w > 0 && gif.h > 0) {
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

function voiceMessageDescriptor(text) {
  return VOICE ? VOICE.parse(text) : null;
}

function voiceTransport() {
  if (current.kind === 'server') {
    const state = serverState(current.serverId);
    const channel = state?.channels.find((item) => item.id === current.id);
    if (!state || state.status !== 'online' || !state.ws || state.ws.readyState !== WebSocket.OPEN) return null;
    if (!channel || channel.type === 'voice' || !state.voiceKey) return null;
    const address = state.server.address || (state.server.owner ? `127.0.0.1:${CHILL.chatPort || 47830}` : '');
    if (!address) return null;
    return { address, key: state.voiceKey, conversationKey: conversationKey() };
  }
  if (current.kind === 'dm') {
    const entry = dmEntry(current.id);
    if (!entry) return null;
    if (entry.kind === 'server') {
      const state = serverState(entry.serverId);
      if (!state || state.status !== 'online' || !state.ws || state.ws.readyState !== WebSocket.OPEN || !state.voiceKey) return null;
      const address = state.server.address || (state.server.owner ? `127.0.0.1:${CHILL.chatPort || 47830}` : '');
      if (!address) return null;
      return { address, key: state.voiceKey, conversationKey: conversationKey() };
    }
    if (!wsReady() || !localVoiceKey) return null;
    return { address: `127.0.0.1:${CHILL.chatPort || 47830}`, key: localVoiceKey, conversationKey: conversationKey() };
  }
  return null;
}

function voiceSourceUrl(voice) {
  const transport = voiceTransport();
  if (!transport || !voice || !voice.id) return '';
  return `http://${transport.address}/voice/${voice.id}?key=${encodeURIComponent(transport.key)}`;
}

function ensureVoiceAudio() {
  if (voiceAudio) return voiceAudio;
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
    voicePlayback.playing = false;
    updateVoicePlayerUi();
    toast(t('Nie można odtworzyć wiadomości głosowej.'));
  });
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
      audio.play().catch(() => {
        voicePlayback.playing = false;
        updateVoicePlayerUi();
        toast(t('Nie można odtworzyć wiadomości głosowej.'));
      });
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
  };
  audio.dataset.messageId = message.id;
  audio.dataset.url = url;
  audio.src = url;
  updateVoicePlayerUi();
  audio.play().catch(() => {
    if (voicePlayback.messageId !== message.id) return;
    voicePlayback.playing = false;
    updateVoicePlayerUi();
    toast(t('Nie można odtworzyć wiadomości głosowej.'));
  });
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
  voicePlayback = { messageId: '', url: '', duration: 0, playing: false };
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
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  };
  if (prefs.audioInput) constraints.audio.deviceId = { exact: prefs.audioInput };
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    if (prefs.audioInput && ['OverconstrainedError', 'NotFoundError', 'NotReadableError'].includes(err?.name)) {
      return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
    throw err;
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
  let recorder;
  try {
    recorder = mimeType
      ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 })
      : new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
  } catch {
    try {
      recorder = new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      toast(t('Nie udało się nagrać wiadomości głosowej.'));
      return;
    }
  }

  const session = {
    recorder,
    stream,
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
    stream.getTracks().forEach((track) => track.stop());
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
  try {
    session.stream.getTracks().forEach((track) => track.stop());
  } catch { /* ignore */ }

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
  $('sendBtn').disabled = !enabled || !$('messageInput').value.trim();
}

async function uploadVoiceBlob(blob, seconds) {
  if (!VOICE) throw new Error(t('Nie udało się wysłać wiadomości głosowej.'));
  const transport = voiceTransport();
  if (!transport) throw new Error(t('Sesja głosowa wygasła — połącz ponownie.'));
  const url = `http://${transport.address}/voice?key=${encodeURIComponent(transport.key)}&d=${encodeURIComponent(VOICE.clampSeconds(seconds))}`;
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
    key: transport.key,
  };
}

async function deleteVoiceUpload(uploaded) {
  if (!uploaded || !uploaded.id || !uploaded.address || !uploaded.key) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(`http://${uploaded.address}/voice/${uploaded.id}?key=${encodeURIComponent(uploaded.key)}`, {
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

function sendCurrentMessage(e) {
  e.preventDefault();
  hideMentionPop();
  const input = $('messageInput');
  const text = input.value.trim();
  if (!text) return;
  if (!deliverMessage(text)) return;

  input.value = '';
  input.style.height = 'auto';
  $('sendBtn').disabled = true;
  input.focus();
  stopTyping();
}

function deliverMessage(text) {
  if (current.kind === 'home') {
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

function notifyIncoming(message, where, isCurrent) {
  if (!prefs.notify && !prefs.sound) return;
  if (document.hasFocus() && isCurrent) return;

  const mention = isMention(message.text);
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

function playSound(mention = false) {
  if (!prefs.sound || prefs.deafened) return;
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
      renderGifs();
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
    renderGifs();
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
    renderGifs();
    search.focus();
  });
  $('giphyLink').addEventListener('click', () => {
    CHILL.app?.openExternal?.('https://giphy.com');
  });
  $('klipyLink').addEventListener('click', () => {
    CHILL.app?.openExternal?.('https://klipy.com');
  });
}

function closeGifPicker() {
  const pop = $('gifOverlay');
  if (pop) pop.hidden = true;
  if (gifPreviewObserver) {
    gifPreviewObserver.disconnect();
    gifPreviewObserver = null;
  }
  const button = $('gifBtn');
  if (button) button.setAttribute('aria-expanded', 'false');
}

function renderGifCategories() {
  const container = $('gifCategories');
  if (!container) return;
  const categories = [GIF_ALL_CATEGORIES];
  if (GIFS.some((gif) => gif?.source === 'klipy')) categories.push(GIF_KLIPY_CATEGORY);
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
  const list = GIFS.filter((gif) => {
    if (!isGifEntry(gif)) return false;
    if (terms.length) {
      const categorySearch = GIF_CATEGORY_QUERY[gif.category] || '';
      const source = gif.source === 'klipy' ? 'klipy' : 'giphy';
      const haystack = foldGifText(`${gif.title} ${gif.category} ${source} ${categorySearch} ${gif.tags}`);
      return terms.every((term) => {
        if (haystack.includes(term)) return true;
        return (GIF_QUERY_ALIASES[term] || []).some((alias) => haystack.includes(alias));
      });
    }
    if (gifState.category === GIF_ALL_CATEGORIES) return true;
    if (gifState.category === GIF_KLIPY_CATEGORY) return gif.source === 'klipy';
    return gif.category === gifState.category;
  });
  if (gifPreviewObserver) {
    gifPreviewObserver.disconnect();
    gifPreviewObserver = null;
  }
  grid.innerHTML = '';
  grid.classList.toggle('is-empty', !list.length);
  if (!list.length) {
    grid.innerHTML = `<div class="gif-empty">${esc(t('Nic nie znaleziono'))}</div>`;
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
}

function sendGif(gif) {
  if (!isGifEntry(gif) || $('composer').hidden) return;
  const url = gifMessageUrl(gif);
  if (!url) return;
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
  if (!KLIPY_MEDIA_RE.test(value)) return null;
  const known = KLIPY_BY_URL.get(value);
  if (known) return known;
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

function gifSource(gif) {
  return gif?.source === 'klipy' ? 'klipy' : 'giphy';
}

function gifMessageUrl(gif) {
  if (gifSource(gif) === 'klipy') {
    return KLIPY_MEDIA_RE.test(String(gif?.gif || '')) ? gif.gif : '';
  }
  return gifFullUrl(gif?.id);
}

function gifChatSource(gif) {
  if (gifSource(gif) === 'klipy') return gif?.webp || gif?.gif || '';
  return gifChatUrl(gif?.id);
}

function gifChatFallback(gif) {
  if (gifSource(gif) === 'klipy') return gif?.gif || gif?.webp || '';
  return gifFullUrl(gif?.id);
}

function gifOpenUrl(gif) {
  if (gifSource(gif) === 'klipy') {
    const id = String(gif?.id || '');
    if (KLIPY_PAGE_RE.test(id)) return `https://klipy.com/gifs/${id}`;
    return gif?.gif || gif?.webp || '';
  }
  return gifFullUrl(gif?.id);
}

function gifAttributionLabel(gif) {
  return gifSource(gif) === 'klipy' ? 'GIF • KLIPY' : 'GIF • GIPHY';
}

function isGifEntry(gif) {
  if (!gif) return false;
  if (gifSource(gif) === 'klipy') {
    return KLIPY_MEDIA_RE.test(String(gif.webp || ''))
      && KLIPY_MEDIA_RE.test(String(gif.gif || ''))
      && Number(gif.w) > 0
      && Number(gif.h) > 0;
  }
  return GIF_ID_RE.test(String(gif.id || ''));
}

function gifPreviewSource(gif) {
  if (gifSource(gif) === 'klipy') return gif?.webp || gif?.gif || '';
  return gifPreviewUrl(gif?.id);
}

function gifPreviewFallbackSource(gif) {
  if (gifSource(gif) === 'klipy') return gif?.gif || gif?.webp || '';
  return gifPreviewFallbackUrl(gif?.id);
}

function gifPreviewTinySource(gif) {
  if (gifSource(gif) === 'klipy') return '';
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
  applyAccent(prefs.accent);
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
    errorEl.textContent = t('Nazwa musi mieć 2–32 znaki.');
    return;
  }
  if (about.length > 160) {
    errorEl.textContent = t('Opis może mieć maksymalnie 160 znaków.');
    return;
  }

  $('saveProfile').disabled = true;
  try {
    const result = await CHILL.auth.updateProfile({ displayName, about, color: profileColor });
    if (!result || !result.ok) {
      errorEl.textContent = result?.error ? translateError(result.error) : t('Nie udało się zapisać profilu.');
      return;
    }
    currentUser = { ...currentUser, ...result.user };
    myName = currentUser.displayName;
    myColor = currentUser.color;
    myAbout = currentUser.about;
    renderIdentity();
    fillProfileForm();
    $('profileSaved').textContent = t('Zapisano');
    toast(t('Profil zaktualizowany'));
    if (wsReady()) ws.send(JSON.stringify({ type: 'profile', displayName: myName, color: myColor, about: myAbout }));
    for (const state of serverStates.values()) {
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ type: 'server:profile', name: myName, color: myColor }));
      }
    }
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
      if (!$('serverOverlay').hidden) { closeServerModal(); return; }
      if (!$('inviteOverlay').hidden) { $('inviteOverlay').hidden = true; return; }
      if (!$('settingsOverlay').hidden) { closeSettings(); return; }
      if (!$('stickerOverlay').hidden) { closeStickerPicker(); return; }
      if (!$('gifOverlay').hidden) { closeGifPicker(); return; }
      if (!$('emojiOverlay').hidden) { closeEmojiPicker(); return; }
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
