import { accountantService } from "./accountant/accountantService.js";

export function seedDemoAccountantFlow(): void {
  accountantService.ingest({
    type: "deposit",
    amountInr: 30000,
    agent: "founder",
    meta: { note: "Investor escrow deposit" },
  });

  accountantService.ingest({
    type: "purchase",
    amountInr: 15600,
    qtyKg: 200,
    agent: "procurement",
    meta: { lotId: "LOT-001", pricePerKg: 78 },
  });

  accountantService.ingest({
    type: "transport",
    amountInr: 1800,
    qtyKg: 200,
    agent: "logistics",
    meta: { trackingId: "TRK-001", route: "Jodhpur>Jaipur>Ahmedabad>Mumbai", simulated: true },
  });

  accountantService.ingest({
    type: "sale",
    amountInr: 19000,
    qtyKg: 200,
    agent: "sales",
    meta: { buyerId: "BUYER-MUM-14", pricePerKg: 95, settlement: "[SIMULATED]" },
  });

  accountantService.ingest({
    type: "fee",
    amountInr: 600,
    agent: "accountant",
    meta: { note: "network + ops fee" },
  });
}
