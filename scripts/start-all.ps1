# EcoPlate Start All Script
Write-Host "========================================" -ForegroundColor Green
Write-Host "Starting EcoPlate (All Services)" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "`nStarting recommendation engine in new window..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-File", "$scriptDir\start-recommendation.ps1" -WindowStyle Normal

Write-Host "`nWaiting for recommendation engine to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 3

Write-Host "`nStarting backend server in new window..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-File", "$scriptDir\start-backend.ps1" -WindowStyle Normal

Write-Host "`nWaiting for backend to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 3

Write-Host "`nStarting frontend dev server in new window..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-File", "$scriptDir\start-frontend.ps1" -WindowStyle Normal

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "All servers are starting!" -ForegroundColor Green
Write-Host ""
Write-Host "Recommendation: http://localhost:5000" -ForegroundColor Magenta
Write-Host "Backend:        http://localhost:3000" -ForegroundColor Cyan
Write-Host "Frontend:       http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "Close the terminal windows to stop the servers,"
Write-Host "or run .\stop-all.ps1"
Write-Host "========================================" -ForegroundColor Green
