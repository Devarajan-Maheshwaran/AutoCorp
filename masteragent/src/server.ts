import "dotenv/config";
import express from "express";
import { accountantService } from "./accountant/accountantService.js";
import { eventBus, StreamName } from "./eventBus.js";
import { founderService } from "./founder/founderService.js";
import { AccountantInputEventSchema, SUPPORTED_CATEGORIES } from "./types.js";

const app = express();
app.use(express.json());

function sseRoute(stream: StreamName) {
  return (req: express.Request, res: express.Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const unsubscribe = eventBus.subscribe(stream, (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    });

    req.on("close", () => {
      unsubscribe();
      res.end();
    });
  };
}

// ──────────── Health & Discovery ────────────

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "autocorp-masteragent", version: "2.0.0" });
});

app.get("/categories", (_req, res) => {
  res.json({ categories: [...SUPPORTED_CATEGORIES] });
});

// ──────────── Business Lifecycle ────────────

app.post("/business/create", async (req, res) => {
  const objective = req.body?.objective ?? "Run a crypto arbitrage business with $10K budget";
  const category = req.body?.category ?? "1_crypto";

  if (!SUPPORTED_CATEGORIES.includes(category)) {
    return res.status(400).json({
      error: `Invalid category. Supported: ${SUPPORTED_CATEGORIES.join(", ")}`,
    });
  }

  try {
    const result = await founderService.createBusiness(String(objective), category);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/business/:id/status", (req, res) => {
  const result = founderService.getBusinessStatus(req.params.id);
  res.json(result);
});

app.post("/business/:id/dissolve", async (req, res) => {
  const result = await founderService.dissolveBusiness(req.params.id);
  res.json(result);
});

app.get("/businesses", (_req, res) => {
  res.json({ businesses: founderService.listBusinesses() });
});

// ──────────── Accountant ────────────

app.post("/accountant/event", (req, res) => {
  const parsed = AccountantInputEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const snapshot = accountantService.ingest(parsed.data);
  return res.json(snapshot);
});

app.get("/state", (_req, res) => {
  res.json({
    businesses: founderService.listBusinesses(),
    accountant: accountantService.getSnapshot(),
  });
});

// ──────────── Events (for Python agents to push to) ────────────

app.post("/events", (req, res) => {
  const event = req.body;
  if (event.type) {
    eventBus.publish("reasoning", event);
  }
  res.json({ ok: true });
});

// ──────────── SSE Streams ────────────

app.get("/stream/reasoning", sseRoute("reasoning"));
app.get("/stream/a2a", sseRoute("a2a"));
app.get("/stream/ledger", sseRoute("ledger"));
app.get("/stream/pnl", sseRoute("pnl"));

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`[autocorp-masteragent] listening on http://localhost:${port}`);
  console.log(`  Categories: ${SUPPORTED_CATEGORIES.join(", ")}`);
  console.log(`  POST /business/create  — create a new business`);
  console.log(`  GET  /categories       — list supported categories`);
});

