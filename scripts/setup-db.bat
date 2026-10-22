@echo off
rem Tao database phan_phoi_hang va nap du lieu mau. Can psql (PostgreSQL) tren may.
rem Dung: setup-db.bat [duong_dan_psql]   (mac dinh C:\Program Files\PostgreSQL\18\bin\psql.exe)
setlocal
set "ROOT=%~dp0.."
set "PSQL=%~1"
if "%PSQL%"=="" set "PSQL=C:\Program Files\PostgreSQL\18\bin\psql.exe"
set PGCLIENTENCODING=UTF8
"%PSQL%" -h 127.0.0.1 -U postgres -c "CREATE DATABASE phan_phoi_hang ENCODING 'UTF8' TEMPLATE template0" || exit /b 1
"%PSQL%" -h 127.0.0.1 -U postgres -d phan_phoi_hang -v ON_ERROR_STOP=1 -q -f "%ROOT%\db\schema.sql" -f "%ROOT%\db\seed.sql" -f "%ROOT%\db\seed_loadsim.sql" -f "%ROOT%\db\seed_hang_moi.sql" -f "%ROOT%\db\seed_images.sql" || exit /b 1
echo Da tao database phan_phoi_hang
