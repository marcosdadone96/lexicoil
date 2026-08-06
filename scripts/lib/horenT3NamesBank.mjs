/**
 * horenT3NamesBank.mjs — Pares de hablantes para Hören T3.
 * Mismo patrón que horenT1NamesBank.mjs / lesenT3NamesBank.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

const CONFIG_FILE = path.join(ROOT, 'data', 'horen-t3-names-bank.json');

let _cache = null;

export function loadHorenT3NamesConfig() {
  if (_cache) return _cache;
  if (!fs.existsSync(CONFIG_FILE)) {
    _cache = { pairs: [], excludeNames: [], promptDe: '' };
    return _cache;
  }
  _cache = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  return _cache;
}

export function resetHorenT3NamesCache() {
  _cache = null;
}

function formatPairs(pairs) {
  return (pairs || [])
    .map((p) => {
      if (Array.isArray(p) && p.length >= 2) return `${p[0]}+${p[1]}`;
      return String(p || '').trim();
    })
    .filter(Boolean)
    .join(', ');
}

/** One-line block for Hören T3 generation prompts. */
export function buildHorenT3NamesPromptBlock() {
  const cfg = loadHorenT3NamesConfig();
  const pairsLine = formatPairs(cfg.pairs);
  const exclude = (cfg.excludeNames || []).map((s) => String(s || '').trim()).filter(Boolean);
  const line = String(cfg.promptDe || '')
    .trim()
    .replaceAll('{{PAIRS}}', pairsLine)
    .replaceAll('{{EXCLUDE}}', exclude.join(', '));
  return line ? `\n- ${line}\n` : '';
}

/**
 * Pick a speaker pair (rotate by index).
 * @param {number} [index]
 * @returns {[string, string]}
 */
export function pickHorenT3NamePair(index = 0) {
  const pairs = loadHorenT3NamesConfig().pairs || [];
  if (!pairs.length) return ['Jonas', 'Emma'];
  const i = ((Number(index) || 0) % pairs.length + pairs.length) % pairs.length;
  const p = pairs[i];
  if (Array.isArray(p) && p.length >= 2) return [String(p[0]), String(p[1])];
  return ['Jonas', 'Emma'];
}
