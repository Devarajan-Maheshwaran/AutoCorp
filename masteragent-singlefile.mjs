import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const ROOT = process.cwd();

function readJsonIfExists(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function loadEnvFromMasteragent() {
  const envPath = path.join(ROOT, "masteragent", ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function trace(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function pushReasoning(events, thought, action, observation) {
  events.push({
    ts: nowIso(),
    agent: "Founder Agent",
    thought,
    action,
    observation,
  });
}

function inferBudget(objective) {
  const cleaned = objective.toLowerCase().replace(/[,₹\s]/g, "");
  const kMatch = cleaned.match(/(\d+)k/);
  if (kMatch) return Number(kMatch[1]) * 1000;

  const numberMatches = cleaned.match(/\d{4,7}|\d{2,3}000/g);
  if (numberMatches && numberMatches.length > 0) {
    const values = numberMatches.map((item) => Number(item)).filter((value) => Number.isFinite(value));
    if (values.length > 0) {
      return Math.max(...values);
    }
  }

  const basic = cleaned.match(/\d+/);
  if (!basic) return 30000;
  const n = Number(basic[0]);
  return n < 1000 ? n * 1000 : n;
}

function buildCharter(objective) {
  return {
    businessName: "AutoCorp — Dal Arbitrage: Jodhpur → Mumbai",
    commodity: "dal",
    sourceMandi: "Jodhpur",
    destinationMarket: "Mumbai",
    budgetInr: inferBudget(objective),
    deadlineDays: 30,
    minMarginPct: 15,
    thresholdBuyPricePerKgInr: 80,
    maxPerPurchaseInr: 16000,
    maxHoldingHours: 72,
    pollIntervalSec: 10,
    escalationPolicy: {
      procurementFailLimit: 3,
      onFailAction: "pause_and_escalate_investor",
    },
  };
}

function buildTaskDag() {
  return [
    { id: "t1", title: "Monitor Jodhpur dal prices", ownerAgent: "price_monitor", dependsOn: [], status: "pending" },
    { id: "t2", title: "Procure dal lot on trigger", ownerAgent: "procurement", dependsOn: ["t1"], status: "pending" },
    { id: "t3", title: "Book transport Jodhpur→Mumbai", ownerAgent: "logistics", dependsOn: ["t2"], status: "pending" },
    { id: "t4", title: "Sell to Mumbai wholesaler", ownerAgent: "sales", dependsOn: ["t3"], status: "pending" },
    { id: "t5", title: "Compute live P&L", ownerAgent: "accountant", dependsOn: ["t2", "t3", "t4"], status: "pending" },
  ];
}

function collectAgentCards() {
  const cards = [];
  const files = [
    path.join(ROOT, "procurement-agent", "agent-card.json"),
    path.join(ROOT, "sales-agent", "agent-card.json"),
    path.join(ROOT, "logistics-agent", "agent-card.json"),
  ];

  for (const file of files) {
    const card = readJsonIfExists(file);
    if (!card) continue;

    const capabilityMap = [];
    const identity = `${card.agent_id ?? ""} ${card.name ?? ""}`.toLowerCase();
    const content = `${card.description ?? ""} ${JSON.stringify(card.capabilities ?? [])}`.toLowerCase();

    if (identity.includes("procurement")) {
      capabilityMap.push("procurement");
    } else if (identity.includes("sales")) {
      capabilityMap.push("sales");
    } else if (identity.includes("logistics")) {
      capabilityMap.push("logistics");
    } else {
      if (content.includes("procure") || content.includes("purchase")) capabilityMap.push("procurement");
      if (content.includes("sales") || content.includes("buyer")) capabilityMap.push("sales");
      if (content.includes("logistics") || content.includes("shipment")) capabilityMap.push("logistics");
    }

    cards.push({
      did: `did:autocorp:${card.agent_id ?? (card.name || "agent").toLowerCase().replace(/\s+/g, "-")}`,
      wallet: card.auth?.wallet || card.authentication?.wallet || "0x0000000000000000000000000000000000000000",
      capabilities: capabilityMap,
      endpoint: card.endpoint,
      source: path.relative(ROOT, file),
    });
  }

  cards.push(
    { did: "did:autocorp:founder", wallet: "0xFounder", capabilities: ["business_orchestration"] },
    { did: "did:autocorp:pricemon", wallet: "0xPrice", capabilities: ["price_monitoring"] },
    { did: "did:autocorp:acct", wallet: "0xAcct", capabilities: ["accounting"] },
  );

  return cards;
}

function getMockReputation(did) {
  const raw = process.env.AGENT_REPUTATION_JSON;
  if (!raw) return 0;
  try {
    const map = JSON.parse(raw);
    const value = map[did];
    return typeof value === "number" ? value : 0;
  } catch {
    return 0;
  }
}

function assignByCapability(cards) {
  const required = [
    "business_orchestration",
    "price_monitoring",
    "procurement",
    "logistics",
    "sales",
    "accounting",
  ];

  const assignments = [];
  for (const capability of required) {
    const candidates = cards.filter((c) => c.capabilities.includes(capability));
    candidates.sort((a, b) => getMockReputation(b.did) - getMockReputation(a.did));
    const chosen = candidates[0];
    if (!chosen) continue;
    assignments.push({ capability, did: chosen.did, wallet: chosen.wallet });
  }
  return assignments;
}

async function tryOpenRouterPlan(objective) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");

  const model = process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b:free";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Return strict JSON only. No markdown." },
        {
          role: "user",
          content: [
            "Generate Founder plan JSON with keys: objective, charter, taskDag, agentAssignments.",
            "Scenario fixed to dal arbitrage Jodhpur to Mumbai.",
            `Investor objective: ${objective}`,
          ].join("\n"),
        },
      ],
      reasoning: { enabled: true },
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter failed: ${response.status} ${await response.text()}`);
  }

  const result = await response.json();
  let content = result?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter response has empty content");
  content = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(content);
}

function deployBusinessMock() {
  return `0x${crypto.randomBytes(20).toString("hex")}`;
}

function makeA2AMessages(assignments, charter, businessAddress) {
  return assignments
    .filter((a) => a.capability !== "business_orchestration")
    .map((a) => ({
      traceId: trace("assign"),
      from: "Founder Agent",
      to: a.did,
      taskType: "assignment",
      payload: { charter, businessAddress },
      ts: nowIso(),
    }));
}

function printSection(title, payload) {
  console.log(`\n=== ${title} ===`);
  console.log(JSON.stringify(payload, null, 2));
}

async function main() {
  loadEnvFromMasteragent();

  const rl = readline.createInterface({ input, output });
  const argObjective = process.argv.slice(2).join(" ").trim();
  const objective = argObjective || (await rl.question("Enter investor idea/objective: "));
  await rl.close();

  const reasoning = [];
  pushReasoning(
    reasoning,
    "I need to transform the objective into an executable Founder plan.",
    "Select planner mode and generate charter/task graph.",
    "Starting plan synthesis."
  );

  const mode = (process.env.ORCHESTRATION_MODE || "OPENROUTER_WITH_FALLBACK").toUpperCase();

  const cards = collectAgentCards();
  const fallbackPlan = {
    objective,
    charter: buildCharter(objective),
    taskDag: buildTaskDag(),
    agentAssignments: assignByCapability(cards),
  };

  let activeMode = "RULE_BASED";
  let fallbackReason;
  let plan = fallbackPlan;

  if (mode === "OPENROUTER_ONLY" || mode === "OPENROUTER_WITH_FALLBACK") {
    try {
      const llm = await tryOpenRouterPlan(objective);
      if (!llm?.charter || !Array.isArray(llm?.taskDag) || !Array.isArray(llm?.agentAssignments)) {
        throw new Error("LLM JSON missing required keys");
      }
      plan = llm;
      activeMode = "OPENROUTER";
      pushReasoning(reasoning, "Planner output received.", "Validate JSON structure.", "LLM plan accepted.");
    } catch (err) {
      fallbackReason = err instanceof Error ? err.message : "Unknown LLM error";
      if (mode === "OPENROUTER_ONLY") throw err;
      pushReasoning(reasoning, "LLM plan unavailable or invalid.", "Fallback to deterministic planner.", fallbackReason);
    }
  }

  const businessAddress = deployBusinessMock();
  const a2aMessages = makeA2AMessages(plan.agentAssignments, plan.charter, businessAddress);

  const outputBundle = {
    runAt: nowIso(),
    mode: activeMode,
    fallbackReason,
    discoveredAgents: cards,
    founderOutput: {
      ...plan,
      businessAddress,
    },
    streams: {
      reasoning,
      a2a: a2aMessages,
      ledger: [
        {
          ts: nowIso(),
          type: "DEPLOY",
          amountInr: 0,
          details: { businessAddress },
        },
      ],
    },
    note: "Single-file Master Agent run complete. Subagent execution can be connected using the generated A2A assignments.",
  };

  const outPath = path.join(ROOT, "masteragent-output.json");
  fs.writeFileSync(outPath, JSON.stringify(outputBundle, null, 2), "utf8");

  printSection("MASTER AGENT RESULT", outputBundle.founderOutput);
  printSection("REASONING STREAM", outputBundle.streams.reasoning);
  printSection("A2A ASSIGNMENTS", outputBundle.streams.a2a);
  console.log(`\nSaved full output to: ${outPath}`);
}

main().catch((error) => {
  console.error("MasterAgent single-file run failed:", error.message);
  process.exitCode = 1;
});
