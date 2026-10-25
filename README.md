# Yapper Chat

Nowoczesny komunikator desktopowy (Electron) — alternatywa dla Yappera z własnym, ciemnym interfejsem.

## Funkcje

- ekran logowania z wyborem nazwy, awatara i koloru,
- pokoje publiczne (Ogólny, Random, Gaming) i wiadomości prywatne (DM),
- wybór emoji (160 emoji w pickerze),
- statusy (online / zaraz wracam / nie przeszkadzać / niewidoczny),
- wykrywanie uruchomionej gry („Grasz w …”),
- powiadomienia systemowe i odznaki,
- tray (ikona w zasobniku) i uruchamianie z Windows,
- **automatyczne aktualizacje z GitHub Releases** — aplikacja sama sprawdza nową wersję i pobiera instalator.

## Uruchomienie ze źródeł

```bash
npm install
npm start
```

## Budowanie instalatora

```bash
npm run dist
```

Wynik: `dist/Yapper Chat Setup <wersja>.exe`.

## Aktualizacje

Repozytorium GitHub jest ustawione w `main.js`:

```js
const GITHUB_REPO = 'HyperZmylka/yapper-chat';
```

Aplikacja co 4 godziny (oraz 5 sekund po starcie) sprawdza
`https://api.github.com/repos/HyperZmylka/yapper-chat/releases/latest`.
Jeśli tag wydania jest nowszy niż wersja aplikacji, pokazuje baner
„Dostępna nowa wersja”. Po kliknięciu **Aktualizuj** pobiera instalator
i uruchamia go.

Szczegóły wydawania nowej wersji: [GITHUB-UPDATER.md](GITHUB-UPDATER.md).

## Uwagi

Czat działa przez wbudowany serwer WebSocket na `127.0.0.1:47830`
(rozmowy lokalne na tym komputerze).
