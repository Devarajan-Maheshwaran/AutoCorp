/**
 * SalesAgent — Autonomous Mumbai buyer finder & deal closer for AutoCorp
 * 
 * Discovers wholesale buyers in Mumbai (Vashi APMC), ranks them,
 * runs WhatsApp outreach, negotiates, and confirms sales.
 * Receives delivery notifications from LogisticsAgent via A2A.
 * 
 * Port: 3004
 */

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3004;
const MOCK_API = process.env.MOCK_API_URL || 'http://localhost:3001';
const AGENT_ID = process.env.AGENT_ID || 'sales-agent-001';
const AGENT_NAME = process.env.AGENT_NAME || 'SalesAgent';
const AGENT_WALLET = process.env.AGENT_WALLET || '0xSalesAgent_Demo_001';
const BUSINESS_CONTRACT = process.env.BUSINESS_CONTRACT || '0xAutoCorpBizDemo001';
const MIN_SALE_PRICE = parseInt(process.env.MIN_SALE_PRICE_PER_QUINTAL) || 9000;
const TARGET_MARGIN = parseInt(process.env.TARGET_MARGIN_PERCENT) || 15;

// ============================================================
// State
// ============================================================
const state = {
  status: 'idle',           // idle | prospecting | outreach | negotiating | sold
  buyers: [],               // discovered buyers
  outreach_results: [],     // WhatsApp outreach responses
  confirmed_sales: [],      // completed deals
  pending_deliveries: [],   // waiting for LogisticsAgent
  events: []
};

// ============================================================
// A2A Protocol Endpoints
// ============================================================

app.get('/.well-known/agent.json', (req, res) => {
  res.json(require('./agent-card.json'));
});

app.post('/a2a/tasks', async (req, res) => {
  const { capability, params, input } = req.body;
  const normalized = params || input || {};
  const taskId = uuidv4();

  const task = {
    task_id: taskId,
    capability,
    status: 'accepted',
    created_at: new Date().toISOString()
  };

  res.json(task);

  // Execute async
  switch (capability) {
    case 'find_buyers':
      await findBuyers(taskId, normalized);
      break;
    case 'outreach':
      await runOutreach(taskId, normalized);
      break;
    case 'confirm_sale':
      await confirmSale(taskId, normalized);
      break;
    case 'full_sales_pipeline':
      await fullSalesPipeline(taskId, normalized);
      break;
    case 'delivery_notification':
      await handleDeliveryNotification(taskId, normalized);
      break;
  }
});

app.get('/a2a/tasks/:taskId', (req, res) => {
  const event = state.events.find(e => e.task_id === req.params.taskId);
  if (!event) return res.status(404).json({ error: 'Task not found' });
  res.json(event);
});

// ============================================================
// Direct API Endpoints
// ============================================================

app.get('/status', (req, res) => {
  res.json({
    agent_id: AGENT_ID,
    agent_name: AGENT_NAME,
    status: state.status,
    buyers_discovered: state.buyers.length,
    outreach_sent: state.outreach_results.length,
    confirmed_sales: state.confirmed_sales.length,
    pending_deliveries: state.pending_deliveries.length,
    min_sale_price: MIN_SALE_PRICE,
    target_margin: `${TARGET_MARGIN}%`,
    uptime: process.uptime()
  });
});

app.post('/find-buyers', async (req, res) => {
  const taskId = uuidv4();
  const result = await findBuyers(taskId, req.body || {});
  res.json(result);
});

app.post('/outreach', async (req, res) => {
  const taskId = uuidv4();
  const result = await runOutreach(taskId, req.body || {});
  res.json(result);
});

app.post('/sell', async (req, res) => {
  const taskId = uuidv4();
  const result = await fullSalesPipeline(taskId, req.body || {});
  res.json(result);
});

app.get('/sales', (req, res) => {
  res.json({ sales: state.confirmed_sales, total: state.confirmed_sales.length });
});

// ============================================================
// Core Logic
// ============================================================

/**
 * Find and rank Mumbai wholesale buyers
 */
async function findBuyers(taskId, params) {
  state.status = 'prospecting';

  console.log(`[${AGENT_NAME}] Searching for Mumbai wholesale buyers...`);

  await publishEvent('buyer_search_started', { task_id: taskId });

  try {
    const res = await axios.get(`${MOCK_API}/api/sales/buyers`);
    const buyers = res.data.data || [];

    // Rank buyers by reliability and offered price
    const ranked = buyers
      .map(b => ({
        ...b,
        score: (b.reliability_score || 0.8) * 40 +
               ((b.typical_price_per_quintal || 9500) / 100) * 0.5 +
               ((b.typical_volume_quintals || 20) >= (params.quantity || TARGET_MARGIN) ? 20 : 10)
      }))
      .sort((a, b) => b.score - a.score);

    state.buyers = ranked;

    console.log(`[${AGENT_NAME}] Found ${ranked.length} buyers. Top: ${ranked[0]?.business_name} (score: ${ranked[0]?.score.toFixed(1)})`);

    await publishEvent('buyers_discovered', {
      task_id: taskId,
      count: ranked.length,
      top_buyer: ranked[0]?.business_name,
      buyers_summary: ranked.map(b => ({
        name: b.business_name,
        price: b.typical_price_per_quintal,
        volume: b.typical_volume_quintals,
        score: b.score.toFixed(1)
      }))
    });

    return {
      status: 'ok',
      buyers: ranked,
      count: ranked.length,
      recommendation: ranked[0]?.business_name
    };

  } catch (err) {
    console.error(`[${AGENT_NAME}] Buyer search failed:`, err.message);
    state.status = 'idle';
    return { error: err.message };
  }
}

/**
 * Run WhatsApp outreach to top buyers
 */
async function runOutreach(taskId, params) {
  state.status = 'outreach';

  const buyers = state.buyers.length > 0 ? state.buyers : (await findBuyers(taskId, params)).buyers || [];
  const topN = params.top_n || 3;
  const quantity = params.quantity_quintals || 20;
  const offerPrice = params.offer_price || MIN_SALE_PRICE;

  console.log(`[${AGENT_NAME}] Sending WhatsApp outreach to top ${topN} buyers...`);

  const results = [];

  for (const buyer of buyers.slice(0, topN)) {
    try {
      const res = await axios.post(`${MOCK_API}/api/sales/outreach`, {
        buyer_id: buyer.id || buyer.buyer_id,
        commodity: 'Tur Dal (Arhar)',
        quantity_quintals: quantity,
        offered_price_per_quintal: offerPrice,
        message_type: 'whatsapp',
        delivery_timeline: '24-36 hours',
        quality_grade: 'A (Agmarknet certified)'
      });

      const outreach = res.data;
      results.push({
        buyer: buyer.business_name,
        buyer_id: buyer.id || buyer.buyer_id,
        status: outreach.data?.status || 'sent',
        response: outreach.data?.simulated_response || 'pending',
        interested: outreach.data?.buyer_interested
      });

      console.log(
        `[${AGENT_NAME}] → ${buyer.business_name}: ` +
        `${outreach.data?.buyer_interested ? '✅ INTERESTED' : '⏳ PENDING'}`
      );
    } catch (err) {
      results.push({
        buyer: buyer.business_name,
        status: 'failed',
        error: err.message
      });
    }
  }

  state.outreach_results = results;
  const interested = results.filter(r => r.interested);

  await publishEvent('outreach_complete', {
    task_id: taskId,
    sent: results.length,
    interested: interested.length,
    results: results
  });

  return {
    status: 'ok',
    sent: results.length,
    interested: interested.length,
    results
  };
}

/**
 * Confirm a sale with a buyer
 */
async function confirmSale(taskId, params) {
  state.status = 'negotiating';

  const { buyer_id, quantity_quintals, price_per_quintal, order_id } = params;
  const quantity = quantity_quintals || 20;
  const price = price_per_quintal || MIN_SALE_PRICE;

  console.log(`[${AGENT_NAME}] Confirming sale: ${quantity}q at ₹${price}/q to buyer ${buyer_id}`);

  try {
    const res = await axios.post(`${MOCK_API}/api/sales/confirm`, {
      buyer_id,
      commodity: 'Tur Dal (Arhar)',
      quantity_quintals: quantity,
      agreed_price_per_quintal: price,
      procurement_order_id: order_id,
      payment_method: 'x402_escrow'
    }, {
      headers: {
        'x-402-payment-proof': `0xsale_${uuidv4().slice(0, 8)}`,
        'x-402-payer-address': AGENT_WALLET,
        'x-402-business-contract': BUSINESS_CONTRACT
      }
    });

    const sale = {
      sale_id: uuidv4(),
      task_id: taskId,
      timestamp: new Date().toISOString(),
      buyer_id,
      buyer_name: state.buyers.find(b => (b.id || b.buyer_id) === buyer_id)?.business_name || buyer_id,
      quantity_quintals: quantity,
      price_per_quintal: price,
      total_revenue: quantity * price,
      order_id,
      confirmation: res.data,
      x402_payment: true
    };

    state.confirmed_sales.push(sale);
    state.status = 'sold';

    console.log(
      `[${AGENT_NAME}] ✅ Sale confirmed! ` +
      `${quantity}q × ₹${price}/q = ₹${quantity * price} from ${sale.buyer_name}`
    );

    await publishEvent('sale_confirmed', sale);

    await axios.post(`${MOCK_API}/api/events/publish`, {
      type: 'a2a_message',
      agent_id: AGENT_ID,
      agent_name: AGENT_NAME,
      action: 'report_sale_to_founder',
      details: {
        from_agent: AGENT_ID,
        to_agent: 'founder-agent',
        capability: 'sale_report',
        sale_id: sale.sale_id,
        total_revenue: sale.total_revenue,
        order_id: order_id
      }
    }).catch(() => {});

    return { status: 'confirmed', sale };

  } catch (err) {
    console.error(`[${AGENT_NAME}] Sale confirmation failed:`, err.message);
    state.status = 'idle';
    return { error: err.message };
  }
}

/**
 * Full sales pipeline: find buyers → outreach → confirm best deal
 */
async function fullSalesPipeline(taskId, params) {
  const quantity = params.quantity_quintals || 20;
  const minPrice = params.min_price_per_quintal || MIN_SALE_PRICE;

  console.log(`\n[${AGENT_NAME}] ═══ FULL SALES PIPELINE ═══`);
  console.log(`[${AGENT_NAME}] Selling ${quantity}q Tur Dal at min ₹${minPrice}/q`);

  await publishEvent('sales_pipeline_started', {
    task_id: taskId,
    quantity_quintals: quantity,
    min_price: minPrice
  });

  // Phase 1: Find buyers
  const buyerResult = await findBuyers(taskId, { quantity });
  if (!buyerResult.buyers || buyerResult.buyers.length === 0) {
    return { error: 'No buyers found' };
  }

  // Phase 2: Outreach
  const outreachResult = await runOutreach(taskId, {
    quantity_quintals: quantity,
    offer_price: minPrice,
    top_n: 3
  });

  // Phase 3: Confirm sale with best interested buyer
  const interested = state.outreach_results.filter(r => r.interested);
  if (interested.length > 0) {
    const bestBuyer = interested[0];
    const saleResult = await confirmSale(taskId, {
      buyer_id: bestBuyer.buyer_id,
      quantity_quintals: quantity,
      price_per_quintal: minPrice,
      order_id: params.order_id
    });

    return {
      status: 'pipeline_complete',
      buyers_found: buyerResult.count,
      outreach_sent: outreachResult.sent,
      interested: outreachResult.interested,
      sale: saleResult
    };
  }

  return {
    status: 'no_interested_buyers',
    buyers_found: buyerResult.count,
    outreach_sent: outreachResult.sent,
    interested: 0,
    next_step: 'Retry outreach with lower price or wait for market conditions'
  };
}

/**
 * Handle delivery notification from LogisticsAgent
 */
async function handleDeliveryNotification(taskId, params) {
  console.log(`[${AGENT_NAME}] 📦 Delivery notification received: ${params.shipment_id}`);

  state.pending_deliveries.push({
    ...params,
    received_at: new Date().toISOString()
  });

  await publishEvent('delivery_received', {
    task_id: taskId,
    shipment_id: params.shipment_id,
    action: 'Initiating buyer handoff and payment collection'
  });

  // Auto-trigger sales pipeline if we have a pending delivery
  if (state.confirmed_sales.length === 0) {
    console.log(`[${AGENT_NAME}] No pre-confirmed sale. Running sales pipeline now...`);
    await fullSalesPipeline(taskId, {
      quantity_quintals: params.quantity_quintals || 20,
      order_id: params.order_id
    });
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
  console.log('║  SalesAgent — AutoCorp Autonomous Seller                ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Port:        ${PORT}                                      ║`);
  console.log(`║  Agent ID:    ${AGENT_ID}                        ║`);
  console.log(`║  Wallet:      ${AGENT_WALLET}                  ║`);
  console.log(`║  Min Price:   ₹${MIN_SALE_PRICE}/q | Target Margin: ${TARGET_MARGIN}%         ║`);
  console.log('║  Protocol:    A2A + X402                                ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Endpoints:                                            ║');
  console.log('║    GET  /status       — Agent health & state            ║');
  console.log('║    POST /find-buyers  — Discover Mumbai buyers          ║');
  console.log('║    POST /outreach     — WhatsApp outreach to buyers     ║');
  console.log('║    POST /sell         — Full sales pipeline             ║');
  console.log('║    GET  /sales        — All confirmed sales             ║');
  console.log('║    A2A  /.well-known/agent.json                         ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  publishEvent('agent_online', {
    capabilities: ['find_buyers', 'outreach', 'confirm_sale', 'full_sales_pipeline'],
    protocol: 'a2a',
    wallet: AGENT_WALLET
  });
});
