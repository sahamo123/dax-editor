# Exercise only the named owned application's common file dialog on the isolated native CI runner.
param([int]$DialogProcessId, [string]$Title, [string]$Path, [ValidateSet('Open','Save')][string]$Action)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:DAX_NATIVE_SMOKE -ne '1' -or $DialogProcessId -le 0) {
  throw 'Native file-dialog automation is restricted to the opt-in CI test'
}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
[Console]::Error.WriteLine('Native dialog: searching owned window')
$condition = [System.Windows.Automation.AndCondition]::new([System.Windows.Automation.Condition[]]@(
  [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $DialogProcessId),
  [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $Title)
))
$deadline = (Get-Date).AddSeconds(25)
$dialog = $null
while ($null -eq $dialog) {
  $dialog = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, $condition)
  if ((Get-Date) -gt $deadline) { throw "Native dialog did not open: $Title" }
  if ($null -eq $dialog) { Start-Sleep -Milliseconds 100 }
}
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
