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
const path      = require('path');
const rateLimit = require('express-rate-limit');
let ethers;
try { ethers = require('ethers'); } catch (e) { console.warn('⚠ ethers not installed — copytrade execution disabled'); }
require('dotenv').config();

const app  = express();
const PORT = process.env.POLYARBI_PORT || process.env.PORT || 3001;

/* ── Environment ── */
const TELEGRAM_TOKEN    = process.env.TELEGRAM_TOKEN || '';
const TELEGRAM_CHAT_ID  = process.env.TELEGRAM_CHAT_ID || '';
const POLYGONSCAN_KEY   = process.env.POLYGONSCAN_API_KEY || '';
const ALLOWED_ORIGIN    = process.env.POLYARBI_ALLOWED_ORIGIN || 'https://fredericnjoh-lab.github.io';
const PRIVATE_KEY       = process.env.POLYARBI_PRIVATE_KEY || '';     // Polygon wallet for copytrade
const POLYMARKET_API_KEY = process.env.POLYMARKET_API_KEY || '';       // CLOB API key
const POLYMARKET_SECRET  = process.env.POLYMARKET_API_SECRET || '';    // CLOB API secret
const POLYMARKET_PASS    = process.env.POLYMARKET_API_PASSPHRASE || '';// CLOB API passphrase

/* ── API base URLs ── */
const POLYMARKET_CLOB = 'https://clob.polymarket.com';
const GAMMA_API       = 'https://gamma-api.polymarket.com';
const POLYGON_RPC     = 'https://polygon-rpc.com';
const POLYGONSCAN_API = 'https://api.polygonscan.com/api';
const TELEGRAM_API    = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

/* ── Warnings ── */
if (!TELEGRAM_TOKEN)   console.warn('⚠ TELEGRAM_TOKEN missing — notifications disabled');
if (!POLYGONSCAN_KEY)  console.warn('⚠ POLYGONSCAN_API_KEY missing — wallet tracking limited');
if (!PRIVATE_KEY)      console.warn('⚠ POLYARBI_PRIVATE_KEY missing — copytrade execution disabled');
if (!POLYMARKET_API_KEY) console.warn('⚠ POLYMARKET_API_KEY missing — CLOB trading disabled');

/* ── Middlewares ── */
app.use(cors({
  origin: [
    ALLOWED_ORIGIN,
    'https://polyarbi.onrender.com',
    'http://localhost:3001',
    'http://127.0.0.1:5500',
  ].filter(Boolean),
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type'],
}));
app.use(express.json());

/* Serve frontend static files */
app.use(express.static(path.join(__dirname), {
  index: false,
  extensions: ['html', 'css', 'js'],
}));

/* Serve polyarbi-terminal.html at /app */
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'polyarbi-terminal.html'));
});

const limiter = rateLimit({ windowMs: 60_000, max: 120 });
app.use('/api', limiter);

/* ── Polymarket contract addresses (Polygon mainnet) ── */
const POLYMARKET_CTFE   = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045'; // CTF Exchange
const POLYMARKET_NEG_RISK = '0xC5d563A36AE78145C45a50134d48A1215220f80a'; // NegRiskCTFExchange
const USDC_POLYGON      = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC on Polygon

/* ── Known Polymarket whale/arber wallets ── */
const DEFAULT_WALLETS = [
  // Top traders from Polymarket leaderboard — replace with your own targets
  { addr: '0xFa22cB60aEEb23f3E1C058e81e985eFCe3Ff9912', label: 'Whale-1',    tag: 'whale', track: true },
  { addr: '0x1e3dB41F9a2dE5dC83F380F3a5b3a3EE3a08fA50', label: 'Theo',       tag: 'hot',   track: true },
  { addr: '0xd1Ef3A7BFe26e6e14eE2992E09b0dB0B4D3eDe17', label: 'Arb-Bot-1',  tag: 'arb',   track: true },
  { addr: '0x88C68B36a7246f1F0A5C4cE82A8c0D7f3e2c1bD9', label: 'GCR',        tag: 'whale', track: true },
  { addr: '0x2a47E053c417a3814Dc6cE57A3Bb0cC7f6B21438', label: 'Arb-Bot-2',  tag: 'arb',   track: true },
];

/* ── In-memory state ── */
const STATE = {
  markets: [],
  wallets: DEFAULT_WALLETS.map(w => ({
    ...w,
    pnl: 0,
    trades: 0,
    winRate: 0,
    recentTxns: [],
    lastChecked: null,
  })),
  trades: [],
  edges: [],
  lastScan: null,
  lastWalletScan: null,
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
 * Edge detection — multi-signal approach:
 * 1. Spread inefficiency: YES + NO significantly != 1.00
 * 2. Orderbook imbalance: bid/ask depth heavily skewed
 * 3. Volume spike: recent volume >> average (momentum signal)
 * 4. Price dislocation: large move in short time
 */
function detectEdges(markets) {
  return markets
    .map(m => {
      let edgeScore = 0;
      const signals = [];

      /* Signal 1: Spread inefficiency */
      const sum = m.yes + m.no;
      const spreadGap = Math.abs(1 - sum);
      if (spreadGap > 0.005) {
        edgeScore += spreadGap * 100;
        signals.push('SPREAD');
      }

      /* Signal 2: Extreme pricing (close to 0 or 1 = potential value) */
      const minPrice = Math.min(m.yes, m.no);
      if (minPrice > 0.05 && minPrice < 0.20) {
        edgeScore += (0.20 - minPrice) * 15; // longshot value
        signals.push('LONGSHOT');
      }

      /* Signal 3: Volume-to-liquidity ratio (high activity = opportunity) */
      if (m.volume && m.liquidity && m.liquidity > 0) {
        const volRatio = m.volume / m.liquidity;
        if (volRatio > 5) {
          edgeScore += Math.min(volRatio * 0.5, 5);
          signals.push('HIGH-VOL');
        }
      }

      /* Signal 4: Mid-range markets (50/50 ± 15%) are most tradeable */
      const midDistance = Math.abs(m.yes - 0.50);
      if (midDistance < 0.15) {
        edgeScore += (0.15 - midDistance) * 10;
        signals.push('CONTESTED');
      }

      const edge = +edgeScore.toFixed(2);
      const fairValue = +(m.yes + edge / 200).toFixed(3);

      return { ...m, edge, fairValue, signals };
    })
    .filter(m => m.edge >= 1.0)
    .sort((a, b) => b.edge - a.edge)
    .slice(0, 20);
}

/**
 * Enrich top edges with orderbook depth data
 */
async function enrichWithOrderbooks(edges) {
  const top = edges.slice(0, 5);
  for (const e of top) {
    if (!e.condId) continue;
    const book = await fetchOrderbook(e.condId);
    if (!book) continue;

    const bids = book.bids || [];
    const asks = book.asks || [];
    const bidDepth = bids.reduce((s, b) => s + parseFloat(b.size || 0), 0);
    const askDepth = asks.reduce((s, a) => s + parseFloat(a.size || 0), 0);
    const totalDepth = bidDepth + askDepth;

    if (totalDepth > 0) {
      const imbalance = Math.abs(bidDepth - askDepth) / totalDepth;
      if (imbalance > 0.3) {
        e.edge += +(imbalance * 5).toFixed(2);
        e.signals.push('OB-SKEW');
      }
      e.orderbook = { bidDepth: Math.round(bidDepth), askDepth: Math.round(askDepth), imbalance: +(imbalance * 100).toFixed(1) };
    }
  }
  return edges;
}


/* ═══════════════════════════════════════════════════
   WALLET TRACKING (Polygonscan)
═══════════════════════════════════════════════════ */

/**
 * Fetch recent transactions for a wallet on Polygon.
 * Uses normal tx endpoint to catch contract interactions with Polymarket.
 */
async function fetchWalletTxns(address) {
  if (!POLYGONSCAN_KEY) return [];
  try {
    const res = await axios.get(POLYGONSCAN_API, {
      params: {
        module: 'account',
        action: 'txlist',
        address,
        startblock: 0,
        endblock: 99999999,
        sort: 'desc',
        page: 1,
        offset: 50,
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

/**
 * Fetch USDC token transfers for a wallet (to track Polymarket deposits/profits)
 */
async function fetchUSDCTransfers(address) {
  if (!POLYGONSCAN_KEY) return [];
  try {
    const res = await axios.get(POLYGONSCAN_API, {
      params: {
        module: 'account',
        action: 'tokentx',
        address,
        contractaddress: USDC_POLYGON,
        startblock: 0,
        endblock: 99999999,
        sort: 'desc',
        page: 1,
        offset: 50,
        apikey: POLYGONSCAN_KEY,
      },
      timeout: 8_000,
    });
    return res.data?.result || [];
  } catch (e) {
    console.error('[USDC]', address, e.message);
    return [];
  }
}

/**
 * Analyze wallet transactions to extract Polymarket activity.
 * Detects interactions with CTFE and NegRiskCTFExchange contracts.
 */
function parsePolymarketTrades(txns, address) {
  const polyContracts = [
    POLYMARKET_CTFE.toLowerCase(),
    POLYMARKET_NEG_RISK.toLowerCase(),
  ];

  return txns
    .filter(tx => polyContracts.includes(tx.to?.toLowerCase()) || polyContracts.includes(tx.from?.toLowerCase()))
    .map(tx => {
      const isOutgoing = tx.from?.toLowerCase() === address.toLowerCase();
      const value = parseFloat(tx.value) / 1e18; // MATIC value
      const method = tx.functionName?.split('(')[0] || 'unknown';

      let side = 'unknown';
      if (method.includes('buy') || method.includes('fillOrder')) side = 'buy';
      else if (method.includes('sell') || method.includes('redeem')) side = 'sell';
      else if (method.includes('merge') || method.includes('split')) side = 'hedge';

      return {
        hash: tx.hash,
        time: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
        method,
        side,
        to: tx.to,
        value,
        gasUsed: tx.gasUsed,
        isError: tx.isError === '1',
      };
    })
    .filter(t => !t.isError);
}

/**
 * Estimate wallet PNL from USDC flows related to Polymarket.
 * Inflows (received USDC from Polymarket contracts) = profit
 * Outflows (sent USDC to Polymarket contracts) = cost
 */
function estimatePNL(usdcTransfers, address) {
  const polyContracts = [
    POLYMARKET_CTFE.toLowerCase(),
    POLYMARKET_NEG_RISK.toLowerCase(),
  ];
  const addr = address.toLowerCase();

  let inflow = 0;
  let outflow = 0;

  for (const tx of usdcTransfers) {
    const amount = parseFloat(tx.value) / 1e6; // USDC = 6 decimals
    const from = tx.from?.toLowerCase();
    const to = tx.to?.toLowerCase();

    // USDC received from Polymarket = winnings
    if (to === addr && polyContracts.includes(from)) {
      inflow += amount;
    }
    // USDC sent to Polymarket = bets placed
    if (from === addr && polyContracts.includes(to)) {
      outflow += amount;
    }
  }

  return { inflow: Math.round(inflow), outflow: Math.round(outflow), pnl: Math.round(inflow - outflow) };
}

/**
 * Full scan of a single wallet: txns + USDC flows + PNL estimation
 */
async function scanWallet(wallet) {
  console.log(`[Wallet] Scanning ${wallet.label} (${wallet.addr.slice(0, 10)}...)`);

  const [txns, usdcTxns] = await Promise.all([
    fetchWalletTxns(wallet.addr),
    fetchUSDCTransfers(wallet.addr),
  ]);

  const polyTrades = parsePolymarketTrades(txns, wallet.addr);
  const { inflow, outflow, pnl } = estimatePNL(usdcTxns, wallet.addr);
  const totalTrades = polyTrades.length;
  const buys = polyTrades.filter(t => t.side === 'buy').length;
  const sells = polyTrades.filter(t => t.side === 'sell').length;
  const winRate = totalTrades > 0 ? +((sells / Math.max(buys, 1)) * 100).toFixed(1) : 0;

  wallet.pnl = pnl;
  wallet.trades = totalTrades;
  wallet.winRate = Math.min(winRate, 100);
  wallet.recentTxns = polyTrades.slice(0, 10);
  wallet.usdcInflow = inflow;
  wallet.usdcOutflow = outflow;
  wallet.lastChecked = new Date().toISOString();

  return wallet;
}

/**
 * Scan all tracked wallets. Staggered to avoid rate limits.
 */
async function scanAllWallets() {
  if (!POLYGONSCAN_KEY) {
    console.warn('[Wallets] Skipping — no POLYGONSCAN_API_KEY');
    return;
  }

  console.log(`[Wallets] Scanning ${STATE.wallets.length} wallets...`);

  for (const wallet of STATE.wallets.filter(w => w.track)) {
    await scanWallet(wallet);
    // Polygonscan free tier: 5 req/sec — stagger requests
    await new Promise(r => setTimeout(r, 1500));
  }

  STATE.lastWalletScan = new Date().toISOString();

  /* Detect new trades for copytrade alerts */
  const newTrades = [];
  for (const w of STATE.wallets) {
    for (const tx of (w.recentTxns || []).slice(0, 2)) {
      const age = Date.now() - new Date(tx.time).getTime();
      if (age < 10 * 60 * 1000 && tx.side === 'buy') { // < 10 min old
        newTrades.push({ wallet: w.label, addr: w.addr, ...tx });
      }
    }
  }

  if (newTrades.length > 0 && TELEGRAM_TOKEN) {
    const lines = newTrades.map(t =>
      `<b>${t.wallet}</b> · ${t.side.toUpperCase()} · <code>${t.method}</code>`
    );
    await sendTelegram(`⚡ <b>POLY//ARBI — New Whale Trades</b>\n\n${lines.join('\n')}`);
  }

  console.log(`[Wallets] Scan complete. ${newTrades.length} new trades detected.`);
}


/* ═══════════════════════════════════════════════════
   COPYTRADE ENGINE — CLOB ORDER EXECUTION
═══════════════════════════════════════════════════ */

/**
 * Safety controls — prevent runaway trades
 */
const COPYTRADE_LIMITS = {
  maxPerTrade:   parseFloat(process.env.COPYTRADE_MAX_PER_TRADE || '50'),   // Max USDC per single trade
  maxDaily:      parseFloat(process.env.COPYTRADE_MAX_DAILY || '500'),      // Max USDC per day
  maxOpenPos:    parseInt(process.env.COPYTRADE_MAX_POSITIONS || '10'),      // Max open positions
  minEdge:       parseFloat(process.env.COPYTRADE_MIN_EDGE || '2.0'),       // Min edge % to auto-trade
  requireApproval: (process.env.COPYTRADE_AUTO || 'false') !== 'true',      // Require manual approval by default
  cooldownMs:    parseInt(process.env.COPYTRADE_COOLDOWN || '60000'),       // 1 min between trades
};

const tradeState = {
  dailySpent: 0,
  dailyReset: new Date().toDateString(),
  openPositions: 0,
  lastTradeTime: 0,
  pendingApprovals: [],  // trades waiting for user confirmation
  executedTrades: [],
};

function resetDailyIfNeeded() {
  const today = new Date().toDateString();
  if (tradeState.dailyReset !== today) {
    tradeState.dailySpent = 0;
    tradeState.dailyReset = today;
  }
}

function checkTradeAllowed(amount) {
  resetDailyIfNeeded();
  const reasons = [];

  if (!PRIVATE_KEY || !POLYMARKET_API_KEY) {
    reasons.push('CLOB credentials not configured');
  }
  if (!ethers) {
    reasons.push('ethers.js not installed');
  }
  if (amount > COPYTRADE_LIMITS.maxPerTrade) {
    reasons.push(`Amount $${amount} exceeds max per trade ($${COPYTRADE_LIMITS.maxPerTrade})`);
  }
  if (tradeState.dailySpent + amount > COPYTRADE_LIMITS.maxDaily) {
    reasons.push(`Would exceed daily limit ($${tradeState.dailySpent}/$${COPYTRADE_LIMITS.maxDaily})`);
  }
  if (tradeState.openPositions >= COPYTRADE_LIMITS.maxOpenPos) {
    reasons.push(`Max open positions reached (${COPYTRADE_LIMITS.maxOpenPos})`);
  }
  const cooldownLeft = COPYTRADE_LIMITS.cooldownMs - (Date.now() - tradeState.lastTradeTime);
  if (cooldownLeft > 0) {
    reasons.push(`Cooldown: ${Math.ceil(cooldownLeft / 1000)}s remaining`);
  }

  return { allowed: reasons.length === 0, reasons };
}

/**
 * Generate CLOB API headers with HMAC authentication.
 * Polymarket CLOB uses API-key + secret + passphrase + timestamp + signature.
 */
function getClobHeaders(method, path, body) {
  if (!POLYMARKET_API_KEY || !POLYMARKET_SECRET) return null;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyStr = body ? JSON.stringify(body) : '';
  const message = timestamp + method.toUpperCase() + path + bodyStr;

  let signature;
  if (ethers) {
    const hmac = ethers.utils ? ethers.utils.computeHmac('sha256', ethers.utils.toUtf8Bytes(POLYMARKET_SECRET), ethers.utils.toUtf8Bytes(message))
      : require('crypto').createHmac('sha256', POLYMARKET_SECRET).update(message).digest('base64');
    signature = typeof hmac === 'string' ? hmac : Buffer.from(hmac).toString('base64');
  } else {
    const crypto = require('crypto');
    signature = crypto.createHmac('sha256', POLYMARKET_SECRET).update(message).digest('base64');
  }

  return {
    'POLY_ADDRESS': PRIVATE_KEY ? new (ethers.Wallet || Object)(PRIVATE_KEY).address : '',
    'POLY_SIGNATURE': signature,
    'POLY_TIMESTAMP': timestamp,
    'POLY_NONCE': Date.now().toString(),
    'POLY_API_KEY': POLYMARKET_API_KEY,
    'POLY_PASSPHRASE': POLYMARKET_PASS,
    'Content-Type': 'application/json',
  };
}

/**
 * Place a market order on Polymarket CLOB.
 * @param {string} tokenId - The outcome token ID (YES or NO token)
 * @param {string} side - 'BUY' or 'SELL'
 * @param {number} amount - USDC amount
 * @param {number} price - Limit price (0-1)
 */
async function placeOrder(tokenId, side, amount, price) {
  if (!POLYMARKET_API_KEY || !PRIVATE_KEY) {
    return { ok: false, error: 'CLOB credentials not configured' };
  }

  const orderPayload = {
    tokenID: tokenId,
    price: price.toString(),
    size: Math.floor(amount / price).toString(), // number of shares
    side: side.toUpperCase(),
    feeRateBps: '0',
    nonce: Date.now().toString(),
    expiration: '0', // GTC (good till cancelled)
  };

  const apiPath = '/order';
  const headers = getClobHeaders('POST', apiPath, orderPayload);
  if (!headers) return { ok: false, error: 'Failed to generate auth headers' };

  try {
    const res = await axios.post(`${POLYMARKET_CLOB}${apiPath}`, orderPayload, {
      headers,
      timeout: 10_000,
    });

    const orderId = res.data?.orderID || res.data?.id || 'unknown';
    console.log(`[CLOB] Order placed: ${side} ${amount} USDC @ ${price} — ID: ${orderId}`);

    return { ok: true, orderId, data: res.data };
  } catch (e) {
    const errMsg = e.response?.data?.message || e.message;
    console.error(`[CLOB] Order failed: ${errMsg}`);
    return { ok: false, error: errMsg };
  }
}

/**
 * Execute a copytrade: validate safety → place order → record.
 */
async function executeCopytrade(trade) {
  const { tokenId, side, amount, price, market, wallet } = trade;

  /* Safety check */
  const check = checkTradeAllowed(amount);
  if (!check.allowed) {
    console.warn(`[CopyTrade] BLOCKED: ${check.reasons.join(', ')}`);
    return { ok: false, status: 'blocked', reasons: check.reasons };
  }

  /* Require approval? */
  if (COPYTRADE_LIMITS.requireApproval) {
    trade.id = Date.now();
    trade.status = 'pending_approval';
    trade.createdAt = new Date().toISOString();
    tradeState.pendingApprovals.push(trade);
    console.log(`[CopyTrade] Queued for approval: ${side} $${amount} on "${market}"`);

    if (TELEGRAM_TOKEN) {
      await sendTelegram(
        `🔔 <b>COPYTRADE — Approval Required</b>\n\n` +
        `Wallet: <code>${wallet}</code>\n` +
        `Market: ${market}\n` +
        `Side: <b>${side}</b>\n` +
        `Amount: $${amount}\n` +
        `Price: ${price}\n\n` +
        `Approve via dashboard or reply /approve_${trade.id}`
      );
    }

    return { ok: true, status: 'pending_approval', tradeId: trade.id };
  }

  /* Execute immediately */
  const result = await placeOrder(tokenId, side, amount, price);

  if (result.ok) {
    tradeState.dailySpent += amount;
    tradeState.openPositions += 1;
    tradeState.lastTradeTime = Date.now();
    tradeState.executedTrades.unshift({
      ...trade,
      orderId: result.orderId,
      executedAt: new Date().toISOString(),
      status: 'executed',
    });
    if (tradeState.executedTrades.length > 200) tradeState.executedTrades.length = 200;
  }

  return result;
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


/* Scanner — mispricing edges (cached from background scan, or fresh) */
app.get('/api/scanner', async (req, res) => {
  try {
    if (STATE.edges.length > 0) {
      return res.json(STATE.edges);
    }
    let markets = STATE.markets;
    if (markets.length === 0) {
      markets = await fetchMarkets();
      STATE.markets = markets;
    }
    let edges = detectEdges(markets);
    edges = await enrichWithOrderbooks(edges);
    STATE.edges = edges;
    res.json(edges);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


/* Wallets — tracked wallets with real stats */
app.get('/api/wallets', (req, res) => {
  res.json(STATE.wallets.map(w => ({
    addr: w.addr.slice(0, 6) + '..' + w.addr.slice(-4),
    fullAddr: w.addr,
    label: w.label,
    tag: w.tag,
    pnl: w.pnl || 0,
    trades: w.trades || 0,
    winRate: w.winRate || 0,
    usdcInflow: w.usdcInflow || 0,
    usdcOutflow: w.usdcOutflow || 0,
    recentTxns: (w.recentTxns || []).slice(0, 5),
    lastChecked: w.lastChecked,
  })));
});

/* Add a wallet to track */
app.post('/api/wallets', (req, res) => {
  const { addr, label, tag } = req.body;
  if (!addr || !addr.match(/^0x[a-fA-F0-9]{40}$/)) {
    return res.status(400).json({ error: 'Invalid Polygon address' });
  }
  if (STATE.wallets.find(w => w.addr.toLowerCase() === addr.toLowerCase())) {
    return res.status(409).json({ error: 'Wallet already tracked' });
  }
  const wallet = { addr, label: label || addr.slice(0, 8), tag: tag || null, track: true, pnl: 0, trades: 0, winRate: 0, recentTxns: [], lastChecked: null };
  STATE.wallets.push(wallet);
  console.log(`[Wallets] Added ${wallet.label} (${addr})`);
  res.json({ ok: true, wallet });
});

/* Remove a wallet */
app.delete('/api/wallets/:addr', (req, res) => {
  const idx = STATE.wallets.findIndex(w => w.addr.toLowerCase() === req.params.addr.toLowerCase());
  if (idx === -1) return res.status(404).json({ error: 'Wallet not found' });
  STATE.wallets.splice(idx, 1);
  res.json({ ok: true });
});

/* Leaderboard — sorted by PNL */
app.get('/api/leaderboard', (req, res) => {
  const sorted = [...STATE.wallets]
    .sort((a, b) => (b.pnl || 0) - (a.pnl || 0))
    .map((w, i) => ({
      rank: i + 1,
      addr: w.addr.slice(0, 6) + '..' + w.addr.slice(-4),
      label: w.label,
      tag: w.tag,
      pnl: w.pnl || 0,
      trades: w.trades || 0,
      winRate: w.winRate || 0,
    }));
  res.json(sorted);
});


/* Trades — recent copytrade history */
app.get('/api/trades', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  res.json(STATE.trades.slice(0, limit));
});


/* Copytrade — execute or queue for approval */
app.post('/api/copytrade', async (req, res) => {
  const { wallet, market, side, amount, tokenId, price } = req.body;
  if (!wallet || !market || !side) {
    return res.status(400).json({ error: 'Missing wallet, market, or side' });
  }

  const tradeAmount = Math.min(parseFloat(amount) || COPYTRADE_LIMITS.maxPerTrade, COPYTRADE_LIMITS.maxPerTrade);
  const trade = { wallet, market, side, amount: tradeAmount, tokenId, price: price || 0.5 };

  /* Execute via CLOB engine (with safety checks) */
  const result = await executeCopytrade(trade);

  /* Always log to STATE for the frontend feed */
  STATE.trades.unshift({
    id: Date.now(),
    wallet,
    market,
    side,
    amount: tradeAmount,
    time: new Date().toISOString(),
    status: result.status || (result.ok ? 'executed' : 'failed'),
    orderId: result.orderId || null,
    reasons: result.reasons || null,
  });
  if (STATE.trades.length > 500) STATE.trades.length = 500;

  /* Telegram notification */
  if (TELEGRAM_TOKEN && result.ok) {
    await sendTelegram(formatTradeAlert({ wallet, market, side, amount: tradeAmount }));
  }

  res.json(result);
});

/* Approve a pending copytrade */
app.post('/api/copytrade/:id/approve', async (req, res) => {
  const id = parseInt(req.params.id);
  const idx = tradeState.pendingApprovals.findIndex(t => t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Trade not found or already processed' });

  const trade = tradeState.pendingApprovals.splice(idx, 1)[0];

  /* Temporarily disable approval requirement for this execution */
  const wasRequired = COPYTRADE_LIMITS.requireApproval;
  COPYTRADE_LIMITS.requireApproval = false;
  const result = await executeCopytrade(trade);
  COPYTRADE_LIMITS.requireApproval = wasRequired;

  res.json(result);
});

/* Reject a pending copytrade */
app.post('/api/copytrade/:id/reject', (req, res) => {
  const id = parseInt(req.params.id);
  const idx = tradeState.pendingApprovals.findIndex(t => t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Trade not found' });
  tradeState.pendingApprovals.splice(idx, 1);
  res.json({ ok: true, status: 'rejected' });
});

/* Get pending approvals */
app.get('/api/copytrade/pending', (req, res) => {
  res.json(tradeState.pendingApprovals);
});

/* Get copytrade safety status */
app.get('/api/copytrade/status', (req, res) => {
  resetDailyIfNeeded();
  res.json({
    limits: COPYTRADE_LIMITS,
    dailySpent: tradeState.dailySpent,
    openPositions: tradeState.openPositions,
    pendingApprovals: tradeState.pendingApprovals.length,
    executedToday: tradeState.executedTrades.filter(t =>
      new Date(t.executedAt).toDateString() === new Date().toDateString()
    ).length,
    clobConfigured: !!(POLYMARKET_API_KEY && PRIVATE_KEY),
    lastTrade: tradeState.executedTrades[0] || null,
  });
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
/* Scanner — markets + edges + orderbooks */
async function backgroundScan() {
  console.log('[Scanner] Running background scan...');
  try {
    const markets = await fetchMarkets();
    STATE.markets = markets;
    STATE.lastScan = new Date().toISOString();

    let edges = detectEdges(markets);
    edges = await enrichWithOrderbooks(edges);
    STATE.edges = edges;

    if (edges.length > 0) {
      console.log(`[Scanner] ${edges.length} edges found (top: ${edges[0].name} +${edges[0].edge}% [${edges[0].signals.join(',')}])`);

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

/* Wallet scanner — runs separately, less frequent */
async function backgroundWalletScan() {
  try {
    await scanAllWallets();
  } catch (e) {
    console.error('[Wallets] Background scan failed:', e.message);
  }
}

/* ═══════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════ */
app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════╗`);
  console.log(`  ║  POLY // ARBI  Backend  v3.0              ║`);
  console.log(`  ║  Port: ${String(PORT).padEnd(6)}                           ║`);
  console.log(`  ║  Telegram:    ${TELEGRAM_TOKEN ? '✓ ready' : '✗ missing'}                    ║`);
  console.log(`  ║  Polygonscan: ${POLYGONSCAN_KEY ? '✓ ready' : '✗ missing'}                    ║`);
  console.log(`  ║  CLOB Trade:  ${POLYMARKET_API_KEY ? '✓ ready' : '✗ missing'}                    ║`);
  console.log(`  ║  Wallet Key:  ${PRIVATE_KEY ? '✓ loaded' : '✗ missing'}                   ║`);
  console.log(`  ║  Wallets:     ${STATE.wallets.length} tracked                    ║`);
  console.log(`  ║  Auto-trade:  ${COPYTRADE_LIMITS.requireApproval ? 'OFF (approval required)' : 'ON ⚠'}   ║`);
  console.log(`  ║  Dashboard:   http://localhost:${PORT}/app     ║`);
  console.log(`  ╚══════════════════════════════════════════╝\n`);

  /* Market scan: after 5s, then every 5 min */
  setTimeout(backgroundScan, 5000);
  setInterval(backgroundScan, 5 * 60 * 1000);

  /* Wallet scan: after 15s, then every 10 min (rate-limited) */
  setTimeout(backgroundWalletScan, 15000);
  setInterval(backgroundWalletScan, 10 * 60 * 1000);
});
