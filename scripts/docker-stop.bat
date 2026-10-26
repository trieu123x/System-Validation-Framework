@echo off
setlocal
cd /d "%~dp0.."
rem Never delete PostgreSQL volumes.
docker compose stop
