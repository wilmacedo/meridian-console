# Installs (or removes) the scheduled task Meridian runs over ssh to open the debug Chrome on this Windows machine.
# Why a task: an ssh session is not the desktop, so Chrome started from it would be invisible and the owner could not
# sign in. A task registered for the logged-in user, with no trigger, starts Chrome in their own session, and only
# when Meridian runs it (schtasks /run /tn MeridianChrome). Nothing starts by itself, ever.
#   powershell -File windows-chrome-task.ps1            install
#   powershell -File windows-chrome-task.ps1 -Action remove
# -Name, -Port and -ProfileDir exist for tests (a throwaway task on another port); the defaults are what Meridian uses.
param([ValidateSet('install', 'remove')][string]$Action = 'install', [string]$StartUrl = 'about:blank', [string]$Name = 'MeridianChrome', [int]$Port = 9222, [string]$ProfileDir = 'Meridian\chrome-profile')
$ErrorActionPreference = 'Stop'
$name = $Name
if ($Action -eq 'remove') {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
  "removed task $name"
  exit
}
$chrome = @('C:\Program Files\Google\Chrome\Application\chrome.exe', 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe', "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw 'Chrome was not found' }
# A profile of its own: since Chrome 136 the debug port is ignored on the default one.
$profile = Join-Path $env:LOCALAPPDATA $ProfileDir
# --restore-last-session makes Chrome keep session cookies on disk, so a sign-in survives closing the window (Apple's does not otherwise).
$arguments = "--remote-debugging-port=$Port --remote-debugging-address=127.0.0.1 --user-data-dir=`"$profile`" --no-first-run --restore-last-session $StartUrl"
$task = New-ScheduledTaskAction -Execute $chrome -Argument $arguments
# The identity as Windows knows it: an ssh session's USERDOMAIN can differ from the one the task needs.
$me = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$who = New-ScheduledTaskPrincipal -UserId $me -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $name -Action $task -Principal $who -Settings $settings -Description 'Starts the Chrome that Meridian drives. No trigger: it only runs when Meridian asks.' -Force | Out-Null
if (-not (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue)) { throw "the task was not created" }
"installed task $name for $me (no trigger); Meridian starts it with: schtasks /run /tn $name"
