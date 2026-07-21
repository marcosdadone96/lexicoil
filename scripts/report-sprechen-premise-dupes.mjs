#!/usr/bin/env node
/**
 * SP-2.4 — Informe de duplicados de premisas Sprechen (no borra).
 *   node scripts/report-sprechen-premise-dupes.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findSprechenPremiseDuplicates,
  findSprechenPremiseOverlaps,
  collectSprechenFingerprints,
} from './lib/sprechenPremiseDedup.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outMd = path.join(ROOT, 'batches/ready/SPRECHEN-PREMISE-DUPES-2026-07-10.md');

const exact = findSprechenPremiseDuplicates();
const overlaps = findSprechenPremiseOverlaps();
const all = [...collectSprechenFingerprints().values()];

const lines = [];
lines.push('# Sprechen — duplicados de premisas (SP-2.4)');
lines.push('');
lines.push('Fingerprint = premisa T1 normalizada + tema T2 normalizado.');
lines.push('**No se borra nada** — decisión humana de cuál conservar en cada par.');
lines.push('');
lines.push(`Sets indexados: **${all.length}**`);
lines.push(`Duplicados exactos (mismo fingerprint): **${exact.length}**`);
lines.push('');
lines.push('## Pares temáticos reportados en auditoría (revisión humana)');
lines.push('');
lines.push('| Tema | Archivos candidatos | Notas |');
lines.push('|------|---------------------|-------|');
lines.push('| Tagesausflug | `sprechen-feste-02` / `sprechen-reise-vorbereitung-01` | misma premisa de excursión |');
lines.push('| Feste und Feiern (T2) | `sprechen-feste-02` / `sprechen-stadtfest-planung-01` | mismo eje T2 |');
lines.push('| Abschiedsfeier | `sprechen-gemini-003` / `sprechen-onlineshopping-01` | fiesta de despedida |');
lines.push('| Kulturfest / Stadtfest organisieren | `sprechen-gemini-001` / `sprechen-stadtfest-planung-01` | planificar fiesta urbana |');
lines.push('');
lines.push('## Duplicados exactos (T1+T2)');
lines.push('');
if (!exact.length) {
  lines.push('_Ninguno con fingerprint idéntico (el solapamiento es temático, no byte-idéntico)._');
} else {
  for (const g of exact) {
    lines.push(`### \`${g.key.slice(0, 80)}…\``);
    lines.push(`- T1: ${g.t1}`);
    lines.push(`- T2: ${g.t2}`);
    lines.push(`- Archivos:`);
    for (const f of g.files) lines.push(`  - \`${f}\``);
    lines.push('');
  }
}

lines.push('## Solapamientos automáticos (misma premisa T1 **o** mismo tema T2, string-fold)');
lines.push('');
for (const o of overlaps) {
  lines.push(`### ${o.kind}: \`${o.value.slice(0, 90)}\``);
  for (const f of o.files) lines.push(`- \`${f}\``);
  lines.push('');
}

fs.writeFileSync(outMd, `${lines.join('\n')}\n`, 'utf8');
console.log(`Wrote ${path.relative(ROOT, outMd)}`);
console.log(`exact=${exact.length} overlaps=${overlaps.length}`);

