# EcoPlate Android Build Script
Write-Host "========================================" -ForegroundColor Green
Write-Host "Building EcoPlate for Android" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = "$scriptDir\..\frontend"

Set-Location $frontendDir

Write-Host "`nInstalling dependencies..." -ForegroundColor Cyan
bun install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install dependencies" -ForegroundColor Red
    exit 1
}

Write-Host "`nChecking for Android platform..." -ForegroundColor Cyan
if (-not (Test-Path "android")) {
    Write-Host "Adding Android platform..." -ForegroundColor Yellow
    bunx cap add android
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to add Android platform" -ForegroundColor Red
        exit 1
    }
}

Write-Host "`nBuilding frontend for mobile..." -ForegroundColor Cyan
bun run build:android
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build frontend" -ForegroundColor Red
    exit 1
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Android build complete!" -ForegroundColor Green
Write-Host ""
Write-Host "To open in Android Studio, run:" -ForegroundColor Cyan
Write-Host "  cd frontend && bunx cap open android"
Write-Host ""
Write-Host "Or open: frontend/android in Android Studio"
Write-Host ""
Write-Host "To build APK from command line:" -ForegroundColor Cyan
Write-Host "  cd frontend/android && ./gradlew assembleDebug"
Write-Host ""
Write-Host "APK will be at:" -ForegroundColor Gray
Write-Host "  frontend/android/app/build/outputs/apk/debug/app-debug.apk"
Write-Host "========================================" -ForegroundColor Green
