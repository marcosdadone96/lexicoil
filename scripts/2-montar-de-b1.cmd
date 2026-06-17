@echo off
REM Fase B — Merge + montar exámenes de/B1 (target 10). NO llama a Gemini.

cd /d "%~dp0.."

echo.
echo LexiCoil - Montar banco y exámenes de/B1 ^(target 10^)
echo.

node scripts/assemble-bank-pipeline.mjs --lang de --level B1 --target 10 --max 10
set ERR=%ERRORLEVEL%

echo.
if %ERR% NEQ 0 (
  echo Montaje con errores. Revisa batches\rejected\
) else (
  echo Listo. Ejecuta: node scripts/accept-de-b1.mjs
)
echo.
pause
exit /b %ERR%
