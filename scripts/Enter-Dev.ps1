# Dot-source this file to use the laptop-local toolchains and caches for this repository.
$taskRepoRoot = Split-Path -Parent $PSScriptRoot
$taskNodeRoot = Join-Path $taskRepoRoot '.local-tools\node'
$taskPnpmBin = Join-Path $taskRepoRoot '.local-tools\pnpm\node_modules\.bin'
$env:CARGO_HOME = Join-Path $taskRepoRoot '.local-tools\cargo'
$env:RUSTUP_HOME = Join-Path $taskRepoRoot '.local-tools\rustup'
$env:CARGO_TARGET_DIR = Join-Path $taskRepoRoot 'apps\desktop\src-tauri\target'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $taskRepoRoot '.local-tools\playwright'
$env:npm_config_cache = Join-Path $taskRepoRoot '.local-tools\npm-cache'
$env:TEMP = Join-Path $taskRepoRoot '.local-tools\tmp'
$env:TMP = $env:TEMP
$env:DAX_FFMPEG = Join-Path $taskRepoRoot 'apps\desktop\src-tauri\binaries\dax-ffmpeg-x86_64-pc-windows-msvc.exe'
$env:DAX_FFPROBE = Join-Path $taskRepoRoot 'apps\desktop\src-tauri\binaries\dax-ffprobe-x86_64-pc-windows-msvc.exe'
$env:PATH = "$taskNodeRoot;$taskPnpmBin;$env:CARGO_HOME\bin;$env:PATH"
New-Item -ItemType Directory -Force $env:TEMP | Out-Null
if (!(Test-Path (Join-Path $taskNodeRoot 'node.exe'))) {
    throw 'Pinned Node runtime missing. Prepare Windows sidecars before entering this environment.'
}
