/* ═══════════════════════════════════════════════════
   TicketRadar — Service Worker v4
   Tourne en arrière-plan, même quand l'onglet est fermé.
   Vérifie le Google Sheet toutes les heures.
   Envoie une notification push si marge > seuil.
═══════════════════════════════════════════════════ */

const CACHE_NAME = 'ticketradar-v4';
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 heure

/* ── Installation ── */
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
  // Lance le premier check immédiatement
  scheduleCheck();
});

/* ── Messages depuis l'app principale ── */
self.addEventListener('message', e => {
  if (e.data?.type === 'CONFIG') {
    // Reçoit la config (seuil, URL Sheet) depuis l'app
    self.CONFIG = e.data.payload;
    console.log('[SW] Config reçue:', self.CONFIG);
  }
  if (e.data?.type === 'CHECK_NOW') {
    checkForOpportunities();
  }
});

/* ── Scheduler ── */
function scheduleCheck() {
  setInterval(checkForOpportunities, CHECK_INTERVAL_MS);
  // Premier check après 5 secondes
  setTimeout(checkForOpportunities, 5000);
}

/* ── Check principal ── */
async function checkForOpportunities() {
  const config = self.CONFIG;
  if (!config?.sheetUrl) return;

  try {
    const res = await fetch(config.sheetUrl + '&t=' + Date.now());
    if (!res.ok) return;

    const text = await res.text();
    const events = parseCSV(text);
    const threshold = config.seuil || 30;

    // Filtre les opportunités au-dessus du seuil
    const hits = events.filter(e => {
      const marge = parseFloat(e.marge);
      return !isNaN(marge) && marge >= threshold;
    });

    if (hits.length === 0) return;

    // Évite de re-notifier les mêmes events (anti-spam)
    const cache = await caches.open(CACHE_NAME);
    const notified = await getNotifiedKeys(cache);
    const newHits = hits.filter(e => !notified.includes(e.name + e.marge));

    if (newHits.length === 0) return;

    // Trie par marge décroissante
    newHits.sort((a, b) => parseFloat(b.marge) - parseFloat(a.marge));
    const top = newHits[0];

    // Envoie la notification
    await self.registration.showNotification('🔥 TicketRadar — Nouvelle opportunité !', {
      body: `${top.flag || ''} ${top.name} — +${top.marge}% de marge\n${top.date || ''} · ${top.platform || ''}`,
      icon: '/ticketradar/icon-192.png',
      badge: '/ticketradar/icon-72.png',
      tag: 'ticketradar-alert',
      renotify: true,
      data: { url: self.location.origin + '/ticketradar/' },
      actions: [
        { action: 'open', title: 'Voir l\'opportunité' },
        { action: 'dismiss', title: 'Ignorer' }
      ]
    });

    // Marque comme notifié
    for (const hit of newHits) {
      await markNotified(cache, hit.name + hit.marge);
    }

  } catch (err) {
    console.error('[SW] Erreur check:', err);
  }
}

/* ── Notification click ── */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;

  const url = e.notification.data?.url || self.location.origin + '/ticketradar/';
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      // Ouvre ou focus l'app
      for (const client of clientList) {
        if (client.url.includes('/ticketradar') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

/* ── Parsing CSV ── */
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  return lines.slice(1).map(line => {
    const cols = splitCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (cols[i] || '').replace(/"/g, '').trim(); });
    return obj;
  }).filter(e => e.name);
}

function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += char; }
  }
  result.push(current);
  return result;
}

/* ── Anti-spam cache ── */
async function getNotifiedKeys(cache) {
  const res = await cache.match('__notified__');
  if (!res) return [];
  return res.json();
}

async function markNotified(cache, key) {
  const keys = await getNotifiedKeys(cache);
  if (!keys.includes(key)) {
    keys.push(key);
    // Garde seulement les 100 dernières
    const trimmed = keys.slice(-100);
    await cache.put('__notified__', new Response(JSON.stringify(trimmed)));
  }
}
