"""
MandiFeed – async wrapper around the data.gov.in commodity-price API.

Uses the open-data resource for daily market prices of agricultural
commodities reported by mandis across India.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import Any

import httpx

from member2.shared.config import DATA_GOV_API_KEY


class MandiFeedError(Exception):
    """Raised when the mandi price feed returns no usable data."""


class MandiFeed:
    """Fetches the latest mandi commodity prices from data.gov.in."""

    BASE_URL = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070"

    # ------------------------------------------------------------------ #
    #  Public helpers                                                      #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def get_latest_price(market: str, commodity: str) -> dict[str, Any]:
        """
        Fetch the most recent price record for *commodity* in *market*
        (assumed to be in Rajasthan, e.g. Jodhpur).

        Returns
        -------
        dict with keys: market, commodity, modal_price, min_price,
                        max_price, arrival_date, source
        """
        params = {
            "api-key": DATA_GOV_API_KEY,
            "format": "json",
            "limit": 10,
            "filters[State.keyword]": "Rajasthan",
            "filters[Market.keyword]": market,
            "filters[Commodity.keyword]": commodity,
        }
        return await MandiFeed._fetch_and_parse(params, market, commodity)

    @staticmethod
    async def get_latest_price_mumbai(commodity: str) -> dict[str, Any]:
        """
        Fetch the most recent price record for *commodity* in Mumbai
        (Maharashtra).  Falls back to "Navi Mumbai" if "Mumbai" returns
        no records.

        Returns the same dict shape as :meth:`get_latest_price`.
        """
        params = {
            "api-key": DATA_GOV_API_KEY,
            "format": "json",
            "limit": 10,
            "filters[State.keyword]": "Maharashtra",
            "filters[Market.keyword]": "Mumbai",
            "filters[Commodity.keyword]": commodity,
        }
        try:
            return await MandiFeed._fetch_and_parse(params, "Mumbai", commodity)
        except MandiFeedError:
            # Retry with Navi Mumbai
            params["filters[Market.keyword]"] = "Navi Mumbai"
            try:
                return await MandiFeed._fetch_and_parse(
                    params, "Navi Mumbai", commodity
                )
            except MandiFeedError:
                raise ValueError(f"No Mumbai data for {commodity}")

    # ------------------------------------------------------------------ #
    #  Internal                                                            #
    # ------------------------------------------------------------------ #

    @staticmethod
    async def _fetch_and_parse(
        params: dict[str, Any],
        market: str,
        commodity: str,
    ) -> dict[str, Any]:
        """Call data.gov.in, validate, and return the latest record."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(MandiFeed.BASE_URL, params=params)

        if resp.status_code != 200:
            raise MandiFeedError(
                f"data.gov.in returned HTTP {resp.status_code}: {resp.text}"
            )

        body = resp.json()
        records: list[dict] = body.get("records", [])

        if not records:
            raise MandiFeedError(
                f"No records returned for commodity='{commodity}' "
                f"market='{market}'.  Full response:\n{json.dumps(body, indent=2)}"
            )

        # Pick the most recent record by Arrival_Date (dd/mm/yyyy)
        def _parse_date(rec: dict) -> datetime:
            raw = rec.get("Arrival_Date", "01/01/1970")
            try:
                return datetime.strptime(raw, "%d/%m/%Y")
            except ValueError:
                return datetime(1970, 1, 1)

        latest = max(records, key=_parse_date)

        # Prices from data.gov.in are in Rs./Qtl (per quintal = 100 kg).
        # Divide by 100 to convert to ₹/kg for charter comparison.
        return {
            "market": latest.get("Market", market),
            "commodity": latest.get("Commodity", commodity),
            "modal_price": float(latest.get("Modal_Price", 0)) / 100,
            "min_price": float(latest.get("Min_Price", 0)) / 100,
            "max_price": float(latest.get("Max_Price", 0)) / 100,
            "arrival_date": latest.get("Arrival_Date", ""),
            "source": "data.gov.in Agmarknet",
        }


# ────────────────────────────────────────────────────────────────────────── #
#  Quick CLI smoke-test                                                      #
# ────────────────────────────────────────────────────────────────────────── #
if __name__ == "__main__":

    async def test() -> None:
        feed = MandiFeed()
        j = await feed.get_latest_price("Jodhpur", "Moong Dal")
        print(f"Jodhpur: ₹{j['modal_price']}/kg on {j['arrival_date']}")
        m = await feed.get_latest_price_mumbai("Moong Dal")
        print(f"Mumbai:  ₹{m['modal_price']}/kg on {m['arrival_date']}")
        print(f"Spread:  ₹{round(m['modal_price'] - j['modal_price'], 2)}/kg")

    asyncio.run(test())
