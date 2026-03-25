
// ==========================
// CONFIG PLATFORM FEES
// ==========================
const PLATFORM_RULES = {
  stubhub: { sellerFee: 0.15 },
  viagogo: { sellerFee: 0.15 },
  seatgeek: { sellerFee: 0.10 },
  ticketmaster: { sellerFee: 0.10 },
  ticketswap: { sellerFee: 0.08 },
  fnac: { sellerFee: 0.12 }
};

function getSellerFee(platformName = '') {
  const p = platformName.toLowerCase();
  if (p.includes('stubhub')) return PLATFORM_RULES.stubhub.sellerFee;
  if (p.includes('viagogo')) return PLATFORM_RULES.viagogo.sellerFee;
  if (p.includes('seatgeek')) return PLATFORM_RULES.seatgeek.sellerFee;
  if (p.includes('ticketmaster')) return PLATFORM_RULES.ticketmaster.sellerFee;
  if (p.includes('ticketswap')) return PLATFORM_RULES.ticketswap.sellerFee;
  if (p.includes('fnac')) return PLATFORM_RULES.fnac.sellerFee;
  return 0.15;
}

function calcMargin(face, resale, platformName = '') {
  if (!face || !resale) return 0;
  const fee = getSellerFee(platformName);
  const net = resale * (1 - fee);
  return Math.round(((net - face) / face) * 100);
}

// ==========================
// LOAD GOOGLE SHEET
// ==========================
async function loadSheet() {
  const infoEl = document.getElementById('data-source-info');

  if (!S.sheetUrl) {
    infoEl.innerHTML = '❌ No URL';
    return;
  }

  try {
    const res = await fetch(S.sheetUrl);
    if (!res.ok) throw new Error("Fetch error");

    const text = await res.text();
    console.log("RAW CSV:", text);

    const events = parseCsv(text);

    if (!events.length) throw new Error("Empty parse");

    S.sheetEvents = events;
    S.sheetLoaded = true;

    infoEl.innerHTML = `✅ ${events.length} events`;

    render();

  } catch (err) {
    console.error(err);
    infoEl.innerHTML = `❌ ${err.message}`;
  }
}

// ==========================
// PARSE CSV (ROBUST)
// ==========================
function parseCsv(text) {
  const rows = text.split('\n').map(r => r.split(','));

  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.trim().toLowerCase());

  return rows.slice(1).map((cols, i) => {
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] || '').trim();
    });

    const face = Number(row.face);
    const resale = Number(row.resale);

    return {
      id: i + 1,
      name: row.name,
      sub: row.sub,
      date: row.date,
      h: row.horizon || 'mid',
      country: row.country,
      flag: row.flag,
      cat: row.cat,
      platform: row.platform,
      face,
      resale,
      marge: calcMargin(face, resale, row.platform),
      score: Number(row.score || 8)
    };
  }).filter(e => e.name && e.face > 0);
}
