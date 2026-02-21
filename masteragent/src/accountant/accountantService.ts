import { eventBus } from "../eventBus.js";
import {
  AccountantInputEvent,
  AccountantInputEventSchema,
  LedgerEventSchema,
} from "../types.js";
import { nowIso, round2, withTxUrl } from "../utils.js";

type PnLSnapshot = {
  totalInvested: number;
  totalSpent: number;
  procurement: number;
  transport: number;
  fees: number;
  revenue: number;
  grossProfit: number;
  roiPct: number;
  projected30DayPct: number;
  escrowRemaining: number;
  agentPerformance: {
    procurementAvgInrPerKg: number;
    salesAvgMarginInrPerKg: number;
    logisticsAvgCostInrPerKg: number;
  };
};

class AccountantService {
  private totalInvested = 0;
  private procurement = 0;
  private transport = 0;
  private fees = 0;
  private revenue = 0;

  private totalPurchasedKg = 0;
  private totalSoldKg = 0;
  private totalTransportedKg = 0;

  ingest(eventCandidate: AccountantInputEvent): PnLSnapshot {
    const event = AccountantInputEventSchema.parse(eventCandidate);

    switch (event.type) {
      case "deposit":
        this.totalInvested += event.amountInr;
        break;
      case "purchase":
        this.procurement += event.amountInr;
        this.totalPurchasedKg += event.qtyKg ?? 0;
        break;
      case "transport":
        this.transport += event.amountInr;
        this.totalTransportedKg += event.qtyKg ?? 0;
        break;
      case "sale":
        this.revenue += event.amountInr;
        this.totalSoldKg += event.qtyKg ?? 0;
        break;
      case "fee":
        this.fees += event.amountInr;
        break;
      case "dissolve":
        break;
      default:
        break;
    }

    const ledger = LedgerEventSchema.parse({
      ts: nowIso(),
      type:
        event.type === "purchase"
          ? "BUY"
          : event.type === "sale"
          ? "SELL"
          : event.type === "transport"
          ? "TRANSPORT"
          : event.type === "dissolve"
          ? "DISSOLVE"
          : "SPEND",
      amountInr: event.amountInr,
      details: {
        sourceType: event.type,
        agent: event.agent,
        qtyKg: event.qtyKg,
        ...event.meta,
      },
      txHash: event.txHash,
      txUrl: withTxUrl(event.txHash),
    });

    eventBus.publish("ledger", ledger);

    const snapshot = this.getSnapshot();
    eventBus.publish("pnl", {
      ts: nowIso(),
      snapshot,
    });

    return snapshot;
  }

  getSnapshot(): PnLSnapshot {
    const totalSpent = this.procurement + this.transport + this.fees;
    const grossProfit = this.revenue - totalSpent;
    const roiPct = this.totalInvested > 0 ? (grossProfit / this.totalInvested) * 100 : 0;

    const elapsedDays = 12;
    const projected30DayPct = elapsedDays > 0 ? (roiPct / elapsedDays) * 30 : 0;

    const procurementAvgInrPerKg =
      this.totalPurchasedKg > 0 ? this.procurement / this.totalPurchasedKg : 0;

    const logisticsAvgCostInrPerKg =
      this.totalTransportedKg > 0 ? this.transport / this.totalTransportedKg : 0;

    const salesAvgMarginInrPerKg =
      this.totalSoldKg > 0 && this.totalPurchasedKg > 0
        ? this.revenue / this.totalSoldKg - this.procurement / this.totalPurchasedKg
        : 0;

    return {
      totalInvested: round2(this.totalInvested),
      totalSpent: round2(totalSpent),
      procurement: round2(this.procurement),
      transport: round2(this.transport),
      fees: round2(this.fees),
      revenue: round2(this.revenue),
      grossProfit: round2(grossProfit),
      roiPct: round2(roiPct),
      projected30DayPct: round2(projected30DayPct),
      escrowRemaining: round2(this.totalInvested - totalSpent),
      agentPerformance: {
        procurementAvgInrPerKg: round2(procurementAvgInrPerKg),
        salesAvgMarginInrPerKg: round2(salesAvgMarginInrPerKg),
        logisticsAvgCostInrPerKg: round2(logisticsAvgCostInrPerKg),
      },
    };
  }
}

export const accountantService = new AccountantService();
