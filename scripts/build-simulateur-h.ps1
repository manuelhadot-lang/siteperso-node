# Build installateur Windows Simulateur H (NSIS + portable)
# Usage : .\scripts\build-simulateur-h.ps1
#         .\scripts\build-simulateur-h.ps1 -SetupOnly

param(
    [switch]$SetupOnly
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$AppDir = Join-Path $Root "SimulateurH"

Write-Host "=== Simulateur H — build Windows ===" -ForegroundColor Cyan

Write-Host "Préparation bundle arduino-cli (si nécessaire)..." -ForegroundColor Yellow
node (Join-Path $Root "scripts\prepare-arduino-bundle.cjs")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

node (Join-Path $Root "scripts\check-simulateur-h-prereqs.cjs")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Push-Location $AppDir
try {
    if (-not (Test-Path "node_modules")) {
        Write-Host "npm install (SimulateurH)..." -ForegroundColor Yellow
        npm install
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }

    if ($SetupOnly) {
        Write-Host "electron-builder (installateur NSIS uniquement)..." -ForegroundColor Yellow
        npm run dist:setup
    } else {
        Write-Host "electron-builder (NSIS + portable)..." -ForegroundColor Yellow
        npm run dist
    }
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host ""
    Write-Host "Terminé. Fichiers dans SimulateurH\dist-out\" -ForegroundColor Green
    Get-ChildItem (Join-Path $AppDir "dist-out") -Filter *.exe | ForEach-Object {
        $sizeMb = [math]::Round($_.Length / 1MB, 1)
        Write-Host "  -> $($_.FullName) (${sizeMb} MB)"
    }
} finally {
    Pop-Location
}
