@echo off
title AutoCorp End-to-End Workflow Runner
color 0A

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║         AUTOCORP - END-TO-END EXECUTABLE DEMO           ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.

echo [1/6] Cleaning up old AutoCorp processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001 :3002 :3003 :3004" ^| findstr "LISTENING"') do (
	taskkill /PID %%a /F >nul 2>&1
)
timeout /t 2 /nobreak >nul

echo [2/6] Starting Mock API Server (3001)...
start "AutoCorp - Mock APIs" /min cmd /c "cd /d %~dp0mock-apis && node src/server.js"
timeout /t 3 /nobreak >nul

echo [3/6] Starting Logistics Agent (3002)...
start "AutoCorp - Logistics Agent" /min cmd /c "cd /d %~dp0logistics-agent && node agent.js"
timeout /t 2 /nobreak >nul

echo [4/6] Starting Procurement Agent (3003)...
start "AutoCorp - Procurement Agent" /min cmd /c "cd /d %~dp0procurement-agent && node agent.js"
timeout /t 2 /nobreak >nul

echo [5/6] Starting Sales Agent (3004)...
start "AutoCorp - Sales Agent" /min cmd /c "cd /d %~dp0sales-agent && node agent.js"
timeout /t 2 /nobreak >nul

echo [6/7] Starting Dashboard (3000)...
start "AutoCorp - Dashboard" /min cmd /c "cd /d %~dp0dashboard && npx next dev -p 3000"
timeout /t 3 /nobreak >nul

echo [7/7] Running MasterAgent workflow orchestrator...
cd /d %~dp0
node workflow-orchestrator.mjs

echo.
echo  Generated files:
echo   - %~dp0masteragent-output.json
echo   - %~dp0workflow-result.json
echo  Dashboard: http://localhost:3000
echo.
echo  Press any key to stop all AutoCorp windows...
pause >nul
taskkill /FI "WINDOWTITLE eq AutoCorp -*" /F >nul 2>&1
echo  Done.
