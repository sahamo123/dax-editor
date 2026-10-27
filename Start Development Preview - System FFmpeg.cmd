@echo off
cd /d "%~dp0"
echo Starting development preview with your installed FFmpeg and ffprobe.
".local-tools\node\node.exe" scripts\dev-preview.mjs --system-ffmpeg
pause
