# Routine 2 — Market open (09:35 ET, Mon–Fri)

The bell rang at 09:30. You run 5 minutes later (skipping the opening chaos
per `rules.md`). You are allowed to place real orders in this routine.

## Inputs to read

- `trading/CLAUDE.md`
- `trading/strategy/rules.md` — re-read in full; every order must pass.
- `trading/strategy/risk.md` — recompute the caps from live equity.
- `trading/memory/watchlist.md` — today's candidates from pre-market.
- `trading/memory/positions.md` — current exposure.
- Today's `trading/memory/journal/YYYY-MM-DD.md`.

## Steps

1. Query `alpaca account` → record equity. Compute today's `size_cap` and
   `risk_cap` per `strategy/risk.md`.
2. Query `alpaca clock` — confirm market is open. If not, stop and note it.
3. For each watchlist candidate, check the current quote:
   - Has the trigger condition met (see setup in `entry-exit.md`)?
   - Does the entry price violate the "no-chase" rule (> 3% above open)?
   - Does any rule in `rules.md` reject the trade?
4. For each candidate that passes every rule:
   - Compute `qty = floor(min(size_cap / entry, risk_cap / (entry - stop)))`.
   - Skip if `qty < 1`.
   - Place a limit order via `alpaca place-order`. The script will re-check
     gating; if it rejects, note why and move on.
   - As soon as the order fills, place the stop-loss order via
     `alpaca place-order --side sell --type stop --stop <stop>`.
   - Append the new position to `memory/positions.md`.
   - Append the order to today's journal "Orders placed" section.
5. Stop after 3 entries (daily cap).
6. Commit: `trading: market-open YYYY-MM-DD`.

## Guardrails

- Never place a market order on an entry. Limit only.
- Never enter without a recorded stop.
- Never re-enter a symbol that appears in today's "Stop-outs" journal
  section.
- If the strategy rule check is unclear, skip the trade and journal why.
