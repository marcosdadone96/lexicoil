/**
 * horenT3OpeningsBank.mjs — Aperturas de diálogo para Hören T3.
 * Mismo patrón que horenOpeningsBank.mjs / horenT1OpeningsBank.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

const CONFIG_FILE = path.join(ROOT, 'data', 'horen-t3-openings-bank.json');

let _cache = null;

export function loadHorenT3OpeningsConfig() {
  if (_cache) return _cache;
  if (!fs.existsSync(CONFIG_FILE)) {
    _cache = { openings: [], promptDe: '' };
    return _cache;
  }
  _cache = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  return _cache;
}

export function resetHorenT3OpeningsCache() {
  _cache = null;
}

/** One-line block for Hören T3 generation prompts. */
export function buildHorenT3OpeningsPromptBlock() {
  const cfg = loadHorenT3OpeningsConfig();
  const openings = (cfg.openings || []).map((o) => String(o || '').trim()).filter(Boolean);
  const line = String(cfg.promptDe || '')
    .trim()
    .replaceAll('{{OPENINGS}}', openings.join(' · '));
  return line ? `\n- ${line}\n` : '';
}

export function getHorenT3Openings() {
  const cfg = loadHorenT3OpeningsConfig();
  return (cfg.openings || []).map((o) => String(o || '').trim()).filter(Boolean);
}
