# EcoPlate Build Script
Write-Host "========================================" -ForegroundColor Green
Write-Host "Building EcoPlate for Production" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir

Write-Host "`nInstalling backend dependencies..." -ForegroundColor Cyan
Set-Location "$rootDir\backend"
bun install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install backend dependencies" -ForegroundColor Red
    exit 1
}

Write-Host "`nInstalling frontend dependencies..." -ForegroundColor Cyan
Set-Location "$rootDir\frontend"
bun install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install frontend dependencies" -ForegroundColor Red
    exit 1
}

Write-Host "`nBuilding frontend..." -ForegroundColor Cyan
bun run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build frontend" -ForegroundColor Red
    exit 1
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Build complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Frontend built to: backend\public\" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start production server:"
Write-Host "  cd backend"
Write-Host "  bun run src/index.ts"
Write-Host "========================================" -ForegroundColor Green
