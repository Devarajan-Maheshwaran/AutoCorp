import { eventBus } from "../eventBus.js";
import {
  A2AMessageSchema,
  BusinessCharter,
  FounderPlan,
  FounderPlanSchema,
  LedgerEventSchema,
} from "../types.js";
import { onchainAdapter } from "../onchain/contracts.js";
import { AgentCard, agentDirectory } from "./agentDirectory.js";
import { generateFounderPlanWithOpenRouter } from "./openrouterPlanner.js";
import { makeTraceId, nowIso, withTxUrl } from "../utils.js";

type FounderState = {
  mode: "RULE_BASED" | "OPENROUTER";
  fallbackReason?: string;
  activePlan?: FounderPlan;
  businessAddress?: string;
  procurementFailCount: number;
  paused: boolean;
};

class FounderService {
  private state: FounderState = {
    mode: "RULE_BASED",
    procurementFailCount: 0,
    paused: false,
  };

  private pushReasoning(agent: string, thought: string, action: string, observation: string): void {
    eventBus.publish("reasoning", {
      ts: nowIso(),
      agent,
      thought,
      action,
      observation,
    });
  }

  private buildCharter(objective: string): BusinessCharter {
    const cleaned = objective.toLowerCase().replace(/[₹,\s]/g, "");
    const kMatch = cleaned.match(/(\d+)k/);

    let budgetInr = 30000;
    if (kMatch) {
      budgetInr = Number(kMatch[1]) * 1000;
    } else {
      const largeMatches = cleaned.match(/\d{4,7}|\d{2,3}000/g);
      if (largeMatches && largeMatches.length > 0) {
        const numeric = largeMatches.map((item) => Number(item)).filter((value) => Number.isFinite(value));
        if (numeric.length > 0) {
          budgetInr = Math.max(...numeric);
        }
      } else {
        const basic = cleaned.match(/\d+/);
        if (basic) {
          const n = Number(basic[0]);
          budgetInr = n < 1000 ? n * 1000 : n;
        }
      }
    }

    return {
      businessName: "AutoCorp — Dal Arbitrage: Jodhpur → Mumbai",
      commodity: "dal",
      sourceMandi: "Jodhpur",
      destinationMarket: "Mumbai",
      budgetInr,
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

  private buildTaskDag() {
    return [
      {
        id: "t1",
        title: "Monitor Jodhpur dal prices",
        ownerAgent: "price_monitor" as const,
        dependsOn: [],
      },
      {
        id: "t2",
        title: "Procure dal lot on trigger",
        ownerAgent: "procurement" as const,
        dependsOn: ["t1"],
      },
      {
        id: "t3",
        title: "Book transport Jodhpur→Mumbai",
        ownerAgent: "logistics" as const,
        dependsOn: ["t2"],
      },
      {
        id: "t4",
        title: "Sell to Mumbai wholesaler",
        ownerAgent: "sales" as const,
        dependsOn: ["t3"],
      },
      {
        id: "t5",
        title: "Compute live P&L",
        ownerAgent: "accountant" as const,
        dependsOn: ["t2", "t3", "t4"],
      },
    ].map((item) => ({ ...item, status: "pending" as const }));
  }

  private async chooseBestAgent(capability: string): Promise<AgentCard | undefined> {
    const candidates = agentDirectory.findByCapability(capability);
    if (candidates.length === 0) return undefined;

    const scored = await Promise.all(
      candidates.map(async (candidate) => ({
        candidate,
        reputation: await onchainAdapter.getReputation(candidate.did),
      }))
    );

    scored.sort((a, b) => b.reputation - a.reputation);
    return scored[0]?.candidate;
  }

  private async buildAssignments() {
    const requiredCapabilities = [
      "business_orchestration",
      "price_monitoring",
      "procurement",
      "logistics",
      "sales",
      "accounting",
    ];

    const assignments = [] as Array<{ capability: string; did: string; wallet: string }>;

    for (const capability of requiredCapabilities) {
      const selected = await this.chooseBestAgent(capability);
      if (!selected) {
        continue;
      }
      assignments.push({
        capability,
        did: selected.did,
        wallet: selected.wallet,
      });
    }

    return assignments;
  }

  private async buildRuleBasedPlanAsync(objective: string): Promise<FounderPlan> {
    const charter = this.buildCharter(objective);
    const taskDag = this.buildTaskDag();
    return FounderPlanSchema.parse({
      objective,
      charter,
      taskDag,
      agentAssignments: await this.buildAssignments(),
    });
  }

  private async buildPlan(objective: string): Promise<{ plan: FounderPlan; mode: "RULE_BASED" | "OPENROUTER"; fallbackReason?: string }> {
    const configuredMode = (process.env.ORCHESTRATION_MODE ?? "RULE_BASED").toUpperCase();

    if (configuredMode === "OPENROUTER_ONLY" || configuredMode === "OPENROUTER_WITH_FALLBACK") {
      try {
        const llmPlan = await generateFounderPlanWithOpenRouter(objective);
        return {
          plan: llmPlan,
          mode: "OPENROUTER",
        };
      } catch (error) {
        if (configuredMode === "OPENROUTER_ONLY") {
          throw error;
        }
        return {
          plan: await this.buildRuleBasedPlanAsync(objective),
          mode: "RULE_BASED",
          fallbackReason: error instanceof Error ? error.message : "Unknown OpenRouter error",
        };
      }
    }

    return {
      plan: await this.buildRuleBasedPlanAsync(objective),
      mode: "RULE_BASED",
    };
  }

  async generatePlanOnly(objective: string): Promise<{ mode: string; plan: FounderPlan; fallbackReason?: string }> {
    const planResult = await this.buildPlan(objective);
    return {
      mode: planResult.mode,
      plan: planResult.plan,
      fallbackReason: planResult.fallbackReason,
    };
  }

  registerAgentCard(card: AgentCard): AgentCard {
    return agentDirectory.register(card);
  }

  listAgentCards(): AgentCard[] {
    return agentDirectory.list();
  }

  async start(objective: string): Promise<FounderState> {
    this.pushReasoning(
      "Founder Agent",
      "I need to convert the investor objective into an executable arbitrage charter.",
      "Select orchestration mode and generate plan JSON with schema validation.",
      "Attempting configured planner mode."
    );

    const planResult = await this.buildPlan(objective);
    const plan = planResult.plan;
    this.state.mode = planResult.mode;
    this.state.fallbackReason = planResult.fallbackReason;

    if (planResult.fallbackReason) {
      this.pushReasoning(
        "Founder Agent",
        "LLM planner failed validation or request.",
        "Fallback to deterministic planner.",
        `Fallback reason: ${planResult.fallbackReason}`
      );
    } else {
      this.pushReasoning(
        "Founder Agent",
        "Plan generation complete.",
        `Mode selected: ${planResult.mode}.`,
        "Plan validated against schema."
      );
    }

    this.state.activePlan = plan;

    this.pushReasoning(
      "Founder Agent",
      "Charter validated. I should deploy the business entity on-chain to make all actions auditable.",
      "Call AutoCorpFactory.deployBusiness(charter).",
      "Business deployment initiated."
    );

    const deployResult = await onchainAdapter.deployBusiness(plan.charter);
    this.state.businessAddress = deployResult.businessAddress;

    const deployLedger = LedgerEventSchema.parse({
      ts: nowIso(),
      type: "DEPLOY",
      amountInr: 0,
      details: {
        businessAddress: deployResult.businessAddress,
      },
      txHash: deployResult.txHash,
      txUrl: withTxUrl(deployResult.txHash),
    });
    eventBus.publish("ledger", deployLedger);

    for (const assignment of plan.agentAssignments) {
      if (assignment.capability === "business_orchestration") continue;
      const msg = A2AMessageSchema.parse({
        traceId: makeTraceId("assign"),
        from: "Founder Agent",
        to: assignment.did,
        taskType: "assignment",
        payload: {
          charter: plan.charter,
          businessAddress: deployResult.businessAddress,
        },
        ts: nowIso(),
      });
      eventBus.publish("a2a", msg);
    }

    this.pushReasoning(
      "Founder Agent",
      "All specialist agents are assigned with charter context.",
      "Broadcast A2A assignment tasks.",
      "Orchestration loop active."
    );

    return this.getState();
  }

  onProcurementFailure(reason: string): FounderState {
    this.state.procurementFailCount += 1;

    this.pushReasoning(
      "Founder Agent",
      "Procurement reported a failure. I need to enforce escalation policy.",
      `Increment failure counter and compare with threshold 3.`,
      `Current procurement fail count is ${this.state.procurementFailCount}.`
    );

    if (this.state.procurementFailCount >= 3) {
      this.state.paused = true;
      const escalationMsg = A2AMessageSchema.parse({
        traceId: makeTraceId("escalate"),
        from: "Founder Agent",
        to: process.env.INVESTOR_DID ?? "did:autocorp:investor",
        taskType: "escalation",
        payload: {
          reason,
          action: "pause_and_escalate_investor",
          failCount: this.state.procurementFailCount,
          investorWallet: process.env.INVESTOR_WALLET,
        },
        ts: nowIso(),
      });
      eventBus.publish("a2a", escalationMsg);

      this.pushReasoning(
        "Founder Agent",
        "Failure threshold reached. Continue would violate charter risk controls.",
        "Pause business and escalate to investor.",
        "Business paused pending investor instruction."
      );
    }

    return this.getState();
  }

  getState(): FounderState {
    return {
      ...this.state,
    };
  }
}

export const founderService = new FounderService();
