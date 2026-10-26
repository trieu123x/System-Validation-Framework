@echo off
setlocal EnableExtensions
cd /d "%~dp0.." || exit /b 1

echo [1/2] Docker: start PostgreSQL, apply migrations and build services...
call "%~dp0docker-deploy.bat"
if errorlevel 1 (
    echo [ERROR] Docker deployment failed. Funnel was not changed.
    exit /b 1
)

echo.
echo [2/2] Tailscale: publish admin and client with PUBLIC Funnel...
call "%~dp0tailscale-funnel.bat"
if errorlevel 1 (
    echo [ERROR] Tailscale Funnel setup failed.
    exit /b 1
)
echo.
echo [OK] Docker and public Tailscale Funnel are configured.
exit /b 0
