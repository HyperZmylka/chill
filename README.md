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
- **Naklejki** — wbudowany zestaw Chill Pack (24 grafiki SVG), kategorie i wyszukiwarka; wybrana naklejka pojawia się bezpośrednio w rozmowie.
- **Wiadomości głosowe** — nagrywanie mikrofonem (do 120 s) w jakości 48 kHz / 64 kb/s, z redukcją szumów i wyrównaniem poziomu; odtwarzanie z pauzą i przewijaniem. Działają w kanałach serwera oraz w DM-ach lokalnych i serwerowych.
- **GIF-y** — przycisk obok emoji, kategorie i wyszukiwarka; wybrany GIF pojawia się bezpośrednio w rozmowie.
- **Wzmianki `@`** — podpowiedzi członków serwera i znajomych, wstawianie nicku z klawiatury i wyróżnienie w wiadomości.
- **Statusy** — online, zaraz wracam, nie przeszkadzać, niewidoczny.
- **Wykrywanie gier** — „Gra w …” na profilu i liście członków.
- **Powiadomienia** — systemowe dymki, przyjemny dwudźwięk przy nowej wiadomości i trzytonowy sygnał przy wzmiance, tryb „tylko wzmianki”, odznaki.
- **Wygląd** — sześć presetów (Chill, Discord, Minimal, Zorza, Zachód słońca, Ocean), motyw Discord, 12 akcentów i własny kolor, kształt interfejsu (miękki, zaokrąglony, kwadratowy), tła (Zorza, Zachód słońca, Ocean, Las, Mono), styl wiadomości (dymki lub płaski jak w Discordzie), rozmiar tekstu, ograniczenie animacji i wysoki kontrast.
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
- Menu kanału otwiera się po kliknięciu kanału, prawym przyciskiem myszy albo skrótem **Shift+F10**. Zawiera ono: **Zaproś do kanału**, **Przypnij kanał na górę**, **Kopiuj link**, **Wycisz kanał**, **Ustawienia powiadomień**, **Przenieś do…**, **Edytuj kanał**, **Powiel kanał**, **Stwórz kanał tekstowy** i **Usuń kanał**. Menu widzi wyłącznie właściciel serwera.
- **Przypnij**, **Wycisz** i **Ustawienia powiadomień** zapisują się lokalnie dla danego konta i kanału. Przypięte kanały są na górze listy, a wyciszony kanał nie pokazuje powiadomień systemowych; poziom **Tylko wzmianki** przepuszcza wyłącznie wzmianki.
- **Kopiuj link** i **Zaproś do kanału** tworzą adres `chill://host:port/KOD?channel=<id>`, który po dołączeniu otwiera właściwy kanał.
- **Edytuj kanał** zmienia nazwę bez utraty historii. **Powiel kanał** tworzy kopię z nazwą `-kopia` i przenosi do niej do 300 ostatnich wiadomości (nowe identyfikatory, wspólne pliki głosowe są bezpiecznie współdzielone). **Przenieś do…** zmienia kolejność kanałów widoczną dla wszystkich członków. **Usuń kanał** usuwa kanał wraz z historią wiadomości tekstowych.
- Uprawnienia są sprawdzane także po stronie hosta — członek serwera nie widzi menu i nie może utworzyć, zmienić nazwy, powielić, przenieść ani usunąć kanału nawet przez bezpośrednie wywołanie protokołu.
- Kanały głosowe są oznaczone ikoną głośnika i służą do organizowania rozmów. Ta wersja nie prowadzi transmisji audio — w kanale głosowym nie można wysyłać wiadomości tekstowych.
- Ikony mikrofonu i słuchawek w dolnym pasku zapisują lokalnie stan wyciszenia oraz wybór urządzenia audio. Wyciszenie słuchawek wyłącza też dźwięk powiadomień.
- Po usunięciu wszystkich kanałów serwer pozostaje pusty; właściciel nadal może dodać nowy kanał. Ten stan jest zapisywany w `servers.json`.

## Znajomi i wiadomości prywatne

1. Wejdź na serwer i kliknij nazwę lub awatar innego członka (albo jego wiadomość).
2. W profilu wybierz **Dodaj do znajomych**.
3. Osoba pojawi się w **Wiadomościach prywatnych** — kliknij ją i napisz wiadomość.

Znajomi z serwera są zapisani dla Twojego konta lokalnie, a ich wiadomości prywatne przechodzą przez serwer hosta. Rozmowa działa, gdy host jest online; historia DM-ów serwerowych jest przechowywana w `servers.json` na komputerze hosta. Konto, które otrzyma wiadomość prywatną z serwera, automatycznie dodaje nadawcę do znajomych.

Konta lokalne na tym samym komputerze nadal pojawiają się w **Wiadomościach prywatnych** od razu — bez dodawania do znajomych.

## GIF-y

- Przycisk **GIF** znajduje się w polu pisania, obok emoji. Otwiera picker z kategoriami (`Wszystkie`, `KLIPY`, `Popularne`, `Reakcje`, `Śmieszne`, `Zwierzęta`, `Jedzenie`, `Gry`) i wyszukiwarką.
- Domyślnie widać cały katalog w dwóch kolumnach. Każdy GIF jest wyświetlany w całości, bez przycinania, a przewijanie prowadzi przez wszystkie pozycje aż do końca.
- Wyszukiwanie działa lokalnie, bez wysyłania zapytań do internetu. Ignoruje polskie znaki diakrytyczne i obsługuje proste synonimy, np. `kot`/`koty` oraz `serce`/`serca`.
- Katalog jest wbudowany w aplikację (`gifs.js`, 96 pozycji GIPHY + 40 pozycji KLIPY) — nie wymaga klucza API ani konta.
- Miniatury są ładowane dopiero przy przewijaniu. GIPHY używa lekkich podglądów `200w.webp`, a KLIPY animowanych WebP w wysokiej rozdzielczości. Wymiary pozycji są zapisane w katalogu, więc lista nie skacze podczas ładowania.
- Wybrany GIF jest wysyłany jako zwykły link: GIPHY `https://media.giphy.com/media/<id>/giphy.gif`, KLIPY `https://static2.klipy.com/...gif`. Dzięki temu działa w kanałach serwera i w DM-ach, a historia zapisuje się tak jak pozostałe wiadomości.
- W rozmowie link GIF-a jest rozpoznawany i wyświetlany jako obrazek: GIPHY z `giphy.webp`, KLIPY z animowanego WebP. Jeśli WebP się nie wczyta, aplikacja użyje GIF-a, a potem pokaże przycisk **Otwórz GIF**. Do wyświetlania potrzebne jest połączenie z internetem.
- W pickerze i pod wiadomościami znajdują się oznaczenia **Powered by GIPHY** i **Powered by KLIPY**. Pozycje KLIPY korzystają z publicznych linków do mediów, bez klucza API.

## Naklejki

- Przycisk naklejki znajduje się w polu pisania, obok emoji i GIF. Otwiera picker **Chill Pack** z kategoriami (`Wszystkie`, `Reakcje`, `Emocje`, `Zwierzęta`, `Jedzenie`, `Impreza`) i wyszukiwarką.
- Zestaw zawiera 24 wbudowane grafiki SVG (`stickers.js`) — działa bez internetu, klucza API i zewnętrznych licencji. Kategorie i podpisy są tłumaczone na polski i angielski.
- Wyszukiwanie działa lokalnie i po obu językach, np. `kot` znajdzie naklejkę **Kot**, a `cat` — **Cat**. Ignoruje polskie znaki diakrytyczne.
- Kliknięcie miniatury od razu wysyła naklejkę. W rozmowie jest wyświetlana jako obrazek, a w historii zapisuje się jako `chill-sticker://<id>` — dzięki temu działa w kanałach serwera, DM-ach lokalnych i serwerowych oraz po ponownym uruchomieniu.
- Wyszukiwarka wiadomości rozpoznaje nazwy naklejek, a powiadomienia pokazują `Naklejka • <nazwa>`.

## Wiadomości głosowe

- Przycisk mikrofonu w polu pisania nagrywa głosówkę. Podczas nagrywania widać czas i animację poziomu; **✕** anuluje, a **✓** wysyła nagranie. Maksymalna długość to 120 sekund, a nagrania krótsze niż 0,5 s są odrzucane.
- Nagranie powstaje w formacie Opus 48 kHz, mono, 64 kb/s. Przed zapisem głos przechodzi przez delikatny filtr górnoprzepustowy i kompresor wyrównujący poziom, a redukcja szumów i automatyczna regulacja głośności są włączone po stronie przechwytywania dźwięku. Dzięki temu mowa jest czystsza i nie „ucieka” przy cichym mówieniu.
- Po wysłaniu wiadomość zmienia się w odtwarzacz z przyciskiem play/pauza, paskiem postępu i czasem. Można klikać w pasek, aby przewinąć. Odtwarzanie działa w kanałach tekstowych serwera oraz w DM-ach lokalnych i serwerowych, także po ponownym uruchomieniu aplikacji.
- Historia przechowuje tylko lekki token `chill-voice://<id>?d=<sekundy>`; samo nagranie jest plikiem audio. Dzięki temu wiadomości pozostają tekstowe dla protokołu, a wyszukiwarka i powiadomienia rozpoznają je jako **Wiadomość głosowa** (np. `Wiadomość głosowa • 0:02`).
- Pliki audio hostowanych serwerów i lokalnych DM-ów trafiają do `%APPDATA%\Chill\voice`, a metadane do `voice/index.json` na komputerze hosta. Plik jest usuwany razem z wiadomością, po skróceniu historii albo po usunięciu kanału/serwera; osierocone nagrania są czyszczone automatycznie.
- Dostęp do pliku jest powiązany z aktywną sesją i członkostwem w serwerze. Token jest ważny przez 7 dni i jest unieważniany po rozłączeniu, więc odtwarzanie wymaga połączenia z serwerem, do którego należy rozmowa.
- Do nagrywania potrzebny jest mikrofon. Jeśli w dolnym pasku wybrano konkretne urządzenie wejściowe, nagrywanie użyje właśnie jego (z bezpiecznym powrotem do domyślnego mikrofonu).
- Wyszukiwarka wiadomości znajduje głosówki po słowach `głosówka`, `nagranie`, `audio`, `voice message` i pokrewnych, również bez polskich znaków diakrytycznych.

## Wygląd, dostępność i dźwięk

- **Ustawienia → Wygląd** zawiera presety, motyw, akcent, kształt, tło, styl wiadomości i kompaktowy układ. Wszystkie zmiany działają od razu i zapisują się osobno dla każdego konta.
- Preset **Discord** ustawia ciemny motyw, fioletowy akcent, kwadratowe kształty i płaski styl wiadomości. Presety **Zorza**, **Zachód słońca** i **Ocean** łączą gradientowe tło z dopasowanym akcentem.
- **Ustawienia → Dostępność** pozwala wybrać rozmiar tekstu wiadomości, ograniczyć animacje i włączyć wysoki kontrast.
- **Ustawienia → Głos i dźwięk** zawiera wybór mikrofonu i słuchawek, test mikrofonu z miernikiem poziomu, redukcję szumów, automatyczną głośność, usuwanie echa oraz głośność wiadomości głosowych. Ustawienia przetwarzania dotyczą nowych nagrań.

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
  - `voice/` — pliki audio wiadomości głosowych hostowanych serwerów i lokalnych DM-ów oraz `voice/index.json` z metadanymi,
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

- `main.js` — okno, tray (także w języku interfejsu), konta, hostowanie serwerów (HTTP/WebSocket), walidacja uprawnień kanałów, `servers.json`, `language.json`, przechowywanie i serwowanie nagrań głosowych, aktualizacje.
- `preload.js` — bezpieczny most `window.chill` (context isolation).
- `renderer.js` — logowanie, serwery, kanały tekstowe/głosowe i ich menu (przypinanie, wyciszanie, powiadomienia, edycja, powielanie, przenoszenie), zaproszenia, profile i znajomi, DM-y, emoji, GIF-y, naklejki, nagrywanie i odtwarzanie wiadomości głosowych, wzmianki `@`, motywy, ustawienia, tłumaczenia PL/EN, powiadomienia.
- `appearance.js` — wspólne presety wyglądu, walidacja kolorów i opcji oraz dobór czytelnego koloru tekstu akcentu.
- `gifs.js` — statyczny katalog GIF-ów (96 pozycji GIPHY + 40 KLIPY, bez klucza API).
- `stickers.js` — wbudowany zestaw 24 naklejek SVG.
- `voice.js` — wspólne helpery wiadomości głosowych: tokeny, czasy, typy MIME i tekst wyszukiwania.
- `index.html` / `style.css` — interfejs Chill.

Czat serwerów działa przez wbudowany serwer WebSocket na porcie `47830`. Każdy hostowany serwer jest dostępny pod kodem zaproszenia; wiadomości, członkowie i DM-y serwerowe są zapisywani w `servers.json`. Nagrania głosowe są przesyłane przez uwierzytelnione endpointy HTTP `/voice` i przechowywane w `voice/`.

## Zmienne środowiskowe (opcjonalne)

- `CHILL_PORT` — port serwera WebSocket (domyślnie `47830`).
- `CHILL_DATA_DIR` — folder danych aplikacji (domyślnie `%APPDATA%\Chill`).
