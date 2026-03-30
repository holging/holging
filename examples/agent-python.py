#!/usr/bin/env python3
"""
Holging Agent Example — Python

Full cycle: claim USDC → check prices → simulate → mint → check position → redeem

Usage:
    pip install solders solana requests
    python examples/agent-python.py

Requires:
    A Solana devnet wallet at ./wallet.json (or set WALLET_PATH env)
"""

import os
import sys
import json
import time
import base64
import requests
from pathlib import Path

try:
    from solders.keypair import Keypair
    from solders.transaction import Transaction as SoldersTransaction
    from solana.rpc.api import Client
    from solana.transaction import Transaction
except ImportError:
    print("Install dependencies: pip install solders solana requests")
    sys.exit(1)

API = os.environ.get("HOLGING_API", "https://api.holging.com")
RPC = os.environ.get("RPC_URL", "https://api.devnet.solana.com")
WALLET_PATH = os.environ.get("WALLET_PATH", "./wallet.json")

client = Client(RPC)


def load_keypair() -> Keypair:
    """Load or create a Solana keypair."""
    path = Path(WALLET_PATH)
    if not path.exists():
        print(f"Creating new wallet at {WALLET_PATH}...")
        kp = Keypair()
        path.write_text(json.dumps(list(bytes(kp))))
        return kp
    raw = json.loads(path.read_text())
    return Keypair.from_bytes(bytes(raw))


def api_get(path: str) -> dict:
    """GET request to Holging API."""
    resp = requests.get(f"{API}{path}", timeout=30)
    resp.raise_for_status()
    return resp.json()


def api_post(path: str, body: dict) -> dict:
    """POST request to Holging API."""
    resp = requests.post(f"{API}{path}", json=body, timeout=45)
    resp.raise_for_status()
    return resp.json()


def sign_and_send(tx_base64: str, keypair: Keypair) -> str:
    """Decode unsigned tx, sign locally, submit to Solana."""
    tx_bytes = base64.b64decode(tx_base64)
    tx = Transaction.deserialize(tx_bytes)
    tx.sign(keypair)
    result = client.send_raw_transaction(bytes(tx.serialize()))
    sig = str(result.value)
    # Wait for confirmation
    for _ in range(30):
        resp = client.get_signature_statuses([result.value])
        status = resp.value[0]
        if status and status.confirmation_status:
            break
        time.sleep(1)
    return sig


def log(step: str, msg: str = ""):
    """Print a formatted step header."""
    print(f"\n{'═' * 60}")
    print(f"  {step}")
    print(f"{'═' * 60}")
    if msg:
        print(msg)


def main():
    keypair = load_keypair()
    wallet = str(keypair.pubkey())
    print(f"\n🤖 Holging Agent — Python Example")
    print(f"   Wallet: {wallet}")
    print(f"   API:    {API}")

    # Step 1: Claim USDC
    log("Step 1: Claim devnet USDC", "Requesting 5,000 USDC from on-chain faucet...")
    try:
        claim = api_post("/build/claim_usdc", {"wallet": wallet})
        if "tx" in claim:
            sig = sign_and_send(claim["tx"], keypair)
            print(f"  ✅ Claimed! tx: {sig[:16]}...")
        else:
            print(f"  ⚠ {claim.get('error', 'Unknown error')}")
    except Exception as e:
        print(f"  ⏳ {e}")

    # Step 2: Market scan
    log("Step 2: Market scan", "Fetching all pool prices...")
    prices = api_get("/prices")
    for pool_id, p in prices["prices"].items():
        if "error" in p:
            print(f"  {pool_id}: {p['error']}")
        else:
            print(f"  {p['asset']:<5} ${p['assetPrice']:>8.2f} | {p['token']:<12} ${p['tokenPrice']:>10.4f} | vault {p['vaultBalance']}")

    # Step 3: Check position
    log("Step 3: Check position")
    pos = api_get(f"/position?wallet={wallet}&pool=sol")
    print(f"  SOL:      {pos['sol']}")
    print(f"  USDC:     ${pos['usdc']}")
    print(f"  shortSOL: {pos.get('shortSOL', 0)}")

    if pos["usdc"] < 100:
        print("\n  ⚠ Not enough USDC. Need SOL for gas + claim USDC first.")
        return

    # Step 4: Simulate mint
    mint_amount = 100
    log(f"Step 4: Simulate mint ${mint_amount}")
    sim = api_get(f"/simulate/mint?amount={mint_amount}&pool=sol")
    print(f"  Expected: {sim['expectedTokens']} shortSOL")
    print(f"  Fee:      {sim['fee']}")
    print(f"  Price:    SOL ${sim['assetPrice']} → shortSOL ${sim['tokenPrice']}")

    # Step 5: Mint
    log(f"Step 5: Mint ${mint_amount} USDC → shortSOL", "Building transaction...")
    mint = api_post("/build/mint", {"wallet": wallet, "amount": mint_amount, "pool": "sol"})
    if "error" in mint:
        print(f"  ❌ {mint['error']}")
        return
    print(f"  Expected: {mint['expectedTokens']} shortSOL | Fee: {mint['fee']}")
    print(f"  Signing and submitting...")
    mint_sig = sign_and_send(mint["tx"], keypair)
    print(f"  ✅ Minted! tx: {mint_sig[:16]}...")

    # Step 6: Verify
    log("Step 6: Verify position")
    pos_after = api_get(f"/position?wallet={wallet}&pool=sol")
    print(f"  SOL:      {pos_after['sol']}")
    print(f"  USDC:     ${pos_after['usdc']}")
    print(f"  shortSOL: {pos_after.get('shortSOL', 0)}")

    # Step 7: Redeem
    log("Step 7: Redeem all shortSOL", "Waiting 3s for rate limit...")
    time.sleep(3)

    token_balance = pos_after.get("shortSOL", 0)
    if token_balance > 0:
        redeem = api_post("/build/redeem", {"wallet": wallet, "amount": token_balance, "pool": "sol"})
        if "error" in redeem:
            print(f"  ❌ {redeem['error']}")
        else:
            print(f"  Expected: ${redeem['expectedUsdc']} USDC | Fee: {redeem['fee']}")
            redeem_sig = sign_and_send(redeem["tx"], keypair)
            print(f"  ✅ Redeemed! tx: {redeem_sig[:16]}...")

    # Step 8: Final
    log("Step 8: Final position")
    pos_final = api_get(f"/position?wallet={wallet}&pool=sol")
    print(f"  SOL:      {pos_final['sol']}")
    print(f"  USDC:     ${pos_final['usdc']}")
    print(f"  shortSOL: {pos_final.get('shortSOL', 0)}")
    print(f"\n🏁 Done! Full cycle: claim → prices → simulate → mint → redeem → verify")


if __name__ == "__main__":
    main()
