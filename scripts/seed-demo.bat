@echo off
rem Nap du lieu demo lon (15 chi nhanh, 30 mat hang, ~60 ngay lich su) vao phan_phoi_hang.
rem CANH BAO: xoa toan bo yeu cau, phieu nhap/xuat, ban hang, dieu chuyen, nhat ky, tin cho hien co.
rem Dung: seed-demo.bat [duong_dan_psql]   (mac dinh C:\Program Files\PostgreSQL\18\bin\psql.exe)
setlocal
set "ROOT=%~dp0.."
set "PSQL=%~1"
if "%PSQL%"=="" set "PSQL=C:\Program Files\PostgreSQL\18\bin\psql.exe"
set PGCLIENTENCODING=UTF8
"%PSQL%" -h 127.0.0.1 -U postgres -d phan_phoi_hang -v ON_ERROR_STOP=1 -q -f "%ROOT%\db\seed_demo.sql" || exit /b 1
echo Da nap du lieu demo. Khoi dong lai server.jar va client.jar de nap lai trang thai.
