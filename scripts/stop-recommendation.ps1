# EcoPlate Stop Recommendation Engine Script
Write-Host "Stopping Recommendation Engine..." -ForegroundColor Yellow

# Find and kill Python/Flask processes on port 5000
$processes = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | 
    Select-Object -ExpandProperty OwningProcess -Unique

if ($processes) {
    foreach ($pid in $processes) {
        $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "Stopping process: $($process.ProcessName) (PID: $pid)" -ForegroundColor Cyan
            Stop-Process -Id $pid -Force
        }
    }
    Write-Host "Recommendation Engine stopped." -ForegroundColor Green
} else {
    Write-Host "No Recommendation Engine process found on port 5000." -ForegroundColor Gray
}
