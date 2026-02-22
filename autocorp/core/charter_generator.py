"""
Charter Generator — LLM-powered business charter creation.

Converts user business input into a structured machine-executable charter JSON.
"""

from __future__ import annotations

import json
import os
import time
import uuid

import google.generativeai as genai

CHARTER_GENERATION_PROMPT = """
You are AutoCorp's business charter generator.
The user wants to run an autonomous micro-enterprise.
Given their input, generate a complete machine-executable charter JSON.

User Input:
  Category: {category}
  Sub-strategy: {sub_strategy}
  Budget (INR): {budget_inr}
  Duration (days): {duration_days}
  Min profit target (%): {min_profit_pct}
  Risk level: {risk_level}
  Custom notes: {custom_notes}

Generate a charter JSON with EXACTLY this structure:
{{
  "business_id": "<uuid>",
  "category": "<1_crypto|2_compute|5_saas>",
  "sub_strategy": "<cross_exchange|funding_rate|triangular|gpu_spot|saas_resale|api_credits>",
  "asset": "<what is being traded>",
  "buy_source": {{
    "name": "<exchange/platform name>",
    "api": "<API name>",
    "endpoint": "<base URL>"
  }},
  "sell_destination": {{
    "name": "<exchange/platform name>",
    "api": "<API name>",
    "endpoint": "<base URL>"
  }},
  "price_unit": "<unit of measurement>",
  "budget_usdc": <budget in USDC, convert INR at 83.5>,
  "budget_inr": <original INR budget>,
  "min_margin_pct": <minimum acceptable profit percentage as integer>,
  "duration_days": <duration>,
  "deadline_timestamp": <unix timestamp of deadline>,
  "buy_trigger": "<plain English condition for buying>",
  "sell_trigger": "<plain English condition for selling>",
  "cut_loss_trigger": "<plain English condition for cutting losses>",
  "max_holding_hours": <maximum holding time in hours>,
  "risk_params": {{
    "max_single_trade_pct": <max % of budget per trade>,
    "stop_loss_pct": <stop loss percentage>,
    "volatility_window_hours": <hours to compute price average>
  }},
  "logistics_type": "<none|digital_credentials|api_transfer>",
  "settlement": {{
    "method": "<usdc_sepolia>",
    "offramp": "coindcx",
    "payout": "razorpay"
  }},
  "agents_needed": ["PriceMonitorAgent","ProcurementAgent","LogisticsAgent","SalesAgent","AccountantAgent"],
  "price_monitor_config": {{
    "poll_interval_seconds": <int>,
    "price_window_size": <int>,
    "anomaly_threshold_pct": <int>
  }},
  "procurement_config": {{
    "min_spread_pct": <int>,
    "simultaneous_execution": <true|false>,
    "max_slippage_pct": <float>
  }},
  "sales_config": {{
    "repricing_interval_minutes": <int>,
    "min_holding_before_cut_loss_hours": <int>,
    "auto_renew": <true|false>
  }}
}}

Return ONLY the JSON. No explanation. No markdown. No extra text.
"""


def _build_fallback_charter(
    category: str,
    sub_strategy: str,
    budget_inr: float,
    duration_days: int,
    min_profit_pct: int,
    risk_level: str,
) -> dict:
    """Deterministic fallback charter when LLM is unavailable."""
    budget_usdc = round(budget_inr / 83.5, 2)
    biz_id = str(uuid.uuid4())
    deadline = time.time() + duration_days * 86400

    base = {
        "business_id": biz_id,
        "category": category,
        "sub_strategy": sub_strategy,
        "budget_usdc": budget_usdc,
        "budget_inr": budget_inr,
        "min_margin_pct": min_profit_pct,
        "duration_days": duration_days,
        "deadline_timestamp": int(deadline),
        "max_holding_hours": 72,
        "risk_params": {
            "max_single_trade_pct": 25 if risk_level == "high" else 15 if risk_level == "medium" else 10,
            "stop_loss_pct": 5 if risk_level == "high" else 3 if risk_level == "medium" else 2,
            "volatility_window_hours": 4,
        },
        "logistics_type": "none",
        "settlement": {"method": "usdc_sepolia", "offramp": "coindcx", "payout": "razorpay"},
        "agents_needed": [
            "PriceMonitorAgent", "ProcurementAgent", "LogisticsAgent",
            "SalesAgent", "AccountantAgent",
        ],
        "price_monitor_config": {"poll_interval_seconds": 10, "price_window_size": 20, "anomaly_threshold_pct": 10},
        "procurement_config": {"min_spread_pct": min_profit_pct, "simultaneous_execution": True, "max_slippage_pct": 0.5},
        "sales_config": {"repricing_interval_minutes": 30, "min_holding_before_cut_loss_hours": 4, "auto_renew": True},
    }

    if category == "1_crypto":
        base.update({
            "asset": "ETHUSDT",
            "buy_source": {"name": "Binance", "api": "Binance Spot", "endpoint": "https://api.binance.com"},
            "sell_destination": {"name": "CoinDCX", "api": "CoinDCX Spot", "endpoint": "https://api.coindcx.com"},
            "price_unit": "USDT",
            "buy_trigger": f"Spread between exchanges exceeds {min_profit_pct}% + fees",
            "sell_trigger": "Simultaneous execution on sell exchange",
            "cut_loss_trigger": f"Position loss exceeds {base['risk_params']['stop_loss_pct']}%",
            "logistics_type": "none",
        })
    elif category == "2_compute":
        base.update({
            "asset": "RTX_4090",
            "buy_source": {"name": "Vast.ai", "api": "Vast.ai REST", "endpoint": "https://console.vast.ai/api/v0"},
            "sell_destination": {"name": "RunPod", "api": "RunPod GraphQL", "endpoint": "https://api.runpod.io"},
            "price_unit": "$/hr",
            "buy_trigger": "Spot price drops 40%+ below 7-period average",
            "sell_trigger": f"RunPod listing margin > {min_profit_pct}%",
            "cut_loss_trigger": "Instance within 4 hours of expiry with no buyer",
            "logistics_type": "digital_credentials",
            "max_holding_hours": 48,
            "price_monitor_config": {"poll_interval_seconds": 60, "price_window_size": 20, "anomaly_threshold_pct": 50},
        })
    elif category == "5_saas":
        base.update({
            "asset": "notion_team",
            "buy_source": {"name": "Notion Reseller", "api": "Notion Admin API", "endpoint": "https://api.notion.com"},
            "sell_destination": {"name": "Stripe Subscriptions", "api": "Stripe", "endpoint": "https://api.stripe.com"},
            "price_unit": "$/user/month",
            "buy_trigger": f"Reseller margin > {min_profit_pct}% after all fees",
            "sell_trigger": "Buyer signs up via Stripe subscription",
            "cut_loss_trigger": "Churn rate exceeds 30% and MRR drops below cost",
            "logistics_type": "api_transfer",
            "max_holding_hours": duration_days * 24,
            "price_monitor_config": {"poll_interval_seconds": 3600, "price_window_size": 7, "anomaly_threshold_pct": 20},
            "sales_config": {"repricing_interval_minutes": 1440, "min_holding_before_cut_loss_hours": 168, "auto_renew": True},
        })

    return base


async def generate_charter(
    category: str,
    sub_strategy: str,
    budget_inr: float,
    duration_days: int,
    min_profit_pct: int = 15,
    risk_level: str = "medium",
    custom_notes: str = "",
) -> dict:
    """Generate a charter via Gemini LLM with deterministic fallback."""
    api_key = os.getenv("GEMINI_API_KEY", "")

    if not api_key:
        return _build_fallback_charter(
            category, sub_strategy, budget_inr, duration_days, min_profit_pct, risk_level
        )

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.0-flash")

        prompt = CHARTER_GENERATION_PROMPT.format(
            category=category,
            sub_strategy=sub_strategy,
            budget_inr=budget_inr,
            duration_days=duration_days,
            min_profit_pct=min_profit_pct,
            risk_level=risk_level,
            custom_notes=custom_notes,
        )

        response = await model.generate_content_async(prompt)
        raw = response.text.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

        charter = json.loads(raw)

        # Validate required fields
        required = [
            "category", "asset", "buy_source", "sell_destination",
            "budget_usdc", "min_margin_pct", "buy_trigger", "agents_needed",
        ]
        for field in required:
            if field not in charter:
                raise ValueError(f"Charter missing required field: {field}")

        return charter

    except Exception as exc:
        print(f"[CharterGenerator] LLM failed ({exc}), using deterministic fallback")
        return _build_fallback_charter(
            category, sub_strategy, budget_inr, duration_days, min_profit_pct, risk_level
        )
