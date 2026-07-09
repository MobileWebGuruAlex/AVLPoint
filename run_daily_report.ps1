# AVLpoint Daily Executive Report Runner
# Designed for Windows Task Scheduler automation
# Runs the report generator, logs output, handles errors

$ErrorActionPreference = "Continue"
$ProjectDir = "C:\Projects\AVLpoint"
$Python = "$ProjectDir\venv\Scripts\python.exe"
$LogDir = "$ProjectDir\reports"

# Ensure UTF-8 for international vendor names
$env:PYTHONIOENCODING = "utf-8"

# Create log directory
if (!(Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

try {
    Write-Host "$timestamp | Starting daily report generation..."
    
    & $Python -m reporting.generate_report --no-email 2>&1 | Tee-Object -Variable reportOutput
    
    $exitCode = $LASTEXITCODE
    $timestamp2 = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    
    if ($exitCode -eq 0) {
        Write-Host "$timestamp2 | Daily report generated successfully."
    } else {
        Write-Host "$timestamp2 | Daily report failed with exit code: $exitCode"
    }
    
} catch {
    $timestamp2 = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "$timestamp2 | FATAL ERROR generating report: $_"
}
