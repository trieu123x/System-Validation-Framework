@echo off
setlocal
cd /d "%~dp0.."
set "SERVICE=%~1"
if "%SERVICE%"=="" set "SERVICE=server"
docker compose logs -f --tail=120 "%SERVICE%"
