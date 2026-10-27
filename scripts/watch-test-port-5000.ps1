param(
    [Parameter(Mandatory = $true)][int]$ParentPid,
    [Parameter(Mandatory = $true)][long]$ParentStartUtcTicks,
    [Parameter(Mandatory = $true)][string]$RootDirectory,
    [Parameter(Mandatory = $true)][string]$FrpcStateFile
)
$ErrorActionPreference = 'SilentlyContinue'

# Independent watchdog: closing the BAT window with X may skip the main finally block.
while ($true) {
    $parent = Get-Process -Id $ParentPid -ErrorAction SilentlyContinue
    if ($null -eq $parent) { break }
    if ($parent.StartTime.ToUniversalTime().Ticks -ne $ParentStartUtcTicks) { break }
    Start-Sleep -Seconds 2
}

# Only stop the FRP process started by this test run (PID + creation time).
if (Test-Path -LiteralPath $FrpcStateFile) {
    $lines = @(Get-Content -LiteralPath $FrpcStateFile -ErrorAction SilentlyContinue)
    if ($lines.Count -ge 2) {
        $targetProcessId = 0
        $frpcStart = 0L
        if ([int]::TryParse($lines[0], [ref]$targetProcessId) -and [long]::TryParse($lines[1], [ref]$frpcStart)) {
            $frpc = Get-Process -Id $targetProcessId -ErrorAction SilentlyContinue
            if ($null -ne $frpc -and $frpc.StartTime.ToUniversalTime().Ticks -eq $frpcStart) {
                Stop-Process -Id $targetProcessId -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

$env:ADMIN_HTTP_PORT = '18080'
$env:CLIENT_HTTP_PORT = '18081'
$env:DB_HOST_PORT = '15433'
$env:COMPOSE_PROJECT_NAME = 'svf-test5000'
& docker compose -p svf-test5000 -f (Join-Path $RootDirectory 'docker-compose.yml') -f (Join-Path $RootDirectory 'docker-compose.test5000.yml') down --remove-orphans *> $null
Remove-Item -LiteralPath $FrpcStateFile -Force -ErrorAction SilentlyContinue
