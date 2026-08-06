/**
 * horenT1OpeningsBank.mjs — Aperturas por tipo de segmento (Hören T1).
 * Mismo patrón que horenOpeningsBank.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

const CONFIG_FILE = path.join(ROOT, 'data', 'horen-t1-openings-bank.json');

const TYPE_KEYS = ['durchsage', 'telefonat', 'radio_tipp', 'hinweis'];

let _cache = null;

export function loadHorenT1OpeningsConfig() {
  if (_cache) return _cache;
  if (!fs.existsSync(CONFIG_FILE)) {
    _cache = { promptDe: '' };
    for (const k of TYPE_KEYS) _cache[k] = [];
    return _cache;
  }
  _cache = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  return _cache;
}

export function resetHorenT1OpeningsCache() {
  _cache = null;
}

function joinList(arr) {
  return (arr || []).map((o) => String(o || '').trim()).filter(Boolean).join(' · ');
}

/** Block for Hören T1 generation prompts (per-type openings). */
export function buildHorenT1OpeningsPromptBlock() {
  const cfg = loadHorenT1OpeningsConfig();
  const line = String(cfg.promptDe || '')
    .trim()
    .replaceAll('{{DURCHSAGE}}', joinList(cfg.durchsage))
    .replaceAll('{{TELEFONAT}}', joinList(cfg.telefonat))
    .replaceAll('{{RADIO_TIPP}}', joinList(cfg.radio_tipp))
    .replaceAll('{{HINWEIS}}', joinList(cfg.hinweis));
  return line ? `\n- ${line}\n` : '';
}

export function getHorenT1OpeningsForType(typeKey) {
  const cfg = loadHorenT1OpeningsConfig();
  const key = String(typeKey || '').toLowerCase();
  return (cfg[key] || []).map((o) => String(o || '').trim()).filter(Boolean);
}
