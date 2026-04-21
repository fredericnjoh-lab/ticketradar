# Entry & Exit Logic

Soft guidance, not hard rules. The hard rules live in `rules.md`.

## Entry setups (pick one per trade, log which one)

### A. Trend pullback
- Symbol is in an uptrend: 20-day SMA > 50-day SMA on daily bars.
- Price has pulled back to touch or near the 20-day SMA in the last 3 days.
- Entry: limit at current ask once intraday price crosses back above the
  5-min VWAP.
- Stop: 2% below entry or below today's low, whichever is closer to entry.
- Target: 2R (2x risk) or the most recent swing high.

### B. Breakout
- Symbol has been in a tight range (< 3% high-low over 5 days).
- Price breaks above the range high on above-average volume (volume > 1.5x
  the 20-day average).
- Entry: limit at the breakout level + 0.2%.
- Stop: back inside the range (below range high by 1%).
- Target: range height added to breakout level, or 2R, whichever is larger.

### C. Oversold bounce (ETFs only)
- Broad-market ETF (SPY/QQQ/IWM) is down > 2% on the day.
- RSI(14) on 5-min bars below 30.
- Entry: limit order at current mid.
- Stop: 1.5% below entry.
- Target: prior day's close.

## Exits

- Hard stop: always honour the stop-loss order. No averaging down.
- Target: take half at 1R, trail the rest on a 1.5% trailing stop.
- Time stop: if a position hasn't hit 0.5R within 2 hours, close at market
  during the last-10-minutes window.

## Do-not-trade signals

- VIX > 30 — reduce position size by half, prefer ETF setups over single
  names.
- Consecutive 3 losing trades — halt new entries for the rest of the day.
- Gap > 2% on the symbol at the open — wait 30 minutes before considering.
