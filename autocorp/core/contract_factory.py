"""
Contract Factory — deploys BusinessEntity contracts via AutoCorpFactory on Sepolia.

Calls AutoCorpFactory.deployBusiness() and returns the deployed contract address.
"""

from __future__ import annotations

import hashlib
import json
import os

from web3 import Web3

from autocorp.core.blockchain import w3, CHAIN_ID, PRIVATE_KEY

CATEGORY_MAP = {
    "1_crypto": 0,
    "2_compute": 1,
    "5_saas": 2,
}


async def deploy_business_entity(charter: dict) -> str:
    """
    Calls AutoCorpFactory.deployBusiness() on Sepolia.
    Returns the deployed BusinessEntity contract address.
    """
    factory_address = os.getenv("FACTORY_CONTRACT_ADDRESS")
    private_key = PRIVATE_KEY

    if not factory_address:
        raise EnvironmentError("FACTORY_CONTRACT_ADDRESS not set in .env")
    if not private_key:
        raise EnvironmentError("PRIVATE_KEY not set in .env")

    # Load ABI from smartcontracts artifacts
    abi_path = os.path.join(
        os.path.dirname(__file__),
        "../../smartcontracts/artifacts/contracts/"
        "AutoCorpFactory.sol/AutoCorpFactory.json"
    )

    if not os.path.exists(abi_path):
        raise FileNotFoundError(
            f"Factory ABI not found at {abi_path}. "
            "Run: cd smartcontracts && npx hardhat compile"
        )

    with open(abi_path) as f:
        factory_abi = json.load(f)["abi"]

    factory = w3.eth.contract(
        address=Web3.to_checksum_address(factory_address),
        abi=factory_abi,
    )

    account = w3.eth.account.from_key(private_key)
    investor = account.address

    # Charter hash for on-chain reference
    charter_json = json.dumps(charter, sort_keys=True)
    charter_hash = hashlib.sha256(charter_json.encode()).digest()

    category_int = CATEGORY_MAP.get(charter.get("category", "1_crypto"), 0)
    budget_usdc_raw = int(charter.get("budget_usdc", 10000) * 1_000_000)
    min_margin_bps = int(charter.get("min_margin_pct", 10) * 100)
    duration_secs = int(charter.get("duration_days", 30) * 86400)
    max_holding_sec = int(charter.get("max_holding_hours", 48) * 3600)

    nonce = w3.eth.get_transaction_count(account.address)
    tx = factory.functions.deployBusiness(
        investor,
        charter_hash,
        category_int,
        charter.get("sub_strategy", "cross_exchange"),
        charter.get("asset", "UNKNOWN"),
        budget_usdc_raw,
        min_margin_bps,
        duration_secs,
        max_holding_sec,
    ).build_transaction({
        "from": account.address,
        "nonce": nonce,
        "gas": 3_000_000,
        "gasPrice": w3.eth.gas_price,
        "chainId": CHAIN_ID,
    })

    signed = w3.eth.account.sign_transaction(tx, private_key)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

    # Extract deployed address from BusinessDeployed event
    logs = factory.events.BusinessDeployed().process_receipt(receipt)
    if logs:
        return logs[0]["args"]["contractAddress"]

    raise RuntimeError("BusinessDeployed event not found in receipt")
