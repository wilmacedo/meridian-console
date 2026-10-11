# Stops the executor and removes the task. The binary, the config and the device key stay where they are:
# delete %APPDATA%\meridian-executor to forget this device entirely (and revoke it on the server).
& (Join-Path $PSScriptRoot 'stop.ps1')
Unregister-ScheduledTask -TaskName 'MeridianExecutor' -Confirm:$false -ErrorAction SilentlyContinue
"Removed the MeridianExecutor task."
