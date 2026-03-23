/* ═══════════════════════════════════════════════════
   TicketRadar — config.js
   Toute la configuration en un seul endroit.
   Modifie ce fichier pour personnaliser l'app.
═══════════════════════════════════════════════════ */

const CONFIG = {
  // ── Google Sheet (Apps Script URL recommandée) ──
  SHEET_URL: localStorage.getItem('tr-sheet-url') || '',

  // ── Backend API (Node.js Express) ──
  // En local : 'http://localhost:3000'
  // En prod  : 'https://ticketradar-backend.onrender.com'
  BACKEND_URL: localStorage.getItem('tr-backend-url') || 'https://ticketradar-api.onrender.com',

  // ── Telegram (stocké localement, jamais exposé) ──
  TG_TOKEN:   localStorage.getItem('tr-tg-token')  || '',
  TG_CHAT_ID: localStorage.getItem('tr-tg-chatid') || '',

  // ── App defaults ──
  DEFAULT_SEUIL:    30,    // Seuil d'alerte marge %
  DEFAULT_LANG:    'fr',
  SCAN_INTERVAL_MS: 60 * 60 * 1000, // 1 heure

  // ── Taux de change (mis à jour live si API dispo) ──
  FX: {
    EUR_USD: 1.085, EUR_GBP: 0.856,
    USD_EUR: 0.922, USD_GBP: 0.789,
    GBP_EUR: 1.168, GBP_USD: 1.267,
  },

  // ── Plateformes de revente ──
  PLATFORMS: [
    { id:'stubhub',     name:'StubHub',     logo:'SH', color:'#2DD4A0', region:'USA · UK · EU', fees:15, liquidity:95, speed:92, guarantee:98, coverage:'Sport · Concert · MMA', pros:['FanProtect Guarantee','Paiement rapide (5j)','Large catalogue'], cons:['Frais vendeur élevés','Frais acheteur cumulés'] },
    { id:'viagogo',     name:'Viagogo',     logo:'VG', color:'#D4A843', region:'50+ pays',       fees:15, liquidity:88, speed:80, guarantee:85, coverage:'Concert · Sport · F1',  pros:['Portée internationale','F1 très couvert'],         cons:['Réputation variable','Service lent'] },
    { id:'seatgeek',    name:'SeatGeek',    logo:'SG', color:'#5BA4F5', region:'USA · UK',       fees:10, liquidity:82, speed:90, guarantee:94, coverage:'Sport US · Concert',     pros:['Deal Score™ unique','Frais les plus bas'],          cons:['Peu en Europe','Peu de F1'] },
    { id:'ticketmaster',name:'TM Resale',   logo:'TM', color:'#A78BFA', region:'Mondial',        fees:10, liquidity:90, speed:95, guarantee:96, coverage:'Tous types',             pros:['Billetterie officielle','Livraison instantanée'],   cons:['Marge vendeur réduite','Prix plafonnés'] },
    { id:'ticketswap',  name:'TicketSwap',  logo:'TS', color:'#FF5E5E', region:'EU principalement',fees:8,liquidity:70, speed:85, guarantee:90, coverage:'Concert · Festival',     pros:['Prix plafonné 120%','Frais bas'],                   cons:['Volume limité','Peu F1/sport'] },
    { id:'fanpass',     name:'FanPass',     logo:'FP', color:'#F59E0B', region:'UK · EU',        fees:12, liquidity:65, speed:78, guarantee:88, coverage:'Sport UK · Concert',     pros:['Spécialiste foot UK'],                              cons:['Couverture limitée','Peu connu'] },
  ],

  // ── Marchés ──
  MARKETS: [
    { id:'FR', label:'France 🇫🇷', on:true },
    { id:'UK', label:'UK 🇬🇧',     on:true },
    { id:'US', label:'USA 🇺🇸',    on:true },
    { id:'ES', label:'Espagne 🇪🇸', on:true },
    { id:'F1', label:'F1 🏎️',      on:true },
    { id:'MMA',label:'MMA/UFC 🥊', on:true },
    { id:'AS', label:'Asia 🌏',    on:true },
  ],

  // ── Events fallback (si Sheet non configuré) ──
  FALLBACK_EVENTS: [
    { id:1,  name:'Rosalía – LUX Tour',            sub:'Movistar Arena Madrid',       date:'30 mars 2026',    h:'now', country:'ES', flag:'🇪🇸', cat:'concert', platform:'Viagogo',        face:77,  resale:190,  marge:147, score:9.6, prevResale:220,  starred:false, custom:false, live:false },
    { id:2,  name:'F1 GP Japon – Suzuka',           sub:'Suzuka Circuit',              date:'27–29 mars 2026', h:'now', country:'JP', flag:'🇯🇵', cat:'f1',      platform:'StubHub',        face:340, resale:750,  marge:121, score:9.2, prevResale:750,  starred:false, custom:false, live:false },
    { id:3,  name:'Tame Impala – Madrid',            sub:'Movistar Arena · Agotado',   date:'7 avr. 2026',     h:'mid', country:'ES', flag:'🇪🇸', cat:'concert', platform:'Viagogo',        face:75,  resale:210,  marge:180, score:9.3, prevResale:280,  starred:true,  custom:false, live:false },
    { id:4,  name:'F1 GP Monaco',                   sub:'Circuit de Monaco',           date:'5–7 juin 2026',   h:'mid', country:'MC', flag:'🇲🇨', cat:'f1',      platform:'Viagogo/StubHub',face:900, resale:2400, marge:167, score:9.9, prevResale:2400, starred:false, custom:false, live:false },
    { id:5,  name:'Bruno Mars – The Romantic',       sub:'NFL Stadiums USA',            date:'Avr–Jun 2026',    h:'mid', country:'US', flag:'🇺🇸', cat:'concert', platform:'StubHub',        face:235, resale:625,  marge:166, score:9.7, prevResale:580,  starred:false, custom:false, live:false },
    { id:6,  name:'UFC PPV Las Vegas',               sub:'T-Mobile Arena',             date:'Mai 2026',        h:'mid', country:'US', flag:'🇺🇸', cat:'mma',     platform:'SeatGeek',       face:350, resale:875,  marge:150, score:9.1, prevResale:950,  starred:false, custom:false, live:false },
    { id:7,  name:'Aya Nakamura – Stade de France',  sub:'Saint-Denis · 3 dates',      date:'29–31 mai 2026',  h:'mid', country:'FR', flag:'🇫🇷', cat:'concert', platform:'Ticketmaster FR', face:87,  resale:205,  marge:136, score:9.4, prevResale:205,  starred:false, custom:false, live:false },
    { id:8,  name:'F1 Abu Dhabi – Race Day',         sub:'Yas Marina · Finale saison', date:'3–6 déc. 2026',   h:'far', country:'UAE',flag:'🇦🇪', cat:'f1',      platform:'StubHub',        face:500, resale:1475, marge:195, score:9.9, prevResale:1600, starred:false, custom:false, live:false },
    { id:9,  name:'Beyoncé – Cowboy Carter',         sub:'SoFi Stadium, Los Angeles',  date:'Déc. 2026',       h:'far', country:'US', flag:'🇺🇸', cat:'concert', platform:'StubHub',        face:250, resale:650,  marge:160, score:9.8, prevResale:650,  starred:false, custom:false, live:false },
    { id:10, name:'NBA Christmas Day',               sub:'Lakers vs Warriors',          date:'25 déc. 2026',    h:'far', country:'US', flag:'🇺🇸', cat:'sport',   platform:'StubHub',        face:275, resale:625,  marge:127, score:9.5, prevResale:700,  starred:false, custom:false, live:false },
    { id:11, name:'OrelSan – Accor Arena',           sub:'22–23 déc. Paris',           date:'22–23 déc. 2026', h:'far', country:'FR', flag:'🇫🇷', cat:'concert', platform:'Fnac Spectacles', face:67,  resale:130,  marge:94,  score:9.2, prevResale:130,  starred:false, custom:false, live:false },
    { id:12, name:'Premier League Xmas',             sub:'Arsenal / Man City home',    date:'20–27 déc. 2026', h:'far', country:'UK', flag:'🇬🇧', cat:'sport',   platform:'StubHub UK',     face:100, resale:235,  marge:135, score:9.2, prevResale:235,  starred:false, custom:false, live:false },
    { id:13, name:'F1 GP Miami Sprint',              sub:'Hard Rock Stadium',          date:'1–3 mai 2026',    h:'mid', country:'US', flag:'🇺🇸', cat:'f1',      platform:'SeatGeek',       face:575, resale:1400, marge:143, score:9.5, prevResale:1550, starred:false, custom:false, live:false },
    { id:14, name:'Coachella 2026 W1',               sub:'Empire Polo Club, Indio',    date:'10-12 avr. 2026', h:'mid', country:'US', flag:'🇺🇸', cat:'concert', platform:'StubHub',        face:549, resale:1409, marge:118, score:9.8, prevResale:1409, starred:false, custom:false, live:false },
    { id:15, name:'Champions League Final',          sub:'Puskas Arena Budapest',      date:'30 mai 2026',     h:'mid', country:'HU', flag:'🇭🇺', cat:'sport',   platform:'StubHub',        face:70,  resale:1800, marge:2085,score:9.9, prevResale:1600, starred:false, custom:false, live:false },
  ],
};

// Freeze config to prevent accidental mutation
Object.freeze(CONFIG);
