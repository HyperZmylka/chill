# Chill

Spokojny komunikator desktopowy (Electron) z własną identyfikacją wizualną — miętowo-błękitny akcent, ciemna zieleń i messengerowy układ rozmów. Bez kopiowania cudzych znaków towarowych i grafik.

## Najważniejsze funkcje

- **Własne serwery zamiast stałych pokoi** — na starcie nie ma żadnych pokoi ani kanałów. Tworzysz serwer, dostajesz kanał `ogólny` i zapraszasz znajomych.
- **Kanały tekstowe i głosowe** — właściciel serwera tworzy kanały do pisania albo głosowe, a następnie może je usuwać prawym przyciskiem myszy. Serwer może mieć zero kanałów.
- **Zaproszenia linkiem** — `chill://adres:port/kod`. Działa w sieci lokalnej, a po skonfigurowaniu sieci także przez internet.
- **Role** — właściciel i członkowie. Tylko właściciel tworzy i usuwa kanały oraz usuwa serwer.
- **Lista obecnych** — status online/offline i oznaczenie właściciela.
- **Wiadomości prywatne** — rozmowy 1:1 z kontami lokalnymi oraz ze znajomymi dodanymi z serwerów.
- **Znajomi** — kliknij profil innego członka serwera, dodaj go do znajomych i pisz bezpośrednio.
- **Trwała historia** — wiadomości serwera zapisują się u osoby, która go hostuje; DM-y lokalne w `chat-data.json`, a DM-y serwerowe u hosta w `servers.json`.
- **Emoji** — picker z wyszukiwarką i listą ostatnio używanych.
- **GIF-y** — przycisk obok emoji, kategorie i wyszukiwarka; wybrany GIF pojawia się bezpośrednio w rozmowie.
- **Wzmianki `@`** — podpowiedzi członków serwera i znajomych, wstawianie nicku z klawiatury i wyróżnienie w wiadomości.
- **Statusy** — online, zaraz wracam, nie przeszkadzać, niewidoczny.
- **Wykrywanie gier** — „Gra w …” na profilu i liście członków.
- **Powiadomienia** — systemowe dymki, dźwięk, tryb „tylko wzmianki”, odznaki.
- **Wygląd** — motyw czarny, biały, dopasowany do systemu albo gradient; akcenty i kompaktowe wiadomości.
- **Język interfejsu** — polski (domyślnie) albo angielski, przełączany w Ustawieniach → Język. Zmiana działa od razu, również w menu tray.
- **Profil w rogu** — awatar, nazwa, ustawienia i wylogowanie są przypięte do lewego dolnego rogu.
- **Tray i autostart** — Chill zostaje w zasobniku i może startować z Windows.
- **Aktualizacje** — sprawdzanie GitHub Releases i automatyczne pobranie oraz uruchomienie instalatora, bez pytania o zgodę.

## Jak działają serwery

1. Otwórz Chill i kliknij **+** na pasku serwerów.
2. Wybierz **Utwórz serwer**, podaj nazwę i kolor. Serwer dostanie pierwszy kanał tekstowy `ogólny`.
3. Kliknij **Zaproś** w nagłówku i skopiuj link `chill://...`.
4. Znajomy wybierze **+** → **Dołącz kodem** i wklei link.
5. Oboje musicie mieć uruchomiony Chill. Host musi być online, żeby jego serwer działał.

Serwer działa na komputerze właściciela — nie ma centralnego serwera. Gdy host wyłączy aplikację, pozostali zobaczą stan „Serwer offline”, a po jego powrocie Chill połączy się ponownie automatycznie.

### Kanały

- Właściciel klika **+** obok listy kanałów, wybiera typ **Do pisania** lub **Głosowy**, wpisuje nazwę i tworzy kanał.
- Kanał można usunąć prawym przyciskiem myszy → **Usuń kanał**. Historia wiadomości tekstowych w tym kanale również zostanie usunięta.
- Uprawnienia są sprawdzane także po stronie hosta — członek serwera nie może utworzyć ani usunąć kanału nawet przez bezpośrednie wywołanie protokołu.
- Kanały głosowe są oznaczone ikoną głośnika i służą do organizowania rozmów. Ta wersja nie prowadzi transmisji audio — w kanale głosowym nie można wysyłać wiadomości tekstowych.
- Po usunięciu wszystkich kanałów serwer pozostaje pusty; właściciel nadal może dodać nowy kanał. Ten stan jest zapisywany w `servers.json`.

## Znajomi i wiadomości prywatne

1. Wejdź na serwer i kliknij nazwę lub awatar innego członka (albo jego wiadomość).
2. W profilu wybierz **Dodaj do znajomych**.
3. Osoba pojawi się w **Wiadomościach prywatnych** — kliknij ją i napisz wiadomość.

Znajomi z serwera są zapisani dla Twojego konta lokalnie, a ich wiadomości prywatne przechodzą przez serwer hosta. Rozmowa działa, gdy host jest online; historia DM-ów serwerowych jest przechowywana w `servers.json` na komputerze hosta. Konto, które otrzyma wiadomość prywatną z serwera, automatycznie dodaje nadawcę do znajomych.

Konta lokalne na tym samym komputerze nadal pojawiają się w **Wiadomościach prywatnych** od razu — bez dodawania do znajomych.

## GIF-y

- Przycisk **GIF** znajduje się w polu pisania, obok emoji. Otwiera picker z kategoriami (`Wszystkie`, `Popularne`, `Reakcje`, `Śmieszne`, `Zwierzęta`, `Jedzenie`, `Gry`) i wyszukiwarką.
- Domyślnie widać cały katalog w dwóch kolumnach. Każdy GIF jest wyświetlany w całości, bez przycinania, a przewijanie prowadzi przez wszystkie pozycje aż do końca.
- Wyszukiwanie działa lokalnie, bez wysyłania zapytań do internetu. Ignoruje polskie znaki diakrytyczne i obsługuje proste synonimy, np. `kot`/`koty` oraz `serce`/`serca`.
- Katalog jest wbudowany w aplikację (`gifs.js`, 96 pozycji, treści: GIPHY) — nie wymaga klucza API ani konta GIPHY.
- Wybrany GIF jest wysyłany jako zwykły link `https://media.giphy.com/media/<id>/giphy.gif`, dzięki czemu działa w kanałach serwera i w DM-ach, a historia zapisuje się tak jak pozostałe wiadomości.
- W rozmowie link GIF-a jest rozpoznawany i wyświetlany jako obrazek. Sama miniatura i obrazek są pobierane z `media.giphy.com`, więc do wyświetlania GIF-ów potrzebne jest połączenie z internetem.
- W pickerze i pod wiadomościami znajduje się oznaczenie **Powered by GIPHY**.

## Język interfejsu

1. Otwórz **Ustawienia** → **Język**.
2. Wybierz **Polski** albo **English**. Zmiana jest natychmiastowa i obejmuje cały interfejs, komunikaty oraz menu tray.
3. Wybór jest zapamiętywany osobno dla każdego konta i jako język domyślny dla logowania.

Domyślnym językiem jest polski. Język interfejsu jest przechowywany lokalnie (`language.json` oraz ustawienia konta w pamięci przeglądarki aplikacji).

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
  - `chat-data.json` — lokalne wiadomości prywatne,
  - `servers.json` — hostowane i dołączone serwery, kanały (typ tekstowy/głosowy), członkowie, historia kanałów i wiadomości prywatne serwera,
  - `language.json` — język interfejsu używany przez okno i menu tray.
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

- `main.js` — okno, tray (także w języku interfejsu), konta, hostowanie serwerów (HTTP/WebSocket), walidacja uprawnień kanałów, `servers.json`, `language.json`, aktualizacje.
- `preload.js` — bezpieczny most `window.chill` (context isolation).
- `renderer.js` — logowanie, serwery, kanały tekstowe/głosowe, zaproszenia, profile i znajomi, DM-y, emoji, GIF-y, wzmianki `@`, motywy, ustawienia, tłumaczenia PL/EN, powiadomienia.
- `gifs.js` — statyczny katalog GIF-ów (treści: GIPHY, bez klucza API).
- `index.html` / `style.css` — interfejs Chill.

Czat serwerów działa przez wbudowany serwer WebSocket na porcie `47830`. Każdy hostowany serwer jest dostępny pod kodem zaproszenia; wiadomości, członkowie i DM-y serwerowe są zapisywani w `servers.json`.

## Zmienne środowiskowe (opcjonalne)

- `CHILL_PORT` — port serwera WebSocket (domyślnie `47830`).
- `CHILL_DATA_DIR` — folder danych aplikacji (domyślnie `%APPDATA%\Chill`).
