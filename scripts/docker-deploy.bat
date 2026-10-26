@echo off
setlocal
cd /d "%~dp0.."
where docker >nul 2>nul || (echo [ERROR] Install Docker Desktop. & exit /b 1)
docker info >nul 2>nul || (echo [ERROR] Start Docker Engine. & exit /b 1)
if not exist ".env" (
  copy /Y ".env.example" ".env" >nul
  echo [INFO] Created .env. SMTP is disabled until you configure it.
)
set "COMPOSE_PROJECT_NAME=phanphoi"
echo [STEP 1] Start PostgreSQL...
docker compose up -d --wait db
if errorlevel 1 exit /b 1
echo [STEP 2] Migrate emails in existing database without deleting data...
docker compose exec -T db psql -U postgres -d phan_phoi_hang -v ON_ERROR_STOP=1 -f /db/migrate_branch_emails.sql
if errorlevel 1 exit /b 1
docker compose exec -T db psql -U postgres -d phan_phoi_hang -v ON_ERROR_STOP=1 -f /db/migrate_anti_scraping.sql
if errorlevel 1 exit /b 1
docker compose exec -T db psql -U postgres -d phan_phoi_hang -v ON_ERROR_STOP=1 -f /db/migrate_password_recovery.sql
if errorlevel 1 exit /b 1
echo [STEP 3] Build and start server and shared client...
docker compose up -d --build --remove-orphans server client
if errorlevel 1 exit /b 1
call "%~dp0docker-status.bat"
echo.
echo Admin  http://localhost:8080/admin/
echo Client http://localhost:8081/branch/ (all branches)
echo NOTE: configure real SMTP in .env and run this file again.
