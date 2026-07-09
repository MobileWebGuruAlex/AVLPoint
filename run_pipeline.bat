@echo off
REM AVLpoint Pipeline Launcher - Called by Windows Task Scheduler
REM This batch file launches the PowerShell runner in a hidden window

cd /d "C:\Projects\AVLpoint"
powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\Projects\AVLpoint\run_pipeline.ps1"
