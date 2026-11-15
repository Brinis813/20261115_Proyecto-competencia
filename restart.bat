@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

cd /d "%~dp0"

:menu
cls
echo ========================================
echo   Competition Manager - Servidores
echo ========================================
echo.
call :estado 5173 Frontend
call :estado 3001 Backend
echo.
echo   [1] Reiniciar frontend
echo   [2] Reiniciar backend
echo   [3] Reiniciar ambos
echo.
echo   [4] Detener frontend
echo   [5] Detener backend
echo   [6] Detener ambos
echo.
echo   [7] Abrir la aplicacion en el navegador
echo   [0] Salir
echo.
echo ========================================
echo.

set "opcion="
set /p "opcion=Selecciona una opcion: "

if "%opcion%"=="1" goto reiniciar_frontend
if "%opcion%"=="2" goto reiniciar_backend
if "%opcion%"=="3" goto reiniciar_ambos
if "%opcion%"=="4" (call :detener 5173 Frontend & goto pausa)
if "%opcion%"=="5" (call :detener 3001 Backend & goto pausa)
if "%opcion%"=="6" goto detener_ambos
if "%opcion%"=="7" (start "" http://localhost:5173 & goto menu)
if "%opcion%"=="0" exit /b 0

echo Opcion no valida.
timeout /t 2 >nul
goto menu


:: ==================== Utilidades ====================

:: Muestra si el puerto esta escuchando.
:estado
set "activo=DETENIDO"
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%~1 " ^| findstr "LISTENING" 2^>nul') do set "activo=EN MARCHA (PID %%a)"
echo   %~2 (puerto %~1^): !activo!
goto :eof

:: Mata el proceso que ocupa el puerto indicado.
:detener
echo.
echo Deteniendo %~2 (puerto %~1^)...
set "encontrado="
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%~1 " ^| findstr "LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
    set "encontrado=1"
)
if defined encontrado (echo %~2 detenido.) else (echo %~2 no estaba en marcha.)
goto :eof

:iniciar_backend
echo Iniciando backend...
start "Competition Manager - Backend" powershell -NoExit -Command "cd '%~dp0backend'; npm run dev"
goto :eof

:iniciar_frontend
echo Iniciando frontend...
start "Competition Manager - Frontend" powershell -NoExit -Command "cd '%~dp0frontend'; npm run dev"
goto :eof


:: ==================== Acciones ====================

:reiniciar_frontend
call :detener 5173 Frontend
timeout /t 1 >nul
call :iniciar_frontend
echo.
echo Frontend reiniciado: http://localhost:5173
goto pausa

:reiniciar_backend
call :detener 3001 Backend
timeout /t 1 >nul
call :iniciar_backend
echo.
echo Backend reiniciado: http://localhost:3001
goto pausa

:reiniciar_ambos
call :detener 5173 Frontend
call :detener 3001 Backend
timeout /t 1 >nul
call :iniciar_backend
:: El frontend espera al backend para que su proxy encuentre la API al arrancar.
timeout /t 4 >nul
call :iniciar_frontend
echo.
echo ========================================
echo   Ambos servidores reiniciados
echo   Aplicacion: http://localhost:5173
echo   API:        http://localhost:3001
echo ========================================
goto pausa

:detener_ambos
call :detener 5173 Frontend
call :detener 3001 Backend
goto pausa

:pausa
echo.
pause
goto menu
