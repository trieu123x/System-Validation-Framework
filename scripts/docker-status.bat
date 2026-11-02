@echo off
setlocal
cd /d "%~dp0.."
docker compose ps
if errorlevel 1 exit /b 1
echo.
rem Read the published addresses so custom host ports are displayed correctly.
for /f "delims=" %%A in ('docker compose port server 8080 2^>nul') do echo Admin:  http://%%A/admin/
for /f "delims=" %%A in ('docker compose port client 8081 2^>nul') do echo Client: http://%%A/branch/
exit /b 0
