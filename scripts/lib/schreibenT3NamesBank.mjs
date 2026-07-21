/**
 * schreibenT3NamesBank.mjs — rotate Nachbar surnames in Schreiben T3 (AUD-5 extension).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

const CONFIG_FILE = path.join(ROOT, 'data', 'schreiben-t3-names-bank.json');

let _cache = null;

export function loadSchreibenT3NamesConfig() {
  if (_cache) return _cache;
  if (!fs.existsSync(CONFIG_FILE)) {
    _cache = { surnames: [], excludeSurnames: [], promptDe: '' };
    return _cache;
  }
  _cache = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  return _cache;
}

export function buildSchreibenT3NamesPromptBlock(chosenSurname = null) {
  const cfg = loadSchreibenT3NamesConfig();
  const surnames = (cfg.surnames || []).map((s) => String(s || '').trim()).filter(Boolean);
  const exclude = (cfg.excludeSurnames || []).map((s) => String(s || '').trim()).filter(Boolean);
  let line = String(cfg.promptDe || '')
    .trim()
    .replaceAll('{{SURNAMES}}', surnames.join(', '))
    .replaceAll('{{EXCLUDE}}', exclude.join(', '));
  if (chosenSurname) {
    line += ` Usa «Herr ${chosenSurname}» o «Frau ${chosenSurname}» como Nachbar/in en Teil 3 (no Klein/Schmidt salvo que sea único en el archivo).`;
  }
  return line ? `\n- ${line}\n` : '';
}

/** Pick least-used surname from generated Schreiben batches. */
export function pickNextSchreibenT3Surname(generatedDir, opts = {}) {
  const cfg = loadSchreibenT3NamesConfig();
  const exclude = new Set((cfg.excludeSurnames || []).map((s) => String(s).trim()));
  const pool = (cfg.surnames || []).filter((s) => s && !exclude.has(s));
  const stats = new Map();
  for (const s of pool) stats.set(s, 0);

  const dirs = [generatedDir, path.join(ROOT, 'batches/ready/pool-verified')];
  for (const dir of dirs) {
    if (!dir || !fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!/^schreiben.*\.json$/i.test(name)) continue;
      try {
        const batch = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
        const q = (batch.questions || []).find((x) => Number(x.teil) === 3);
        const m = String(q?.question || '').match(/\bHerr(?:n)?\s+([A-ZÄÖÜ][a-zäöüß]+)|\bFrau\s+([A-ZÄÖÜ][a-zäöüß]+)/);
        const sn = m?.[1] || m?.[2];
        if (sn && stats.has(sn)) stats.set(sn, (stats.get(sn) || 0) + 1);
      } catch {
        /* skip */
      }
    }
  }

  const ranked = [...stats.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  return ranked[0]?.[0] || pool[0] || 'Krüger';
}
