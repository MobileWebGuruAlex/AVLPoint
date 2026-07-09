# Setup Windows Task Scheduler for AVLpoint Pipeline
# Run this script as Administrator to create scheduled tasks

$ErrorActionPreference = "Stop"
$TaskFolder = "\AVLpoint"
$ProjectDir = "C:\Projects\AVLpoint"
$BatFile = "$ProjectDir\run_pipeline.bat"

# Remove existing tasks if present
$existingTasks = Get-ScheduledTask -TaskPath "$TaskFolder\" -ErrorAction SilentlyContinue
if ($existingTasks) {
    foreach ($t in $existingTasks) {
        Unregister-ScheduledTask -TaskName $t.TaskName -TaskPath $t.TaskPath -Confirm:$false
        Write-Host "Removed existing task: $($t.TaskName)"
    }
}

# Common settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -WakeToRun `
    -ExecutionTimeLimit (New-TimeSpan -Hours 5) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 10) `
    -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Highest

$action = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c `"$BatFile`"" `
    -WorkingDirectory $ProjectDir

# Schedule: Every 2 hours and at startup
$trigger1 = New-ScheduledTaskTrigger -Once -At "12:00AM" -RepetitionInterval (New-TimeSpan -Hours 2)
$trigger2 = New-ScheduledTaskTrigger -AtStartup

Register-ScheduledTask `
    -TaskName "PipelineRun" `
    -TaskPath $TaskFolder `
    -Action $action `
    -Trigger @($trigger1, $trigger2) `
    -Settings $settings `
    -Principal $principal `
    -Description "AVLpoint vendor discovery + enrichment pipeline. Runs every 2 hours." `
    -Force

# ── Daily Report Task ──
$reportAction = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ProjectDir\run_daily_report.ps1`"" `
    -WorkingDirectory $ProjectDir

$reportTrigger = New-ScheduledTaskTrigger -Daily -At "7:00AM"

$reportSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 5) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName "DailyReport" `
    -TaskPath $TaskFolder `
    -Action $reportAction `
    -Trigger $reportTrigger `
    -Settings $reportSettings `
    -Principal $principal `
    -Description "AVLpoint daily executive report. Generates HTML, PDF, PPTX reports at 7 AM." `
    -Force

Write-Host ""
Write-Host "=== AVLpoint Task Scheduler Setup Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Scheduled Tasks Created:" -ForegroundColor Cyan
Write-Host "  - PipelineRun:  Runs every 2 hours, 24/7"
Write-Host "  - DailyReport:  Runs daily at 7:00 AM"
Write-Host ""
Write-Host "Task Details:" -ForegroundColor Cyan
Write-Host "  - Folder: $TaskFolder"
Write-Host "  - Pipeline Script: $BatFile"
Write-Host "  - Report Script: $ProjectDir\run_daily_report.ps1"
Write-Host "  - Max Runtime: 5 hours (pipeline), 1 hour (report)"
Write-Host "  - Auto-restart on failure: 3 retries, 10min interval"
Write-Host "  - Runs even on battery power"
Write-Host "  - Starts if missed (e.g. computer was off)"
Write-Host ""
Write-Host "Logs: $ProjectDir\logs\" -ForegroundColor Cyan
Write-Host "Reports: $ProjectDir\reports\" -ForegroundColor Cyan
Write-Host ""

# Verify
foreach ($taskName in @("PipelineRun", "DailyReport")) {
    $task = Get-ScheduledTask -TaskName $taskName -TaskPath "$TaskFolder\" -ErrorAction SilentlyContinue
    if ($task) {
        Write-Host "Verification: $taskName registered successfully!" -ForegroundColor Green
        Write-Host "  State: $($task.State)"
        $info = $task | Get-ScheduledTaskInfo
        Write-Host "  Next Run: $($info.NextRunTime)"
    } else {
        Write-Host "ERROR: $taskName was not registered!" -ForegroundColor Red
    }
}
