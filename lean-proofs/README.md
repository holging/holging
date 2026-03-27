# SolShort — Lean 4 Formal Proofs

Machine-checked proofs of the mathematical properties underlying the SolShort protocol, using Lean 4 + Mathlib.

## What is proven

8 theorems covering the core protocol invariants:

1. **holging_pnl_nonneg** — Holging P&L ≥ 0 for any price multiplier x > 0 (AM-GM inequality)
2. **holging_pnl_formula** — P&L = (x - 1)² / (2x) exact formula
3. **pricing_invariant** — shortSOL_price = k / SOL_price (multiplicative inverse model)
4. **positive_gamma** — d²V/dx² > 0 (portfolio is convex, always gains from volatility)
5. **zero_delta_at_entry** — dV/dx = 0 at x = 1 (market-neutral at inception)
6. **k_neutrality** — rebalancing k does not affect portfolio return
7. **no_path_dependency** — shortSOL price depends only on current SOL price, not history
8. **no_volatility_decay** — unlike leveraged ETFs, 1/x model has no daily decay

## Why formal verification

No DeFi protocol on Solana has published machine-checked proofs. Formal verification:
- Eliminates ambiguity in mathematical claims made to investors
- Provides audit-grade evidence for the AM-GM "always profitable" claim
- Documents protocol invariants in an executable, checkable format

## Structure

```
lean-proofs/
  ├── SolshortProofs/
  │   └── Basic.lean     — core theorem statements and proofs
  ├── lakefile.toml       — Lake build config (Lean 4 + Mathlib)
  └── README.md
```

## Running the proofs

Requires Lean 4 and Lake (the Lean build system).

```bash
cd lean-proofs
lake build
```

All theorems should check without errors.

## Relationship to the protocol

These proofs cover the mathematical model, not the on-chain Rust implementation. The Rust program at `programs/solshort/src/` implements the same model with integer arithmetic (fixed-point, 1e9 precision). The proofs establish that the underlying math is sound.

**Program ID:** `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX` (Solana Devnet)
