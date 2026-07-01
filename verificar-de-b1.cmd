@echo off
REM ============================================================
REM  Verificación semántica de exámenes de/B1 (gate con IA).
REM  Te pide la clave al arrancar (no se guarda en el archivo).
REM  Coloca este .cmd en la raíz del proyecto (junto a la carpeta scripts).
REM ============================================================
setlocal
cd /d "%~dp0"

echo.
echo  Verificacion semantica de examenes de/B1
echo  -----------------------------------------
echo  Pega tu ANTHROPIC_API_KEY y pulsa Enter:
set /p AK=API key: 
if "%AK%"=="" (echo No se introdujo clave. & pause & exit /b 1)
set "ANTHROPIC_API_KEY=%AK%"
set "CLAUDE_VERIFY_MODEL=claude-haiku-4-5"

echo.
echo  Paso 1: comprobar (sin borrar nada). Genera informe.json
echo.
node scripts/verify-curated.mjs --dir library/curated/de/B1 --report informe.json
echo.
echo  Revisa informe.json para ver que preguntas tienen problemas.
echo.
choice /C SN /M "Quieres ELIMINAR ahora las preguntas con problemas y publicar los examenes"
if errorlevel 2 goto fin

echo.
echo  Paso 2: eliminar preguntas malas...
node scripts/verify-curated.mjs --dir library/curated/de/B1 --drop --report informe-limpieza.json
echo.
echo  Paso 3: publicar los examenes saneados al archivo servido...
node scripts/curated-to-served.mjs --lang de --level B1

:fin
echo.
echo  Hecho.
set "ANTHROPIC_API_KEY="
echo.
pause
