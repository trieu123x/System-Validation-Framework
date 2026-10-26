@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Doi email moi chi nhanh
cd /d "%~dp0" || goto FAILED

if not exist "docker-compose.yml" (
    echo [LOI] Khong tim thay docker-compose.yml.
    echo Hay dat DOI-EMAIL-CHI-NHANH.bat trong THU MUC GOC project.
    goto FAILED
)

where docker.exe >nul 2>nul
if errorlevel 1 (
    echo [LOI] Khong tim thay Docker. Hay cai Docker Desktop va mo lai.
    goto FAILED
)

where powershell.exe >nul 2>nul
if errorlevel 1 (
    echo [LOI] Khong tim thay Windows PowerShell.
    goto FAILED
)

docker info >nul 2>nul
if errorlevel 1 (
    echo [LOI] Docker Desktop chua chay.
    goto FAILED
)

docker compose version >nul 2>nul
if errorlevel 1 (
    echo [LOI] Docker Compose khong san sang.
    goto FAILED
)

docker compose exec -T db pg_isready -U postgres -d phan_phoi_hang >nul 2>nul
if errorlevel 1 (
    echo [LOI] PostgreSQL cua project chua san sang.
    echo Hay khoi dong project truoc khi doi email.
    goto FAILED
)

:MENU
echo.
echo ===============================================================
echo               DOI EMAIL CHO MOI CHI NHANH
echo ===============================================================
echo.
echo Danh sach chi nhanh dang co va email hien tai:
echo.
docker compose exec -T db psql -X -U postgres -d phan_phoi_hang -v ON_ERROR_STOP=1 -P pager=off -c "SELECT ma_cn, ten, COALESCE(email,'(chua co)') AS email FROM chi_nhanh WHERE NOT gia_lap ORDER BY ma_cn;"
if errorlevel 1 goto FAILED

echo.
set "BRANCH_CODE="
set /p "BRANCH_CODE=Nhap MA chi nhanh can doi (vi du CN01, CN02; Enter de thoat): "
if not defined BRANCH_CODE goto END

set "NEW_EMAIL="
set /p "NEW_EMAIL=Nhap EMAIL moi cua chi nhanh: "
if not defined NEW_EMAIL (
    echo [HUY] Chua nhap email, khong co thay doi.
    goto CONTINUE
)

echo.
echo [XAC NHAN] Chi cap nhat 1 chi nhanh ban vua chon.
choice /C YN /N /M "Ban co dong y cap nhat? [Y/N]: "
if errorlevel 2 (
    echo [HUY] Khong co thay doi.
    goto CONTINUE
)

echo.
echo [DANG CAP NHAT] Kiem tra ma chi nhanh va email ...
rem NEVER insert user input directly into SQL. Pass psql vars using PowerShell env.
powershell.exe -NoProfile -NonInteractive -Command ^
  "$cn=$env:BRANCH_CODE.Trim().ToUpperInvariant(); $email=$env:NEW_EMAIL.Trim(); if ($cn -notmatch '^[A-Z0-9_-]{1,10}$') { Write-Host '[LOI] Ma chi nhanh khong hop le.'; exit 2 }; if ($email.Length -gt 254 -or $email -notmatch '^[A-Za-z0-9._%%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$') { Write-Host '[LOI] Email khong hop le.'; exit 2 }; $q=[char]39; $sql='UPDATE chi_nhanh SET email = :'+$q+'new_email'+$q+' WHERE ma_cn = :'+$q+'branch_code'+$q+' AND NOT gia_lap RETURNING ma_cn, email;'; $lines=@($sql | & docker compose exec -T db psql -X -U postgres -d phan_phoi_hang -v ON_ERROR_STOP=1 -v ('branch_code='+$cn) -v ('new_email='+$email)); $exitCode=$LASTEXITCODE; $lines | ForEach-Object { Write-Host $_ }; if ($exitCode -ne 0) { exit $exitCode }; if (@($lines | Where-Object { $_ -match '^UPDATE 1$' }).Count -ne 1) { Write-Host '[LOI] Khong tim thay chi nhanh that voi ma nay. Database khong thay doi.'; exit 3 }; exit 0"
if errorlevel 1 goto UPDATE_FAILED

echo.
echo [OK] Da doi email thanh cong. Khong can restart Docker hay deploy lai.
echo [INFO] Email nhan thong bao duoc server doc lai khoang 30 giay/lan.
goto CONTINUE

:UPDATE_FAILED
echo.
echo [THAT BAI] Khong cap nhat email. Xem loi phia tren.

:CONTINUE
echo.
choice /C YN /N /M "Ban muon doi email cho chi nhanh khac? [Y/N]: "
if errorlevel 2 goto END
goto MENU

:FAILED
echo.
echo [THAT BAI] Chua thay doi email nao.

:END
echo.
echo Nhan phim bat ky de dong cua so.
pause >nul
endlocal
