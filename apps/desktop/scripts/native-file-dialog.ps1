# Select a generated fixture through an owned Windows common dialog on the isolated native CI runner.
param([int]$DialogProcessId, [string]$Title, [string]$Path, [ValidateSet('Open','Save')][string]$Action)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:DAX_NATIVE_SMOKE -ne '1' -or $DialogProcessId -le 0) {
  throw 'Native file-dialog automation is restricted to the opt-in CI test'
}
# Resolve only owned HWNDs. UIA providers on this runner block while enumerating dialog descendants.
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class NativeFileDialogWindow {
  delegate bool Callback(IntPtr window, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumWindows(Callback callback, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, Callback callback, IntPtr data);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int length);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder text, int length);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr window, uint command);
  [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr window);
  [DllImport("user32.dll")] static extern int GetDlgCtrlID(IntPtr window);
  [DllImport("user32.dll")] static extern IntPtr GetDlgItem(IntPtr window, int id);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr window, uint message, IntPtr param, string text, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool PostMessage(IntPtr window, uint message, IntPtr param, IntPtr data);
  public static string Seen;
  static string Class(IntPtr window) { var s=new StringBuilder(256); GetClassName(window,s,s.Capacity); return s.ToString(); }
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
      if (!String.Equals(text.ToString(), title, StringComparison.Ordinal)) return true;
      found=window; return false;
    }, IntPtr.Zero);
    return found;
  }
  public static bool Select(IntPtr dialog, string path, bool save) {
    if (Class(dialog)!="#32770") throw new InvalidOperationException("Expected an owned Windows common dialog");
    IntPtr edit=IntPtr.Zero; Seen="";
    EnumChildWindows(dialog, delegate(IntPtr window, IntPtr data) {
      int id=GetDlgCtrlID(window); string kind=Class(window);
      if (Seen.Length<2000) Seen+=kind+":"+id+"; ";
      if (kind!="Edit") return true;
      bool filename=id==1152;
      // Modern Save dialogs use a filename Edit 1001 directly inside a ComboBox.
      if (save && id==1001 && Class(GetParent(window))=="ComboBox") filename=true;
      for (IntPtr parent=GetParent(window); parent!=IntPtr.Zero && parent!=dialog; parent=GetParent(parent))
        if (GetDlgCtrlID(parent)==1148) { filename=true; break; }
      if (!filename) return true;
      edit=window; return false;
    }, IntPtr.Zero);
    if (edit==IntPtr.Zero) return false;
    IntPtr button=GetDlgItem(dialog,1);
    if (button==IntPtr.Zero || Class(button)!="Button") throw new InvalidOperationException("Common dialog confirmation button missing");
    IntPtr result;
    if (SendMessageTimeout(edit,0xC,IntPtr.Zero,path,2,3000,out result)==IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
    if (!PostMessage(button,0xF5,IntPtr.Zero,IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
    return true;
  }
}
'@
[Console]::Error.WriteLine('Native dialog: resolving owned common-dialog controls')
$deadline = (Get-Date).AddSeconds(10)
while ((Get-Date) -lt $deadline) {
  $dialog = [NativeFileDialogWindow]::Find($DialogProcessId, $Title)
  if ($dialog -ne [IntPtr]::Zero -and [NativeFileDialogWindow]::Select($dialog,$Path,($Action -eq 'Save'))) {
    Write-Output "Native $Action file selection submitted."
    exit 0
  }
  Start-Sleep -Milliseconds 150
}
throw "Owned common-dialog filename control unavailable: $([NativeFileDialogWindow]::Seen)"
