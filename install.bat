@echo off
echo ========================================
echo  Yapper Chat - Instalator i Budowanie
echo ========================================
echo.

cd /d "%~dp0"

echo [1/4] Sprawdzam Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo BŁĄD: Node.js nie jest zainstalowany!
    echo Pobierz z: https://nodejs.org/
    pause
    exit /b 1
)
echo OK: Node.js zainstalowany.

echo.
echo [2/4] Instaluję zależności (npm install)...
npm install
if errorlevel 1 (
    echo BŁĄD: Nie udało się zainstalować zależności!
    pause
    exit /b 1
)
echo OK: Zależności zainstalowane.

echo.
echo [3/4] Zatwierdzam skrypty instalacyjne Electrona...
npx npm-install-scripts approve electron >nul 2>&1
echo OK: Skrypty zatwierdzone.

echo.
echo [4/4] Buduję instalator .exe (npm run dist)...
npm run dist
if errorlevel 1 (
    echo BŁĄD: Nie udało się zbudować instalatora!
    pause
    exit /b 1
)
echo.
echo ========================================
echo  SUKCES! Instalator gotowy:
echo  chat-app\dist\Yapper Chat Setup 2.0.0.exe
echo ========================================
pause
