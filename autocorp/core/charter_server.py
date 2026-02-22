"""
Charter Generation Server — FastAPI on port 8009.
Generates business charters via LLM or deterministic fallback.
Called by the masteragent's Founder Service when creating a new business.
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from autocorp.core.charter_generator import generate_charter

app = FastAPI(title="Charter Generator", version="2.0.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


class CharterRequest(BaseModel):
    objective: str
    category: str = "1_crypto"
    sub_strategy: str = "cross_exchange"
    budget_inr: float = 500000.0
    duration_days: int = 30
    min_profit_pct: int = 15
    risk_level: str = "medium"


@app.get("/health")
async def health():
    return {"status": "ok", "service": "charter_generator"}


@app.post("/generate")
async def generate(req: CharterRequest):
    charter = await generate_charter(
        category=req.category,
        sub_strategy=req.sub_strategy,
        budget_inr=req.budget_inr,
        duration_days=req.duration_days,
        min_profit_pct=req.min_profit_pct,
        risk_level=req.risk_level,
        custom_notes=req.objective,
    )
    return {"charter": charter, "category": req.category}


@app.get("/categories")
async def list_categories():
    return {
        "categories": [
            {"id": "1_crypto", "label": "Crypto Arbitrage", "sub_strategies": ["cross_exchange", "funding_rate", "triangular"]},
            {"id": "2_compute", "label": "Compute / GPU Arbitrage", "sub_strategies": ["gpu_spot", "api_credits"]},
            {"id": "5_saas", "label": "SaaS Licence Arbitrage", "sub_strategies": ["licence_resale", "domain_arb"]},
        ]
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("CHARTER_SERVER_PORT", "8009")))
