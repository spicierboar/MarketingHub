# Start Command Centre Next.js on port 3002 (detached, survives closing this window)
# Double-click or: powershell -ExecutionPolicy Bypass -File scripts\dev-3002.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
if (-not $PSScriptRoot) { $Root = "F:\MarketingHub\command-centre"; $PSScriptRoot = Join-Path $Root "scripts" }
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root

$log = Join-Path $Root ".next-dev-3002.log"
$port = 3002

# Free port 3002 if something stale is bound
Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
  $opid = $_.OwningProcess
  if ($opid -and $opid -ne 0) {
    Write-Host "Stopping PID $opid on port $port..."
    Stop-Process -Id $opid -Force -ErrorAction SilentlyContinue
  }
}

$envBlock = @"
`$env:CC_LOCAL_DEMO='true'
`$env:NEXT_PUBLIC_CC_LOCAL_DEMO='true'
Set-Location '$Root'
& npm run dev -- -p $port *>> '$log' 2>&1
"@

$wrapper = Join-Path $env:TEMP "cc-dev-3002-runner.ps1"
Set-Content -Path $wrapper -Value $envBlock -Encoding UTF8

if (Test-Path $log) { Remove-Item $log -Force -ErrorAction SilentlyContinue }

$proc = Start-Process -FilePath "powershell.exe" `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $wrapper) `
  -WorkingDirectory $Root `
  -WindowStyle Hidden `
  -PassThru

Write-Host "Started detached Next.js (wrapper PID $($proc.Id)). Log: $log"
Write-Host "Open: http://127.0.0.1:3002/login"
