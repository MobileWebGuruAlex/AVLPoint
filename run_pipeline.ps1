# AVLpoint.com Pipeline Runner
# Designed for Windows Task Scheduler automation
# Runs discovery + enrichment, logs output, handles crashes

$ErrorActionPreference = "Continue"
$ProjectDir = "C:\Projects\AVLpoint"
$Python = "$ProjectDir\venv\Scripts\python.exe"
$LogDir = "$ProjectDir\logs"
$LockFile = "$ProjectDir\.pipeline.lock"

# Ensure Python subprocesses use UTF-8 for stdout/stderr (prevents cp1252 crashes on international vendor names)
$env:PYTHONIOENCODING = "utf-8"


# 75/25 Capacity Split
$EnrichMinutes = 85      # 75% dedicated exclusively to deep enrichment of the priority queue
$DiscoveryMinutes = 28    # 25% dedicated to finding new vendors to keep the pipeline growing

# Create log directory
if (!(Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = "$LogDir\pipeline_$timestamp.log"

function Write-Log {
    param([string]$msg)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$ts | $msg" | Tee-Object -FilePath $logFile -Append
}

# Check lock file (prevent overlapping runs)
if (Test-Path $LockFile) {
    try {
        $lockContent = Get-Content $LockFile -ErrorAction Stop
        if ($lockContent) {
            $lockPid = [int]$lockContent
            $proc = Get-Process -Id $lockPid -ErrorAction SilentlyContinue
            if ($proc -and ($proc.ProcessName -match "python|powershell|pwsh|cmd")) {
                Write-Log "Pipeline already running (PID $lockPid, Name: $($proc.ProcessName)). Exiting."
                exit 0
            }
            Write-Log "Stale lock file found (PID $lockPid). Removing."
        }
    } catch {
        Write-Log "Error reading lock file or lock file empty. Removing."
    }
    Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
}

# Write lock file
$PID | Out-File $LockFile -Force

try {
    Write-Log "=== AVLpoint.com Pipeline Starting ==="
    Write-Log "Log: $logFile"
    Write-Log "Capacity Split: $EnrichMinutes min Enrichment / $DiscoveryMinutes min Discovery"
    
    # Phase 0: Database Backup
    Write-Log "Phase 0: Backing up Database"
    & $Python "$ProjectDir\backup_manager_v2.py" *>&1 | Out-File -FilePath $logFile -Append

    # Phase 1: 75% Capacity -> Dedicated Enrichment of Highest Priority Queue
    Write-Log "Phase 1: Dedicated Enrichment ($EnrichMinutes mins)"
    $startTime = Get-Date
    
    $enrichArgs = @(
        "$ProjectDir\pipeline_v2.py",
        "--enrich-only",
        "--enrich-cap", "0",
        "--max-runtime", "80"
    )
    
    $proc = Start-Process -FilePath $Python -ArgumentList $enrichArgs `
        -WorkingDirectory $ProjectDir `
        -RedirectStandardOutput "$LogDir\enrich_stdout_$timestamp.log" `
        -RedirectStandardError "$LogDir\enrich_stderr_$timestamp.log" `
        -NoNewWindow -PassThru
    
    $timeoutMs = $EnrichMinutes * 60 * 1000
    $exited = $proc.WaitForExit($timeoutMs)
    
    if (!$exited) {
        Write-Log "Enrichment phase reached $EnrichMinutes minute capacity limit. Gracefully stopping."
        $proc.Kill()
        Start-Sleep -Seconds 5
    }
    
    $elapsed = ((Get-Date) - $startTime).TotalMinutes
    Write-Log "Phase 1 completed. Exit code: $($proc.ExitCode), Duration: $([math]::Round($elapsed, 1)) min"
    
    # Phase 2: 25% Capacity -> Discovery + Concurrent Enrichment
    Write-Log "Phase 2: Discovery sweep ($DiscoveryMinutes mins)"
    $startTime2 = Get-Date
    
    $pipelineArgs = @(
        "$ProjectDir\pipeline_v2.py",
        "--enrich-cap", "0",
        "--once",
        "--max-runtime", "26"
    )
    
    $proc2 = Start-Process -FilePath $Python -ArgumentList $pipelineArgs `
        -WorkingDirectory $ProjectDir `
        -RedirectStandardOutput "$LogDir\pipeline_stdout_$timestamp.log" `
        -RedirectStandardError "$LogDir\pipeline_stderr_$timestamp.log" `
        -NoNewWindow -PassThru
    
    $timeoutMs2 = $DiscoveryMinutes * 60 * 1000
    $exited2 = $proc2.WaitForExit($timeoutMs2)
    
    if (!$exited2) {
        Write-Log "Discovery phase reached $DiscoveryMinutes minute capacity limit. Gracefully stopping."
        $proc2.Kill()
        Start-Sleep -Seconds 5
    }
    
    $elapsed2 = ((Get-Date) - $startTime2).TotalMinutes
    Write-Log "Phase 2 completed. Exit code: $($proc2.ExitCode), Duration: $([math]::Round($elapsed2, 1)) min"
    
    # Phase 3: Get stats
    Write-Log "Phase 3: Database stats"
    $statsOutput = & $Python "$ProjectDir\quick_stats.py" 2>&1
    Write-Log "Stats: $statsOutput"
    
    # Phase 4: AgentWiki Publishing
    Write-Log "Phase 4: AgentWiki Sync"
    $syncOutput = & $Python "$ProjectDir\agentwiki_sync.py" 2>&1
    Write-Log "AgentWiki Sync: $syncOutput"
    
    # Cleanup old logs (keep last 30 days)
    Get-ChildItem "$LogDir\*.log" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force
    
    Write-Log "=== Pipeline Run Complete ==="
    
} catch {
    Write-Log "FATAL ERROR: $_"
} finally {
    # Remove lock file
    Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
}
