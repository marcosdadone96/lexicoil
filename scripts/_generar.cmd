@echo off
REM ============================================================
REM  MOTOR de generacion (proveedor: CLAUDE). Uso: _generar.cmd <lang> <level> [completo] [target]
REM  Ej: _generar.cmd en B1            (rellena gaps hacia target)
REM      _generar.cmd en B1 completo   (genera 1 examen completo)
REM
REM  Requiere ANTHROPIC_API_KEY en .env.
REM  Modelo por defecto: claude-haiku-4-5 (override con CLAUDE_GEN_MODEL en .env).
REM  SIN TOPE DE GASTO (este script desactiva CLAUDE_BUDGET_USD).
REM  UNA sola ventana (si la barra dice "Select", pulsa Esc).
REM ============================================================
setlocal
cd /d "%~dp0.."
REM --- Node.js TLS en Windows (certificados del sistema) ---
set "NODE_OPTIONS=--use-system-ca"
REM --- Sin tope de gasto: presupuesto efectivamente ilimitado para esta ejecucion ---
set "CLAUDE_BUDGET_USD=999999999"
set "L=%~1"
set "LV=%~2"
set "MODE=%~3"
set "TARGET=%~4"
if "%L%"==""  set "L=de"
if "%LV%"=="" set "LV=B1"
if "%TARGET%"=="" set "TARGET=10"

if /i "%MODE%"=="completo" (
  echo.
  echo LexiCoil - Generar 1 examen completo %L%/%LV% [Claude, sin tope]
  echo.
  node scripts/generate-parallel.mjs --lang %L% --level %LV% --provider claude --mode one-exam --target %TARGET% --wave-size 1
) else (
  echo.
  echo LexiCoil - Generar gaps %L%/%LV% hacia %TARGET% examenes [Claude, sin tope]
  echo.
  node scripts/generate-parallel.mjs --lang %L% --level %LV% --provider claude --mode gaps --target %TARGET% --wave-size 1
)
set ERR=%ERRORLEVEL%
echo.
if %ERR% NEQ 0 (echo Termino con errores. Revisa batches\logs\ y batches\rejected\) else (echo OK ^(o pausa por cuota del proveedor; reanuda volviendo a ejecutar^).)
echo.
pause
exit /b %ERR%
