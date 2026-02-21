import "dotenv/config";
import express from "express";
import { accountantService } from "./accountant/accountantService.js";
import { seedDemoAccountantFlow } from "./demoSeed.js";
import { eventBus, StreamName } from "./eventBus.js";
import { founderService } from "./founder/founderService.js";
import { AccountantInputEventSchema, AgentCardSchema } from "./types.js";

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

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "autocorp-member1-prototype" });
});

app.post("/founder/start", async (req, res) => {
  const objective =
    req.body?.objective ??
    "Deploy ₹30K dal arbitrage business Jodhpur to Mumbai with 15% minimum margin in 30 days.";

  const state = await founderService.start(String(objective));
  res.json(state);
});

app.post("/founder/test-llm", async (req, res) => {
  const objective =
    req.body?.objective ??
    "Deploy ₹30K dal arbitrage business Jodhpur to Mumbai with 15% minimum margin in 30 days.";

  try {
    const result = await founderService.generatePlanOnly(String(objective));
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown planner error",
    });
  }
});

app.post("/a2a/agent-card", (req, res) => {
  const parsed = AgentCardSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const card = founderService.registerAgentCard(parsed.data);
  return res.json({ ok: true, card });
});

app.get("/a2a/agent-cards", (_req, res) => {
  return res.json({ cards: founderService.listAgentCards() });
});

app.post("/founder/event", (req, res) => {
  const type = req.body?.type;
  if (type === "procurement_failed") {
    const state = founderService.onProcurementFailure(
      req.body?.reason ?? "[SIMULATED] procurement failure"
    );
    return res.json(state);
  }

  return res.status(400).json({
    error: "Unsupported founder event",
    supported: ["procurement_failed"],
  });
});

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
    founder: founderService.getState(),
    accountant: accountantService.getSnapshot(),
  });
});

app.post("/demo/seed", (_req, res) => {
  seedDemoAccountantFlow();
  res.json({ ok: true, snapshot: accountantService.getSnapshot() });
});

app.get("/stream/reasoning", sseRoute("reasoning"));
app.get("/stream/a2a", sseRoute("a2a"));
app.get("/stream/ledger", sseRoute("ledger"));
app.get("/stream/pnl", sseRoute("pnl"));

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`[autocorp-prototype] listening on http://localhost:${port}`);
});
