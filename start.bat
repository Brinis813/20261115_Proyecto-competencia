@echo off
chcp 65001 >nul 2>&1
setlocal

echo ========================================
echo   Competition Manager - Iniciando
echo ========================================
echo.

cd /d "%~dp0"

:: ---------- Requisitos ----------
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js no esta instalado o no esta en el PATH.
    echo         Descargalo desde https://nodejs.org (version 18 o superior^).
    echo.
    pause
    exit /b 1
)

if not exist "backend\.env" (
    echo [ERROR] Falta el archivo backend\.env
    echo         Copia backend\.env.example a backend\.env y completa los valores.
    echo.
    pause
    exit /b 1
)

:: ---------- Dependencias ----------
if not exist "backend\node_modules" (
    echo [1/4] Instalando dependencias del backend, esto tarda un poco...
    call npm install --prefix backend --no-audit --no-fund
    if errorlevel 1 (
        echo [ERROR] Fallo la instalacion de dependencias del backend.
        pause
        exit /b 1
    )
) else (
    echo [1/4] Dependencias del backend: OK
)

if not exist "frontend\node_modules" (
    echo [2/4] Instalando dependencias del frontend, esto tarda un poco...
    call npm install --prefix frontend --no-audit --no-fund
    if errorlevel 1 (
        echo [ERROR] Fallo la instalacion de dependencias del frontend.
        pause
        exit /b 1
    )
) else (
    echo [2/4] Dependencias del frontend: OK
)

:: ---------- Servidores ----------
:: El backend crea la base de datos y las tablas al arrancar si no existen.
echo [3/4] Iniciando backend...
start "Competition Manager - Backend" powershell -NoExit -Command "cd '%~dp0backend'; npm run dev"

:: Se le da margen para que conecte con MySQL antes de abrir el frontend.
timeout /t 5 /nobreak >nul

echo [4/4] Iniciando frontend...
start "Competition Manager - Frontend" powershell -NoExit -Command "cd '%~dp0frontend'; npm run dev"

timeout /t 4 /nobreak >nul
start "" http://localhost:5173

echo.
echo ========================================
echo   Servidores en marcha
echo ========================================
echo   Aplicacion:   http://localhost:5173
echo   API:          http://localhost:3001/api/health
echo   Clasificacion http://localhost:5173/leaderboard
echo.
echo   Si la base de datos estaba vacia, la ventana del
echo   backend muestra la cedula y la contrasena del
echo   administrador inicial.
echo.
echo   Para detener o reiniciar: restart.bat
echo ========================================
echo.
pause
