/**
 * eNAM (Electronic National Agriculture Market) Mock API Routes
 * 
 * Simulates eNAM endpoints for:
 * - Real-time price queries (from PriceReplayEngine with REAL data)
 * - Price history
 * - Placing buy orders
 * - Order status tracking
 * 
 * Data source: Actual Agmarknet historical prices for Tur/Arhar Dal
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const priceEngine = require('../priceEngine');
const { x402Required } = require('../middleware/x402');

// In-memory order book
const orders = new Map();

/**
 * GET /api/enam/prices/current
 * Returns current live price tick (Jodhpur + Mumbai)
 * FREE endpoint — no X402 required (price data is public)
 */
router.get('/prices/current', (req, res) => {
  const current = priceEngine.getCurrentPrice();
  if (!current.jodhpur) {
    return res.status(503).json({
      error: 'Price engine not yet started. Wait for first tick.',
      engine_status: priceEngine.getStatus()
    });
  }
  res.json({
    status: 'ok',
    source: 'eNAM (Agmarknet historical replay)',
    data: current
  });
});

/**
 * GET /api/enam/prices/history?market=jodhpur&limit=50
 * Returns historical price ticks
 */
router.get('/prices/history', (req, res) => {
  const market = req.query.market || 'both';
  const limit = parseInt(req.query.limit) || 50;
  const history = priceEngine.getHistory(market, limit);
  res.json({
    status: 'ok',
    source: 'eNAM (Agmarknet historical replay)',
    market,
    count: Array.isArray(history) ? history.length : undefined,
    data: history
  });
});

/**
 * GET /api/enam/prices/stream
 * SSE (Server-Sent Events) endpoint for real-time price streaming
 * Dashboard and Price Monitor Agent connect here
 */
router.get('/prices/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  console.log('[eNAM SSE] Client connected for price stream');

  const listener = (tick) => {
    res.write(`data: ${JSON.stringify(tick)}\n\n`);
  };

  priceEngine.onTick(listener);

  req.on('close', () => {
    console.log('[eNAM SSE] Client disconnected');
    // Remove listener (simplified — in production use proper cleanup)
    const idx = priceEngine.listeners.indexOf(listener);
    if (idx > -1) priceEngine.listeners.splice(idx, 1);
  });
});

/**
 * POST /api/enam/orders
 * Place a buy order at a specific mandi
 * 
 * X402 REQUIRED — agent must pay for the procurement
 * 
 * Body: {
 *   mandi: "Jodhpur",
 *   commodity: "Tur/Arhar Dal",
 *   quantity_quintals: 20,
 *   max_price_per_quintal: 7500,
 *   agent_id: "procurement_agent_001",
 *   business_contract: "0x..."
 * }
 */
router.post('/orders',
  // X402: procurement cost = quantity * price (calculated dynamically)
  (req, res, next) => {
    const { quantity_quintals, max_price_per_quintal } = req.body;
    if (!quantity_quintals || !max_price_per_quintal) {
      return res.status(400).json({ error: 'quantity_quintals and max_price_per_quintal required' });
    }
    const totalCost = quantity_quintals * max_price_per_quintal;
    // Convert INR to wei equivalent (1 INR = 1e15 wei for demo purposes)
    const costWei = BigInt(totalCost) * BigInt(1e15);
    x402Required(costWei.toString(), 'procurement')(req, res, next);
  },
  (req, res) => {
    const currentPrice = priceEngine.getCurrentPrice();
    if (!currentPrice.jodhpur) {
      return res.status(503).json({ error: 'Price engine not running' });
    }

    const {
      mandi = 'Jodhpur',
      commodity = 'Tur/Arhar Dal',
      quantity_quintals,
      max_price_per_quintal,
      agent_id,
      business_contract
    } = req.body;

    // Check if current market price is within the agent's max price
    const marketPrice = currentPrice.jodhpur.price_per_quintal;

    if (marketPrice > max_price_per_quintal) {
      return res.status(409).json({
        status: 'rejected',
        reason: 'market_price_exceeds_max',
        market_price: marketPrice,
        your_max_price: max_price_per_quintal,
        message: `Current market price ₹${marketPrice}/quintal exceeds your max ₹${max_price_per_quintal}/quintal`
      });
    }

    // Create order
    const order = {
      order_id: `ORD-${uuidv4().slice(0, 8).toUpperCase()}`,
      lot_id: `LOT-${uuidv4().slice(0, 6).toUpperCase()}`,
      status: 'confirmed',
      mandi,
      commodity,
      quantity_quintals,
      price_per_quintal: marketPrice, // Filled at current market price
      total_cost: marketPrice * quantity_quintals,
      commission_agent: 'Ramesh Kumar (License: CA-JDH-2847)',
      commission_rate: 0.025,
      commission_amount: Math.round(marketPrice * quantity_quintals * 0.025),
      agent_id,
      business_contract,
      x402_payment: req.x402Payment,
      created_at: new Date().toISOString(),
      pickup_location: 'Jodhpur Agricultural Produce Market, Gate 3',
      pickup_ready_by: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
      quality_grade: Math.random() > 0.15 ? 'A' : 'B', // 85% chance of Grade A
      moisture_content: (10 + Math.random() * 4).toFixed(1) + '%'
    };

    orders.set(order.order_id, order);

    console.log(`[eNAM] Order placed: ${order.order_id} — ${quantity_quintals}q @ ₹${marketPrice}/q = ₹${order.total_cost}`);

    res.status(201).json({
      status: 'ok',
      message: 'Buy order confirmed',
      data: order
    });
  }
);

/**
 * GET /api/enam/orders/:orderId
 * Check order status
 */
router.get('/orders/:orderId', (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  res.json({ status: 'ok', data: order });
});

/**
 * GET /api/enam/orders
 * List all orders (for dashboard)
 */
router.get('/orders', (req, res) => {
  const contractFilter = req.query.business_contract;
  let allOrders = Array.from(orders.values());
  if (contractFilter) {
    allOrders = allOrders.filter(o => o.business_contract === contractFilter);
  }
  res.json({
    status: 'ok',
    count: allOrders.length,
    data: allOrders
  });
});

/**
 * GET /api/enam/status
 * Engine status
 */
router.get('/status', (req, res) => {
  res.json({
    service: 'eNAM Mock API',
    source: 'Agmarknet Historical Data (Tur/Arhar Dal)',
    markets: ['Jodhpur (Rajasthan)', 'Vashi/Mumbai (Maharashtra)'],
    engine: priceEngine.getStatus()
  });
});

module.exports = router;
