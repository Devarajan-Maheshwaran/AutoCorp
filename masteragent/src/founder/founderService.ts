import axios from "axios";
import { eventBus } from "../eventBus.js";
import {
  A2AMessageSchema,
  BusinessCharter,
  Category,
  FounderPlan,
  FounderPlanSchema,
  LedgerEventSchema,
  SUPPORTED_CATEGORIES,
} from "../types.js";
import { onchainAdapter } from "../onchain/contracts.js";
import { makeTraceId, nowIso, withTxUrl } from "../utils.js";

// Agent ports
const CHARTER_SERVER = process.env.CHARTER_SERVER_URL ?? "http://localhost:8009";
const AGENT_PORTS: Record<string, number> = {
  price_monitor: 8002,
  procurement: 8003,
  sales: 8004,
  logistics: 8005,
  accountant: 8006,
};

type FounderState = {
  mode: "CHARTER_GEN" | "FALLBACK";
  fallbackReason?: string;
  activePlan?: FounderPlan;
  businessAddress?: string;
  category?: string;
  failCount: number;
  paused: boolean;
};

type Business = {
  id: string;
  state: FounderState;
  charter: BusinessCharter;
  createdAt: string;
};

class FounderService {
  private businesses: Map<string, Business> = new Map();

  private pushReasoning(
    agent: string,
    thought: string,
    action: string,
    observation: string
  ): void {
    eventBus.publish("reasoning", {
      ts: nowIso(),
      agent,
      thought,
      action,
      observation,
    });
  }

  private buildTaskDag(category: string) {
    return [
      {
        id: "t1",
        title: `Monitor ${category} prices`,
        ownerAgent: "price_monitor" as const,
        dependsOn: [],
      },
      {
        id: "t2",
        title: `Procure ${category} assets on trigger`,
        ownerAgent: "procurement" as const,
        dependsOn: ["t1"],
      },
      {
        id: "t3",
        title: `Execute digital delivery`,
        ownerAgent: "logistics" as const,
        dependsOn: ["t2"],
      },
      {
        id: "t4",
        title: `Sell on best venue`,
        ownerAgent: "sales" as const,
        dependsOn: ["t3"],
      },
      {
        id: "t5",
        title: `Track P&L`,
        ownerAgent: "accountant" as const,
        dependsOn: ["t2", "t3", "t4"],
      },
    ].map((item) => ({ ...item, status: "pending" as const }));
  }

  async createBusiness(
    objective: string,
    category: Category
  ): Promise<{ business: Business; state: FounderState }> {
    const businessId = `biz_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;

    this.pushReasoning(
      "Founder Agent",
      `Received new business objective (category=${category}): ${objective}`,
      "Generate charter via LLM and deploy on-chain.",
      "Starting business creation."
    );

    // Generate charter via charter server
    let charter: BusinessCharter;
    let mode: "CHARTER_GEN" | "FALLBACK" = "CHARTER_GEN";
    let fallbackReason: string | undefined;

    try {
      const resp = await axios.post(`${CHARTER_SERVER}/generate`, {
        objective,
        category,
      });
      // Map Python-style charter fields to TS BusinessCharter schema
      const raw = resp.data.charter;
      charter = {
        businessName: raw.businessName ?? raw.business_name ?? `AutoCorp — ${category}`,
        category: raw.category ?? category,
        asset: raw.asset,
        budgetUsd: raw.budgetUsd ?? raw.budget_usdc ?? raw.budget_usd ?? 10000,
        deadlineDays: raw.deadlineDays ?? raw.duration_days ?? 30,
        minMarginPct: raw.minMarginPct ?? raw.min_margin_pct ?? 10,
        maxSingleTradePct: raw.maxSingleTradePct ?? raw.risk_params?.max_single_trade_pct ?? 20,
        stopLossPct: raw.stopLossPct ?? raw.risk_params?.stop_loss_pct ?? 5,
        pollIntervalSec: raw.pollIntervalSec ?? raw.price_monitor_config?.poll_interval_seconds ?? 30,
        parameters: raw.parameters ?? {},
        escalationPolicy: raw.escalationPolicy ?? {
          failLimit: 3,
          onFailAction: "pause_and_escalate",
        },
      };
    } catch (err) {
      mode = "FALLBACK";
      fallbackReason =
        err instanceof Error ? err.message : "Charter server unreachable";
      // Fallback charter
      charter = {
        businessName: `AutoCorp — ${category} Business`,
        category,
        budgetUsd: 10000,
        deadlineDays: 30,
        minMarginPct: 10,
        maxSingleTradePct: 20,
        stopLossPct: 5,
        pollIntervalSec: 30,
        parameters: {},
        escalationPolicy: {
          failLimit: 3,
          onFailAction: "pause_and_escalate",
        },
      };
    }

    // Deploy on-chain
    const deployResult = await onchainAdapter.deployBusiness(charter);

    const state: FounderState = {
      mode,
      fallbackReason,
      category,
      businessAddress: deployResult.businessAddress,
      failCount: 0,
      paused: false,
      activePlan: FounderPlanSchema.parse({
        objective,
        charter,
        taskDag: this.buildTaskDag(category),
        agentAssignments: Object.keys(AGENT_PORTS).map((cap) => ({
          capability: cap,
          endpoint: `http://localhost:${AGENT_PORTS[cap]}`,
        })),
      }),
    };

    const business: Business = {
      id: businessId,
      state,
      charter,
      createdAt: nowIso(),
    };
    this.businesses.set(businessId, business);

    // Publish deploy ledger event
    eventBus.publish(
      "ledger",
      LedgerEventSchema.parse({
        ts: nowIso(),
        type: "DEPLOY",
        amountUsd: 0,
        category,
        details: {
          businessId,
          businessAddress: deployResult.businessAddress,
        },
        txHash: deployResult.txHash,
        txUrl: withTxUrl(deployResult.txHash),
      })
    );

    // Send charter to all Python agent servers
    for (const [agentName, port] of Object.entries(AGENT_PORTS)) {
      if (agentName === "logistics" || agentName === "accountant") continue;
      try {
        await axios.post(`http://localhost:${port}/charter`, {
          charter,
        });
        this.pushReasoning(
          "Founder Agent",
          `Dispatching charter to ${agentName} on port ${port}`,
          "POST /charter",
          `${agentName} acknowledged.`
        );
      } catch {
        console.log(
          `[Founder] Could not reach ${agentName} on port ${port}`
        );
      }
    }

    // Broadcast A2A assignments
    for (const [agentName, port] of Object.entries(AGENT_PORTS)) {
      const msg = A2AMessageSchema.parse({
        traceId: makeTraceId("assign"),
        from: "Founder Agent",
        to: agentName,
        taskType: "assignment",
        payload: {
          charter,
          businessAddress: deployResult.businessAddress,
          businessId,
        },
        ts: nowIso(),
      });
      eventBus.publish("a2a", msg);
    }

    this.pushReasoning(
      "Founder Agent",
      "All agents assigned. Business is live.",
      `Deployed business ${businessId} (${category})`,
      `Address: ${deployResult.businessAddress}`
    );

    return { business, state };
  }

  getBusinessStatus(
    businessId: string
  ): Business | { error: string } {
    const biz = this.businesses.get(businessId);
    if (!biz) return { error: "Business not found" };
    return biz;
  }

  async dissolveBusiness(businessId: string): Promise<{ status: string }> {
    const biz = this.businesses.get(businessId);
    if (!biz) return { status: "not_found" };

    biz.state.paused = true;

    eventBus.publish(
      "ledger",
      LedgerEventSchema.parse({
        ts: nowIso(),
        type: "DISSOLVE",
        amountUsd: 0,
        category: biz.charter.category,
        details: { businessId },
      })
    );

    this.pushReasoning(
      "Founder Agent",
      `Dissolving business ${businessId}`,
      "Pause all agents, record dissolution.",
      "Business dissolved."
    );

    return { status: "dissolved" };
  }

  listBusinesses(): Business[] {
    return Array.from(this.businesses.values());
  }

  getCategories(): string[] {
    return [...SUPPORTED_CATEGORIES];
  }
}

export const founderService = new FounderService();

