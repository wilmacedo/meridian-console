@echo off
rem Starts a Chrome for Meridian next to the normal one: its own profile, with the debug port on loopback only.
rem Since Chrome 136 the debug port is ignored on the default profile, so this one is separate: sign in to the
rem sites NOX should read here once, and the session stays in this profile.
set "PROFILE=%LOCALAPPDATA%\Meridian\chrome-profile"
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 --user-data-dir="%PROFILE%" --no-first-run https://appstoreconnect.apple.com/
