'use strict';

const DEFAULT_FREE_COMBO = { lang: 'de', level: 'B1' };
const FREE_LANGS = ['de', 'en', 'es'];
const FREE_LEVELS = ['B1', 'B2', 'C1'];

function normalizeFreeCombo(raw) {
  const lang = String(raw?.lang || raw?.subject || '').trim().toLowerCase();
  const level = String(raw?.level || '').trim().toUpperCase();
  if (FREE_LANGS.includes(lang) && FREE_LEVELS.includes(level)) {
    return { lang, level };
  }
  return { ...DEFAULT_FREE_COMBO };
}

function parseFreeComboFromBody(body) {
  if (!body || typeof body !== 'object') return null;
  const lang = String(body.lang || body.subject || '').trim().toLowerCase();
  const level = String(body.level || '').trim().toUpperCase();
  if (!lang && !level) return null;
  return normalizeFreeCombo({ lang, level });
}

function parseFreeComboFromMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const lang = String(meta.free_combo_lang || meta.freeComboLang || '').trim().toLowerCase();
  const level = String(meta.free_combo_level || meta.freeComboLevel || '').trim().toUpperCase();
  if (!lang && !level) return null;
  return normalizeFreeCombo({ lang, level });
}

function ensureUserFreeCombo(user) {
  if (!user || user.pro || user.plan === 'pro') return user;
  if (user.freeCombo?.lang && user.freeCombo?.level) {
    user.freeCombo = normalizeFreeCombo(user.freeCombo);
    return user;
  }
  user.freeCombo = { ...DEFAULT_FREE_COMBO };
  return user;
}

function freeComboForResponse(user) {
  if (!user || user.pro || user.plan === 'pro') return null;
  return normalizeFreeCombo(user.freeCombo || DEFAULT_FREE_COMBO);
}

module.exports = {
  DEFAULT_FREE_COMBO,
  FREE_LANGS,
  FREE_LEVELS,
  normalizeFreeCombo,
  parseFreeComboFromBody,
  parseFreeComboFromMeta,
  ensureUserFreeCombo,
  freeComboForResponse,
};
