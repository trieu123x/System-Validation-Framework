@echo off
rem Build giao dien Next.js va 4 module Java
setlocal
set "ROOT=%~dp0.."
for /d %%d in ("%ROOT%\tools\jdk-17*") do set "JAVA_HOME=%%d"
set "MVN=mvn"
if exist "%ROOT%\tools\apache-maven-3.9.9\bin\mvn.cmd" set "MVN=%ROOT%\tools\apache-maven-3.9.9\bin\mvn.cmd"
pushd "%ROOT%\ui" || exit /b 1
call npm install --no-audit --no-fund || exit /b 1
call npm run build || exit /b 1
popd
pushd "%ROOT%"
call "%MVN%" -q package || exit /b 1
popd
echo Build xong: server\target\server.jar, client\target\client.jar, loadsim\target\loadsim.jar
