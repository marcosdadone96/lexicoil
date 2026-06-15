@echo off
REM Fase A — Generar contenido de/B1 (target 10 exámenes)
REM Requiere GEMINI_API_KEY en .env
REM
REM IMPORTANTE: UNA sola ventana. Si la barra dice "Select", pulsa Esc.
REM Preflight: npm run gemini:doctor

cd /d "%~dp0.."
set MODE=%~1
if /i "%MODE%"=="completo" (
  echo.
  echo LexiCoil - Generar 1 examen completo de/B1 ^(11 batches^)
  echo.
  node scripts/generate-parallel.mjs --lang de --level B1 --mode one-exam --target 10 --wave-size 1
) else (
  echo.
  echo LexiCoil - Generar gaps de/B1 hacia 10 exámenes
  echo.
  node scripts/generate-parallel.mjs --lang de --level B1 --mode gaps --target 10 --wave-size 1
)
set ERR=%ERRORLEVEL%

echo.
if %ERR% NEQ 0 (
  echo Termino con errores. Revisa batches\logs\ y batches\rejected\
) else (
  echo OK ^(o pausa por cuota diaria — reanuda manana^).
)
echo.
pause
exit /b %ERR%
