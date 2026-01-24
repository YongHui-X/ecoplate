# EcoPlate Stop All Script
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "Stopping All EcoPlate Servers" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

& "$scriptDir\stop-backend.ps1"
& "$scriptDir\stop-frontend.ps1"
& "$scriptDir\stop-recommendation.ps1"

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "All servers stopped." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
