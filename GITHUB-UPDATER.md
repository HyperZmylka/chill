# Automatyczne aktualizacje z GitHub Releases

Aplikacja sprawdza najnowsze wydanie w repozytorium **HyperZmylka/chill**
i porównuje jego tag z wersją zainstalowanej aplikacji (`package.json` → `version`).

## Jak wydać nową wersję

1. **Podnieś wersję** w `package.json`, np. z `4.1.0` na `4.2.0`.

2. **Zbuduj instalator:**
   ```bash
   npm run dist
   ```
   Powstanie `dist/Chill-Setup-4.2.0.exe`.

3. **Zacommituj i wypchnij zmiany:**
   ```bash
   git add .
   git commit -m "Chill 4.2.0"
   git tag v4.2.0
   git push
   git push --tags
   ```

4. **Utwórz wydanie z plikiem .exe** (GitHub CLI):
   ```bash
   gh release create v4.2.0 "dist/Chill-Setup-4.2.0.exe" --title "Chill 4.2.0" --notes "Opis zmian"
   ```

   Albo przez stronę: **Releases → Draft a new release**, tag `v4.2.0`,
   dołącz plik `.exe` i opublikuj.

5. **Gotowe.** Użytkownicy ze starszą wersją zobaczą po starcie kartę
   „Nowa wersja”. Chill sam pobiera instalator do folderu tymczasowego,
   pokazuje postęp, uruchamia go i zamyka się — bez pytania o zgodę.

> Automatyczne instalowanie działa w wersjach **4.0.1 i nowszych**. Osoby
> z 4.0.0 muszą ostatni raz pobrać instalator ręcznie.

## Ważne

- Tag wydania musi mieć postać `vX.Y.Z` (np. `v4.2.0`) — porównywane są cyfry.
- Wydanie musi być **opublikowane** (nie draft) i zawierać plik `.exe`.
- Repozytorium musi być **publiczne**, inaczej sprawdzanie wersji bez logowania
  zwróci błąd 404.
- Aplikacja sprawdza aktualizacje 2 sekundy po starcie i potem co 4 godziny.
- Instalator NSIS jest jednoklikowy (`oneClick`), instaluje się w profilu
  użytkownika i uruchamia Chill po zakończeniu — dlatego aktualizacja nie wymaga
  żadnych dodatkowych decyzji.
- Ręczne sprawdzenie: tray → **Sprawdź aktualizacje** lub Ustawienia → Aplikacja.
- Instalator jest pobierany wyłącznie z zaufanych hostów GitHuba
  (`github.com`, `*.githubusercontent.com`).

## Jak to działa w kodzie

- `main.js` → `checkForUpdates()` pobiera `releases/latest` z API GitHuba,
  wybiera załącznik `.exe` i wysyła informację do interfejsu.
- `preload.js` → most IPC (`onUpdateReady`, `onUpdateProgress`, `installUpdate`).
- `renderer.js` → karta aktualizacji, pasek postępu i automatyczne wywołanie
  instalacji ~0,9 s po wykryciu nowej wersji (bez przycisku w wersji spakowanej).
- `main.js` → `downloadUpdate()` pobiera instalator (z obsługą przekierowań),
  uruchamia go przez `shell.openPath` i zamyka aplikację po 0,9 s.
