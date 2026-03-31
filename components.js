/* ═══════════════════════════════════════════════════
   TicketRadar — components.js
   Mini design system : fonctions pures → HTML string
   Importer APRÈS app.vX.js (dépend de S, allEvs, etc.)
═══════════════════════════════════════════════════ */

/* ══ TOKENS (miroir CSS, pour usage JS) ══════════ */
const T = {
  teal:   '#2DD4A0', teal2: '#1DB37E',
  gold:   '#D4A843', gold2: '#E8BF6A',
  red:    '#FF5E5E',
  blue:   '#5BA4F5',
  purple: '#A78BFA',
  t1: '#E6EDF3', t2: '#8B949E', t3: '#484F58',
  bg2: '#0E1117', bg3: '#13181F', bg4: '#1C2333',
  b1: 'rgba(255,255,255,.06)',
};

/* ══ ATOMS ══════════════════════════════════════ */

/**
 * Badge coloré
 * @param {string} text
 * @param {'teal'|'gold'|'red'|'blue'|'purple'|'gray'} color
 */
function Badge(text, color = 'gray') {
  const map = {
    teal:   `background:rgba(45,212,160,.10);color:${T.teal};border:1px solid rgba(45,212,160,.22)`,
    gold:   `background:rgba(212,168,67,.10);color:${T.gold2};border:1px solid rgba(212,168,67,.22)`,
    red:    `background:rgba(255,94,94,.10);color:${T.red};border:1px solid rgba(255,94,94,.22)`,
    blue:   `background:rgba(91,164,245,.10);color:${T.blue};border:1px solid rgba(91,164,245,.22)`,
    purple: `background:rgba(167,139,250,.10);color:${T.purple};border:1px solid rgba(167,139,250,.22)`,
    gray:   `background:var(--v6-bg4);color:${T.t2};border:1px solid var(--v6-b1)`,
  };
  return `<span style="display:inline-flex;align-items:center;font-size:9px;font-weight:700;font-family:var(--font-mono);padding:2px 8px;border-radius:4px;${map[color]||map.gray}">${text}</span>`;
}

/**
 * Signal badge depuis un signal object {signal, icon}
 */
function SignalBadge(sig) {
  if (!sig) return '';
  const colorMap = {
    'ACHETER MAINTENANT': 'teal', 'BUY NOW': 'teal',
    'VENDRE MAINTENANT': 'red',   'SELL NOW': 'red',
    'VENDRE BIENTÔT': 'gold',     'SELL SOON': 'gold',
    'ATTENDRE': 'blue',           'WAIT': 'blue',
    'SURVEILLER': 'gray',         'WATCH': 'gray',
  };
  const color = colorMap[sig.signal] || 'gray';
  return Badge(`${sig.icon || ''} ${sig.signal}`, color);
}

/**
 * KPI Card (dashboard)
 * @param {string} label
 * @param {string|number} value
 * @param {string} sub     — sous-titre
 * @param {string} badge   — texte du badge
 * @param {'teal'|'gold'|'red'|'purple'} color
 */
function KpiCard(label, value, sub, badge, color = 'teal') {
  const accentColor = T[color] || T.teal;
  return `
  <div class="c-kpi-card">
    <div class="c-kpi-accent" style="background:${accentColor}"></div>
    <div class="c-kpi-lbl">${label}</div>
    <div class="c-kpi-val" style="color:${accentColor}">${value}</div>
    <div class="c-kpi-sub">${sub}</div>
    ${badge ? Badge(badge, color) : ''}
  </div>`;
}

/**
 * Event card (trending / liste)
 * @param {object} ev       — event object
 * @param {object|null} sig — signal object
 */
function EventCard(ev, sig = null) {
  const catGrad = {
    f1:      'linear-gradient(135deg,#0D2535 0%,#1A4060 100%)',
    concert: 'linear-gradient(135deg,#1A0D35 0%,#2D1060 100%)',
    sport:   'linear-gradient(135deg,#0D1A10 0%,#0F3020 100%)',
    mma:     'linear-gradient(135deg,#2A0D0D 0%,#401010 100%)',
  };
  const bg = catGrad[ev.cat] || 'linear-gradient(135deg,#111827 0%,#1C2130 100%)';

  const margeColor = ev.marge >= 150 ? T.teal : ev.marge >= 80 ? T.gold2 : ev.marge >= 40 ? T.purple : T.blue;
  const predScore  = Math.min(99, Math.round(50 + ev.marge * 0.18 + (ev.score || 7) * 2.5));

  const sentiment =
    ev.marge >= 200 ? 'HYPE: VERY HIGH' :
    ev.marge >= 100 ? 'HYPE: HIGH' :
    ev.marge >= 50  ? 'SENTIMENT: RISING' : 'SENTIMENT: STABLE';

  const evEnc = encodeURIComponent(JSON.stringify({
    name: ev.name, marge: ev.marge, score: ev.score || 8,
    date: ev.date || '', flag: ev.flag || '', cat: ev.cat || ''
  }));

  return `
  <div class="c-ev-card" onclick="S.selectedEvent=${JSON.stringify(ev).replace(/"/g,'&quot;')};nav('events',document.getElementById('nav-events'))">
    <div class="c-ev-thumb" style="background:${bg}">
      <div class="c-ev-score">
        <div class="c-ev-score-lbl">SCORE</div>
        <div class="c-ev-score-val">${ev.score || 8}</div>
      </div>
      <div class="c-ev-pred">PREDICTIVE ${predScore}</div>
      <div class="c-ev-marge">
        <div class="c-ev-marge-lbl">MARGE</div>
        <div class="c-ev-marge-val" style="color:${margeColor}">+${ev.marge}%</div>
      </div>
    </div>
    <div class="c-ev-body">
      <div class="c-ev-name">${ev.flag || '🎫'} ${ev.name}</div>
      <div class="c-ev-meta">${ev.platform || ''} · ${ev.date || ''}</div>
      <div class="c-ev-badges">
        ${SignalBadge(sig)}
        ${Badge(sentiment, 'gray')}
      </div>
    </div>
  </div>`;
}

/**
 * Alert pill (strip horizontale)
 */
function AlertPill(a) {
  return `
  <div class="c-alert-pill">
    <div class="c-alert-dot" style="background:${a.dot}"></div>
    <span class="c-alert-text">${a.text}</span>
    <span class="c-alert-time">${a.time}</span>
  </div>`;
}

/**
 * Section header (titre + sous-titre + lien optionnel)
 */
function SectionHeader(title, sub = '', link = '', linkLabel = '') {
  return `
  <div class="c-section-head">
    <div>
      <div class="c-section-title">${title}</div>
      ${sub ? `<div class="c-section-sub">${sub}</div>` : ''}
    </div>
    ${link ? `<div class="c-section-link" onclick="${link}">${linkLabel} →</div>` : ''}
  </div>`;
}

/**
 * P&L Snapshot card (pour le dashboard)
 */
function PLSnapshotCard(kanban) {
  let invested = 0, market = 0, profit = 0;
  (kanban.bought   || []).forEach(k => { invested += (k.face || 0); market += (k.resale || 0); });
  (kanban.selling  || []).forEach(k => { invested += (k.face || 0); market += (k.resale || 0); });
  (kanban.sold     || []).forEach(k => { profit   += ((k.resale || 0) - (k.face || 0)); });
  const latent = market - invested;
  const latentColor = latent >= 0 ? T.teal : T.red;
  return `
  <div class="c-pl-card">
    <div class="c-pl-title">P&L Snapshot</div>
    <div class="c-pl-row">
      <span class="c-pl-lbl">Investi</span>
      <span class="c-pl-val">${invested > 0 ? invested + ' €' : '—'}</span>
    </div>
    <div class="c-pl-row">
      <span class="c-pl-lbl">Valeur marché</span>
      <span class="c-pl-val">${market > 0 ? market + ' €' : '—'}</span>
    </div>
    <div class="c-pl-row">
      <span class="c-pl-lbl">Profit latent</span>
      <span class="c-pl-val" style="color:${latentColor};font-weight:700">${latent >= 0 ? '+' : ''}${latent} €</span>
    </div>
    <div class="c-pl-divider"></div>
    <div class="c-pl-row">
      <span class="c-pl-lbl">Réalisé</span>
      <span class="c-pl-val" style="color:${profit >= 0 ? T.teal : T.red};font-weight:700">${profit >= 0 ? '+' : ''}${profit} €</span>
    </div>
  </div>`;
}

/* ══ EXPORTS ══════════════════════════════════ */
window.Badge          = Badge;
window.SignalBadge    = SignalBadge;
window.KpiCard        = KpiCard;
window.EventCard      = EventCard;
window.AlertPill      = AlertPill;
window.SectionHeader  = SectionHeader;
window.PLSnapshotCard = PLSnapshotCard;
