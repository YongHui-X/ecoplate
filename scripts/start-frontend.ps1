# EcoPlate Frontend Start Script
Write-Host "========================================" -ForegroundColor Green
Write-Host "Starting EcoPlate Frontend Dev Server" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$scriptDir\..\frontend"

Write-Host "`nInstalling dependencies..." -ForegroundColor Cyan
bun install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install dependencies" -ForegroundColor Red
    exit 1
}

Write-Host "`nStarting frontend dev server on http://localhost:5173" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server`n" -ForegroundColor Gray

bun run dev
