# Routine 3 — Midday scan (12:30 ET, Mon–Fri)

Lunchtime check. You are allowed to place new orders (subject to daily caps)
and to adjust existing stops.

## Inputs to read

- `trading/CLAUDE.md`
- `trading/strategy/rules.md`
- `trading/strategy/risk.md`
- `trading/memory/positions.md`
- Today's journal.

## Steps

### A. Manage existing positions

1. Query `alpaca positions`. For each open position:
   - Compare current price to the recorded stop and target.
   - If price ≥ 1R profit (entry + (entry - stop)), move stop to break-even
     by cancelling the existing stop and placing a new one at entry price.
   - If price ≥ 2R profit, close half the position at market (only during
     normal hours, not the last 10 minutes), and update the remaining stop
     to `current_price * 0.985` (1.5% trailing).
   - Update `memory/positions.md` with the new stop.

### B. Scan for new opportunities

1. Confirm daily caps allow another entry:
   - Positions opened today < 3
   - Gross long exposure + new size ≤ 80% of equity
   - Day's P&L not below -2% of start-of-day equity
2. If caps allow, re-run the universe scan from `routine 1` but only for
   Setup B (breakouts) — pullback setups are a morning trade.
3. Apply every rule in `rules.md`. If a candidate passes, place it the same
   way as the market-open routine.

### C. Journal

- Append to today's journal under "Stop adjustments" and "Orders placed".
- Commit: `trading: midday YYYY-MM-DD`.

## Guardrails

- Do not chase anything that has already run > 3% since the open.
- If VIX > 30 (check via SPY volatility proxy if VIX unavailable), halve
  position size per `entry-exit.md`.
- If you have already had 3 consecutive losers today, halt new entries.
