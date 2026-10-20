@echo off
rem Chay ung dung chi nhanh. Nhieu chi nhanh tren 1 may: run-client.bat http.port=8082
call "%~dp0_java.bat"
pushd "%ROOT%"
"%JAVA%" -jar client\target\client.jar %*
popd
