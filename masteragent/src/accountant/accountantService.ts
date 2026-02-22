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
  byCategory: Record<
    string,
    { spent: number; revenue: number; pnl: number }
  >;
};

class AccountantService {
  private totalInvested = 0;
  private procurement = 0;
  private transport = 0;
  private fees = 0;
  private revenue = 0;
  private totalQuantity = 0;

  private byCategory: Record<
    string,
    { spent: number; revenue: number }
  > = {};

  ingest(eventCandidate: AccountantInputEvent): PnLSnapshot {
    const event = AccountantInputEventSchema.parse(eventCandidate);
    const cat = event.category ?? "unknown";

    if (!this.byCategory[cat]) {
      this.byCategory[cat] = { spent: 0, revenue: 0 };
    }

    switch (event.type) {
      case "deposit":
        this.totalInvested += event.amountUsd;
        break;
      case "purchase":
        this.procurement += event.amountUsd;
        this.totalQuantity += event.quantity ?? 0;
        this.byCategory[cat].spent += event.amountUsd;
        break;
      case "transport":
        this.transport += event.amountUsd;
        this.byCategory[cat].spent += event.amountUsd;
        break;
      case "sale":
        this.revenue += event.amountUsd;
        this.byCategory[cat].revenue += event.amountUsd;
        break;
      case "fee":
        this.fees += event.amountUsd;
        this.byCategory[cat].spent += event.amountUsd;
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
              ? "TRANSFER"
              : event.type === "dissolve"
                ? "DISSOLVE"
                : "SPEND",
      amountUsd: event.amountUsd,
      category: event.category,
      details: {
        sourceType: event.type,
        agent: event.agent,
        quantity: event.quantity,
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
    const roiPct =
      this.totalInvested > 0
        ? (grossProfit / this.totalInvested) * 100
        : 0;

    const elapsedDays = 12;
    const projected30DayPct =
      elapsedDays > 0 ? (roiPct / elapsedDays) * 30 : 0;

    const byCategoryResult: Record<
      string,
      { spent: number; revenue: number; pnl: number }
    > = {};
    for (const [cat, data] of Object.entries(this.byCategory)) {
      byCategoryResult[cat] = {
        spent: round2(data.spent),
        revenue: round2(data.revenue),
        pnl: round2(data.revenue - data.spent),
      };
    }

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
      byCategory: byCategoryResult,
    };
  }
}

export const accountantService = new AccountantService();

