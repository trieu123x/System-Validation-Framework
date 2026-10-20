@echo off
rem Log demo: CSDL ban dau -> 1000 chi nhanh gui yeu cau (tinh trang mang) -> server xu ly -> CSDL sau xu ly.
rem Mac dinh la gia lap (chi can Node.js). Them --real de chay voi server.jar va PostgreSQL that.
rem Dung: sim-log.bat [--clients=1000] [--speed=1] [--log=file.log] [--real [--start-server]] ... (xem --help)
setlocal
chcp 65001 >nul
node "%~dp0sim-log.js" %*
