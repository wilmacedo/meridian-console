# Stops the executor. It does not start again until the next logon or start.ps1.
schtasks /end /tn MeridianExecutor | Out-Null
Get-Process meridian-executor -ErrorAction SilentlyContinue | Stop-Process -Force
"Stopped."
