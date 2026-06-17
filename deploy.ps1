# LexiCoil deploy helper (Windows PowerShell)
# Run once: netlify login
# Then run: .\deploy.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host " LexiCoil deploy" -ForegroundColor Cyan
Write-Host " ==============" -ForegroundColor Cyan
Write-Host ""

$status = netlify status 2>&1 | Out-String
if ($status -match "Not logged in") {
  Write-Host "Netlify login required. A browser window will open..." -ForegroundColor Yellow
  netlify login
}

if (-not (Test-Path ".netlify\state.json")) {
  Write-Host "Linking new Netlify site (lexicoil)..." -ForegroundColor Yellow
  netlify init --manual
} else {
  Write-Host "Using existing Netlify site link." -ForegroundColor Green
}

Write-Host "Deploying to production..." -ForegroundColor Yellow
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'   # only if Netlify CLI hits TLS errors on your network
netlify deploy --prod --dir .

Write-Host ""
Write-Host "Done. Your live URL is shown above." -ForegroundColor Green
Write-Host ""
