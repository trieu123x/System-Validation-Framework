param([Parameter(Mandatory=$true)][string]$Tailscale)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $root '.env'
try {
  $json = & $Tailscale status --json | Out-String | ConvertFrom-Json
  $dns = [string]$json.Self.DNSName
  $dns = $dns.TrimEnd('.').ToLowerInvariant()
  if ($dns -notmatch '^[a-z0-9.-]+[.]ts[.]net$') { throw 'Tailscale DNSName unavailable. Enable MagicDNS, login, and retry.' }
  $values = @{
    TAILSCALE_ADMIN_ORIGIN = "https://$dns"
    TAILSCALE_CLIENT_ORIGIN = "https://${dns}:8443"
    PASSWORD_RESET_ADMIN_URL = "https://$dns/admin/"
    PASSWORD_RESET_CLIENT_URL = "https://${dns}:8443/branch/"
  }
  $lines = [System.Collections.Generic.List[string]]::new()
  foreach ($line in [System.IO.File]::ReadAllLines($envFile)) {
    if ($line -match '^(TAILSCALE_ADMIN_ORIGIN|TAILSCALE_CLIENT_ORIGIN|PASSWORD_RESET_ADMIN_URL|PASSWORD_RESET_CLIENT_URL)=') { continue }
    $lines.Add($line)
  }
  foreach ($k in @('TAILSCALE_ADMIN_ORIGIN','TAILSCALE_CLIENT_ORIGIN','PASSWORD_RESET_ADMIN_URL','PASSWORD_RESET_CLIENT_URL')) { $lines.Add("$k=$($values[$k])") }
  [System.IO.File]::WriteAllLines($envFile, $lines, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "Admin : https://$dns/admin/"
  Write-Host "Client: https://${dns}:8443/branch/"
} catch {
  Write-Error $_
  exit 1
}
