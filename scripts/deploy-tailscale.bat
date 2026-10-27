@echo off
setlocal EnableExtensions
cd /d "%~dp0.." || exit /b 1

echo [1/3] Docker: start PostgreSQL, apply migrations and build services...
call "%~dp0docker-deploy.bat"
if errorlevel 1 (
    echo [ERROR] Docker deployment failed. Funnel was not changed.
    exit /b 1
)

echo.
echo [2/3] Tailscale: publish admin and client with PUBLIC Funnel...
call "%~dp0tailscale-funnel.bat"
if errorlevel 1 (
    echo [ERROR] Tailscale Funnel setup failed.
    exit /b 1
)
echo.
echo [3/3] Tailscale: allow tailnet-only raw TCP 5000 to Docker Server...
call "%~dp0tailscale-tcp.bat"
if errorlevel 1 (
    echo [ERROR] TCP Serve setup failed. Admin and Client Funnel may still be running.
    exit /b 1
)
echo.
echo [OK] Docker, public Funnel 443/8443 and PRIVATE tailnet TCP 5000 configured.
exit /b 0
