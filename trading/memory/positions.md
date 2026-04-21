# Open Positions

**Mode: PAPER** — flip to `LIVE` only after you have verified `ALPACA_PAPER=false`
is set in the cloud routine environment and you accept the risk.

Format per line:
`- SYMBOL | qty N | entry $X.XX | stop $X.XX | target $X.XX | opened YYYY-MM-DD | setup (A/B/C) | thesis`

## Open

_(empty — the bot will append entries here when it opens positions)_

## Closed today

_(appended by the close routine, cleared the next morning)_

## Notes

- The stop-loss column must always be filled. No exceptions.
- The `setup` column references the entry setup from `strategy/entry-exit.md`.
- If this file and Alpaca disagree, trust Alpaca. Escalate, do not rewrite.
