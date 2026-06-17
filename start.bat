@echo off
cd /d "%~dp0"
echo.
echo  LexiCoil - local server
echo  =======================
echo.
echo Opening http://localhost:5173 ...
echo Press Ctrl+C to stop the server.
echo.
start "" "http://localhost:5173"
node server.mjs
