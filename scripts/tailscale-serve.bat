@echo off
rem Private tailnet TCP 5000. Public web gateways are managed by tailscale-funnel.bat.
call "%~dp0tailscale-tcp.bat" %*
exit /b %ERRORLEVEL%
