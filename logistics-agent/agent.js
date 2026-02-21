/**
 * AutoCorp Logistics Agent
 * 
 * Autonomous logistics optimization agent that:
 * 1. Receives procurement-ready tasks from the Founder Agent (via A2A)
 * 2. Evaluates freight options using weighted multi-criteria scoring
 * 3. Books optimal transport via X402 machine-to-machine payment
 * 4. Tracks shipment in real-time via SSE
 * 5. Confirms delivery and notifies Sales Agent
 * 
 * Architecture:
 *   - ReAct reasoning (all thoughts visible in Glassbox dashboard)
 *   - A2A protocol for inter-agent communication
 *   - X402 for autonomous payments
 *   - Express server for receiving A2A tasks
 */

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const ReActEngine = require('./src/react-engine');
const FreightEvaluator = require('./src/freight-evaluator');
const ShipmentTracker = require('./src/shipment-tracker');
const { pipelineReasonWithLLM, assessBookingWithLLM, isLLMAvailable, getLLMInfo } = require('./src/gemini-llm');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3002;
const MOCK_API = process.env.MOCK_API_URL || 'http://localhost:3001';
const AGENT_ID = process.env.AGENT_ID || 'logistics-agent-001';
const AGENT_NAME = process.env.AGENT_NAME || 'LogisticsAgent';
const AGENT_WALLET = process.env.AGENT_WALLET || '0xLogisticsAgentDemo001';
const BUSINESS_CONTRACT = process.env.BUSINESS_CONTRACT || '0xAutoCorpBizDemo001';

// Core components
const react = new ReActEngine();
const evaluator = new FreightEvaluator(react);
const tracker = new ShipmentTracker(react);

// Track active tasks
const activeTasks = new Map();

// ============================================================
// A2A Protocol Endpoints
// ============================================================

/**
 * GET /.well-known/agent.json — A2A Agent Card discovery
 */
app.get('/.well-known/agent.json', (req, res) => {
  const agentCard = require('./agent-card.json');
  res.json(agentCard);
});

/**
 * POST /a2a/tasks — Receive a new task from another agent
 * This is the A2A standard task submission endpoint.
 * 
 * Expected payload (A2A Task format):
 * {
 *   "task_id": "uuid",
 *   "capability": "evaluate_freight" | "book_transport" | "track_shipment",
 *   "from_agent": "procurement-agent-001",
 *   "input": { ... capability-specific data ... }
 * }
 */
app.post('/a2a/tasks', async (req, res) => {
  const { task_id, capability, from_agent, input, params } = req.body;
  const normalizedInput = input || params || {};

  if (!capability || !normalizedInput) {
    return res.status(400).json({
      error: 'Missing capability or input in A2A task'
    });
  }

  const taskId = task_id || uuidv4();

  // Acknowledge immediately (A2A async pattern)
  res.json({
    task_id: taskId,
    status: 'accepted',
    agent_id: AGENT_ID,
    message: `Task ${capability} accepted. Will process asynchronously.`
  });

  // Process asynchronously
  processTask(taskId, capability, from_agent, normalizedInput).catch(err => {
    console.error(`[Agent] Task ${taskId} failed:`, err.message);
  });
});

/**
 * GET /a2a/tasks/:taskId — Check task status (A2A polling)
 */
app.get('/a2a/tasks/:taskId', (req, res) => {
  const task = activeTasks.get(req.params.taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  res.json(task);
});

/**
 * GET /a2a/tasks — List all tasks
 */
app.get('/a2a/tasks', (req, res) => {
  const tasks = Array.from(activeTasks.values())
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ tasks, total: tasks.length });
});

// ============================================================
// Direct API Endpoints (for demo/testing)
// ============================================================

/**
 * POST /evaluate — Directly trigger freight evaluation
 */
app.post('/evaluate', async (req, res) => {
  const { quantity_quintals, max_cost_per_quintal, max_delivery_hours, jodhpur_price, mumbai_price } = req.body;

  if (!quantity_quintals) {
    return res.status(400).json({ error: 'quantity_quintals required' });
  }

  try {
    react.reset();
    const spread = (jodhpur_price && mumbai_price) ? mumbai_price - jodhpur_price : undefined;
    const result = await evaluator.evaluate(quantity_quintals, {
      maxCostPerQuintal: max_cost_per_quintal,
      maxDeliveryHours: max_delivery_hours
    }, {
      jodhpur_price,
      mumbai_price,
      spread
    });

    res.json({
      status: 'ok',
      evaluation: result,
      llm_powered: result.llm_used || false,
      reasoning_trace: react.getTrace()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /book — Directly trigger freight booking
 */
app.post('/book', async (req, res) => {
  const { freight_id, quantity_quintals, order_id } = req.body;

  if (!freight_id || !quantity_quintals) {
    return res.status(400).json({ error: 'freight_id and quantity_quintals required' });
  }

  try {
    react.reset();
    const result = await bookFreight(freight_id, quantity_quintals, order_id || `manual-${uuidv4().slice(0, 8)}`);
    res.json({
      status: 'ok',
      booking: result,
      reasoning_trace: react.getTrace()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /execute-full — Execute the full logistics pipeline
 * (Evaluate → Select Best → Book → Track → Notify)
 * 
 * This is the "one button demo" endpoint for the hackathon.
 */
app.post('/execute-full', async (req, res) => {
  const { quantity_quintals, order_id, max_cost_per_quintal, max_delivery_hours } = req.body;

  if (!quantity_quintals) {
    return res.status(400).json({ error: 'quantity_quintals required' });
  }

  const taskId = uuidv4();
  
  // Respond immediately
  res.json({
    task_id: taskId,
    status: 'executing',
    message: 'Full logistics pipeline started. Watch the Glassbox dashboard for live reasoning.'
  });

  // Execute the full pipeline
  executeFullPipeline(taskId, {
    quantity_quintals,
    order_id: order_id || `dal-order-${uuidv4().slice(0, 8)}`,
    max_cost_per_quintal,
    max_delivery_hours
  }).catch(err => {
    console.error(`[Agent] Full pipeline ${taskId} failed:`, err.message);
  });
});

/**
 * GET /status — Agent status
 */
app.get('/status', (req, res) => {
  const llmInfo = getLLMInfo();
  res.json({
    agent_id: AGENT_ID,
    agent_name: AGENT_NAME,
    status: 'active',
    wallet: AGENT_WALLET,
    business_contract: BUSINESS_CONTRACT,
    active_tasks: activeTasks.size,
    reasoning_steps: react.stepCount,
    llm_available: llmInfo.available,
    llm_provider: llmInfo.provider,
    llm_model: llmInfo.model,
    uptime: process.uptime()
  });
});

// ============================================================
// Core Logic
// ============================================================

/**
 * Process an A2A task based on capability
 */
async function processTask(taskId, capability, fromAgent, input) {
  const task = {
    task_id: taskId,
    capability,
    from_agent: fromAgent,
    status: 'in_progress',
    created_at: new Date().toISOString(),
    result: null,
    error: null
  };
  activeTasks.set(taskId, task);

  try {
    react.reset();

    await react.think(
      `Received A2A task from ${fromAgent || 'unknown'}. Capability: ${capability}. ` +
      `Task ID: ${taskId}. Processing now.`
    );

    let result;
    switch (capability) {
      case 'evaluate_freight':
        result = await evaluator.evaluate(
          input.quantity_quintals,
          {
            maxCostPerQuintal: input.max_cost_per_quintal,
            maxDeliveryHours: input.max_delivery_hours
          }
        );
        break;

      case 'book_transport':
        result = await bookFreight(input.freight_id, input.quantity_quintals, input.order_id);
        break;

      case 'track_shipment':
        result = await tracker.getStatus(input.shipment_id);
        break;

      case 'full_pipeline':
        await executeFullPipeline(taskId, {
          quantity_quintals: input.quantity_quintals,
          order_id: input.order_id,
          max_cost_per_quintal: input.max_cost_per_quintal,
          max_delivery_hours: input.max_delivery_hours
        });
        result = { status: 'started_full_pipeline', order_id: input.order_id };
        break;

      default:
        throw new Error(`Unknown capability: ${capability}`);
    }

    task.status = 'completed';
    task.result = result;
    task.completed_at = new Date().toISOString();

    await react.think(
      `Task ${taskId} (${capability}) completed successfully. ` +
      `Sending result back to ${fromAgent || 'requester'}.`
    );

    // A2A push notification (notify calling agent)
    if (fromAgent) {
      await notifyAgent(fromAgent, taskId, task);
    }

  } catch (err) {
    task.status = 'failed';
    task.error = err.message;
    console.error(`[Agent] Task ${taskId} failed:`, err);
  }
}

/**
 * Book freight with X402 payment
 */
async function bookFreight(freightId, quantityQuintals, orderId) {
  await react.think(
    `Booking freight: ${freightId} for ${quantityQuintals} quintals. ` +
    `Will pay using X402 protocol from business contract ${BUSINESS_CONTRACT}.`
  );

  await react.act(
    `Sending X402 payment proof and booking request to freight API`,
    'x402_payment',
    { freight_id: freightId, quantity: quantityQuintals }
  );

  try {
    const response = await axios.post(`${MOCK_API}/api/freight/book`, {
      freight_option_id: freightId,
      quantity_quintals: quantityQuintals,
      pickup_order_id: orderId,
      pickup_contact: 'AutoCorp Agent (automated)',
      delivery_contact: 'Mumbai Warehouse - AutoCorp'
    }, {
      headers: {
        'x-402-payment-proof': `0xfreight_payment_${uuidv4().slice(0, 8)}`,
        'x-402-payer-address': AGENT_WALLET,
        'x-402-business-contract': BUSINESS_CONTRACT
      }
    });

    const booking = response.data;

    const shipmentData = booking.data;
    const providerName = shipmentData.freight_option?.provider || shipmentData.provider || 'Unknown';

    await react.observe(
      `Freight booked successfully! Shipment ID: ${shipmentData.shipment_id}. ` +
      `Provider: ${providerName}. ETA: ${shipmentData.estimated_delivery}. ` +
      `Cost: ₹${shipmentData.total_cost}. Now starting real-time tracking.`,
      {
        shipment_id: shipmentData.shipment_id,
        provider: providerName,
        cost: shipmentData.total_cost
      }
    );

    // Start tracking immediately
    await tracker.startTracking(shipmentData.shipment_id, {
      onUpdate: (checkpoint) => {
        console.log(`[Agent] Checkpoint: ${checkpoint.location} - ${checkpoint.status}`);
      },
      onDelivery: async (data) => {
        console.log(`[Agent] 🎉 DELIVERY CONFIRMED at ${data.location}`);
        
        // Publish delivery event
        await axios.post(`${MOCK_API}/api/events/publish`, {
          type: 'delivery_complete',
          agent_id: AGENT_ID,
          agent_name: AGENT_NAME,
          action: 'delivery_confirmed',
          details: {
            shipment_id: shipmentData.shipment_id,
            location: data.location,
            order_id: orderId,
            message: 'Goods delivered. Sales Agent can proceed with buyer handoff.'
          }
        }).catch(() => {});

        await axios.post(`${MOCK_API}/api/events/publish`, {
          type: 'a2a_message',
          agent_id: AGENT_ID,
          agent_name: AGENT_NAME,
          action: 'notify_delivery',
          details: {
            from_agent: AGENT_ID,
            to_agent: 'sales-agent-001',
            capability: 'delivery_notification',
            shipment_id: shipmentData.shipment_id,
            order_id: orderId,
            location: data.location,
            message: 'Delivery confirmed, forwarding to Sales agent'
          }
        }).catch(() => {});

        await axios.post('http://localhost:3004/a2a/tasks', {
          capability: 'delivery_notification',
          from_agent: AGENT_ID,
          input: {
            shipment_id: shipmentData.shipment_id,
            quantity_quintals: quantityQuintals,
            order_id: orderId,
            location: data.location,
            delivered_at: new Date().toISOString()
          }
        }).catch(() => {});
      }
    });

    return shipmentData;

  } catch (err) {
    if (err.response && err.response.status === 402) {
      await react.observe(
        `Payment required! The freight API returned HTTP 402. ` +
        `Need to provide valid X402 payment proof. Error: ${err.response.data?.error || 'Payment Required'}`,
        { status: 402, error: err.response.data }
      );
    }
    throw err;
  }
}

/**
 * Execute the full logistics pipeline end-to-end
 */
async function executeFullPipeline(taskId, params) {
  const { quantity_quintals, order_id, max_cost_per_quintal, max_delivery_hours } = params;

  const task = {
    task_id: taskId,
    capability: 'full_pipeline',
    status: 'in_progress',
    created_at: new Date().toISOString(),
    steps: {},
    result: null
  };
  activeTasks.set(taskId, task);

  react.reset();

  // Step 0: Fetch current market prices for LLM context
  let jodhpur_price = null, mumbai_price = null, spread = null;
  try {
    const pricesRes = await axios.get(`${MOCK_API}/api/enam/prices/current`);
    jodhpur_price = pricesRes.data.data?.jodhpur?.price_per_quintal;
    mumbai_price = pricesRes.data.data?.mumbai?.price_per_quintal;
    spread = pricesRes.data.data?.spread;
  } catch (e) {
    console.log('[Agent] Could not fetch live prices for LLM context');
  }

  // Step 1: Context awareness
  await react.think(
    `FULL LOGISTICS PIPELINE initiated. Order: ${order_id}. ` +
    `Quantity: ${quantity_quintals} quintals of Tur Dal. ` +
    `Route: Jodhpur (Rajasthan) → Mumbai (Vashi). ` +
    (spread ? `Current spread: ₹${spread}/q (Jodhpur ₹${jodhpur_price}, Mumbai ₹${mumbai_price}). ` : '') +
    `My job: Find cheapest freight within time/budget constraints, book it, track it.` +
    (isLLMAvailable() ? ' Gemini 2.0 Flash is online for AI-powered reasoning.' : '')
  );

  // Step 2: Evaluate freight options (LLM-powered if available)
  await react.act(
    `Phase 1: FREIGHT EVALUATION — Querying all available transport options` +
    (isLLMAvailable() ? ' (Gemini AI reasoning enabled)' : ''),
    'pipeline_step',
    { phase: 'evaluation', llm_available: isLLMAvailable() }
  );

  const maxCost = max_cost_per_quintal || parseInt(process.env.MAX_FREIGHT_COST_PER_QUINTAL) || 250;
  const maxHours = max_delivery_hours || parseInt(process.env.MAX_DELIVERY_HOURS) || 48;

  const evaluation = await evaluator.evaluate(quantity_quintals, {
    maxCostPerQuintal: maxCost,
    maxDeliveryHours: maxHours
  }, {
    jodhpur_price,
    mumbai_price,
    spread
  });

  task.steps.evaluation = evaluation;

  // Step 3: Book the recommended option
  const recommended = evaluation.recommended;
  await react.act(
    `Phase 2: FREIGHT BOOKING — Booking ${recommended.provider} ` +
    `(${evaluation.decision_source === 'gemini-llm' ? 'AI-selected' : 'algo-ranked'}, ` +
    `score: ${recommended.total_score}/100)`,
    'pipeline_step',
    { phase: 'booking', provider: recommended.provider, decision_source: evaluation.decision_source }
  );

  const booking = await bookFreight(recommended.freight_id, quantity_quintals, order_id);
  task.steps.booking = booking;

  // Step 3.5: LLM booking assessment (if available)
  if (isLLMAvailable()) {
    try {
      await assessBookingWithLLM(booking, react);
    } catch (err) {
      console.log('[Agent] LLM booking assessment failed (non-critical):', err.message);
    }
  }

  // Step 4: Update task status
  task.status = 'tracking';
  const bookingProvider = booking.freight_option?.provider || 'Unknown';
  task.result = {
    shipment_id: booking.shipment_id,
    provider: bookingProvider,
    cost: booking.total_cost,
    eta: booking.estimated_delivery,
    evaluation_score: recommended.total_score,
    decision_source: evaluation.decision_source,
    llm_model: evaluation.llm_model,
    order_id
  };

  await react.think(
    `Pipeline in TRACKING phase. Shipment ${booking.shipment_id} is en route. ` +
    `Provider: ${bookingProvider}. Cost: ₹${booking.total_cost}. ` +
    `Decision by: ${evaluation.decision_source}. ` +
    `Monitoring checkpoints via SSE. Will notify on delivery.`
  );

  console.log(`[Agent] Full pipeline ${taskId}: Now tracking shipment ${booking.shipment_id}`);
}

/**
 * Notify another agent about task completion (A2A push)
 */
async function notifyAgent(agentId, taskId, task) {
  // In a real system, we'd look up the agent's endpoint from a registry
  // For the hackathon demo, we publish to the event bus
  try {
    await axios.post(`${MOCK_API}/api/events/publish`, {
      type: 'a2a_notification',
      agent_id: AGENT_ID,
      agent_name: AGENT_NAME,
      action: 'task_completed',
      details: {
        task_id: taskId,
        target_agent: agentId,
        capability: task.capability,
        status: task.status,
        result_summary: task.result ? JSON.stringify(task.result).slice(0, 200) : null
      }
    });
  } catch (err) {
    console.error('[Agent] Failed to notify agent:', err.message);
  }
}

// ============================================================
// Start
// ============================================================

app.listen(PORT, () => {
  const llmStatus = isLLMAvailable()
    ? `ONLINE (${process.env.GEMINI_MODEL || 'gemini-2.0-flash'})`
    : 'OFFLINE (no API key)';

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║       AutoCorp Logistics Agent v2.0.0 (LLM)        ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Agent:     ${AGENT_ID}                ║`);
  console.log(`║  Server:    http://localhost:${PORT}                   ║`);
  console.log(`║  A2A Card:  http://localhost:${PORT}/.well-known/agent.json ║`);
  console.log(`║  LLM:       ${llmStatus.padEnd(39)}║`);
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  Endpoints:                                         ║');
  console.log('║    POST /a2a/tasks — Receive A2A task               ║');
  console.log('║    POST /evaluate — Evaluate freight (LLM-powered)  ║');
  console.log('║    POST /book — Book transport                       ║');
  console.log('║    POST /execute-full — Full pipeline demo           ║');
  console.log('║    GET  /status — Agent status + LLM info            ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Wallet:    ${AGENT_WALLET}          ║`);
  console.log(`║  Business:  ${BUSINESS_CONTRACT}          ║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  // Announce ourselves to the event bus
  axios.post(`${MOCK_API}/api/events/publish`, {
    type: 'agent_online',
    agent_id: AGENT_ID,
    agent_name: AGENT_NAME,
    action: 'agent_started',
    details: {
      capabilities: ['evaluate_freight', 'book_transport', 'track_shipment'],
      endpoint: `http://localhost:${PORT}`,
      wallet: AGENT_WALLET
    }
  }).catch(() => console.log('[Agent] Warning: Could not reach event bus. Is mock API running?'));
});

module.exports = app;
