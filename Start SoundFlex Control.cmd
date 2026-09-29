@echo off
setlocal
pushd "%~dp0"

echo SoundFlex Control launcher

echo.
where node.exe >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js was not found in PATH.
    echo Install a current Node.js LTS release from https://nodejs.org/ and try again.
    goto :failure
)

if not exist "node_modules\express\package.json" (
    echo ERROR: Required Node.js dependencies are not installed.
    echo Run "Setup SoundFlex Control.cmd" first.
    goto :failure
)

if not exist "node_modules\ws\package.json" (
    echo ERROR: Required Node.js dependencies are incomplete.
    echo Run "Setup SoundFlex Control.cmd" first.
    goto :failure
)

if not exist "dist\index.html" (
    echo ERROR: The production web application has not been built.
    echo Run "Setup SoundFlex Control.cmd" first.
    goto :failure
)

if not exist "launcher\open-browser.ps1" (
    echo ERROR: launcher\open-browser.ps1 is missing.
    echo Restore the complete SoundFlex Control installation and try again.
    goto :failure
)

if not defined SOUNDFLEX_NO_BROWSER (
    where powershell.exe >nul 2>nul
    if errorlevel 1 (
        echo ERROR: Windows PowerShell was not found; the default browser cannot be opened.
        echo Restore PowerShell or set SOUNDFLEX_NO_BROWSER=1 and open the local URL manually.
        goto :failure
    )
)

if not defined SOUNDFLEX_WEB_HOST set "SOUNDFLEX_WEB_HOST=127.0.0.1"
if not defined SOUNDFLEX_WEB_PORT set "SOUNDFLEX_WEB_PORT=3080"
if not defined SOUNDFLEX_BROWSER_HOST set "SOUNDFLEX_BROWSER_HOST=%SOUNDFLEX_WEB_HOST%"
set "SOUNDFLEX_URL=http://%SOUNDFLEX_BROWSER_HOST%:%SOUNDFLEX_WEB_PORT%"

echo Listening on %SOUNDFLEX_WEB_HOST%:%SOUNDFLEX_WEB_PORT%
echo Opening %SOUNDFLEX_URL%
echo Keep this window open. Press Ctrl+C to stop SoundFlex Control.
echo.
if not defined SOUNDFLEX_NO_BROWSER start "" /b powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\open-browser.ps1" -Url "%SOUNDFLEX_URL%"
node.exe server\index.js
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo ERROR: SoundFlex Control stopped with exit code %EXIT_CODE%.
    echo Check whether port %SOUNDFLEX_WEB_PORT% is already in use.
    pause
)

popd
exit /b %EXIT_CODE%

:failure
echo.
pause
popd
exit /b 1
