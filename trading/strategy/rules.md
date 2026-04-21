# Hard Strategy Rules

Every order must pass every rule in this file. If any rule fails, do not place
the order. Log the failing rule in today's journal.

## 1. Universe

- Only trade symbols listed in `strategy/universe.md`.
- No OTC, pink sheets, or penny stocks (< $5).
- No leveraged ETFs (3x/2x), no inverse ETFs, no volatility products
  (UVXY, SVXY, VXX, etc.).
- No options, no crypto, no futures. Equities only.

## 2. Position sizing

- Max dollar size per new position = `min(5% of account equity, $2,500)`.
- Max total exposure = 80% of equity. If adding the new position would push
  gross long exposure over 80%, reject the order.
- Max 10 concurrent open positions.
- Max 3 positions opened per trading day.

## 3. Risk per trade

- Every long order must be accompanied by a stop-loss recorded in
  `memory/positions.md` within the same routine.
- Stop-loss distance from entry = 2% to 5% of entry price. Reject anything
  outside this band.
- Dollar risk per trade (entry - stop) * qty must not exceed 1% of equity.

## 4. Daily risk

- If realized + unrealized P&L for the day is < -2% of equity at start of day,
  stop opening new positions for the day. Continue managing stops only.
- If account equity has dropped > 5% today, escalate per CLAUDE.md.

## 5. Timing

- Only open new positions during regular market hours (09:30–16:00 ET),
  excluding the first 5 minutes and last 10 minutes.
- Never place market orders in the pre-market or after-hours sessions.
- On FOMC / CPI / NFP release days, do not open new positions within
  ±30 minutes of the release.

## 6. No-chase

- Do not enter a long if the symbol is already > 3% above today's open.
- Do not enter within 1 hour of an earnings release.

## 7. Re-entry

- If a symbol stopped out today, do not re-enter it until tomorrow.
- If a symbol stopped out 3 times in the past 10 trading days, remove it from
  `universe.md` and leave a note.

## 8. Order types

- New entries: limit orders only, limit price = current ask for small caps,
  current mid for large caps. Time-in-force `day`.
- Exits on stop: use stop orders placed as soon as the entry fills.
- Exits on target: limit orders at target price, `day` TIF.

## 9. Commit discipline

- Never trade without first reading this file during the current routine.
- Every trade placed → append a line to today's `journal/YYYY-MM-DD.md`
  with symbol, qty, entry, stop, target, rule-check summary.
