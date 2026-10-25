# Chill

Spokojny komunikator desktopowy (Electron) z własną identyfikacją wizualną — miętowo-błękitny akcent, ciemna zieleń i messengerowy układ rozmów. Bez kopiowania cudzych znaków towarowych i grafik.

## Najważniejsze funkcje

- **Własne serwery zamiast stałych pokoi** — na starcie nie ma żadnych pokoi ani kanałów. Tworzysz serwer, dostajesz kanał `ogólny` i zapraszasz znajomych.
- **Kanały** — właściciel serwera dodaje kolejne kanały, a wszyscy członkowie rozmawiają na każdym z nich.
- **Zaproszenia linkiem** — `chill://adres:port/kod`. Działa w sieci lokalnej, a po skonfigurowaniu sieci także przez internet.
- **Role** — właściciel i członkowie. Tylko właściciel tworzy kanały i usuwa serwer.
- **Lista obecnych** — status online/offline i oznaczenie właściciela.
- **Wiadomości prywatne** — lokalne rozmowy 1:1, niezależne od serwerów.
- **Trwała historia** — wiadomości serwera zapisują się u osoby, która go hostuje; DM-y zapisują się lokalnie.
- **Emoji** — picker z wyszukiwarką i listą ostatnio używanych.
- **Wzmianki `@`** — podpowiedzi członków serwera i znajomych, wstawianie nicku z klawiatury i wyróżnienie w wiadomości.
- **Statusy** — online, zaraz wracam, nie przeszkadzać, niewidoczny.
- **Wykrywanie gier** — „Gra w …” na profilu i liście członków.
- **Powiadomienia** — systemowe dymki, dźwięk, tryb „tylko wzmianki”, odznaki.
- **Wygląd** — motyw czarny, biały, dopasowany do systemu albo gradient; akcenty i kompaktowe wiadomości.
- **Profil w rogu** — awatar, nazwa, ustawienia i wylogowanie są przypięte do lewego dolnego rogu.
- **Tray i autostart** — Chill zostaje w zasobniku i może startować z Windows.
- **Aktualizacje** — sprawdzanie GitHub Releases i automatyczne pobranie oraz uruchomienie instalatora, bez pytania o zgodę.

## Jak działają serwery

1. Otwórz Chill i kliknij **+** na pasku serwerów.
2. Wybierz **Utwórz serwer**, podaj nazwę i kolor. Serwer dostanie pierwszy kanał `ogólny`.
3. Kliknij **Zaproś** w nagłówku i skopiuj link `chill://...`.
4. Znajomy wybierze **+** → **Dołącz kodem** i wklei link.
5. Oboje musicie mieć uruchomiony Chill. Host musi być online, żeby jego serwer działał.

Serwer działa na komputerze właściciela — nie ma centralnego serwera. Gdy host wyłączy aplikację, pozostali zobaczą stan „Serwer offline”, a po jego powrocie Chill połączy się ponownie automatycznie.

### Sieć lokalna

- Oba komputery muszą być w tej samej sieci Wi-Fi/LAN.
- Windows może zapytać o dostęp do sieci — zezwól aplikacji w sieciach prywatnych.
- Domyślny port to **47830 (TCP)**.
- Link zaproszenia zawiera lokalny adres IP hosta. Jeśli adres się zmieni, wygeneruj nowy link.

### Internet

- Najprościej użyć VPN mesh, np. Tailscale lub ZeroTier, i wpisać adres VPN hosta w miejsce adresu w linku.
- Alternatywnie przekieruj port TCP `47830` na routerze i podmień adres w linku na publiczny adres IP lub domenę.
- Połączenia serwerów używają `ws://` (bez TLS). Nie wystawiaj portu publicznie bez dodatkowej ochrony — używaj zaufanego VPN.
- Host musi mieć włączony komputer i uruchomiony Chill.

## Konta i bezpieczeństwo

Konta są **lokalne** — nie ma chmury ani zewnętrznego serwera uwierzytelniania.

- Hasła są hashowane algorytmem **scrypt** z losową solą.
- Sesja „Zapamiętaj mnie” to losowy token zapisany w danych aplikacji.
- Po pięciu nieudanych próbach logowania konto jest chwilowo blokowane.
- Dane trafiają do `%APPDATA%\Chill`:
  - `accounts.json` — konta i sesja,
  - `chat-data.json` — wiadomości prywatne,
  - `servers.json` — hostowane i dołączone serwery, kanały, członkowie i historia kanałów.
- Odinstalowanie aplikacji usuwa także te dane.
- Serwer nie ma centralnego systemu kont — dostęp reguluje kod zaproszenia. Link traktuj jak hasło.

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
2 sekundy po starcie i potem co 4 godziny. Jeśli tag wydania jest nowszy niż
wersja aplikacji, Chill sam pobiera instalator, pokazuje postęp i uruchamia go,
a następnie zamyka się, żeby aktualizacja mogła się dokończyć. Nie ma pytania
o zgodę ani przycisku do klikania.

> Automatyczne instalowanie działa w wersjach **4.0.1 i nowszych**. Użytkownicy
> z 4.0.0 muszą ostatni raz pobrać instalator ręcznie — kolejne aktualizacje będą
> już w pełni automatyczne.

Szczegóły wydawania nowej wersji: [GITHUB-UPDATER.md](GITHUB-UPDATER.md).

## Architektura

- `main.js` — okno, tray, konta, hostowanie serwerów (HTTP/WebSocket), `servers.json`, aktualizacje.
- `preload.js` — bezpieczny most `window.chill` (context isolation).
- `renderer.js` — logowanie, serwery, kanały, zaproszenia, DM-y, emoji, wzmianki `@`, motywy, ustawienia, powiadomienia.
- `index.html` / `style.css` — interfejs Chill.

Czat serwerów działa przez wbudowany serwer WebSocket na porcie `47830`. Każdy hostowany serwer jest dostępny pod kodem zaproszenia; wiadomości i członkowie są zapisywani w `servers.json`.

## Zmienne środowiskowe (opcjonalne)

- `CHILL_PORT` — port serwera WebSocket (domyślnie `47830`).
- `CHILL_DATA_DIR` — folder danych aplikacji (domyślnie `%APPDATA%\Chill`).
