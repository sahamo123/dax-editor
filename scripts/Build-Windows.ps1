# Build the actual editor with its engine and verified Windows sidecars.
param([switch]$Release, [switch]$Installer)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Enter-Dev.ps1')
Push-Location $taskRepoRoot
try {
    & pnpm.cmd build
    if ($LASTEXITCODE -ne 0) { throw 'Workspace build failed.' }
    Push-Location (Join-Path $taskRepoRoot 'apps\desktop')
    try {
        & node scripts/prepare-offline-ai.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Offline AI preparation failed.' }
        & node scripts/prepare-offline-speech.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Offline AI preparation failed.' }
        & node scripts/prepare-sidecars.mjs --release --target x86_64-pc-windows-msvc
        if ($LASTEXITCODE -ne 0) { throw 'Sidecar preparation failed.' }
        $taskBuildArgs = @('exec', 'tauri', 'build', '--ci')
        if (!$Release) { $taskBuildArgs += '--debug' }
        if ($Installer) { $taskBuildArgs += @('--bundles', 'nsis') }
        else { $taskBuildArgs += '--no-bundle' }
        & pnpm.cmd @taskBuildArgs
        if ($LASTEXITCODE -ne 0) { throw 'Native build failed.' }
    } finally { Pop-Location }
} finally { Pop-Location }
