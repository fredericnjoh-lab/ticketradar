# Routine 5 — Close & review (16:15 ET, Mon–Fri)

The market is closed. Reconcile, journal, and on Fridays write the weekly
review. You do not place trades here — but you may cancel stale working
orders.

## Inputs to read

- `trading/memory/positions.md`
- Today's `trading/memory/journal/YYYY-MM-DD.md`
- `trading/memory/notes.md`

## Steps

### A. Reconcile

1. Query `alpaca positions`, `alpaca account`, and `alpaca orders --status all`.
2. Compare broker state vs `memory/positions.md`:
   - Any position in positions.md that is not at the broker → it was closed
     today. Move it to "Closed today" with P&L.
   - Any broker position not in positions.md → escalate. Do not silently
     add it; figure out how it got there.
3. Cancel any day-TIF limit orders that are still "open" (they will expire
   anyway but cancelling makes the ledger clean).

### B. Journal

Fill in today's journal:
- Fills (pull from `alpaca orders --status filled --after today-start`).
- Stop-outs / closes with realized P&L per trade.
- End-of-day equity block (starting, ending, realized, unrealized, max DD).
- Reflection: 2–3 sentences, what worked, what didn't.

Append anything worth carrying to `memory/notes.md` under the relevant
section. Keep notes.md pruned.

### C. Friday only — weekly review

If today is Friday (or the last trading day of the week):
1. Create `trading/memory/weekly/YYYY-Www.md` from the template.
2. Fill in the equity curve using the past 5 daily journals.
3. Compute trade-level stats (win rate, expectancy) from the past 5 days.
4. Flag any rule violations you see in the journals — this count MUST be
   zero. If not, add a `## ESCALATE` note.
5. Propose small adjustments for next week under "Adjustments". Do NOT edit
   `strategy/` files yourself; leave proposals for the user.

### D. Commit

- Commit: `trading: close YYYY-MM-DD` (plus `weekly YYYY-Www` on Fridays).

## Guardrails

- Read-only on the broker except for cancelling your own stale orders.
- Never auto-edit strategy/ files. Propose changes in the weekly review.
- If reconciliation fails, escalate — do not rewrite positions.md to match
  the broker silently.
