@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title SVF - Windows Docker + Tailscale Funnel

set "TS=tailscale.exe"
where tailscale.exe >nul 2>&1
if errorlevel 1 set "TS=%ProgramFiles%\Tailscale\tailscale.exe"
if not exist "%TS%" (
  where tailscale.exe >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] Install and log into Tailscale first.
    pause
    exit /b 1
  )
)

set "CADDY=%~dp0caddy.exe"
if not exist "%CADDY%" (
  where caddy.exe >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] Copy caddy.exe next to this BAT, or add it to PATH.
    pause
    exit /b 1
  )
  set "CADDY=caddy.exe"
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepare_tunnel.ps1"
if errorlevel 1 (
  echo [ERROR] Setup failed. See the message above.
  pause
  exit /b 1
)

echo.
echo ================================================================
echo [SECURITY WARNING] Tailscale Funnel exposes these web pages PUBLICLY.
echo If ADMIN_PASSWORD_HASH is empty, Admin login stays admin / admin123.
echo Demo branch accounts may also still use password 123456.
echo Only continue with test data; change passwords before sharing links.
echo ================================================================
choice /C YN /M "Continue publishing Admin, CN01, CN02 despite the warning"
if errorlevel 2 (
  echo [INFO] Canceled. No public Funnel endpoints were started by this run.
  exit /b 1
)

docker compose -f docker-compose.yml -f docker-compose.tunnel.yml config --quiet
if errorlevel 1 (
  echo [ERROR] Docker Compose configuration is invalid.
  pause
  exit /b 1
)
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d db server cn01 cn02
if errorlevel 1 (
  echo [ERROR] Docker could not start the services.
  pause
  exit /b 1
)

"%CADDY%" validate --config "%~dp0Caddyfile"
if errorlevel 1 (
  echo [ERROR] Caddyfile is invalid.
  pause
  exit /b 1
)

tasklist /fi "IMAGENAME eq caddy.exe" | find /i "caddy.exe" >nul
if errorlevel 1 (
  start "SVF Caddy" /min "%CADDY%" run --config "%~dp0Caddyfile"
) else (
  "%CADDY%" reload --config "%~dp0Caddyfile"
  if errorlevel 1 (
    echo [ERROR] Caddy is running but its configuration could not be reloaded.
    pause
    exit /b 1
  )
)

echo Starting public HTTPS Funnels...
"%TS%" funnel --bg --https=443 http://127.0.0.1:9000
if errorlevel 1 goto fail
"%TS%" funnel --bg --https=8443 http://127.0.0.1:9001
if errorlevel 1 goto fail
"%TS%" funnel --bg --https=10000 http://127.0.0.1:9002
if errorlevel 1 goto fail
"%TS%" funnel status
echo.
echo [OK] Web tunnels configured. No browser or localhost URL was opened by this script.
echo Java TCP connections must use the private Tailscale IP:5000.
pause
exit /b 0

:fail
echo [ERROR] Funnel command failed. Log in to Tailscale, enable Funnel and HTTPS in the admin console, then retry.
pause
exit /b 1
