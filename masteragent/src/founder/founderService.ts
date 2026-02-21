import { eventBus } from "../eventBus.js";
import {
  A2AMessageSchema,
  BusinessCharter,
  FounderPlan,
  FounderPlanSchema,
  LedgerEventSchema,
} from "../types.js";
import { onchainAdapter } from "../onchain/contracts.js";
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
    const lower = objective.toLowerCase();
    const budgetMatch = lower.match(/(\d+)(k|000)?/);
    const budgetInr = budgetMatch ? Number(budgetMatch[1]) * (budgetMatch[2] === "k" ? 1000 : 1) : 30000;

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

  private buildAssignments() {
    return [
      { capability: "business_orchestration", did: "did:autocorp:founder", wallet: "0xFounder" },
      { capability: "price_monitoring", did: "did:autocorp:pricemon", wallet: "0xPrice" },
      { capability: "procurement", did: "did:autocorp:proc", wallet: "0xProc" },
      { capability: "logistics", did: "did:autocorp:logi", wallet: "0xLogi" },
      { capability: "sales", did: "did:autocorp:sales", wallet: "0xSales" },
      { capability: "accounting", did: "did:autocorp:acct", wallet: "0xAcct" },
    ];
  }

  private buildRuleBasedPlan(objective: string): FounderPlan {
    const charter = this.buildCharter(objective);
    const taskDag = this.buildTaskDag();
    return FounderPlanSchema.parse({
      objective,
      charter,
      taskDag,
      agentAssignments: this.buildAssignments(),
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
          plan: this.buildRuleBasedPlan(objective),
          mode: "RULE_BASED",
          fallbackReason: error instanceof Error ? error.message : "Unknown OpenRouter error",
        };
      }
    }

    return {
      plan: this.buildRuleBasedPlan(objective),
      mode: "RULE_BASED",
    };
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
