"""Category 5 — SaaS licence arbitrage tools. Stripe subscriptions + Razorpay payouts via mock API."""
import os, time, httpx, uuid
from autocorp.core.config import DEMO_MODE, MOCK_URL

_ST = (MOCK_URL + "/stripe") if DEMO_MODE else "https://api.stripe.com"
_RZ = (MOCK_URL + "/razorpay") if DEMO_MODE else "https://api.razorpay.com"

async def buy_saas_licence_bulk(product: str = "notion_team", seats: int = 10) -> dict:
    bulk_price_per_seat = 15.20  # annual bulk rate
    total_cost = bulk_price_per_seat * seats
    licence_id = f"LIC-{uuid.uuid4().hex[:8].upper()}"
    return {"licence_id": licence_id, "product": product, "seats": seats,
            "cost_per_seat": bulk_price_per_seat, "total_cost_usd": total_cost,
            "purchased_at": time.time(), "expires_at": time.time() + 365*86400}

async def create_stripe_subscription(licence_id: str, buyer_email: str, 
                                       price_monthly: float = 17.50) -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(f"{_ST}/v1/subscriptions", json={
            "price_monthly": price_monthly, "licence_id": licence_id, "buyer_email": buyer_email
        }, headers={"Authorization": f"Bearer {os.getenv('STRIPE_SECRET_KEY','sk_test_demo')}",
                    "Content-Type": "application/json"})
        r.raise_for_status()
        return r.json()

async def check_stripe_renewals(licence_id: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"{_ST}/v1/subscriptions",
            headers={"Authorization": f"Bearer {os.getenv('STRIPE_SECRET_KEY','sk_test_demo')}",
                     "Content-Type": "application/json"})
        r.raise_for_status()
        data   = r.json()
        active = len([s for s in data.get("data", []) if s.get("status") == "active"])
        mrr    = round(active * 17.50, 2)
        return {"licence_id": licence_id, "active_subscriptions": active,
                "mrr_usd": mrr, "churn_this_month": max(0, active - 14),
                "new_this_month": 3, "ts": time.time()}

async def allocate_seat(licence_id: str, buyer_email: str) -> dict:
    return {"seat_id": f"SEAT-{uuid.uuid4().hex[:8].upper()}", "licence_id": licence_id,
            "buyer_email": buyer_email, "activated_at": time.time(),
            "access_url": f"https://app.notion.so/invite/{licence_id[:8]}",
            "status": "active", "ts": time.time()}

async def create_razorpay_payout(amount_inr: float, upi_id: str, description: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(f"{_RZ}/v1/payouts", json={
            "amount": int(amount_inr * 100), "currency": "INR", "mode": "UPI",
            "purpose": "payout", "fund_account_id": upi_id, "narration": description
        }, headers={"Authorization": f"Bearer {os.getenv('RAZORPAY_KEY_ID','rzp_test_demo')}",
                    "Content-Type": "application/json"})
        r.raise_for_status()
        return r.json()

def calculate_saas_profit(bulk_cost_per_seat: float, retail_monthly: float,
                           seats_sold: int, months: int = 12) -> dict:
    total_cost = bulk_cost_per_seat * seats_sold
    total_revenue = retail_monthly * seats_sold * months
    profit = total_revenue - total_cost
    roi = (profit / total_cost * 100) if total_cost else 0
    return {"cost_usd": round(total_cost,2), "revenue_usd": round(total_revenue,2),
            "profit_usd": round(profit,2), "roi_pct": round(roi,2), "seats": seats_sold, "months": months}

SAAS_TOOLS = [buy_saas_licence_bulk, create_stripe_subscription, check_stripe_renewals,
              allocate_seat, create_razorpay_payout, calculate_saas_profit]
