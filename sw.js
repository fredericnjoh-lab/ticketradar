/* ═══════════════════════════════════════════════════
   TicketRadar — Service Worker v4.1
   Scan automatique toutes les heures.
   Envoie les alertes Telegram si marge > seuil.
═══════════════════════════════════════════════════ */

const CACHE_NAME = 'ticketradar-v4';
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 heure

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
  scheduleCheck();
});

/* ── Config reçue depuis l'app ── */
self.addEventListener('message', e => {
  if (e.data?.type === 'CONFIG') {
    self.CONFIG = e.data.payload;
    console.log('[SW] Config reçue:', self.CONFIG);
  }
  if (e.data?.type === 'CHECK_NOW') {
    checkAndAlert();
  }
});

/* ── Scheduler toutes les heures ── */
function scheduleCheck() {
  setInterval(checkAndAlert, CHECK_INTERVAL_MS);
  setTimeout(checkAndAlert, 10000); // Premier check après 10s
}

/* ── Check principal ── */
async function checkAndAlert() {
  const config = self.CONFIG;
  if (!config?.sheetUrl || !config?.tgToken || !config?.tgChatId) {
    console.log('[SW] Config incomplète — skip');
    return;
  }

  try {
    console.log('[SW] Scan en cours...');

    // Fetch le Google Sheet via Apps Script
    const res = await fetch(config.sheetUrl, { cache: 'no-store' });
    if (!res.ok) { console.log('[SW] Fetch failed:', res.status); return; }

    const text = await res.text();
    const events = parseData(text);
    if (!events.length) { console.log('[SW] Aucun event'); return; }

    const seuil = config.seuil || 30;

    // Calcule les marges et filtre
    const hits = events
      .map(ev => {
        const face = parseFloat(ev.face) || 0;
        const resale = parseFloat(ev.resale) || 0;
        if (!face || !resale) return null;
        const marge = Math.round(((resale * 0.85 - face) / face) * 100);
        return { ...ev, marge };
      })
      .filter(ev => ev && ev.marge >= seuil)
      .sort((a, b) => b.marge - a.marge);

    if (!hits.length) { console.log('[SW] Aucune opportunité > ' + seuil + '%'); return; }

    // Anti-spam — ne re-notifie pas les mêmes events
    const cache = await caches.open(CACHE_NAME);
    const notified = await getNotified(cache);
    const newHits = hits.filter(ev => !notified.includes(ev.name + '_' + ev.marge));

    if (!newHits.length) { console.log('[SW] Déjà notifié'); return; }

    // Envoie max 3 alertes Telegram par scan
    let sent = 0;
    for (const ev of newHits.slice(0, 3)) {
      const msg =
        '🔥 TicketRadar — Nouvelle opportunité !\n\n' +
        (ev.flag || '🎫') + ' ' + ev.name + '\n' +
        '💰 Marge : +' + ev.marge + '%\n' +
        '🎫 Face : ' + ev.face + '€ → Revente : ' + ev.resale + '€\n' +
        '📅 ' + (ev.date || '') + '\n' +
        '🏪 ' + (ev.platform || '') + '\n' +
        '⚡ Seuil : +' + seuil + '%\n\n' +
        '👉 https://fredericnjoh-lab.github.io/ticketradar/';

      try {
        const r = await fetch(
          'https://api.telegram.org/bot' + config.tgToken + '/sendMessage',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: config.tgChatId, text: msg })
          }
        );
        const d = await r.json();
        if (d.ok) {
          sent++;
          await markNotified(cache, ev.name + '_' + ev.marge);
          console.log('[SW] ✓ Alerte envoyée:', ev.name);
        }
      } catch (e) {
        console.log('[SW] Erreur Telegram:', e.message);
      }
    }

    console.log('[SW] Scan terminé —', sent, 'alertes envoyées');

    // Notification push navigateur en bonus
    if (sent > 0 && newHits[0]) {
      const top = newHits[0];
      try {
        await self.registration.showNotification('🔥 TicketRadar — ' + top.name, {
          body: '+' + top.marge + '% · ' + top.platform,
          icon: '/ticketradar/icon-192.png',
          tag: 'ticketradar-auto',
          data: { url: 'https://fredericnjoh-lab.github.io/ticketradar/' }
        });
      } catch(e) {}
    }

  } catch (err) {
    console.error('[SW] Erreur:', err);
  }
}

/* ── Notification click ── */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || 'https://fredericnjoh-lab.github.io/ticketradar/';
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const c of list) {
        if (c.url.includes('/ticketradar') && 'focus' in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});

/* ── Parse JSON (Apps Script) ou CSV ── */
function parseData(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed); } catch(e) {}
  }
  // CSV fallback
  const lines = trimmed.split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  return lines.slice(1).map(line => {
    const cols = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (cols[i] || '').replace(/"/g, '').trim(); });
    return obj;
  }).filter(r => r.name);
}

/* ── Anti-spam ── */
async function getNotified(cache) {
  try {
    const r = await cache.match('__notified__');
    if (!r) return [];
    return await r.json();
  } catch { return []; }
}

async function markNotified(cache, key) {
  try {
    const keys = await getNotified(cache);
    if (!keys.includes(key)) {
      keys.push(key);
      await cache.put('__notified__', new Response(JSON.stringify(keys.slice(-200))));
    }
  } catch {}
}
