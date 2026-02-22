/**
 * AutoCorp Logistics Agent — Digital Delivery
 *
 * Category-agnostic digital delivery and transfer agent:
 * 1. Receives transfer requests from any category agent (via A2A)
 * 2. Simulates digital delivery (crypto transfer, API key provisioning, licence activation)
 * 3. Verifies delivery and publishes confirmation
 * 4. Notifies Sales Agent on completion
 *
 * Architecture:
 *   - A2A protocol for inter-agent communication
 *   - X402 for autonomous payments
 *   - Express server for receiving A2A tasks
 */

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const PORT = process.env.LOGISTICS_PORT || 3002;
const MOCK_API = process.env.MOCK_API_URL || 'http://localhost:3001';
const MASTERAGENT = process.env.MASTERAGENT_URL || 'http://localhost:8787';
const AGENT_ID = 'logistics-agent';
const AGENT_NAME = 'DigitalDeliveryAgent';

// In-memory transfer ledger
const transfers = new Map();

// ============================================================
// A2A / Discovery Endpoints
// ============================================================

app.get('/.well-known/agent-card.json', (req, res) => {
  res.json({
    name: 'logistics',
    description: 'Digital delivery and transfer agent. Handles cross-exchange transfers, API key delivery, and licence provisioning.',
    capabilities: ['initiate_transfer', 'verify_delivery', 'track_transfer'],
    port: PORT,
    protocol: 'A2A',
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', agent: AGENT_NAME, transfers: transfers.size });
});

// ============================================================
// Transfer Endpoints
// ============================================================

/**
 * POST /transfer — Initiate a digital delivery
 */
app.post('/transfer', async (req, res) => {
  const { transfer_id, category, item, quantity, from_location, to_location, metadata } = req.body;
  const tid = transfer_id || `tx-${Date.now()}`;

  const transfer = {
    transfer_id: tid,
    category: category || 'unknown',
    item: item || 'unknown',
    quantity: quantity || 0,
    from: from_location || 'autocorp',
    to: to_location || 'buyer',
    status: 'initiated',
    metadata: metadata || {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  transfers.set(tid, transfer);

  console.log(`[Logistics] Transfer initiated: ${tid} (${category}:${item} x${quantity})`);

  // Simulate digital delivery delay (0.5-2s)
  const delay = 500 + Math.random() * 1500;
  setTimeout(async () => {
    transfer.status = 'delivered';
    transfer.updated_at = new Date().toISOString();
    transfer.delivered_at = new Date().toISOString();
    console.log(`[Logistics] Transfer delivered: ${tid}`);

    // Publish delivery event to masteragent
    try {
      await axios.post(`${MASTERAGENT}/events`, {
        type: 'transfer_completed',
        transfer,
        ts: Date.now() / 1000,
      });
    } catch (e) { /* masteragent may not be running */ }
  }, delay);

  res.json({ status: 'initiated', transfer });
});

/**
 * GET /transfer/:id — Check transfer status
 */
app.get('/transfer/:id', (req, res) => {
  const transfer = transfers.get(req.params.id);
  if (!transfer) return res.status(404).json({ error: 'Transfer not found' });
  res.json(transfer);
});

/**
 * GET /transfers — List all transfers
 */
app.get('/transfers', (req, res) => {
  const all = Array.from(transfers.values())
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ transfers: all.slice(0, 50), total: transfers.size });
});

// ============================================================
// A2A Task Endpoint
// ============================================================

app.post('/tasks/send', async (req, res) => {
  const { task_id, capability, from_agent, payload } = req.body;
  const tid = task_id || uuidv4();

  if (capability === 'initiate_transfer' || capability === 'deliver') {
    const p = payload || {};
    const transfer = {
      transfer_id: tid,
      category: p.category || 'unknown',
      item: p.item || 'unknown',
      quantity: p.quantity || 0,
      from: p.from_location || from_agent || 'autocorp',
      to: p.to_location || 'buyer',
      status: 'delivered',
      metadata: p.metadata || {},
      created_at: new Date().toISOString(),
      delivered_at: new Date().toISOString(),
    };
    transfers.set(tid, transfer);
    console.log(`[Logistics] A2A delivery: ${tid} (${transfer.category}:${transfer.item})`);
    return res.json({ status: 'delivered', transfer });
  }

  res.json({ status: 'received', task_id: tid, message: `Capability '${capability}' noted.` });
});

// ============================================================
// Start
// ============================================================

app.listen(PORT, () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║   AutoCorp Digital Delivery Agent v2.0.0     ║');
  console.log('╠═══════════════════════════════════════════════╣');
  console.log(`║  Server:  http://localhost:${PORT}              ║`);
  console.log('║  Role:    Category-agnostic digital delivery  ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
