/**
 * lesenT3NamesBank.mjs — Nombres de buscador sugeridos para Lesen T3 (lista editable en data/).
 * Mismo patrón que horenOpeningsBank.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

const CONFIG_FILE = path.join(ROOT, 'data', 'lesen-t3-names-bank.json');

let _cache = null;

export function loadLesenT3NamesConfig() {
  if (_cache) return _cache;
  if (!fs.existsSync(CONFIG_FILE)) {
    _cache = { names: [], excludeSurnames: [], promptDe: '' };
    return _cache;
  }
  _cache = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  return _cache;
}

/** Reset cached config (tests). */
export function resetLesenT3NamesCache() {
  _cache = null;
}

/** One-line block for Lesen T3 generation prompts. */
export function buildLesenT3NamesPromptBlock() {
  const cfg = loadLesenT3NamesConfig();
  const names = (cfg.names || []).map((n) => String(n || '').trim()).filter(Boolean);
  const exclude = (cfg.excludeSurnames || []).map((s) => String(s || '').trim()).filter(Boolean);
  const line = String(cfg.promptDe || '')
    .trim()
    .replaceAll('{{NAMES}}', names.join(', '))
    .replaceAll('{{EXCLUDE}}', exclude.join(', '));
  return line ? `\n- ${line}\n` : '';
}

/**
 * Pick a seeker name for deterministic make-t3 (rotate by seed/index).
 * @param {number} [index]
 */
export function pickLesenT3SeekerName(index = 0) {
  const names = loadLesenT3NamesConfig().names || [];
  if (!names.length) return 'Herr Keller';
  const i = ((Number(index) || 0) % names.length + names.length) % names.length;
  return names[i];
}

/**
 * Adjust possessive pronouns after a seeker name swap (Herr↔Frau).
 */
function adjustPossessivesForGender(text, toFrau) {
  let out = String(text || '');
  if (toFrau) {
    return out
      .replace(/\bseinem\b/g, 'ihrem')
      .replace(/\bseiner\b/g, 'ihrer')
      .replace(/\bseine\b/g, 'ihre')
      .replace(/\bseinen\b/g, 'ihren')
      .replace(/\bsein\b/g, 'ihr');
  }
  return out
    .replace(/\bihrem\b/g, 'seinem')
    .replace(/\bihrer\b/g, 'seiner')
    .replace(/\bihre\b/g, 'seine')
    .replace(/\bihren\b/g, 'seinen')
    .replace(/\bihr\b/g, 'sein');
}

const TITLED_SEEKER_RE = /\b(?:Herr|Frau|Opa)\s+[A-ZÄÖÜ][a-zäöüß]+/;

/**
 * Replace Herr/Frau Ott (and bare Ott as titled form) in a situation string.
 * Adjusts possessive agreement only when the seeker name actually changes.
 * @param {object} [opts]
 * @param {boolean} [opts.replaceAnySeeker] — q7 slot: replace Walter/Stein/Vogel/etc.
 */
export function replaceLesenT3SeekerName(text, newName, opts = {}) {
  const src = String(text || '');
  const name = String(newName || '').trim();
  if (!name || !src) return src;
  const toFrau = /^Frau\s+/i.test(name);

  let out = src
    .replace(/\bHerr Ott\b/g, name)
    .replace(/\bFrau Ott\b/g, name);
  let replaced = out !== src;

  if (opts.replaceAnySeeker && TITLED_SEEKER_RE.test(out)) {
    const before = out;
    out = out.replace(TITLED_SEEKER_RE, name);
    replaced = replaced || out !== before;
  }

  if (replaced) {
    out = adjustPossessivesForGender(out, toFrau);
  }
  return out;
}
