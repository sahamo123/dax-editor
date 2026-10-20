@echo off
cd /d "%~dp0"
".local-tools\node\node.exe" scripts\dev-preview.mjs
pause
