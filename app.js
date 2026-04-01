/* ═══════════════════════════════════════════════════
   TicketRadar — app.js (clean build)
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

const FX = {...CONFIG.FX}; // Mis à jour live

async function fetchLiveFX() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/EUR');
    if (!res.ok) return;
    const data = await res.json();
    if (data.result !== 'success') return;
    const r = data.rates;
    FX.EUR_USD = r.USD ? Math.round(r.USD * 1000) / 1000 : FX.EUR_USD;
    FX.EUR_GBP = r.GBP ? Math.round(r.GBP * 1000) / 1000 : FX.EUR_GBP;
    FX.USD_EUR = r.USD ? Math.round((1/r.USD) * 1000) / 1000 : FX.USD_EUR;
    FX.USD_GBP = (r.GBP && r.USD) ? Math.round((r.GBP/r.USD) * 1000) / 1000 : FX.USD_GBP;
    FX.GBP_EUR = r.GBP ? Math.round((1/r.GBP) * 1000) / 1000 : FX.GBP_EUR;
    FX.GBP_USD = (r.USD && r.GBP) ? Math.round((r.USD/r.GBP) * 1000) / 1000 : FX.GBP_USD;
    FX._updated = new Date().toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'});
    console.log('[FX] Taux mis à jour:', FX);
    // Refresh ROI view if active
    if (S.view === 'roi') render();
  } catch(e) { console.warn('[FX] API indisponible, taux statiques utilisés'); }
}

/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
const KANBAN_COLS = ['watch','bought','selling','sold'];
const KANBAN_LABELS_FR = {watch:'À surveiller',bought:'Acheté',selling:'En vente',sold:'Vendu'};
const KANBAN_LABELS_EN = {watch:'Watching',bought:'Bought',selling:'Selling',sold:'Sold'};

const S = {
  lang: localStorage.getItem('tr-lang') || 'fr',
  view: 'dash',
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
  compSearch: '', nextId: 300, _discoveredEvents: [], _upcoming: [], theme: localStorage.getItem('tr-theme') || 'dark',
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
  if (!el) return;
  el.innerHTML = '<span>' + (icon||'✓') + '</span> ' + msg;
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
  // Sync profile to Supabase
  const user = window.currentUser;
  if (user && typeof sbUpdateProfile === 'function') {
    sbUpdateProfile(user.id, {
      seuil: S.seuil, lang: S.lang, theme: S.theme,
      sheet_url: S.sheetUrl, tg_chat_id: S.tgChatId,
    }).catch(e => console.warn('[Supabase] Profile sync:', e.message));
  }
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
  let e = S.sheetEvents.find(x => x.id === id)
       || S.customEvents.find(x => x.id === id)
       || FALLBACK_EVENTS.find(x => x.id === id);
  if (!e) return;
  e.starred = !e.starred;
  const starred = JSON.parse(localStorage.getItem('tr-starred') || '[]');
  if (e.starred) { if (!starred.includes(id)) starred.push(id); }
  else { const i = starred.indexOf(id); if (i > -1) starred.splice(i,1); }
  localStorage.setItem('tr-starred', JSON.stringify(starred));
  saveState();
  render();
  toast(e.starred ? '★ Ajouté aux favoris' : '☆ Retiré des favoris', e.starred ? '★' : '☆');
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
          prevResale: resale,
          presale_date: String(row.presale_date || row.presaledate || ''),
          presale_code: String(row.presale_code || row.presalecode || '').toUpperCase(),
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
    savePriceSnapshot(events);
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
      presale_date: row.presale_date || row.presaledate || '',
      presale_code: (row.presale_code || row.presalecode || '').toUpperCase(),
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
  // Legacy wrapper — now calls scanLiveData
  await scanLiveData();
}

/**
 * Scanner principal — appelle /api/scan sur le backend
 * Merge les résultats live avec les events du Sheet
 */
async function scanLiveData(query = '', seuil = 0) {
  const backendUrl = S.apiUrl || CONFIG.BACKEND_URL;
  if (!backendUrl) {
    console.warn('[Scan] Pas de backend URL configurée');
    return 0;
  }
  try {
    const params = new URLSearchParams({
      seuil:  seuil || S.seuil || 0,
      limit:  50,
      source: 'all',
      sheet:  'false', // on gère le sheet côté frontend
    });
    if (query) params.set('q', query);

    console.log('[Scan] Appel /api/scan...');
    const res = await fetch(`${backendUrl}/api/scan?${params}`, { timeout: 20000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const liveEvents = data.events || [];
    if (!liveEvents.length) return 0;

    console.log(`[Scan] ${liveEvents.length} events live reçus (${data.sources?.seatgeek||0} SG + ${data.sources?.ticketmaster||0} TM)`);

    // Merge : enrichir les events sheet existants + ajouter les nouveaux
    const existingNames = new Set((S.sheetLoaded ? S.sheetEvents : FALLBACK_EVENTS).map(e => e.name.toLowerCase().slice(0,20)));

    let updated = 0;
    let added = 0;

    for (const live of liveEvents) {
      const evList = S.sheetLoaded ? S.sheetEvents : FALLBACK_EVENTS;
      const match  = evList.find(e => {
        const a = e.name.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,15);
        const b = live.name.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,15);
        return a === b || a.includes(b.slice(0,10)) || b.includes(a.slice(0,10));
      });

      if (match) {
        // Update existing event with live prices
        match.prevResale = match.resale;
        if (live.resale > 0) match.resale = live.resale;
        if (live.face   > 0 && match.face === 0) match.face = live.face;
        const net = match.resale * 0.85;
        match.marge  = match.face > 0 ? Math.round(((net - match.face) / match.face) * 100) : 0;
        match.live   = true;
        match.source = live.source;
        updated++;
      } else if (((live.face > 0 && live.marge > 0) || live.discovered === true) && !existingNames.has(live.name.toLowerCase().slice(0,20))) {
        // Add new event discovered via API
        const newEv = {
          ...live,
          sub:      live.city || '',
          horizon:  'mid',
          live:     true,
        };
        if (S.sheetLoaded) S.sheetEvents.push(newEv);
        existingNames.add(live.name.toLowerCase().slice(0,20));
        added++;
      }
    }

    // Save snapshot for price history
    savePriceSnapshot(allEvs());

    const msg = `📡 ${updated} mis à jour · ${added} nouveaux · ${data.elapsed_ms||0}ms`;
    toast(msg, '⚡');
    console.log('[Scan]', msg);
    return updated + added;

  } catch (err) {
    console.warn('[Scan] Erreur:', err.message);
    toast('Scan API indisponible — données locales', '⚠');
    return 0;
  }
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
  document.getElementById('lang-fr').classList.toggle('active', l==='fr');
  document.getElementById('lang-en').classList.toggle('active', l==='en');
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
  (document.getElementById('sb-mkt-lbl')||{}).textContent = fr ? 'MARCHÉS' : 'MARKETS';
  (document.getElementById('sb-seuil-lbl')||{}).textContent = fr ? 'SEUIL ALERTE' : 'THRESHOLD';
  (document.getElementById('sb-min-lbl')||{}).textContent = fr ? 'marge min.' : 'min. margin';
  if(document.getElementById('mkt-list')) renderMarkets();
}

function renderMarkets() { const el = document.getElementById('mkt-list'); if (!el) return; }

function toggleMkt(i) { MARKETS[i].on = !MARKETS[i].on; if(document.getElementById('mkt-list')) renderMarkets(); }

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
  document.querySelectorAll('.npill, .sb-item').forEach(n => n.classList.remove('active', 'on'));
  if (el) { el.classList.add('active'); el.classList.add('on'); }
  render();
}

function updateTopbarKpis() {
  const all = allEvs();
  const tbScans = document.getElementById('tb-scans');
  const tbOpps  = document.getElementById('tb-opps');
  const tbRoi   = document.getElementById('tb-roi');
  const sbUname = document.getElementById('sb-uname');
  const sbStatus = document.getElementById('sb-status');
  const sbAvatar = document.getElementById('sb-avatar');
  if (tbScans) tbScans.textContent = all.length;
  if (tbOpps)  tbOpps.textContent  = all.filter(e => e.marge >= 100).length;
  if (tbRoi)   tbRoi.textContent   = '+' + (all.length ? Math.round(all.reduce((a,e)=>a+e.marge,0)/all.length) : 0) + '%';
  const user = window.currentUser;
  if (sbUname)  sbUname.textContent  = user ? (user.email?.split('@')[0] || 'user') : 'Non connecté';
  if (sbStatus) { sbStatus.textContent = user ? '● connecté' : '● offline'; sbStatus.style.color = user ? 'var(--teal)' : 'var(--t4)'; }
  if (sbAvatar) sbAvatar.textContent = user ? (user.email?.slice(0,1).toUpperCase() || '?') : '?';
  // Update sidebar user info
  const emailSb = document.getElementById('user-email-sb');
  if (emailSb && user) emailSb.textContent = (user.email||'').split('@')[0];
}

/* ══════════════════════════════════════════════
   TABLE
══════════════════════════════════════════════ */

function buildMobileCards(evs) {
  const fr = S.lang === 'fr';
  if (!evs.length) return `<div class="empty"><div class="empty-icon">◎</div><div class="empty-txt">${fr?'Aucun événement':'No events'}</div></div>`;
  return `<div class="mobile-cards-container" style="display:none">
    ${evs.map(e => {
      const drop = hasDrop(e);
      const dpct = dropPct(e);
      const margeClass = e.marge >= 100 ? 'mec-hot' : e.marge >= 50 ? 'mec-mid' : 'mec-low';
      const margeCol = e.marge >= 100 ? 'var(--green)' : e.marge >= 50 ? 'var(--gold2)' : 'var(--blue)';
      return `
      <div class="mobile-ev-card ${margeClass}">
        <div class="mec-head">
          <div>
            <div class="mec-name">${e.flag||'🎫'} ${e.name}</div>
            <div class="mec-sub">${e.sub||''} · ${e.date||''}</div>
          </div>
          <div class="mec-marge" style="color:${e.discovered && !e.marge ? 'var(--t3)' : margeCol}">${e.discovered && !e.marge ? '—' : '+'+e.marge+'%'}</div>
        </div>
        ${e.discovered ? '<div class="mec-row"><span class="mec-pill" style="color:#2DD4A0;border-color:rgba(45,212,160,.22)">DÉCOUVERT</span></div>' : ''}
        <div class="mec-row">
          <span class="mec-pill">${e.discovered && !e.face ? 'Prix TBD' : 'Face: '+e.face+'€'}</span>
          <span class="mec-pill">${e.discovered && !e.resale ? 'Prix TBD' : 'Revente: '+e.resale+'€'}</span>
          ${e.live ? '<span class="mec-pill" style="color:var(--green);border-color:var(--greenbdr)">📡 Live</span>' : ''}
          ${drop && dpct <= -5 ? `<span class="mec-pill" style="color:var(--red);border-color:var(--redbdr)">📉 ${dpct}%</span>` : ''}
        </div>
        <div class="mec-row">
          <span class="mec-pill">${e.platform||'—'}</span>
          <span class="cat-tag ct-${e.cat}">${e.cat.toUpperCase()}</span>
        </div>
        <div class="mec-actions">
          <button class="mec-btn mec-buy" onclick="openPlatform(${e.id})">🛒 ${fr?'Acheter':'Buy'}</button>
          <button class="mec-btn mec-kanban" onclick="addToKanban(${e.id},'watch')">🗂</button>
          <button class="mec-btn mec-star ${e.starred?'on':''}" onclick="toggleStar(${e.id})">${e.starred?'★':'☆'}</button>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

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
          ${e.discovered?'<span style="display:inline-flex;align-items:center;font-size:8px;font-weight:700;font-family:var(--font-mono);padding:1px 6px;border-radius:3px;background:rgba(45,212,160,.10);color:#2DD4A0;border:1px solid rgba(45,212,160,.22);margin-left:4px">DÉCOUVERT</span>':''}
          ${drop&&dpct<=-5?`<span class="drop-badge">📉 ${dpct}%</span>`:''}
        </div>
        <div class="ev-sub">${e.sub||''} · ${e.date}</div>
      </td>
      <td><span class="hdot ${hClass(e.h)}"></span><span style="font-size:10px;color:var(--t3)">${hLabel(e.h)}</span></td>
      <td><span class="cat-tag ct-${e.custom?'custom':e.cat}">${e.custom?'CUSTOM':e.cat.toUpperCase()}</span></td>
      <td class="mf">${e.discovered && !e.face ? '<span style="color:var(--t3);font-style:italic">Prix TBD</span>' : e.face.toLocaleString()+'€'}</td>
      <td class="mr" style="color:${drop&&dpct<=-5?'var(--red)':'var(--t1)'}">${e.discovered && !e.resale ? '<span style="color:var(--t3);font-style:italic">Prix TBD</span>' : e.resale.toLocaleString()+'€'}${drop&&dpct<=-5?` <span style="font-size:9px;color:var(--red)">(${dpct}%)</span>`:''}</td>
      <td>${e.discovered && !e.marge ? '<span style="color:var(--t3);font-style:italic">—</span>' : `<span class="mb ${mc(e.marge)}">+${e.marge}%</span>`}</td>
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
  // Haptic feedback on mobile
  if (navigator.vibrate) navigator.vibrate(10);
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
  updateTopbarKpis();
  // Status bar
  const dot = document.getElementById('status-dot');
  const lbl = document.getElementById('status-lbl');
  if (S.loadingSheet) { if(dot) dot.style.background='var(--gold)'; if(lbl) lbl.textContent='chargement...'; }
  else if (S.sheetLoaded) { if(dot) dot.style.background='var(--teal)'; if(lbl) lbl.textContent='sheet ✓'; }
  else { if(dot) dot.style.background='var(--t4)'; if(lbl) lbl.textContent='local'; }

  // TG sidebar
  const tgEl = document.getElementById('tg-sidebar');
  if (tgEl) tgEl.innerHTML = S.tgToken
    ? '<span style="color:var(--green)">✓ Configuré</span>'
    : '<span style="color:var(--t3)">Non configuré</span>';

  const c = document.getElementById('content');
  if (S.view === 'dashboard' || S.view === 'dash') renderDash(c);
  else if (S.view === 'events') renderEvents(c);
  else if (S.view === 'kanban') renderKanban(c);
  else if (S.view === 'drops') renderDrops(c);
  else if (S.view === 'add') renderAdd(c);
  else if (S.view === 'roi') renderROI(c);
  else if (S.view === 'compare') renderCompare(c);
  else if (S.view === 'watchlist') renderWatchlist(c);
  else if (S.view === 'history') renderPriceHistory(c);
  else if (S.view === 'ai') renderAIPredictor(c);
  else if (S.view === 'presale') renderPresaleTracker(c);
  else if (S.view === 'discover') renderDiscover(c);
  else if (S.view === 'map') renderMap(c);
  else if (S.view === 'settings') renderSettings(c);
}

/* ══════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════ */
function renderDash(c) {
  const all  = allEvs();
  const fr   = S.lang === 'fr';
  const hot  = all.filter(e => e.marge >= 100).length;
  const avg  = all.length ? Math.round(all.reduce((a,e) => a+e.marge,0) / all.length) : 0;
  const drops = all.filter(e => hasDrop(e) && dropPct(e) <= -5).length;
  const upcoming = all.filter(e => { const ps = getPresaleStatus(e); return ps && ps.days >= 0 && ps.days <= 7; }).length;
  const trending  = [...all].filter(e => !e.discovered).sort((a,b) => b.marge - a.marge).slice(0,4);

  /* ── Alerts ── */
  const alerts = [
    ...all.filter(e => { const ps=getPresaleStatus(e); return ps && ps.days>=0 && ps.days<=3; })
      .map(e => ({ dot:T.gold, text:`Presale ${e.flag||''} ${e.name.slice(0,22)} · J-${getPresaleStatus(e).days}`, time:'Urgent' })),
    ...all.filter(e => hasDrop(e) && dropPct(e)<=-5).slice(0,2)
      .map(e => ({ dot:T.red, text:`Chute ${e.flag||''} ${e.name.slice(0,20)} ${dropPct(e)}%`, time:'Récent' })),
    ...all.filter(e => e.marge>=150).slice(0,3)
      .map(e => ({ dot:T.teal, text:`Opportunité ${e.flag||''} ${e.name.slice(0,20)} +${e.marge}%`, time:'Live' })),
  ].slice(0,6);

  /* ── Signals ── */
  const getSig = (ev) => {
    const history = getPriceHistory();
    const key = Object.keys(history).find(k => k.slice(0,20) === ev.name.slice(0,20));
    return getSignal(ev, key ? history[key].snapshots : null);
  };

  /* ── AI suggestions ── */
  const suggestions = fr
    ? ['Presale AMEX cette semaine ?','Meilleur moment vendre F1 Monaco ?','Top 3 signal ACHETER','Impact annulation sur prix ?']
    : ['AMEX presale this week?','Best time sell F1 Monaco?','Top 3 BUY signals','Cancellation price impact?'];

  c.innerHTML = `
  <!-- ── ROW 0 : PAGE TITLE ── -->
  <div class="c-page-head">
    <div>
      <div class="c-page-eyebrow">${fr ? 'TABLEAU DE BORD' : 'DASHBOARD'}</div>
      <div class="c-page-title">Predictive Intelligence <span style="color:var(--v6-teal)">Hybrid</span></div>
    </div>
  </div>

  <!-- ── ROW 1 : KPI CARDS ── -->
  <div class="c-kpi-grid">
    ${KpiCard(fr ? 'SCANS LIVE' : 'LIVE SCANS', all.length, fr ? 'events actifs' : 'active events', '● live', 'teal')}
    ${KpiCard(fr ? 'OPPORTUNITÉS' : 'OPPORTUNITIES', hot, 'marge > 100%', 'premium', 'gold')}
    ${KpiCard('AVG ROI · IA', '+' + avg + '%', fr ? 'marge nette est.' : 'est. net margin', '↑ ' + (fr ? 'prédictif' : 'predictive'), 'purple')}
    ${KpiCard('ALERTS', alerts.length || drops, 'presales + ' + (fr ? 'chutes' : 'drops'), upcoming + ' presales J-7', 'red')}
  </div>

  <!-- ── ROW 2 : PREDICTIVE INTELLIGENCE BLOC ── -->
  <div class="c-intel-bloc">
    <div class="c-intel-left">
      <div class="c-intel-eyebrow">AI · MARKET INTELLIGENCE</div>
      <div class="c-ai-bar">
        <div class="c-ai-bar-icon">AI</div>
        <input id="ai-dash-input"
          placeholder="${fr ? 'Posez une question : quel impact si Ferrari annonce X ?' : 'Ask TR AI: What impact if Ferrari announces X?'}"
          onkeydown="if(event.key==='Enter')runDashAI()">
        <button class="c-ai-bar-btn" onclick="runDashAI()">${fr ? 'Analyser →' : 'Analyze →'}</button>
      </div>
      <div class="c-ai-chips">
        ${suggestions.map(s => `<div class="c-ai-chip" onclick="document.getElementById('ai-dash-input').value='${s}'">${s}</div>`).join('')}
      </div>
      <div id="ai-dash-resp" style="display:none"></div>
    </div>
    <div class="c-intel-right">
      ${PLSnapshotCard(S.kanban)}
    </div>
  </div>

  <!-- ── ROW 2b : HEATMAP ── -->
  <div class="c-map-card">
    <div class="c-map-toolbar">
      <span class="c-map-lbl">Heatmap · ${fr ? 'Demande mondiale' : 'Global demand'}</span>
      <div class="c-map-pills">
        <div class="c-map-pill">X Twitter</div>
        <div class="c-map-pill">Reddit</div>
        <div class="c-map-pill">Discord</div>
      </div>
    </div>
    <div class="c-map-body" id="map-body-wrap">
      ${buildHeatmapSVG(all)}
      <div id="ai-map-tooltip" style="display:none;position:absolute;background:rgba(9,9,15,.97);border:1px solid rgba(45,212,160,.3);border-radius:10px;padding:10px 14px;min-width:160px;pointer-events:none;z-index:10">
        <div style="font-family:monospace;font-size:8px;color:#2DD4A0;letter-spacing:.12em;font-weight:700;margin-bottom:4px">DEMAND HOTSPOT</div>
        <div id="ai-tt-name" style="font-size:13px;font-weight:700;color:#E6EDF3;margin-bottom:6px"></div>
        <div style="display:flex;gap:12px">
          <div><div style="font-size:8px;color:#484F58;font-family:monospace">MARGE</div><div id="ai-tt-marge" style="font-size:15px;font-weight:800;font-family:monospace"></div></div>
          <div><div style="font-size:8px;color:#484F58;font-family:monospace">SCORE</div><div id="ai-tt-score" style="font-size:15px;font-weight:800;font-family:monospace;color:#E6EDF3"></div></div>
        </div>
        <div id="ai-tt-date" style="font-size:9px;color:#8B949E;font-family:monospace;margin-top:5px"></div>
      </div>
    </div>
  </div>

  <!-- ── ROW 2c : ALERTS STRIP ── -->
  ${alerts.length ? `<div class="c-alerts-strip">${alerts.map(AlertPill).join('')}</div>` : ''}

  <!-- ── ROW 3 : TRENDING EVENTS ── -->
  ${SectionHeader(
    fr ? 'Trending Events' : 'Trending Events',
    fr ? 'Meilleurs ROI · Signal IA actif' : 'Best ROI · AI signal active',
    "nav('events', document.getElementById('nav-events'))",
    fr ? 'Voir tout' : 'All events'
  )}
  <div class="c-ev-grid">
    ${trending.map(ev => EventCard(ev, getSig(ev))).join('')}
  </div>

  <!-- ── ROW 4 : DROPS ── -->
  ${drops > 0 ? `
  <div style="margin-top:20px">
    ${SectionHeader(
      '📉 ' + (fr ? 'Chutes de prix récentes' : 'Recent price drops'),
      drops + ' event' + (drops > 1 ? 's' : '') + ' en baisse'
    )}
    <div class="c-drops-list">
      ${all.filter(e => hasDrop(e) && dropPct(e)<=-5).slice(0,4).map(ev => `
      <div class="c-drop-row">
        <span style="font-size:16px">${ev.flag||'🎫'}</span>
        <div style="flex:1">
          <div class="c-drop-name">${ev.name}</div>
          <div class="c-drop-meta">${ev.date||''} · ${ev.platform||''}</div>
        </div>
        <div class="c-drop-pct">${dropPct(ev)}%</div>
        <div class="c-drop-action" onclick="addToKanban('${ev.name}','watch')">+ ${fr ? 'Surveiller' : 'Watch'}</div>
      </div>`).join('')}
    </div>
  </div>` : ''}
  `;
}

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
    ${buildMobileCards(evs)}
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

function toggleTheme() {
  S.theme = S.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('tr-theme', S.theme);
  applyTheme();
  toast(S.theme === 'light' ? '☀️ Mode clair' : '🌙 Mode sombre', S.theme === 'light' ? '☀️' : '🌙');
}

function applyTheme() {
  if (S.theme === 'light') {
    document.body.classList.add('light');
  } else {
    document.body.classList.remove('light');
  }
  // Update toggle button icon
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = S.theme === 'light' ? '🌙' : '☀️';
}

async function checkCountdownAlerts(events) {
  const backendUrl = S.apiUrl || CONFIG.BACKEND_URL;
  if (!backendUrl) return;
  try {
    const res = await fetch(backendUrl + '/api/countdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events, chatId: S.tgChatId })
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.sent > 0) {
      toast(`⏰ ${data.sent} rappel(s) J-X envoyé(s) !`, '⏰');
    }
    // Show upcoming events badge in dashboard
    if (data.upcoming?.length) {
      S._upcoming = data.upcoming;
    }
  } catch(e) { console.warn('[Countdown]', e.message); }
}

async function runScan() {
  const btn = document.getElementById('scan-btn');
  const lbl = document.getElementById('scan-lbl');
  const ic  = document.getElementById('scan-ic');
  if (btn) btn.classList.add('loading');
  if (lbl) lbl.textContent = S.lang === 'fr' ? 'Scan...' : 'Scanning...';
  const frames = ['⟳','↻','⟲']; let fi = 0;
  const anim = setInterval(() => { if (ic) ic.textContent = frames[fi++ % 3]; }, 300);

  try {
    // 1. Charger le sheet (données manuelles)
    await loadSheet();

    // 2. Scanner les APIs live (SeatGeek + Ticketmaster)
    if (lbl) lbl.textContent = S.lang === 'fr' ? 'APIs...' : 'Live scan...';
    const liveCount = await scanLiveData('', S.seuil);

    // 3. Alertes Telegram
    const tgSent = await sendTelegramDirect(allEvs(), S.seuil);

    // 4. Countdown J-7/J-3/J-1
    await checkCountdownAlerts(allEvs());

    // 5. Presale alerts
    const psAlerts = await sendPresaleAlerts(allEvs());
    if (psAlerts > 0) toast(`🔑 ${psAlerts} alerte(s) presale !`, '🔑');

    const opp = allEvs().filter(e => e.marge >= S.seuil).length;
    const liveMsg = liveCount > 0 ? ` · ${liveCount} live` : '';
    const tgMsg   = tgSent   > 0 ? ` · 📱 ${tgSent}` : '';
    toast((S.lang === 'fr' ? `✓ Scan — ${opp} opps` : `✓ Scan — ${opp} opps`) + liveMsg + tgMsg, '⚡');

  } catch (err) {
    console.error('[runScan] Erreur:', err);
    toast('Erreur scan : ' + err.message, '⚠');
  } finally {
    clearInterval(anim);
    if (btn) btn.classList.remove('loading');
    if (lbl) lbl.textContent = S.lang === 'fr' ? 'Scanner' : 'Scan now';
    if (ic)  ic.textContent  = '⟳';
    render();
  }
}

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
/* ── Init ── */
/* ══════════════════════════════════════════════
   AUTH UI
══════════════════════════════════════════════ */
let _authMode = 'signin';

function showAuthModal() {
  const el = document.getElementById('auth-overlay');
  if (el) el.style.display = 'flex';
}

function hideAuthModal() {
  const el = document.getElementById('auth-overlay');
  if (el) el.style.display = 'none';
}

function skipAuth() {
  hideAuthModal();
  toast(S.lang==='fr'?'Mode local — données non sauvegardées':'Local mode — data not saved', 'ℹ');
}

function togglePwd() {
  const inp = document.getElementById('auth-password');
  const eye = document.getElementById('pwd-eye');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if (eye) eye.textContent = inp.type === 'password' ? '👁' : '🙈';
}

function switchAuthTab(mode) {
  _authMode = mode;
  const signin = document.getElementById('tab-signin');
  const signup = document.getElementById('tab-signup');
  const btn    = document.getElementById('auth-submit-btn');
  const sub    = document.getElementById('auth-subtitle');
  if (mode === 'signin') {
    signin.style.background = 'var(--bg5)'; signin.style.color = 'var(--gold2)';
    signup.style.background = 'transparent'; signup.style.color = 'var(--t3)';
    if (btn) btn.textContent = 'Se connecter';
    if (sub) sub.textContent = 'Connecte-toi pour retrouver tes données';
  } else {
    signup.style.background = 'var(--bg5)'; signup.style.color = 'var(--gold2)';
    signin.style.background = 'transparent'; signin.style.color = 'var(--t3)';
    if (btn) btn.textContent = "S'inscrire";
    if (sub) sub.textContent = 'Crée ton compte TicketRadar';
  }
  const errEl = document.getElementById('auth-error');
  if (errEl) errEl.style.display = 'none';
}

async function submitAuth() {
  const email    = document.getElementById('auth-email')?.value.trim();
  const password = document.getElementById('auth-password')?.value;
  const errEl    = document.getElementById('auth-error');
  const btn      = document.getElementById('auth-submit-btn');
  const successEl = document.getElementById('auth-success');

  if (!email || !password) {
    if (errEl) { errEl.textContent = 'Email et mot de passe requis'; errEl.style.display = 'block'; }
    return;
  }
  if (errEl) errEl.style.display = 'none';
  if (btn) { btn.textContent = '⟳ Chargement...'; btn.disabled = true; }

  try {
    if (_authMode === 'signup') {
      await sbSignUp(email, password);
      if (successEl) {
        successEl.textContent = '✓ Compte créé ! Vérifie ton email pour confirmer.';
        successEl.style.display = 'block';
      }
      if (btn) btn.style.display = 'none';
    } else {
      await sbSignIn(email, password);
      hideAuthModal();
      updateUserBtn();
      toast(S.lang==='fr'?'✓ Bienvenue !':'✓ Welcome!', '👤');
      // Reset form
      const emailEl = document.getElementById('auth-email');
      const pwdEl   = document.getElementById('auth-password');
      if (emailEl) emailEl.value = '';
      if (pwdEl)   pwdEl.value   = '';
    }
  } catch(err) {
    const msg = err.message?.includes('Invalid login') ? 'Email ou mot de passe incorrect'
              : err.message?.includes('already registered') ? 'Email déjà utilisé'
              : err.message || 'Erreur de connexion';
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = _authMode === 'signup' ? "S'inscrire" : 'Se connecter'; }
  }
}

function updateUserBtn() {
  const btn = document.getElementById('user-btn');
  if (!btn) return;
  const user = window.currentUser;
  if (user) {
    const letter = user.email?.slice(0,1).toUpperCase() || '?';
    btn.textContent = letter;
    btn.style.background = 'var(--gold)';
    btn.style.color = 'var(--bg0)';
    btn.style.fontFamily = 'var(--font-head)';
    btn.style.fontWeight = '800';
    btn.style.fontSize = '13px';
    btn.title = user.email;
  } else {
    btn.textContent = '👤';
    btn.style.background = 'var(--goldbg)';
    btn.style.color = 'var(--gold2)';
    btn.style.fontWeight = '';
    btn.title = 'Se connecter';
  }
}

function toggleUserMenu() {
  const user = window.currentUser;
  if (!user) { showAuthModal(); return; }
  const menu = document.getElementById('user-menu');
  if (!menu) return;
  const emailEl = document.getElementById('user-email');
  if (emailEl) {
    const kanbanCount = Object.values(S.kanban).flat().length;
    const wlCount = S.wl.length;
    emailEl.innerHTML = `
      <div style="font-weight:600;color:var(--t1);margin-bottom:4px">${user.email}</div>
      <div style="color:var(--t4);font-size:9px">
        🗂 ${kanbanCount} Kanban · ★ ${wlCount} Watchlist
      </div>
      <div style="color:var(--green);font-size:9px;margin-top:2px">☁️ ${S.lang==='fr'?'Synchronisé':'Synced'}</div>`;
  }
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function closeUserMenu() {
  const menu = document.getElementById('user-menu');
  if (menu) menu.style.display = 'none';
}

async function doSignOut() {
  try {
    closeUserMenu();
    await sbSignOut();
    window.currentUser = null;
    updateUserBtn();
    // Reset local state
    S.kanban = { watch: [], bought: [], selling: [], sold: [] };
    S.wl = [];
    S.customEvents = [];
    saveState();
    toast(S.lang==='fr'?'À bientôt !':'See you!', '👋');
    render();
    // Show auth modal after short delay
    setTimeout(showAuthModal, 800);
  } catch(err) {
    console.error('[Auth] Signout error:', err);
    // Force signout even if error
    window.currentUser = null;
    updateUserBtn();
    toast(S.lang==='fr'?'Déconnecté':'Signed out', '👋');
    render();
    setTimeout(showAuthModal, 800);
  }
}

// Close menu on outside click
document.addEventListener('click', e => {
  const menu = document.getElementById('user-menu');
  const btn  = document.getElementById('user-btn');
  if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
    menu.style.display = 'none';
  }
});

function init() {
  // Init DOM elements
  const seuilEl = document.getElementById('seuil');
  const seuilVal = document.getElementById('seuil-val');
  if (seuilEl) seuilEl.value = S.seuil;
  if (seuilVal) seuilVal.textContent = '+' + S.seuil + '%';

  if (S.notifStatus === 'granted') registerServiceWorker();
  fetchLiveFX();
  applyTheme(); // Apply saved theme
  // Check if user is logged in
  sbGetUser().then(user => {
    if (user) {
      window.currentUser = user;
      updateUserBtn();
    } else {
      // Show auth modal after 1 second
      setTimeout(showAuthModal, 1000);
    }
  }).catch(() => {}); // Supabase might not be loaded yet
  const _starred = JSON.parse(localStorage.getItem('tr-starred') || '[]');
  [...FALLBACK_EVENTS, ...S.sheetEvents, ...S.customEvents].forEach(e => {
    if (_starred.includes(e.id)) e.starred = true;
  });
  if(document.getElementById('mkt-list')) renderMarkets();
  applyLang();
  render();
  loadSheet();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* ══════════════════════════════════════════════
   PRICE HISTORY — Historique des prix
══════════════════════════════════════════════ */
const PRICE_HISTORY_KEY = 'tr-price-history';

function getPriceHistory() {
  try { return JSON.parse(localStorage.getItem(PRICE_HISTORY_KEY) || '{}'); }
  catch { return {}; }
}

function savePriceSnapshot(events) {
  const history = getPriceHistory();
  const today = new Date().toISOString().split('T')[0];
  events.forEach(ev => {
    if (!ev.name || !ev.resale) return;
    const key = ev.name.slice(0, 30);
    if (!history[key]) history[key] = { name: ev.name, flag: ev.flag||'🎫', snapshots: [] };
    // Evite les doublons du même jour
    const last = history[key].snapshots.slice(-1)[0];
    if (last && last.date === today) {
      last.resale = ev.resale;
      last.marge  = ev.marge;
    } else {
      history[key].snapshots.push({ date: today, resale: ev.resale, marge: ev.marge });
    }
    // Garde max 30 jours
    if (history[key].snapshots.length > 30) {
      history[key].snapshots = history[key].snapshots.slice(-30);
    }
  });
  localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(history));
}

function renderPriceHistory(c) {
  const fr = S.lang === 'fr';
  const history = getPriceHistory();
  const keys = Object.keys(history).filter(k => history[k].snapshots.length >= 2);

  c.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <span class="card-title">📈 ${fr?'Evolution des prix':'Price history'}</span>
        <span class="card-meta">${keys.length} ${fr?'events suivis':'events tracked'}</span>
      </div>
      ${keys.length === 0 ? `
        <div class="empty">
          <div class="empty-icon">📊</div>
          <div class="empty-txt">${fr ? "Lance plusieurs scans pour voir l'evolution des prix" : "Run multiple scans to see price evolution"}</div>
        </div>` : `
        <div style="padding:14px 18px;display:flex;flex-direction:column;gap:20px">
          ${keys.slice(0,6).map(k => {
            const ev = history[k];
            const snaps = ev.snapshots;
            const first = snaps[0].resale;
            const last  = snaps[snaps.length-1].resale;
            const trend = last > first ? '↗' : last < first ? '↘' : '→';
            const trendCol = last > first ? 'var(--green)' : last < first ? 'var(--red)' : 'var(--t3)';
            const pct = first > 0 ? Math.round(((last-first)/first)*100) : 0;
            const canvasId = 'ph-' + k.replace(/[^a-z0-9]/gi,'');
            return `
            <div style="background:var(--bg3);border:1px solid var(--b3);border-radius:var(--r12);padding:14px 16px">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
                <div>
                  <div style="font-family:var(--font-head);font-size:13px;font-weight:700">${ev.flag} ${ev.name}</div>
                  <div style="font-family:var(--font-mono);font-size:9px;color:var(--t3);margin-top:2px">${snaps.length} ${fr?'points de données':'data points'}</div>
                </div>
                <div style="text-align:right">
                  <div style="font-size:20px;font-weight:800;font-family:var(--font-head);color:${trendCol}">${trend} ${pct >= 0 ? '+' : ''}${pct}%</div>
                  <div style="font-size:9px;color:var(--t3);font-family:var(--font-mono)">${first}€ → ${last}€</div>
                </div>
              </div>
              <div style="position:relative;height:80px"><canvas id="${canvasId}"></canvas></div>
            </div>`;
          }).join('')}
        </div>`}
    </div>`;

  // Draw mini charts
  setTimeout(() => {
    keys.slice(0,6).forEach(k => {
      const ev = history[k];
      const snaps = ev.snapshots;
      const canvasId = 'ph-' + k.replace(/[^a-z0-9]/gi,'');
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      const first = snaps[0].resale;
      const last  = snaps[snaps.length-1].resale;
      const color = last >= first ? '#2DD4A0' : '#FF5E5E';
      if (S.charts[canvasId]) S.charts[canvasId].destroy();
      S.charts[canvasId] = new Chart(canvas, {
        type: 'line',
        data: {
          labels: snaps.map(s => s.date.slice(5)),
          datasets: [{
            data: snaps.map(s => s.resale),
            borderColor: color,
            backgroundColor: color + '15',
            borderWidth: 2,
            pointRadius: snaps.length < 10 ? 4 : 2,
            pointBackgroundColor: color,
            fill: true,
            tension: 0.3
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: 'rgba(240,237,232,0.04)' }, ticks: { color: '#605A52', font: { size: 9, family: 'IBM Plex Mono' } } },
            y: { grid: { color: 'rgba(240,237,232,0.04)' }, ticks: { color: '#605A52', font: { size: 9, family: 'IBM Plex Mono' }, callback: v => v + '€' } }
          }
        }
      });
    });
  }, 100);
}

/* ══════════════════════════════════════════════
   AUTO DISCOVER — Recherche automatique events
══════════════════════════════════════════════ */
async function autoDiscoverEvents() {
  toast(S.lang==='fr'?'🔍 Recherche de nouveaux events...':'🔍 Searching new events...', '🔍');
  
  // Recherche via SeatGeek API publique
  const queries = ['f1 2026', 'concert paris 2026', 'ufc 2026', 'champions league 2026', 'festival 2026'];
  const discovered = [];
  
  for (const q of queries) {
    try {
      const url = `https://api.seatgeek.com/2/events?q=${encodeURIComponent(q)}&per_page=3&sort=score.desc`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const events = data.events || [];
      events.forEach(ev => {
        const avgPrice = ev.stats?.average_price || 0;
        const lowestPrice = ev.stats?.lowest_price || 0;
        if (!avgPrice || !lowestPrice) return;
        const estimatedFace = Math.round(lowestPrice * 0.6);
        const net = avgPrice * 0.85;
        const marge = estimatedFace > 0 ? Math.round(((net - estimatedFace) / estimatedFace) * 100) : 0;
        if (marge < 30) return;
        discovered.push({
          name: ev.title?.slice(0, 50) || 'Event inconnu',
          date: ev.datetime_local?.split('T')[0] || '',
          platform: 'SeatGeek',
          face: estimatedFace,
          resale: Math.round(avgPrice),
          marge,
          score: Math.min(Math.round(ev.score * 10) / 10, 9.9) || 7.5,
          flag: '🌍', cat: 'sport', h: 'mid', country: 'US',
          _discovered: true,
          _url: ev.url || '',
        });
      });
    } catch(e) { console.warn('[Discover]', q, e.message); }
  }

  if (!discovered.length) {
    toast(S.lang==='fr'?'Aucun nouveau event trouvé':'No new events found', 'ℹ');
    return;
  }

  // Déduplique avec events existants
  const existing = allEvs().map(e => e.name.toLowerCase().slice(0,20));
  const newEvs = discovered.filter(e => !existing.some(ex => e.name.toLowerCase().includes(ex.slice(0,10))));

  if (!newEvs.length) {
    toast(S.lang==='fr'?'Tous les events déjà connus':'All events already known', 'ℹ');
    return;
  }

  // Affiche les résultats
  S._discoveredEvents = newEvs;
  nav('discover', document.getElementById('nav-discover'));
  toast(`🔍 ${newEvs.length} ${S.lang==='fr'?'nouveaux events trouvés !':'new events found!'}`, '🔍');
}

function renderDiscover(c) {
  const fr = S.lang === 'fr';
  const evs = S._discoveredEvents || [];
  c.innerHTML = `
    <div class="card">
      <div class="card-head">
        <span class="card-title">🔍 ${fr?'Events découverts':'Discovered events'}</span>
        <span class="card-meta">${evs.length} ${fr?'nouveaux':'new'}</span>
      </div>
      ${evs.length === 0 ? `
        <div class="empty">
          <div class="empty-icon">🔍</div>
          <div class="empty-txt">${fr?'Lance une recherche depuis le bouton ci-dessous':'Run a search from the button below'}</div>
        </div>
        <div class="form-actions">
          <button class="btn-primary" onclick="autoDiscoverEvents()">🔍 ${fr?'Rechercher':'Search'}</button>
        </div>` : `
        ${evs.map(e => `
          <div style="display:flex;align-items:center;gap:12px;padding:11px 18px;border-bottom:1px solid var(--b3)">
            <div style="flex:1">
              <div style="font-size:12.5px;font-weight:600;font-family:var(--font-head)">${e.flag} ${e.name}</div>
              <div style="font-size:9.5px;color:var(--t3);font-family:var(--font-mono);margin-top:2px">${e.date} · ${e.platform} · face estimée: ${e.face}€</div>
            </div>
            <span class="mb ${e.marge>=100?'mb-hot':e.marge>=50?'mb-mid':'mb-low'}">+${e.marge}%</span>
            <button onclick="importDiscoveredEvent(${evs.indexOf(e)})"
              style="background:var(--goldbg);border:1px solid var(--goldbdr);border-radius:var(--r8);padding:5px 12px;font-size:10px;color:var(--gold2);cursor:pointer;font-family:var(--font-mono)">
              + ${fr?'Importer':'Import'}
            </button>
          </div>`).join('')}
        <div class="form-actions">
          <button class="btn-ghost" onclick="autoDiscoverEvents()">🔄 ${fr?'Relancer':'Refresh'}</button>
        </div>`}
    </div>`;
}

function importDiscoveredEvent(idx) {
  const ev = (S._discoveredEvents || [])[idx];
  if (!ev) return;
  S.customEvents.push({
    id: S.nextId++,
    name: ev.name, sub: ev._url || '', date: ev.date,
    flag: ev.flag || '🌍', cat: ev.cat || 'sport',
    h: ev.h || 'mid', platform: ev.platform,
    face: ev.face, resale: ev.resale, marge: ev.marge,
    prevResale: ev.resale, score: ev.score || 7.5,
    qty: 1, notes: 'Auto-découvert via SeatGeek',
    starred: false, custom: true, live: true, country: ev.country || 'US',
  });
  saveState();
  toast(S.lang==='fr'?`"${ev.name.slice(0,25)}" importé !`:`"${ev.name.slice(0,25)}" imported!`, '✓');
}

/* ══════════════════════════════════════════════
   MAP — Carte interactive des events
══════════════════════════════════════════════ */
const COUNTRY_COORDS = {
  FR:{lat:48.85,lng:2.35}, UK:{lat:51.5,lng:-0.12}, US:{lat:40.71,lng:-74.0},
  ES:{lat:40.41,lng:-3.7}, JP:{lat:35.68,lng:139.69}, MC:{lat:43.73,lng:7.42},
  UAE:{lat:24.45,lng:54.37}, HU:{lat:47.49,lng:19.04}, DE:{lat:52.52,lng:13.4},
  IT:{lat:41.9,lng:12.5}, AU:{lat:-33.87,lng:151.2}, BR:{lat:-23.55,lng:-46.63},
};

let leafletMap = null;

function renderMap(c) {
  const fr = S.lang === 'fr';
  const evs = allEvs().filter(e => e.marge >= S.seuil);
  
  c.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <span class="card-title">🗺️ ${fr?'Carte des opportunités':'Opportunity map'}</span>
        <span class="card-meta">${evs.length} ${fr?'events':'events'} > +${S.seuil}%</span>
      </div>
      <div id="leaflet-map" style="height:420px;border-radius:0 0 var(--r16) var(--r16);overflow:hidden"></div>
    </div>
    <div class="card">
      <div class="card-head">
        <span class="card-title">${fr?'Répartition géographique':'Geographic breakdown'}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:14px 18px">
        ${Object.entries(
          evs.reduce((acc, e) => { acc[e.country] = (acc[e.country]||0)+1; return acc; }, {})
        ).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([country, count]) => `
          <div style="background:var(--bg3);border:1px solid var(--b3);border-radius:var(--r8);padding:10px;text-align:center">
            <div style="font-size:20px">${evs.find(e=>e.country===country)?.flag||'🌍'}</div>
            <div style="font-family:var(--font-mono);font-size:9px;color:var(--t3);margin-top:4px">${country}</div>
            <div style="font-family:var(--font-head);font-size:18px;font-weight:800;color:var(--gold2)">${count}</div>
          </div>`).join('')}
      </div>
    </div>`;

  // Init Leaflet map
  setTimeout(() => {
    if (leafletMap) { leafletMap.remove(); leafletMap = null; }
    const mapEl = document.getElementById('leaflet-map');
    if (!mapEl || !window.L) return;
    
    leafletMap = L.map('leaflet-map', { zoomControl: true, scrollWheelZoom: false }).setView([30, 10], 2);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO',
      maxZoom: 18
    }).addTo(leafletMap);

    evs.forEach(ev => {
      const coords = COUNTRY_COORDS[ev.country];
      if (!coords) return;
      // Jitter pour éviter les superpositions
      const jLat = coords.lat + (Math.random() - 0.5) * 2;
      const jLng = coords.lng + (Math.random() - 0.5) * 2;
      const color = ev.marge >= 100 ? '#2DD4A0' : ev.marge >= 50 ? '#D4A843' : '#5BA4F5';
      const size  = ev.marge >= 100 ? 14 : ev.marge >= 50 ? 11 : 8;
      const icon  = L.divIcon({
        html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.3);box-shadow:0 0 8px ${color}"></div>`,
        iconSize: [size, size], className: ''
      });
      L.marker([jLat, jLng], { icon })
        .addTo(leafletMap)
        .bindPopup(`
          <div style="font-family:monospace;font-size:11px;min-width:160px">
            <div style="font-weight:700;margin-bottom:4px">${ev.flag||'🎫'} ${ev.name}</div>
            <div style="color:#666">${ev.date||''}</div>
            <div style="color:${color};font-weight:700;margin-top:4px">+${ev.marge}%</div>
            <div style="color:#888">${ev.face}€ → ${ev.resale}€</div>
            <div style="color:#888;margin-top:2px">${ev.platform}</div>
          </div>`);
    });
  }, 200);
}

/* ══════════════════════════════════════════════
   🤖 AI PRICE PREDICTOR
   Régression linéaire sur l'historique des prix
   Signal : ACHETER / ATTENDRE / VENDRE
══════════════════════════════════════════════ */

function linearRegression(points) {
  // points = [{x: dayIndex, y: price}, ...]
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y || 0, r2: 0 };
  const sumX  = points.reduce((s, p) => s + p.x, 0);
  const sumY  = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  // R² score
  const yMean = sumY / n;
  const ssTot = points.reduce((s, p) => s + Math.pow(p.y - yMean, 2), 0);
  const ssRes = points.reduce((s, p) => s + Math.pow(p.y - (slope * p.x + intercept), 2), 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, r2 };
}

function predictPrice(snapshots, daysAhead = 7) {
  if (!snapshots || snapshots.length < 2) return null;
  const points = snapshots.map((s, i) => ({ x: i, y: parseFloat(s.resale) }));
  const { slope, intercept, r2 } = linearRegression(points);
  const nextX = points.length + daysAhead - 1;
  const predicted = Math.round(slope * nextX + intercept);
  const current   = points[points.length - 1].y;
  const pctChange = current > 0 ? Math.round(((predicted - current) / current) * 100) : 0;
  // Trend over last 3 points
  const recent = points.slice(-3);
  const recentSlope = recent.length >= 2
    ? (recent[recent.length-1].y - recent[0].y) / recent.length
    : slope;
  return { slope, predicted, current, pctChange, r2, recentSlope };
}

function getSignal(ev, snapshots) {
  if (!snapshots || snapshots.length < 2) {
    return { signal: 'DONNÉES INSUFFISANTES', color: 'var(--t3)', icon: '⏳', advice: 'Lance plusieurs scans pour accumuler des données', confidence: 0 };
  }
  const pred = predictPrice(snapshots, 7);
  if (!pred) return null;
  const { pctChange, r2, recentSlope, slope } = pred;
  const confidence = Math.round(Math.min(Math.max(r2 * 100, 10), 95));
  // Days until event
  const daysLeft = (() => {
    const months = {jan:0,fév:1,feb:1,mar:2,avr:3,apr:3,mai:4,may:4,jun:5,juin:5,jul:6,juil:6,aug:7,aoû:7,sep:8,oct:9,nov:10,déc:11,dec:11};
    const match = (ev.date||'').match(/(\d+)(?:-\d+)?\s+([a-zéû]+)\s+(\d{4})/i);
    if (match) {
      const month = months[match[2].toLowerCase().slice(0,3)];
      if (month !== undefined) {
        const d = new Date(parseInt(match[3]), month, parseInt(match[1]));
        const today = new Date(); today.setHours(0,0,0,0);
        return Math.round((d - today) / (1000*60*60*24));
      }
    }
    return null;
  })();

  // Signal logic
  if (daysLeft !== null && daysLeft <= 3) {
    return { signal: 'VENDRE MAINTENANT', color: 'var(--red)', icon: '🚨', advice: `Event dans ${daysLeft}j — c'est maintenant ou jamais !`, confidence, predicted: pred.predicted, pctChange };
  }
  if (pctChange >= 8 && r2 > 0.4) {
    return { signal: 'ACHETER MAINTENANT', color: 'var(--green)', icon: '🟢', advice: `Prix en hausse +${pctChange}% prévu sur 7j — bon moment d'acheter`, confidence, predicted: pred.predicted, pctChange };
  }
  if (pctChange <= -5 && r2 > 0.4) {
    if (recentSlope < 0) {
      return { signal: 'ATTENDRE', color: 'var(--blue)', icon: '⏳', advice: `Prix en baisse ${pctChange}% — attends le bottom dans ~${Math.abs(Math.round(pred.current/slope))}j`, confidence, predicted: pred.predicted, pctChange };
    }
  }
  if (daysLeft !== null && daysLeft <= 14 && pctChange >= 3) {
    return { signal: 'VENDRE BIENTÔT', color: 'var(--gold2)', icon: '🟡', advice: `Peak proche — pense à vendre avant J-7`, confidence, predicted: pred.predicted, pctChange };
  }
  return { signal: 'SURVEILLER', color: 'var(--t2)', icon: '👁', advice: `Tendance neutre — accumule des données`, confidence, predicted: pred.predicted, pctChange };
}

function renderAIPredictor(c) {
  const fr = S.lang === 'fr';
  const history = getPriceHistory();
  const all = allEvs();
  // Match history with events
  const predictions = [];
  all.forEach(ev => {
    const key = Object.keys(history).find(k => k.slice(0,20) === ev.name.slice(0,20));
    const snapshots = key ? history[key].snapshots : null;
    const signal = getSignal(ev, snapshots);
    if (signal) {
      predictions.push({ ev, snapshots: snapshots || [], signal });
    }
  });
  // Sort: urgent signals first
  const signalOrder = {'VENDRE MAINTENANT':0,'VENDRE BIENTÔT':1,'ACHETER MAINTENANT':2,'ATTENDRE':3,'SURVEILLER':4,'DONNÉES INSUFFISANTES':5};
  predictions.sort((a,b) => (signalOrder[a.signal.signal]||9) - (signalOrder[b.signal.signal]||9));

  c.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <span class="card-title">🤖 ${fr?'AI Price Predictor':'AI Price Predictor'}</span>
        <span class="card-meta">${predictions.length} ${fr?'events analysés':'events analyzed'} · Régression linéaire</span>
      </div>
      <div style="padding:12px 18px;background:var(--goldbg);border-bottom:1px solid var(--goldbdr);font-size:11px;color:var(--gold2);font-family:var(--font-mono)">
        ⚠️ ${fr ? "Predictions basees sur l'historique — plus tu scannes, plus c'est precis" : "Predictions based on local history — more scans = more accuracy"}
      </div>
      ${predictions.length === 0 ? `
        <div class="empty">
          <div class="empty-icon">🤖</div>
          <div class="empty-txt">${fr?'Lance plusieurs scans pour générer des prédictions':'Run multiple scans to generate predictions'}</div>
        </div>` :
        predictions.map(({ ev, snapshots, signal }) => {
          const hasData = snapshots.length >= 2;
          const pred = hasData ? predictPrice(snapshots, 7) : null;
          return `
          <div style="padding:14px 18px;border-bottom:1px solid var(--b3);display:flex;gap:14px;align-items:flex-start">
            <div style="width:38px;height:38px;border-radius:var(--r8);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;background:${signal.color}15;border:1px solid ${signal.color}40">
              ${signal.icon}
            </div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
                <span style="font-family:var(--font-head);font-size:13px;font-weight:700">${ev.flag||'🎫'} ${ev.name}</span>
                <span style="font-family:var(--font-mono);font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;background:${signal.color}15;color:${signal.color};border:1px solid ${signal.color}40;white-space:nowrap">${signal.signal}</span>
              </div>
              <div style="font-size:11px;color:var(--t3);margin-bottom:6px;font-family:var(--font-mono)">${signal.advice}</div>
              ${hasData && pred ? `
              <div style="display:flex;gap:10px;flex-wrap:wrap">
                <span style="font-size:10px;font-family:var(--font-mono);color:var(--t3)">Actuel: <strong style="color:var(--t1)">${pred.current}€</strong></span>
                <span style="font-size:10px;font-family:var(--font-mono);color:var(--t3)">Prévu J+7: <strong style="color:${pred.pctChange>=0?'var(--green)':'var(--red)'}">${pred.predicted}€ (${pred.pctChange>=0?'+':''}${pred.pctChange}%)</strong></span>
                <span style="font-size:10px;font-family:var(--font-mono);color:var(--t3)">Fiabilité: <strong style="color:var(--gold2)">${signal.confidence}%</strong></span>
                <span style="font-size:10px;font-family:var(--font-mono);color:var(--t3)">${snapshots.length} point${snapshots.length>1?'s':''}</span>
              </div>
              ${hasData ? `
              <div style="margin-top:8px;height:3px;background:var(--bg5);border-radius:2px;overflow:hidden">
                <div style="height:100%;border-radius:2px;background:${signal.color};width:${signal.confidence}%;transition:width .4s"></div>
              </div>` : ''}` : `
              <div style="font-size:10px;color:var(--t4);font-family:var(--font-mono)">Lance au moins 2 scans pour obtenir une prédiction</div>`}
            </div>
            <div style="flex-shrink:0;text-align:right">
              <div style="font-family:var(--font-head);font-size:20px;font-weight:800;color:${ev.marge>=100?'var(--green)':ev.marge>=50?'var(--gold2)':'var(--t2)'}">+${ev.marge}%</div>
              <div style="font-size:9px;color:var(--t4);font-family:var(--font-mono)">marge actuelle</div>
            </div>
          </div>`;
        }).join('')}
    </div>

    <div class="card">
      <div class="card-head">
        <span class="card-title">📊 ${fr?'Résumé des signaux':'Signal summary'}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:14px 18px">
        ${[
          {s:'ACHETER MAINTENANT', icon:'🟢', col:'var(--green)'},
          {s:'VENDRE MAINTENANT',  icon:'🚨', col:'var(--red)'},
          {s:'VENDRE BIENTÔT',     icon:'🟡', col:'var(--gold2)'},
          {s:'ATTENDRE',           icon:'⏳', col:'var(--blue)'},
          {s:'SURVEILLER',         icon:'👁', col:'var(--t2)'},
          {s:'DONNÉES INSUFFISANTES', icon:'⏳', col:'var(--t4)'},
        ].map(({s, icon, col}) => {
          const count = predictions.filter(p => p.signal.signal === s).length;
          return `
          <div style="background:var(--bg3);border:1px solid var(--b3);border-radius:var(--r8);padding:10px 12px;text-align:center">
            <div style="font-size:16px">${icon}</div>
            <div style="font-family:var(--font-head);font-size:20px;font-weight:800;color:${col}">${count}</div>
            <div style="font-size:8px;color:var(--t4);font-family:var(--font-mono);margin-top:2px">${s}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════
   🔑 PRESALE TRACKER
   Countdown + alertes Telegram avant presale
══════════════════════════════════════════════ */

const PRESALE_SOURCES = {
  'AMEX':       { label: 'Amex Presale',         icon: '💳', color: '#2DD4A0', tip: 'Carte American Express requise' },
  'SPOTIFY':    { label: 'Spotify Fan Presale',   icon: '🎵', color: '#1DB954', tip: "S'abonner à l'artiste sur Spotify" },
  'APPLE':      { label: 'Apple Music Presale',   icon: '🎵', color: '#FC3C44', tip: "Suivre l'artiste sur Apple Music" },
  'VERIFIED':   { label: 'Verified Fan',          icon: '✅', color: '#5BA4F5', tip: 'Inscription Ticketmaster Verified Fan' },
  'NEWSLETTER': { label: 'Newsletter artiste',    icon: '📧', color: '#A78BFA', tip: "S'inscrire sur le site officiel" },
  'VENUE':      { label: 'Venue Presale',         icon: '🏟️', color: '#D4A843', tip: 'Abonné email de la salle' },
  'FANCLUB':    { label: 'Fan Club',              icon: '⭐', color: '#FF5E5E', tip: 'Membre du fan club officiel' },
};

function getDaysUntilPresale(presaleDateStr) {
  if (!presaleDateStr) return null;
  const d = new Date(presaleDateStr);
  if (isNaN(d)) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((d - today) / (1000*60*60*24));
}

function getPresaleStatus(ev) {
  const days = getDaysUntilPresale(ev.presale_date || ev.presale);
  if (days === null) return null;
  if (days < 0)  return { status: 'TERMINÉE',   color: 'var(--t4)',    icon: '⏹️', days };
  if (days === 0) return { status: "AUJOURD'HUI", color: 'var(--red)',  icon: '🚨', days };
  if (days <= 1)  return { status: 'DEMAIN',      color: 'var(--red)',   icon: '🔴', days };
  if (days <= 3)  return { status: `J-${days}`,   color: 'var(--gold2)', icon: '🟡', days };
  if (days <= 7)  return { status: `J-${days}`,   color: 'var(--green)', icon: '🟢', days };
  return           { status: `J-${days}`,          color: 'var(--t2)',    icon: '📅', days };
}

async function sendPresaleAlerts(events) {
  if (!S.tgToken || !S.tgChatId) return 0;
  let sent = 0;
  const ALERT_DAYS = [3, 1, 0];

  for (const ev of events) {
    const ps = getPresaleStatus(ev);
    if (!ps || !ALERT_DAYS.includes(ps.days)) continue;

    const source = PRESALE_SOURCES[ev.presale_code] || { label: ev.presale_code || 'Presale', icon: '🔑' };
    const urgency = ps.days === 0 ? '🚨 MAINTENANT' : ps.days === 1 ? '⚡ DEMAIN' : `📅 Dans ${ps.days} jours`;

    const msg =
      `🔑 <b>TicketRadar — Presale ${urgency} !</b>

` +
      `${ev.flag||'🎫'} <b>${ev.name}</b>
` +
      `📅 Presale : <b>${ev.presale_date || ev.presale}</b>
` +
      `${source.icon} Code : <b>${source.label}</b>
` +
      `💡 ${source.tip || ''}
` +
      `💰 Marge estimée : <b>+${ev.marge}%</b>
` +
      `🎫 Face : ${ev.face}€ → Revente : ${ev.resale}€

` +
      (ps.days === 0
        ? `⚡ <b>C'est maintenant — achète avant la vente générale !</b>
`
        : ps.days <= 1
        ? `⏰ Prépare-toi — la presale ouvre demain !
`
        : `📌 Mets une alarme pour ne pas rater l'ouverture.
`) +
      `
👉 <a href="https://fredericnjoh-lab.github.io/ticketradar/">Ouvrir TicketRadar</a>`;

    try {
      const r = await fetch('https://api.telegram.org/bot' + S.tgToken + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: S.tgChatId, text: msg, parse_mode: 'HTML' })
      });
      if ((await r.json()).ok) { sent++; await new Promise(r => setTimeout(r, 300)); }
    } catch(e) {}
  }
  return sent;
}

function renderPresaleTracker(c) {
  const fr = S.lang === 'fr';
  const evs = allEvs();

  // Events with presale info
  const withPresale = evs.filter(e => e.presale_date || e.presale).map(e => ({
    ...e,
    _ps: getPresaleStatus(e)
  })).sort((a, b) => {
    const da = a._ps?.days ?? 999;
    const db = b._ps?.days ?? 999;
    return da - db;
  });

  // Upcoming presales (next 30 days)
  const upcoming = withPresale.filter(e => e._ps && e._ps.days >= 0 && e._ps.days <= 30);
  const past     = withPresale.filter(e => e._ps && e._ps.days < 0);
  const noDate   = evs.filter(e => !e.presale_date && !e.presale);

  c.innerHTML = `
    <!-- Header stats -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
      ${[
        { lbl: fr?'PRESALES À VENIR':'UPCOMING', val: upcoming.length, col: 'var(--green)', icon: '🔑' },
        { lbl: fr?'DANS LES 3 JOURS':'IN 3 DAYS', val: upcoming.filter(e=>e._ps.days<=3).length, col: 'var(--red)', icon: '🚨' },
        { lbl: fr?'CETTE SEMAINE':'THIS WEEK', val: upcoming.filter(e=>e._ps.days<=7).length, col: 'var(--gold2)', icon: '⚡' },
        { lbl: fr?'SANS DATE':'NO DATE', val: noDate.length, col: 'var(--t3)', icon: '❓' },
      ].map(k => `
        <div style="background:var(--bg2);border:1px solid var(--b3);border-radius:var(--r12);padding:14px;position:relative;overflow:hidden">
          <div style="position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,${k.col},transparent)"></div>
          <div style="font-family:var(--font-mono);font-size:8.5px;color:var(--t3);letter-spacing:.1em;margin-bottom:8px">${k.lbl}</div>
          <div style="font-family:var(--font-head);font-size:28px;font-weight:800;color:${k.col}">${k.val}</div>
          <div style="font-size:16px;position:absolute;top:12px;right:14px;opacity:.3">${k.icon}</div>
        </div>`).join('')}
    </div>

    <!-- Presale sources legend -->
    <div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <span class="card-title">🔑 ${fr?'Sources de presale':'Presale sources'}</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;padding:12px 18px">
        ${Object.entries(PRESALE_SOURCES).map(([k, v]) => `
          <div style="display:flex;align-items:center;gap:6px;background:var(--bg3);border:1px solid var(--b3);border-radius:20px;padding:4px 12px;cursor:default" title="${v.tip}">
            <span>${v.icon}</span>
            <span style="font-family:var(--font-mono);font-size:9.5px;color:var(--t2)">${k}</span>
          </div>`).join('')}
      </div>
      <div style="padding:8px 18px 12px;font-size:10px;color:var(--t4);font-family:var(--font-mono)">
        ${fr?'Ajoute une colonne "presale_date" (YYYY-MM-DD) et "presale_code" dans ton Google Sheet':'Add "presale_date" (YYYY-MM-DD) and "presale_code" columns to your Google Sheet'}
      </div>
    </div>

    <!-- Upcoming presales -->
    <div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <span class="card-title">⏰ ${fr?'Presales à venir':'Upcoming presales'}</span>
        <span class="card-meta">${upcoming.length} ${fr?'events':'events'}</span>
      </div>
      ${upcoming.length === 0 ? `
        <div class="empty">
          <div class="empty-icon">🔑</div>
          <div class="empty-txt">${fr?"Ajoute une colonne 'presale_date' dans ton Sheet":"Add a 'presale_date' column to your Sheet"}</div>
        </div>` :
        upcoming.map(ev => {
          const ps = ev._ps;
          const src = PRESALE_SOURCES[ev.presale_code] || { icon: '🔑', label: ev.presale_code || '—', tip: '' };
          return `
          <div style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid var(--b3)">
            <div style="width:42px;height:42px;border-radius:var(--r8);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;background:${ps.color}15;border:1px solid ${ps.color}40">
              ${ps.icon}
            </div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;flex-wrap:wrap">
                <span style="font-family:var(--font-head);font-size:13px;font-weight:700">${ev.flag||'🎫'} ${ev.name}</span>
                <span style="font-family:var(--font-mono);font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;background:${ps.color}15;color:${ps.color};border:1px solid ${ps.color}40">${ps.status}</span>
              </div>
              <div style="display:flex;gap:10px;flex-wrap:wrap;font-family:var(--font-mono);font-size:10px;color:var(--t3)">
                <span>📅 ${ev.presale_date || ev.presale}</span>
                <span>${src.icon} ${src.label}</span>
                <span>💰 +${ev.marge}%</span>
                <span>${ev.face}€ → ${ev.resale}€</span>
              </div>
              ${src.tip ? `<div style="font-size:9.5px;color:var(--t4);font-family:var(--font-mono);margin-top:3px">💡 ${src.tip}</div>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
              <button onclick="openPlatform(${ev.id})"
                style="background:var(--goldbg);border:1px solid var(--goldbdr);border-radius:var(--r8);padding:5px 12px;font-size:10px;color:var(--gold2);cursor:pointer;font-family:var(--font-mono)">
                🛒 Acheter
              </button>
            </div>
          </div>`;
        }).join('')}
    </div>

    <!-- Events sans date presale -->
    <div class="card">
      <div class="card-head">
        <span class="card-title">❓ ${fr?'Sans date presale':'No presale date'}</span>
        <span class="card-meta">${noDate.length} ${fr?'events à surveiller':'events to watch'}</span>
      </div>
      <div style="padding:10px 18px;font-size:11px;color:var(--t3);font-family:var(--font-mono);border-bottom:1px solid var(--b3)">
        ${fr?'Ajoute presale_date + presale_code dans ton Sheet pour ces events':'Add presale_date + presale_code to your Sheet for these events'}
      </div>
      ${noDate.slice(0,8).map(ev => `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 18px;border-bottom:1px solid var(--b3)">
          <span style="font-size:16px">${ev.flag||'🎫'}</span>
          <div style="flex:1">
            <div style="font-family:var(--font-head);font-size:12.5px;font-weight:600">${ev.name}</div>
            <div style="font-family:var(--font-mono);font-size:9.5px;color:var(--t3)">${ev.date||'—'} · +${ev.marge}%</div>
          </div>
          <span style="font-family:var(--font-mono);font-size:9px;color:var(--t4);background:var(--bg3);padding:2px 8px;border-radius:4px">Pas de presale_date</span>
        </div>`).join('')}
    </div>`;
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
window.renderPriceHistory = renderPriceHistory;
window.autoDiscoverEvents = autoDiscoverEvents;
window.importDiscoveredEvent = importDiscoveredEvent;
window.renderMap        = renderMap;
window.fetchLiveFX      = fetchLiveFX;
window.toggleTheme      = toggleTheme;
window.buildMobileCards = buildMobileCards;
window.checkCountdownAlerts = checkCountdownAlerts;
window.renderAIPredictor    = renderAIPredictor;
window.renderPresaleTracker = renderPresaleTracker;
window.sendPresaleAlerts    = sendPresaleAlerts;
window.showAuthModal  = showAuthModal;
window.hideAuthModal  = hideAuthModal;
window.skipAuth       = skipAuth;
window.switchAuthTab  = switchAuthTab;
window.submitAuth     = submitAuth;
window.toggleUserMenu = toggleUserMenu;
window.closeUserMenu  = closeUserMenu;
window.togglePwd      = togglePwd;
window.doSignOut           = doSignOut;
window.updateTopbarKpis    = updateTopbarKpis;

/* ══ HEATMAP SVG BUILDER ══ */
function buildHeatmapSVG(all) {
  const coordMap = {
    'FR':{ cx:382, cy:49 }, 'GB':{ cx:370, cy:44 }, 'MC':{ cx:396, cy:49 },
    'DE':{ cx:408, cy:44 }, 'ES':{ cx:358, cy:54 }, 'IT':{ cx:420, cy:52 },
    'US':{ cx:128, cy:82 }, 'JP':{ cx:630, cy:55 }, 'AU':{ cx:610, cy:148 },
    'NL':{ cx:387, cy:42 }, 'BE':{ cx:384, cy:43 }, 'CH':{ cx:400, cy:48 },
  };
  const byCountry = {};
  (all || []).forEach(ev => {
    const cc = (ev.country || 'FR').toUpperCase().slice(0,2);
    if (!byCountry[cc] || ev.marge > byCountry[cc].marge) byCountry[cc] = ev;
  });
  const spotsHTML = Object.entries(byCountry).map(([cc, ev]) => {
    const coord = coordMap[cc] || { cx: 400 + Math.round(Math.sin(cc.charCodeAt(0)) * 80), cy: 60 };
    const color = ev.marge >= 150 ? '#2DD4A0' : ev.marge >= 80 ? '#D4A843' : ev.marge >= 40 ? '#A78BFA' : '#5BA4F5';
    const r = Math.min(28, Math.max(12, Math.round(8 + ev.marge * 0.06)));
    const r2 = Math.round(r * 0.45);
    const r3 = Math.round(r * 0.18);
    const evData = encodeURIComponent(JSON.stringify({
      name: ev.name, marge: ev.marge, score: ev.score || 8,
      date: ev.date || '', flag: ev.flag || ''
    }));
    return '<g class="hspot" style="cursor:pointer" data-ev="' + evData + '"' +
      ' onmouseenter="showMapTip(event,this.dataset.ev)"' +
      ' onmouseleave="hideMapTip()">' +
      '<circle cx="' + coord.cx + '" cy="' + coord.cy + '" r="' + r + '" fill="' + color + '22" stroke="' + color + '55" stroke-width="1">' +
      '<animate attributeName="r" values="' + r + ';' + (r+5) + ';' + r + '" dur="2.5s" repeatCount="indefinite"/>' +
      '<animate attributeName="opacity" values="1;0.6;1" dur="2.5s" repeatCount="indefinite"/>' +
      '</circle>' +
      '<circle cx="' + coord.cx + '" cy="' + coord.cy + '" r="' + r2 + '" fill="' + color + '88"/>' +
      '<circle cx="' + coord.cx + '" cy="' + coord.cy + '" r="' + r3 + '" fill="' + color + '"/>' +
      '</g>';
  }).join('');

  return '<svg viewBox="0 0 800 230" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%">' +
    '<rect width="800" height="230" fill="#0D1421"/>' +
    '<path d="M80 60 L160 45 L180 55 L175 80 L190 90 L185 115 L168 118 L152 108 L138 122 L118 128 L98 118 L83 102 L73 82 Z" fill="#1A2A3A" stroke="rgba(255,255,255,.04)" stroke-width="0.5"/>' +
    '<path d="M155 132 L176 126 L187 142 L192 168 L181 198 L165 207 L147 197 L138 176 L144 156 Z" fill="#1A2A3A" stroke="rgba(255,255,255,.04)" stroke-width="0.5"/>' +
    '<path d="M352 38 L396 33 L412 44 L417 60 L406 72 L390 66 L374 72 L363 61 L353 54 Z" fill="#1A2A3A" stroke="rgba(255,255,255,.04)" stroke-width="0.5"/>' +
    '<path d="M368 82 L406 76 L422 92 L427 122 L422 153 L411 172 L390 177 L374 167 L363 142 L358 112 L364 92 Z" fill="#1A2A3A" stroke="rgba(255,255,255,.04)" stroke-width="0.5"/>' +
    '<path d="M414 28 L542 23 L572 38 L582 58 L561 74 L530 79 L499 74 L468 70 L443 64 L418 54 Z" fill="#1A2A3A" stroke="rgba(255,255,255,.04)" stroke-width="0.5"/>' +
    '<path d="M543 84 L581 79 L597 96 L592 117 L571 122 L549 112 Z" fill="#1A2A3A" stroke="rgba(255,255,255,.04)" stroke-width="0.5"/>' +
    '<path d="M598 132 L651 126 L667 141 L661 162 L640 167 L617 160 L604 147 Z" fill="#1A2A3A" stroke="rgba(255,255,255,.04)" stroke-width="0.5"/>' +
    '<defs>' +
    '<linearGradient id="gw" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2DD4A0" stop-opacity="0.25"/><stop offset="100%" stop-color="#2DD4A0" stop-opacity="0"/></linearGradient>' +
    '<linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FF5E5E" stop-opacity="0.15"/><stop offset="100%" stop-color="#FF5E5E" stop-opacity="0"/></linearGradient>' +
    '</defs>' +
    spotsHTML +
    '<path d="M0 182 Q40 168 80 173 Q120 178 160 163 Q200 148 240 158 Q280 168 320 153 Q360 138 400 148 Q440 158 480 143 Q520 128 560 138 Q600 148 640 133 Q680 118 720 128 Q760 138 800 123 L800 230 L0 230 Z" fill="url(#gw)"/>' +
    '<path d="M0 182 Q40 168 80 173 Q120 178 160 163 Q200 148 240 158 Q280 168 320 153 Q360 138 400 148 Q440 158 480 143 Q520 128 560 138 Q600 148 640 133 Q680 118 720 128 Q760 138 800 123" fill="none" stroke="#2DD4A0" stroke-width="1.8"/>' +
    '<path d="M0 198 Q40 188 80 193 Q120 198 160 188 Q200 178 240 185 Q280 193 320 181 Q360 169 400 178 Q440 187 480 175 Q520 163 560 171 Q600 179 640 168 Q680 156 720 165 Q760 174 800 163 L800 230 L0 230 Z" fill="url(#gr)"/>' +
    '<path d="M0 198 Q40 188 80 193 Q120 198 160 188 Q200 178 240 185 Q280 193 320 181 Q360 169 400 178 Q440 187 480 175 Q520 163 560 171 Q600 179 640 168 Q680 156 720 165 Q760 174 800 163" fill="none" stroke="#FF5E5E" stroke-width="1.4" stroke-opacity="0.6"/>' +
    '</svg>';
}

function showMapTip(e, evDataEncoded) {
  try {
    const ev = JSON.parse(decodeURIComponent(evDataEncoded || '{}'));
    const tip = document.getElementById('ai-map-tooltip');
    if (!tip) return;
    const nameEl  = document.getElementById('ai-tt-name');
    const margeEl = document.getElementById('ai-tt-marge');
    const scoreEl = document.getElementById('ai-tt-score');
    const dateEl  = document.getElementById('ai-tt-date');
    if (nameEl)  nameEl.textContent  = (ev.flag || '') + ' ' + ev.name;
    if (scoreEl) scoreEl.textContent = ev.score || '—';
    if (dateEl)  dateEl.textContent  = ev.date  || '';
    if (margeEl) {
      margeEl.textContent = '+' + ev.marge + '%';
      margeEl.style.color = ev.marge >= 100 ? '#2DD4A0' : ev.marge >= 50 ? '#D4A843' : '#5BA4F5';
    }
    const wrap = document.getElementById('map-body-wrap');
    if (!wrap) return;
    const wRect = wrap.getBoundingClientRect();
    const x = e.clientX - wRect.left;
    const y = e.clientY - wRect.top;
    tip.style.left = Math.min(x + 12, wRect.width - 180) + 'px';
    tip.style.top  = Math.max(4, y - 60) + 'px';
    tip.style.display = 'block';
  } catch(err) { console.warn('showMapTip error', err); }
}
function hideMapTip() {
  const tip = document.getElementById('ai-map-tooltip');
  if (tip) tip.style.display = 'none';
}

window.showMapTip        = showMapTip;
window.scanLiveData      = scanLiveData;
window.hideMapTip        = hideMapTip;

/* ══ AI DASH ══════════════════════════════════ */
async function runDashAI() {
  const input = document.getElementById('ai-dash-input');
  const resp  = document.getElementById('ai-dash-resp');
  if (!input || !resp) return;
  const q = (input.value || '').trim();
  if (!q) return;

  resp.style.display = 'block';
  resp.style.color   = 'var(--v6-t3)';
  resp.textContent   = '⟳ Analyse en cours...';

  try {
    const backendUrl = S.apiUrl || CONFIG.BACKEND_URL;
    const context    = allEvs().slice(0,10).map(e =>
      `${e.name} (${e.marge}% marge, ${e.date || ''})`
    ).join(', ');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        system: `Tu es un expert en revente de billets. Contexte marché actuel: ${context}. Réponds en 2-3 phrases max, direct et actionnable.`,
        messages: [{ role: 'user', content: q }]
      })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || 'Erreur API';
    resp.style.color = 'var(--v6-t2)';
    resp.textContent = text;
  } catch(err) {
    resp.style.color   = 'var(--v6-red)';
    resp.textContent   = 'Erreur : ' + err.message;
  }
}

window.runDashAI           = runDashAI;

function setDashQ(q) {
  const el = document.getElementById('ai-q-dash');
  if (el) el.value = q;
}

function askDashAI() {
  const q = (document.getElementById('ai-q-dash')?.value || '').toLowerCase();
  const respEl = document.getElementById('ai-resp-text-dash');
  if (!respEl) return;
  respEl.innerHTML = '<span style="color:var(--purple)">Analyse en cours...</span>';
  const all = allEvs();
  const top = all.slice().sort((a,b) => b.marge - a.marge)[0] || {};
  const drops = all.filter(e => hasDrop(e) && dropPct(e) <= -5).length;
  setTimeout(() => {
    let resp = '';
    if (q.includes('presale') || q.includes('amex')) {
      const ps = all.filter(e => e.presale_code === 'AMEX').slice(0, 3);
      resp = '<span style="color:var(--teal);font-weight:600">Presale AMEX</span> — ' + (ps.map(e => e.name + ' (+' + e.marge + '%)').join(', ') || 'Aucun trouvé') + '. Action : inscrire sur ticketmaster.fr.';
    } else if (q.includes('vendre') || q.includes('sell')) {
      resp = '<span style="color:var(--red);font-weight:600">Signal VENDRE</span> — Peak estimé pour <strong>' + (top.name || 'Champions League') + '</strong> dans 3-5 jours. Prix actuel : ' + (top.resale || 0) + '€.';
    } else if (q.includes('annulation') || q.includes('impact')) {
      resp = '<span style="color:var(--gold2);font-weight:600">Analyse impact</span> — Une annulation génère +23% de demande sur les events similaires dans les 30 jours.';
    } else if (q.includes('top') || q.includes('acheter') || q.includes('buy')) {
      const buys = all.filter(e => e.marge >= 80).slice(0, 3);
      resp = '<span style="color:var(--teal);font-weight:600">Top signaux ACHETER</span> — ' + (buys.map((e,i) => (i+1) + '. ' + e.name + ' (+' + e.marge + '%)').join(' · ') || 'Lance un scan');
    } else {
      resp = '<span style="color:var(--purple);font-weight:600">Analyse</span> — ' + all.length + ' events. Meilleure : <strong>' + (top.name || '—') + '</strong> (+' + (top.marge || 0) + '%). ' + (drops > 0 ? drops + ' chutes. ' : '') + ((top.marge || 0) >= 100 ? '🟢 ACHETER' : '👁 SURVEILLER') + '.';
    }
    respEl.innerHTML = resp;
  }, 700);
}

function globalSearch(q) {
  if (!q) { render(); return; }
  const lq = q.toLowerCase();
  const filtered = allEvs().filter(e => e.name.toLowerCase().includes(lq) || (e.sub||'').toLowerCase().includes(lq));
  const c = document.getElementById('content');
  if (!c) return;
  if (filtered.length === 0) {
    c.innerHTML = '<div class="empty"><div class="empty-icon">🔍</div><div class="empty-txt">Aucun résultat pour "' + q + '"</div></div>';
    return;
  }
  c.innerHTML = '<div style="padding:0 0 12px"><div style="font-family:var(--font-mono);font-size:10px;color:var(--t2);margin-bottom:14px">' + filtered.length + ' résultat(s) pour "' + q + '"</div>' + buildTable(filtered) + '</div>';
}

window.askDashAI           = askDashAI;
window.setDashQ            = setDashQ;
window.globalSearch        = globalSearch;

/* ── Previously missing exports (caused "is not defined" errors) ── */
window.S                   = S;
window.saveState           = saveState;
window.render              = render;
window.applyTheme          = applyTheme;
window.editKanbanPrice     = editKanbanPrice;
window.editKanbanQty       = editKanbanQty;
window.buildHeatmapSVG     = buildHeatmapSVG;
window.allEvs              = allEvs;
