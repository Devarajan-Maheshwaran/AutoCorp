/**
 * Freight / Logistics Mock API Routes
 * 
 * Simulates freight aggregator APIs (Porter Intercity, Rivigo, BlackBuck)
 * - List available freight options for Jodhpur → Mumbai
 * - Book transport (X402 required)
 * - Track shipment with realistic checkpoint updates
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const freightOptions = require('../data/freight_options.json');
const { x402Required } = require('../middleware/x402');

// In-memory shipment tracker
const shipments = new Map();

/**
 * GET /api/freight/options?quantity_quintals=20
 * List available freight options for the route
 */
router.get('/options', (req, res) => {
  const qty = parseInt(req.query.quantity_quintals) || 20;

  const available = freightOptions
    .filter(f => f.available && qty >= f.min_load_quintals && qty <= f.max_load_quintals)
    .map(f => ({
      ...f,
      estimated_cost: f.cost_per_quintal * qty,
      estimated_cost_display: `₹${(f.cost_per_quintal * qty).toLocaleString()}`,
      cost_per_quintal_display: `₹${f.cost_per_quintal}/quintal`
    }));

  res.json({
    status: 'ok',
    route: 'Jodhpur → Mumbai (Vashi)',
    quantity_quintals: qty,
    options_count: available.length,
    data: available
  });
});

/**
 * POST /api/freight/book
 * Book a freight shipment
 * 
 * X402 REQUIRED — agent pays for transport
 * 
 * Body: {
 *   freight_option_id: "freight_rivigo_001",
 *   pickup_order_id: "ORD-ABCD1234",
 *   quantity_quintals: 20,
 *   pickup_contact: "Ramesh Kumar",
 *   pickup_location: "Jodhpur Agricultural Produce Market, Gate 3",
 *   delivery_contact: "Sales Agent",
 *   delivery_location: "Vashi APMC, Mumbai",
 *   agent_id: "logistics_agent_001",
 *   business_contract: "0x..."
 * }
 */
router.post('/book',
  (req, res, next) => {
    const { freight_option_id, quantity_quintals } = req.body;
    const option = freightOptions.find(f => f.id === freight_option_id);
    if (!option) {
      return res.status(404).json({ error: `Freight option ${freight_option_id} not found` });
    }
    const totalCost = option.cost_per_quintal * (quantity_quintals || 20);
    const costWei = BigInt(totalCost) * BigInt(1e15);
    x402Required(costWei.toString(), 'transport')(req, res, next);
  },
  (req, res) => {
    const {
      freight_option_id,
      pickup_order_id,
      quantity_quintals = 20,
      pickup_contact,
      pickup_location,
      delivery_contact,
      delivery_location,
      agent_id,
      business_contract
    } = req.body;

    const option = freightOptions.find(f => f.id === freight_option_id);
    const totalCost = option.cost_per_quintal * quantity_quintals;

    const shipment = {
      shipment_id: `SHP-${uuidv4().slice(0, 8).toUpperCase()}`,
      status: 'booked',
      freight_option: option,
      pickup_order_id,
      quantity_quintals,
      total_cost: totalCost,
      pickup_contact: pickup_contact || 'Commission Agent',
      pickup_location: pickup_location || 'Jodhpur Agricultural Produce Market, Gate 3',
      delivery_contact: delivery_contact || 'Sales Agent',
      delivery_location: delivery_location || 'Vashi APMC, Mumbai',
      agent_id,
      business_contract,
      x402_payment: req.x402Payment,
      booked_at: new Date().toISOString(),
      estimated_delivery: new Date(Date.now() + option.estimated_hours * 60 * 60 * 1000).toISOString(),
      // Tracking: simulate checkpoints over time
      tracking: option.checkpoints.map((cp, idx) => ({
        ...cp,
        status: idx === 0 ? 'reached' : 'pending',
        actual_time: idx === 0 ? new Date().toISOString() : null,
        estimated_time: new Date(Date.now() + cp.eta_hours * 60 * 60 * 1000).toISOString()
      })),
      current_location: option.checkpoints[0].location,
      driver: {
        name: 'Suresh Yadav',
        phone: '+91-9XXX-XXXXXX',
        vehicle: option.vehicle_type,
        vehicle_number: 'RJ-14-GA-' + Math.floor(1000 + Math.random() * 9000)
      }
    };

    shipments.set(shipment.shipment_id, shipment);

    // Simulate checkpoint progression
    _simulateCheckpoints(shipment);

    console.log(`[Freight] Booked: ${shipment.shipment_id} — ${option.provider} — ${quantity_quintals}q — ₹${totalCost}`);

    res.status(201).json({
      status: 'ok',
      message: `[SIMULATED] Transport booked via ${option.provider}`,
      data: shipment
    });
  }
);

/**
 * Simulate checkpoint progression for a shipment
 * Each checkpoint is reached after a proportional delay
 */
function _simulateCheckpoints(shipment) {
  const checkpoints = shipment.tracking;
  const totalHours = shipment.freight_option.estimated_hours;
  
  // In demo: compress total hours into minutes
  // 36 real hours → 3 minutes of demo time (1 hour = 5 seconds)
  const msPerSimHour = parseInt(process.env.MS_PER_SIM_HOUR) || 5000;

  checkpoints.forEach((cp, idx) => {
    if (idx === 0) return; // Already "reached" at booking

    const delayMs = cp.eta_hours * msPerSimHour;

    setTimeout(() => {
      cp.status = 'reached';
      cp.actual_time = new Date().toISOString();
      shipment.current_location = cp.location;

      if (cp.type === 'delivery') {
        shipment.status = 'delivered';
        console.log(`[Freight] ${shipment.shipment_id} DELIVERED to ${cp.location}`);
      } else {
        shipment.status = 'in_transit';
        console.log(`[Freight] ${shipment.shipment_id} reached ${cp.location}`);
      }
    }, delayMs);
  });
}

/**
 * GET /api/freight/track/:shipmentId
 * Real-time tracking of a shipment
 */
router.get('/track/:shipmentId', (req, res) => {
  const shipment = shipments.get(req.params.shipmentId);
  if (!shipment) {
    return res.status(404).json({ error: 'Shipment not found' });
  }
  res.json({
    status: 'ok',
    data: {
      shipment_id: shipment.shipment_id,
      status: shipment.status,
      current_location: shipment.current_location,
      tracking: shipment.tracking,
      driver: shipment.driver,
      estimated_delivery: shipment.estimated_delivery,
      booked_at: shipment.booked_at
    }
  });
});

/**
 * GET /api/freight/track/:shipmentId/stream
 * SSE endpoint for real-time tracking updates
 */
router.get('/track/:shipmentId/stream', (req, res) => {
  const shipment = shipments.get(req.params.shipmentId);
  if (!shipment) {
    return res.status(404).json({ error: 'Shipment not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const interval = setInterval(() => {
    res.write(`data: ${JSON.stringify({
      shipment_id: shipment.shipment_id,
      status: shipment.status,
      current_location: shipment.current_location,
      tracking: shipment.tracking
    })}\n\n`);

    if (shipment.status === 'delivered') {
      clearInterval(interval);
      res.end();
    }
  }, 3000);

  req.on('close', () => clearInterval(interval));
});

/**
 * GET /api/freight/shipments
 * List all shipments (for dashboard)
 */
router.get('/shipments', (req, res) => {
  const contractFilter = req.query.business_contract;
  let all = Array.from(shipments.values());
  if (contractFilter) {
    all = all.filter(s => s.business_contract === contractFilter);
  }
  res.json({
    status: 'ok',
    count: all.length,
    data: all
  });
});

module.exports = router;
