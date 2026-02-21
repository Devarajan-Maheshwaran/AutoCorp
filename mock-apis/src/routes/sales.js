/**
 * Sales / Buyer Mock API Routes
 * 
 * Simulates Mumbai wholesale buyer interactions:
 * - List available buyers
 * - Send outreach (WhatsApp simulation)
 * - Negotiate price
 * - Confirm sale
 * - Generate payment link (mock)
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const buyers = require('../data/mumbai_buyers.json');

// In-memory sales tracker
const sales = new Map();
const outreachLog = [];

/**
 * GET /api/sales/buyers
 * List all available Mumbai buyers
 */
router.get('/buyers', (req, res) => {
  const activeBuyers = buyers.filter(b => b.active);
  res.json({
    status: 'ok',
    market: 'Mumbai Wholesale',
    count: activeBuyers.length,
    data: activeBuyers
  });
});

/**
 * POST /api/sales/outreach
 * Simulate WhatsApp Business outreach to a buyer
 * 
 * Body: {
 *   buyer_id: "buyer_001",
 *   commodity: "Tur/Arhar Dal",
 *   quantity_quintals: 20,
 *   asking_price_per_quintal: 9500,
 *   quality_grade: "A",
 *   delivery_date: "2025-12-10",
 *   agent_id: "sales_agent_001"
 * }
 */
router.post('/outreach', (req, res) => {
  const {
    buyer_id,
    commodity = 'Tur/Arhar Dal',
    quantity_quintals,
    asking_price_per_quintal,
    quality_grade = 'A',
    delivery_date,
    agent_id
  } = req.body;

  const buyer = buyers.find(b => b.id === buyer_id);
  if (!buyer) {
    return res.status(404).json({ error: `Buyer ${buyer_id} not found` });
  }

  // Simulate buyer response logic
  const priceDiff = asking_price_per_quintal - buyer.max_price_per_quintal;
  let response;

  if (priceDiff <= 0) {
    // Asking price is within buyer's range — accept
    response = {
      decision: 'accepted',
      agreed_price: asking_price_per_quintal,
      message: `[SIMULATED WhatsApp] ${buyer.name}: "Haan bhai, ₹${asking_price_per_quintal}/quintal theek hai. ${quantity_quintals} quintal bhej do. Payment turant UPI se."`
    };
  } else if (priceDiff <= 300) {
    // Slightly above — negotiate
    const counterPrice = buyer.max_price_per_quintal + Math.round(priceDiff * 0.4);
    response = {
      decision: 'counter_offer',
      counter_price: counterPrice,
      message: `[SIMULATED WhatsApp] ${buyer.name}: "₹${asking_price_per_quintal} zyada hai boss. ₹${counterPrice} chalega? Quality A hai toh ₹${counterPrice} last price."`
    };
  } else {
    // Too expensive — reject
    response = {
      decision: 'rejected',
      reason: 'price_too_high',
      message: `[SIMULATED WhatsApp] ${buyer.name}: "₹${asking_price_per_quintal}? Nahi bhai, itna budget nahi hai. Market mein ₹${buyer.max_price_per_quintal} chal raha hai."`
    };
  }

  const outreach = {
    outreach_id: `OUT-${uuidv4().slice(0, 8).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    buyer_id,
    buyer_name: buyer.name,
    buyer_location: buyer.location,
    commodity,
    quantity_quintals,
    asking_price: asking_price_per_quintal,
    quality_grade,
    delivery_date,
    agent_id,
    channel: 'WhatsApp Business API [SIMULATED]',
    response
  };

  outreachLog.push(outreach);
  console.log(`[Sales] Outreach to ${buyer.name}: ${response.decision} @ ₹${response.agreed_price || response.counter_price || asking_price_per_quintal}`);

  res.json({
    status: 'ok',
    data: outreach
  });
});

/**
 * POST /api/sales/confirm
 * Confirm a sale after negotiation
 * 
 * Body: {
 *   buyer_id: "buyer_001",
 *   quantity_quintals: 20,
 *   agreed_price_per_quintal: 9500,
 *   procurement_order_id: "ORD-ABCD1234",
 *   shipment_id: "SHP-EFGH5678",
 *   agent_id: "sales_agent_001",
 *   business_contract: "0x..."
 * }
 */
router.post('/confirm', (req, res) => {
  const {
    buyer_id,
    quantity_quintals,
    agreed_price_per_quintal,
    procurement_order_id,
    shipment_id,
    agent_id,
    business_contract
  } = req.body;

  const buyer = buyers.find(b => b.id === buyer_id);
  if (!buyer) {
    return res.status(404).json({ error: `Buyer ${buyer_id} not found` });
  }

  const totalRevenue = agreed_price_per_quintal * quantity_quintals;

  const sale = {
    sale_id: `SALE-${uuidv4().slice(0, 8).toUpperCase()}`,
    status: 'confirmed',
    buyer_id,
    buyer_name: buyer.name,
    buyer_location: buyer.location,
    quantity_quintals,
    price_per_quintal: agreed_price_per_quintal,
    total_revenue: totalRevenue,
    procurement_order_id,
    shipment_id,
    agent_id,
    business_contract,
    confirmed_at: new Date().toISOString(),
    payment: {
      method: 'UPI [SIMULATED]',
      status: 'pending',
      payment_link: `https://rzp.io/mock/${uuidv4().slice(0, 8)}`,
      amount: totalRevenue,
      amount_display: `₹${totalRevenue.toLocaleString()}`
    }
  };

  // Simulate payment arriving after a short delay
  setTimeout(() => {
    sale.payment.status = 'completed';
    sale.payment.completed_at = new Date().toISOString();
    sale.payment.upi_ref = `UPI-${uuidv4().slice(0, 12).toUpperCase()}`;
    console.log(`[Sales] Payment received for ${sale.sale_id}: ₹${totalRevenue}`);
  }, parseInt(process.env.PAYMENT_DELAY_MS) || 5000);

  sales.set(sale.sale_id, sale);
  console.log(`[Sales] Sale confirmed: ${sale.sale_id} — ${quantity_quintals}q @ ₹${agreed_price_per_quintal} = ₹${totalRevenue}`);

  res.status(201).json({
    status: 'ok',
    message: '[SIMULATED] Sale confirmed. Payment link sent to buyer.',
    data: sale
  });
});

/**
 * GET /api/sales/:saleId
 * Get sale status (including payment)
 */
router.get('/:saleId', (req, res) => {
  const sale = sales.get(req.params.saleId);
  if (!sale) {
    return res.status(404).json({ error: 'Sale not found' });
  }
  res.json({ status: 'ok', data: sale });
});

/**
 * GET /api/sales
 * List all sales (for dashboard)
 */
router.get('/', (req, res) => {
  const contractFilter = req.query.business_contract;
  let allSales = Array.from(sales.values());
  if (contractFilter) {
    allSales = allSales.filter(s => s.business_contract === contractFilter);
  }
  res.json({
    status: 'ok',
    count: allSales.length,
    data: allSales,
    outreach_log: outreachLog.slice(-20) // last 20 outreach attempts
  });
});

module.exports = router;
