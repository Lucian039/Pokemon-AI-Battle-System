@echo off
setlocal
cd /d "%~dp0"

echo [Dependency Installer] Pokemon-AI-Battle-System
echo.

if not exist "requirements.txt" (
  echo requirements.txt was not found. Please keep this batch file in the project root.
  pause
  exit /b 1
)

if not exist "frontend\package.json" (
  echo frontend\package.json was not found. Please keep the frontend folder complete.
  pause
  exit /b 1
)

where py >nul 2>nul
if not errorlevel 1 (
  set "PYTHON_CMD=py"
) else (
  where python >nul 2>nul
  if not errorlevel 1 (
    set "PYTHON_CMD=python"
  ) else (
    echo Python was not found. Please install Python 3 and run this file again.
    pause
    exit /b 1
  )
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Please install Node.js LTS and run this file again.
  pause
  exit /b 1
)

echo [1/3] Upgrading pip...
%PYTHON_CMD% -m pip install --upgrade pip
if errorlevel 1 (
  echo pip upgrade failed.
  pause
  exit /b 1
)

echo.
echo [2/3] Installing Python dependencies...
%PYTHON_CMD% -m pip install -r requirements.txt
if errorlevel 1 (
  echo Python dependency installation failed.
  pause
  exit /b 1
)

echo.
echo [3/3] Installing frontend Node dependencies...
cd frontend
if exist "package-lock.json" (
  call npm.cmd ci
) else (
  call npm.cmd install
)
if errorlevel 1 (
  echo Frontend dependency installation failed.
  pause
  exit /b 1
)

cd ..
echo.
echo All dependencies have been installed.
echo Run start_ui.bat for the frontend, or start_training.bat for the training service.
pause
endlocal
