@echo off
setlocal
pushd "%~dp0"

echo SoundFlex Control setup

echo.
where node.exe >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js was not found in PATH.
    echo Install a current Node.js LTS release from https://nodejs.org/ and try again.
    goto :failure
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
    echo ERROR: npm was not found in PATH.
    echo Repair the Node.js installation and try again.
    goto :failure
)

if not exist "package.json" (
    echo ERROR: package.json is missing.
    echo Run setup from the complete SoundFlex Control installation.
    goto :failure
)

if not exist "package-lock.json" (
    echo ERROR: package-lock.json is missing; a reproducible installation cannot be performed.
    echo Restore the complete SoundFlex Control installation and try again.
    goto :failure
)

echo Installing the locked Node.js dependencies...
call npm.cmd ci
if errorlevel 1 (
    echo.
    echo ERROR: Dependency installation failed. Review the npm output above.
    goto :failure
)

echo.
echo Building the production web application...
call npm.cmd run build
if errorlevel 1 (
    echo.
    echo ERROR: The production build failed. Review the build output above.
    goto :failure
)

echo.
echo Setup completed successfully.
echo Run "Start SoundFlex Control.cmd" to launch the controller.
echo.
pause
popd
exit /b 0

:failure
echo.
pause
popd
exit /b 1
