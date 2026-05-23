@echo off
setlocal
cd /d "%~dp0"

if not exist "frontend\package.json" (
  echo frontend\package.json was not found. Please keep this batch file in the Pokemon-AI-Battle-System project root.
  pause
  exit /b 1
)

if not exist "frontend\server\trainingServer.ts" (
  echo frontend\server\trainingServer.ts was not found. The backend training service is missing.
  pause
  exit /b 1
)

cd frontend

if not exist "node_modules" (
  echo Installing frontend dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Building frontend...
call npm.cmd run build
if errorlevel 1 (
  echo npm run build failed.
  pause
  exit /b 1
)

echo Building backend training service...
call npm.cmd run server:build
if errorlevel 1 (
  echo npm run server:build failed.
  pause
  exit /b 1
)

echo Starting backend training monitor at http://127.0.0.1:8787
start "Pokemon Training Backend" powershell.exe -NoExit -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%cd%'; npm.cmd run server:training"

echo Starting frontend training monitor at http://localhost:4173/?page=training
echo Keep this window open while using the frontend monitor.
start "" "http://localhost:4173/?page=training"
call npm.cmd run preview -- --host localhost --port 4173

endlocal
