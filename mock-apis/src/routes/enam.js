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
const https = require('https');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const priceEngine = require('../priceEngine');
const { x402Required } = require('../middleware/x402');

const DATA_GOV_API_KEY = process.env.DATA_GOV_API_KEY || '579b464db66ec23bdd000001303507a2147840fe5851d9fb52fc9158';
const DATA_GOV_RESOURCE_ID = process.env.DATA_GOV_RESOURCE_ID || '9ef84268-d588-465a-a308-a864a43d0070';

function normalizeNumber(value) {
  const parsed = Number(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function toTickFromRecords(jodhpurRecord, mumbaiRecord) {
  const jodhpurPrice = normalizeNumber(jodhpurRecord?.modal_price);
  const mumbaiPrice = normalizeNumber(mumbaiRecord?.modal_price);
  if (!jodhpurPrice || !mumbaiPrice) return null;

  const spread = mumbaiPrice - jodhpurPrice;
  return {
    timestamp: new Date().toISOString(),
    simulated_date: jodhpurRecord?.arrival_date || mumbaiRecord?.arrival_date || new Date().toISOString().slice(0, 10),
    day_number: 0,
    source_type: 'live',
    source_label: 'Agmarknet Live (data.gov.in)',
    jodhpur: {
      commodity: jodhpurRecord?.commodity || 'Tur/Arhar Dal',
      market: jodhpurRecord?.market || 'Jodhpur',
      state: jodhpurRecord?.state || 'Rajasthan',
      price_per_quintal: jodhpurPrice,
      day_min: normalizeNumber(jodhpurRecord?.min_price) || jodhpurPrice,
      day_max: normalizeNumber(jodhpurRecord?.max_price) || jodhpurPrice,
      day_modal: jodhpurPrice,
      unit: 'INR/quintal',
    },
    mumbai: {
      commodity: mumbaiRecord?.commodity || 'Tur/Arhar Dal',
      market: mumbaiRecord?.market || 'Vashi (Mumbai)',
      state: mumbaiRecord?.state || 'Maharashtra',
      price_per_quintal: mumbaiPrice,
      day_min: normalizeNumber(mumbaiRecord?.min_price) || mumbaiPrice,
      day_max: normalizeNumber(mumbaiRecord?.max_price) || mumbaiPrice,
      day_modal: mumbaiPrice,
      unit: 'INR/quintal',
    },
    spread,
    spread_percentage: ((spread / jodhpurPrice) * 100).toFixed(2),
  };
}

async function fetchLiveMandiTick() {
  if (!DATA_GOV_API_KEY) return null;

  const base = `https://api.data.gov.in/resource/${DATA_GOV_RESOURCE_ID}`;
  const common = `api-key=${encodeURIComponent(DATA_GOV_API_KEY)}&format=json&offset=0&limit=40`;

  const jodhpurUrl = `${base}?${common}&filters[state]=Rajasthan`;
  const mumbaiUrl = `${base}?${common}&filters[state]=Maharashtra`;

  const httpsJson = (url) => new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });

  try {
    const [jodhpurJson, mumbaiJson] = await Promise.all([
      httpsJson(jodhpurUrl),
      httpsJson(mumbaiUrl),
    ]);

    const pickRecord = (records, marketMatchers) => {
      const all = Array.isArray(records) ? records : [];
      if (all.length === 0) return null;

      const dalRows = all.filter((row) => /tur|arhar|dal/i.test(String(row?.commodity || '')));
      const dalMarketMatch = dalRows.find((row) => marketMatchers.some((matcher) => matcher.test(String(row?.market || ''))));
      if (dalMarketMatch) return dalMarketMatch;

      const marketMatch = all.find((row) => marketMatchers.some((matcher) => matcher.test(String(row?.market || ''))));
      if (marketMatch) return marketMatch;

      return dalRows[0] || all[0];
    };

    const jodhpurRecord = pickRecord(jodhpurJson?.records, [/jodhpur/i]);
    const mumbaiRecord = pickRecord(mumbaiJson?.records, [/vashi/i, /mumbai/i, /navi mumbai/i]);
    return toTickFromRecords(jodhpurRecord, mumbaiRecord);
  } catch {
    return null;
  }
}

// In-memory order book
const orders = new Map();

/**
 * GET /api/enam/prices/current
 * Returns current live price tick (Jodhpur + Mumbai)
 * FREE endpoint — no X402 required (price data is public)
 */
router.get('/prices/current', (req, res) => {
  fetchLiveMandiTick().then((liveTick) => {
    if (liveTick) {
      return res.json({
        status: 'ok',
        source: 'eNAM (Agmarknet live via data.gov.in)',
        data: liveTick,
      });
    }

    const current = priceEngine.getCurrentPrice();
    if (!current.jodhpur) {
      return res.status(503).json({
        error: 'Price engine not yet started. Wait for first tick.',
        engine_status: priceEngine.getStatus(),
      });
    }

    return res.json({
      status: 'ok',
      source: 'eNAM (Agmarknet historical replay fallback)',
      data: {
        ...current,
        source_type: 'replay',
        source_label: 'Agmarknet Historical Replay',
      },
    });
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
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  console.log('[eNAM SSE] Client connected for price stream');

  let interval = null;

  const emitTick = async () => {
    const liveTick = await fetchLiveMandiTick();
    if (liveTick) {
      res.write(`event: price_tick\ndata: ${JSON.stringify(liveTick)}\n\n`);
      return;
    }

    const current = priceEngine.getCurrentPrice();
    if (current?.jodhpur?.price_per_quintal && current?.mumbai?.price_per_quintal) {
      res.write(`event: price_tick\ndata: ${JSON.stringify({
        ...current,
        source_type: 'replay',
        source_label: 'Agmarknet Historical Replay',
      })}\n\n`);
    }
  };

  emitTick();
  interval = setInterval(emitTick, 10000);

  req.on('close', () => {
    console.log('[eNAM SSE] Client disconnected');
    if (interval) clearInterval(interval);
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
