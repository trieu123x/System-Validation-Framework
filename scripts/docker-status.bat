@echo off
setlocal
cd /d "%~dp0.."
docker compose ps
echo.
echo Admin:  http://localhost:8080/admin/
echo Client: http://localhost:8081/branch/
