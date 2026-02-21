@echo off
title AutoCorp Demo Launcher
color 0A

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║           AUTOCORP - Autonomous AI Agent Swarms          ║
echo  ║     Tur Dal Arbitrage: Jodhpur → Mumbai Pipeline         ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.

:: Kill any existing node processes on our ports
echo [1/6] Cleaning up old processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 :3001 :3002 :3003 :3004" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 2 /nobreak >nul

:: Start Mock API Server
echo [2/6] Starting Mock API Server (port 3001)...
start "AutoCorp - Mock APIs" /min cmd /c "cd /d %~dp0mock-apis && node src/server.js"
timeout /t 3 /nobreak >nul

:: Start Logistics Agent
echo [3/6] Starting Logistics Agent (port 3002)...
start "AutoCorp - Logistics Agent" /min cmd /c "cd /d %~dp0logistics-agent && node agent.js"
timeout /t 2 /nobreak >nul

:: Start Procurement Agent
echo [4/6] Starting Procurement Agent (port 3003)...
start "AutoCorp - Procurement Agent" /min cmd /c "cd /d %~dp0procurement-agent && node agent.js"
timeout /t 1 /nobreak >nul

:: Start Sales Agent
echo [5/6] Starting Sales Agent (port 3004)...
start "AutoCorp - Sales Agent" /min cmd /c "cd /d %~dp0sales-agent && node agent.js"
timeout /t 1 /nobreak >nul

:: Start Dashboard
echo [6/6] Starting Glassbox Dashboard (port 3000)...
start "AutoCorp - Dashboard" /min cmd /c "cd /d %~dp0dashboard && npx next dev -p 3000"

echo.
echo  ┌─────────────────────────────────────────────────────────┐
echo  │  All 5 services starting up...                          │
echo  │                                                         │
echo  │  Mock APIs:           http://localhost:3001              │
echo  │  Logistics Agent:     http://localhost:3002              │
echo  │  Procurement Agent:   http://localhost:3003              │
echo  │  Sales Agent:         http://localhost:3004              │
echo  │  Glassbox Dashboard:  http://localhost:3000              │
echo  │                                                         │
echo  │  Open http://localhost:3000 in your browser              │
echo  │  Press "Execute Full Pipeline" to run the demo!          │
echo  └─────────────────────────────────────────────────────────┘
echo.
echo  Press any key to stop all services...
pause >nul

echo.
echo  Shutting down all AutoCorp services...
taskkill /FI "WINDOWTITLE eq AutoCorp*" /F >nul 2>&1
echo  Done. Goodbye!
timeout /t 2 /nobreak >nul
