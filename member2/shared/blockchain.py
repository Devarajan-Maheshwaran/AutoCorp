"""
Blockchain helpers for Sepolia testnet interaction.

Provides Web3 plumbing shared by all three agents (Price Monitor, Procurement,
Sales).  Every trade action is recorded on the BusinessEntity smart contract
so judges can verify activity on Sepolia Etherscan.

If ``BUSINESS_ENTITY_ADDRESS`` is not set the helpers degrade gracefully —
they log a warning and return ``None`` instead of crashing.
"""

from __future__ import annotations

import logging
from typing import Any

from web3 import Web3
from web3.contract import Contract

from member2.shared.config import BUSINESS_ENTITY_ADDRESS, RPC_URL

log = logging.getLogger(__name__)

# ── Web3 connection ────────────────────────────────────────────────────────
w3 = Web3(Web3.HTTPProvider(RPC_URL))

# Sepolia chain ID – hardcoded per spec
_CHAIN_ID = 11155111

# ── ABI stubs (Member 3 will provide the full ABI) ────────────────────────
BUSINESS_ENTITY_ABI: list[dict[str, Any]] = [
    # ── Functions ──────────────────────────────────────────────────────
    {
        "type": "function",
        "name": "recordPurchase",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "qty", "type": "uint256"},
            {"name": "pricePerKgCents", "type": "uint256"},
            {"name": "lotId", "type": "string"},
        ],
        "outputs": [],
    },
    {
        "type": "function",
        "name": "recordSale",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "qty", "type": "uint256"},
            {"name": "pricePerKgCents", "type": "uint256"},
            {"name": "buyerId", "type": "string"},
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
    # ── Events ─────────────────────────────────────────────────────────
    {
        "type": "event",
        "name": "PurchaseRecorded",
        "inputs": [
            {"name": "qty", "type": "uint256", "indexed": False},
            {"name": "pricePerKgCents", "type": "uint256", "indexed": False},
            {"name": "lotId", "type": "string", "indexed": False},
        ],
    },
    {
        "type": "event",
        "name": "SaleRecorded",
        "inputs": [
            {"name": "qty", "type": "uint256", "indexed": False},
            {"name": "pricePerKgCents", "type": "uint256", "indexed": False},
            {"name": "buyerId", "type": "string", "indexed": False},
        ],
    },
]


# ── Contract accessor ─────────────────────────────────────────────────────


def get_business_contract(
    address: str = BUSINESS_ENTITY_ADDRESS,
) -> Contract | None:
    """
    Return a Contract instance bound to *address*, or ``None`` if the address
    is not yet configured (Member 3 hasn't deployed yet).
    """
    if not address:
        log.warning(
            "BUSINESS_ENTITY_ADDRESS not set — skipping on-chain calls"
        )
        return None

    return w3.eth.contract(
        address=Web3.to_checksum_address(address),
        abi=BUSINESS_ENTITY_ABI,
    )


# ── Transaction sender ───────────────────────────────────────────────────


def send_tx(contract_fn, private_key: str) -> str:
    """
    Build, sign, and broadcast a transaction that calls *contract_fn*.

    Parameters
    ----------
    contract_fn : ContractFunction
        A bound contract call, e.g.
        ``contract.functions.recordPurchase(qty, price, lotId)``.
    private_key : str
        Hex-encoded private key of the signing agent.

    Returns
    -------
    str
        The transaction hash as a hex string.

    Raises
    ------
    Any web3 / RPC exception — callers are responsible for catching and
    publishing an error event to the dashboard.
    """
    account = w3.eth.account.from_key(private_key)
    nonce = w3.eth.get_transaction_count(account.address)

    tx = contract_fn.build_transaction(
        {
            "from": account.address,
            "nonce": nonce,
            "gas": 200000,
            "gasPrice": w3.to_wei("20", "gwei"),
            "chainId": _CHAIN_ID,
        }
    )

    signed = w3.eth.account.sign_transaction(tx, private_key)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)

    return tx_hash.hex()


# ── Read helpers ──────────────────────────────────────────────────────────


def get_escrow_balance() -> float | None:
    """
    Return the escrow balance in ETH (``float``), or ``None`` if the
    contract address is not configured.
    """
    contract = get_business_contract()
    if contract is None:
        return None

    balance_wei: int = contract.functions.getEscrowBalance().call()
    return float(w3.from_wei(balance_wei, "ether"))
