import { eventBus } from "../eventBus.js";
import {
  A2AMessageSchema,
  BusinessCharter,
  FounderPlan,
  FounderPlanSchema,
  LedgerEventSchema,
} from "../types.js";
import { onchainAdapter } from "../onchain/contracts.js";
import { makeTraceId, nowIso, withTxUrl } from "../utils.js";

type FounderState = {
  mode: "RULE_BASED";
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

  async start(objective: string): Promise<FounderState> {
    this.pushReasoning(
      "Founder Agent",
      "I need to convert the investor objective into an executable arbitrage charter.",
      "Parse objective and apply deterministic splitter for hackathon reliability.",
      "Scenario pinned to Dal Jodhpur→Mumbai with rule-based charter defaults."
    );

    const charter = this.buildCharter(objective);
    const taskDag = this.buildTaskDag();

    const planCandidate: FounderPlan = {
      objective,
      charter,
      taskDag,
      agentAssignments: this.buildAssignments(),
    };

    const plan = FounderPlanSchema.parse(planCandidate);
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
        to: "did:autocorp:investor",
        taskType: "escalation",
        payload: {
          reason,
          action: "pause_and_escalate_investor",
          failCount: this.state.procurementFailCount,
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
