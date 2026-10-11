# Registers the executor to start when the owner logs on, in their own interactive session (an ssh session is not
# the desktop, so it could not see or move a window). Limited rights, no service, no installer.
#   powershell -ExecutionPolicy Bypass -File install-task.ps1 -Exe C:\path\meridian-executor.exe
param(
    [Parameter(Mandatory = $true)][string]$Exe,
    [string]$Config = (Join-Path $env:APPDATA 'meridian-executor\config.json')
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Exe)) { throw "No executor at $Exe" }
if (-not (Test-Path $Config)) { throw "No config at $Config (see the README: url and server_public_key)" }

$me = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $Exe -Argument "--config `"$Config`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $me
$principal = New-ScheduledTaskPrincipal -UserId $me -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'MeridianExecutor' -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
    -Description 'Meridian executor: lets NOX act on this PC when the owner allows it. Remove with uninstall-task.ps1.' -Force | Out-Null
"Registered MeridianExecutor for $me (starts at logon). Start it now with start.ps1."
