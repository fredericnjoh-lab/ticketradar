# Trading Bot — Claude *is* the bot

No servers. No Python process. No cron on a laptop. Claude Code on the web
runs 5 scheduled routines that read strategy markdown, query Alpaca, place
orders, and write their memory back to this repo.

```
trading/
├── CLAUDE.md              — top-level instructions Claude reads each run
├── strategy/              — hard rules & setups (YOU edit these; bot does not)
│   ├── rules.md
│   ├── universe.md
│   ├── entry-exit.md
│   └── risk.md
├── memory/                — bot's persistent state (bot edits, commits)
│   ├── positions.md
│   ├── watchlist.md
│   ├── notes.md
│   ├── journal/YYYY-MM-DD.md
│   └── weekly/YYYY-Www.md
└── routines/              — the 5 cloud-routine prompts
    ├── 1-premarket.md
    ├── 2-market-open.md
    ├── 3-midday.md
    ├── 4-stop-loss.md
    └── 5-close.md

.claude/skills/alpaca/     — skill for every brokerage call (with gating)
├── SKILL.md
└── scripts/
    ├── account, clock, positions, orders
    ├── quote, bars
    ├── place-order        ← enforces dollar cap + stop distance + universe
    ├── cancel, close
    └── _common.sh
```

## How it runs (2-hour one-time setup)

1. **Alpaca account.** Sign up at https://alpaca.markets and generate paper
   API keys. Paper is free and gives you realistic fills.

2. **Push this branch.** The memory files live in the repo — Claude reads
   them on each run and commits updates.

3. **Open Claude Code on the web** and connect this repo. Create 5 cloud
   routines; each one just needs to load the matching prompt and have the
   Alpaca env vars available.

   Schedule (US Eastern, Mon–Fri):

   | # | Name         | Cron (ET)       | Prompt                              |
   |---|--------------|-----------------|-------------------------------------|
   | 1 | premarket    | `30 8 * * 1-5`  | contents of `routines/1-premarket.md` |
   | 2 | market-open  | `35 9 * * 1-5`  | contents of `routines/2-market-open.md` |
   | 3 | midday       | `30 12 * * 1-5` | contents of `routines/3-midday.md`  |
   | 4 | stop-loss    | `30 14 * * 1-5` | contents of `routines/4-stop-loss.md` |
   | 5 | close        | `15 16 * * 1-5` | contents of `routines/5-close.md`   |

   The Friday weekly review is handled inside routine #5 — no extra routine
   needed.

4. **Environment variables** (set once per routine, or globally if your
   setup supports it):

   ```
   ALPACA_KEY_ID=...
   ALPACA_SECRET_KEY=...
   ALPACA_PAPER=true            # keep this until you trust it
   ALPACA_MAX_ORDER_USD=2500    # hard ceiling per order
   ```

5. **Tune your strategy.** Edit `strategy/universe.md` to pick your
   tickers. Tune `strategy/rules.md` and `strategy/risk.md` to match your
   account size and risk appetite. These are the only files you edit — the
   bot treats them as read-only.

6. **Let it run.** Each routine commits to the branch you're on. Pull to
   your local machine any time to see the journal and positions.

## Safety

This is the whole point of the design — the bot gates its own orders.

- **Strategy rules are hard.** Every order is re-checked against
  `strategy/rules.md` in the routine prompt, and re-checked again by the
  `place-order` script before it hits the API.
- **Dollar cap.** `ALPACA_MAX_ORDER_USD` kills any order over that size,
  regardless of what the bot computed.
- **Universe gate.** The `place-order` script greps `universe.md` for the
  symbol and rejects anything not listed. You can't be sold a meme stock
  you didn't opt into.
- **Stops are mandatory.** The script refuses a long entry without a
  `--stop` argument. CLAUDE.md refuses to leave a routine without recording
  the stop in `positions.md`.
- **Paper default.** `ALPACA_PAPER=true` is the default. The `_common.sh`
  helper prints a loud warning if you ever flip it.
- **Escalation.** On any confusion (stale data, API errors, rule conflicts,
  reconciliation mismatch), the bot writes `## ESCALATE` to the journal and
  stops — it never guesses.

## Tuning

Most users will want to:

- Trim `strategy/universe.md` to 5–10 symbols they actually know.
- Set `ALPACA_MAX_ORDER_USD` to something meaningful for their account
  (e.g., 2% of equity).
- Read `memory/journal/*.md` daily for the first week and adjust
  `strategy/*.md` based on what's happening.

Do not bypass gating to "let it try one more thing." The whole design is
that the bot fails closed.

## Going live

Only after at least a week of paper where:

- No `## ESCALATE` entries in the journal.
- Weekly review shows zero rule violations.
- You've read every journal entry and understand what the bot did and why.

Then:

1. Set `ALPACA_PAPER=false` in the cloud routine env.
2. Set `ALPACA_MAX_ORDER_USD` to a small starter number (e.g., $500).
3. Watch it for another week. Increase the cap slowly.

There is no "go live" button in the repo on purpose. Flipping env vars is
the whole ceremony — it forces you to think about it.
