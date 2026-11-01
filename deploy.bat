@echo off
setlocal EnableExtensions
title System Validation Framework - Public Deploy
cd /d "%~dp0" || goto FAILED

echo ================================
echo   SYSTEM VALIDATION FRAMEWORK
echo ================================
echo.

rem Check Tailscale before building images.
set "TAILSCALE=tailscale"
where tailscale >nul 2>nul
if errorlevel 1 (
    if exist "%ProgramFiles%\Tailscale\tailscale.exe" (
        set "TAILSCALE=%ProgramFiles%\Tailscale\tailscale.exe"
    ) else (
        echo [ERROR] Tailscale is not installed.
        echo Install Tailscale and sign in on this SERVER computer.
        goto FAILED
    )
)
"%TAILSCALE%" status --json >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Cannot contact Tailscale. Open Tailscale and sign in.
    goto FAILED
)

where docker >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Docker Desktop is not installed or docker is not in PATH.
    goto FAILED
)

docker info >nul 2>nul
if not errorlevel 1 goto DOCKER_READY
echo [INFO] Docker Engine is not running. Starting Docker Desktop...
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
    start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
) else (
    echo [ERROR] Start Docker Desktop manually and run this file again.
    goto FAILED
)
set /a WAIT_COUNT=0
:WAIT_DOCKER
docker info >nul 2>nul
if not errorlevel 1 goto DOCKER_READY
set /a WAIT_COUNT+=1
if %WAIT_COUNT% GEQ 60 (
    echo [ERROR] Docker Engine did not become ready.
    goto FAILED
)
timeout /t 3 /nobreak >nul
goto WAIT_DOCKER

:DOCKER_READY
if not exist ".env" (
    copy /Y ".env.example" ".env" >nul
    if errorlevel 1 goto FAILED
    echo [INFO] Created .env from .env.example. Review passwords and SMTP settings.
)
echo.
echo [INFO] Starting Docker, database migrations, Funnel and private Tailnet TCP...
call "%~dp0scripts\deploy-tailscale.bat"
if errorlevel 1 goto FAILED

set "ADMIN_ORIGIN="
set "CLIENT_ORIGIN="
for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if /I "%%A"=="TAILSCALE_ADMIN_ORIGIN" set "ADMIN_ORIGIN=%%B"
    if /I "%%A"=="TAILSCALE_CLIENT_ORIGIN" set "CLIENT_ORIGIN=%%B"
)

echo.
echo ===============================================================
echo   PUBLIC DEPLOY COMPLETED
if defined ADMIN_ORIGIN echo   ADMIN : %ADMIN_ORIGIN%/admin/
if defined CLIENT_ORIGIN echo   CLIENT: %CLIENT_ORIGIN%/branch/
echo ===============================================================
echo [NOTE] Web users do NOT need Tailscale for Funnel URLs.
echo [TAILNET] Ubuntu Java client needs Tailscale; connect to SERVER-TAILSCALE-IP:5000.
echo [TAILNET] Raw TCP 5000 is PRIVATE to authorized tailnet peers (not public).
echo [NOTE] Public DNS can take time to propagate after first enable.
echo [SECURITY] Change default admin/branch passwords before sharing.
echo [MAIL] SMTP alerts require MAIL_ENABLED=true and valid settings.
echo.
pause
exit /b 0

:FAILED
echo.
echo [FAILED] Deployment did not complete. Read the error above.
echo [TIP] First-time Funnel may require approval in the Tailscale browser page.
echo [TIP] Existing PostgreSQL data is not deleted by this script.
pause
exit /b 1
