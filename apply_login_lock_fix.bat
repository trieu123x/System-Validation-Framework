@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title SVF - Update Admin Login Lock

if not exist "docker-compose.yml" (
  echo [ERROR] Place this BAT next to docker-compose.yml.
  pause
  exit /b 1
)
where docker.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Docker not found. Open Docker Desktop.
  pause
  exit /b 1
)

if exist "docker-compose.tunnel.yml" (
  echo [INFO] Tunnel compose detected - keeping existing Funnel and Caddy.
  docker compose -f docker-compose.yml -f docker-compose.tunnel.yml config -q
  if errorlevel 1 goto failed
  docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --no-deps --build server
  if errorlevel 1 goto failed
  docker compose -f docker-compose.yml -f docker-compose.tunnel.yml ps
) else (
  echo [INFO] Standard Docker Compose deployment.
  docker compose config -q
  if errorlevel 1 goto failed
  docker compose up -d --no-deps --build server
  if errorlevel 1 goto failed
  docker compose ps
)

echo.
echo [OK] Admin failed-login counters are now independent per browser.
echo [INFO] Existing CN01/CN02 containers and PostgreSQL volume were not removed.
echo [INFO] Admin sessions are reset when the Java Server restarts.
echo [INFO] Funnel HTTPS URLs and Caddy config are unchanged.
pause
exit /b 0

:failed
echo.
echo [ERROR] Deploy failed. Inspect Docker output above before retrying.
pause
exit /b 1
