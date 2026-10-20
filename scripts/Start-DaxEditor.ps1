# Open the locally built native editor; no terminal server or browser is required.
$ErrorActionPreference = 'Stop'
$taskStartRoot = Split-Path -Parent $PSScriptRoot
$taskReleaseExe = Join-Path $taskStartRoot 'apps\desktop\src-tauri\target\release\dax-editor.exe'
$taskDebugExe = Join-Path $taskStartRoot 'apps\desktop\src-tauri\target\debug\dax-editor.exe'
$taskAppExe = if (Test-Path $taskReleaseExe) { $taskReleaseExe } else { $taskDebugExe }
if (!(Test-Path $taskAppExe)) { throw 'Build missing. Run scripts\Build-Windows.ps1 first.' }
# Ensure the app proves it can find its bundled runtime and resources.
foreach ($taskOverride in @('DAX_NODE', 'DAX_SERVER_ENTRY', 'DAX_FFMPEG', 'DAX_FFPROBE')) {
    Remove-Item -LiteralPath "Env:\$taskOverride" -ErrorAction SilentlyContinue
}
Start-Process -FilePath $taskAppExe -WorkingDirectory (Split-Path -Parent $taskAppExe)
