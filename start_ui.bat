@echo off
setlocal
cd /d "%~dp0"

if not exist "frontend\package.json" (
  echo frontend\package.json was not found. Please keep this batch file in the Pokemon-AI-Battle-System project root.
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

echo Building LobbyPage...
call npm.cmd run build
if errorlevel 1 (
  echo npm run build failed.
  pause
  exit /b 1
)

echo Starting preview server at http://127.0.0.1:18052
echo Keep this window open while using the LobbyPage.
start "" "http://127.0.0.1:18052"
call npm.cmd run preview -- --host 127.0.0.1 --port 18052
endlocal
