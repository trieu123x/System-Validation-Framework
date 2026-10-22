@echo off
rem Chuyen CSDL phan_phoi_hang dang co sang hang Toboki (TB01..TB28), danh muc, gia, cong no.
rem CANH BAO: XOA toan bo giao dich (yeu cau, phieu nhap/xuat, ban hang, dieu chuyen, nhat ky, tin cho, cong no),
rem kho tong, kho chi nhanh va mat hang cu. Giu tai khoan chi nhanh.
rem Dung: migrate-db.bat [duong_dan_psql]   (mac dinh C:\Program Files\PostgreSQL\18\bin\psql.exe)
setlocal
set "ROOT=%~dp0.."
set "PSQL=%~1"
if "%PSQL%"=="" set "PSQL=C:\Program Files\PostgreSQL\18\bin\psql.exe"
set PGCLIENTENCODING=UTF8
"%PSQL%" -h 127.0.0.1 -U postgres -d phan_phoi_hang -v ON_ERROR_STOP=1 -q -f "%ROOT%\db\migrate_toboki.sql" || exit /b 1
echo Da chuyen CSDL sang hang Toboki. Chay seed-demo.bat neu can du lieu demo, roi khoi dong lai server.jar va client.jar.
