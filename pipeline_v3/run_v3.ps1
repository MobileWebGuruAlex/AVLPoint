# Start the pipeline v3 daemon (restarts it if it dies).
# Register as a scheduled task that runs at logon:
#   schtasks /Create /TN "AVLpoint Pipeline v3" /SC ONLOGON /TR "powershell -ExecutionPolicy Bypass -File C:\Projects\AVLpoint\pipeline_v3\run_v3.ps1"
Set-Location $PSScriptRoot
while ($true) {
    & "$PSScriptRoot\..\venv\Scripts\python.exe" "$PSScriptRoot\daemon.py" 2>&1 |
        Tee-Object -FilePath "$PSScriptRoot\daemon.log" -Append
    Start-Sleep -Seconds 60
}
