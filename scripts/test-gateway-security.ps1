param(
    [string]$AdminOrigin = "",
    [string]$ClientOrigin = ""
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envPath = Join-Path $root '.env'
if (Test-Path $envPath) {
    foreach ($line in Get-Content $envPath) {
        if ($line -match '^(TAILSCALE_ADMIN_ORIGIN|TAILSCALE_CLIENT_ORIGIN)=(.*)$') {
            $val = $Matches[2].Trim().Trim('"').Trim("'")
            if ($Matches[1] -eq 'TAILSCALE_ADMIN_ORIGIN' -and !$AdminOrigin) { $AdminOrigin = $val }
            if ($Matches[1] -eq 'TAILSCALE_CLIENT_ORIGIN' -and !$ClientOrigin) { $ClientOrigin = $val }
        }
    }
}
if (!$AdminOrigin) { $AdminOrigin = 'http://localhost:8080' }
if (!$ClientOrigin) { $ClientOrigin = 'http://localhost:8081' }
$AdminOrigin = $AdminOrigin.TrimEnd('/')
$ClientOrigin = $ClientOrigin.TrimEnd('/')
if (!(Get-Command curl.exe -ErrorAction SilentlyContinue)) {
    Write-Error 'curl.exe was not found; install curl or use Windows 10/11 built-in curl.exe'
    exit 2
}
$failed = 0
function AssertHttp([string]$Label, [string]$Expected, [string[]]$CurlArgs) {
    $code = & curl.exe -sS --connect-timeout 7 --max-time 15 -o NUL -w '%{http_code}' @CurlArgs
    $actual = (($code | Out-String).Trim())
    if ($LASTEXITCODE -ne 0) { $actual = "connection error ($actual)" }
    if ($actual -eq $Expected) {
        Write-Host "[PASS] $Label : $actual" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] $Label : got $actual, expected $Expected" -ForegroundColor Red
        $script:failed++
    }
}
Write-Host "Admin : $AdminOrigin"
Write-Host "Client: $ClientOrigin"
AssertHttp 'Experiment API disabled' '404' @("$AdminOrigin/api/experiment/runtime")
AssertHttp 'Foreign Origin denied before auth' '403' @('-H','Origin: https://evil.example','-X','POST',"$ClientOrigin/api/sale")
AssertHttp 'Unauthenticated request without Origin' '401' @('-X','POST',"$ClientOrigin/api/sale")
if ($failed -gt 0) {
    Write-Host 'If foreign Origin got 401, check the deployed image and forwarded Origin header.' -ForegroundColor Yellow
    exit 1
}
Write-Host 'All gateway security checks passed.' -ForegroundColor Green
exit 0
