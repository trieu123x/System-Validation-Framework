@echo off
setlocal
cd /d "%~dp0.."
call mvn test
if errorlevel 1 exit /b 1
pushd ui
call npm ci
if errorlevel 1 exit /b 1
call npm run typecheck
if errorlevel 1 exit /b 1
call npm run build
if errorlevel 1 exit /b 1
popd
echo Tests and UI build passed.
