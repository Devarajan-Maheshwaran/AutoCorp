@echo off
title AutoCorp MasterAgent Single-File Runner
color 0B

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║       AUTOCORP - MASTERAGENT SINGLE-FILE WORKFLOW       ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.
echo  Enter the investor idea when prompted.
echo  This runs one-file Master Agent flow and writes output JSON.
echo.

cd /d %~dp0
node masteragent-singlefile.mjs

echo.
echo  Output saved as: %~dp0masteragent-output.json
echo  Press any key to close...
pause >nul
