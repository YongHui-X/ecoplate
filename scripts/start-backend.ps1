# EcoPlate Backend Start Script
Write-Host "========================================" -ForegroundColor Green
Write-Host "Starting EcoPlate Backend Server" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$scriptDir\..\backend"

Write-Host "`nInstalling dependencies..." -ForegroundColor Cyan
bun install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install dependencies" -ForegroundColor Red
    exit 1
}

Write-Host "`nRunning database migrations..." -ForegroundColor Cyan
bun run src/db/migrate.ts
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Migration failed, continuing anyway..." -ForegroundColor Yellow
}

Write-Host "`nSeeding database..." -ForegroundColor Cyan
bun run src/db/seed.ts
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Seeding failed, continuing anyway..." -ForegroundColor Yellow
}

Write-Host "`nStarting backend server on http://localhost:3000" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server`n" -ForegroundColor Gray

bun run src/index.ts
