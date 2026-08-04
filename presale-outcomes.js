/**
 * TicketRadar — Sprint 3: Outcome Feedback Loop
 * Track recommended vs paid vs sold → prediction error → calibrate scoring.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUTCOMES_PATH = path.join(__dirname, 'data', 'presale-outcomes.json');
const DEFAULT_BUY_FEE = 0.10;
const DEFAULT_SELL_FEE = 0.15;

function ensureDataDir() {
  const dir = path.dirname(OUTCOMES_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadOutcomes() {
  try {
    if (!fs.existsSync(OUTCOMES_PATH)) return [];
    const raw = JSON.parse(fs.readFileSync(OUTCOMES_PATH, 'utf8'));
    return Array.isArray(raw?.outcomes) ? raw.outcomes : (Array.isArray(raw) ? raw : []);
  } catch (_) {
    return [];
  }
}

function saveOutcomes(outcomes) {
  ensureDataDir();
  fs.writeFileSync(
    OUTCOMES_PATH,
    JSON.stringify({ updated_at: new Date().toISOString(), outcomes }, null, 2),
    'utf8'
  );
}

function num(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  const t0 = new Date(a).getTime();
  const t1 = new Date(b).getTime();
  if (Number.isNaN(t0) || Number.isNaN(t1)) return null;
  return Math.round((t1 - t0) / 86400000);
}

function median(arr) {
  const a = arr.filter(n => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function enrichComputed(o) {
  const qty = Math.max(1, num(o.qty, 1) || 1);
  const paid = num(o.paid_face, 0) || 0;
  const buyFee = num(o.buy_fee_pct, DEFAULT_BUY_FEE) ?? DEFAULT_BUY_FEE;
  const sellFee = num(o.sell_fee_pct, DEFAULT_SELL_FEE) ?? DEFAULT_SELL_FEE;
  const sold = num(o.sold_price, 0) || 0;
  const listed = num(o.listed_price, 0) || 0;

  const allIn = paid * (1 + buyFee) * qty;
  const netSell = sold > 0 ? sold * (1 - sellFee) * qty : null;
  const profit_net = netSell != null ? Math.round(netSell - allIn) : null;
  const roi_net_pct = allIn > 0 && profit_net != null
    ? Math.round((profit_net / allIn) * 100)
    : null;

  const hold_days = daysBetween(o.bought_at, o.sold_at || o.listed_at);

  const forecastMed = num(o.forecast_resale_median, 0) || 0;
  const forecastCons = num(o.forecast_resale_conservative, 0) || 0;
  const maxBuy = num(o.recommended_max_buy, 0) || 0;

  let error_resale = null;
  let error_resale_pct = null;
  if (sold > 0 && forecastMed > 0) {
    error_resale = Math.round(sold - forecastMed);
    error_resale_pct = Math.round(((sold - forecastMed) / forecastMed) * 100);
  }

  let error_max_buy = null;
  let error_max_buy_pct = null;
  if (paid > 0 && maxBuy > 0) {
    error_max_buy = Math.round(paid - maxBuy);
    error_max_buy_pct = Math.round(((paid - maxBuy) / maxBuy) * 100);
  }

  let beat_conservative = null;
  if (sold > 0 && forecastCons > 0) {
    beat_conservative = sold >= forecastCons;
  }

  return {
    ...o,
    qty,
    buy_fee_pct: buyFee,
    sell_fee_pct: sellFee,
    listed_price: listed || null,
    sold_price: sold || null,
    profit_net,
    roi_net_pct,
    hold_days,
    error_resale,
    error_resale_pct,
    error_max_buy,
    error_max_buy_pct,
    beat_conservative,
  };
}

/**
 * Create outcome from a presale recommendation + actual paid price.
 */
function createOutcome(body = {}) {
  const now = new Date().toISOString();
  const status = body.status || 'bought';
  const base = {
    id: crypto.randomUUID(),
    created_at: now,
    updated_at: now,
    status, // bought | listed | sold | abandoned

    // event link
    tm_id: String(body.tm_id || '').slice(0, 64) || null,
    opp_id: String(body.opp_id || body.id || '').slice(0, 120) || null,
    name: String(body.name || '').slice(0, 200),
    artist: String(body.artist || '').slice(0, 120),
    venue: String(body.venue || '').slice(0, 120),
    city: String(body.city || '').slice(0, 80),
    country: String(body.country || '').slice(0, 4),
    date: String(body.date || '').slice(0, 32),
    url: String(body.url || '').slice(0, 500),
    category: String(body.category || 'GA / Fosse').slice(0, 60),
    sale_name: String(body.sale_name || '').slice(0, 120),

    // recommendation snapshot (frozen at log time)
    recommended_max_buy: num(body.recommended_max_buy ?? body.max_buy_face),
    forecast_face_est: num(body.forecast_face_est ?? body.face_est),
    forecast_resale_conservative: num(body.forecast_resale_conservative ?? body.resale_conservative),
    forecast_resale_median: num(body.forecast_resale_median ?? body.resale_median),
    forecast_resale_optimistic: num(body.forecast_resale_optimistic ?? body.resale_optimistic),
    decision: String(body.decision || '').slice(0, 20),
    confidence: num(body.confidence),
    demand_score: num(body.demand_score),
    opportunity_score: num(body.opportunity_score),
    comps_priced: num(body.comps_priced, 0) || 0,

    // actuals
    paid_face: num(body.paid_face ?? body.paid),
    buy_fee_pct: num(body.buy_fee_pct, DEFAULT_BUY_FEE),
    listed_price: num(body.listed_price),
    sold_price: num(body.sold_price),
    sell_fee_pct: num(body.sell_fee_pct, DEFAULT_SELL_FEE),
    qty: Math.max(1, Math.min(20, num(body.qty, 1) || 1)),
    notes: String(body.notes || '').slice(0, 500),

    bought_at: body.bought_at || now,
    listed_at: body.listed_at || null,
    sold_at: body.sold_at || null,
  };

  if (!(base.paid_face > 0)) {
    return { ok: false, error: 'paid_face requis (> 0)' };
  }
  if (!base.name) {
    return { ok: false, error: 'name requis' };
  }

  const outcome = enrichComputed(base);
  const all = loadOutcomes();
  all.unshift(outcome);
  saveOutcomes(all.slice(0, 500));
  return { ok: true, outcome };
}

function updateOutcome(id, patch = {}) {
  const all = loadOutcomes();
  const idx = all.findIndex(o => o.id === id);
  if (idx < 0) return { ok: false, error: 'Outcome introuvable' };

  const prev = all[idx];
  const next = { ...prev };

  const allow = [
    'status', 'paid_face', 'buy_fee_pct', 'listed_price', 'sold_price', 'sell_fee_pct',
    'qty', 'notes', 'category', 'listed_at', 'sold_at', 'bought_at',
  ];
  for (const k of allow) {
    if (patch[k] !== undefined) next[k] = patch[k];
  }

  // Convenience: patching sold_price → status sold
  if (patch.sold_price != null && num(patch.sold_price) > 0) {
    next.status = 'sold';
    if (!next.sold_at) next.sold_at = new Date().toISOString();
  } else if (patch.listed_price != null && num(patch.listed_price) > 0 && next.status === 'bought') {
    next.status = 'listed';
    if (!next.listed_at) next.listed_at = new Date().toISOString();
  }

  if (patch.status === 'listed' && !next.listed_at) next.listed_at = new Date().toISOString();
  if (patch.status === 'sold' && !next.sold_at) next.sold_at = new Date().toISOString();

  next.updated_at = new Date().toISOString();
  const outcome = enrichComputed(next);
  all[idx] = outcome;
  saveOutcomes(all);
  return { ok: true, outcome };
}

function deleteOutcome(id) {
  const all = loadOutcomes();
  const next = all.filter(o => o.id !== id);
  if (next.length === all.length) return { ok: false, error: 'Outcome introuvable' };
  saveOutcomes(next);
  return { ok: true };
}

/**
 * Aggregate prediction quality + calibration factor for scoring.
 * factor < 1 → we historically overpredicted resale → dampen forecasts.
 */
function computeCalibration(outcomes = loadOutcomes()) {
  const sold = outcomes.filter(o =>
    o.status === 'sold' &&
    num(o.sold_price) > 0 &&
    num(o.forecast_resale_median) > 0
  );

  const errPcts = sold.map(o => (o.sold_price - o.forecast_resale_median) / o.forecast_resale_median);
  const absErr = errPcts.map(Math.abs);
  const bias = median(errPcts);
  const mae = median(absErr);

  const maxBuyHits = outcomes.filter(o =>
    num(o.paid_face) > 0 && num(o.recommended_max_buy) > 0
  );
  const underMaxBuy = maxBuyHits.filter(o => o.paid_face <= o.recommended_max_buy * 1.02).length;

  const wins = sold.filter(o => (o.profit_net || 0) > 0).length;
  const beatCons = sold.filter(o => o.beat_conservative).length;

  let factor = 1;
  if (sold.length >= 3 && bias != null) {
    // Partial correction toward observed bias
    factor = Math.max(0.72, Math.min(1.18, 1 + bias * 0.55));
  }

  return {
    n_total: outcomes.length,
    n_open: outcomes.filter(o => o.status === 'bought' || o.status === 'listed').length,
    n_sold: sold.length,
    win_rate: sold.length ? Math.round((wins / sold.length) * 100) : null,
    beat_conservative_rate: sold.length ? Math.round((beatCons / sold.length) * 100) : null,
    bias_pct: bias != null ? Math.round(bias * 100) : null,
    mae_pct: mae != null ? Math.round(mae * 100) : null,
    under_max_buy_rate: maxBuyHits.length
      ? Math.round((underMaxBuy / maxBuyHits.length) * 100)
      : null,
    avg_hold_days: (() => {
      const holds = sold.map(o => o.hold_days).filter(n => n != null);
      if (!holds.length) return null;
      return Math.round(holds.reduce((s, n) => s + n, 0) / holds.length);
    })(),
    avg_profit_net: sold.length
      ? Math.round(sold.reduce((s, o) => s + (o.profit_net || 0), 0) / sold.length)
      : null,
    factor: Math.round(factor * 1000) / 1000,
    ready: sold.length >= 3,
  };
}

function listOutcomes({ status, limit = 50 } = {}) {
  let rows = loadOutcomes().map(enrichComputed);
  if (status) rows = rows.filter(o => o.status === status);
  return rows.slice(0, Math.min(200, limit));
}

function getOutcomesPayload() {
  const outcomes = listOutcomes({ limit: 100 });
  const calibration = computeCalibration(outcomes);
  return {
    ok: true,
    outcomes,
    calibration,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  createOutcome,
  updateOutcome,
  deleteOutcome,
  listOutcomes,
  loadOutcomes,
  computeCalibration,
  getOutcomesPayload,
  enrichComputed,
  OUTCOMES_PATH,
  DEFAULT_BUY_FEE,
  DEFAULT_SELL_FEE,
};
