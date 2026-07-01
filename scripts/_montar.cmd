@echo off
REM ============================================================
REM  MOTOR de montaje. Uso: _montar.cmd <lang> <level> [target]
REM  Merge + ensambla examenes + valida aceptacion. NO llama a Gemini.
REM ============================================================
setlocal
cd /d "%~dp0.."
set "L=%~1"
set "LV=%~2"
set "TARGET=%~3"
if "%L%"==""  set "L=de"
if "%LV%"=="" set "LV=B1"
if "%TARGET%"=="" set "TARGET=10"

echo.
echo LexiCoil - Montar banco y examenes %L%/%LV% (target %TARGET%)
echo.
REM --verify activa el gate semantico con IA (requiere ANTHROPIC_API_KEY).
REM Para saltarlo en pruebas rapidas, quita el --verify de la linea siguiente.
node scripts/assemble-bank-pipeline.mjs --lang %L% --level %LV% --target %TARGET% --max %TARGET% --verify
set ERR=%ERRORLEVEL%
echo.
if %ERR% NEQ 0 (
  echo Montaje con errores. Revisa batches\rejected\
) else (
  echo Montaje OK. Validando aceptacion...
  echo.
  node scripts/accept-level.mjs --lang %L% --level %LV% --target %TARGET%
)
echo.
pause
exit /b %ERR%
