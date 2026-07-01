@echo off
REM Genera un examen Goethe A2 completo con Gemini (10 batches).
REM Uso: scripts\generate-a2-exam.cmd
REM Requiere: GEMINI_API_KEY en .env, GEN_PROVIDER=gemini

cd /d "%~dp0.."

echo === Lesen T1-T4 ===
for %%t in (1 2 3 4) do (
  node scripts/generate-batch-gemini.mjs --lang de --level A2 --module lesen --teil %%t --provider gemini --merge
  if errorlevel 1 exit /b 1
)

echo === Hoeren T1-T4 ===
for %%t in (1 2 3 4) do (
  node scripts/generate-batch-gemini.mjs --lang de --level A2 --module horen --teil %%t --provider gemini --merge
  if errorlevel 1 exit /b 1
)

echo === Schreiben ===
node scripts/generate-batch-gemini.mjs --lang de --level A2 --module schreiben --provider gemini --merge
if errorlevel 1 exit /b 1

echo === Sprechen ===
node scripts/generate-batch-gemini.mjs --lang de --level A2 --module sprechen --provider gemini --merge
if errorlevel 1 exit /b 1

echo.
echo Listo. 10 batches generados y mergeados al banco de/A2.
