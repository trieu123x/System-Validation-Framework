@echo off
setlocal
cd /d "%~dp0.."
where tailscale >nul 2>nul
if errorlevel 1 (
  if exist "%ProgramFiles%\Tailscale\tailscale.exe" (
    set "TAILSCALE=%ProgramFiles%\Tailscale\tailscale.exe"
  ) else (
    echo [ERROR] Install and sign in to Tailscale, and put tailscale.exe in PATH.
    exit /b 1
  )
) else set "TAILSCALE=tailscale"
if not exist ".env" copy /Y ".env.example" ".env" >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0set-tailscale-host.ps1" -Tailscale "%TAILSCALE%"
if errorlevel 1 exit /b 1
echo [INFO] Recreate containers so allowed Host/Origin rules see the Tailscale URLs.
docker compose up -d --no-deps --force-recreate server client
if errorlevel 1 exit /b 1
"%TAILSCALE%" serve --bg --https=443 http://127.0.0.1:8080
if errorlevel 1 exit /b 1
"%TAILSCALE%" serve --bg --https=8443 http://127.0.0.1:8081
if errorlevel 1 exit /b 1
"%TAILSCALE%" serve status
echo [OK] Two URLs: admin on HTTPS 443; shared client on HTTPS 8443.
echo [NOTE] Requires Tailscale HTTPS enabled. Tailnet access rules still apply.
