# EcoPlate Frontend Stop Script
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "Stopping EcoPlate Frontend Dev Server" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

Write-Host "`nFinding frontend processes on port 5173..." -ForegroundColor Cyan

# Find and kill process on port 5173
$connections = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if ($connections) {
    foreach ($conn in $connections) {
        $processId = $conn.OwningProcess
        Write-Host "Killing process $processId" -ForegroundColor Yellow
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
}

# Also kill any node/vite processes
$viteProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*vite*"
}
foreach ($proc in $viteProcesses) {
    Write-Host "Killing vite process $($proc.Id)" -ForegroundColor Yellow
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}

Write-Host "`nFrontend dev server stopped." -ForegroundColor Green
