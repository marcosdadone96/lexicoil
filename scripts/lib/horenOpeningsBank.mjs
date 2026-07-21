/**
 * horenOpeningsBank.mjs — Aperturas sugeridas para Hören T2 (lista editable en data/).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

const CONFIG_FILE = path.join(ROOT, 'data', 'horen-t2-openings-bank.json');

let _cache = null;

export function loadHorenT2OpeningsConfig() {
  if (_cache) return _cache;
  if (!fs.existsSync(CONFIG_FILE)) {
    _cache = { openings: [], promptDe: '' };
    return _cache;
  }
  _cache = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  return _cache;
}

/** Reset cached config (tests). */
export function resetHorenT2OpeningsCache() {
  _cache = null;
}

/** One-line block for Hören T2 generation prompts. */
export function buildHorenT2OpeningsPromptBlock() {
  const cfg = loadHorenT2OpeningsConfig();
  const openings = (cfg.openings || []).map((o) => String(o || '').trim()).filter(Boolean);
  const line = String(cfg.promptDe || '')
    .trim()
    .replaceAll('{{OPENINGS}}', openings.join(', '));
  return line ? `\n- ${line}\n` : '';
}
