/* ═══════════════════════════════════════════════════
   POLY // ARBI — Frontend Application
   Connected to POLY//ARBI v2 Backend Engine
   Endpoints: /api/opportunities, /api/wallets, /api/markets,
              /api/copy/status, /api/pnl, /api/execution/status
═══════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
const API_BASE = localStorage.getItem('polyarbi-api') || 'https://polyarbi.onrender.com';

const STATE = {
  connected: false,
  scanner: [],
  wallets: [],
  markets: [],
  trades: [],
  leaderboard: [],
  activity: [],
  pnlData: [],
  pnlStats: null,
  execStatus: null,
  pnlChart: null,
  refreshInterval: parseInt(localStorage.getItem('polyarbi-interval')) || 30,
  refreshTimer: null,
};

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
function $(id) { return document.getElementById(id); }

function formatUSD(n) {
  const abs = Math.abs(n);
  if (abs >= 1000000) return (n >= 0 ? '+$' : '-$') + (abs / 1000000).toFixed(1) + 'M';
  if (abs >= 1000) return (n >= 0 ? '+$' : '-$') + (abs / 1000).toFixed(1) + 'k';
  return (n >= 0 ? '+$' : '-$') + abs.toFixed(0);
}

function formatVol(n) {
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'k';
  return '$' + n;
}

function formatPrice(n) { return Math.round(n * 100) + '\u00a2'; }

function now() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function addActivity(text) {
  STATE.activity.unshift({ time: now(), text });
  if (STATE.activity.length > 30) STATE.activity.pop();
  const el = $('activity-log');
  if (el) el.innerHTML = STATE.activity.slice(0, 8).map(a =>
    `<div class="activity-line"><span class="time">${a.time}</span> <span class="action">${a.text}</span></div>`
  ).join('');
}

/* ══════════════════════════════════════════════
   API LAYER
══════════════════════════════════════════════ */
async function api(endpoint) {
  if (!API_BASE) return null;
  try {
    const t0 = performance.now();
    const res = await fetch(API_BASE + endpoint);
    const latency = Math.round(performance.now() - t0);
    if ($('sb-latency-val')) $('sb-latency-val').textContent = latency + 'ms';
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('[API]', endpoint, e.message);
    return null;
  }
}

async function apiPost(endpoint, body) {
  if (!API_BASE) return null;
  try {
    const res = await fetch(API_BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (e) {
    console.warn('[API POST]', endpoint, e.message);
    return null;
  }
}

/* ══════════════════════════════════════════════
   RENDER: MISPRICING SCANNER
   Source: GET /api/opportunities
══════════════════════════════════════════════ */
function renderScanner() {
  const el = $('scanner-body');
  if (!STATE.scanner.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#128270;</div>Scanning...</div>';
    return;
  }

  el.innerHTML = STATE.scanner.map(s => {
    const signals = [];
    if (s.kalshi) signals.push(`KALSHI ${s.kalshi.matchPct}%`);
    if (s.isPureArb) signals.push('PURE ARB');
    if (s.hasOrderbook) signals.push('OB');
    if (s.spread !== null && s.spread < 3) signals.push('TIGHT');

    return `
    <div class="scanner-card" data-id="${s.id}">
      <div class="scanner-card-top">
        <div>
          <div class="scanner-card-name">${s.question}</div>
          <div class="scanner-card-sub">${s.category} &middot; ${formatVol(s.volume)}</div>
        </div>
        <div style="text-align:right">
          <div class="scanner-card-edge">+${s.edge.toFixed(1)}%</div>
          <div style="font-size:9px;color:var(--gold);font-weight:700">${s.score}/100</div>
        </div>
      </div>
      ${signals.length ? `<div style="margin-bottom:6px">${signals.map(sig => `<span class="signal-tag">${sig}</span>`).join('')}</div>` : ''}
      <div class="scanner-card-row">
        <div class="scanner-card-metric">
          <span class="scanner-card-metric-label">Mkt Price</span>
          <span class="scanner-card-metric-value" style="color:var(--t1)">${formatPrice(s.mktProb)}</span>
        </div>
        <div class="scanner-card-metric">
          <span class="scanner-card-metric-label">True Est.</span>
          <span class="scanner-card-metric-value" style="color:var(--green)">${formatPrice(s.trueProb)}</span>
        </div>
        <div class="scanner-card-metric">
          <span class="scanner-card-metric-label">Direction</span>
          <span class="scanner-card-metric-value" style="color:${s.direction === 'YES' ? 'var(--green)' : 'var(--red)'}">${s.direction}</span>
        </div>
        ${s.spread !== null ? `<div class="scanner-card-metric">
          <span class="scanner-card-metric-label">Spread</span>
          <span class="scanner-card-metric-value" style="color:var(--cyan)">${s.spread}%</span>
        </div>` : ''}
      </div>
      ${s.kalshi ? `<div style="font-size:9px;color:var(--purple);margin-bottom:6px">Kalshi: ${s.kalshi.title.slice(0,50)} @ ${(s.kalshi.price*100).toFixed(0)}%</div>` : ''}
      <div class="scanner-card-actions">
        <button class="btn btn-yes" onclick="openOnPolymarket('${s.slug}')">BUY ${s.direction}</button>
        <button class="btn btn-copy" onclick="actionAlert('${s.id}','${s.direction}',${s.edge},'${s.question.replace(/'/g,"\\'")}',${s.score})">ALERT TG</button>
        <button class="btn btn-ghost" onclick="actionIgnore('${s.id}')">IGNORE</button>
      </div>
    </div>`;
  }).join('');

  $('scanner-count').textContent = STATE.scanner.length + ' EDGES';
}

/* ══════════════════════════════════════════════
   RENDER: WALLET TRACKER
   Source: GET /api/wallets
══════════════════════════════════════════════ */
function renderWallets() {
  const el = $('wallets-body');
  if (!STATE.wallets.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#128065;</div>No wallets detected</div>';
    return;
  }

  el.innerHTML = STATE.wallets.map(w => {
    const tagClass = w.type === 'whale' ? 'whale' : w.type === 'bot' ? 'arb' : w.type === 'smart' ? 'hot' : '';
    const isWatched = (STATE.watchedAddrs || []).includes(w.address?.toLowerCase());
    return `
    <div class="wallet-item">
      <div class="wallet-left">
        <span class="wallet-addr">${w.shortAddr}</span>
        ${tagClass ? `<span class="wallet-tag ${tagClass}">${w.label}</span>` : `<span style="font-size:8px;color:var(--t3)">${w.label}</span>`}
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <div style="text-align:right">
          <span style="font-size:11px;color:var(--t1);font-weight:600">${w.trades} tx</span>
          <span style="font-size:9px;color:var(--t3);display:block">${formatVol(w.volume)} &middot; ${w.wr}% WR</span>
        </div>
        ${w.address ? `<button class="btn ${isWatched ? 'btn-ghost' : 'btn-copy'}" style="padding:3px 6px;font-size:8px" onclick="watchWallet('${w.address}','${w.shortAddr}')">${isWatched ? 'WATCHING' : 'WATCH'}</button>` : ''}
      </div>
    </div>`;
  }).join('');

  $('wallet-count').textContent = STATE.wallets.length + ' ACTIVE';
}

/* ══════════════════════════════════════════════
   RENDER: LIVE MARKETS
   Source: GET /api/markets (all scored markets)
══════════════════════════════════════════════ */
function renderMarkets() {
  const el = $('markets-body');
  if (!STATE.markets.length) {
    el.innerHTML = '<div class="empty-state" style="padding:20px"><div class="empty-state-icon">&#128200;</div>Loading markets...</div>';
    return;
  }

  el.innerHTML = `
    <table class="market-table">
      <thead><tr><th>Market</th><th>Yes</th><th>No</th><th>Score</th></tr></thead>
      <tbody>
        ${STATE.markets.map(m => `
          <tr>
            <td>
              <div class="market-name">${m.question}</div>
              <div class="market-cat">${m.category} &middot; ${formatVol(m.volume)}</div>
            </td>
            <td><span class="price-yes">${formatPrice(m.mktProb)}</span></td>
            <td><span class="price-no">${formatPrice(1 - m.mktProb)}</span></td>
            <td><span class="market-edge ${m.score >= 70 ? 'positive' : 'neutral'}">${m.score}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;

  $('markets-count').textContent = 'WATCHING ' + STATE.markets.length;
}

/* ══════════════════════════════════════════════
   RENDER: COPYTRADE ENGINE
   Source: GET /api/copy/status
══════════════════════════════════════════════ */
function renderCopytrade() {
  const el = $('copytrade-body');
  if (!STATE.trades.length) {
    el.innerHTML = '<div class="empty-state" style="padding:20px"><div class="empty-state-icon">&#9889;</div>No copy trades yet</div>';
    return;
  }

  el.innerHTML = STATE.trades.map(t => {
    const sideClass = t.type === 'BUY' ? 'buy-yes' : 'buy-no';
    const shortWallet = t.walletLabel || (t.wallet ? t.wallet.slice(0, 8) + '..' : '');
    const shortMarket = (t.market || '').slice(0, 35);
    const timeStr = t.time ? new Date(t.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
    return `
    <div class="trade-item">
      <span class="trade-wallet">${shortWallet}</span>
      <span class="trade-market">${shortMarket}</span>
      <span class="trade-side ${sideClass}">${t.type} ${t.outcome || ''}</span>
      <span class="trade-amount">${Math.round(t.shares)} sh</span>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════
   RENDER: PNL CHART
   Source: GET /api/pnl
══════════════════════════════════════════════ */
function renderPNLChart() {
  const canvas = $('pnl-chart');
  if (!canvas) return;
  if (STATE.pnlChart) STATE.pnlChart.destroy();

  const data = STATE.pnlData;
  if (!data.length) return;

  const labels = data.map(p => p.day.slice(5)); // "04-08"
  const values = (() => {
    let cum = 0;
    return data.reverse().map(p => { cum += p.pnl; return Math.round(cum * 100) / 100; });
  })();

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.parentElement.clientHeight || 200);
  const lastVal = values[values.length - 1] || 0;
  const color = lastVal >= 0 ? '#00ff41' : '#ff3b3b';
  gradient.addColorStop(0, lastVal >= 0 ? 'rgba(0,255,65,0.2)' : 'rgba(255,59,59,0.2)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');

  STATE.pnlChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{
      data: values, borderColor: color, borderWidth: 2,
      backgroundColor: gradient, fill: true, tension: 0.3,
      pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: color,
    }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { display: false }, tooltip: {
        backgroundColor: '#0b1118', borderColor: '#1a3a2a', borderWidth: 1,
        titleColor: '#7dac8e', bodyColor: color,
        titleFont: { family: 'monospace', size: 10 }, bodyFont: { family: 'monospace', size: 12, weight: 'bold' },
        padding: 8, displayColors: false,
        callbacks: { label: c => (c.parsed.y >= 0 ? '+$' : '-$') + Math.abs(c.parsed.y).toFixed(2) },
      } },
      scales: {
        x: { display: true, grid: { color: 'rgba(18,31,46,0.5)', lineWidth: 0.5 }, ticks: { color: '#3d5c4a', font: { size: 9, family: 'monospace' }, maxTicksLimit: 8 } },
        y: { display: true, grid: { color: 'rgba(18,31,46,0.5)', lineWidth: 0.5 }, ticks: { color: '#3d5c4a', font: { size: 9, family: 'monospace' }, callback: v => (v >= 0 ? '+' : '') + '$' + v.toFixed(0) } },
      },
    },
  });
}

/* ══════════════════════════════════════════════
   RENDER: LEADERBOARD
   Source: GET /api/wallets (sorted by score)
══════════════════════════════════════════════ */
function renderLeaderboard() {
  const el = $('leaderboard-body');
  const lb = STATE.leaderboard;
  if (!lb.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#127942;</div>No data</div>';
    return;
  }

  const rankClass = r => r === 1 ? 'top1' : r === 2 ? 'top2' : r === 3 ? 'top3' : '';

  el.innerHTML = lb.map((w, i) => {
    const tagClass = w.type === 'whale' ? 'whale' : w.type === 'bot' ? 'arb' : w.type === 'smart' ? 'hot' : '';
    return `
    <div class="lb-item">
      <div class="lb-left">
        <span class="lb-rank ${rankClass(i + 1)}">#${i + 1}</span>
        <span class="lb-addr">${w.shortAddr}</span>
        ${tagClass ? `<span class="wallet-tag ${tagClass}" style="margin-left:4px">${w.label}</span>` : ''}
      </div>
      <div class="lb-right">
        <span class="lb-pnl up">${formatVol(w.volume)}</span>
        <span class="lb-trades">${w.trades} tx &middot; ${w.wr}% WR</span>
      </div>
    </div>`;
  }).join('');

  /* Activity log */
  $('activity-log').innerHTML = STATE.activity.slice(0, 8).map(a =>
    `<div class="activity-line"><span class="time">${a.time}</span> <span class="action">${a.text}</span></div>`
  ).join('');
}

/* ══════════════════════════════════════════════
   ACTIONS
══════════════════════════════════════════════ */
function openOnPolymarket(slug) {
  if (slug) window.open(`https://polymarket.com/event/${slug}`, '_blank');
}

function actionAlert(id, direction, edge, question, score) {
  apiPost('/api/alert', { type: 'arb', market: question || id, direction, edge, suggestedSize: 50, score: score || 0 });
  addActivity(`TG ALERT: ${(question || id).slice(0, 30)}... ${direction}`);
}

function actionIgnore(id) {
  STATE.scanner = STATE.scanner.filter(s => s.id !== id);
  renderScanner();
  addActivity(`IGNORED ${id.toString().slice(0, 15)}...`);
}

async function watchWallet(address, label) {
  if (!address) return;
  addActivity(`Adding ${label || address.slice(0, 10)}... to watchlist`);
  const res = await apiPost('/api/copy/watch', { address, label: label || address.slice(0, 10) });
  if (res?.ok) {
    addActivity(`Now watching ${label || address.slice(0, 10)}`);
    /* Refresh copytrade data */
    const copyStatus = await api('/api/copy/status');
    if (copyStatus) {
      STATE.watchedAddrs = (copyStatus.watching || []).map(w => w.address?.toLowerCase());
      STATE.trades = (copyStatus.recentTrades || []).slice(0, 20);
      renderCopytrade();
      renderWallets(); /* re-render to show WATCHING state */
      const watchCount = (copyStatus.watching || []).length;
      $('copytrade-mode').textContent = `${watchCount} WATCHED`;
      $('copytrade-mode').className = 'badge badge-green';
    }
  } else {
    addActivity(`Failed: ${res?.error || 'unknown error'}`);
  }
}

async function unwatchWallet(address) {
  const res = await fetch(API_BASE + '/api/copy/watch', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  }).then(r => r.json()).catch(() => null);
  if (res?.ok) {
    addActivity(`Stopped watching ${address.slice(0, 10)}...`);
    loadLiveData();
  }
}

/* ══════════════════════════════════════════════
   LOAD LIVE DATA — Maps to real POLY//ARBI v2 API
══════════════════════════════════════════════ */
async function loadLiveData() {
  if (!API_BASE) return;

  const [opps, marketsRes, walletsRes, copyStatus, pnl, execStatus] = await Promise.all([
    api('/api/opportunities'),
    api('/api/markets'),
    api('/api/wallets'),
    api('/api/copy/status'),
    api('/api/pnl'),
    api('/api/execution/status'),
  ]);

  /* Scanner: from /api/opportunities (top scored edges) */
  if (Array.isArray(opps) && opps.length > 0) {
    STATE.scanner = opps;
    renderScanner();
    $('stat-positions').textContent = opps.length;
    addActivity(`${opps.length} opportunities found`);
  }

  /* Markets: from /api/markets */
  if (marketsRes?.markets && marketsRes.markets.length > 0) {
    STATE.markets = marketsRes.markets;
    renderMarkets();
    $('stat-markets').textContent = marketsRes.total || marketsRes.markets.length;
  }

  /* Wallets: from /api/wallets */
  if (walletsRes?.wallets && walletsRes.wallets.length > 0) {
    STATE.wallets = walletsRes.wallets.slice(0, 30);
    renderWallets();
    /* Leaderboard = top wallets by score */
    STATE.leaderboard = walletsRes.wallets.slice(0, 10);
    renderLeaderboard();
    $('stat-tracked').textContent = walletsRes.total;
  }

  /* Copytrade: from /api/copy/status */
  if (copyStatus) {
    const watching = copyStatus.watching || [];
    STATE.watchedAddrs = watching.map(w => w.address?.toLowerCase());
    STATE.trades = (copyStatus.recentTrades || []).slice(0, 20);
    renderCopytrade();
    $('ct-trades').textContent = copyStatus.totalTradesTracked || 0;

    /* Update copytrade footer */
    const watchCount = watching.length;
    $('copytrade-mode').textContent = watchCount > 0 ? `${watchCount} WATCHED` : 'NO WALLETS';
    $('copytrade-mode').className = 'badge ' + (watchCount > 0 ? 'badge-green' : 'badge-orange');
  }

  /* PNL: from /api/pnl */
  if (pnl) {
    STATE.pnlStats = pnl;
    STATE.pnlData = (pnl.byDay || []).slice(0, 30);
    renderPNLChart();

    /* Update topbar stats */
    const totalPnl = pnl.totalPnl || 0;
    $('stat-portfolio').textContent = (totalPnl >= 0 ? '+$' : '-$') + Math.abs(totalPnl).toFixed(2);
    $('stat-portfolio').className = 'topbar-stat-value ' + (totalPnl >= 0 ? 'profit' : 'loss');
    $('stat-winrate').textContent = (pnl.winRate || 0) + '%';
    $('pnl-total').textContent = (totalPnl >= 0 ? '+$' : '-$') + Math.abs(totalPnl).toFixed(2);
    $('ct-pnl').textContent = (totalPnl >= 0 ? '+$' : '-$') + Math.abs(totalPnl).toFixed(2);
    $('ct-roi').textContent = (pnl.winRate || 0) + '%';
  }

  /* Execution status */
  if (execStatus) {
    STATE.execStatus = execStatus;
    const autoLabel = execStatus.autoExecute ? 'AUTO ON' : 'MANUAL';
    /* Could show in UI */
  }

  $('sb-scan-time').textContent = now();
}

/* ══════════════════════════════════════════════
   CONNECTION
══════════════════════════════════════════════ */
function setConnectionStatus(connected) {
  STATE.connected = connected;
  $('sb-poly').className = connected ? 'connected' : 'offline';
  $('sb-chain').className = connected ? 'connected' : 'offline';

  if (connected) {
    $('live-label').textContent = 'LIVE';
    $('live-label').style.color = 'var(--green)';
    $('mode-live').classList.add('active');
    $('mode-demo').classList.remove('active');
  } else if (API_BASE) {
    $('live-label').textContent = 'OFFLINE';
    $('live-label').style.color = 'var(--red)';
  } else {
    $('live-label').textContent = 'DEMO';
    $('live-label').style.color = 'var(--orange)';
  }
}

async function checkConnection() {
  if (!API_BASE) { setConnectionStatus(false); return false; }
  const opps = await api('/api/opportunities');
  const ok = Array.isArray(opps);
  setConnectionStatus(ok);

  /* Check Telegram status */
  const tgOk = await api('/api/telegram/test');
  $('sb-tg').className = tgOk?.ok ? 'connected' : 'degraded';

  return ok;
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

  $('cfg-status').textContent = 'Connecting...';
  $('cfg-status').style.color = 'var(--orange)';

  if (apiUrl && apiUrl !== API_BASE) {
    setTimeout(() => location.reload(), 500);
  } else if (apiUrl) {
    const ok = await checkConnection();
    if (ok) {
      $('cfg-status').textContent = 'Connected!';
      $('cfg-status').style.color = 'var(--green)';
      await loadLiveData();
      startRefreshLoop();
      setTimeout(toggleSettings, 1000);
    } else {
      $('cfg-status').textContent = 'Connection failed.';
      $('cfg-status').style.color = 'var(--red)';
    }
  }
}

async function addWalletFromUI() {
  const addr = $('cfg-wallet-addr').value.trim();
  const label = $('cfg-wallet-label').value.trim();
  if (!addr.match(/^0x[a-fA-F0-9]{40}$/)) {
    $('cfg-status').textContent = 'Invalid address (0x + 40 hex chars)';
    $('cfg-status').style.color = 'var(--red)';
    return;
  }
  /* POST to /api/copy/watch (the real backend endpoint) */
  const res = await apiPost('/api/copy/watch', { address: addr, label: label || undefined });
  if (res?.ok) {
    $('cfg-status').textContent = 'Wallet added! Now watching ' + (label || addr.slice(0, 10));
    $('cfg-status').style.color = 'var(--green)';
    $('cfg-wallet-addr').value = '';
    $('cfg-wallet-label').value = '';
    loadLiveData();
  } else {
    $('cfg-status').textContent = res?.error || 'Failed to add wallet';
    $('cfg-status').style.color = 'var(--red)';
  }
}

function startRefreshLoop() {
  if (STATE.refreshTimer) clearInterval(STATE.refreshTimer);
  if (API_BASE) {
    STATE.refreshTimer = setInterval(loadLiveData, STATE.refreshInterval * 1000);
    console.log(`[Refresh] every ${STATE.refreshInterval}s`);
  }
}

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
async function init() {
  /* Render empty states first */
  renderScanner();
  renderWallets();
  renderMarkets();
  renderCopytrade();
  renderLeaderboard();

  if (API_BASE) {
    addActivity('Connecting to ' + API_BASE.replace('https://', ''));
    const ok = await checkConnection();
    if (ok) {
      addActivity('Backend connected — loading live data');
      await loadLiveData();
      startRefreshLoop();
    } else {
      addActivity('Backend unreachable — check CONFIG');
      setConnectionStatus(false);
    }
  } else {
    setConnectionStatus(false);
    addActivity('No backend configured — click CONFIG');
  }

  $('sb-scan-time').textContent = now();
  console.log('[POLY//ARBI] Terminal v3.0 — connected to v2 backend');
}

window.addEventListener('resize', () => { if (STATE.pnlChart) renderPNLChart(); });
document.addEventListener('DOMContentLoaded', init);
