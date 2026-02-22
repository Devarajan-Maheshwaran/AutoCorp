/**
 * Events Bus — Central event stream for Glassbox Dashboard
 * 
 * All system events (agent actions, price ticks, transactions, A2A messages)
 * are published here. Dashboard subscribes via SSE.
 * This is the backbone of the Glassbox UI principle.
 */

const express = require('express');
const router = express.Router();
const { getPaymentLedger } = require('../middleware/x402');

// Central event log
const events = [];
const sseClients = [];

/**
 * Publish an event to the bus
 * Called by other modules (agents, routes, etc.)
 */
function publishEvent(event) {
  const enriched = {
    id: events.length + 1,
    timestamp: new Date().toISOString(),
    ...event
  };
  events.push(enriched);

  // Keep last 500 events
  if (events.length > 500) events.shift();

  // Broadcast to all SSE clients
  sseClients.forEach(res => {
    res.write(`event: event\ndata: ${JSON.stringify(enriched)}\n\n`);
  });
}

/**
 * GET /api/events/stream
 * SSE endpoint — Dashboard connects here for real-time Glassbox view
 */
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');

  res.flushHeaders();

  sseClients.push(res);
  console.log(`[Events] SSE client connected. Total: ${sseClients.length}`);

  // Send last 50 events as catch-up
  events.slice(-50).forEach(evt => {
    res.write(`event: catch_up\ndata: ${JSON.stringify(evt)}\n\n`);
  });

  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx > -1) sseClients.splice(idx, 1);
    console.log(`[Events] SSE client disconnected. Total: ${sseClients.length}`);
  });
});

/**
 * GET /api/events/history?limit=100&type=agent_action
 * Get historical events
 */
router.get('/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const typeFilter = req.query.type;
  
  let filtered = events;
  if (typeFilter) {
    filtered = events.filter(e => e.type === typeFilter);
  }

  res.json({
    status: 'ok',
    count: filtered.length,
    data: filtered.slice(-limit)
  });
});

/**
 * POST /api/events/publish
 * External agents can publish events here
 * 
 * Body: {
 *   type: "agent_action" | "a2a_message" | "transaction" | "reasoning" | "system",
 *   agent_id: "price_monitor_001",
 *   agent_name: "Price Monitor",
 *   action: "price_check",
 *   details: { ... },
 *   reasoning: { thought: "...", action: "...", observation: "..." }
 * }
 */
router.post('/publish', (req, res) => {
  const event = req.body;
  if (!event.type) {
    return res.status(400).json({ error: 'Event type required' });
  }
  publishEvent(event);
  res.json({ status: 'ok', message: 'Event published' });
});

/**
 * GET /api/events/payments
 * Get X402 payment ledger (for dashboard P&L panel)
 */
router.get('/payments', (req, res) => {
  res.json({
    status: 'ok',
    data: getPaymentLedger()
  });
});

module.exports = { router, publishEvent };
