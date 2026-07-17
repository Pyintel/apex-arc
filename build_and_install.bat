@echo off
echo Building the arc binary...
cd packages\opencode
call bun run build:dev
if %errorlevel% neq 0 (
    echo Build failed.
    pause
    exit /b %errorlevel%
)

echo.
echo Installing arc binary to user's .arc\bin directory...
set "INSTALL_DIR=%USERPROFILE%\.arc\bin"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: Note: If you are on an ARM64 Windows machine, the directory below will be mimocode-windows-arm64
copy /Y "dist\mimocode-windows-x64\bin\arc.exe" "%INSTALL_DIR%\arc.exe"

echo.
echo Checking if %INSTALL_DIR% is in PATH...
echo %PATH% | findstr /I /C:"%INSTALL_DIR%" >nul
if %errorlevel% neq 0 (
    echo Adding %INSTALL_DIR% to user PATH...
    setx PATH "%PATH%;%INSTALL_DIR%"
    echo Please restart your terminal for the PATH change to take effect!
) else (
    echo The directory is already in your PATH.
)

echo.
echo Installation complete! You can now type 'arc' in your terminal.
pause
