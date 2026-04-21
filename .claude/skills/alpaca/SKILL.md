---
name: alpaca
description: Query and trade US equities via the Alpaca brokerage API. Use this skill for every brokerage interaction in the trading bot — never call the Alpaca HTTP API directly with curl. Includes pre-trade gating that enforces dollar caps and requires a stop-loss on every long order.
---

# Alpaca skill

All interactions with the Alpaca brokerage go through the scripts in
`./scripts/`. They share these environment variables:

- `ALPACA_KEY_ID` — API key id
- `ALPACA_SECRET_KEY` — API secret
- `ALPACA_PAPER` — `true` (default) routes to paper, `false` routes to live
- `ALPACA_MAX_ORDER_USD` — hard cap on dollar size for any single order
  (default `2500`)

Scripts read keys from the environment. Never echo them.

## Scripts

Run each from the repo root (`./.claude/skills/alpaca/scripts/<name> ...`).
All scripts print JSON to stdout and exit non-zero on error.

| Script            | Purpose                                        |
|-------------------|------------------------------------------------|
| `account`         | `GET /v2/account` — equity, buying power, cash |
| `clock`           | `GET /v2/clock` — is the market open?          |
| `positions`       | `GET /v2/positions` — open positions           |
| `orders`          | `GET /v2/orders` — query orders by status      |
| `quote <SYM>`     | latest quote for a symbol                      |
| `bars <SYM> <TF>` | historical bars (TF: `1Day`, `1Hour`, `5Min`)  |
| `place-order`     | submit an order (gated — see below)            |
| `cancel <ID>`     | cancel an open order                           |
| `close <SYM>`     | close a position at market                     |

## Pre-trade gating (in `place-order`)

The `place-order` script applies these checks BEFORE hitting the API. If any
fails, it exits non-zero and prints the reason — do NOT retry the same
request expecting a different result.

1. `ALPACA_KEY_ID` and `ALPACA_SECRET_KEY` must be set.
2. `qty * limit_price` (or `qty * last_trade` for market) must not exceed
   `ALPACA_MAX_ORDER_USD`.
3. Entry orders (side=buy, intent=entry) MUST include a `--stop` argument.
   The script refuses to place an entry without a recorded stop.
4. Stop distance (`|limit - stop| / limit`) must be between 2% and 5% for
   long entries.
5. `time_in_force` must be `day` (no GTC, no IOC).
6. Symbol must exist in `trading/strategy/universe.md`. The script greps for
   the symbol and rejects if not found.
7. If `ALPACA_PAPER` is unset, the script assumes paper and prints a
   warning.

## Usage examples

```bash
# Account snapshot
./.claude/skills/alpaca/scripts/account

# Buy 10 AAPL with a $180 limit and a $176.40 stop (2% below)
./.claude/skills/alpaca/scripts/place-order \
  --symbol AAPL --side buy --intent entry \
  --qty 10 --type limit --limit 180.00 --stop 176.40 --tif day

# Place the stop-loss order after the entry fills
./.claude/skills/alpaca/scripts/place-order \
  --symbol AAPL --side sell --intent stop \
  --qty 10 --type stop --stop 176.40 --tif day

# Close all of AAPL at market
./.claude/skills/alpaca/scripts/close AAPL
```

## When to use

- Always. Every brokerage query or order in the trading bot routines goes
  through this skill. If you find yourself writing `curl https://...alpaca`,
  stop and use the script instead.
