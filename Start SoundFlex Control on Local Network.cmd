@echo off
setlocal
set "SOUNDFLEX_WEB_HOST=0.0.0.0"
set "SOUNDFLEX_BROWSER_HOST=127.0.0.1"
call "%~dp0Start SoundFlex Control.cmd"
exit /b %ERRORLEVEL%
