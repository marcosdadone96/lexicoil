/**
 * excludedPremises.mjs — Premisas temáticas vetadas temporalmente (lista editable en data/).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

const CONFIG_FILE = path.join(ROOT, 'data', 'excluded-premises.json');

let _cache = null;

export function loadExcludedPremisesConfig() {
  if (_cache) return _cache;
  if (!fs.existsSync(CONFIG_FILE)) {
    _cache = { premises: [], promptDe: '' };
    return _cache;
  }
  _cache = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  return _cache;
}

/** Reset cached config (tests). */
export function resetExcludedPremisesCache() {
  _cache = null;
}

/** @param {string} text */
export function textMatchesExcludedPremise(text) {
  const cfg = loadExcludedPremisesConfig();
  const lower = String(text || '').toLowerCase();
  return (cfg.premises || []).some((p) => {
    const needle = String(p || '').toLowerCase().trim();
    return needle && lower.includes(needle);
  });
}

/** @param {object|null|undefined} subtypeDef */
export function subtypeMatchesExcludedPremise(subtypeDef) {
  if (!subtypeDef) return false;
  const fields = [
    subtypeDef.id,
    subtypeDef.label,
    subtypeDef.setting,
    subtypeDef.ruleFocus,
    subtypeDef.titleExample,
  ];
  if (subtypeDef.keywords?.source) fields.push(subtypeDef.keywords.source);
  return fields.some((f) => textMatchesExcludedPremise(f));
}

/** One-line block for T1/T2 generation prompts. */
export function buildExcludedPremisesPromptBlock() {
  const cfg = loadExcludedPremisesConfig();
  const line = String(cfg.promptDe || '').trim();
  return line ? `\n- ${line}\n` : '';
}
