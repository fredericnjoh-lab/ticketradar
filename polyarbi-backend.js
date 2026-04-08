/* ═══════════════════════════════════════════════════
   POLY // ARBI — Backend (Node.js / Express)

   Endpoints:
   GET  /api/health        → Health check
   GET  /api/markets       → Live Polymarket markets
   GET  /api/scanner       → Mispricing opportunities
   GET  /api/wallets       → Tracked wallet stats
   GET  /api/leaderboard   → Top arbers by PNL
   GET  /api/trades        → Recent copytrade executions
   POST /api/copytrade     → Execute a copy trade
   POST /api/notify        → Send Telegram alert

   Data sources:
   - Polymarket CLOB API (markets, prices, orderbooks)
   - Gamma Markets API (market metadata)
   - Polygon RPC / Polygonscan (wallet tracking)
   - Telegram Bot API (notifications)
═══════════════════════════════════════════════════ */

const express   = require('express');
const cors      = require('cors');
const axios     = require('axios');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app  = express();
const PORT = process.env.POLYARBI_PORT || 3001;

/* ── Environment ── */
const TELEGRAM_TOKEN    = process.env.TELEGRAM_TOKEN || '';
const TELEGRAM_CHAT_ID  = process.env.TELEGRAM_CHAT_ID || '';
const POLYGONSCAN_KEY   = process.env.POLYGONSCAN_API_KEY || '';
const ALLOWED_ORIGIN    = process.env.POLYARBI_ALLOWED_ORIGIN || '*';

/* ── API base URLs ── */
const POLYMARKET_CLOB = 'https://clob.polymarket.com';
const GAMMA_API       = 'https://gamma-api.polymarket.com';
const POLYGON_RPC     = 'https://polygon-rpc.com';
const POLYGONSCAN_API = 'https://api.polygonscan.com/api';
const TELEGRAM_API    = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

/* ── Warnings ── */
if (!TELEGRAM_TOKEN)  console.warn('⚠ TELEGRAM_TOKEN missing — notifications disabled');
if (!POLYGONSCAN_KEY) console.warn('⚠ POLYGONSCAN_API_KEY missing — wallet tracking limited');

/* ── Middlewares ── */
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());

const limiter = rateLimit({ windowMs: 60_000, max: 120 });
app.use(limiter);

/* ── In-memory state ── */
const STATE = {
  markets: [],
  wallets: [
    { addr: '0x3f4a...c91e', tag: 'hot',   track: true },
    { addr: '0xa12b...5f3d', tag: 'hot',   track: true },
    { addr: '0x87cc...aa20', tag: 'whale', track: true },
    { addr: '0x1d9e...b47a', tag: 'arb',   track: true },
    { addr: '0x5e88...3c99', tag: 'whale', track: true },
    { addr: '0xc241...e054', tag: 'arb',   track: true },
    { addr: '0x03c5...217b', tag: null,     track: true },
  ],
  trades: [],
  lastScan: null,
};


/* ═══════════════════════════════════════════════════
   POLYMARKET CLOB API
═══════════════════════════════════════════════════ */

/**
 * Fetch active markets from Gamma API
 * Docs: https://gamma-api.polymarket.com/docs
 */
async function fetchMarkets() {
  try {
    const res = await axios.get(`${GAMMA_API}/markets`, {
      params: { closed: false, limit: 100, order: 'volume', ascending: false },
      timeout: 10_000,
    });
    return (res.data || []).map(m => ({
      id:       m.id,
      condId:   m.conditionId,
      slug:     m.slug,
      name:     m.question,
      category: (m.category || 'OTHER').toUpperCase(),
      volume:   m.volume || 0,
      liquidity: m.liquidity || 0,
      yes:      parseFloat(m.outcomePrices?.[0]) || 0,
      no:       parseFloat(m.outcomePrices?.[1]) || 0,
      endDate:  m.endDate,
      active:   m.active,
    }));
  } catch (e) {
    console.error('[Markets] Fetch error:', e.message);
    return [];
  }
}

/**
 * Fetch orderbook for a specific token from CLOB API
 */
async function fetchOrderbook(tokenId) {
  try {
    const res = await axios.get(`${POLYMARKET_CLOB}/book`, {
      params: { token_id: tokenId },
      timeout: 5_000,
    });
    return res.data;
  } catch (e) {
    console.error('[Orderbook]', e.message);
    return null;
  }
}


/* ═══════════════════════════════════════════════════
   MISPRICING / EDGE DETECTION
═══════════════════════════════════════════════════ */

/**
 * Simple edge detection: flag markets where YES + NO != 1.00
 * or where price diverges from orderbook mid significantly.
 * In production, compare with external models / prediction APIs.
 */
function detectEdges(markets) {
  return markets
    .map(m => {
      const sum = m.yes + m.no;
      const spread = Math.abs(1 - sum);
      /* Edge = deviation from efficient pricing */
      const edge = spread > 0.01 ? +(spread * 100).toFixed(2) : 0;
      return { ...m, edge, fairValue: +(m.yes + edge / 100).toFixed(3) };
    })
    .filter(m => m.edge >= 1.0)
    .sort((a, b) => b.edge - a.edge)
    .slice(0, 20);
}


/* ═══════════════════════════════════════════════════
   WALLET TRACKING (Polygonscan)
═══════════════════════════════════════════════════ */

/**
 * Fetch recent ERC-20 token transfers for a wallet on Polygon.
 * Useful for detecting Polymarket CTFE token movements.
 */
async function fetchWalletTxns(address) {
  if (!POLYGONSCAN_KEY) return [];
  try {
    const res = await axios.get(POLYGONSCAN_API, {
      params: {
        module: 'account',
        action: 'tokentx',
        address,
        startblock: 0,
        endblock: 99999999,
        sort: 'desc',
        page: 1,
        offset: 20,
        apikey: POLYGONSCAN_KEY,
      },
      timeout: 8_000,
    });
    return res.data?.result || [];
  } catch (e) {
    console.error('[Wallet]', address, e.message);
    return [];
  }
}


/* ═══════════════════════════════════════════════════
   TELEGRAM NOTIFICATIONS
═══════════════════════════════════════════════════ */

async function sendTelegram(text, chatId) {
  const cid = chatId || TELEGRAM_CHAT_ID;
  if (!TELEGRAM_TOKEN || !cid) return { ok: false, error: 'Telegram not configured' };
  try {
    const res = await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: cid,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    return { ok: true, messageId: res.data?.result?.message_id };
  } catch (e) {
    console.error('[Telegram]', e.message);
    return { ok: false, error: e.message };
  }
}

function formatEdgeAlert(edges) {
  const lines = edges.slice(0, 5).map((e, i) =>
    `${i + 1}. <b>${e.name}</b>\n   Edge: <b>+${e.edge}%</b> · YES ${Math.round(e.yes * 100)}¢ · Vol $${(e.volume / 1e6).toFixed(1)}M`
  );
  return `🔍 <b>POLY//ARBI — Mispricing Alert</b>\n\n${lines.join('\n\n')}`;
}

function formatTradeAlert(trade) {
  return `⚡ <b>COPYTRADE</b>\n\nWallet: <code>${trade.wallet}</code>\nMarket: ${trade.market}\nSide: <b>${trade.side.toUpperCase()}</b>\nAmount: $${trade.amount}`;
}


/* ═══════════════════════════════════════════════════
   ROUTES
═══════════════════════════════════════════════════ */

/* Health */
app.get('/', (req, res) => {
  res.json({
    name: 'POLY//ARBI Backend',
    version: '1.0.0',
    endpoints: [
      'GET  /api/health',
      'GET  /api/markets',
      'GET  /api/scanner',
      'GET  /api/wallets',
      'GET  /api/leaderboard',
      'GET  /api/trades',
      'POST /api/copytrade',
      'POST /api/notify',
    ],
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    lastScan: STATE.lastScan,
    marketsLoaded: STATE.markets.length,
    walletsTracked: STATE.wallets.filter(w => w.track).length,
    telegram: !!TELEGRAM_TOKEN,
    polygonscan: !!POLYGONSCAN_KEY,
  });
});


/* Markets — live from Polymarket */
app.get('/api/markets', async (req, res) => {
  try {
    const markets = await fetchMarkets();
    STATE.markets = markets;
    STATE.lastScan = new Date().toISOString();
    res.json(markets);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


/* Scanner — mispricing edges */
app.get('/api/scanner', async (req, res) => {
  try {
    let markets = STATE.markets;
    if (markets.length === 0) {
      markets = await fetchMarkets();
      STATE.markets = markets;
    }
    const edges = detectEdges(markets);
    res.json(edges);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


/* Wallets — tracked wallets and stats */
app.get('/api/wallets', (req, res) => {
  res.json(STATE.wallets);
});


/* Leaderboard — sorted by PNL */
app.get('/api/leaderboard', (req, res) => {
  const sorted = [...STATE.wallets]
    .filter(w => w.pnl !== undefined)
    .sort((a, b) => (b.pnl || 0) - (a.pnl || 0));
  res.json(sorted);
});


/* Trades — recent copytrade history */
app.get('/api/trades', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  res.json(STATE.trades.slice(0, limit));
});


/* Copy trade — execute */
app.post('/api/copytrade', async (req, res) => {
  const { wallet, market, side, amount } = req.body;
  if (!wallet || !market || !side) {
    return res.status(400).json({ error: 'Missing wallet, market, or side' });
  }

  const trade = {
    id: Date.now(),
    wallet,
    market,
    side,
    amount: amount || 0,
    time: new Date().toISOString(),
    status: 'pending',
  };

  STATE.trades.unshift(trade);
  if (STATE.trades.length > 500) STATE.trades.length = 500;

  /* Notify via Telegram */
  if (TELEGRAM_TOKEN) {
    await sendTelegram(formatTradeAlert(trade));
  }

  console.log(`[CopyTrade] ${side} on "${market}" — wallet ${wallet} — $${amount}`);
  res.json({ ok: true, trade });
});


/* Notify — send custom Telegram alert */
app.post('/api/notify', async (req, res) => {
  const { message, chatId } = req.body;
  if (!message) return res.status(400).json({ error: 'Missing message' });
  const result = await sendTelegram(message, chatId);
  res.json(result);
});


/* Test Telegram */
app.get('/api/test', async (req, res) => {
  const result = await sendTelegram('✅ <b>POLY//ARBI</b> — Telegram connection OK');
  res.json(result);
});


/* ═══════════════════════════════════════════════════
   BACKGROUND SCANNER
   Runs every 5 min, fetches markets and detects edges
═══════════════════════════════════════════════════ */
async function backgroundScan() {
  console.log('[Scanner] Running background scan...');
  try {
    const markets = await fetchMarkets();
    STATE.markets = markets;
    STATE.lastScan = new Date().toISOString();

    const edges = detectEdges(markets);
    if (edges.length > 0) {
      console.log(`[Scanner] ${edges.length} edges found (top: ${edges[0].name} +${edges[0].edge}%)`);

      /* Send Telegram alert for significant edges (> 5%) */
      const significant = edges.filter(e => e.edge >= 5);
      if (significant.length > 0 && TELEGRAM_TOKEN) {
        await sendTelegram(formatEdgeAlert(significant));
      }
    } else {
      console.log('[Scanner] No edges detected');
    }
  } catch (e) {
    console.error('[Scanner] Background scan failed:', e.message);
  }
}

/* ═══════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════ */
app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════╗`);
  console.log(`  ║  POLY // ARBI  Backend  v1.0         ║`);
  console.log(`  ║  Port: ${PORT}                          ║`);
  console.log(`  ║  Telegram: ${TELEGRAM_TOKEN ? '✓' : '✗'}                         ║`);
  console.log(`  ║  Polygonscan: ${POLYGONSCAN_KEY ? '✓' : '✗'}                      ║`);
  console.log(`  ╚══════════════════════════════════════╝\n`);

  /* Initial scan after 5s, then every 5 min */
  setTimeout(backgroundScan, 5000);
  setInterval(backgroundScan, 5 * 60 * 1000);
});
