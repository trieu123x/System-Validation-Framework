@echo off
rem Nang CSDL Toboki dang co: anh hang hoa, thong bao co phan hoi, mat hang moi TB29..TB31, CN01 Linh Nam.
rem KHONG xoa du lieu. Chay lai duoc.
rem Dung: migrate-thong-bao.bat [duong_dan_psql]   (mac dinh C:\Program Files\PostgreSQL\18\bin\psql.exe)
setlocal
set "ROOT=%~dp0.."
set "PSQL=%~1"
if "%PSQL%"=="" set "PSQL=C:\Program Files\PostgreSQL\18\bin\psql.exe"
set PGCLIENTENCODING=UTF8
"%PSQL%" -h 127.0.0.1 -U postgres -d phan_phoi_hang -v ON_ERROR_STOP=1 -q -f "%ROOT%\db\migrate_thong_bao.sql" || exit /b 1
echo Da nang cap CSDL. Khoi dong lai server.jar va client.jar.
