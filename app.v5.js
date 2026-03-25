/* ═══════════════════════════════════════════════════
   TicketRadar — app.js v5
   Architecture : config.js → app.js → index.html
   Backend      : /api/notify (Node.js Express)
   Telegram     : Backend (sécurisé) + fallback direct
═══════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════
   DATA
══════════════════════════════════════════════ */
const FALLBACK_EVENTS = CONFIG.FALLBACK_EVENTS;

const MARKETS = CONFIG.MARKETS.map(m => ({...m}));

const PLATFORMS = CONFIG.PLATFORMS;

const ALERTS = [
  {icon:'🔥',type:'gold',name:'Champions League Final Budapest',desc:'+2085% · Opportunité historique',time:'1h'},
  {icon:'📉',type:'red',name:'Tame Impala Madrid',desc:'−25% · Prix en chute — bon moment',time:'2h'},
  {icon:'⚡',type:'gold',name:'Aya Nakamura Stade de France',desc:'+136% · Ticketmaster FR',time:'4h'},
  {icon:'📉',type:'red',name:'F1 Abu Dhabi',desc:'−8% · Léger recul · surveiller',time:'5h'},
];

const FX = CONFIG.FX;

/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
const KANBAN_COLS = ['watch','bought','selling','sold'];
const KANBAN_LABELS_FR = {watch:'À surveiller',bought:'Acheté',selling:'En vente',sold:'Vendu'};
const KANBAN_LABELS_EN = {watch:'Watching',bought:'Bought',selling:'Selling',sold:'Sold'};

const S = {
  lang: localStorage.getItem('tr-lang') || 'fr',
  view: 'dashboard',
  cat: 'all', horizon: 'all',
  seuil: parseInt(localStorage.getItem('tr-seuil')) || 30,
  search: '', sortCol: 'marge', sortDir: -1,
  wl: JSON.parse(localStorage.getItem('tr-wl') || '["F1 Monaco","Tame Impala Madrid"]'),
  customEvents: JSON.parse(localStorage.getItem('tr-custom') || '[]'),
  kanban: JSON.parse(localStorage.getItem('tr-kanban') || '{"watch":[],"bought":[],"selling":[],"sold":[]}'),
  sheetUrl: localStorage.getItem('tr-sheet-url') || CONFIG.SHEET_URL || '',
  tgToken: localStorage.getItem('tr-tg-token') || '',
  tgChatId: localStorage.getItem('tr-tg-chatid') || '',
  apiUrl: localStorage.getItem('tr-api-url') || CONFIG.BACKEND_URL || '',
  compSearch: '', nextId: 300,
  sheetEvents: [], loadingSheet: false, sheetLoaded: false, sheetError: '',
  notifStatus: localStorage.getItem('tr-notif') || 'unknown',
  liveData: {}, charts: {},
};

// DOM manipulation moved to init() below

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
const allEvs = () => [...(S.sheetLoaded ? S.sheetEvents : FALLBACK_EVENTS), ...S.customEvents];
const sc = s => s >= 9 ? 'var(--green)' : s >= 8 ? 'var(--gold2)' : 'var(--t3)';
const mc = m => m >= 100 ? 'mb-hot' : m >= 50 ? 'mb-mid' : 'mb-low';
const hLabel = h => h === 'now' ? (S.lang==='fr'?'Imminent':'Imminent') : h === 'mid' ? (S.lang==='fr'?'Court terme':'Short-term') : (S.lang==='fr'?'Déc. 2026':'Dec. 2026');
const hClass = h => h === 'now' ? 'hn' : h === 'mid' ? 'hm' : 'hf';

// Prix drop detection
const hasDrop = e => e.prevResale && e.resale < e.prevResale;
const dropPct = e => e.prevResale ? Math.round(((e.resale - e.prevResale) / e.prevResale) * 100) : 0;

function toast(msg, icon='✓') {
  const el = document.getElementById('toast');
  document.getElementById('t-icon').textContent = icon;
  document.getElementById('t-msg').textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

function saveState() {
  localStorage.setItem('tr-lang', S.lang);
  localStorage.setItem('tr-seuil', S.seuil);
  localStorage.setItem('tr-wl', JSON.stringify(S.wl));
  localStorage.setItem('tr-custom', JSON.stringify(S.customEvents));
  localStorage.setItem('tr-kanban', JSON.stringify(S.kanban));
  localStorage.setItem('tr-sheet-url', S.sheetUrl);
  localStorage.setItem('tr-tg-token', S.tgToken);
  localStorage.setItem('tr-tg-chatid', S.tgChatId);
  localStorage.setItem('tr-api-url', S.apiUrl);
}

function filtered() {
  return allEvs().filter(e => {
    if (S.cat === 'custom') return e.custom === true;
    if (S.cat !== 'all' && e.cat !== S.cat) return false;
    if (S.horizon !== 'all' && e.h !== S.horizon) return false;
    if (e.marge < S.seuil) return false;
    if (S.search && !e.name.toLowerCase().includes(S.search.toLowerCase()) &&
        !(e.sub||'').toLowerCase().includes(S.search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => a[S.sortCol] < b[S.sortCol] ? S.sortDir : -S.sortDir);
}

function sortBy(col) {
  if (S.sortCol === col) S.sortDir *= -1;
  else { S.sortCol = col; S.sortDir = -1; }
  render();
}

function toggleStar(id) {
  const e = allEvs().find(x => x.id === id);
  if (e) { e.starred = !e.starred; saveState(); render(); }
}

/* ══════════════════════════════════════════════
   SHEET LOADER
══════════════════════════════════════════════ */
async function loadSheet() {
  if (!S.sheetUrl || S.sheetUrl === 'COLLE_ICI_L_URL_CSV_DE_TON_SHEET') {
    S.sheetLoaded = false;
    updateDataSourceInfo('not-configured');
    render();
    return;
  }
  S.loadingSheet = true;
  updateDataSourceInfo('loading');
  render();
  try {
    const res = await fetch(S.sheetUrl, { method: 'GET', cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rawText = await res.text();
    let events = [];
    const trimmed = rawText.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      const rows = JSON.parse(trimmed);
      const arr = Array.isArray(rows) ? rows : [rows];
      let nextId = 1000;
      events = arr.map(row => {
        const face = parseFloat(row.face) || 0;
        const resale = parseFloat(row.resale) || 0;
        const net = resale * 0.85;
        const marge = face > 0 ? Math.round(((net - face) / face) * 100) : 0;
        const score = parseFloat(row.score) || Math.min(Math.max(Math.round(marge/20+5),5),10);
        return {
          id: nextId++,
          name: String(row.name||''), sub: String(row.sub||''),
          date: String(row.date||''), h: String(row.horizon||row.h||'mid'),
          country: String(row.country||'FR'), flag: String(row.flag||'🎫'),
          cat: String(row.cat||'concert'), platform: String(row.platform||''),
          face, resale, marge, score,
          prevResale: resale, // Initialize prevResale same as resale
          starred: false, custom: false, live: false,
        };
      }).filter(e => e.name && e.face > 0);
    } else {
      events = parseSheetCSV(rawText);
    }
    if (!events.length) throw new Error('Sheet vide ou format incorrect');
    S.sheetEvents = events;
    S.sheetLoaded = true;
    S.sheetError = '';
    S.loadingSheet = false;
    updateDataSourceInfo('ok', events.length);
    if (S.apiUrl) await enrichWithLivePrices();
    toast(`✅ ${events.length} events chargés`, '📊');
    render();
  } catch (err) {
    S.sheetLoaded = false;
    S.sheetError = err.message;
    S.loadingSheet = false;
    updateDataSourceInfo('error', 0, err.message);
    toast('Erreur Sheet : ' + err.message, '⚠');
    render();
  }
}

function parseSheetCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = splitCSV(lines[0]).map(h => h.trim().replace(/"/g,'').toLowerCase());
  let nextId = 1000;
  return lines.slice(1).map(line => {
    const cols = splitCSV(line);
    const row = {};
    headers.forEach((h,i) => { row[h] = (cols[i]||'').replace(/"/g,'').trim(); });
    const face = parseFloat(row.face)||0;
    const resale = parseFloat(row.resale)||0;
    const net = resale*0.85;
    const marge = face > 0 ? Math.round(((net-face)/face)*100) : 0;
    const score = parseFloat(row.score)||Math.min(Math.max(Math.round(marge/20+5),5),10);
    return {
      id:nextId++, name:row.name||'', sub:row.sub||row.lieu||'',
      date:row.date||'', h:row.horizon||row.h||'mid',
      country:row.country||'FR', flag:row.flag||'🎫',
      cat:row.cat||row.category||'concert', platform:row.platform||'',
      face, resale, marge, score, prevResale:resale,
      starred:false, custom:false, live:false,
    };
  }).filter(e => e.name && e.face > 0);
}

function splitCSV(line) {
  const result = []; let current = ''; let inQ = false;
  for (const c of line) {
    if (c === '"') inQ = !inQ;
    else if (c === ',' && !inQ) { result.push(current); current = ''; }
    else current += c;
  }
  result.push(current);
  return result;
}

function updateDataSourceInfo(status, count=0, error='') {
  const el = document.getElementById('data-source-info');
  if (!el) return;
  const msgs = {
    'not-configured': '<span style="color:var(--gold2)">Non configuré<br>→ ⚙ Config</span>',
    'loading': '<span style="color:var(--blue)">⟳ Chargement...</span>',
    'ok': `<span style="color:var(--green)">✓ Connecté<br>${count} events</span>`,
    'error': `<span style="color:var(--red)">✕ ${error.slice(0,30)}</span>`,
  };
  el.innerHTML = msgs[status] || msgs['not-configured'];
}

/* ══════════════════════════════════════════════
   LIVE PRICES
══════════════════════════════════════════════ */
async function enrichWithLivePrices() {
  if (!S.apiUrl) return;
  try {
    const res = await fetch(S.apiUrl + '/prices');
    if (!res.ok) return;
    const data = await res.json();
    const prices = data.data || data;
    const evs = S.sheetLoaded ? S.sheetEvents : FALLBACK_EVENTS;
    for (const ev of evs) {
      const match = prices.find(p => {
        const key = p.event_key || '';
        return ev.name.toLowerCase().includes(key) || key.includes(ev.name.toLowerCase().split(' ')[0]);
      });
      if (match && match.resale_avg > 0) {
        ev.prevResale = ev.resale; // Store previous for drop detection
        ev.resale = match.resale_avg;
        const net = ev.resale * 0.85;
        ev.marge = ev.face > 0 ? Math.round(((net-ev.face)/ev.face)*100) : 0;
        ev.live = match.source === 'live';
      }
    }
    toast('Prix live mis à jour', '📡');
  } catch(err) { console.warn('Live prices error:', err); }
}

/* ══════════════════════════════════════════════
   TELEGRAM DIRECT
══════════════════════════════════════════════ */
async function sendTelegramDirect(events, seuil) {
  // Stratégie 1 : Backend Node.js (sécurisé — token côté serveur)
  const backendUrl = S.apiUrl || CONFIG.BACKEND_URL;
  if (backendUrl) {
    try {
      const res = await fetch(backendUrl + '/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: events.filter(e => e.marge >= seuil).slice(0, 5),
          drops:  events.filter(e => hasDrop(e) && dropPct(e) <= -5).slice(0, 2),
          seuil,
          chatId: S.tgChatId,  // Le token reste côté serveur
        })
      });
      if (res.ok) {
        const data = await res.json();
        return data.sent || 0;
      }
    } catch(e) {
      console.warn('[TG] Backend indisponible, fallback direct:', e.message);
    }
  }

  // Stratégie 2 : Direct depuis le navigateur (fallback si backend down)
  if (!S.tgToken || !S.tgChatId) return 0;
  let sent = 0;
  const hits = events.filter(e => e.marge >= seuil).sort((a,b) => b.marge-a.marge).slice(0,5);
  for (const ev of hits) {
    try {
      const msg = '🔥 TicketRadar v5\n\n' + (ev.flag||'🎫') + ' ' + ev.name +
        '\n💰 +' + ev.marge + '% · ' + ev.face + '€ → ' + ev.resale + '€' +
        '\n📅 ' + (ev.date||'') + ' · ' + (ev.platform||'') +
        '\n👉 https://fredericnjoh-lab.github.io/ticketradar/';
      const r = await fetch('https://api.telegram.org/bot' + S.tgToken + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: S.tgChatId, text: msg })
      });
      if ((await r.json()).ok) sent++;
    } catch(e) {}
  }
  return sent;
}

/* ══════════════════════════════════════════════
   NOTIFICATIONS
══════════════════════════════════════════════ */
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    if (reg.active) {
      reg.active.postMessage({
        type: 'CONFIG',
        payload: { sheetUrl:S.sheetUrl, seuil:S.seuil, tgToken:S.tgToken, tgChatId:S.tgChatId }
      });
    }
  } catch(err) { console.warn('[App] SW error:', err); }
}

async function requestNotifications() {
  if (!('Notification' in window)) { S.notifStatus='unsupported'; toast('Non supporté','⚠'); render(); return; }
  const perm = await Notification.requestPermission();
  S.notifStatus = perm;
  localStorage.setItem('tr-notif', perm);
  if (perm === 'granted') { await registerServiceWorker(); toast('Notifications activées !','🔔'); }
  else toast('Refusées — vérifie les paramètres','⚠');
  render();
}

function disableNotifications() {
  S.notifStatus = 'denied-by-user';
  localStorage.setItem('tr-notif', 'denied-by-user');
  toast('Notifications désactivées','🔕');
  render();
}

/* ══════════════════════════════════════════════
   LANG
══════════════════════════════════════════════ */
function setLang(l) {
  S.lang = l;
  document.getElementById('lb-fr').classList.toggle('active', l==='fr');
  document.getElementById('lb-en').classList.toggle('active', l==='en');
  saveState();
  applyLang();
  render();
}

function applyLang() {
  const fr = S.lang === 'fr';
  const navLabels = fr
    ? ['Dashboard','Événements','Kanban','📉 Chutes','+ Ajouter','ROI','Compare','Watchlist','⚙']
    : ['Dashboard','Events','Kanban','📉 Drops','+ Add','ROI','Compare','Watchlist','⚙'];
  ['dashboard','events','kanban','drops','add','roi','compare','watchlist','settings'].forEach((v,i) => {
    const el = document.getElementById('nav-'+v);
    if (el) el.textContent = navLabels[i];
  });
  document.getElementById('sb-mkt-lbl').textContent = fr ? 'MARCHÉS' : 'MARKETS';
  document.getElementById('sb-seuil-lbl').textContent = fr ? 'SEUIL ALERTE' : 'THRESHOLD';
  document.getElementById('sb-min-lbl').textContent = fr ? 'marge min.' : 'min. margin';
  renderMarkets();
}

function renderMarkets() {
  document.getElementById('mkt-list').innerHTML = MARKETS.map((m,i) => `
    <div class="sb-mkt ${m.on?'on':''}" onclick="toggleMkt(${i})">
      <span class="sb-mkt-label">${m.label}</span>
      <div class="tog ${m.on?'on':''}"></div>
    </div>`).join('');
}
function toggleMkt(i) { MARKETS[i].on = !MARKETS[i].on; renderMarkets(); }

function onSeuil(v) {
  S.seuil = +v;
  document.getElementById('seuil-val').textContent = '+' + v + '%';
  saveState();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(reg => {
      if (reg.active) reg.active.postMessage({type:'CONFIG', payload:{sheetUrl:S.sheetUrl, seuil:S.seuil, tgToken:S.tgToken, tgChatId:S.tgChatId}});
    });
  }
  render();
}

/* ══════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════ */
function updateMobileNav(v) {
  document.querySelectorAll('.mnav-item').forEach(b => b.classList.remove('active'));
  const active = document.getElementById('mn-'+v);
  if (active) active.classList.add('active');
  const backBtn = document.getElementById('back-btn');
  if (backBtn) backBtn.style.display = v !== 'dashboard' ? 'flex' : 'none';
}

function navBack() { nav('dashboard', document.getElementById('nav-dashboard')); updateMobileNav('dashboard'); }

function nav(v, el) {
  S.view = v;
  document.querySelectorAll('.npill').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  render();
}

/* ══════════════════════════════════════════════
   TABLE
══════════════════════════════════════════════ */
function buildTable(evs) {
  const fr = S.lang === 'fr';
  if (!evs.length) return `<div class="empty"><div class="empty-icon">◎</div><div class="empty-txt">${fr?'Aucun événement':'No events'}</div></div>`;
  const th = (col, label) => `<th onclick="sortBy('${col}')" class="${S.sortCol===col?'sorted':''}">${label}${S.sortCol===col?(S.sortDir<0?' ↓':' ↑'):''}</th>`;
  return `<div class="tbl-wrap"><table>
    <thead><tr>
      <th style="width:32px"></th>
      ${th('name',fr?'ÉVÉNEMENT':'EVENT')}
      <th>HORIZON</th><th>CAT.</th>
      ${th('face',fr?'FACE':'FACE')}
      ${th('resale','REVENTE')}
      ${th('marge','MARGE ↓')}
      ${th('score','SCORE')}
      <th>PLATEFORME</th>
      <th>ACTIONS</th>
    </tr></thead>
    <tbody>${evs.map(e => {
      const drop = hasDrop(e);
      const dpct = dropPct(e);
      return `<tr>
      <td><button class="star-btn ${e.starred?'on':''}" onclick="event.stopPropagation();toggleStar(${e.id})">${e.starred?'★':'☆'}</button></td>
      <td>
        <div class="ev-name">${e.flag||'🎫'} ${e.name}
          ${e.live?'<span class="live-badge">LIVE</span>':''}
          ${drop&&dpct<=-5?`<span class="drop-badge">📉 ${dpct}%</span>`:''}
        </div>
        <div class="ev-sub">${e.sub||''} · ${e.date}</div>
      </td>
      <td><span class="hdot ${hClass(e.h)}"></span><span style="font-size:10px;color:var(--t3)">${hLabel(e.h)}</span></td>
      <td><span class="cat-tag ct-${e.custom?'custom':e.cat}">${e.custom?'CUSTOM':e.cat.toUpperCase()}</span></td>
      <td class="mf">${e.face.toLocaleString()}€</td>
      <td class="mr" style="color:${drop&&dpct<=-5?'var(--red)':'var(--t1)'}">${e.resale.toLocaleString()}€${drop&&dpct<=-5?` <span style="font-size:9px;color:var(--red)">(${dpct}%)</span>`:''}</td>
      <td><span class="mb ${mc(e.marge)}">+${e.marge}%</span></td>
      <td><div style="display:flex;align-items:center;gap:6px"><span class="score-n" style="color:${sc(e.score)}">${e.score}</span><div class="score-bar"><div class="score-fill" style="width:${Math.round(e.score*10)}%;background:${sc(e.score)}"></div></div></div></td>
      <td><span class="plat-tag">${e.platform}</span></td>
      <td>
        <div style="display:flex;gap:4px;align-items:center">
          <button onclick="event.stopPropagation();openPlatform(${e.id})"
            style="background:var(--goldbg);border:1px solid var(--goldbdr);border-radius:4px;padding:3px 9px;font-size:9px;color:var(--gold2);cursor:pointer;font-family:var(--font-mono);white-space:nowrap;"
            title="${e.platform}">
            🛒 ${(e.platform||'Buy').split(' ')[0].split('/')[0].slice(0,8)}
          </button>
          <button onclick="event.stopPropagation();addToKanban(${e.id},'watch')"
            style="background:var(--bg4);border:1px solid var(--b3);border-radius:4px;padding:3px 7px;font-size:9px;color:var(--t2);cursor:pointer;font-family:var(--font-mono);"
            title="Add to Kanban">
            🗂
          </button>
          <button onclick="event.stopPropagation();copyEventSummary(${e.id})"
            style="background:var(--bg4);border:1px solid var(--b3);border-radius:4px;padding:3px 7px;font-size:9px;color:var(--t2);cursor:pointer;font-family:var(--font-mono);"
            title="Copy summary">
            📋
          </button>
        </div>
      </td>
    </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

/* ══════════════════════════════════════════════
   KANBAN
══════════════════════════════════════════════ */
function addToKanban(evId, col) {
  const ev = allEvs().find(e => e.id === evId);
  if (!ev) return;
  // Check not already in kanban
  const allKanbanIds = Object.values(S.kanban).flat().map(k => k.id);
  if (allKanbanIds.includes(evId)) { toast(S.lang==='fr'?'Déjà dans le Kanban':'Already in Kanban','ℹ'); return; }
  S.kanban[col].push({
    id: evId, name: ev.name, flag: ev.flag||'🎫',
    face: ev.face, resale: ev.resale, marge: ev.marge,
    platform: ev.platform, date: ev.date, cat: ev.cat,
    addedAt: new Date().toLocaleDateString('fr-FR'),
    notes: ''
  });
  saveState();
  toast(S.lang==='fr'?`"${ev.name}" ajouté au Kanban`:`"${ev.name}" added to Kanban`,'🗂️');
  render();
}

function moveKanban(evId, fromCol, toCol) {
  const idx = S.kanban[fromCol].findIndex(k => k.id === evId);
  if (idx === -1) return;
  const item = S.kanban[fromCol].splice(idx, 1)[0];
  if (toCol) S.kanban[toCol].push(item);
  saveState();
  render();
}

function updateKanbanResale(col, evId, newResale) {
  const item = S.kanban[col].find(k => k.id === evId);
  if (!item) return;
  const val = parseFloat(newResale) || 0;
  item.resale = val;
  const net = val * 0.85;
  item.marge = item.face > 0 ? Math.round(((net - item.face) / item.face) * 100) : 0;
  saveState();
  render();
  toast((S.lang==='fr'?'Prix de revente mis à jour : ':'Resale price updated: ') + val + '€', '✏');
}

function editKanbanPrice(evId, col) {
  const item = S.kanban[col].find(k => k.id === evId);
  if (!item) return;
  const newPrice = prompt(
    (S.lang==='fr' ? 'Nouveau prix de revente pour ' : 'New resale price for ') + item.name + ' (€)',
    item.resale
  );
  if (newPrice === null) return; // cancelled
  const price = parseFloat(newPrice);
  if (isNaN(price) || price <= 0) { toast(S.lang==='fr'?'Prix invalide':'Invalid price','⚠'); return; }
  item.resale = price;
  item.marge = item.face > 0 ? Math.round(((price*0.85 - item.face) / item.face) * 100) : 0;
  saveState();
  toast((S.lang==='fr'?'Prix mis à jour : ':'Price updated: ') + price + '€', '✓');
  render();
}

function editKanbanQty(evId, col) {
  const item = S.kanban[col].find(k => k.id === evId);
  if (!item) return;
  const newQty = prompt(
    (S.lang==='fr' ? 'Nombre de billets pour ' : 'Number of tickets for ') + item.name,
    item.qty || 1
  );
  if (newQty === null) return;
  const qty = parseInt(newQty);
  if (isNaN(qty) || qty <= 0) { toast(S.lang==='fr'?'Quantité invalide':'Invalid quantity','⚠'); return; }
  item.qty = qty;
  saveState();
  toast((S.lang==='fr'?'Quantité mise à jour : ':'Quantity updated: ') + qty, '✓');
  render();
}

function calcKanbanPnL() {
  const bought  = [...S.kanban.bought, ...S.kanban.selling, ...S.kanban.sold];
  const selling = S.kanban.selling;
  const sold    = S.kanban.sold;
  const totalInvested = bought.reduce((s,k)  => s + (k.face   * (k.qty||1)), 0);
  const expectedGain  = selling.reduce((s,k) => s + ((k.resale * 0.85 - k.face) * (k.qty||1)), 0);
  const realizedGain  = sold.reduce((s,k)    => s + ((k.soldPrice||k.resale) * 0.85 - k.face) * (k.qty||1), 0);
  const totalROI      = totalInvested > 0 ? Math.round(((expectedGain + realizedGain) / totalInvested) * 100) : 0;
  const totalItems    = Object.values(S.kanban).flat().length;
  return { totalInvested, expectedGain, realizedGain, totalROI, totalItems };
}

function renderKanban(c) {
  const fr = S.lang === 'fr';
  const labels   = fr ? KANBAN_LABELS_FR : KANBAN_LABELS_EN;
  const colors   = {watch:'var(--blue)',bought:'var(--gold)',selling:'var(--purple)',sold:'var(--green)'};
  const nextCol  = {watch:'bought',bought:'selling',selling:'sold',sold:null};
  const nextLbl  = fr
    ? {watch:'→ Acheté',bought:'→ En vente',selling:'→ Vendu',sold:null}
    : {watch:'→ Bought',bought:'→ Selling',selling:'→ Sold',sold:null};

  const pnl    = calcKanbanPnL();
  const roiCol = pnl.totalROI >= 50 ? 'var(--green)' : pnl.totalROI >= 0 ? 'var(--gold2)' : 'var(--red)';

  c.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <span class="card-title">&#x1F4B9; ${fr?'Tableau P&L':'P&L Dashboard'}</span>
        <span class="card-meta">${pnl.totalItems} ${fr?'tickets suivis':'tickets tracked'}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:16px 18px;">
        ${[
          {lbl:fr?'TOTAL INVESTI':'INVESTED', val:Math.round(pnl.totalInvested).toLocaleString()+'\u20ac', col:'var(--blue)', sub:fr?'billets achet\u00e9s':'bought'},
          {lbl:fr?'GAIN ESP\u00c9R\u00c9':'EXPECTED', val:(pnl.expectedGain>=0?'+':'')+Math.round(pnl.expectedGain).toLocaleString()+'\u20ac', col:'var(--purple)', sub:fr?'en vente':'selling'},
          {lbl:fr?'GAIN R\u00c9ALIS\u00c9':'REALIZED', val:(pnl.realizedGain>=0?'+':'')+Math.round(pnl.realizedGain).toLocaleString()+'\u20ac', col:'var(--green)', sub:fr?'vendus':'sold'},
          {lbl:'ROI GLOBAL', val:(pnl.totalROI>=0?'+':'')+pnl.totalROI+'%', col:roiCol, sub:fr?'rendement net':'net return'},
        ].map(k => `
          <div style="background:var(--bg3);border:1px solid var(--b3);border-radius:var(--r12);padding:14px;position:relative;overflow:hidden;">
            <div style="position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,${k.col},transparent)"></div>
            <div style="font-family:var(--font-mono);font-size:8.5px;color:var(--t3);letter-spacing:.1em;margin-bottom:8px">${k.lbl}</div>
            <div style="font-family:var(--font-head);font-size:24px;font-weight:800;color:${k.col}">${k.val}</div>
            <div style="font-size:9.5px;color:var(--t3);margin-top:4px">${k.sub}</div>
          </div>`).join('')}
      </div>
      ${pnl.totalInvested > 0 ? `
      <div style="padding:0 18px 16px">
        <div style="display:flex;justify-content:space-between;font-size:9.5px;font-family:var(--font-mono);color:var(--t3);margin-bottom:6px">
          <span>ROI progression</span>
          <span style="color:${roiCol}">${pnl.totalROI}%</span>
        </div>
        <div style="height:6px;background:var(--bg5);border-radius:3px;overflow:hidden">
          <div style="height:100%;border-radius:3px;background:${roiCol};width:${Math.min(Math.max(pnl.totalROI,0),100)}%;transition:width .4s"></div>
        </div>
      </div>` : `
      <div style="padding:10px 18px 14px;font-size:11px;color:var(--t3);font-family:var(--font-mono)">
        ${fr?'Ajoute des tickets achet\u00e9s pour voir ton P&L':'Add bought tickets to see your P&L'}
      </div>`}
    </div>

    <div class="card">
      <div class="card-head">
        <span class="card-title">&#x1F5C2;&#xFE0F; Kanban</span>
        <span class="card-meta">${fr?'Ajoute depuis \u00c9v\u00e9nements \u2192 bouton + Kanban':'Add from Events \u2192 + Kanban button'}</span>
      </div>
      <div class="kanban-board">
        ${KANBAN_COLS.map(col => {
          const colItems   = S.kanban[col];
          const colInvested = colItems.reduce((s,k) => s+(k.face*(k.qty||1)),0);
          const colGain    = colItems.reduce((s,k) => s+((k.resale*0.85-k.face)*(k.qty||1)),0);
          return `
          <div class="kanban-col">
            <div class="kanban-col-head">
              <span class="kanban-col-title" style="color:${colors[col]}">${labels[col].toUpperCase()}</span>
              <span class="kanban-count">${colItems.length}</span>
            </div>
            ${colItems.length > 0 ? `
            <div style="padding:6px 10px;border-bottom:1px solid var(--b3);display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:9px;color:var(--t3)">
              <span>${Math.round(colInvested)}\u20ac ${fr?'investi':'invested'}</span>
              <span style="color:${colGain>=0?'var(--green)':'var(--red)'}">${colGain>=0?'+':''}${Math.round(colGain)}\u20ac</span>
            </div>` : ''}
            <div class="kanban-cards">
              ${colItems.length === 0
                ? `<div class="kanban-empty">${fr?'Vide':'Empty'}</div>`
                : colItems.map(k => {
                  const netGain = Math.round((k.resale*0.85-k.face)*(k.qty||1));
                  const gainCol = netGain>=0?'var(--green)':'var(--red)';
                  return `
                  <div class="kanban-card kc-${col}">
                    <div class="kc-name">${k.flag||'\ud83c\udfab'} ${k.name}</div>
                    <div class="kc-meta">${k.date||''} \u00b7 ${k.platform||''}</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:8px">
                      <div style="background:var(--bg2);border-radius:4px;padding:5px 7px">
                        <div style="font-size:8px;color:var(--t4);font-family:var(--font-mono)">FACE</div>
                        <div style="font-size:12px;font-weight:600;font-family:var(--font-mono)">${k.face}\u20ac</div>
                      </div>
                      <div style="background:var(--bg2);border:1px solid var(--goldbdr);border-radius:4px;padding:5px 7px">
                        <div style="font-size:8px;color:var(--gold2);font-family:var(--font-mono)">REVENTE ✏</div>
                        <div style="display:flex;align-items:center;gap:3px">
                          <input
                            type="number"
                            value="${k.resale}"
                            min="0"
                            style="width:100%;background:transparent;border:none;outline:none;font-size:12px;font-weight:600;font-family:var(--font-mono);color:var(--t1);padding:0"
                            onchange="updateKanbanResale('${col}',${k.id},this.value)"
                            onclick="event.stopPropagation()"
                          >
                          <span style="font-size:10px;color:var(--t3)">€</span>
                        </div>
                      </div>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;padding:5px 7px;background:var(--bg2);border-radius:4px">
                      <span style="font-size:8.5px;color:var(--t3);font-family:var(--font-mono)">GAIN NET</span>
                      <span style="font-size:13px;font-weight:700;font-family:var(--font-mono);color:${gainCol}">${netGain>=0?'+':''}${netGain}\u20ac</span>
                    </div>
                    <div class="kc-actions" style="margin-top:8px">
                      <button class="kc-btn" onclick="openPlatform(${k.id})" style="color:var(--gold2);border-color:var(--goldbdr)">\ud83d\udecd</button>
                      ${nextCol[col] ? `<button class="kc-btn" onclick="moveKanban(${k.id},'${col}','${nextCol[col]}')">${nextLbl[col]}</button>` : ''}
                      <button class="kc-btn danger" onclick="moveKanban(${k.id},'${col}',null)">\u2715</button>
                    </div>
                  </div>`;
                }).join('')
              }
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}


/* ══════════════════════════════════════════════
   PRICE DROPS
══════════════════════════════════════════════ */
function renderDrops(c) {
  const fr = S.lang === 'fr';
  const evs = allEvs();
  const drops = evs.filter(e => hasDrop(e) && dropPct(e) < 0).sort((a,b) => dropPct(a) - dropPct(b));

  c.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <span class="card-title">📉 ${fr?'Chutes de prix détectées':'Price drops detected'}</span>
        <span class="card-meta">${drops.length} ${fr?'événements en baisse':'events dropping'}</span>
      </div>
      ${drops.length === 0
        ? `<div class="empty"><div class="empty-icon">📈</div><div class="empty-txt">${fr?'Aucune chute de prix détectée':'No price drops detected'}</div></div>`
        : drops.map(e => {
          const pct = dropPct(e);
          const isGoodBuy = pct <= -10;
          return `<div class="drop-row">
            <div class="drop-icon">${isGoodBuy?'🟢':'🟡'}</div>
            <div style="flex:1">
              <div class="drop-name">${e.flag||'🎫'} ${e.name}</div>
              <div class="drop-meta">${e.prevResale}€ → ${e.resale}€ · ${e.platform} · ${e.date||''}</div>
            </div>
            <div class="drop-pct">${pct}%</div>
            <div style="display:flex;gap:6px;flex-shrink:0">
              ${isGoodBuy ? `<button class="drop-action" onclick="openPlatform(${e.id})">${fr?'🛒 Acheter':'🛒 Buy'}</button>` : ''}
              <button class="drop-action" style="background:var(--goldbg);border-color:var(--goldbdr);color:var(--gold2)" onclick="addToKanban(${e.id},'watch')">🗂 Kanban</button>
            </div>
          </div>`;
        }).join('')
      }
    </div>
    <div class="card">
      <div class="card-head">
        <span class="card-title">📊 ${fr?'Résumé du marché':'Market summary'}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:16px 18px;">
        <div style="background:var(--bg3);border:1px solid var(--b3);border-radius:var(--r12);padding:14px;text-align:center;">
          <div style="font-family:var(--font-mono);font-size:9px;color:var(--t3);margin-bottom:8px">${fr?'EN BAISSE':'DROPPING'}</div>
          <div style="font-family:var(--font-head);font-size:28px;font-weight:800;color:var(--red)">${drops.filter(e=>dropPct(e)<=-5).length}</div>
          <div style="font-size:10px;color:var(--t3);margin-top:4px">${fr?'≥ -5%':'≥ -5%'}</div>
        </div>
        <div style="background:var(--bg3);border:1px solid var(--b3);border-radius:var(--r12);padding:14px;text-align:center;">
          <div style="font-family:var(--font-mono);font-size:9px;color:var(--t3);margin-bottom:8px">${fr?'BON MOMENT':'GOOD BUY'}</div>
          <div style="font-family:var(--font-head);font-size:28px;font-weight:800;color:var(--green)">${drops.filter(e=>dropPct(e)<=-10).length}</div>
          <div style="font-size:10px;color:var(--t3);margin-top:4px">${fr?'≥ -10%':'≥ -10%'}</div>
        </div>
        <div style="background:var(--bg3);border:1px solid var(--b3);border-radius:var(--r12);padding:14px;text-align:center;">
          <div style="font-family:var(--font-mono);font-size:9px;color:var(--t3);margin-bottom:8px">${fr?'STABLE':'STABLE'}</div>
          <div style="font-family:var(--font-head);font-size:28px;font-weight:800;color:var(--gold2)">${evs.filter(e=>!hasDrop(e)||dropPct(e)>-5).length}</div>
          <div style="font-size:10px;color:var(--t3);margin-top:4px">${fr?'events':'events'}</div>
        </div>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════
   RENDER DISPATCH
══════════════════════════════════════════════ */
function render() {
  // Status bar
  const dot = document.getElementById('status-dot');
  const lbl = document.getElementById('status-lbl');
  if (S.loadingSheet) { dot.style.background='var(--gold)'; lbl.textContent='chargement...'; }
  else if (S.sheetLoaded) { dot.style.background='var(--green)'; lbl.textContent='sheet ✓'; }
  else { dot.style.background='var(--t4)'; lbl.textContent='local'; }

  // TG sidebar
  const tgEl = document.getElementById('tg-sidebar');
  if (tgEl) tgEl.innerHTML = S.tgToken
    ? '<span style="color:var(--green)">✓ Configuré</span>'
    : '<span style="color:var(--t3)">Non configuré</span>';

  const c = document.getElementById('content');
  if (S.view === 'dashboard') renderDash(c);
  else if (S.view === 'events') renderEvents(c);
  else if (S.view === 'kanban') renderKanban(c);
  else if (S.view === 'drops') renderDrops(c);
  else if (S.view === 'add') renderAdd(c);
  else if (S.view === 'roi') renderROI(c);
  else if (S.view === 'compare') renderCompare(c);
  else if (S.view === 'watchlist') renderWatchlist(c);
  else if (S.view === 'settings') renderSettings(c);
}

/* ══════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════ */
function renderDash(c) {
  const all = allEvs();
  const fr = S.lang === 'fr';
  const hot = all.filter(e => e.marge >= 100).length;
  const avg = all.length ? Math.round(all.reduce((a,e)=>a+e.marge,0)/all.length) : 0;
  const topS = all.length ? all.reduce((a,e)=>e.score>a.score?e:a,all[0]).score : '—';
  const drops = all.filter(e => hasDrop(e) && dropPct(e) <= -5).length;

  c.innerHTML = `
    ${!S.sheetUrl||S.sheetUrl==='COLLE_ICI_L_URL_CSV_DE_TON_SHEET'?`<div class="banner banner-gold"><div class="banner-pulse"></div>Configure ton Google Sheet dans <span style="cursor:pointer;text-decoration:underline" onclick="nav('settings',document.getElementById('nav-settings'))">⚙ Config</span></div>`:''}
    ${S.sheetError&&!S.sheetLoaded?`<div class="banner banner-red">✕ Erreur Sheet : ${S.sheetError}</div>`:''}

    <div class="kpi-grid">
      <div class="kpi-card kc-gold">
        <div class="kpi-lbl">EVENTS TOTAL</div>
        <div class="kpi-val" style="color:var(--gold2)">${all.length}</div>
        <div class="kpi-sub">${fr?'toutes plateformes':'all platforms'}</div>
        <div class="kpi-badge kb-gold">${S.sheetLoaded?'📊 Sheet':'🗄 Local'}</div>
      </div>
      <div class="kpi-card kc-green">
        <div class="kpi-lbl">MARGE MOY.</div>
        <div class="kpi-val" style="color:var(--green)">+${avg}%</div>
        <div class="kpi-sub">${fr?'nette estimée':'net estimated'}</div>
      </div>
      <div class="kpi-card kc-gold">
        <div class="kpi-lbl">OPPS. ≥100%</div>
        <div class="kpi-val" style="color:var(--gold2)">${hot}</div>
        <div class="kpi-sub">${fr?'marge premium':'premium margin'}</div>
        <div class="kpi-badge kb-gold">🔥 hot</div>
      </div>
      <div class="kpi-card kc-red">
        <div class="kpi-lbl">CHUTES PRIX</div>
        <div class="kpi-val" style="color:var(--red)">${drops}</div>
        <div class="kpi-sub">${fr?'≥ -5% · acheter':'≥ -5% · buy now'}</div>
        ${drops>0?`<div class="kpi-badge kb-red">📉 ${fr?'opportunité':'opportunity'}</div>`:''}
      </div>
      <div class="kpi-card kc-blue">
        <div class="kpi-lbl">TOP SCORE</div>
        <div class="kpi-val" style="color:var(--blue)">${topS}</div>
        <div class="kpi-sub">/10</div>
      </div>
    </div>

    <div class="chart-grid">
      <div class="chart-card">
        <div class="chart-title">${fr?'Marge par catégorie':'Margin by category'}</div>
        <div class="chart-sub">${fr?'Marge nette moyenne estimée':'Average net estimated margin'}</div>
        <div style="position:relative;height:180px"><canvas id="ch-cat"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">${fr?'Répartition par horizon':'Distribution by horizon'}</div>
        <div class="legend">
          <div class="leg-item"><div class="leg-sq" style="background:var(--red)"></div>${fr?'Imminent':'Imminent'} (${all.filter(e=>e.h==='now').length})</div>
          <div class="leg-item"><div class="leg-sq" style="background:var(--gold)"></div>${fr?'Court terme':'Short-term'} (${all.filter(e=>e.h==='mid').length})</div>
          <div class="leg-item"><div class="leg-sq" style="background:var(--green)"></div>Déc. 2026 (${all.filter(e=>e.h==='far').length})</div>
        </div>
        <div style="position:relative;height:150px"><canvas id="ch-h"></canvas></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <span class="card-title">${fr?'Alertes récentes':'Recent alerts'}</span>
        <span class="card-meta">${fr?'auto · scan toutes les heures':'auto · hourly scan'}</span>
      </div>
      ${ALERTS.map(a => `<div class="alert-row">
        <div class="alert-icon ai-${a.type}">${a.icon}</div>
        <div style="flex:1">
          <div class="alert-name">${a.name}</div>
          <div class="alert-desc">${a.desc}</div>
        </div>
        <div class="alert-time">${a.time}</div>
      </div>`).join('')}
    </div>

    <div class="card">
      <div class="card-head">
        <span class="card-title">${fr?'Top opportunités':'Top opportunities'}</span>
        <span class="card-act" onclick="nav('events',document.getElementById('nav-events'))">${fr?'voir tout →':'all →'}</span>
      </div>
      ${buildTable(all.slice().sort((a,b)=>b.marge-a.marge).slice(0,5))}
    </div>`;

  setTimeout(() => {
    if (S.charts.cat) S.charts.cat.destroy();
    const cats = ['f1','concert','mma','sport'];
    S.charts.cat = new Chart(document.getElementById('ch-cat'), {
      type: 'bar',
      data: {
        labels: ['F1','Concert','MMA','Sport'],
        datasets: [{
          data: cats.map(cat => { const ev=all.filter(e=>e.cat===cat); return ev.length?Math.round(ev.reduce((a,e)=>a+e.marge,0)/ev.length):0; }),
          backgroundColor: ['#D4A843','#A78BFA','#FF5E5E','#2DD4A0'],
          borderRadius: 6, borderSkipped: false
        }]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:false}},
        scales:{
          x:{grid:{color:'rgba(240,237,232,0.04)'},ticks:{color:'#605A52',font:{size:10,family:'IBM Plex Mono'}}},
          y:{grid:{color:'rgba(240,237,232,0.04)'},ticks:{color:'#605A52',font:{size:10,family:'IBM Plex Mono'},callback:v=>'+'+v+'%'}}
        }
      }
    });
    if (S.charts.h) S.charts.h.destroy();
    S.charts.h = new Chart(document.getElementById('ch-h'), {
      type: 'doughnut',
      data: {
        labels:[fr?'Imminent':'Imminent',fr?'Court terme':'Short-term','Déc. 2026'],
        datasets:[{
          data:[all.filter(e=>e.h==='now').length,all.filter(e=>e.h==='mid').length,all.filter(e=>e.h==='far').length],
          backgroundColor:['#FF5E5E','#D4A843','#2DD4A0'],
          borderWidth:0, spacing:3
        }]
      },
      options:{responsive:true,maintainAspectRatio:false,cutout:'68%',plugins:{legend:{display:false}}}
    });
  }, 80);
}

/* ══════════════════════════════════════════════
   EVENTS
══════════════════════════════════════════════ */
function renderEvents(c) {
  const fr = S.lang === 'fr';
  const evs = filtered();
  const catL = {all:fr?'Tous':'All',f1:'F1 🏎️',concert:fr?'Concert':'Concert',mma:'MMA 🥊',sport:'Sport ⚽',custom:fr?'Custom':'Custom'};
  const hL = {all:fr?'Tout horizon':'All',now:'🔴 Imminent',mid:'🟠 Court terme',far:'🟢 Déc. 2026'};
  c.innerHTML = `<div class="card">
    <div class="card-head">
      <span class="card-title">${fr?'Événements':'Events'}</span>
      <span class="card-meta">${evs.length} · seuil +${S.seuil}%${S.sheetLoaded?' · 📊 Sheet':' · 🗄 local'}</span>
    </div>
    <div class="toolbar">
      ${Object.entries(catL).map(([k,v])=>`<button class="fchip ${S.cat===k?'on':''}" onclick="S.cat='${k}';render()">${v}</button>`).join('')}
      <div class="vsep"></div>
      ${Object.entries(hL).map(([k,v])=>`<button class="fchip ${S.horizon===k?'on':''}" onclick="S.horizon='${k}';render()">${v}</button>`).join('')}
      <div class="search-box">
        <span style="color:var(--t4)">⌕</span>
        <input placeholder="${fr?'Rechercher...':'Search...'}" value="${S.search}" oninput="S.search=this.value;render()">
      </div>
    </div>
    ${buildTable(evs)}
  </div>`;
}

/* ══════════════════════════════════════════════
   ADD EVENT
══════════════════════════════════════════════ */
function renderAdd(c) {
  const fr = S.lang === 'fr';
  c.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <span class="card-title">${fr?'Ajouter un événement':'Add an event'}</span>
        <span class="card-meta">${fr?'Stocké localement':'Stored locally'}</span>
      </div>
      <div class="form-grid">
        <div class="form-group full">
          <div class="form-label">${fr?'NOM DE L\'ÉVÉNEMENT *':'EVENT NAME *'}</div>
          <input class="form-input" id="f-name" placeholder="${fr?'ex: F1 Monaco, Coachella...':'e.g. F1 Monaco, Coachella...'}">
        </div>
        <div class="form-group"><div class="form-label">DATE</div><input class="form-input" id="f-date" placeholder="5-7 juin 2026"></div>
        <div class="form-group"><div class="form-label">${fr?'LIEU':'VENUE'}</div><input class="form-input" id="f-lieu" placeholder="${fr?'Accor Arena, Paris':'O2 Arena, London'}"></div>
        <div class="form-group">
          <div class="form-label">CATÉGORIE</div>
          <select class="form-select" id="f-cat">
            <option value="concert">Concert 🎤</option>
            <option value="f1">F1 🏎️</option>
            <option value="mma">MMA 🥊</option>
            <option value="sport">Sport ⚽</option>
          </select>
        </div>
        <div class="form-group">
          <div class="form-label">HORIZON</div>
          <select class="form-select" id="f-h">
            <option value="now">${fr?'Imminent':'Imminent'}</option>
            <option value="mid">${fr?'Court terme':'Short-term'}</option>
            <option value="far">Déc. 2026</option>
          </select>
        </div>
        <div class="form-group"><div class="form-label">FLAG</div><input class="form-input" id="f-flag" placeholder="🇫🇷" style="font-size:18px"></div>
        <div class="form-group">
          <div class="form-label">PLATEFORME</div>
          <select class="form-select" id="f-platform">
            <option>Ticketmaster FR</option><option>StubHub</option>
            <option>Viagogo</option><option>SeatGeek</option>
            <option>Fnac Spectacles</option><option>Autre</option>
          </select>
        </div>
        <div class="form-group">
          <div class="form-label">${fr?'PRIX FACE VALUE (€) *':'FACE VALUE (€) *'}</div>
          <input class="form-input" id="f-face" type="number" placeholder="70" oninput="calcPreview()">
        </div>
        <div class="form-group">
          <div class="form-label">${fr?'PRIX REVENTE (€) *':'RESALE PRICE (€) *'}</div>
          <input class="form-input" id="f-resale" type="number" placeholder="160" oninput="calcPreview()">
        </div>
        <div class="form-group">
          <div class="form-label">${fr?'NB. BILLETS':'TICKETS'}</div>
          <input class="form-input" id="f-qty" type="number" value="2" min="1" oninput="calcPreview()">
        </div>
        <div class="form-group full">
          <div class="form-label">NOTES</div>
          <input class="form-input" id="f-notes" placeholder="${fr?'Lien, infos...':'Link, notes...'}">
        </div>
      </div>
      <div class="form-preview" id="form-preview" style="font-family:var(--font-mono);font-size:11px">${fr?'Renseignez les prix pour la prévisualisation...':'Enter prices to preview...'}</div>
      <div class="form-actions">
        <button class="btn-ghost" onclick="resetForm()">${fr?'Réinitialiser':'Reset'}</button>
        <button class="btn-primary" onclick="saveEvent()">${fr?'Enregistrer':'Save'}</button>
      </div>
    </div>
    <div class="card">
      <div class="card-head">
        <span class="card-title">${fr?'Mes événements':'My events'}</span>
        <span class="card-meta">${S.customEvents.length}</span>
      </div>
      ${S.customEvents.length===0
        ? `<div class="empty"><div class="empty-icon">◎</div><div class="empty-txt">${fr?'Aucun event ajouté':'No events added'}</div></div>`
        : S.customEvents.map((e,i) => `<div class="cev-item">
          <div class="cev-dot" style="background:${mc(e.marge)==='mb-hot'?'var(--green)':mc(e.marge)==='mb-mid'?'var(--gold)':'var(--t4)'}"></div>
          <div style="flex:1">
            <div class="cev-name">${e.flag||'🎫'} ${e.name}</div>
            <div class="cev-meta">${e.date||'—'} · ${e.face}€ → ${e.resale}€ · +${e.marge}%</div>
          </div>
          <span class="mb ${mc(e.marge)}" style="margin-right:8px">+${e.marge}%</span>
          <button class="del-btn" onclick="deleteCustom(${i})">✕</button>
        </div>`).join('')
      }
    </div>`;
}

function calcPreview() {
  const face = parseFloat(document.getElementById('f-face')?.value)||0;
  const resale = parseFloat(document.getElementById('f-resale')?.value)||0;
  const qty = parseInt(document.getElementById('f-qty')?.value)||1;
  const el = document.getElementById('form-preview');
  if (!el||!face||!resale) return;
  const net = resale*.85;
  const marge = Math.round(((net-face)/face)*100);
  const gain = Math.round((net-face)*qty);
  const col = marge>=100?'var(--green)':marge>=50?'var(--gold2)':'var(--t3)';
  el.innerHTML = `Marge : <span style="color:${col};font-weight:600">+${marge}%</span> · Gain net ×${qty} : <span style="color:${col};font-weight:600">${gain>=0?'+':''}${gain}€</span> · Investi : ${face*qty}€`;
}

function saveEvent() {
  const name = document.getElementById('f-name').value.trim();
  const face = parseFloat(document.getElementById('f-face').value)||0;
  const resale = parseFloat(document.getElementById('f-resale').value)||0;
  if (!name||!face||!resale) { toast(S.lang==='fr'?'Renseignez nom, face et revente':'Enter name, face and resale','⚠'); return; }
  const net = resale*.85;
  const marge = Math.round(((net-face)/face)*100);
  S.customEvents.push({
    id:S.nextId++, name, sub:document.getElementById('f-lieu').value||'',
    date:document.getElementById('f-date').value||'',
    flag:document.getElementById('f-flag').value||'🎫',
    cat:document.getElementById('f-cat').value,
    h:document.getElementById('f-h').value,
    platform:document.getElementById('f-platform').value,
    face, resale, marge, prevResale:resale,
    score:Math.min(Math.max(Math.round(marge/20+5),5),10),
    qty:parseInt(document.getElementById('f-qty').value)||1,
    notes:document.getElementById('f-notes').value,
    starred:false, custom:true, live:false, country:'CUSTOM',
  });
  saveState();
  toast(S.lang==='fr'?'Event enregistré !':'Event saved!','✓');
  resetForm();
  render();
}

function resetForm() {
  ['f-name','f-date','f-lieu','f-flag','f-notes','f-face','f-resale'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const q=document.getElementById('f-qty'); if(q) q.value='2';
  const p=document.getElementById('form-preview'); if(p) p.textContent=S.lang==='fr'?'Renseignez les prix pour la prévisualisation...':'Enter prices to preview...';
}

function deleteCustom(i) { S.customEvents.splice(i,1); saveState(); render(); }

/* ══════════════════════════════════════════════
   ROI
══════════════════════════════════════════════ */
function renderROI(c) {
  const fr = S.lang === 'fr';
  const fields = fr
    ? ['Prix achat / billet','Prix revente estimé','Frais plateforme','Nb. de billets','Coût transport','Autres frais']
    : ['Purchase price / ticket','Est. resale price','Platform fees','No. of tickets','Transport cost','Other costs'];
  const units = ['€','€','%',fr?'billets':'tickets','€','€'];
  c.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <span class="card-title">${fr?'Calculateur ROI':'ROI Calculator'}</span>
        <span class="card-meta">${fr?'Simulation complète':'Full simulation'}</span>
      </div>
      <div class="roi-grid">
        <div class="roi-fields">
          ${fields.map((f,i)=>`<div class="roi-field">
            <span class="roi-lbl">${f}</span>
            <input class="roi-inp" id="ri-${i}" type="number" value="${[70,160,15,2,0,0][i]}" min="0" oninput="calcROI()">
            <span class="roi-unit">${units[i]}</span>
          </div>`).join('')}
        </div>
        <div class="roi-result" id="roi-res"></div>
      </div>
    </div>
    <div class="card">
      <div class="card-head">
        <span class="card-title">${fr?'Convertisseur de devises':'Currency converter'}</span>
        <span class="card-meta">${fr?'Taux indicatifs':'Indicative rates'}</span>
      </div>
      <div class="curr-grid">
        <div class="curr-card"><div class="curr-pair">EUR → USD</div><div class="curr-rate" style="color:var(--green)">$${FX.EUR_USD}</div></div>
        <div class="curr-card"><div class="curr-pair">EUR → GBP</div><div class="curr-rate" style="color:var(--blue)">£${FX.EUR_GBP}</div></div>
        <div class="curr-card"><div class="curr-pair">USD → EUR</div><div class="curr-rate" style="color:var(--gold2)">€${FX.USD_EUR}</div></div>
        <div class="curr-card"><div class="curr-pair">USD → GBP</div><div class="curr-rate" style="color:var(--blue)">£${FX.USD_GBP}</div></div>
        <div class="curr-card"><div class="curr-pair">GBP → EUR</div><div class="curr-rate" style="color:var(--gold2)">€${FX.GBP_EUR}</div></div>
        <div class="curr-card"><div class="curr-pair">GBP → USD</div><div class="curr-rate" style="color:var(--green)">$${FX.GBP_USD}</div></div>
      </div>
      <div class="curr-conv-row">
        <span style="font-size:11px;color:var(--t3)">${fr?'Convertir :':'Convert:'}</span>
        <input class="curr-inp" id="curr-amt" type="number" value="100" oninput="calcCurr()">
        <select class="form-select" id="curr-from" oninput="calcCurr()" style="width:90px;padding:6px 10px">
          <option value="EUR">€ EUR</option>
          <option value="USD">$ USD</option>
          <option value="GBP">£ GBP</option>
        </select>
        <span style="color:var(--t3)">=</span>
        <div class="curr-results" id="curr-res" style="display:flex;gap:8px"></div>
      </div>
    </div>`;
  calcROI();
  calcCurr();
}

function calcROI() {
  const fr = S.lang === 'fr';
  const face = parseFloat(document.getElementById('ri-0')?.value)||0;
  const resale = parseFloat(document.getElementById('ri-1')?.value)||0;
  const fees = parseFloat(document.getElementById('ri-2')?.value)||15;
  const qty = parseInt(document.getElementById('ri-3')?.value)||1;
  const transport = parseFloat(document.getElementById('ri-4')?.value)||0;
  const other = parseFloat(document.getElementById('ri-5')?.value)||0;
  const el = document.getElementById('roi-res'); if (!el) return;
  const net = resale*(1-fees/100);
  const grossGain = (net-face)*qty;
  const invest = (face*qty)+transport+other;
  const netGain = grossGain-transport-other;
  const roi = invest>0 ? Math.round((netGain/invest)*100) : 0;
  const breakeven = qty>0 ? Math.round(invest/qty) : 0;
  const margeNet = face>0 ? Math.round(((net-face)/face)*100) : 0;
  const col = roi>=100?'var(--green)':roi>=50?'var(--gold2)':roi<0?'var(--red)':'var(--t3)';
  const lbl = fr
    ? ['Investi total','Gain brut','Gain net','Marge nette','Break-even/billet']
    : ['Total invested','Gross gain','Net gain','Net margin','Break-even/ticket'];
  el.innerHTML = `
    <div class="roi-big" style="color:${col}">${roi>=0?'+':''}${roi}%</div>
    <div class="roi-sublbl">${fr?'ROI NET TOTAL':'TOTAL NET ROI'}</div>
    <div class="roi-bar"><div class="roi-bar-fill" style="width:${Math.min(Math.max(roi,0)/2,100)}%;background:${col}"></div></div>
    <div class="roi-stats">
      <div class="roi-stat"><div class="roi-stat-lbl">${lbl[0]}</div><div class="roi-stat-val">${Math.round(invest)}€</div></div>
      <div class="roi-stat"><div class="roi-stat-lbl">${lbl[1]}</div><div class="roi-stat-val" style="color:${grossGain>=0?'var(--green)':'var(--red)'}">${grossGain>=0?'+':''}${Math.round(grossGain)}€</div></div>
      <div class="roi-stat"><div class="roi-stat-lbl">${lbl[2]}</div><div class="roi-stat-val" style="color:${col}">${netGain>=0?'+':''}${Math.round(netGain)}€</div></div>
      <div class="roi-stat"><div class="roi-stat-lbl">${lbl[3]}</div><div class="roi-stat-val" style="color:${col}">${margeNet>=0?'+':''}${margeNet}%</div></div>
    </div>
    <div class="roi-stat"><div class="roi-stat-lbl">${lbl[4]}</div><div class="roi-stat-val">${breakeven}€</div></div>
    ${roi<0?`<div style="margin-top:8px;font-size:10px;color:var(--red);font-family:var(--font-mono)">⚠ ROI négatif</div>`:''}
    ${roi>=100?`<div style="margin-top:8px;font-size:10px;color:var(--green);font-family:var(--font-mono)">✓ Excellente rentabilité</div>`:''}`;
}

function calcCurr() {
  const amt = parseFloat(document.getElementById('curr-amt')?.value)||0;
  const from = document.getElementById('curr-from')?.value||'EUR';
  const el = document.getElementById('curr-res'); if (!el) return;
  const pairs = from==='EUR'?[['USD','$',FX.EUR_USD],['GBP','£',FX.EUR_GBP]]:from==='USD'?[['EUR','€',FX.USD_EUR],['GBP','£',FX.USD_GBP]]:[['EUR','€',FX.GBP_EUR],['USD','$',FX.GBP_USD]];
  el.innerHTML = pairs.map(([to,sym,rate]) => `<div class="curr-res-item"><strong>${sym}${(amt*rate).toFixed(2)}</strong> <span style="font-size:9px;color:var(--t3)">${to}</span></div>`).join('');
}

/* ══════════════════════════════════════════════
   COMPARE
══════════════════════════════════════════════ */
function renderCompare(c) {
  const fr = S.lang === 'fr';
  const fp = S.compSearch ? PLATFORMS.filter(p=>p.coverage.toLowerCase().includes(S.compSearch.toLowerCase())||p.name.toLowerCase().includes(S.compSearch.toLowerCase())) : PLATFORMS;
  const flds = fr ? ['Frais vendeur','Liquidité','Paiement','Garantie'] : ['Seller fees','Liquidity','Payment','Guarantee'];
  c.innerHTML = `<div class="card">
    <div class="card-head">
      <span class="card-title">${fr?'Comparateur plateformes':'Platform comparator'}</span>
      <span class="card-meta">${PLATFORMS.length} plateformes</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;padding:12px 18px;border-bottom:1px solid var(--b3)">
      <span style="color:var(--t4)">⌕</span>
      <input style="flex:1;background:var(--bg3);border:1px solid var(--b3);border-radius:var(--r8);padding:8px 12px;color:var(--t1);font-size:12px;outline:none" placeholder="${fr?'Filtrer...':'Filter...'}" value="${S.compSearch}" oninput="S.compSearch=this.value;renderCompare(document.getElementById('content'))">
    </div>
    <div class="comp-grid">
      ${fp.map(p => {
        const feeCol = p.fees<=10?'var(--green)':p.fees<=12?'var(--gold2)':'var(--red)';
        const barColors = [feeCol,'var(--blue)','var(--gold2)','var(--green)'];
        const vals = [p.fees+'%',p.liquidity+'/100',p.speed+'/100',p.guarantee+'%'];
        const pcts = [100-p.fees,p.liquidity,p.speed,p.guarantee];
        return `<div class="comp-card">
          <div class="comp-card-head">
            <div class="plat-logo" style="background:${p.color}">${p.logo}</div>
            <div>
              <div class="comp-plat-name">${p.name}</div>
              <div class="comp-plat-sub">${p.region}</div>
            </div>
            <div class="comp-badge" style="background:${p.liquidity>=90?'var(--greenbg)':'var(--bg5)'};color:${p.liquidity>=90?'var(--green)':'var(--t3)'};border:1px solid ${p.liquidity>=90?'var(--greenbdr)':'var(--b3)'}">
              ${p.liquidity>=90?'TOP':'OK'}
            </div>
          </div>
          <div class="comp-rows">
            ${flds.map((lbl,i) => `<div class="comp-row">
              <span class="comp-row-lbl">${lbl}</span>
              <div class="comp-row-bar"><div class="comp-row-fill" style="width:${pcts[i]}%;background:${barColors[i]}"></div></div>
              <span class="comp-row-val" style="color:${i===0?feeCol:'var(--t1)'}">${vals[i]}</span>
            </div>`).join('')}
          </div>
          <div style="padding:4px 16px 6px;font-size:9.5px;color:var(--t3);font-family:var(--font-mono)">${fr?'Pour':'Best for'}: <span style="color:var(--t2)">${p.coverage}</span></div>
          <div class="comp-pros-cons">
            <div class="comp-pros">
              <div class="comp-pc-lbl g">${fr?'AVANTAGES':'PROS'}</div>
              ${p.pros.map(x=>`<div class="comp-pc-item">· ${x}</div>`).join('')}
            </div>
            <div class="comp-cons">
              <div class="comp-pc-lbl r">${fr?'INCONVÉNIENTS':'CONS'}</div>
              ${p.cons.map(x=>`<div class="comp-pc-item">· ${x}</div>`).join('')}
            </div>
          </div>
          <div class="comp-footer">${fr?'Frais indicatifs · vérifiez les CGU':'Indicative fees · check T&Cs'}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

/* ══════════════════════════════════════════════
   WATCHLIST
══════════════════════════════════════════════ */
function renderWatchlist(c) {
  const fr = S.lang === 'fr';
  const all = allEvs();
  c.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <span class="card-title">Watchlist</span>
        <span class="card-meta">${S.wl.length} events</span>
      </div>
      <div class="wl-inp-row">
        <input class="wl-inp" id="wl-inp" placeholder="${fr?'Ajouter un event...':'Add an event...'}" onkeydown="if(event.key==='Enter')addWl()">
        <button class="wl-add-btn" onclick="addWl()">+ ${fr?'Ajouter':'Add'}</button>
      </div>
      ${S.wl.length===0
        ? `<div class="empty"><div class="empty-icon">◎</div><div class="empty-txt">${fr?'Watchlist vide':'Empty watchlist'}</div></div>`
        : S.wl.map((w,i) => {
          const m = all.find(e => e.name.toLowerCase().includes(w.toLowerCase().split(' ')[0]));
          return `<div class="wl-item">
            <div class="wl-dot" style="background:${m?sc(m.score):'var(--t4)'}"></div>
            <div style="flex:1">
              <div class="wl-name">${w}</div>
              ${m?`<div class="wl-meta">${m.flag||'🎫'} ${m.date} · +${m.marge}% · ${m.platform}${m.live?' · 📡':''}</div>`:'<div class="wl-meta">—</div>'}
            </div>
            ${m?`<span class="mb ${mc(m.marge)}" style="margin-right:8px">+${m.marge}%</span>`:''}
            <button class="wl-del" onclick="S.wl.splice(${i},1);saveState();render()">✕</button>
          </div>`;
        }).join('')
      }
    </div>
    <div class="card">
      <div class="card-head">
        <span class="card-title">Favoris ★</span>
      </div>
      ${buildTable(all.filter(e=>e.starred))}
    </div>`;
}

function addWl() {
  const v = document.getElementById('wl-inp').value.trim();
  if (v && !S.wl.includes(v)) { S.wl.push(v); saveState(); toast('"'+v+'" ajouté à la watchlist','★'); }
  render();
}

/* ══════════════════════════════════════════════
   SETTINGS
══════════════════════════════════════════════ */
function renderSettings(c) {
  const fr = S.lang === 'fr';
  const notifGranted = S.notifStatus === 'granted';
  c.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <span class="card-title">📊 Google Sheet</span>
        <span class="card-meta">${fr?'Source des données':'Data source'}</span>
      </div>
      ${S.sheetLoaded?`<div class="banner banner-green" style="margin:14px 18px"><div class="banner-pulse"></div>${S.sheetEvents.length} events chargés ✓</div>`:S.sheetError?`<div class="banner banner-red" style="margin:14px 18px">✕ ${S.sheetError}</div>`:`<div class="banner banner-gold" style="margin:14px 18px"><div class="banner-pulse"></div>Non configuré</div>`}
      <div class="settings-grid">
        <div class="setting-group full">
          <div class="setting-label">URL APPS SCRIPT OU CSV</div>
          <input class="setting-input" id="sheet-url-input" placeholder="https://script.google.com/macros/s/.../exec" value="${S.sheetUrl!=='COLLE_ICI_L_URL_CSV_DE_TON_SHEET'?S.sheetUrl:''}">
          <div class="setting-desc">${fr?'Google Apps Script (recommandé) ou URL CSV publié':'Google Apps Script (recommended) or published CSV URL'}</div>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn-ghost" onclick="loadSheet()">🔄 ${fr?'Recharger':'Reload'}</button>
        <button class="btn-save" onclick="saveSheetUrl()">${fr?'Sauvegarder & charger':'Save & load'}</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <span class="card-title">📱 Bot Telegram</span>
        <span class="card-meta">${fr?'Alertes instantanées':'Instant alerts'}</span>
      </div>
      ${S.tgToken?`<div class="banner banner-green" style="margin:14px 18px"><div class="banner-pulse"></div>${fr?'Bot configuré ✓':'Bot configured ✓'}</div>`:`<div class="banner banner-gold" style="margin:14px 18px"><div class="banner-pulse"></div>${fr?'Non configuré':'Not configured'}</div>`}
      <div class="settings-grid">
        <div class="setting-group full">
          <div class="setting-label">TELEGRAM BOT TOKEN</div>
          <input class="setting-input" id="tg-token-input" type="password" placeholder="1234567890:AAGxxx..." value="${S.tgToken}">
        </div>
        <div class="setting-group full">
          <div class="setting-label">TELEGRAM CHAT ID</div>
          <input class="setting-input" id="tg-chatid-input" placeholder="1077939423" value="${S.tgChatId}">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn-ghost" onclick="testTgDirect()">📱 ${fr?'Tester':'Test'}</button>
        <button class="btn-save" onclick="saveTgConfig()">${fr?'Sauvegarder':'Save'}</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <span class="card-title">📡 API prix live</span>
        <span class="card-meta">Render</span>
      </div>
      <div class="settings-grid">
        <div class="setting-group full">
          <div class="setting-label">URL API RENDER</div>
          <input class="setting-input" id="api-url-input" placeholder="https://ticketradar-api.onrender.com" value="${S.apiUrl}">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn-save" onclick="saveApiUrl()">${fr?'Sauvegarder':'Save'}</button>
        ${S.apiUrl?`<button class="btn-ghost" onclick="testApi()">🧪 Test</button>`:''}
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <span class="card-title">🔔 Push notifications</span>
        <span class="card-meta">${fr?'Navigateur':'Browser'}</span>
      </div>
      <div class="notif-status">
        <div class="notif-icon ${notifGranted?'ni-ok':'ni-off'}">${notifGranted?'🔔':'🔕'}</div>
        <div style="flex:1">
          <div class="notif-name">${notifGranted?(fr?'Activées':'Enabled'):(fr?'Non activées':'Not enabled')}</div>
          <div class="notif-sub">${notifGranted?(fr?`Seuil +${S.seuil}% · scan auto hourly`:`Threshold +${S.seuil}%`):(fr?'Clique pour activer':'Click to enable')}</div>
        </div>
        ${!notifGranted?`<button class="btn-notif btn-notif-on" onclick="requestNotifications()">🔔 ${fr?'Activer':'Enable'}</button>`:''}
        ${notifGranted?`<button class="btn-notif btn-notif-off" onclick="disableNotifications()">🔕</button>`:''}
      </div>
    </div>`;
}

function saveTgConfig() {
  const t = document.getElementById('tg-token-input')?.value.trim();
  const c = document.getElementById('tg-chatid-input')?.value.trim();
  if (t) S.tgToken = t;
  if (c) S.tgChatId = c;
  saveState();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(reg => {
      if (reg.active) reg.active.postMessage({type:'CONFIG',payload:{sheetUrl:S.sheetUrl,seuil:S.seuil,tgToken:S.tgToken,tgChatId:S.tgChatId}});
    });
  }
  toast(S.lang==='fr'?'Telegram sauvegardé ✓ — Auto-scan actif !':'Telegram saved ✓ — Auto-scan active!','📱');
}

async function testTgDirect() {
  const token = document.getElementById('tg-token-input')?.value.trim()||S.tgToken;
  const chatid = document.getElementById('tg-chatid-input')?.value.trim()||S.tgChatId;
  if (!token||!chatid) { toast('Renseigne token et chat ID','⚠'); return; }
  try {
    const r = await fetch('https://api.telegram.org/bot'+token+'/sendMessage', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chat_id:chatid, text:'🧪 TicketRadar v5 — Test OK ! 🎫'})
    });
    const d = await r.json();
    if (d.ok) toast('✓ Message Telegram reçu !','📱');
    else toast('Erreur : '+d.description,'⚠');
  } catch(e) { toast('Erreur : '+e.message,'⚠'); }
}

function saveSheetUrl() {
  const input = document.getElementById('sheet-url-input');
  if (input) { S.sheetUrl = input.value.trim(); saveState(); loadSheet(); }
}

function saveApiUrl() {
  const input = document.getElementById('api-url-input');
  if (input) { S.apiUrl = input.value.trim(); saveState(); toast(S.lang==='fr'?'API sauvegardée':'API saved','✓'); render(); }
}

async function testApi() {
  if (!S.apiUrl) return;
  try {
    const res = await fetch(S.apiUrl+'/health');
    const d = await res.json();
    toast('API OK — '+d.status,'✓');
  } catch(e) { toast('API non joignable','✕'); }
}

/* ══════════════════════════════════════════════
   SCAN
══════════════════════════════════════════════ */
/* ══════════════════════════════════════════════
   PLATFORM LINKS
══════════════════════════════════════════════ */
function getPlatformUrl(ev) {
  const name = (ev.name || '').replace(/–|—|-/g, ' ').replace(/\s+/g,' ').trim();
  const q = encodeURIComponent(name);
  const platform = (ev.platform || '').toLowerCase();
  if (platform.includes('viagogo'))      return 'https://www.viagogo.com/ww/Search?q=' + q;
  if (platform.includes('seatgeek'))     return 'https://seatgeek.com/search?q=' + q;
  if (platform.includes('ticketmaster') && platform.includes('fr')) return 'https://www.ticketmaster.fr/recherche?q=' + q;
  if (platform.includes('ticketmaster')) return 'https://www.ticketmaster.com/search?q=' + q;
  if (platform.includes('fnac'))         return 'https://www.fnacspectacles.com/search?query=' + q;
  if (platform.includes('ticketswap'))   return 'https://www.ticketswap.fr/search#' + q;
  if (platform.includes('stubhub') && platform.includes('uk')) return 'https://www.stubhub.co.uk/search?q=' + q;
  return 'https://www.stubhub.com/search?q=' + q;
}

function openPlatform(evId) {
  // Prevent double calls
  if (window._openPlatformLock) return;
  window._openPlatformLock = true;
  setTimeout(() => { window._openPlatformLock = false; }, 500);
  
  const ev = allEvs().find(e => e.id === evId);
  if (!ev) return;
  const url = getPlatformUrl(ev);
  // Only take the first URL if somehow concatenated
  const firstUrl = url.indexOf('https://', 8) > 0
    ? url.substring(0, url.indexOf('https://', 8))
    : url;
  window.open(firstUrl, '_blank', 'noopener,noreferrer');
}

function copyEventSummary(evId) {
  const ev = allEvs().find(e => e.id === evId);
  if (!ev) return;
  const txt = `${ev.flag||'🎫'} ${ev.name} · +${ev.marge}% · ${ev.face}€→${ev.resale}€ · ${ev.platform} · ${ev.date||''}`;
  navigator.clipboard.writeText(txt).then(() => toast(S.lang==='fr'?'Copié !':'Copied!', '📋'));
}

async function runScan() {
  const btn=document.getElementById('scan-btn'),lbl=document.getElementById('scan-lbl'),ic=document.getElementById('scan-ic');
  btn.classList.add('loading');
  lbl.textContent = S.lang==='fr'?'Scan...':'Scanning...';
  const frames=['⟳','↻','⟲']; let i=0;
  const anim = setInterval(()=>{ic.textContent=frames[i++%3];},300);
  await loadSheet();
  if (S.apiUrl) await enrichWithLivePrices();
  const tgSent = await sendTelegramDirect(allEvs(), S.seuil);
  clearInterval(anim);
  btn.classList.remove('loading');
  lbl.textContent = S.lang==='fr'?'Scanner':'Scan now';
  ic.textContent = '⟳';
  const opp = filtered().length;
  toast((S.lang==='fr'?'Scan terminé — ':'Scan done — ')+opp+(S.lang==='fr'?' opportunités':' opportunities')+(tgSent>0?` · 📱 ${tgSent} alertes`:''),'✓');
  render();
}

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
/* ── Init ── */
function init() {
  // Init DOM elements
  const seuilEl = document.getElementById('seuil');
  const seuilVal = document.getElementById('seuil-val');
  if (seuilEl) seuilEl.value = S.seuil;
  if (seuilVal) seuilVal.textContent = '+' + S.seuil + '%';

  if (S.notifStatus === 'granted') registerServiceWorker();
  renderMarkets();
  applyLang();
  render();
  loadSheet();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* ── Expose functions globally for onclick handlers ── */
window.nav              = nav;
window.navBack          = navBack;
window.setLang          = setLang;
window.runScan          = runScan;
window.onSeuil          = onSeuil;
window.toggleMkt        = toggleMkt;
window.toggleStar       = toggleStar;
window.sortBy           = sortBy;
window.addToKanban      = addToKanban;
window.moveKanban       = moveKanban;
window.openPlatform     = openPlatform;
window.copyEventSummary = copyEventSummary;
window.updateKanbanResale = updateKanbanResale;
window.addWl            = addWl;
window.saveEvent        = saveEvent;
window.resetForm        = resetForm;
window.deleteCustom     = deleteCustom;
window.calcPreview      = calcPreview;
window.calcROI          = calcROI;
window.calcCurr         = calcCurr;
window.saveSheetUrl     = saveSheetUrl;
window.saveApiUrl       = saveApiUrl;
window.testApi          = testApi;
window.saveTgConfig     = saveTgConfig;
window.testTgDirect     = testTgDirect;
window.loadSheet        = loadSheet;
window.requestNotifications = requestNotifications;
window.disableNotifications = disableNotifications;
window.updateMobileNav  = updateMobileNav;
window.renderCompare    = renderCompare;