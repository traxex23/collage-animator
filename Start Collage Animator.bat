@echo off
rem Double-click to start the app; it opens in your browser. Close this window to stop it.
cd /d "%~dp0"
start "" http://127.0.0.1:5177
node app\server.mjs
pause
