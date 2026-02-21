/**
 * AutoCorp Mock API Server
 * 
 * Central API server simulating India's physical infrastructure:
 * - eNAM (mandi prices + buy orders) with REAL Agmarknet data
 * - Freight (Porter/Rivigo/BlackBuck) with checkpoint simulation
 * - Sales (Mumbai wholesalers + WhatsApp simulation)
 * - Events (Glassbox SSE stream for dashboard)
 * 
 * All paid endpoints support X402 machine-to-machine payment protocol.
 * Price data is replayed from actual historical Agmarknet prices.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const priceEngine = require('./priceEngine');
const enamRoutes = require('./routes/enam');
const freightRoutes = require('./routes/freight');
const salesRoutes = require('./routes/sales');
const { router: eventsRouter, publishEvent } = require('./routes/events');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-402-payment-proof',
    'x-402-payer-address',
    'x-402-business-contract'
  ]
}));
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/api/enam', enamRoutes);
app.use('/api/freight', freightRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/events', eventsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'AutoCorp Mock API Server',
    version: '1.0.0',
    uptime: process.uptime(),
    price_engine: priceEngine.getStatus(),
    endpoints: {
      enam: '/api/enam',
      freight: '/api/freight',
      sales: '/api/sales',
      events: '/api/events'
    },
    x402: {
      protocol: 'X402 (HTTP 402 Machine-to-Machine Payments)',
      network: 'polygon_amoy',
      token: 'MATIC (testnet)'
    }
  });
});

// API documentation
app.get('/api', (req, res) => {
  res.json({
    name: 'AutoCorp Mock API Server',
    description: 'Simulates India physical infrastructure for autonomous dal arbitrage business',
    routes: {
      'GET  /api/health': 'Health check + all endpoints',
      'GET  /api/enam/prices/current': 'Current live mandi prices (Jodhpur + Mumbai)',
      'GET  /api/enam/prices/history': 'Price history (?market=jodhpur|mumbai&limit=50)',
      'GET  /api/enam/prices/stream': 'SSE: Real-time price ticks',
      'POST /api/enam/orders': 'Place buy order [X402]',
      'GET  /api/enam/orders/:id': 'Order status',
      'GET  /api/enam/orders': 'List all orders',
      'GET  /api/freight/options': 'Available transport (?quantity_quintals=20)',
      'POST /api/freight/book': 'Book transport [X402]',
      'GET  /api/freight/track/:id': 'Track shipment',
      'GET  /api/freight/track/:id/stream': 'SSE: Real-time tracking',
      'GET  /api/freight/shipments': 'List all shipments',
      'GET  /api/sales/buyers': 'List Mumbai buyers',
      'POST /api/sales/outreach': 'Send buyer outreach [SIMULATED WhatsApp]',
      'POST /api/sales/confirm': 'Confirm sale',
      'GET  /api/sales/:id': 'Sale status (incl payment)',
      'GET  /api/sales': 'List all sales',
      'GET  /api/events/stream': 'SSE: Glassbox event stream (dashboard)',
      'GET  /api/events/history': 'Event history (?limit=100&type=agent_action)',
      'POST /api/events/publish': 'Publish event (agents use this)',
      'GET  /api/events/payments': 'X402 payment ledger'
    }
  });
});

// Start server + price engine
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║         AutoCorp Mock API Server v1.0.0             ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Server:    http://localhost:${PORT}                   ║`);
  console.log(`║  API Docs:  http://localhost:${PORT}/api               ║`);
  console.log(`║  Health:    http://localhost:${PORT}/api/health         ║`);
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  Price SSE: /api/enam/prices/stream                 ║');
  console.log('║  Event SSE: /api/events/stream (Glassbox Dashboard) ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  Data: Real Agmarknet prices (Tur/Arhar Dal)        ║');
  console.log('║  Markets: Jodhpur (Rajasthan) + Vashi (Mumbai)      ║');
  console.log('║  Payments: X402 protocol on Polygon Amoy testnet    ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  // Start the price replay engine
  priceEngine.start();

  // Publish price ticks to the event bus for Glassbox dashboard
  priceEngine.onTick((tick) => {
    publishEvent({
      type: 'price_tick',
      agent_id: 'system',
      agent_name: 'Price Engine',
      action: 'price_update',
      details: {
        jodhpur_price: tick.jodhpur.price_per_quintal,
        mumbai_price: tick.mumbai.price_per_quintal,
        spread: tick.spread,
        spread_pct: tick.spread_percentage,
        simulated_date: tick.simulated_date
      }
    });
  });
});

module.exports = app;
