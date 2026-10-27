@echo off
setlocal EnableExtensions
cd /d "%~dp0" || exit /b 1
title SVF - Open TCP 5000 temporarily (close to stop)
where powershell.exe >nul 2>nul || (
    echo [ERROR] Windows PowerShell is required.
    pause
    exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\test-port-5000.ps1"
if errorlevel 1 (
    echo.
    echo [ERROR] Test launcher failed. Read the messages above.
    pause
    exit /b 1
)
exit /b 0
