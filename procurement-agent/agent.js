/**
 * ProcurementAgent — Autonomous dal buyer for AutoCorp
 * 
 * Monitors Jodhpur mandi prices, detects favorable dips,
 * executes buy orders via eNAM API with X402 payments.
 * Communicates with LogisticsAgent via A2A protocol.
 * 
 * Port: 3003
 */

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3003;
const MOCK_API = process.env.MOCK_API_URL || 'http://localhost:3001';
const AGENT_ID = process.env.AGENT_ID || 'procurement-agent-001';
const AGENT_NAME = process.env.AGENT_NAME || 'ProcurementAgent';
const AGENT_WALLET = process.env.AGENT_WALLET || '0xProcureAgent_Demo_001';
const BUSINESS_CONTRACT = process.env.BUSINESS_CONTRACT || '0xAutoCorpBizDemo001';
const MAX_PRICE = parseInt(process.env.MAX_PRICE_PER_QUINTAL) || 8500;
const TARGET_QTY = parseInt(process.env.TARGET_QUANTITY) || 20;

// ============================================================
// State
// ============================================================
const state = {
  status: 'idle',         // idle | monitoring | buying | bought
  price_history: [],      // last N price ticks
  current_price: null,
  running_avg: null,
  buy_threshold: MAX_PRICE,
  last_order: null,
  trades: [],
  events: []
};

// ============================================================
// A2A Protocol Endpoints
// ============================================================

/**
 * GET /.well-known/agent.json — A2A Agent Card
 */
app.get('/.well-known/agent.json', (req, res) => {
  res.json(require('./agent-card.json'));
});

/**
 * POST /a2a/tasks — Receive task from orchestrator or other agents
 */
app.post('/a2a/tasks', async (req, res) => {
  const { capability, params } = req.body;
  const taskId = uuidv4();

  const task = {
    task_id: taskId,
    capability,
    status: 'accepted',
    created_at: new Date().toISOString(),
    result: null
  };

  res.json(task);

  // Execute async
  if (capability === 'monitor_prices') {
    startMonitoring(taskId, params || {});
  } else if (capability === 'execute_purchase') {
    executePurchase(taskId, params || {});
  } else if (capability === 'assess_spread') {
    assessSpread(taskId, params || {});
  }
});

/**
 * GET /a2a/tasks/:taskId — Check task status
 */
app.get('/a2a/tasks/:taskId', (req, res) => {
  const event = state.events.find(e => e.task_id === req.params.taskId);
  if (!event) return res.status(404).json({ error: 'Task not found' });
  res.json(event);
});

// ============================================================
// Direct API Endpoints
// ============================================================

/**
 * GET /status — Agent health + current state
 */
app.get('/status', (req, res) => {
  res.json({
    agent_id: AGENT_ID,
    agent_name: AGENT_NAME,
    status: state.status,
    current_price: state.current_price,
    running_avg: state.running_avg,
    buy_threshold: state.buy_threshold,
    trades_count: state.trades.length,
    last_order: state.last_order,
    price_ticks_collected: state.price_history.length,
    uptime: process.uptime()
  });
});

/**
 * POST /monitor — Start price monitoring
 */
app.post('/monitor', async (req, res) => {
  const taskId = uuidv4();
  res.json({ task_id: taskId, status: 'monitoring_started' });
  startMonitoring(taskId, req.body || {});
});

/**
 * POST /buy — Execute a buy order
 */
app.post('/buy', async (req, res) => {
  const { quantity_quintals, max_price_per_quintal } = req.body;
  const taskId = uuidv4();

  try {
    const result = await executePurchase(taskId, {
      quantity: quantity_quintals || TARGET_QTY,
      max_price: max_price_per_quintal || MAX_PRICE
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /trades — All executed trades
 */
app.get('/trades', (req, res) => {
  res.json({ trades: state.trades, total: state.trades.length });
});

/**
 * POST /assess — Assess current spread profitability
 */
app.post('/assess', async (req, res) => {
  const taskId = uuidv4();
  const result = await assessSpread(taskId, req.body || {});
  res.json(result);
});

// ============================================================
// Core Logic
// ============================================================

/**
 * Monitor prices via SSE and detect buying opportunities
 */
async function startMonitoring(taskId, params) {
  state.status = 'monitoring';
  const maxTicks = params.max_ticks || 50;

  await publishEvent('monitoring_started', {
    task_id: taskId,
    buy_threshold: state.buy_threshold,
    max_ticks: maxTicks
  });

  console.log(`[${AGENT_NAME}] Monitoring Jodhpur mandi prices (threshold: ₹${state.buy_threshold}/q)`);

  // Poll prices periodically (more reliable than SSE for a stub)
  let tickCount = 0;
  const interval = setInterval(async () => {
    try {
      const res = await axios.get(`${MOCK_API}/api/enam/prices/current`);
      const data = res.data.data;

      if (!data || !data.jodhpur) return;

      const price = data.jodhpur.price_per_quintal;
      const mumbaiPrice = data.mumbai?.price_per_quintal;
      const spread = data.spread;

      state.current_price = price;
      state.price_history.push({
        timestamp: new Date().toISOString(),
        jodhpur: price,
        mumbai: mumbaiPrice,
        spread
      });

      // Calculate running average (last 5 ticks)
      const recent = state.price_history.slice(-5);
      state.running_avg = Math.round(
        recent.reduce((sum, t) => sum + t.jodhpur, 0) / recent.length
      );

      tickCount++;

      // Log every 5th tick
      if (tickCount % 5 === 0) {
        console.log(
          `[${AGENT_NAME}] Tick ${tickCount}: Jodhpur ₹${price} | ` +
          `Avg ₹${state.running_avg} | Spread ₹${spread} | ` +
          `${price <= state.buy_threshold ? '🟢 BUY ZONE' : '🔴 ABOVE THRESHOLD'}`
        );
      }

      // Auto-buy if price is favorable and we haven't bought yet
      if (price <= state.buy_threshold && state.status === 'monitoring') {
        console.log(`[${AGENT_NAME}] 🟢 Price dip detected! ₹${price}/q is below threshold ₹${state.buy_threshold}/q`);

        await publishEvent('buy_signal_detected', {
          task_id: taskId,
          jodhpur_price: price,
          mumbai_price: mumbaiPrice,
          spread,
          running_avg: state.running_avg,
          reason: `Price ₹${price}/q is below buy threshold ₹${state.buy_threshold}/q with spread ₹${spread}/q`
        });

        // Execute the buy
        await executePurchase(taskId, {
          quantity: TARGET_QTY,
          max_price: state.buy_threshold,
          trigger_price: price,
          spread_at_trigger: spread
        });

        clearInterval(interval);
        return;
      }

      if (tickCount >= maxTicks) {
        console.log(`[${AGENT_NAME}] Max ticks reached (${maxTicks}). Stopping monitor.`);
        state.status = 'idle';
        clearInterval(interval);
      }

    } catch (err) {
      // Price engine may not be ready yet
    }
  }, 3000);
}

/**
 * Execute a buy order on Jodhpur mandi via eNAM API
 */
async function executePurchase(taskId, params) {
  const { quantity, max_price, trigger_price, spread_at_trigger } = params;
  state.status = 'buying';

  console.log(`[${AGENT_NAME}] Executing buy: ${quantity}q at max ₹${max_price}/q`);

  await publishEvent('purchase_initiated', {
    task_id: taskId,
    quantity_quintals: quantity,
    max_price_per_quintal: max_price,
    trigger_price,
    wallet: AGENT_WALLET
  });

  try {
    // Place order via eNAM mock API
    const response = await axios.post(`${MOCK_API}/api/enam/orders`, {
      commodity: 'Tur Dal (Arhar)',
      mandi: 'Jodhpur',
      quantity_quintals: quantity,
      max_price_per_quintal: max_price || MAX_PRICE
    }, {
      headers: {
        'x-402-payment-proof': `0xpurchase_${uuidv4().slice(0, 8)}`,
        'x-402-payer-address': AGENT_WALLET,
        'x-402-business-contract': BUSINESS_CONTRACT
      }
    });

    const order = response.data;
    state.status = 'bought';
    state.last_order = order;

    const trade = {
      trade_id: uuidv4(),
      task_id: taskId,
      timestamp: new Date().toISOString(),
      type: 'BUY',
      commodity: 'Tur Dal',
      market: 'Jodhpur',
      quantity_quintals: quantity,
      price_per_quintal: order.data?.price_per_quintal || trigger_price,
      total_cost: order.data?.total_cost || quantity * (trigger_price || max_price),
      spread_at_trigger,
      order_id: order.data?.order_id,
      x402_payment: true,
      decision_reasoning: `Bought at ₹${order.data?.price_per_quintal || trigger_price}/q. ` +
        `Jodhpur-Mumbai spread: ₹${spread_at_trigger || 'N/A'}/q. ` +
        `Expected gross profit: ₹${spread_at_trigger ? spread_at_trigger * quantity : 'calculating'}. ` +
        `Will hand off to LogisticsAgent for freight booking.`
    };

    state.trades.push(trade);

    console.log(
      `[${AGENT_NAME}] ✅ Purchase complete! Order: ${order.data?.order_id}. ` +
      `${quantity}q at ₹${order.data?.price_per_quintal}/q = ₹${order.data?.total_cost}`
    );

    await publishEvent('purchase_complete', {
      task_id: taskId,
      ...trade
    });

    // Notify Logistics Agent via A2A (if available)
    await notifyLogisticsAgent(order.data?.order_id, quantity);

    return {
      status: 'purchased',
      trade,
      order: order.data,
      next_step: 'Handed off to LogisticsAgent for freight booking'
    };

  } catch (err) {
    state.status = 'idle';
    console.error(`[${AGENT_NAME}] Purchase failed:`, err.response?.data || err.message);

    await publishEvent('purchase_failed', {
      task_id: taskId,
      error: err.response?.data?.error || err.message
    });

    throw err;
  }
}

/**
 * Assess current Jodhpur-Mumbai spread profitability
 */
async function assessSpread(taskId, params) {
  const estimated_freight_cost = params.freight_cost_per_quintal || 180;

  try {
    const res = await axios.get(`${MOCK_API}/api/enam/prices/current`);
    const data = res.data.data;

    const jodhpur = data.jodhpur.price_per_quintal;
    const mumbai = data.mumbai.price_per_quintal;
    const spread = data.spread;

    const quantity = params.quantity || TARGET_QTY;
    const grossProfit = spread * quantity;
    const freightCost = estimated_freight_cost * quantity;
    const netProfit = grossProfit - freightCost;
    const roi = ((netProfit / (jodhpur * quantity)) * 100).toFixed(2);

    const assessment = {
      task_id: taskId,
      timestamp: new Date().toISOString(),
      jodhpur_price: jodhpur,
      mumbai_price: mumbai,
      spread_per_quintal: spread,
      quantity_quintals: quantity,
      gross_profit: grossProfit,
      estimated_freight_cost: freightCost,
      net_profit: netProfit,
      roi_percent: parseFloat(roi),
      recommendation: netProfit > 0 ? 'PROFITABLE — Execute trade' : 'UNPROFITABLE — Wait for better spread',
      is_profitable: netProfit > 0,
      breakdown: {
        buy_cost: `${quantity}q × ₹${jodhpur} = ₹${jodhpur * quantity}`,
        sell_revenue: `${quantity}q × ₹${mumbai} = ₹${mumbai * quantity}`,
        freight: `${quantity}q × ₹${estimated_freight_cost} = ₹${freightCost}`,
        net: `₹${grossProfit} - ₹${freightCost} = ₹${netProfit}`
      }
    };

    console.log(
      `[${AGENT_NAME}] Spread assessment: ₹${spread}/q | ` +
      `Net profit: ₹${netProfit} (${roi}% ROI) | ` +
      `${netProfit > 0 ? '🟢 PROFITABLE' : '🔴 UNPROFITABLE'}`
    );

    await publishEvent('spread_assessed', assessment);

    return assessment;

  } catch (err) {
    console.error(`[${AGENT_NAME}] Spread assessment failed:`, err.message);
    return { error: err.message };
  }
}

// ============================================================
// Inter-Agent Communication
// ============================================================

/**
 * Notify LogisticsAgent to start freight booking
 */
async function notifyLogisticsAgent(orderId, quantity) {
  try {
    await axios.post('http://localhost:3002/a2a/tasks', {
      capability: 'full_pipeline',
      from_agent: AGENT_ID,
      input: {
        quantity_quintals: quantity,
        order_id: orderId,
        source_agent: AGENT_ID
      }
    });

    console.log(`[${AGENT_NAME}] → Notified LogisticsAgent: Book freight for order ${orderId}`);

    await publishEvent('a2a_handoff', {
      from: AGENT_ID,
      to: 'logistics-agent-001',
      action: 'full_pipeline',
      order_id: orderId,
      quantity_quintals: quantity
    });

    await axios.post(`${MOCK_API}/api/events/publish`, {
      type: 'a2a_message',
      agent_id: AGENT_ID,
      agent_name: AGENT_NAME,
      action: 'handoff_to_logistics',
      details: {
        from_agent: AGENT_ID,
        to_agent: 'logistics-agent-001',
        capability: 'full_pipeline',
        order_id: orderId,
        quantity_quintals: quantity
      }
    }).catch(() => {});
  } catch (err) {
    console.log(`[${AGENT_NAME}] LogisticsAgent not available. Will queue for retry.`);
  }
}

// ============================================================
// Event Bus
// ============================================================

async function publishEvent(action, details) {
  const event = {
    type: 'agent_action',
    agent_id: AGENT_ID,
    agent_name: AGENT_NAME,
    action,
    details,
    timestamp: new Date().toISOString()
  };

  state.events.push(event);

  try {
    await axios.post(`${MOCK_API}/api/events/publish`, event);
  } catch (err) {
    // Event bus may not be available
  }
}

// ============================================================
// Start
// ============================================================

app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  ProcurementAgent — AutoCorp Autonomous Buyer           ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Port:        ${PORT}                                      ║`);
  console.log(`║  Agent ID:    ${AGENT_ID}                   ║`);
  console.log(`║  Wallet:      ${AGENT_WALLET}                 ║`);
  console.log(`║  Buy Target:  ${TARGET_QTY}q at max ₹${MAX_PRICE}/q                     ║`);
  console.log('║  Protocol:    A2A + X402                                ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Endpoints:                                            ║');
  console.log('║    GET  /status      — Agent health & state             ║');
  console.log('║    POST /monitor     — Start price monitoring           ║');
  console.log('║    POST /buy         — Execute buy order                ║');
  console.log('║    POST /assess      — Assess spread profitability      ║');
  console.log('║    GET  /trades      — All executed trades              ║');
  console.log('║    A2A  /.well-known/agent.json                         ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // Publish agent_online event
  publishEvent('agent_online', {
    capabilities: ['monitor_prices', 'execute_purchase', 'assess_spread'],
    protocol: 'a2a',
    wallet: AGENT_WALLET
  });
});
