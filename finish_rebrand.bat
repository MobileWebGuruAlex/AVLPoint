@echo off
echo ========================================================
echo AVL Point - Final Rebranding Script
echo ========================================================
echo.
echo This script will execute the final steps of the rebrand from the old project name to "AVL Point".
echo WARNING: Before continuing, please close your IDE (Antigravity) and ensure no background terminals are open.
echo If the IDE is open, Windows will block the folder from being renamed.
echo.
pause

echo Deleting old virtual environment to clear hardcoded paths...
rmdir /s /q "C:\Projects\AVLpoint\venv"

echo Renaming root project directory...
rename "C:\Projects\AVLpoint" "AVLpoint"

echo Rebuilding virtual environment in new directory...
cd /d "C:\Projects\AVLpoint"
python -m venv venv
call venv\Scripts\activate.bat
pip install -r requirements.txt

echo Re-registering Scheduled Tasks...
powershell -ExecutionPolicy Bypass -File setup_scheduler.ps1

echo.
echo ========================================================
echo REBRAND COMPLETE!
echo You may now open your IDE and load the C:\Projects\AVLpoint workspace.
echo ========================================================
pause
