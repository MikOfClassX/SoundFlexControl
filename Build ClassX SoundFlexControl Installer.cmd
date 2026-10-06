@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 (
    echo ERROR: Cannot access the SoundFlexControl project directory.
    pause
    exit /b 1
)

echo Building the ClassX SoundFlexControl Windows x64 installer
echo Internet access is required to download build dependencies and packaging tools.
echo Close any desktop development instance before building.
echo.

where node.exe >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js was not found in PATH. Install a current Node.js LTS release.
    goto :failure
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
    echo ERROR: npm was not found in PATH. Repair the Node.js installation.
    goto :failure
)
for %%F in (package.json package-lock.json electron-builder.yml desktop\main.js desktop\classx.ico) do (
    if not exist "%%F" (
        echo ERROR: %%F is missing. Run this batch from the complete project checkout.
        goto :failure
    )
)

rem Ensure development dependencies and runtime downloads are available on the build machine.
set "NODE_ENV=development"
set "ELECTRON_SKIP_BINARY_DOWNLOAD="
call npm.cmd ci --include=dev --ignore-scripts=false
if errorlevel 1 goto :failure

call npm.cmd run typecheck
if errorlevel 1 goto :failure
call npm.cmd test
if errorlevel 1 goto :failure

rem Build the interface and then the self-contained Electron NSIS installer.
call npm.cmd run build:installer
if errorlevel 1 goto :failure

echo.
echo Installer build completed successfully.
echo Output directory: "%CD%\release"
dir /b "release\ClassX SoundFlexControl Setup *.exe"
if errorlevel 1 goto :failure
echo End users do not need Node.js, npm, or a separate browser.
echo Unsigned installers may display a Windows SmartScreen warning.
echo.
pause
popd
exit /b 0

:failure
echo.
echo ERROR: Installer build failed. Review the output above; do not distribute an old installer.
pause
popd
exit /b 1
