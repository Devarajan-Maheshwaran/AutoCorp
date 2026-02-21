"""
Centralised configuration for AutoCorp agents.

All secrets / env-vars are loaded from a .env file via python-dotenv.
The CHARTER dict captures the business rules agreed upon by the DAO.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ── API keys ────────────────────────────────────────────────────────────────
DATA_GOV_API_KEY: str = os.getenv("DATA_GOV_API_KEY", "")
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

# ── Blockchain / Ethereum Sepolia ──────────────────────────────────────────
RPC_URL: str = os.getenv("RPC_URL", "https://rpc.sepolia.org")
PRICE_MONITOR_PRIVATE_KEY: str = os.getenv("PRICE_MONITOR_PRIVATE_KEY", "")
PROCUREMENT_PRIVATE_KEY: str = os.getenv("PROCUREMENT_PRIVATE_KEY", "")
SALES_PRIVATE_KEY: str = os.getenv("SALES_PRIVATE_KEY", "")
BUSINESS_ENTITY_ADDRESS: str = os.getenv("BUSINESS_ENTITY_ADDRESS", "")

# ── Peer agent URLs ────────────────────────────────────────────────────────
PROCUREMENT_AGENT_URL: str = os.getenv("PROCUREMENT_AGENT_URL", "http://localhost:8003")
LOGISTICS_AGENT_URL: str = os.getenv("LOGISTICS_AGENT_URL", "http://localhost:8004")
SALES_AGENT_URL: str = os.getenv("SALES_AGENT_URL", "http://localhost:8005")
ACCOUNTANT_AGENT_URL: str = os.getenv("ACCOUNTANT_AGENT_URL", "http://localhost:8006")
FOUNDER_AGENT_URL: str = os.getenv("FOUNDER_AGENT_URL", "http://localhost:8001")

# ── Business charter ───────────────────────────────────────────────────────
CHARTER: dict = {
    "budget_inr": 30000,
    "commodity": "Moong Dal",
    "source_market": "Jodhpur",
    "destination_market": "Mumbai",
    "price_threshold_buy": 80.0,      # ₹/kg — trigger buy when modal price <= this
    "min_margin_pct": 15.0,
    "max_lot_kg": 200,
    "poll_interval_sec": 30,          # how often to call data.gov.in
    "deadline_days": 30,
    "max_holding_days": 5,
}
