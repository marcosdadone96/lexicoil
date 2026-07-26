#!/usr/bin/env node
/**
 * Métricas B1 Lesen T1–T5 + Hören T1–T4 desde generation-cost.jsonl (día UTC).
 * Llamadas/parte publicada = intento completo que termina en ok+file (incl. reintentos previos del mismo intento).
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readGenerationCostLog } from './lib/generationCostLog.mjs';

const dayArg = process.argv[2] || new Date().toISOString().slice(0, 10);

const TEILE = [
  { module: 'lesen', teil: 1 },
  { module: 'lesen', teil: 2 },
  { module: 'lesen', teil: 3 },
  { module: 'lesen', teil: 4 },
  { module: 'lesen', teil: 5 },
  { module: 'horen', teil: 1 },
  { module: 'horen', teil: 2 },
  { module: 'horen', teil: 3 },
  { module: 'horen', teil: 4 },
];

const COMBINED_TEILE = new Set([
  'horen-t1',
  'horen-t3',
  'horen-t4',
  'lesen-t3',
  'lesen-t4',
]);

function inDay(e, d) {
  const ts = Date.parse(e.flushedAt || e.ts || 0);
  return ts >= Date.parse(`${d}T00:00:00.000Z`) && ts <= Date.parse(`${d}T23:59:59.999Z`);
}

const entries = readGenerationCostLog()
  .filter((e) => inDay(e, dayArg))
  .sort((a, b) => Date.parse(a.flushedAt || a.ts) - Date.parse(b.flushedAt || b.ts));

const successesByTeil = Object.fromEntries(
  TEILE.map((t) => [`${t.module}-t${t.teil}`, []]),
);

let buf = [];
const flushDiscarded = () => {
  buf = [];
};

for (const e of entries) {
  if (
    buf.length &&
    (String(buf[0].module) !== String(e.module) || Number(buf[0].teil) !== Number(e.teil))
  ) {
    flushDiscarded();
  }
  buf.push(e);
  if (e.ok && e.file) {
    const k = `${e.module}-t${e.teil}`;
    if (successesByTeil[k]) {
      const costUsd = buf.reduce((s, x) => s + (Number(x.costUsd) || 0), 0);
      successesByTeil[k].push({ file: e.file, calls: buf.length, costUsd });
    }
    buf = [];
  }
}

console.log(`\n=== B1 · llamadas API por parte PUBLICADA · ${dayArg} (UTC) ===\n`);
console.log(
  '| Teil | Combined | n pub | avg llamadas/pub | avg USD/pub | total USD pub |',
);
console.log('|------|----------|-------|------------------|-------------|---------------|');

let dayTotal = 0;
let sequentialLexicoFailCost = 0;
let sequentialLexicoFailCount = 0;

for (const e of entries) dayTotal += Number(e.costUsd) || 0;

for (const t of TEILE) {
  const k = `${t.module}-t${t.teil}`;
  const pubs = successesByTeil[k];
  const combined = COMBINED_TEILE.has(k) ? 'sí' : 'no';
  const n = pubs.length;
  const calls = pubs.reduce((s, p) => s + p.calls, 0);
  const usd = pubs.reduce((s, p) => s + p.costUsd, 0);
  const avgCalls = n ? (calls / n).toFixed(2) : '—';
  const avgUsd = n ? (usd / n).toFixed(4) : '—';
  console.log(
    `| ${k} | ${combined} | ${n} | ${avgCalls} | ${avgUsd} | ${usd.toFixed(4)} |`,
  );
}

for (const e of entries) {
  const k = `${e.module}-t${e.teil}`;
  if (COMBINED_TEILE.has(k)) continue;
  if (e.failGate === 'lexico' && !e.ok) {
    sequentialLexicoFailCost += Number(e.costUsd) || 0;
    sequentialLexicoFailCount += 1;
  }
}

const counterfactualSave = sequentialLexicoFailCost * 0.6;

console.log(`\nGasto total log (${dayArg}): $${dayTotal.toFixed(4)}`);
console.log(
  `Ahorro estimado si combined desde 00:00 UTC: ~$${counterfactualSave.toFixed(4)} ` +
    `(60% × ${sequentialLexicoFailCount} fallos léxico en teile aún secuenciales = $${sequentialLexicoFailCost.toFixed(4)})`,
);
