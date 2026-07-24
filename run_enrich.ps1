# AVLpoint — Enrich-Only Runner (scheduled every 2 hours)
# Enriches ONLY awake, curated vendors with the comprehensive Anthropic-powered
# profile. Discovery is intentionally skipped. Hard credit caps come from .env
# (SESSION_CREDIT_LIMIT_USD, PER_COMPANY_SPEND_LIMIT_USD); --enrich-cap bounds
# how many vendors are attempted per run.
#
# To STOP the recurring runs:  Unregister-ScheduledTask -TaskName "EnrichOnly" -TaskPath "\AVLpoint\" -Confirm:$false
# To run once by hand:         powershell -File C:\Projects\AVLpoint\run_enrich.ps1

$ErrorActionPreference = "Continue"
$ProjectDir = "C:\Projects\AVLpoint"
$Python     = "$ProjectDir\venv\Scripts\python.exe"
$LogDir     = "$ProjectDir\logs"
$LockFile   = "$ProjectDir\.enrich.lock"
$EnrichCap  = 50   # max vendors attempted per run; $5 session ceiling is the hard backstop

$env:PYTHONIOENCODING = "utf-8"
if (!(Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
$stamp   = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = "$LogDir\enrich_$stamp.log"

# Prevent overlapping runs (a slow run must not stack on the next trigger).
if (Test-Path $LockFile) {
    try {
        $lockPid = [int](Get-Content $LockFile -ErrorAction Stop)
        $proc = Get-Process -Id $lockPid -ErrorAction SilentlyContinue
        if ($proc) { "Enrich already running (PID $lockPid). Exiting." | Out-File $logFile; exit 0 }
    } catch {}
}
$PID | Out-File $LockFile -Force

try {
    Set-Location $ProjectDir
    & $Python "$ProjectDir\pipeline_v2.py" --enrich-only --enrich-cap $EnrichCap *>> $logFile
} finally {
    Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
}
