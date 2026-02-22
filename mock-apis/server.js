"use strict";
require("dotenv").config({ path: "../.env" });
const express = require("express");
const cors    = require("cors");
const app     = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

// ─── Volatile price state with realistic random walk ─────────────
const prices = {
  eth:  { mid: 3185, vol: 0.0012 },
  btc:  { mid: 94800, vol: 0.0008 },
  sol:  { mid: 183,  vol: 0.0020 },
  bnb:  { mid: 608,  vol: 0.0015 },
};

// Move prices every 10 seconds (realistic micro-movements)
setInterval(() => {
  Object.values(prices).forEach(p => {
    const shock = (Math.random() - 0.499) * p.vol * p.mid;
    p.mid = Math.max(p.mid * 0.90, p.mid + shock);
  });
}, 10000);

// Spread: CoinDCX always 0.4–1.6% higher than Binance
function binanceAsk(sym) {
  const p = prices[sym.toLowerCase().replace("usdt","").replace("usdc","")];
  if (!p) return null;
  return parseFloat((p.mid * (1 - 0.0001)).toFixed(4));
}
function coindcxAsk(sym) {
  const p = prices[sym.toLowerCase().replace("usdt","").replace("usdc","")];
  if (!p) return null;
  const spread = 0.004 + Math.random() * 0.012;
  return parseFloat((p.mid * (1 + spread)).toFixed(4));
}

// GPU prices
const gpuPrices = {
  RTX_3090: { vastai: 0.38, runpod: 0.62 },
  RTX_4090: { vastai: 0.64, runpod: 0.94 },
  A100_SXM4: { vastai: 1.92, runpod: 2.65 },
  H100_PCIE: { vastai: 3.15, runpod: 4.20 },
};

// SaaS pricing
const saasPrices = {
  notion_team:  { bulk_annual_per_seat: 15.20, retail_monthly: 18.00 },
  figma_org:    { bulk_annual_per_seat: 43.20, retail_monthly: 55.00 },
  slack_pro:    { bulk_annual_per_seat:  6.96, retail_monthly:  8.75 },
  linear_plus:  { bulk_annual_per_seat: 11.20, retail_monthly: 14.00 },
};

// ─── HEALTH ──────────────────────────────────────────────────────
app.get("/health", (_, res) => res.json({
  status:    "ok",
  service:   "AutoCorp Mock API",
  port:      3001,
  demo_mode: true,
  prices: {
    eth: prices.eth.mid.toFixed(2),
    btc: prices.btc.mid.toFixed(2),
  }
}));

// ═════════════════════════════════════════════════
// CATEGORY 1 — CRYPTO EXCHANGE MOCKS
// ═════════════════════════════════════════════════

// ── Binance: get ticker price ─────────────────────
app.get("/binance/api/v3/ticker/price", (req, res) => {
  const sym = (req.query.symbol || "ETHUSDT").toUpperCase();
  const p   = binanceAsk(sym);
  if (!p) return res.status(404).json({ code: -1121, msg: "Invalid symbol." });
  res.json({ symbol: sym, price: p.toFixed(4) });
});

// ── Binance: book ticker (bid/ask) ───────────────
app.get("/binance/api/v3/ticker/bookTicker", (req, res) => {
  const sym  = (req.query.symbol || "ETHUSDT").toUpperCase();
  const p    = binanceAsk(sym);
  if (!p) return res.status(404).json({ code: -1121, msg: "Invalid symbol." });
  res.json({
    symbol:   sym,
    bidPrice: (p * 0.9999).toFixed(4),
    askPrice: (p * 1.0001).toFixed(4),
    bidQty:   (Math.random() * 10 + 0.5).toFixed(3),
    askQty:   (Math.random() * 10 + 0.5).toFixed(3),
  });
});

// ── Binance: place order ─────────────────────────
app.post("/binance/api/v3/order", (req, res) => {
  const { symbol = "ETHUSDT", side = "BUY", quantity = 0.01 } = req.body;
  const p = binanceAsk(symbol);
  res.json({
    symbol,
    orderId:      Math.floor(Math.random() * 9_000_000 + 1_000_000),
    status:       "FILLED",
    side,
    executedQty:  String(quantity),
    price:        String(p),
    fills:        [{ price: String(p), qty: String(quantity),
                     commission: (quantity * p * 0.001).toFixed(6),
                     commissionAsset: "USDT" }],
    transactTime: Date.now()
  });
});

// ── Binance: order book depth ────────────────────
app.get("/binance/api/v3/depth", (req, res) => {
  const sym = (req.query.symbol || "ETHUSDT").toUpperCase();
  const p   = binanceAsk(sym) || 3185;
  const bids = Array.from({length:5}, (_,i) =>
    [(p*(1-0.0001*(i+1))).toFixed(4), (Math.random()*5+0.5).toFixed(3)]);
  const asks = Array.from({length:5}, (_,i) =>
    [(p*(1+0.0001*(i+1))).toFixed(4), (Math.random()*5+0.5).toFixed(3)]);
  res.json({ lastUpdateId: Date.now(), bids, asks });
});

// ── CoinDCX: ticker ──────────────────────────────
app.get("/coindcx/exchange/ticker", (req, res) => {
  const tickers = Object.keys(prices).map(sym => ({
    market:     sym.toUpperCase() + "USDT",
    last_price: String(coindcxAsk(sym + "USDT")),
    bid:        String(coindcxAsk(sym + "USDT") * 0.9999),
    ask:        String(coindcxAsk(sym + "USDT") * 1.0001),
    volume:     (Math.random() * 50000 + 5000).toFixed(2),
    timestamp:  Date.now()
  }));
  res.json(tickers);
});

// ── CoinDCX: place order ─────────────────────────
app.post("/coindcx/exchange/v1/orders/create", (req, res) => {
  const { market = "ETHUSDT", side = "buy", quantity = 0.01 } = req.body;
  const p = coindcxAsk(market);
  res.json({
    id:             `CDX-${Date.now()}`,
    market,
    side,
    status:         "filled",
    quantity:       String(quantity),
    price_per_unit: String(p),
    avg_price:      String(p),
    total:          String(p * quantity),
    fee_amount:     String(p * quantity * 0.002),
    created_at:     new Date().toISOString()
  });
});

// ── WazirX: tickers ──────────────────────────────
app.get("/wazirx/sapi/v1/ticker/24hr", (req, res) => {
  const sym = (req.query.symbol || "ethusdt").toLowerCase();
  const base = sym.replace("usdt","").replace("inr","");
  const p    = coindcxAsk(base + "USDT") || 3200;
  res.json({
    symbol:    sym,
    lastPrice: String(p),
    bidPrice:  String(p * 0.9999),
    askPrice:  String(p * 1.0001),
    volume:    (Math.random() * 10000 + 1000).toFixed(2),
  });
});

// ── Funding rates (Binance futures) ──────────────
app.get("/binance/fapi/v1/fundingRate", (req, res) => {
  const sym = req.query.symbol || "BTCUSDT";
  const rate = 0.0001 + Math.random() * 0.0004;  // 0.01–0.05% per 8hr
  res.json([{
    symbol:      sym,
    fundingRate: rate.toFixed(6),
    fundingTime: Date.now() + 8 * 3600 * 1000
  }]);
});

// ═════════════════════════════════════════════════
// CATEGORY 2 — COMPUTE PLATFORM MOCKS
// ═════════════════════════════════════════════════

// ── Vast.ai: list GPU offers ─────────────────────
app.get("/vastai/api/v0/bundles", (req, res) => {
  const raw     = req.query.q || "RTX_3090";
  const gpuKey  = Object.keys(gpuPrices).find(
    k => k.toUpperCase().includes(raw.toUpperCase().replace(" ","_"))
  ) || "RTX_3090";
  const base    = gpuPrices[gpuKey].vastai;
  const offers  = Array.from({ length: 8 }, (_, i) => ({
    id:           200000 + i,
    gpu_name:     gpuKey,
    num_gpus:     1,
    dph_total:    parseFloat((base + (Math.random()-0.5)*0.04).toFixed(3)),
    reliability2: parseFloat((0.94 + Math.random()*0.05).toFixed(3)),
    inet_up:      Math.floor(600 + Math.random()*400),
    inet_down:    Math.floor(600 + Math.random()*400),
    geolocation:  ["US","EU","SG","IN","JP"][i % 5],
    cuda_max_good: 12.1,
    rentable:     true,
    rented:       false,
    machine_id:   300000 + i,
  }));
  res.json({ offers });
});

// ── Vast.ai: rent instance ────────────────────────
app.post("/vastai/api/v0/asks/:offerId", (req, res) => {
  const gpuName = req.body.gpu_name || "RTX_3090";
  const gp      = gpuPrices[gpuName] || gpuPrices["RTX_3090"];
  res.json({
    success:      true,
    new_contract: req.params.offerId,
    instance_id:  `vast-${Date.now()}`,
    ssh_host:     `ssh${Math.floor(Math.random()*99)+1}.vast.ai`,
    ssh_port:     Math.floor(10000 + Math.random()*5000),
    status:       "running",
    cost_per_hr:  parseFloat((gp.vastai + (Math.random()-0.5)*0.02).toFixed(3)),
    num_gpus:     req.body.num_gpus || 1,
    start_date:   Math.floor(Date.now()/1000),
  });
});

// ── Vast.ai: instance status ──────────────────────
app.get("/vastai/api/v0/instances/:id", (req, res) => {
  res.json({
    instances: [{
      id:         req.params.id,
      actual_status: "running",
      gpu_name:   "RTX_3090",
      ssh_host:   "ssh42.vast.ai",
      ssh_port:   22022,
      dph_total:  0.38,
    }]
  });
});

// ── RunPod: GraphQL handler ───────────────────────
app.post("/runpod/graphql", (req, res) => {
  const body = req.body || {};
  const q    = body.query || "";

  if (q.includes("gpuTypes")) {
    return res.json({ data: { gpuTypes: Object.entries(gpuPrices).map(([id, p]) => ({
      id,
      displayName:   id.replace("_"," "),
      memoryInGb:    id.includes("H100") ? 80 : id.includes("A100") ? 40 : 24,
      securePrice:   p.runpod,
      communityPrice: parseFloat((p.runpod * 0.88).toFixed(3)),
      lowestPrice:   { minimumBidPrice: parseFloat((p.runpod * 0.75).toFixed(3)) }
    })) }});
  }

  if (q.includes("podFindAndDeployOnDemand") ||
      q.includes("createPod")) {
    return res.json({ data: { podFindAndDeployOnDemand: {
      id:            `pod-${Date.now()}`,
      imageName:     "runpod/pytorch:latest",
      gpuCount:      1,
      costPerHr:     0.72,
      desiredStatus: "RUNNING",
      runtime: { uptimeInSeconds: 0 }
    }}});
  }

  if (q.includes("myself") || q.includes("pods")) {
    return res.json({ data: { myself: { pods: [] } } });
  }

  res.json({ data: {} });
});

// Poll counter for listing status simulation
const listingPollCount = {};

// ── RunPod: listing status ────────────────────────
app.get("/runpod/listing/:id", (req, res) => {
  const id = req.params.id;
  listingPollCount[id] = (listingPollCount[id] || 0) + 1;
  const sold = listingPollCount[id] >= 3;
  res.json({
    listing_id: id,
    status:     sold ? "sold" : "active",
    views:      listingPollCount[id] * 7,
    buyer:      sold ? `buyer_corp_${Math.floor(Math.random()*999)}` : null,
  });
});

// ═════════════════════════════════════════════════
// CATEGORY 5 — SAAS PLATFORM MOCKS
// ═════════════════════════════════════════════════

// ── Stripe: create subscription ──────────────────
app.post("/stripe/v1/subscriptions", (req, res) => {
  res.json({
    id:           `sub_${Date.now()}`,
    object:       "subscription",
    status:       "active",
    customer:     `cus_${Date.now()}`,
    current_period_start: Math.floor(Date.now()/1000),
    current_period_end:   Math.floor(Date.now()/1000) + 30*86400,
    items: { data: [{ price: {
      unit_amount: Math.floor((req.body.price_monthly || 17.50) * 100),
      currency:    "usd",
      recurring:   { interval: "month" }
    }}]},
    metadata: req.body
  });
});

// ── Stripe: list subscriptions ────────────────────
app.get("/stripe/v1/subscriptions", (req, res) => {
  const active = Math.floor(Math.random() * 6) + 12;
  res.json({
    object:      "list",
    has_more:    false,
    total_count: active,
    data: Array.from({ length: active }, (_, i) => ({
      id:       `sub_demo_${i}`,
      status:   "active",
      customer: `cus_demo_${i}`,
      items: { data: [{ price: {
        unit_amount: 1750,
        currency:    "usd",
        recurring:   { interval: "month" }
      }}]},
    })),
  });
});

// ── Stripe: cancel subscription ───────────────────
app.delete("/stripe/v1/subscriptions/:id", (req, res) => {
  res.json({ id: req.params.id, status: "canceled",
             canceled_at: Math.floor(Date.now()/1000) });
});

// ── Razorpay: create payout ───────────────────────
app.post("/razorpay/v1/payouts", (req, res) => {
  res.json({
    id:         `pout_${Date.now()}`,
    entity:     "payout",
    fund_account_id: req.body.fund_account_id || "fa_demo",
    amount:     req.body.amount,
    currency:   "INR",
    status:     "processed",
    utr:        `UTR${Date.now()}`,
    mode:       req.body.mode || "UPI",
    purpose:    "payout",
    created_at: Math.floor(Date.now()/1000),
  });
});

// ── Razorpay: create payment link ────────────────
app.post("/razorpay/v1/payment_links", (req, res) => {
  res.json({
    id:          `plink_${Date.now()}`,
    amount:      req.body.amount,
    currency:    "INR",
    description: req.body.description || "AutoCorp payout",
    short_url:   `https://rzp.io/l/AUTOCORP-${Math.random().toString(36).substr(2,8).toUpperCase()}`,
    status:      "created",
  });
});

// ═════════════════════════════════════════════════
// ANALYTICS — for dashboard popularity board
// ═════════════════════════════════════════════════

app.get("/analytics/popularity", (_, res) => {
  res.json([
    {
      category_id:         "1_crypto",
      total_businesses:    54,
      active_businesses:   14,
      avg_roi_pct:         18.7,
      success_rate_pct:    74,
      top_sub_strategy:    "funding_rate",
      total_profit_usdc:   9840,
    },
    {
      category_id:         "2_compute",
      total_businesses:    27,
      active_businesses:   9,
      avg_roi_pct:         67.3,
      success_rate_pct:    71,
      top_sub_strategy:    "gpu_spot",
      total_profit_usdc:   6120,
    },
    {
      category_id:         "5_saas",
      total_businesses:    38,
      active_businesses:   22,
      avg_roi_pct:         44.1,
      success_rate_pct:    86,
      top_sub_strategy:    "saas_resale",
      total_profit_usdc:   14300,
    },
  ]);
});

app.get("/analytics/activity", (_, res) => {
  const now = Date.now() / 1000;
  res.json([
    { business_id:"biz-101", category_id:"1_crypto",
      sub_strategy:"funding_rate", asset:"BTCUSDT",
      event_type:"sale_completed",
      description:"Funding arb cycle closed +$52.10",
      profit_usdc:52.10, ts: now - 95 },
    { business_id:"biz-102", category_id:"2_compute",
      sub_strategy:"gpu_spot", asset:"RTX_3090",
      event_type:"trade_opened",
      description:"4× RTX3090 rented on Vast.ai @ $0.38/hr",
      ts: now - 310 },
    { business_id:"biz-103", category_id:"5_saas",
      sub_strategy:"saas_resale", asset:"notion_team",
      event_type:"sale_completed",
      description:"5 Notion seats sold via Stripe MRR",
      profit_usdc:18.75, ts: now - 640 },
    { business_id:"biz-104", category_id:"1_crypto",
      sub_strategy:"cross_exchange", asset:"ETHUSDT",
      event_type:"sale_completed",
      description:"ETH spread captured Binance→CoinDCX",
      profit_usdc:11.40, ts: now - 910 },
    { business_id:"biz-105", category_id:"2_compute",
      sub_strategy:"gpu_spot", asset:"A100_SXM4",
      event_type:"sale_completed",
      description:"A100 48hr block sold on RunPod",
      profit_usdc:87.20, ts: now - 1800 },
  ]);
});

const PORT = parseInt(process.env.MOCK_API_PORT || "3001");
app.listen(PORT, () => {
  console.log(`[MockAPI] Running on http://localhost:${PORT}`);
  console.log(`[MockAPI] Categories: crypto / compute / saas`);
  console.log(`[MockAPI] DEMO_MODE: ${process.env.DEMO_MODE}`);
});
