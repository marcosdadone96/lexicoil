#!/usr/bin/env node
/**
 * Informe periódico de ejes SEM-2 advise-only (promoción futura a BLOCK).
 *
 *   node scripts/sem2-advise-report.mjs
 *   node scripts/sem2-advise-report.mjs --since 7d
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { HOLISTIC_AXES, SEM2_BLOCK_AXES } from './lib/holisticJudge.mjs';

const LOG = path.join(ROOT, 'batches/generated/sem2-advise-log.jsonl');
const sinceArg = process.argv.find((_, i, a) => a[i - 1] === '--since') || '30d';

function parseSince(s) {
  const m = String(s).match(/^(\d+)(d|h)$/);
  if (!m) return 0;
  const n = Number(m[1]);
  return m[2] === 'h' ? n * 3600_000 : n * 86_400_000;
}

function main() {
  if (!fs.existsSync(LOG)) {
    console.log('Sin entradas aún. Log:', path.relative(ROOT, LOG));
    console.log('(Se rellena al pasar SEM-2 en Lesen T2 con --semantic)');
    return;
  }

  const cutoff = Date.now() - parseSince(sinceArg);
  const lines = fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean);
  const entries = [];
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (new Date(e.ts).getTime() >= cutoff) entries.push(e);
    } catch { /* skip */ }
  }

  const byAxis = {};
  for (const ax of HOLISTIC_AXES) {
    byAxis[ax] = { advise: 0, block: 0, parts: new Set() };
  }

  for (const e of entries) {
    for (const f of e.advisory || []) {
      if (!byAxis[f.axis]) continue;
      byAxis[f.axis].advise++;
      byAxis[f.axis].parts.add(e.partId);
    }
    for (const f of e.blocking || []) {
      if (!byAxis[f.axis]) continue;
      byAxis[f.axis].block++;
      byAxis[f.axis].parts.add(e.partId);
    }
  }

  console.log(`\n══ SEM-2 advise report (${entries.length} partes, since ${sinceArg}) ══\n`);
  console.log(`${'Eje'.padEnd(16)} ${'Adv'.padStart(5)} ${'Blk'.padStart(5)} ${'Parts'.padStart(6)}  Estado v1`);
  console.log('─'.repeat(60));

  for (const ax of HOLISTIC_AXES) {
    const s = byAxis[ax];
    const status = SEM2_BLOCK_AXES.has(ax)
      ? 'BLOCK activo'
      : s.advise + s.block === 0
        ? 'sin datos'
        : s.block > 0 && s.advise === 0
          ? 'candidato BLOCK?'
          : 'advise-only';
    console.log(
      `${ax.padEnd(16)} ${String(s.advise).padStart(5)} ${String(s.block).padStart(5)} ` +
      `${String(s.parts.size).padStart(6)}  ${status}`,
    );
  }

  console.log(`\nLog: ${path.relative(ROOT, LOG)}`);
  console.log('Promover a BLOCK solo ejes con Prec≥85% Rec≥70% en calibración dedicada.\n');
}

main();
