'use strict';

/**
 * Server-side Supabase client using the service role key.
 * Bypasses RLS — only use in Netlify Functions, never expose to client.
 *
 * Required env vars:
 *   SUPABASE_URL           — Project URL (e.g. https://xxxx.supabase.co)
 *   SUPABASE_SERVICE_ROLE_KEY — Service role secret key (NOT the anon key)
 */

let _client = null;

function getClient() {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  try {
    const { createClient } = require('@supabase/supabase-js');
    _client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return _client;
  } catch (err) {
    console.error('[supabaseAdmin] Failed to create client:', err.message);
    return null;
  }
}

function isConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// ── User profiles ─────────────────────────────────────────────────────────────

async function upsertUserProfile(userId, email, fields = {}) {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from('lc_user_profiles')
    .upsert({ id: userId, email, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select()
    .single();
  if (error) console.error('[supabaseAdmin] upsertUserProfile:', error.message);
  return data;
}

async function getUserProfile(userId) {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb.from('lc_user_profiles').select('*').eq('id', userId).single();
  if (error && error.code !== 'PGRST116') console.error('[supabaseAdmin] getUserProfile:', error.message);
  return data || null;
}

async function getUserProfileByEmail(email) {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb.from('lc_user_profiles').select('*').eq('email', email).single();
  if (error && error.code !== 'PGRST116') console.error('[supabaseAdmin] getUserProfileByEmail:', error.message);
  return data || null;
}

async function setPlan(userId, plan) {
  const sb = getClient();
  if (!sb) return false;
  const { error } = await sb
    .from('lc_user_profiles')
    .update({ plan, plan_activated_at: plan === 'pro' ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) console.error('[supabaseAdmin] setPlan:', error.message);
  return !error;
}

// ── Quota ─────────────────────────────────────────────────────────────────────

function currentMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function getQuota(userId) {
  const sb = getClient();
  if (!sb) return null;
  const month = currentMonth();
  const { data, error } = await sb
    .from('lc_user_quota')
    .select('used, month')
    .eq('user_id', userId)
    .eq('month', month)
    .single();
  if (error && error.code !== 'PGRST116') console.error('[supabaseAdmin] getQuota:', error.message);
  return data || { used: 0, month };
}

async function incrementQuota(userId) {
  const sb = getClient();
  if (!sb) return null;
  const month = currentMonth();
  const { data, error } = await sb
    .from('lc_user_quota')
    .upsert({ user_id: userId, month, used: 1, updated_at: new Date().toISOString() }, { onConflict: 'user_id,month', ignoreDuplicates: false })
    .select()
    .single();
  if (!error && data) return data;
  // Fallback: manual increment
  const { data: d2, error: e2 } = await sb.rpc('lc_increment_quota', { p_user_id: userId, p_month: month });
  if (e2) console.error('[supabaseAdmin] incrementQuota:', e2.message);
  return d2;
}

async function resetQuota(userId, month) {
  const sb = getClient();
  if (!sb) return false;
  const m = month || currentMonth();
  const { error } = await sb
    .from('lc_user_quota')
    .upsert(
      { user_id: userId, month: m, used: 0, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,month' },
    );
  if (error) console.error('[supabaseAdmin] resetQuota:', error.message);
  return !error;
}

// ── User preferences ──────────────────────────────────────────────────────────

async function getPreferences(userId) {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb.from('lc_user_preferences').select('*').eq('user_id', userId).single();
  if (error && error.code !== 'PGRST116') console.error('[supabaseAdmin] getPreferences:', error.message);
  return data || { user_id: userId, translation_langs: ['en'], tts_voices: {} };
}

async function upsertPreferences(userId, prefs) {
  const sb = getClient();
  if (!sb) return false;
  const { error } = await sb
    .from('lc_user_preferences')
    .upsert({ user_id: userId, ...prefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) console.error('[supabaseAdmin] upsertPreferences:', error.message);
  return !error;
}

// ── BurnedRegistry ────────────────────────────────────────────────────────────

async function getBurned(userId) {
  const sb = getClient();
  if (!sb) return { ids: [] };
  const { data, error } = await sb
    .from('lc_user_burned')
    .select('content_id')
    .eq('user_id', userId);
  if (error) console.error('[supabaseAdmin] getBurned:', error.message);
  return { ids: (data || []).map((r) => r.content_id) };
}

async function addBurned(userId, contentIds) {
  const sb = getClient();
  if (!sb || !contentIds?.length) return false;
  const rows = contentIds.map((id) => ({ user_id: userId, content_id: id }));
  const { error } = await sb.from('lc_user_burned').upsert(rows, { onConflict: 'user_id,content_id', ignoreDuplicates: true });
  if (error) console.error('[supabaseAdmin] addBurned:', error.message);
  return !error;
}

// ── Flashcards ────────────────────────────────────────────────────────────────

async function getFlashcards(userId, lang) {
  const sb = getClient();
  if (!sb) return [];
  const q = sb.from('lc_user_flashcards').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (lang) q.eq('lang', lang);
  const { data, error } = await q;
  if (error) console.error('[supabaseAdmin] getFlashcards:', error.message);
  return data || [];
}

async function upsertFlashcards(userId, cards) {
  const sb = getClient();
  if (!sb || !cards?.length) return false;
  const rows = cards.map((c) => ({ user_id: userId, ...c }));
  const { error } = await sb.from('lc_user_flashcards').upsert(rows, { onConflict: 'user_id,lang,word', ignoreDuplicates: false });
  if (error) console.error('[supabaseAdmin] upsertFlashcards:', error.message);
  return !error;
}

async function deleteFlashcards(userId, keys) {
  const sb = getClient();
  if (!sb || !keys?.length) return false;
  let ok = true;
  for (const k of keys) {
    const lang = String(k.lang || '').trim();
    const wordNorm = String(k.word || '').trim().toLowerCase();
    if (!wordNorm) continue;
    const { error } = await sb
      .from('lc_user_flashcards')
      .delete()
      .eq('user_id', userId)
      .eq('lang', lang)
      .ilike('word', wordNorm);
    if (error) {
      console.error('[supabaseAdmin] deleteFlashcards:', error.message);
      ok = false;
    }
  }
  return ok;
}

// ── Exam history ──────────────────────────────────────────────────────────────

async function addHistory(userId, entry) {
  const sb = getClient();
  if (!sb) return false;
  const { error } = await sb.from('lc_user_history').insert({ user_id: userId, ...entry });
  if (error) console.error('[supabaseAdmin] addHistory:', error.message);
  return !error;
}

function historyEntryKey(e) {
  if (e.id != null && e.id !== '') return String(e.id);
  return `${e.completedAt || e.date || ''}-${e.lang || ''}-${e.level || ''}-${e.score ?? ''}`;
}

function mapHistoryRow(userId, e) {
  let completedAt = null;
  if (e.id) {
    completedAt = new Date(e.id).toISOString();
  } else if (e.completedAt) {
    completedAt = new Date(e.completedAt).toISOString();
  }
  return {
    user_id: userId,
    entry_key: historyEntryKey(e),
    lang: e.lang || '',
    level: e.level || '',
    exam_source: e.examSource ?? null,
    score: e.score ?? null,
    total_questions: null,
    correct_answers: null,
    completed_at: completedAt,
  };
}

/** Upsert exam history from blob sync payload (relational mirror; blob stays authoritative for rich fields). */
async function upsertHistory(userId, entries) {
  const sb = getClient();
  if (!sb || !entries?.length) return false;
  const rows = entries.slice(0, 200).map((e) => mapHistoryRow(userId, e));
  const { error } = await sb
    .from('lc_user_history')
    .upsert(rows, { onConflict: 'user_id,entry_key', ignoreDuplicates: true });
  if (error) console.error('[supabaseAdmin] upsertHistory:', error.message);
  return !error;
}

async function getHistory(userId, limit = 50) {
  const sb = getClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from('lc_user_history')
    .select('*')
    .eq('user_id', userId)
    .order('completed_at', { ascending: false })
    .limit(limit);
  if (error) console.error('[supabaseAdmin] getHistory:', error.message);
  return data || [];
}

// ── Saved exams ───────────────────────────────────────────────────────────────

async function upsertSavedExams(userId, entries) {
  const sb = getClient();
  if (!sb || !entries?.length) return false;
  const now = new Date().toISOString();
  const rows = entries.slice(0, 50).map((e) => ({
    user_id: userId,
    saved_id: String(e.id),
    lang: e.lang || null,
    level: e.level || null,
    topic: e.topic || null,
    mode: e.mode || null,
    status: e.status || null,
    source: e.source || null,
    goal_id: e.goalId || null,
    exam_data: e,
    saved_at: e.id ? new Date(Number(e.id)).toISOString() : null,
    updated_at: now,
  }));
  const { error } = await sb
    .from('lc_user_saved_exams')
    .upsert(rows, { onConflict: 'user_id,saved_id', ignoreDuplicates: false });
  if (error) console.error('[supabaseAdmin] upsertSavedExams:', error.message);
  return !error;
}

async function getSavedExams(userId, limit = 50) {
  const sb = getClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from('lc_user_saved_exams')
    .select('exam_data')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) console.error('[supabaseAdmin] getSavedExams:', error.message);
  return (data || []).map((r) => r.exam_data).filter(Boolean);
}

async function deleteSavedExams(userId, savedIds) {
  const sb = getClient();
  if (!sb || !savedIds?.length) return false;
  const ids = savedIds.map((t) => String(typeof t === 'object' ? t.id : t)).filter(Boolean);
  if (!ids.length) return false;
  const { error } = await sb
    .from('lc_user_saved_exams')
    .delete()
    .eq('user_id', userId)
    .in('saved_id', ids);
  if (error) console.error('[supabaseAdmin] deleteSavedExams:', error.message);
  return !error;
}

// ── Admin ─────────────────────────────────────────────────────────────────────

async function isAdmin(userId) {
  const sb = getClient();
  if (!sb) return false;
  const { data } = await sb.from('lc_admin_roles').select('role').eq('user_id', userId).single();
  return !!data;
}

async function isAdminByEmail(email) {
  const sb = getClient();
  if (!sb) return false;
  const { data } = await sb.from('lc_admin_roles').select('role').eq('email', email).single();
  return !!data;
}

async function listUsers(limit = 100, offset = 0) {
  const sb = getClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from('lc_user_profiles')
    .select('id, email, plan, plan_activated_at, created_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) console.error('[supabaseAdmin] listUsers:', error.message);
  return data || [];
}

async function listPoolExams(lang, level, limit = 50) {
  const sb = getClient();
  if (!sb) return [];
  let q = sb.from('lc_pool_exams').select('id, lang, level, topic, source, coverage_ratio, is_valid, served_count, created_at').order('created_at', { ascending: false }).limit(limit);
  if (lang) q = q.eq('lang', lang);
  if (level) q = q.eq('level', level);
  const { data, error } = await q;
  if (error) console.error('[supabaseAdmin] listPoolExams:', error.message);
  return data || [];
}

async function deletePoolExam(id) {
  const sb = getClient();
  if (!sb) return false;
  const { error } = await sb.from('lc_pool_exams').delete().eq('id', id);
  if (error) console.error('[supabaseAdmin] deletePoolExam:', error.message);
  return !error;
}

async function invalidatePoolExam(id) {
  const sb = getClient();
  if (!sb) return false;
  const { error } = await sb.from('lc_pool_exams').update({ is_valid: false }).eq('id', id);
  if (error) console.error('[supabaseAdmin] invalidatePoolExam:', error.message);
  return !error;
}

// ── Content stats (admin) ─────────────────────────────────────────────────────

async function getContentStats() {
  const sb = getClient();
  if (!sb) return null;
  async function count(table, filter) {
    try {
      let q = sb.from(table).select('*', { count: 'exact', head: true });
      if (filter) q = filter(q);
      const { count: n, error } = await q;
      if (error) {
        console.error('[supabaseAdmin] getContentStats', table, error.message);
        return 0;
      }
      return n || 0;
    } catch (err) {
      console.error('[supabaseAdmin] getContentStats', table, err.message);
      return 0;
    }
  }
  const [passages, questions, pool, users] = await Promise.all([
    count('lc_passages'),
    count('lc_questions'),
    count('lc_pool_exams', (q) => q.eq('is_valid', true)),
    count('lc_user_profiles'),
  ]);
  return { passages, questions, pool_exams: pool, users };
}

module.exports = {
  getClient,
  isConfigured,
  upsertUserProfile,
  getUserProfile,
  getUserProfileByEmail,
  setPlan,
  getQuota,
  incrementQuota,
  resetQuota,
  getPreferences,
  upsertPreferences,
  getBurned,
  addBurned,
  getFlashcards,
  upsertFlashcards,
  deleteFlashcards,
  addHistory,
  upsertHistory,
  getHistory,
  upsertSavedExams,
  getSavedExams,
  deleteSavedExams,
  isAdmin,
  isAdminByEmail,
  listUsers,
  listPoolExams,
  deletePoolExam,
  invalidatePoolExam,
  getContentStats,
};
