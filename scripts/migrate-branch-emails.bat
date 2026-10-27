@echo off
setlocal
cd /d "%~dp0.."
docker compose up -d --wait db || exit /b 1
docker compose exec -T db psql -U postgres -d phan_phoi_hang -v ON_ERROR_STOP=1 -f /db/migrate_branch_emails.sql
if errorlevel 1 exit /b 1
echo Migrations complete. Change recipients with UPDATE chi_nhanh SET email=... in PostgreSQL.

docker compose exec -T db psql -U postgres -d phan_phoi_hang -v ON_ERROR_STOP=1 -f /db/migrate_password_recovery.sql || exit /b 1
