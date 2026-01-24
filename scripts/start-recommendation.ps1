# EcoPlate Start Recommendation Engine Script
Write-Host "========================================" -ForegroundColor Green
Write-Host "Starting Recommendation Engine (Flask)" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$recommendationDir = Join-Path $projectRoot "recommendation-engine"

Set-Location $recommendationDir

# Check if virtual environment exists
$venvPath = Join-Path $recommendationDir "venv"
if (-not (Test-Path $venvPath)) {
    Write-Host "`nCreating virtual environment..." -ForegroundColor Yellow
    python -m venv venv
}

# Activate virtual environment
Write-Host "`nActivating virtual environment..." -ForegroundColor Cyan
& "$venvPath\Scripts\Activate.ps1"

# Install dependencies
Write-Host "`nInstalling dependencies..." -ForegroundColor Cyan
pip install -r requirements.txt --quiet

# Start the Flask server
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Recommendation Engine running at:" -ForegroundColor Green
Write-Host "http://localhost:5000" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

$env:FLASK_ENV = "development"
$env:PORT = "5000"
python app.py
