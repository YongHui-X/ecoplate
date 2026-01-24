# EcoPlate Backend Stop Script
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "Stopping EcoPlate Backend Server" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

Write-Host "`nFinding backend processes on port 3000..." -ForegroundColor Cyan

# Find and kill process on port 3000
$connections = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($connections) {
    foreach ($conn in $connections) {
        $processId = $conn.OwningProcess
        Write-Host "Killing process $processId" -ForegroundColor Yellow
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
}

# Also kill any bun processes running index.ts
$bunProcesses = Get-Process -Name "bun" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*index.ts*"
}
foreach ($proc in $bunProcesses) {
    Write-Host "Killing bun process $($proc.Id)" -ForegroundColor Yellow
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}

Write-Host "`nBackend server stopped." -ForegroundColor Green
