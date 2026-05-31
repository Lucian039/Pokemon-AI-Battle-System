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

echo Building backend training service...
call npm.cmd run server:build
if errorlevel 1 (
  echo npm run server:build failed.
  pause
  exit /b 1
)

echo Starting backend training monitor at http://127.0.0.1:18053
echo Keep this window open while using the backend training service.
call npm.cmd run server:training

endlocal
