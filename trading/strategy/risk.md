# Risk & Position Sizing

## Compute at the start of each trading routine

1. Query account equity: `alpaca account` → `equity` field.
2. Max dollar size per new position:
   `size_cap = min(equity * 0.05, 2500)`
3. Max dollar risk per trade:
   `risk_cap = equity * 0.01`
4. Position quantity:
   `qty = floor(min(size_cap / entry_price, risk_cap / (entry_price - stop_price)))`
5. If `qty < 1`, do not place the order.

## Daily caps (track in today's journal)

- Max positions opened today: 3
- Max realized + unrealized drawdown before halt: 2% of start-of-day equity
- Max account drawdown before escalation: 5% of start-of-day equity

## Portfolio caps

- Max gross long exposure: 80% of equity
- Max per sector: 30% of equity (sectors per `universe.md` groupings)
- Max concurrent positions: 10

## Stop management

- Stop orders live at the broker the moment entry fills.
- When a trade reaches 1R profit, trail the stop to break-even.
- When a trade reaches 2R profit, close half and trail the rest at 1.5%.

## Accounting

At end of day, the close routine must reconcile:

- Alpaca positions (live) vs `memory/positions.md` (expected).
- Any mismatch → escalate, do not mutate positions.md automatically.
