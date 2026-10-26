@echo off
rem Backward compatibility. Previously this enabled private Serve.
rem Public access is now handled by tailscale-funnel.bat.
call "%~dp0tailscale-funnel.bat" %*
exit /b %ERRORLEVEL%
