# Exercise only the named owned application's common file dialog on the isolated native CI runner.
param([int]$DialogProcessId, [string]$Title, [string]$Path, [ValidateSet('Open','Save')][string]$Action)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:DAX_NATIVE_SMOKE -ne '1' -or $DialogProcessId -le 0) {
  throw 'Native file-dialog automation is restricted to the opt-in CI test'
}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
# Desktop-wide UIA discovery can block on unrelated providers. Resolve only an owned native HWND first.
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class NativeFileDialogWindow {
  delegate bool Callback(IntPtr window, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumWindows(Callback callback, IntPtr data);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int length);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr window, uint command);
  public static string Seen;
  public static IntPtr Find(int process, string title) {
    IntPtr found=IntPtr.Zero; Seen="";
    EnumWindows(delegate(IntPtr window, IntPtr data) {
      uint owner; GetWindowThreadProcessId(window, out owner);
      if (owner!=(uint)process) {
        IntPtr parent=GetWindow(window, 4);
        if (parent==IntPtr.Zero) return true;
        GetWindowThreadProcessId(parent, out owner);
        if (owner!=(uint)process) return true;
      }
      var text=new StringBuilder(512); GetWindowText(window, text, text.Capacity);
      Seen=(Seen+text.ToString()+"; ");
      if (!String.Equals(text.ToString(), title, StringComparison.Ordinal)) return true;
      found=window; return false;
    }, IntPtr.Zero);
    return found;
  }
}
'@
[Console]::Error.WriteLine('Native dialog: searching owned native handle')
$deadline = (Get-Date).AddSeconds(25)
$dialogHandle = [IntPtr]::Zero
while ($dialogHandle -eq [IntPtr]::Zero) {
  $dialogHandle = [NativeFileDialogWindow]::Find($DialogProcessId, $Title)
  if ((Get-Date) -gt $deadline) { throw "Native dialog did not open: $Title; owned windows: $([NativeFileDialogWindow]::Seen)" }
  if ($dialogHandle -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 100 }
}
$dialog = [System.Windows.Automation.AutomationElement]::FromHandle($dialogHandle)
[Console]::Error.WriteLine('Native dialog: window found; locating file name input')
$edits = $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants,
  [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit))
$filename = $null
for ($index=0; $index -lt $edits.Count; $index++) {
  $candidate = $edits.Item($index)
  if ($candidate.Current.Name -match '^File name:?$' -or $candidate.Current.AutomationId -eq '1001') {
    $filename = $candidate
    break
  }
}
if ($null -eq $filename) { throw 'Native file name input was not found' }
[Console]::Error.WriteLine('Native dialog: setting file name')
$value = $filename.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
$value.SetValue($Path)
$buttons = $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants,
  [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button))
for ($index=0; $index -lt $buttons.Count; $index++) {
  $button = $buttons.Item($index)
  if ($button.Current.Name.TrimStart('&') -eq $Action) {
    [Console]::Error.WriteLine('Native dialog: invoking selection')
    $invoke = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $invoke.Invoke()
    Write-Output "Native $Action file selection completed."
    exit 0
  }
}
throw "Native $Action button was not found"
