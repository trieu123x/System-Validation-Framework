@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title SVF - Stop Public HTTPS Funnels

set "TS=tailscale.exe"
where tailscale.exe >nul 2>&1
if errorlevel 1 set "TS=%ProgramFiles%\Tailscale\tailscale.exe"
if not exist "%TS%" (
  where tailscale.exe >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] Tailscale executable not found.
    pause
    exit /b 1
  )
)

echo Turning off public HTTPS endpoints on 443, 8443 and 10000...
"%TS%" funnel --https=443 off
"%TS%" funnel --https=8443 off
"%TS%" funnel --https=10000 off
"%TS%" funnel status

echo.
echo [OK] Requests to disable the three public Funnel endpoints have been sent.
echo Docker containers and Tailscale private TCP connections are NOT stopped.
pause
