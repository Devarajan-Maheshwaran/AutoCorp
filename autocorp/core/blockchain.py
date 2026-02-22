"""
Blockchain helpers for Ethereum Sepolia testnet interaction.

Provides Web3 plumbing shared by all agents. Every trade action is recorded
on the BusinessEntity smart contract so judges can verify activity on
Sepolia Etherscan.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from dotenv import load_dotenv
from web3 import Web3

load_dotenv()

log = logging.getLogger(__name__)

RPC_URL: str = os.getenv("SEPOLIA_RPC_URL", "https://rpc.sepolia.org")
CHAIN_ID = int(os.getenv("CHAIN_ID", "11155111"))
PRIVATE_KEY: str = os.getenv("PRIVATE_KEY", "")
BUSINESS_CONTRACT_ADDRESS: str = os.getenv("BUSINESS_CONTRACT_ADDRESS", "")
ETHERSCAN_BASE_URL: str = os.getenv("ETHERSCAN_BASE_URL", "https://sepolia.etherscan.io/tx/")

w3 = Web3(Web3.HTTPProvider(RPC_URL))

BUSINESS_ENTITY_ABI: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": "recordPurchase",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "lotId", "type": "string"},
            {"name": "costCents", "type": "uint256"},
            {"name": "currency", "type": "string"},
        ],
        "outputs": [],
    },
    {
        "type": "function",
        "name": "recordSale",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "lotId", "type": "string"},
            {"name": "revenueCents", "type": "uint256"},
            {"name": "currency", "type": "string"},
        ],
        "outputs": [],
    },
    {
        "type": "function",
        "name": "getEscrowBalance",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint256"}],
    },
    {
        "type": "function",
        "name": "getPnL",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [
            {"name": "revenue", "type": "int256"},
            {"name": "costs", "type": "int256"},
        ],
    },
    {
        "type": "function",
        "name": "dissolve",
        "stateMutability": "nonpayable",
        "inputs": [],
        "outputs": [],
    },
]


def get_business_contract(address: str = ""):
    addr = address or BUSINESS_CONTRACT_ADDRESS
    if not addr:
        log.warning("BUSINESS_CONTRACT_ADDRESS not set — on-chain calls will be skipped")
        return None
    try:
        return w3.eth.contract(address=Web3.to_checksum_address(addr), abi=BUSINESS_ENTITY_ABI)
    except Exception as exc:
        log.warning("Failed to load contract at %s: %s", addr, exc)
        return None


def get_escrow_balance() -> float | None:
    contract = get_business_contract()
    if not contract:
        return None
    try:
        raw = contract.functions.getEscrowBalance().call()
        return float(raw) / 1e18
    except Exception as exc:
        log.warning("getEscrowBalance failed: %s", exc)
        return None


async def record_purchase(lot_id: str, cost: float, currency: str = "USDC") -> dict | None:
    """Record a purchase on-chain. Returns tx hash or None if not configured."""
    contract = get_business_contract()
    if not contract or not PRIVATE_KEY:
        log.info("[SIMULATED] recordPurchase(%s, %s, %s)", lot_id, cost, currency)
        return {"simulated": True, "lot_id": lot_id, "cost": cost}
    try:
        account = w3.eth.account.from_key(PRIVATE_KEY)
        tx = contract.functions.recordPurchase(
            lot_id, int(cost * 100), currency
        ).build_transaction({
            "from": account.address,
            "nonce": w3.eth.get_transaction_count(account.address),
            "chainId": CHAIN_ID,
        })
        signed = account.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        return {"tx_hash": tx_hash.hex(), "etherscan": f"{ETHERSCAN_BASE_URL}{tx_hash.hex()}"}
    except Exception as exc:
        log.warning("recordPurchase on-chain failed: %s", exc)
        return {"simulated": True, "error": str(exc)}


async def record_sale(lot_id: str, revenue: float, currency: str = "USDC") -> dict | None:
    """Record a sale on-chain."""
    contract = get_business_contract()
    if not contract or not PRIVATE_KEY:
        log.info("[SIMULATED] recordSale(%s, %s, %s)", lot_id, revenue, currency)
        return {"simulated": True, "lot_id": lot_id, "revenue": revenue}
    try:
        account = w3.eth.account.from_key(PRIVATE_KEY)
        tx = contract.functions.recordSale(
            lot_id, int(revenue * 100), currency
        ).build_transaction({
            "from": account.address,
            "nonce": w3.eth.get_transaction_count(account.address),
            "chainId": CHAIN_ID,
        })
        signed = account.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        return {"tx_hash": tx_hash.hex(), "etherscan": f"{ETHERSCAN_BASE_URL}{tx_hash.hex()}"}
    except Exception as exc:
        log.warning("recordSale on-chain failed: %s", exc)
        return {"simulated": True, "error": str(exc)}
