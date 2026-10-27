@echo off
setlocal EnableExtensions
cd /d "%~dp0.." || exit /b 1

rem Tailnet-only TCP forwarder. This does not touch Funnel 443/8443 or PostgreSQL.
rem Docker host 127.0.0.1:SERVER_TCP_PORT -> Tailscale IP:5000 -> Ubuntu Client.
set "TAILSCALE=tailscale"
where tailscale >nul 2>nul
if errorlevel 1 (
    if exist "%ProgramFiles%\Tailscale\tailscale.exe" (
        set "TAILSCALE=%ProgramFiles%\Tailscale\tailscale.exe"
    ) else (
        echo [ERROR] Install Tailscale on this Windows SERVER and sign in.
        exit /b 1
    )
)
"%TAILSCALE%" status --json >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Tailscale is not connected on this server.
    exit /b 1
)
set "LOCAL_PORT=5000"
if exist ".env" (
    for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
        if /I "%%A"=="SERVER_TCP_PORT" set "LOCAL_PORT=%%B"
    )
)
rem Ports must be numeric; avoid executing untrusted shell fragments from .env.
echo(%LOCAL_PORT%| findstr /R "^[0-9][0-9]*$" >nul
if errorlevel 1 (
    echo [ERROR] Invalid SERVER_TCP_PORT in .env: %LOCAL_PORT%
    exit /b 1
)

powershell.exe -NoProfile -Command "if (Test-NetConnection -ComputerName '127.0.0.1' -Port %LOCAL_PORT% -InformationLevel Quiet -WarningAction SilentlyContinue) { exit 0 } else { exit 1 }"
if errorlevel 1 (
    echo [ERROR] Docker TCP 127.0.0.1:%LOCAL_PORT% is not reachable.
    echo [TIP] Run deploy.bat first. Check docker compose ps and TCP port conflicts.
    exit /b 1
)

rem -bg persists after closing the shell and after Tailscale restart.
echo [TAILNET] Starting PRIVATE TCP 5000 -^> localhost:%LOCAL_PORT% ...
"%TAILSCALE%" serve --bg --tcp=5000 tcp://127.0.0.1:%LOCAL_PORT%
if errorlevel 1 (
    echo [ERROR] Could not configure Tailscale Serve TCP 5000.
    echo [TIP] Check tailnet policy; do NOT use tailscale serve reset, it may clear other routes.
    exit /b 1
)
echo.
echo [TAILNET] Tailscale Server IPv4:
"%TAILSCALE%" ip -4
if errorlevel 1 exit /b 1
echo [TAILNET] Configure Ubuntu Client: server=^<SERVER-TAILSCALE-IP^>:5000
"%TAILSCALE%" serve status
if errorlevel 1 exit /b 1
echo [OK] TCP 5000 is available to authorized tailnet peers only.
exit /b 0
