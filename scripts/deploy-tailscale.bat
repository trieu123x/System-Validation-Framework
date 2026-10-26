@echo off
setlocal
cd /d "%~dp0.."
call "%~dp0docker-deploy.bat"
if errorlevel 1 exit /b 1
call "%~dp0tailscale-serve.bat"
if errorlevel 1 exit /b 1
