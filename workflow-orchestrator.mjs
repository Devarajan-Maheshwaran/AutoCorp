import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const ROOT = process.cwd();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(url, attempts = 40, delayMs = 1500) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
    }
    await sleep(delayMs);
  }
  return false;
}

async function pollUntil(checkFn, timeoutMs = 180000, intervalMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await checkFn();
    if (result) return result;
    await sleep(intervalMs);
  }
  return null;
}

function runMasterAgent(objective) {
  const result = spawnSync("node", ["masteragent-singlefile.mjs", objective], {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error("MasterAgent single-file run failed");
  }

  const outputPath = path.join(ROOT, "masteragent-output.json");
  const parsed = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  return parsed;
}

function convertKgThresholdToQuintal(kgPrice) {
  return Math.round(Number(kgPrice || 80) * 100);
}

async function runPipeline(founderOutput) {
  const charter = founderOutput.charter;
  const quantityQuintals = 20;
  const maxBuyPricePerQuintal = convertKgThresholdToQuintal(charter.thresholdBuyPricePerKgInr);
  const minSellPricePerQuintal = Math.max(9000, Math.round(maxBuyPricePerQuintal * (1 + Number(charter.minMarginPct || 15) / 100)));

  console.log("\n[Workflow] Step 1: Procurement buy execution...");
  const buyRes = await fetch("http://localhost:3003/buy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quantity_quintals: quantityQuintals,
      max_price_per_quintal: maxBuyPricePerQuintal,
    }),
  });

  if (!buyRes.ok) {
    throw new Error(`Procurement /buy failed: ${buyRes.status} ${await buyRes.text()}`);
  }

  const buyData = await buyRes.json();
  const orderId = buyData?.order?.order_id || buyData?.trade?.order_id;

  console.log("[Workflow] Procurement result:", {
    status: buyData.status,
    orderId,
    totalCost: buyData?.trade?.total_cost,
  });

  console.log("\n[Workflow] Step 2: Logistics full pipeline...");
  const logisticsStart = await fetch("http://localhost:3002/execute-full", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quantity_quintals: quantityQuintals,
      order_id: orderId || `fallback-${Date.now()}`,
      max_delivery_hours: 48,
    }),
  });

  if (!logisticsStart.ok) {
    throw new Error(`Logistics /execute-full failed: ${logisticsStart.status} ${await logisticsStart.text()}`);
  }

  const logisticsTask = await logisticsStart.json();
  console.log("[Workflow] Logistics task accepted:", logisticsTask);

  console.log("\n[Workflow] Step 3: Waiting for delivery checkpoint...");
  const deliveredShipment = await pollUntil(async () => {
    try {
      const res = await fetch("http://localhost:3001/api/freight/shipments");
      if (!res.ok) return null;
      const payload = await res.json();
      const shipments = payload?.data || [];
      const target = shipments.find((item) => item.pickup_order_id === orderId);
      if (!target) return null;
      if (target.status === "delivered") return target;
      return null;
    } catch {
      return null;
    }
  }, 220000, 4000);

  if (deliveredShipment) {
    console.log("[Workflow] Delivery confirmed:", {
      shipmentId: deliveredShipment.shipment_id,
      status: deliveredShipment.status,
      currentLocation: deliveredShipment.current_location,
    });
  } else {
    console.log("[Workflow] Delivery not yet confirmed in wait window; proceeding with sale fallback.");
  }

  console.log("\n[Workflow] Step 4: Sales pipeline execution...");

  if (deliveredShipment) {
    await fetch("http://localhost:3004/a2a/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        capability: "delivery_notification",
        from_agent: "workflow-orchestrator",
        input: {
          shipment_id: deliveredShipment.shipment_id,
          quantity_quintals: quantityQuintals,
          order_id: orderId,
          location: deliveredShipment.current_location,
          delivered_at: new Date().toISOString(),
        },
      }),
    });
  }

  const salesRes = await fetch("http://localhost:3004/sell", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quantity_quintals: quantityQuintals,
      min_price_per_quintal: minSellPricePerQuintal,
      order_id: orderId,
    }),
  });

  if (!salesRes.ok) {
    throw new Error(`Sales /sell failed: ${salesRes.status} ${await salesRes.text()}`);
  }

  const salesData = await salesRes.json();

  console.log("[Workflow] Sales result:", {
    status: salesData.status,
    saleStatus: salesData?.sale?.status || salesData?.sale?.sale?.status,
  });

  await sleep(2000);
  const trades = await (await fetch("http://localhost:3003/trades")).json();
  const sales = await (await fetch("http://localhost:3004/sales")).json();

  const summary = {
    objective: founderOutput.objective,
    charter,
    execution: {
      procurement: buyData,
      logistics: logisticsTask,
      delivery: deliveredShipment,
      sales: salesData,
    },
    aggregates: {
      trades: trades.total,
      sales: sales.total,
    },
  };

  const outPath = path.join(ROOT, "workflow-result.json");
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf8");

  console.log("\n=== WORKFLOW COMPLETE ===");
  console.log(JSON.stringify(summary.aggregates, null, 2));
  console.log(`Saved workflow summary: ${outPath}`);
}

async function main() {
  const dependencies = [
    "http://localhost:3001/api/health",
    "http://localhost:3002/status",
    "http://localhost:3003/status",
    "http://localhost:3004/status",
  ];

  console.log("[Workflow] Checking required services...");
  for (const url of dependencies) {
    const ok = await waitFor(url);
    if (!ok) throw new Error(`Service unavailable: ${url}`);
    console.log(`[Workflow] OK: ${url}`);
  }

  const fromArgs = process.argv.slice(2).join(" ").trim();
  let objective = fromArgs;

  if (!objective) {
    const rl = readline.createInterface({ input, output });
    objective = await rl.question("Enter investor idea/objective: ");
    await rl.close();
  }

  const masterOutput = runMasterAgent(objective);
  await runPipeline(masterOutput.founderOutput);
}

main().catch((err) => {
  console.error("[Workflow] Failed:", err.message);
  process.exitCode = 1;
});
