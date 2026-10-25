# Chill

Spokojny komunikator desktopowy (Electron) z własną identyfikacją wizualną — miętowo-błękitny akcent, ciemna zieleń i messengerowy układ rozmów. Bez kopiowania cudzych znaków towarowych i grafik.

## Funkcje

- **Konta e-mail + hasło** — rejestracja, logowanie, „Zapamiętaj mnie”, profil, zmiana hasła.
- **Pokoje i wiadomości prywatne** — Lounge, Gaming, Muzyka, Memy oraz rozmowy 1:1.
- **Trwała historia** — pokoje i DM-y zapisują się lokalnie i wracają po restarcie.
- **Emoji** — picker z wyszukiwarką i listą ostatnio używanych.
- **Statusy** — online, zaraz wracam, nie przeszkadzać, niewidoczny.
- **Wykrywanie gier** — „Gra w …” na profilu i liście członków.
- **Powiadomienia** — systemowe dymki, dźwięk, tryb „tylko wzmianki”, odznaki.
- **Wygląd** — motyw ciemny/jasny, akcenty, kompaktowe wiadomości.
- **Tray i autostart** — Chill zostaje w zasobniku i może startować z Windows.
- **Aktualizacje** — sprawdzanie GitHub Releases i pobieranie instalatora z poziomu aplikacji.

## Konta i bezpieczeństwo

Konta są **lokalne** — nie ma chmury ani zewnętrznego serwera uwierzytelniania.

- Hasła są hashowane algorytmem **scrypt** z losową solą.
- Sesja „Zapamiętaj mnie” to losowy token zapisany w danych aplikacji.
- Po pięciu nieudanych próbach logowania konto jest chwilowo blokowane.
- Dane trafiają do `%APPDATA%\Chill`(`accounts.json`, `chat-data.json`).
- Odinstalowanie aplikacji usuwa także te dane.

## Uruchomienie ze źródeł

```bash
npm install
npm start
```

## Budowanie instalatora

```bash
npm run dist
```

Wynik: `dist/Chill-Setup-<wersja>.exe` (instalator NSIS x64).

## Aktualizacje

Repozytorium jest ustawione w `main.js`:

```js
const GITHUB_REPO = 'HyperZmylka/chill';
```

Aplikacja sprawdza `https://api.github.com/repos/HyperZmylka/chill/releases/latest`
5 sekund po starcie i potem co 4 godziny. Jeśli tag wydania jest nowszy niż
wersja aplikacji, pokazuje kartę aktualizacji; przycisk **Aktualizuj** pobiera
instalator i uruchamia go.

Szczegóły wydawania nowej wersji: [GITHUB-UPDATER.md](GITHUB-UPDATER.md).

## Architektura

- `main.js` — okno, tray, konta, historia, serwer HTTP/WebSocket, aktualizacje.
- `preload.js` — bezpieczny most `window.chill` (context isolation).
- `renderer.js` — logowanie, pokoje, DM-y, emoji, ustawienia, powiadomienia.
- `index.html` / `style.css` — interfejs Chill.

Czat działa przez wbudowany serwer WebSocket na `127.0.0.1:47830`.
Rozmowy są lokalne dla tego komputera; do czatu między maszynami trzeba
wystawić serwer WebSocket pod wspólnym adresem.
