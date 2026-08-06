/**
 * horenT1NamesBank.mjs — Nombres de personajes para Hören T1.
 * Mismo patrón que lesenT3NamesBank.mjs / horenOpeningsBank.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

const CONFIG_FILE = path.join(ROOT, 'data', 'horen-t1-names-bank.json');

let _cache = null;

export function loadHorenT1NamesConfig() {
  if (_cache) return _cache;
  if (!fs.existsSync(CONFIG_FILE)) {
    _cache = { names: [], excludeSurnames: [], promptDe: '' };
    return _cache;
  }
  _cache = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  return _cache;
}

export function resetHorenT1NamesCache() {
  _cache = null;
}

export function buildHorenT1NamesPromptBlock() {
  const cfg = loadHorenT1NamesConfig();
  const names = (cfg.names || []).map((n) => String(n || '').trim()).filter(Boolean);
  const exclude = (cfg.excludeSurnames || []).map((s) => String(s || '').trim()).filter(Boolean);
  const line = String(cfg.promptDe || '')
    .trim()
    .replaceAll('{{NAMES}}', names.join(', '))
    .replaceAll('{{EXCLUDE}}', exclude.join(', '));
  return line ? `\n- ${line}\n` : '';
}
