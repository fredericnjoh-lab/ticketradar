/* ═══════════════════════════════════════════════════
   POLY // ARBI — Frontend Application
   Panels: Scanner, Wallets, Markets, Copytrade, PNL, Leaderboard
═══════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════
   DEMO DATA
   Replace with live API calls in production
══════════════════════════════════════════════ */

const DEMO_SCANNER = [
  {
    id: 1,
    name: 'Fed cuts rates in Q1?',
    category: 'MACRO',
    polyPrice: 0.67,
    fairValue: 0.754,
    edge: 8.43,
    volume: '$5.4M',
    tag: 'EDGE',
  },
  {
    id: 2,
    name: 'BTC above $120k by EOY?',
    category: 'CRYPTO',
    polyPrice: 0.54,
    fairValue: 0.591,
    edge: 5.29,
    volume: '$8.9M',
    tag: 'EDGE',
  },
  {
    id: 3,
    name: 'SpaceX Starship orbit 2025?',
    category: 'TECH',
    polyPrice: 0.78,
    fairValue: 0.847,
    edge: 6.63,
    volume: '$3.2M',
    tag: 'EDGE',
  },
  {
    id: 4,
    name: 'Apple AI Siri v2 ships?',
    category: 'TECH',
    polyPrice: 0.62,
    fairValue: 0.659,
    edge: 4.73,
    volume: '$1.8M',
    tag: 'EDGE',
  },
  {
    id: 5,
    name: 'Trump 2nd term ends early?',
    category: 'POLITICS',
    polyPrice: 0.11,
    fairValue: 0.142,
    edge: 3.18,
    volume: '$2.1M',
    tag: 'EDGE',
  },
  {
    id: 6,
    name: 'Gaza ceasefire holds 30d?',
    category: 'GEO',
    polyPrice: 0.42,
    fairValue: 0.458,
    edge: 3.81,
    volume: '$1.3M',
    tag: 'EDGE',
  },
];

const DEMO_WALLETS = [
  { addr: '0x3f4a..c91e', tag: 'hot',   pnl: +184200, trades: 1264, winRate: 71.2 },
  { addr: '0xa12b..5f3d', tag: 'hot',   pnl: +97400,  trades: 892,  winRate: 63.5 },
  { addr: '0x87cc..aa20', tag: 'whale', pnl: +312000, trades: 847,  winRate: 74.8 },
  { addr: '0x1d9e..b47a', tag: 'arb',   pnl: +44100,  trades: 2091, winRate: 58.9 },
  { addr: '0x03c5..217b', tag: null,     pnl: +28700,  trades: 423,  winRate: 55.1 },
  { addr: '0x5e88..3c99', tag: 'whale', pnl: +199800, trades: 432,  winRate: 69.4 },
  { addr: '0xc241..e054', tag: 'arb',   pnl: +15600,  trades: 1876, winRate: 54.2 },
];

const DEMO_MARKETS = [
  { name: 'Trump 2nd term ends early?',  cat: 'US POL',  vol: '$2.1M', yes: 0.11, no: 0.89, edge: null },
  { name: 'Fed cuts rates in Q1?',       cat: 'MACRO',   vol: '$5.4M', yes: 0.67, no: 0.33, edge: +8.4 },
  { name: 'BTC above $120k by EOY?',     cat: 'CRYPTO',  vol: '$8.9M', yes: 0.54, no: 0.46, edge: +1.1 },
  { name: 'Gaza ceasefire holds 30d?',   cat: 'GEO',     vol: '$1.3M', yes: 0.42, no: 0.58, edge: +2.6 },
  { name: 'SpaceX Starship orbit 2025?', cat: 'TECH',    vol: '$3.2M', yes: 0.79, no: 0.21, edge: +3.2 },
  { name: 'NFL QB MVP non-Kansas?',      cat: 'SPORT',   vol: '$4.7M', yes: 0.33, no: 0.67, edge: +2.2 },
  { name: 'Apple AI Siri v2 ships?',     cat: 'TECH',    vol: '$1.8M', yes: 0.62, no: 0.38, edge: +1.9 },
  { name: 'US recession by Q3 2025?',    cat: 'MACRO',   vol: '$6.1M', yes: 0.29, no: 0.71, edge: +2.1 },
  { name: 'Ukraine ceasefire by July?',  cat: 'GEO',     vol: '$3.4M', yes: 0.24, no: 0.76, edge: +1.5 },
  { name: 'ETH above $5k by June?',      cat: 'CRYPTO',  vol: '$4.2M', yes: 0.31, no: 0.69, edge: +0.8 },
  { name: 'Next Pope from Africa?',      cat: 'WORLD',   vol: '$0.9M', yes: 0.18, no: 0.82, edge: null },
  { name: 'TikTok ban upheld?',          cat: 'TECH',    vol: '$7.1M', yes: 0.45, no: 0.55, edge: +1.3 },
];

const DEMO_TRADES = [
  { wallet: '0x87cc..aa20', market: 'Fed cuts Q1',     side: 'buy-yes', amount: 2400, time: '12:11' },
  { wallet: '0x3f4a..c91e', market: 'BTC $120k',       side: 'buy-no',  amount: 800,  time: '12:09' },
  { wallet: '0xa12b..5f3d', market: 'Starship Orbit',  side: 'buy-yes', amount: 1200, time: '12:05' },
  { wallet: '0x1d9e..b47a', market: 'Apple Siri',      side: 'buy-yes', amount: 600,  time: '11:58' },
  { wallet: '0x5e88..3c99', market: 'Fed cuts Q1',     side: 'buy-yes', amount: 5000, time: '11:52' },
  { wallet: '0x87cc..aa20', market: 'Gaza ceasefire',   side: 'buy-no',  amount: 1800, time: '11:45' },
  { wallet: '0xc241..e054', market: 'US recession Q3',  side: 'buy-yes', amount: 350,  time: '11:40' },
  { wallet: '0x3f4a..c91e', market: 'ETH $5k June',     side: 'buy-yes', amount: 950,  time: '11:33' },
];

const DEMO_LEADERBOARD = [
  { rank: 1, addr: '0x87cc..aa20', pnl: +312000, trades: 847,  winRate: 74.8 },
  { rank: 2, addr: '0x3f4a..c91e', pnl: +184200, trades: 1264, winRate: 71.2 },
  { rank: 3, addr: '0x5e88..3c99', pnl: +199800, trades: 432,  winRate: 69.4 },
  { rank: 4, addr: '0xa12b..5f3d', pnl: +97400,  trades: 892,  winRate: 63.5 },
  { rank: 5, addr: '0x1d9e..b47a', pnl: +44100,  trades: 2091, winRate: 58.9 },
  { rank: 6, addr: '0xc241..e054', pnl: +15600,  trades: 1876, winRate: 54.2 },
  { rank: 7, addr: '0x03c5..217b', pnl: +28700,  trades: 423,  winRate: 55.1 },
];

const DEMO_ACTIVITY = [
  { time: '12:11:34', text: 'COPY TRADE 0x87cc..aa20 BUY YES Fed cu...' },
  { time: '12:11:30', text: 'PNL Today\'s realized: +$847' },
  { time: '12:09:12', text: 'EDGE FOUND BTC $120k +5.29% — added to scanner' },
  { time: '12:05:45', text: 'COPY TRADE 0xa12b..5f3d BUY YES Starship...' },
  { time: '11:58:22', text: 'WALLET 0x1d9e..b47a new position detected' },
];

/* PNL curve data (30 days) */
const DEMO_PNL_DATA = (() => {
  const pts = [];
  let val = 0;
  for (let i = 0; i < 30; i++) {
    val += (Math.random() - 0.35) * 600;
    if (val < -500) val += 400;
    pts.push({ day: i + 1, value: Math.round(val) });
  }
  // Ensure uptrend ending around +10554
  const scale = 10554 / (pts[pts.length - 1].value || 1);
  return pts.map(p => ({ ...p, value: Math.round(p.value * scale) }));
})();


/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
const STATE = {
  mode: localStorage.getItem('polyarbi-mode') || 'demo',
  connected: false,
  scanner: DEMO_SCANNER,
  wallets: DEMO_WALLETS,
  markets: DEMO_MARKETS,
  trades: DEMO_TRADES,
  leaderboard: DEMO_LEADERBOARD,
  activity: DEMO_ACTIVITY,
  pnlData: DEMO_PNL_DATA,
  pnlChart: null,
  refreshInterval: parseInt(localStorage.getItem('polyarbi-interval')) || 30,
  refreshTimer: null,
};


/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
function $(id) { return document.getElementById(id); }

function formatUSD(n) {
  if (Math.abs(n) >= 1000) {
    return (n >= 0 ? '+' : '') + '$' + (n / 1000).toFixed(1) + 'k';
  }
  return (n >= 0 ? '+' : '-') + '$' + Math.abs(n).toLocaleString('en-US');
}

function formatPrice(n) {
  return Math.round(n * 100) + '\u00a2'; // e.g. 67¢
}

function now() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}


/* ══════════════════════════════════════════════
   RENDER: MISPRICING SCANNER
══════════════════════════════════════════════ */
function renderScanner() {
  const el = $('scanner-body');
  el.innerHTML = STATE.scanner.map(s => `
    <div class="scanner-card" data-id="${s.id}">
      <div class="scanner-card-top">
        <div>
          <div class="scanner-card-name">${s.name}</div>
          <div class="scanner-card-sub">${s.category} &middot; ${s.volume}</div>
        </div>
        <div class="scanner-card-edge">+${s.edge.toFixed(2)}%</div>
      </div>
      ${s.signals && s.signals.length ? `<div style="margin-bottom:6px">${s.signals.map(sig => `<span class="signal-tag">${sig}</span>`).join('')}</div>` : ''}
      <div class="scanner-card-row">
        <div class="scanner-card-metric">
          <span class="scanner-card-metric-label">Poly Price</span>
          <span class="scanner-card-metric-value" style="color:var(--t1)">${formatPrice(s.polyPrice)}</span>
        </div>
        <div class="scanner-card-metric">
          <span class="scanner-card-metric-label">Fair Value</span>
          <span class="scanner-card-metric-value" style="color:var(--green)">${formatPrice(s.fairValue)}</span>
        </div>
        <div class="scanner-card-metric">
          <span class="scanner-card-metric-label">Volume</span>
          <span class="scanner-card-metric-value" style="color:var(--t2)">${s.volume}</span>
        </div>
        ${s.orderbook ? `<div class="scanner-card-metric">
          <span class="scanner-card-metric-label">OB Skew</span>
          <span class="scanner-card-metric-value" style="color:var(--cyan)">${s.orderbook.imbalance}%</span>
        </div>` : ''}
      </div>
      <div class="scanner-card-actions">
        <button class="btn btn-yes" onclick="actionBuy(${s.id},'yes')">BUY YES</button>
        <button class="btn btn-copy" onclick="actionCopy(${s.id})">COPY TRADE</button>
        <button class="btn btn-ghost" onclick="actionIgnore(${s.id})">IGNORE</button>
      </div>
    </div>
  `).join('');

  $('scanner-count').textContent = STATE.scanner.length + ' EDGES';
}


/* ══════════════════════════════════════════════
   RENDER: WALLET TRACKER
══════════════════════════════════════════════ */
function renderWallets() {
  const el = $('wallets-body');
  el.innerHTML = STATE.wallets
    .sort((a, b) => b.pnl - a.pnl)
    .map(w => `
      <div class="wallet-item">
        <div class="wallet-left">
          <span class="wallet-addr">${w.addr}</span>
          ${w.tag ? `<span class="wallet-tag ${w.tag}">${w.tag.toUpperCase()}</span>` : ''}
        </div>
        <span class="wallet-pnl ${w.pnl >= 0 ? 'up' : 'down'}">${formatUSD(w.pnl)}</span>
      </div>
    `).join('');

  $('wallet-count').textContent = STATE.wallets.length + ' TRACKED';
}


/* ══════════════════════════════════════════════
   RENDER: LIVE MARKETS
══════════════════════════════════════════════ */
function renderMarkets() {
  const el = $('markets-body');
  el.innerHTML = `
    <table class="market-table">
      <thead>
        <tr>
          <th>Market</th>
          <th>Yes</th>
          <th>No</th>
          <th>Edge</th>
        </tr>
      </thead>
      <tbody>
        ${STATE.markets.map(m => `
          <tr>
            <td>
              <div class="market-name">${m.name}</div>
              <div class="market-cat">${m.cat} &middot; ${m.vol}</div>
            </td>
            <td><span class="price-yes">${formatPrice(m.yes)}</span></td>
            <td><span class="price-no">${formatPrice(m.no)}</span></td>
            <td>
              <span class="market-edge ${m.edge ? 'positive' : 'neutral'}">
                ${m.edge ? '+' + m.edge.toFixed(1) + '%' : '&mdash;'}
              </span>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  $('markets-count').textContent = 'WATCHING ' + STATE.markets.length;
}


/* ══════════════════════════════════════════════
   RENDER: COPYTRADE ENGINE
══════════════════════════════════════════════ */
function renderCopytrade() {
  const el = $('copytrade-body');
  el.innerHTML = STATE.trades.map(t => `
    <div class="trade-item">
      <span class="trade-wallet">${t.wallet}</span>
      <span class="trade-market">${t.market}</span>
      <span class="trade-side ${t.side}">${t.side.replace('-', ' ').toUpperCase()}</span>
      <span class="trade-amount">$${t.amount.toLocaleString('en-US')}</span>
    </div>
  `).join('');
}


/* ══════════════════════════════════════════════
   RENDER: PNL CHART
══════════════════════════════════════════════ */
function renderPNLChart() {
  const canvas = $('pnl-chart');
  if (!canvas) return;

  if (STATE.pnlChart) STATE.pnlChart.destroy();

  const labels = STATE.pnlData.map(p => 'D' + p.day);
  const values = STATE.pnlData.map(p => p.value);

  const ctx = canvas.getContext('2d');

  /* Gradient fill */
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.parentElement.clientHeight || 200);
  gradient.addColorStop(0, 'rgba(0, 255, 65, 0.2)');
  gradient.addColorStop(1, 'rgba(0, 255, 65, 0.0)');

  STATE.pnlChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#00ff41',
        borderWidth: 2,
        backgroundColor: gradient,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#00ff41',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0b1118',
          borderColor: '#1a3a2a',
          borderWidth: 1,
          titleColor: '#7dac8e',
          bodyColor: '#00ff41',
          titleFont: { family: 'monospace', size: 10 },
          bodyFont: { family: 'monospace', size: 12, weight: 'bold' },
          padding: 8,
          displayColors: false,
          callbacks: {
            label: ctx => (ctx.parsed.y >= 0 ? '+$' : '-$') + Math.abs(ctx.parsed.y).toLocaleString(),
          },
        },
      },
      scales: {
        x: {
          display: true,
          grid: { color: 'rgba(18,31,46,0.5)', lineWidth: 0.5 },
          ticks: { color: '#3d5c4a', font: { size: 9, family: 'monospace' }, maxTicksLimit: 8 },
        },
        y: {
          display: true,
          grid: { color: 'rgba(18,31,46,0.5)', lineWidth: 0.5 },
          ticks: {
            color: '#3d5c4a',
            font: { size: 9, family: 'monospace' },
            callback: v => (v >= 0 ? '+' : '') + '$' + (v / 1000).toFixed(1) + 'k',
          },
        },
      },
    },
  });
}


/* ══════════════════════════════════════════════
   RENDER: LEADERBOARD
══════════════════════════════════════════════ */
function renderLeaderboard() {
  const el = $('leaderboard-body');

  const rankClass = r => r === 1 ? 'top1' : r === 2 ? 'top2' : r === 3 ? 'top3' : '';

  el.innerHTML = STATE.leaderboard
    .sort((a, b) => b.pnl - a.pnl)
    .map((lb, i) => `
      <div class="lb-item">
        <div class="lb-left">
          <span class="lb-rank ${rankClass(i + 1)}">#${i + 1}</span>
          <span class="lb-addr">${lb.addr}</span>
        </div>
        <div class="lb-right">
          <span class="lb-pnl ${lb.pnl >= 0 ? 'up' : 'down'}">${formatUSD(lb.pnl)}</span>
          <span class="lb-trades">${lb.trades} trades &middot; ${lb.winRate}% WR</span>
        </div>
      </div>
    `).join('');

  /* Activity log */
  $('activity-log').innerHTML = STATE.activity.map(a => `
    <div class="activity-line">
      <span class="time">${a.time}</span>
      <span class="action">${a.text}</span>
    </div>
  `).join('');
}


/* ══════════════════════════════════════════════
   ACTIONS
══════════════════════════════════════════════ */
function actionBuy(id, side) {
  const item = STATE.scanner.find(s => s.id === id);
  if (!item) return;
  addActivity(`MANUAL BUY ${side.toUpperCase()} "${item.name}" — submitted`);
  flashCard(id);
}

function actionCopy(id) {
  const item = STATE.scanner.find(s => s.id === id);
  if (!item) return;
  addActivity(`COPY TRADE enabled for "${item.name}"`);
  flashCard(id);
}

function actionIgnore(id) {
  STATE.scanner = STATE.scanner.filter(s => s.id !== id);
  renderScanner();
  addActivity(`IGNORED scanner entry #${id}`);
}

function flashCard(id) {
  const card = document.querySelector(`.scanner-card[data-id="${id}"]`);
  if (card) {
    card.classList.add('flash-up');
    setTimeout(() => card.classList.remove('flash-up'), 600);
  }
}

function addActivity(text) {
  STATE.activity.unshift({ time: now(), text });
  if (STATE.activity.length > 20) STATE.activity.pop();
  $('activity-log').innerHTML = STATE.activity.map(a => `
    <div class="activity-line">
      <span class="time">${a.time}</span>
      <span class="action">${a.text}</span>
    </div>
  `).join('');
}


/* ══════════════════════════════════════════════
   MODE TOGGLE
══════════════════════════════════════════════ */
function setMode(mode) {
  STATE.mode = mode;
  $('mode-demo').classList.toggle('active', mode === 'demo');
  $('mode-live').classList.toggle('active', mode === 'live');
  $('live-label').textContent = mode === 'live' ? 'LIVE' : 'DEMO';
  $('copytrade-mode').textContent = mode === 'live' ? 'LIVE MODE' : 'DEMO MODE';
  $('copytrade-mode').className = 'badge ' + (mode === 'live' ? 'badge-green' : 'badge-orange');
  addActivity(`Mode switched to ${mode.toUpperCase()}`);
}


/* ══════════════════════════════════════════════
   SIMULATED LIVE UPDATES
   Adds realism — replace with WebSocket in prod
══════════════════════════════════════════════ */
function simulateTick() {
  /* Jitter market prices */
  STATE.markets.forEach(m => {
    const delta = (Math.random() - 0.5) * 0.03;
    m.yes = Math.max(0.01, Math.min(0.99, m.yes + delta));
    m.no = Math.max(0.01, Math.min(0.99, 1 - m.yes));
    if (m.edge !== null) {
      m.edge += (Math.random() - 0.5) * 0.4;
      m.edge = Math.round(m.edge * 10) / 10;
    }
  });

  /* Jitter scanner edges */
  STATE.scanner.forEach(s => {
    s.edge += (Math.random() - 0.5) * 0.3;
    s.edge = Math.max(0.5, Math.round(s.edge * 100) / 100);
    s.polyPrice += (Math.random() - 0.5) * 0.02;
    s.polyPrice = Math.max(0.01, Math.min(0.99, s.polyPrice));
    s.fairValue = s.polyPrice + s.edge / 100;
  });

  renderMarkets();
  renderScanner();

  /* Update scan timestamp */
  $('sb-scan-time').textContent = now();
  $('sb-latency-val').textContent = (30 + Math.floor(Math.random() * 40)) + 'ms';
}


/* ══════════════════════════════════════════════
   BACKEND API — LIVE DATA
══════════════════════════════════════════════ */
const API_BASE = localStorage.getItem('polyarbi-api') || '';

async function fetchFromAPI(endpoint) {
  if (!API_BASE) return null;
  try {
    const t0 = performance.now();
    const res = await fetch(API_BASE + endpoint);
    const latency = Math.round(performance.now() - t0);
    $('sb-latency-val').textContent = latency + 'ms';
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('[API]', endpoint, e.message);
    return null;
  }
}

async function checkConnection() {
  if (!API_BASE) {
    setConnectionStatus(false);
    return false;
  }
  const health = await fetchFromAPI('/api/health');
  const ok = !!health?.status;
  setConnectionStatus(ok, health);
  return ok;
}

function setConnectionStatus(connected, health) {
  STATE.connected = connected;
  $('sb-poly').className = connected ? 'connected' : 'offline';
  $('sb-chain').className = connected ? 'connected' : 'offline';
  $('sb-tg').className = (health?.telegram) ? 'connected' : 'degraded';

  if (connected) {
    $('live-label').textContent = 'LIVE';
    $('live-label').style.color = 'var(--green)';
  } else if (API_BASE) {
    $('live-label').textContent = 'OFFLINE';
    $('live-label').style.color = 'var(--red)';
  } else {
    $('live-label').textContent = 'DEMO';
    $('live-label').style.color = 'var(--orange)';
  }
}

async function loadLiveData() {
  if (!API_BASE) return;

  const [markets, wallets, scanner, leaderboard, trades] = await Promise.all([
    fetchFromAPI('/api/markets'),
    fetchFromAPI('/api/wallets'),
    fetchFromAPI('/api/scanner'),
    fetchFromAPI('/api/leaderboard'),
    fetchFromAPI('/api/trades'),
  ]);

  if (markets && markets.length > 0) {
    STATE.markets = markets.map(m => ({
      name: m.name,
      cat: m.category || 'OTHER',
      vol: m.volume ? '$' + (m.volume / 1e6).toFixed(1) + 'M' : '$0',
      yes: m.yes,
      no: m.no,
      edge: m.edge || null,
    }));
    renderMarkets();
    $('stat-markets').textContent = markets.length;
  }

  if (wallets && wallets.length > 0) {
    STATE.wallets = wallets.map(w => ({
      addr: w.addr,
      tag: w.tag,
      pnl: w.pnl || 0,
      trades: w.trades || 0,
      winRate: w.winRate || 0,
    }));
    renderWallets();
    $('stat-tracked').textContent = wallets.length;
  }

  if (scanner && scanner.length > 0) {
    STATE.scanner = scanner.map((s, i) => ({
      id: i + 1,
      name: s.name,
      category: s.category || 'OTHER',
      polyPrice: s.yes,
      fairValue: s.fairValue || s.yes,
      edge: s.edge || 0,
      volume: s.volume ? '$' + (s.volume / 1e6).toFixed(1) + 'M' : '$0',
      signals: s.signals || [],
      orderbook: s.orderbook || null,
    }));
    renderScanner();
  }

  if (leaderboard && leaderboard.length > 0) {
    STATE.leaderboard = leaderboard;
    renderLeaderboard();
  }

  if (trades && trades.length > 0) {
    STATE.trades = trades.map(t => ({
      wallet: t.wallet,
      market: t.market,
      side: t.side,
      amount: t.amount || 0,
      time: t.time ? new Date(t.time).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'}) : '',
    }));
    renderCopytrade();
  }

  $('sb-scan-time').textContent = now();
  addActivity('Live data refreshed from backend');
}

/* ══════════════════════════════════════════════
   SETTINGS
══════════════════════════════════════════════ */
function toggleSettings() {
  const overlay = $('settings-overlay');
  const isOpen = overlay.style.display !== 'none';
  overlay.style.display = isOpen ? 'none' : 'flex';
  if (!isOpen) {
    $('cfg-api').value = API_BASE;
    $('cfg-interval').value = STATE.refreshInterval;
  }
}

async function saveSettings() {
  const apiUrl = $('cfg-api').value.trim().replace(/\/+$/, '');
  const interval = parseInt($('cfg-interval').value) || 30;

  localStorage.setItem('polyarbi-api', apiUrl);
  localStorage.setItem('polyarbi-interval', interval);
  STATE.refreshInterval = interval;

  $('cfg-status').textContent = 'Connecting...';
  $('cfg-status').style.color = 'var(--orange)';

  if (apiUrl) {
    // Update API_BASE (it's a const, so we reassign via the variable trick)
    window.__apiBase = apiUrl;
    const ok = await checkConnection();
    if (ok) {
      $('cfg-status').textContent = 'Connected! Loading live data...';
      $('cfg-status').style.color = 'var(--green)';
      await loadLiveData();
      startRefreshLoop();
      setTimeout(toggleSettings, 1000);
    } else {
      $('cfg-status').textContent = 'Connection failed. Check the URL.';
      $('cfg-status').style.color = 'var(--red)';
    }
  } else {
    $('cfg-status').textContent = 'Demo mode — no backend connected.';
    $('cfg-status').style.color = 'var(--orange)';
    setConnectionStatus(false);
  }

  // Reload page to apply new API_BASE from localStorage
  if (apiUrl !== API_BASE) {
    setTimeout(() => location.reload(), 1500);
  }
}

async function addWalletFromUI() {
  const addr = $('cfg-wallet-addr').value.trim();
  const label = $('cfg-wallet-label').value.trim();
  if (!addr.match(/^0x[a-fA-F0-9]{40}$/)) {
    $('cfg-status').textContent = 'Invalid address format (0x... 40 hex chars)';
    $('cfg-status').style.color = 'var(--red)';
    return;
  }

  if (API_BASE) {
    const res = await fetch(API_BASE + '/api/wallets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addr, label }),
    }).then(r => r.json()).catch(() => null);

    if (res?.ok) {
      $('cfg-status').textContent = 'Wallet added: ' + (label || addr.slice(0, 10));
      $('cfg-status').style.color = 'var(--green)';
      $('cfg-wallet-addr').value = '';
      $('cfg-wallet-label').value = '';
      loadLiveData();
    } else {
      $('cfg-status').textContent = res?.error || 'Failed to add wallet';
      $('cfg-status').style.color = 'var(--red)';
    }
  } else {
    $('cfg-status').textContent = 'Connect a backend first to add wallets';
    $('cfg-status').style.color = 'var(--orange)';
  }
}

function startRefreshLoop() {
  if (STATE.refreshTimer) clearInterval(STATE.refreshTimer);
  if (API_BASE) {
    STATE.refreshTimer = setInterval(loadLiveData, STATE.refreshInterval * 1000);
    console.log(`[Refresh] Live data every ${STATE.refreshInterval}s`);
  }
}


/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
async function init() {
  /* Render demo data first (instant) */
  renderScanner();
  renderWallets();
  renderMarkets();
  renderCopytrade();
  renderPNLChart();
  renderLeaderboard();

  /* Set initial mode UI */
  setMode(STATE.mode);

  if (API_BASE) {
    /* Try connecting to backend */
    const ok = await checkConnection();
    if (ok) {
      addActivity('Backend connected: ' + API_BASE);
      await loadLiveData();
      startRefreshLoop();
    } else {
      addActivity('Backend unreachable — using demo data');
    }
  } else {
    setConnectionStatus(false);
    addActivity('No backend configured — demo mode');
    /* Simulated ticks only in demo mode */
    setInterval(simulateTick, 3000);
  }

  /* Only simulate ticks if not connected to real backend */
  if (!STATE.connected) {
    setInterval(simulateTick, 3000);
  }

  $('sb-scan-time').textContent = now();
  console.log('[POLY//ARBI] Terminal v2.0 initialized');
}

/* Resize chart on window resize */
window.addEventListener('resize', () => {
  if (STATE.pnlChart) renderPNLChart();
});

/* Boot */
document.addEventListener('DOMContentLoaded', init);
