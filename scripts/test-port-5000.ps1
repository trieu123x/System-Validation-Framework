# SVF test launcher: Docker + FRP client. Run via the existing test-port-5000.bat.
# No firewall elevation or project source changes are required.
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $root

$env:ADMIN_HTTP_PORT = '18080'
$env:CLIENT_HTTP_PORT = '18081'
$env:DB_HOST_PORT = '15433'
$env:COMPOSE_PROJECT_NAME = 'svf-test5000'
$composeFiles = @('-p', 'svf-test5000', '-f', (Join-Path $root 'docker-compose.yml'), '-f', (Join-Path $root 'docker-compose.test5000.yml'))

# FRP is kept OUTSIDE the project. Optionally override the folder via FRP_HOME.
$frpHome = if ($env:FRP_HOME) { $env:FRP_HOME } else { 'D:\FRP' }
$frpcExe = Join-Path $frpHome 'frpc.exe'
$frpcConfig = Join-Path $frpHome 'frpc.toml'
$stateFile = Join-Path $env:TEMP ('svf-test5000-' + [guid]::NewGuid().ToString('N') + '.state')
$frpcProcess = $null
$frpcStartTicks = 0L

function Invoke-Compose {
    & docker compose @composeFiles @args
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed (exit code $LASTEXITCODE)." }
}

function Stop-OwnFrpc {
    if ($null -eq $frpcProcess) { return }
    $p = Get-Process -Id $frpcProcess.Id -ErrorAction SilentlyContinue
    if ($null -eq $p) { return }
    try {
        if ($p.StartTime.ToUniversalTime().Ticks -eq $frpcStartTicks) {
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        }
    } catch { }
}

try {
    $Host.UI.RawUI.WindowTitle = 'SVF Docker + AWS FRP - close to stop test'

    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is not installed or is missing from PATH.' }
    & docker info *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not running.' }
    if (-not (Test-Path -LiteralPath $frpcExe -PathType Leaf)) { throw "FRP client not found: $frpcExe" }
    if (-not (Test-Path -LiteralPath $frpcConfig -PathType Leaf)) { throw "FRP configuration not found: $frpcConfig" }
    if (-not (Test-Path -LiteralPath 'config/server.properties' -PathType Leaf)) { throw 'Missing config/server.properties.' }
    if (-not (Test-Path -LiteralPath '.env' -PathType Leaf)) {
        if (-not (Test-Path -LiteralPath '.env.example' -PathType Leaf)) { throw 'Missing both .env and .env.example.' }
        Copy-Item -LiteralPath '.env.example' -Destination '.env'
        Write-Host '[INFO] Created .env from .env.example.'
    }

    # The separate watcher is needed because clicking X can bypass PowerShell finally.
    # Reuse the existing watcher file; do not add any additional project scripts.
    $watcherScript = Join-Path $PSScriptRoot 'watch-test-port-5000.ps1'
    if (-not (Test-Path -LiteralPath $watcherScript -PathType Leaf)) { throw "Missing watcher: $watcherScript" }
    Set-Content -LiteralPath $stateFile -Value '' -Encoding ASCII
    $watchArgs = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $watcherScript + '"'),
        '-ParentPid', [string]$PID,
        '-ParentStartUtcTicks', [string](Get-Process -Id $PID).StartTime.ToUniversalTime().Ticks,
        '-RootDirectory', ('"' + $root + '"'),
        '-FrpcStateFile', ('"' + $stateFile + '"')
    )
    $watcher = Start-Process -FilePath 'powershell.exe' -ArgumentList $watchArgs -WindowStyle Hidden -PassThru
    if ($null -eq $watcher -or $watcher.HasExited) { throw 'Could not launch cleanup watcher.' }

    Write-Host '[1/4] Starting isolated database...' -ForegroundColor Cyan
    Invoke-Compose up -d --wait db

    Write-Host '[2/4] Applying database migrations...' -ForegroundColor Cyan
    foreach ($sql in @('migrate_branch_emails.sql', 'migrate_anti_scraping.sql', 'migrate_password_recovery.sql')) {
        Invoke-Compose exec -T db psql -U postgres -d phan_phoi_hang -v ON_ERROR_STOP=1 -f "/db/$sql"
    }

    Write-Host '[3/4] Building and starting server/client...' -ForegroundColor Cyan
    Invoke-Compose up -d --build --wait server client
    $tcp = Test-NetConnection 127.0.0.1 -Port 5000 -WarningAction SilentlyContinue -InformationLevel Quiet
    if (-not $tcp) { throw 'Docker TCP port 5000 is not reachable locally.' }

    Write-Host '[4/4] Starting FRP client...' -ForegroundColor Cyan
    # The watcher gets the exact PID/start time so it never stops an unrelated FRP process.
    $frpcProcess = Start-Process -FilePath $frpcExe -ArgumentList @('-c', ('"' + $frpcConfig + '"')) -NoNewWindow -PassThru
    if ($null -eq $frpcProcess) { throw 'Could not start frpc.exe.' }
    $frpcStartTicks = (Get-Process -Id $frpcProcess.Id).StartTime.ToUniversalTime().Ticks
    Set-Content -LiteralPath $stateFile -Value @([string]$frpcProcess.Id, [string]$frpcStartTicks) -Encoding ASCII
    Start-Sleep -Seconds 2
    if ($frpcProcess.HasExited) { throw "frpc.exe exited unexpectedly (exit code $($frpcProcess.ExitCode))." }

    Write-Host ''
    Write-Host '=============================================================' -ForegroundColor Green
    Write-Host '  SVF TEST RUNNING: Docker + AWS FRP' -ForegroundColor Green
    Write-Host '  Local TCP : 127.0.0.1:5000 (not directly public)' -ForegroundColor Green
    Write-Host '  Public TCP: <EC2-PUBLIC-IP>:5000 (when FRP proxy is online)'
    Write-Host '  Admin     : http://localhost:18080/admin/'
    Write-Host '  Client    : http://localhost:18081/branch/'
    Write-Host '  Config    : config/server.properties (unchanged)'
    Write-Host '=============================================================' -ForegroundColor Green
    Write-Host 'Press ENTER or close this window to stop FRP + the test containers.'
    [void](Read-Host)
}
catch {
    Write-Host ('[ERROR] ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Press ENTER to finish cleanup.' -ForegroundColor Yellow
    [void](Read-Host)
}
finally {
    Write-Host '[CLEANUP] Stopping this test FRP client...' -ForegroundColor Yellow
    Stop-OwnFrpc
    Write-Host '[CLEANUP] Stopping isolated Docker test containers...' -ForegroundColor Yellow
    & docker compose @composeFiles down --remove-orphans
    Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
    Write-Host '[CLEANUP] Done. The existing Discord bot and PostgreSQL test volume are left intact.' -ForegroundColor Green
}
