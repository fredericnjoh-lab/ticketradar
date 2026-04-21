# Tradeable Universe

Edit this file to control what the bot is allowed to trade. Anything not in
this list is rejected by the strategy rules.

## Large-cap tech

- AAPL — Apple
- MSFT — Microsoft
- GOOGL — Alphabet
- AMZN — Amazon
- META — Meta Platforms
- NVDA — NVIDIA
- AVGO — Broadcom
- AMD — Advanced Micro Devices

## Broad-market ETFs

- SPY — S&P 500
- QQQ — Nasdaq 100
- IWM — Russell 2000
- DIA — Dow Jones

## Sector ETFs (optional rotation)

- XLK — Technology
- XLF — Financials
- XLE — Energy
- XLV — Healthcare

## Notes

- Add/remove tickers here only. Do not embed symbols in routine prompts.
- If a symbol stopped out 3 times in 10 days, the bot will flag it here for
  manual removal.
