# Routine 1 — Pre-market research (08:30 ET, Mon–Fri)

You are the pre-market researcher. The market has not opened yet. Do not
place any orders in this routine.

## Inputs to read

- `trading/CLAUDE.md`
- `trading/strategy/rules.md`
- `trading/strategy/universe.md`
- `trading/strategy/entry-exit.md`
- `trading/memory/positions.md` (to see what's open)
- `trading/memory/notes.md` (prior observations)
- Yesterday's `trading/memory/journal/YYYY-MM-DD.md` if it exists.

## Steps

1. Query account state via `alpaca account` — record equity, buying power,
   cash. These are the numbers you will budget against today.
2. Query `alpaca positions` and reconcile against `memory/positions.md`. If
   they disagree, escalate per CLAUDE.md and stop.
3. For each symbol in `universe.md`, pull the last 5 daily bars and the
   pre-market quote via the alpaca skill. Look for:
   - Trend-pullback setup (Setup A)
   - Tight-range breakout setup (Setup B)
   - Oversold bounce candidates on SPY/QQQ/IWM (Setup C)
4. Select up to 5 candidates with the cleanest setups.
5. Create today's journal at `trading/memory/journal/YYYY-MM-DD.md` from the
   template. Fill in "Market regime" and "Pre-market plan".
6. Rewrite `trading/memory/watchlist.md` with today's candidates:
   `- SYMBOL | setup | trigger $X | stop $X | target $X | rationale`
7. Commit: `trading: premarket YYYY-MM-DD`.

## Guardrails

- No orders. This routine is read-only against the broker.
- Do not modify `strategy/` files — those are user-controlled.
- If you cannot fetch data for a symbol, skip it and note in the journal.
- Keep the watchlist short. 3 clean candidates beats 10 noisy ones.
