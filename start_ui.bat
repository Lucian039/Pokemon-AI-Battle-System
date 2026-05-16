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

echo Starting preview server at http://localhost:4173
echo Keep this window open while using the LobbyPage.
start "" "http://localhost:4173"
call npm.cmd run preview -- --host localhost --port 4173
endlocal
