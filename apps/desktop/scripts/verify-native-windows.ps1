# CI-only one-shot standard-user launch. WebView2 ignores environment debugging switches in elevated hosts.
param([switch]$Worker, [string]$ConfigPath)
$ErrorActionPreference = 'Stop'
if ($Worker) {
  $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
  $completion = Join-Path $config.output 'worker-exit.txt'
  $code = 1
  try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
      throw 'Native acceptance must run with a standard-user token'
    }
    Set-Location -LiteralPath $config.root
    $env:GITHUB_ACTIONS = 'true'
    $env:DAX_NATIVE_SMOKE = '1'
    $env:RUNNER_TEMP = $config.temp
    $env:DAX_NATIVE_INSTALLER_DIR = $config.installer
    & $config.node 'apps/desktop/scripts/verify-native-windows.mjs' *> (Join-Path $config.output 'worker.log')
    $code = $LASTEXITCODE
  } catch {
    $_.Exception.Message | Set-Content -LiteralPath (Join-Path $config.output 'worker-launch-error.txt')
  } finally {
    [IO.File]::WriteAllText($completion, [string]$code)
  }
  exit $code
}
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:DAX_NATIVE_SMOKE -ne '1') {
  throw 'This standard-user launcher is restricted to the opt-in Windows CI acceptance job'
}
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$output = Join-Path $root 'artifacts/native-windows-acceptance'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$config = @{root=$root; output=$output; node=(Get-Command node).Source; temp=$env:RUNNER_TEMP; installer=$env:DAX_NATIVE_INSTALLER_DIR}
$configFile = Join-Path $output 'worker-config.json'
$config | ConvertTo-Json | Set-Content -LiteralPath $configFile
$completion = Join-Path $output 'worker-exit.txt'
if (Test-Path -LiteralPath $completion) { throw 'Acceptance completion marker already exists' }
$taskName = 'DaxNativeAcceptance-' + [Guid]::NewGuid().ToString('N')
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$powershell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$arguments = '-NoProfile -WindowStyle Hidden -File "' + $PSCommandPath + '" -Worker -ConfigPath "' + $configFile + '"'
$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $root
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$registered = $false
try {
  Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings | Out-Null
  $registered = $true
  Start-ScheduledTask -TaskName $taskName
  $deadline = (Get-Date).AddMinutes(10)
  while (-not (Test-Path -LiteralPath $completion)) {
    if ((Get-Date) -gt $deadline) { throw 'Standard-user native acceptance timed out' }
    Start-Sleep -Seconds 2
  }
  foreach ($name in @('worker.log','worker-launch-error.txt')) {
    $path = Join-Path $output $name
    if (Test-Path -LiteralPath $path) { Get-Content -LiteralPath $path }
  }
  $code = [int](Get-Content -LiteralPath $completion -Raw)
  if ($code -ne 0) { throw "Native acceptance failed with exit code $code" }
} finally {
  if ($registered) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  }
}
