/* ═══════════════════════════════════════════════════
   TicketRadar — supabase.js
   Auth + Database multi-utilisateurs
═══════════════════════════════════════════════════ */

const SUPABASE_URL  = 'https://ujjivtrfktlervncxvjq.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqaml2dHJma3RsZXJ2bmN4dmpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NTA3MTQsImV4cCI6MjA5MDIyNjcxNH0.CHWMB0zN-HpJ1Wop3EU3kYim6gfcKcrsg3zqnUixfT8';

/* ── Init Supabase client ── */
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

/* ══════════════════════════════════════════════
   AUTH
══════════════════════════════════════════════ */

async function sbSignUp(email, password) {
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

async function sbSignIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function sbSignOut() {
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

async function sbGetUser() {
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

async function sbGetProfile(userId) {
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

async function sbUpdateProfile(userId, updates) {
  const { error } = await sb
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

/* ══════════════════════════════════════════════
   WATCHLIST
══════════════════════════════════════════════ */

async function sbGetWatchlist(userId) {
  const { data, error } = await sb
    .from('watchlist')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data.map(r => r.event_name);
}

async function sbAddToWatchlist(userId, eventName) {
  const { error } = await sb
    .from('watchlist')
    .insert({ user_id: userId, event_name: eventName });
  if (error) throw error;
}

async function sbRemoveFromWatchlist(userId, eventName) {
  const { error } = await sb
    .from('watchlist')
    .delete()
    .eq('user_id', userId)
    .eq('event_name', eventName);
  if (error) throw error;
}

/* ══════════════════════════════════════════════
   KANBAN
══════════════════════════════════════════════ */

async function sbGetKanban(userId) {
  const { data, error } = await sb
    .from('kanban')
    .select('*')
    .eq('user_id', userId)
    .order('added_at', { ascending: true });
  if (error) return { watch: [], bought: [], selling: [], sold: [] };

  const result = { watch: [], bought: [], selling: [], sold: [] };
  data.forEach(row => {
    const col = row.col || 'watch';
    if (result[col]) result[col].push({
      id: row.event_id || row.id,
      name: row.event_name,
      flag: row.flag || '🎫',
      face: row.face || 0,
      resale: row.resale || 0,
      marge: row.marge || 0,
      platform: row.platform || '',
      date: row.date_event || '',
      qty: row.qty || 1,
      notes: row.notes || '',
      soldPrice: row.sold_price,
      addedAt: new Date(row.added_at).toLocaleDateString('fr-FR'),
      _dbId: row.id,
    });
  });
  return result;
}

async function sbAddToKanban(userId, item, col) {
  const { data, error } = await sb
    .from('kanban')
    .insert({
      user_id:    userId,
      event_id:   item.id,
      event_name: item.name,
      flag:       item.flag,
      face:       item.face,
      resale:     item.resale,
      marge:      item.marge,
      platform:   item.platform,
      date_event: item.date,
      col,
      qty:        item.qty || 1,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function sbMoveKanban(dbId, toCol) {
  const { error } = await sb
    .from('kanban')
    .update({ col: toCol, updated_at: new Date().toISOString() })
    .eq('id', dbId);
  if (error) throw error;
}

async function sbUpdateKanbanResale(dbId, resale, marge) {
  const { error } = await sb
    .from('kanban')
    .update({ resale, marge, updated_at: new Date().toISOString() })
    .eq('id', dbId);
  if (error) throw error;
}

async function sbDeleteKanban(dbId) {
  const { error } = await sb
    .from('kanban')
    .delete()
    .eq('id', dbId);
  if (error) throw error;
}

/* ══════════════════════════════════════════════
   PRICE HISTORY
══════════════════════════════════════════════ */

async function sbSaveSnapshot(userId, events) {
  if (!userId || !events.length) return;
  const today = new Date().toISOString().split('T')[0];
  const rows = events.map(ev => ({
    user_id:      userId,
    event_name:   ev.name?.slice(0, 100),
    flag:         ev.flag || '🎫',
    resale:       ev.resale,
    marge:        ev.marge,
    snapshot_date: today,
  })).filter(r => r.event_name && r.resale > 0);

  // Upsert — update if same day, insert otherwise
  const { error } = await sb
    .from('price_history')
    .upsert(rows, { onConflict: 'user_id,event_name,snapshot_date' });
  if (error) console.warn('[Supabase] Snapshot error:', error.message);
}

async function sbGetPriceHistory(userId) {
  const { data, error } = await sb
    .from('price_history')
    .select('*')
    .eq('user_id', userId)
    .order('snapshot_date', { ascending: true });
  if (error) return {};

  // Group by event_name
  const result = {};
  data.forEach(row => {
    const key = row.event_name;
    if (!result[key]) result[key] = { name: row.event_name, flag: row.flag, snapshots: [] };
    result[key].snapshots.push({ date: row.snapshot_date, resale: row.resale, marge: row.marge });
  });
  return result;
}

/* ══════════════════════════════════════════════
   CUSTOM EVENTS
══════════════════════════════════════════════ */

async function sbGetCustomEvents(userId) {
  const { data, error } = await sb
    .from('custom_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data.map(row => ({
    id: row.id, name: row.name, sub: row.sub || '',
    date: row.date_event || '', flag: row.flag || '🎫',
    cat: row.cat || 'concert', h: row.horizon || 'mid',
    platform: row.platform || '', face: row.face || 0,
    resale: row.resale || 0, marge: row.marge || 0,
    score: row.score || 7.5, qty: row.qty || 1,
    notes: row.notes || '', starred: row.starred || false,
    custom: true, live: false, country: 'CUSTOM',
    prevResale: row.resale || 0,
  }));
}

async function sbSaveCustomEvent(userId, ev) {
  const { data, error } = await sb
    .from('custom_events')
    .insert({
      user_id: userId, name: ev.name, sub: ev.sub,
      date_event: ev.date, flag: ev.flag, cat: ev.cat,
      horizon: ev.h, platform: ev.platform,
      face: ev.face, resale: ev.resale, marge: ev.marge,
      score: ev.score, qty: ev.qty, notes: ev.notes,
    })
    .select().single();
  if (error) throw error;
  return data;
}

async function sbDeleteCustomEvent(id) {
  const { error } = await sb.from('custom_events').delete().eq('id', id);
  if (error) throw error;
}

/* ══════════════════════════════════════════════
   AUTH STATE LISTENER
══════════════════════════════════════════════ */

sb.auth.onAuthStateChange(async (event, session) => {
  console.log('[Auth]', event, session?.user?.email || '—');
  if (event === 'SIGNED_IN' && session?.user) {
    window.currentUser = session.user;
    await loadUserData(session.user.id);
  } else if (event === 'SIGNED_OUT') {
    window.currentUser = null;
    // Reset to local state
    if (typeof render === 'function') render();
  }
});

async function loadUserData(userId) {
  try {
    const [profile, watchlist, kanban, customEvents] = await Promise.all([
      sbGetProfile(userId),
      sbGetWatchlist(userId),
      sbGetKanban(userId),
      sbGetCustomEvents(userId),
    ]);

    // Sync Supabase data into app state S
    if (profile) {
      if (profile.seuil)     S.seuil    = profile.seuil;
      if (profile.lang)      S.lang     = profile.lang;
      if (profile.theme)     S.theme    = profile.theme;
      if (profile.sheet_url) S.sheetUrl = profile.sheet_url;
      if (profile.tg_chat_id) S.tgChatId = profile.tg_chat_id;
    }
    if (watchlist.length)    S.wl           = watchlist;
    if (Object.values(kanban).flat().length) S.kanban = kanban;
    if (customEvents.length) S.customEvents = customEvents;

    console.log('[Auth] Données utilisateur chargées');
    if (typeof applyTheme === 'function') applyTheme();
    if (typeof render === 'function') render();
    if (typeof loadSheet === 'function' && S.sheetUrl) loadSheet();
  } catch(err) {
    console.error('[Auth] Erreur chargement données:', err.message);
  }
}
