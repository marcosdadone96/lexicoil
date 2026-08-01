/**
 * horenOpeningsBank.mjs — Aperturas rotativas para Hören T2 (B1).
 * Evita convergencia a «Herzlich willkommen zu unserem heutigen Beitrag über ein Thema…».
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

const CONFIG_FILE = path.join(ROOT, 'data', 'horen-t2-openings-bank.json');
const TOPIC_FILE = path.join(ROOT, 'data', 'horen-t2-openings-by-topic.json');

/** Fórmulas sobreusadas detectadas en pool (Freizeit×3 y otros). */
export const HOREN_T2_BANNED_OPENING_RES = [
  /herzlich willkommen zu unserem heutigen beitrag/i,
  /ein thema, das uns alle betrifft/i,
  /heute sprechen wir über ein thema, das uns alle betrifft/i,
  /guten tag, liebe zuhörerinnen und zuhörer\.?\s*herzlich willkommen/i,
];

let _cache = null;

export function loadHorenT2OpeningsConfig() {
  if (_cache) return _cache;
  if (!fs.existsSync(CONFIG_FILE)) {
    _cache = { openings: [], bannedDe: [], promptDe: '' };
    return _cache;
  }
  _cache = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  return _cache;
}

export function resetHorenT2OpeningsCache() {
  _cache = null;
}

export function getHorenT2Openings() {
  const cfg = loadHorenT2OpeningsConfig();
  return (cfg.openings || []).map((o) => String(o || '').trim()).filter(Boolean);
}

let _topicCache = null;

export function loadHorenT2OpeningsByTopic() {
  if (_topicCache) return _topicCache;
  if (!fs.existsSync(TOPIC_FILE)) {
    _topicCache = {};
    return _topicCache;
  }
  _topicCache = JSON.parse(fs.readFileSync(TOPIC_FILE, 'utf8'));
  return _topicCache;
}

export function getHorenT2OpeningsForTopic(topic) {
  const canonical = String(topic || '').trim();
  const byTopic = loadHorenT2OpeningsByTopic();
  const specific = (byTopic[canonical] || []).map((o) => String(o || '').trim()).filter(Boolean);
  if (specific.length >= 3) return specific;
  return getHorenT2Openings();
}

/**
 * @param {Set<string>|string[]} [exclude]
 * @param {string|number} [entropy]
 * @param {string} [topic] — B1 topicTag (e.g. Bildung)
 */
export function pickNextHorenT2Opening(exclude = new Set(), entropy = Date.now(), topic = null) {
  const excludeSet =
    exclude instanceof Set ? exclude : new Set((exclude || []).map((s) => String(s).trim()).filter(Boolean));
  const openings = topic ? getHorenT2OpeningsForTopic(topic) : getHorenT2Openings();
  const available = openings.filter((o) => !excludeSet.has(o));
  const pool = available.length ? available : openings;
  if (!pool.length) return { opening: null, index: -1, exhausted: true };
  const seed = String(entropy);
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const index = hash % pool.length;
  return { opening: pool[index], index, exhausted: available.length <= 1 };
}

/**
 * @param {{ mandatedOpening?: string|null, sessionExclude?: Set<string>|string[] }} [opts]
 */
export function buildHorenT2OpeningsPromptBlock(opts = {}) {
  const cfg = loadHorenT2OpeningsConfig();
  const banned = (cfg.bannedDe || []).map((b) => String(b || '').trim()).filter(Boolean);
  const mandated = String(opts.mandatedOpening || '').trim();
  const topic = opts.topic ? String(opts.topic).trim() : null;
  const lines = [];

  if (mandated) {
    lines.push(
      `APERTURA OBLIGATORIA del monólogo (primeras palabras, tal cual en alemán): «${mandated}…»`,
      'Continúa el Vortrag desde ahí con contenido nuevo al tema pedido. NO sustituyas por otra fórmula genérica.',
    );
  } else {
    const openings = topic ? getHorenT2OpeningsForTopic(topic) : getHorenT2Openings();
    const line = String(cfg.promptDe || '')
      .trim()
      .replaceAll('{{OPENINGS}}', openings.join(' · '));
    if (line) lines.push(line);
  }

  lines.push(
    'PROHIBIDO usar estas fórmulas de apertura (ya saturadas en el pool): ' +
      (banned.length ? banned.join(' | ') : '(ver lista interna)'),
  );
  lines.push(
    'Varía estructura y registro: puede ser Vortrag universitario, Podcast-Einleitung, Radiobeitrag, Vereinsansprache — no siempre «Willkommen zu unserem Beitrag».',
  );

  return `\n- ${lines.join('\n- ')}\n`;
}

export function isHorenT2BannedOpening(text) {
  const t = String(text || '').slice(0, 220);
  return HOREN_T2_BANNED_OPENING_RES.some((re) => re.test(t));
}

/** Primeras N palabras normalizadas para comparación n-grama. */
export function horenT2OpeningWordTokens(text, n = 12) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, n);
}

/** N-gramas de 5 palabras del inicio del monólogo. */
export function horenT2OpeningFiveGrams(text) {
  const words = horenT2OpeningWordTokens(text, 40);
  const grams = [];
  for (let i = 0; i <= words.length - 5; i += 1) {
    grams.push(words.slice(i, i + 5).join(' '));
  }
  return grams;
}
