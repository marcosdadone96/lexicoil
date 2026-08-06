/**
 * horenT4OpeningsBank.mjs — Aperturas del moderador para Hören T4 (debate).
 * Mismo patrón que horenOpeningsBank.mjs / horenT3OpeningsBank.mjs.
 * Nombres de invitados: nameRotation.mjs (no tocar aquí).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

const CONFIG_FILE = path.join(ROOT, 'data', 'horen-t4-openings-bank.json');

let _cache = null;

export function loadHorenT4OpeningsConfig() {
  if (_cache) return _cache;
  if (!fs.existsSync(CONFIG_FILE)) {
    _cache = { openings: [], promptDe: '' };
    return _cache;
  }
  _cache = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  return _cache;
}

export function resetHorenT4OpeningsCache() {
  _cache = null;
}

/** One-line block for Hören T4 generation prompts. */
export function buildHorenT4OpeningsPromptBlock() {
  const cfg = loadHorenT4OpeningsConfig();
  const openings = (cfg.openings || []).map((o) => String(o || '').trim()).filter(Boolean);
  const line = String(cfg.promptDe || '')
    .trim()
    .replaceAll('{{OPENINGS}}', openings.join(' · '));
  return line ? `\n- ${line}\n` : '';
}

export function getHorenT4Openings() {
  const cfg = loadHorenT4OpeningsConfig();
  return (cfg.openings || []).map((o) => String(o || '').trim()).filter(Boolean);
}
