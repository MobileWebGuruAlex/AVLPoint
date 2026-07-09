@echo off
REM AVLpoint.com pipeline — entry point for the Windows Scheduled Task.
REM Forwards execution to the PowerShell script to enforce lock management and timeouts.

cd /d "C:\Projects\AVLpoint"
powershell -ExecutionPolicy Bypass -File "C:\Projects\AVLpoint\run_pipeline.ps1"
exit /b %ERRORLEVEL%
