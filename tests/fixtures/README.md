# Test Fixtures

## mock-pyth-keypair.json

**This is a TEST keypair** used only for `anchor test` integration tests.

It generates the mock Pyth PriceUpdateV2 account at `6dNYY44HhLY3qZnU6WmSNUWqn4CDBbZ5FQu7jeQujVkC` which is loaded into the local test validator via `Anchor.toml [test.validator.account]`.

- **Not a real wallet** — controls no SOL, no tokens, no funds
- **Only used in localnet tests** — never touches devnet or mainnet
- **Safe to have in git** — required for `anchor test` to work

## mock-pyth-price-update.json

Pre-built PriceUpdateV2 account data:
- Price: $170.00 (17000 × 10^-2)
- Feed: SOL/USD (`ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d`)
- Timestamp: year 2100 (never stale)
- Verification: Full (0x01)
