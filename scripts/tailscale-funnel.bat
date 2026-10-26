@echo off
setlocal EnableExtensions
cd /d "%~dp0.." || exit /b 1
set "TAILSCALE=tailscale"
where tailscale >nul 2>nul
if errorlevel 1 (
    if exist "%ProgramFiles%\Tailscale\tailscale.exe" (
        set "TAILSCALE=%ProgramFiles%\Tailscale\tailscale.exe"
    ) else (
        echo [ERROR] Install Tailscale and sign in on this computer.
        exit /b 1
    )
)
"%TAILSCALE%" status --json >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Tailscale is unavailable or you are not signed in.
    exit /b 1
)
if not exist ".env" (
    copy /Y ".env.example" ".env" >nul
    if errorlevel 1 exit /b 1
)

rem Set the exact public origins for Host/Origin checks and reset links.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0set-tailscale-host.ps1" -Tailscale "%TAILSCALE%"
if errorlevel 1 (
    echo [ERROR] Could not determine this node's Tailscale HTTPS name.
    exit /b 1
)

where docker >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Docker is not installed or not in PATH.
    exit /b 1
)
rem Reload allowed origins from .env, without deleting database volumes.
docker compose up -d --no-deps --force-recreate server client
if errorlevel 1 (
    echo [ERROR] Could not recreate server and client with HTTPS origins.
    exit /b 1
)

echo.
echo [FUNNEL 1/2] Admin on HTTPS port 443 (PUBLIC)...
"%TAILSCALE%" funnel --bg --https=443 http://127.0.0.1:8080
if errorlevel 1 (
    echo [ERROR] Admin Funnel failed. Enable Funnel and HTTPS in Tailscale.
    exit /b 1
)
echo.
echo [FUNNEL 2/2] All branches on HTTPS port 8443 (PUBLIC)...
"%TAILSCALE%" funnel --bg --https=8443 http://127.0.0.1:8081
if errorlevel 1 (
    echo [ERROR] Client Funnel failed. Check Funnel approval and Tailscale policy.
    exit /b 1
)
echo.
echo [INFO] Actual public listener configuration:
"%TAILSCALE%" funnel status
if errorlevel 1 exit /b 1
echo.
echo [OK] Both ports use Funnel, NOT the tailnet-only Serve mode.
echo [WARNING] Anyone on the Internet can reach the login pages.
exit /b 0
