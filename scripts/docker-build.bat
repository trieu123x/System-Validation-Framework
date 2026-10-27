@echo off
setlocal
cd /d "%~dp0.."
where docker >nul 2>nul || (echo [ERROR] Please install Docker Desktop. & exit /b 1)
docker info >nul 2>nul || (echo [ERROR] Docker Engine is not running. & exit /b 1)
if not exist ".env" copy /Y ".env.example" ".env" >nul
set "COMPOSE_PROJECT_NAME=phanphoi"
docker compose build server client
if errorlevel 1 (echo [ERROR] Docker build failed. & exit /b 1)
echo [OK] Image ready. Next: scripts\docker-deploy.bat
