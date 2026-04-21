# Routine 4 — Stop-loss management (14:30 ET, Mon–Fri)

Late-afternoon sweep. You do not open new positions here. You only manage
risk on what's already open.

## Inputs to read

- `trading/strategy/risk.md`
- `trading/memory/positions.md`
- Today's journal.

## Steps

1. Query `alpaca positions` and for each open position:
   - Verify a stop order exists at the broker via `alpaca orders --status open`.
     If there is no active stop order for a position, place one immediately
     at the stop price in `positions.md`. This is non-negotiable.
   - If the position is at a loss ≥ 0.8x the stop distance and the broader
     market (SPY) is weaker than at your entry, consider closing early at
     market. Document the decision in the journal.
2. Check the "time stop" rule from `entry-exit.md`:
   - If any position has been open > 2 hours and has not hit 0.5R profit,
     and we are in the last-10-minutes window (15:50+), close at market.
3. If the day's realized + unrealized P&L is below -2% of start-of-day
   equity, tighten every stop to the lesser of:
   - current stop, or
   - `current_price * 0.99` (1% trailing)
   This caps further bleeding without forcing mass exits.
4. Update `memory/positions.md` if any stops changed.
5. Append to today's journal under "Stop adjustments".
6. Commit: `trading: stop-loss YYYY-MM-DD`.

## Guardrails

- Never raise a stop further from entry — only toward break-even or tighter.
- Never remove a stop without replacing it in the same routine.
- If a stop order is missing at the broker and you cannot place one (API
  error, market closed), escalate and do not proceed.
