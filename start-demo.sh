#!/bin/bash

# ========================================
# AutoCorp v2.0 - One-Command Demo Launch
# ========================================

echo ""
echo "======================================"
echo "  AutoCorp v2.0 - Demo Launcher"
echo "======================================"
echo ""

# Create logs directory
mkdir -p logs

# Clear ports
echo "[1/8] Clearing ports..."
lsof -ti:3001,8009,8002,8003,8004,8006,3002,8787,3000 | xargs kill -9 2>/dev/null
sleep 2
echo "   Done!"

# Start Mock API Server
echo "[2/8] Starting Mock API Server (port 3001)..."
cd mock-apis && node server.js > ../logs/mock-api.log 2>&1 &
cd ..
sleep 3
echo "   Started!"

# Start Charter Generator
echo "[3/8] Starting Charter Generator (port 8009)..."
cd autocorp/core && python charter_server.py > ../../logs/charter.log 2>&1 &
cd ../..
sleep 3
echo "   Started!"

# Start Python Agent Servers
echo "[4/8] Starting Python Agent Servers..."
cd autocorp/agents/price_monitor && python server.py > ../../../logs/price_monitor.log 2>&1 &
cd ../../..
sleep 2
cd autocorp/agents/procurement && python server.py > ../../../logs/procurement.log 2>&1 &
cd ../../..
sleep 2
cd autocorp/agents/sales && python server.py > ../../../logs/sales.log 2>&1 &
cd ../../..
sleep 2
cd autocorp/agents/accountant && python server.py > ../../../logs/accountant.log 2>&1 &
cd ../../..
sleep 2
echo "   All Python agents started!"

# Start Logistics Agent (Node)
echo "[5/8] Starting Logistics Agent (port 3002)..."
cd logistics-agent && node server.js > ../logs/logistics.log 2>&1 &
cd ..
sleep 3
echo "   Started!"

# Start MasterAgent (TypeScript)
echo "[6/8] Starting MasterAgent Founder (port 8787)..."
cd masteragent && npm run dev > ../logs/masteragent.log 2>&1 &
cd ..
sleep 5
echo "   Started!"

# Health Check
echo "[7/8] Running health checks..."
sleep 5
curl -s http://localhost:3001/health >/dev/null 2>&1 && echo "   [OK] Mock API" || echo "   [FAIL] Mock API"
curl -s http://localhost:8009/health >/dev/null 2>&1 && echo "   [OK] Charter Gen" || echo "   [FAIL] Charter Gen"
curl -s http://localhost:8002/health >/dev/null 2>&1 && echo "   [OK] Price Monitor" || echo "   [FAIL] Price Monitor"
curl -s http://localhost:8003/health >/dev/null 2>&1 && echo "   [OK] Procurement" || echo "   [FAIL] Procurement"
curl -s http://localhost:8004/health >/dev/null 2>&1 && echo "   [OK] Sales" || echo "   [FAIL] Sales"
curl -s http://localhost:8006/health >/dev/null 2>&1 && echo "   [OK] Accountant" || echo "   [FAIL] Accountant"
curl -s http://localhost:3002/health >/dev/null 2>&1 && echo "   [OK] Logistics" || echo "   [FAIL] Logistics"
curl -s http://localhost:8787/health >/dev/null 2>&1 && echo "   [OK] MasterAgent" || echo "   [FAIL] MasterAgent"

# Start Dashboard
echo "[8/8] Starting Dashboard (port 3000)..."
echo ""
echo "======================================"
echo "  All services running!"
echo "======================================"
echo ""
echo "  Dashboard will open at: http://localhost:3000"
echo "  Press Ctrl+C to stop all services"
echo ""
cd dashboard && npm run dev
