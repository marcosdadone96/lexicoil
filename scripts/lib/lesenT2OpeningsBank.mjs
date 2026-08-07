/**
 * lesenT2OpeningsBank.mjs — Aperturas rotativas para Lesen T2 (B1).
 * Mismo patrón que horenOpeningsBank.mjs (mandato + exclusión en sesión).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

const CONFIG_FILE = path.join(ROOT, 'data', 'lesen-t2-openings-bank.json');

export const LESEN_T2_BANNED_OPENING_RES = [
  /^immer mehr menschen\b/i,
  /^immer mehr menschen entscheiden\b/i,
  /^immer mehr menschen interessieren\b/i,
];

let _cache = null;

export function loadLesenT2OpeningsConfig() {
  if (_cache) return _cache;
  if (!fs.existsSync(CONFIG_FILE)) {
    _cache = { openings: [], bannedDe: [], promptDe: '' };
    return _cache;
  }
  _cache = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  return _cache;
}

export function resetLesenT2OpeningsCache() {
  _cache = null;
}

export function getLesenT2Openings() {
  const cfg = loadLesenT2OpeningsConfig();
  return (cfg.openings || []).map((o) => String(o || '').trim()).filter(Boolean);
}

export function pickNextLesenT2Opening(exclude = new Set(), entropy = Date.now(), _topic = null) {
  const excludeSet =
    exclude instanceof Set ? exclude : new Set((exclude || []).map((s) => String(s).trim()).filter(Boolean));
  const openings = getLesenT2Openings();
  const available = openings.filter((o) => !excludeSet.has(o));
  const pool = available.length ? available : openings;
  if (!pool.length) return { opening: null, index: -1, exhausted: true };
  const seed = String(entropy);
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const index = hash % pool.length;
  return { opening: pool[index], index, exhausted: available.length <= 1 };
}

export function buildLesenT2OpeningsPromptBlock(opts = {}) {
  const cfg = loadLesenT2OpeningsConfig();
  const banned = (cfg.bannedDe || []).map((b) => String(b || '').trim()).filter(Boolean);
  const mandated = String(opts.mandatedOpening || '').trim();
  const lines = [];

  if (mandated) {
    lines.push(
      `APERTURA OBLIGATORIA del primer párrafo (tal cual en alemán): «${mandated}…»`,
      'Continúa el texto informativo desde ahí. NO sustituyas por «Immer mehr Menschen…» ni otra fórmula genérica.',
    );
  } else {
    const openings = getLesenT2Openings();
    const line = String(cfg.promptDe || '')
      .trim()
      .replaceAll('{{OPENINGS}}', openings.join(' · '));
    if (line) lines.push(line);
  }

  lines.push(
    'PROHIBIDO abrir con fórmulas saturadas (p. ej. «Immer mehr Menschen…»). Varía estructura y registro.',
    banned.length ? `Evita también: ${banned.join(' | ')}` : '',
  );

  return `\n- ${lines.filter(Boolean).join('\n- ')}\n`;
}

export function isLesenT2BannedOpening(text) {
  const t = String(text || '').slice(0, 120);
  return LESEN_T2_BANNED_OPENING_RES.some((re) => re.test(t));
}
