# Monitor both gateway TCP and browser-heartbeat events from one PowerShell window.
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$compose = Join-Path $root 'docker-compose.yml'
if (-not (Test-Path $compose)) { Write-Error "Missing $compose"; exit 1 }

docker compose --project-directory $root -f $compose logs -f -t --tail 80 server client 2>&1 | ForEach-Object {
    $line = "$_"
    switch -Regex ($line) {
        'BROWSER_OFFLINE|PONG_TIMEOUT|CONNECTION_LOST' { Write-Host $line -ForegroundColor Red; break }
        'BROWSER_RECONNECTED|BROWSER_CONNECTED|RECONNECTED' { Write-Host $line -ForegroundColor Green; break }
        '\[NETWORK\]' { Write-Host $line -ForegroundColor Cyan; break }
        '\[AUDIT\]' { Write-Host $line -ForegroundColor White; break }
        'SCRAPING|SECURITY' { Write-Host $line -ForegroundColor Magenta; break }
        'EMAIL' { Write-Host $line -ForegroundColor Yellow; break }
        default { }
    }
}
