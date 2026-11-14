# Automatyczne aktualizacje z GitHub Releases

Aplikacja sprawdza najnowsze wydanie w repozytorium **HyperZmylka/chill**
i porównuje jego tag z wersją zainstalowanej aplikacji.

Chill jest publikowany wyłącznie jako aplikacja **Tauri + Rust**. Aktualizacja
pobiera wyłącznie instalator Tauri; instalator Electron nie jest już używany.

## Jak wydać nową wersję

1. **Podnieś wersję** w `package.json`, `rust/Cargo.toml` i `rust/chill-desktop/tauri.conf.json`.

2. **Zacommituj i wypchnij zmiany:**
   ```bash
   git add .
   git commit -m "Chill 4.16.3"
   git tag v4.16.3
   git push
   git push --tags
   ```

3. **Utwórz wydanie robocze i uruchom workflow:**
   ```bash
   gh release create v4.16.3 --draft --title "Chill 4.16.3" --notes "Opis zmian"
   gh workflow run release-build.yml -f tag=v4.16.3
   ```

   Workflow zbuduje:
   - `Chill-Tauri-Setup-<wersja>.exe` — jedyny instalator aplikacji,
   - `chill-server-linux-x64` — binarkę serwera publicznego.

4. **Opublikuj wydanie:**
   ```bash
   gh release edit v4.16.3 --draft=false
   ```

5. **Gotowe.** Użytkownicy ze starszą wersją zobaczą po starcie kartę
   „Nowa wersja”. Chill sam pobiera instalator Tauri do folderu tymczasowego,
   pokazuje postęp, uruchamia go i zamyka się — bez pytania o zgodę.

## Ważne

- Tag wydania musi mieć postać `vX.Y.Z` — porównywane są cyfry.
- Wydanie musi być **opublikowane** (nie draft) i zawierać instalator Tauri.
- Repozytorium musi być **publiczne**, inaczej sprawdzanie wersji bez logowania
  zwróci błąd 404.
- Aplikacja sprawdza aktualizacje 2 sekundy po starcie i potem co 4 godziny.
- Instalator NSIS jest jednoklikowy, instaluje się w profilu użytkownika
  i uruchamia Chill po zakończeniu.
- Gdy wydanie nie ma instalatora Tauri, Chill otwiera stronę wydania zamiast
  pobierać cokolwiek innego.
- Instalator jest pobierany wyłącznie z zaufanych hostów GitHuba
  (`github.com`, `*.githubusercontent.com`).

## Jak to działa w kodzie

- `rust/chill-desktop/src/commands.rs` → `chill_update_check()` pobiera
  `releases/latest` z API GitHuba i wybiera wyłącznie instalator Tauri.
- `tauri-desktop.js` → most IPC (`onUpdateReady`, `onUpdateProgress`,
  `installUpdate`).
- `renderer.js` → karta aktualizacji, pasek postępu i automatyczne wywołanie
  instalacji po wykryciu nowej wersji.
- `chill_update_install()` pobiera instalator i uruchamia go, a następnie
  zamyka aplikację.
