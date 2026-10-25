# Automatyczne aktualizacje z GitHub Releases

Aplikacja sprawdza najnowsze wydanie w repozytorium **HyperZmylka/chill**
i porównuje jego tag z wersją zainstalowanej aplikacji (`package.json` → `version`).

## Jak wydać nową wersję

1. **Podnieś wersję** w `package.json`, np. z `3.0.0` na `3.1.0`.

2. **Zbuduj instalator:**
   ```bash
   npm run dist
   ```
   Powstanie `dist/Chill-Setup-3.1.0.exe`.

3. **Zacommituj i wypchnij zmiany:**
   ```bash
   git add .
   git commit -m "Chill 3.1.0"
   git tag v3.1.0
   git push
   git push --tags
   ```

4. **Utwórz wydanie z plikiem .exe** (GitHub CLI):
   ```bash
   gh release create v3.1.0 "dist/Chill-Setup-3.1.0.exe" --title "Chill 3.1.0" --notes "Opis zmian"
   ```

   Albo przez stronę: **Releases → Draft a new release**, tag `v3.1.0`,
   dołącz plik `.exe` i opublikuj.

5. **Gotowe.** Użytkownicy ze starszą wersją zobaczą po starcie kartę
   „Nowa wersja”. Przycisk **Aktualizuj** pobiera instalator do folderu
   tymczasowego i uruchamia go.

## Ważne

- Tag wydania musi mieć postać `vX.Y.Z` (np. `v3.1.0`) — porównywane są cyfry.
- Wydanie musi być **opublikowane** (nie draft) i zawierać plik `.exe`.
- Repozytorium musi być **publiczne**, inaczej sprawdzanie wersji bez logowania
  zwróci błąd 404.
- Aplikacja sprawdza aktualizacje 5 sekund po starcie i potem co 4 godziny.
- Ręczne sprawdzenie: tray → **Sprawdź aktualizacje** lub Ustawienia → Aplikacja.
- Instalator jest pobierany wyłącznie z zaufanych hostów GitHuba
  (`github.com`, `*.githubusercontent.com`).

## Jak to działa w kodzie

- `main.js` → `checkForUpdates()` pobiera `releases/latest` z API GitHuba,
  wybiera załącznik `.exe` i wysyła informację do interfejsu.
- `preload.js` → most IPC (`onUpdateReady`, `onUpdateProgress`, `installUpdate`).
- `renderer.js` → karta aktualizacji, postęp pobierania i przycisk instalacji.
- `main.js` → `downloadUpdate()` pobiera instalator (z obsługą przekierowań)
  i uruchamia go przez `shell.openPath`.
