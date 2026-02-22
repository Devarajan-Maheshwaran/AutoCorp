@echo off
REM ========================================
REM AutoCorp v2.0 - One-Command Demo Launch
REM ========================================

echo.
echo ======================================
echo   AutoCorp v2.0 - Demo Launcher
echo ======================================
echo.

REM Create logs directory
if not exist logs mkdir logs

REM Clear ports
echo [1/8] Clearing ports...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8009') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8002') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8003') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8004') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8006') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3002') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8787') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /F /PID %%a >nul 2>&1
timeout /t 2 /nobreak >nul
echo    Done!

REM Start Mock API Server
echo [2/8] Starting Mock API Server (port 3001)...
start "MockAPI" cmd /c "cd mock-apis && node server.js > ../logs/mock-api.log 2>&1"
timeout /t 3 /nobreak >nul
echo    Started!

REM Start Charter Generator
echo [3/8] Starting Charter Generator (port 8009)...
start "Charter" cmd /c "cd autocorp/core && python charter_server.py > ../../logs/charter.log 2>&1"
timeout /t 3 /nobreak >nul
echo    Started!

REM Start Python Agent Servers
echo [4/8] Starting Python Agent Servers...
start "PriceMonitor" cmd /c "cd autocorp/agents/price_monitor && python server.py > ../../../logs/price_monitor.log 2>&1"
timeout /t 2 /nobreak >nul
start "Procurement" cmd /c "cd autocorp/agents/procurement && python server.py > ../../../logs/procurement.log 2>&1"
timeout /t 2 /nobreak >nul
start "Sales" cmd /c "cd autocorp/agents/sales && python server.py > ../../../logs/sales.log 2>&1"
timeout /t 2 /nobreak >nul
start "Accountant" cmd /c "cd autocorp/agents/accountant && python server.py > ../../../logs/accountant.log 2>&1"
timeout /t 2 /nobreak >nul
echo    All Python agents started!

REM Start Logistics Agent (Node)
echo [5/8] Starting Logistics Agent (port 3002)...
start "Logistics" cmd /c "cd logistics-agent && node server.js > ../logs/logistics.log 2>&1"
timeout /t 3 /nobreak >nul
echo    Started!

REM Start MasterAgent (TypeScript)
echo [6/8] Starting MasterAgent Founder (port 8787)...
start "MasterAgent" cmd /c "cd masteragent && npm run dev > ../logs/masteragent.log 2>&1"
timeout /t 5 /nobreak >nul
echo    Started!

REM Health Check
echo [7/8] Running health checks...
timeout /t 5 /nobreak >nul
curl -s http://localhost:3001/health >nul 2>&1 && echo    [OK] Mock API || echo    [FAIL] Mock API
curl -s http://localhost:8009/health >nul 2>&1 && echo    [OK] Charter Gen || echo    [FAIL] Charter Gen
curl -s http://localhost:8002/health >nul 2>&1 && echo    [OK] Price Monitor || echo    [FAIL] Price Monitor
curl -s http://localhost:8003/health >nul 2>&1 && echo    [OK] Procurement || echo    [FAIL] Procurement
curl -s http://localhost:8004/health >nul 2>&1 && echo    [OK] Sales || echo    [FAIL] Sales
curl -s http://localhost:8006/health >nul 2>&1 && echo    [OK] Accountant || echo    [FAIL] Accountant
curl -s http://localhost:3002/health >nul 2>&1 && echo    [OK] Logistics || echo    [FAIL] Logistics
curl -s http://localhost:8787/health >nul 2>&1 && echo    [OK] MasterAgent || echo    [FAIL] MasterAgent

REM Start Dashboard
echo [8/8] Starting Dashboard (port 3000)...
echo.
echo ======================================
echo   All services running!
echo ======================================
echo.
echo   Dashboard will open at: http://localhost:3000
echo   Press Ctrl+C to stop all services
echo.
cd dashboard && npm run dev

pause
