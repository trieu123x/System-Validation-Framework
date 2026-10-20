@echo off
rem Chay server cong ty. Them tham so dang key=value de ghi de cau hinh, VD: tcp.port=6000
call "%~dp0_java.bat"
pushd "%ROOT%"
"%JAVA%" -jar server\target\server.jar %*
popd
