import { z } from "zod";

// ──────────────────────────── Category-Agnostic Types ────────────────────────

export const SUPPORTED_CATEGORIES = ["1_crypto", "2_compute", "5_saas"] as const;
export type Category = (typeof SUPPORTED_CATEGORIES)[number];

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
  businessName: z.string(),
  category: z.enum(SUPPORTED_CATEGORIES),
  asset: z.string().optional(),
  budgetUsd: z.number().positive(),
  deadlineDays: z.number().int().positive(),
  minMarginPct: z.number().positive(),
  maxSingleTradePct: z.number().positive().default(20),
  stopLossPct: z.number().positive().default(5),
  pollIntervalSec: z.number().int().positive().default(30),
  parameters: z.record(z.any()).default({}),
  escalationPolicy: z
    .object({
      failLimit: z.number().int().positive().default(3),
      onFailAction: z.string().default("pause_and_escalate"),
    })
    .default({}),
});

export const FounderPlanSchema = z.object({
  objective: z.string(),
  charter: BusinessCharterSchema,
  taskDag: z.array(TaskSchema),
  agentAssignments: z.array(
    z.object({
      capability: z.string(),
      endpoint: z.string().optional(),
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
  name: z.string(),
  capabilities: z.array(z.string()).min(1),
  endpoint: z.string().optional(),
  port: z.number().optional(),
});

export const LedgerEventSchema = z.object({
  ts: z.string(),
  type: z.enum(["BUY", "SELL", "TRANSFER", "SPEND", "DEPLOY", "DISSOLVE"]),
  amountUsd: z.number().nonnegative(),
  category: z.enum(SUPPORTED_CATEGORIES).optional(),
  details: z.record(z.any()),
  txHash: z.string().optional(),
  txUrl: z.string().optional(),
});

export const AccountantInputEventSchema = z.object({
  type: z.enum(["deposit", "purchase", "transport", "sale", "fee", "dissolve"]),
  amountUsd: z.number().nonnegative(),
  quantity: z.number().nonnegative().optional(),
  category: z.enum(SUPPORTED_CATEGORIES).optional(),
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

