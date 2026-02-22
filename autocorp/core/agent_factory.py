"""
Agent Factory — dynamic agent instantiation based on charter category.

Returns the correct category-specific agent (PriceMonitor, Procurement, Sales)
based on the charter's category field.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.base_agent import BaseAgent


def get_price_monitor(charter: dict) -> "BaseAgent":
    """Create the correct PriceMonitor for the charter's category."""
    category = charter.get("category", "1_crypto")
    if category == "1_crypto":
        from autocorp.categories.category1_crypto.price_monitor import CryptoPriceMonitor
        return CryptoPriceMonitor(charter)
    elif category == "2_compute":
        from autocorp.categories.category2_compute.price_monitor import ComputePriceMonitor
        return ComputePriceMonitor(charter)
    elif category == "5_saas":
        from autocorp.categories.category5_saas.price_monitor import SaaSPriceMonitor
        return SaaSPriceMonitor(charter)
    raise ValueError(f"Unknown category: {category}")


def get_procurement(charter: dict) -> "BaseAgent":
    """Create the correct Procurement agent for the charter's category."""
    category = charter.get("category", "1_crypto")
    if category == "1_crypto":
        from autocorp.categories.category1_crypto.procurement import CryptoProcurement
        return CryptoProcurement(charter)
    elif category == "2_compute":
        from autocorp.categories.category2_compute.procurement import ComputeProcurement
        return ComputeProcurement(charter)
    elif category == "5_saas":
        from autocorp.categories.category5_saas.procurement import SaaSProcurement
        return SaaSProcurement(charter)
    raise ValueError(f"Unknown category: {category}")


def get_sales(charter: dict) -> "BaseAgent":
    """Create the correct Sales agent for the charter's category."""
    category = charter.get("category", "1_crypto")
    if category == "1_crypto":
        from autocorp.categories.category1_crypto.sales import CryptoSales
        return CryptoSales(charter)
    elif category == "2_compute":
        from autocorp.categories.category2_compute.sales import ComputeSales
        return ComputeSales(charter)
    elif category == "5_saas":
        from autocorp.categories.category5_saas.sales import SaaSSales
        return SaaSSales(charter)
    raise ValueError(f"Unknown category: {category}")
