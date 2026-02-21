import { z } from "zod";

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  ownerAgent: z.enum([
    "founder",
    "price_monitor",
    "procurement",
    "logistics",
    "sales",
    "accountant",
  ]),
  dependsOn: z.array(z.string()).default([]),
  status: z.enum(["pending", "running", "done", "failed"]).default("pending"),
});

export const BusinessCharterSchema = z.object({
  businessName: z.literal("AutoCorp — Dal Arbitrage: Jodhpur → Mumbai"),
  commodity: z.literal("dal"),
  sourceMandi: z.literal("Jodhpur"),
  destinationMarket: z.literal("Mumbai"),
  budgetInr: z.number().positive(),
  deadlineDays: z.number().int().positive(),
  minMarginPct: z.number().positive(),
  thresholdBuyPricePerKgInr: z.number().positive(),
  maxPerPurchaseInr: z.number().positive(),
  maxHoldingHours: z.number().positive(),
  pollIntervalSec: z.number().int().positive(),
  escalationPolicy: z.object({
    procurementFailLimit: z.number().int().positive(),
    onFailAction: z.literal("pause_and_escalate_investor"),
  }),
});

export const FounderPlanSchema = z.object({
  objective: z.string(),
  charter: BusinessCharterSchema,
  taskDag: z.array(TaskSchema),
  agentAssignments: z.array(
    z.object({
      capability: z.string(),
      did: z.string(),
      wallet: z.string(),
    })
  ),
});

export const A2AMessageSchema = z.object({
  traceId: z.string(),
  from: z.string(),
  to: z.string(),
  taskType: z.string(),
  payload: z.record(z.any()),
  ts: z.string(),
});

export const AgentCardSchema = z.object({
  did: z.string(),
  wallet: z.string(),
  capabilities: z.array(z.string()).min(1),
  endpoint: z.string().optional(),
});

export const LedgerEventSchema = z.object({
  ts: z.string(),
  type: z.enum(["BUY", "SELL", "TRANSPORT", "SPEND", "DEPLOY", "DISSOLVE"]),
  amountInr: z.number().nonnegative(),
  details: z.record(z.any()),
  txHash: z.string().optional(),
  txUrl: z.string().optional(),
});

export const AccountantInputEventSchema = z.object({
  type: z.enum(["deposit", "purchase", "transport", "sale", "fee", "dissolve"]),
  amountInr: z.number().nonnegative(),
  qtyKg: z.number().nonnegative().optional(),
  agent: z.enum([
    "founder",
    "price_monitor",
    "procurement",
    "logistics",
    "sales",
    "accountant",
  ]),
  txHash: z.string().optional(),
  meta: z.record(z.any()).default({}),
});

export type FounderPlan = z.infer<typeof FounderPlanSchema>;
export type BusinessCharter = z.infer<typeof BusinessCharterSchema>;
export type A2AMessage = z.infer<typeof A2AMessageSchema>;
export type AgentCard = z.infer<typeof AgentCardSchema>;
export type LedgerEvent = z.infer<typeof LedgerEventSchema>;
export type AccountantInputEvent = z.infer<typeof AccountantInputEventSchema>;
