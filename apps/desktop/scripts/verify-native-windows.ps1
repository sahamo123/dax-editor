# CI-only one-shot standard-user launch. WebView2 ignores environment debugging switches in elevated hosts.
param([switch]$Worker, [string]$ConfigPath)
$ErrorActionPreference = 'Stop'
if ($Worker) {
  $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
  $completion = Join-Path $config.output 'worker-exit.txt'
  $code = 1
  try {
    # Basic User removes admin groups but can retain the parent's High integrity label.
    # Lower only this CI worker token before starting the app; never change machine policy.
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class NativeAcceptanceToken {
  [StructLayout(LayoutKind.Sequential)] struct Label { public IntPtr Sid; public uint Attributes; }
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool ConvertStringSidToSid(string sid, out IntPtr value);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool SetTokenInformation(IntPtr token, int kind, IntPtr value, int size);
  [DllImport("advapi32.dll")] static extern uint GetLengthSid(IntPtr sid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr value);
  public static void LowerToMedium() {
    IntPtr token=IntPtr.Zero, sid=IntPtr.Zero, buffer=IntPtr.Zero;
    try {
      if (!OpenProcessToken(System.Diagnostics.Process.GetCurrentProcess().Handle, 0x80, out token)) throw new Win32Exception(Marshal.GetLastWin32Error());
      if (!ConvertStringSidToSid("S-1-16-8192", out sid)) throw new Win32Exception(Marshal.GetLastWin32Error());
      int size=Marshal.SizeOf(typeof(Label)) + (int)GetLengthSid(sid);
      buffer=Marshal.AllocHGlobal(size);
      Marshal.StructureToPtr(new Label { Sid=sid, Attributes=0x20 }, buffer, false);
      if (!SetTokenInformation(token, 25, buffer, size)) throw new Win32Exception(Marshal.GetLastWin32Error());
    } finally {
      if (buffer!=IntPtr.Zero) Marshal.FreeHGlobal(buffer);
      if (sid!=IntPtr.Zero) LocalFree(sid);
      if (token!=IntPtr.Zero) CloseHandle(token);
    }
  }
}
'@
    [NativeAcceptanceToken]::LowerToMedium()
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
    $child = Start-Process -FilePath $config.node -ArgumentList 'apps/desktop/scripts/verify-native-windows.mjs' -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $config.output 'worker.log') -RedirectStandardError (Join-Path $config.output 'worker.stderr.log')
    # Wait for the harness itself; Start-Process -Wait also waits for shared Windows shell descendants.
    $child.WaitForExit()
    $code = $child.ExitCode
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
$powershell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$arguments = '-NoProfile -WindowStyle Hidden -File "' + $PSCommandPath + '" -Worker -ConfigPath "' + $configFile + '"'
$runas = Join-Path $env:SystemRoot 'System32/runas.exe'
# Basic User restricts the existing token without a password, account or policy change.
& $runas '/trustlevel:0x20000' ($powershell + ' ' + $arguments)
if ($LASTEXITCODE -ne 0) { throw 'Windows refused the Basic User test launch' }
$deadline = (Get-Date).AddMinutes(10)
while (-not (Test-Path -LiteralPath $completion)) {
  if ((Get-Date) -gt $deadline) { throw 'Standard-user native acceptance timed out' }
  Start-Sleep -Seconds 2
}
foreach ($name in @('worker.log','worker.stderr.log','worker-launch-error.txt')) {
  $path = Join-Path $output $name
  if (Test-Path -LiteralPath $path) { Get-Content -LiteralPath $path }
}
$code = [int](Get-Content -LiteralPath $completion -Raw)
if ($code -ne 0) { throw "Native acceptance failed with exit code $code" }
