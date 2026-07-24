# One pipeline v3 cycle: scrape -> augment (free registries + triage) ->
# contact recovery -> submit Haiku batch -> ingest finished batches.
# Fires every 4 hours via Task Scheduler; exits cleanly each time.
Set-Location $PSScriptRoot
$env:PYTHONIOENCODING = "utf-8"
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"=== cycle $stamp ===" | Tee-Object -FilePath "$PSScriptRoot\daemon.log" -Append
& "$PSScriptRoot\..\venv\Scripts\python.exe" "$PSScriptRoot\daemon.py" --once 2>&1 |
    Tee-Object -FilePath "$PSScriptRoot\daemon.log" -Append
