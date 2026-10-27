@echo off
setlocal
cd /d "%~dp0.."
echo Applying additive PostgreSQL migration. Existing business data is preserved.
docker compose exec -T db psql -U postgres -d phan_phoi_hang -v ON_ERROR_STOP=1 -f /db/migrate_anti_scraping.sql
if errorlevel 1 exit /b 1
echo Migration completed. Run: docker compose up -d --build
