#!/usr/bin/env node
/**
 * Offline DWDS verification for the 9 vocab-gap separables (fixture snippets from dwds.de).
 * node scripts/verify-separable-vocab-gap-dwds.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { classifyDwdsHtml } from './lib/dwdsSeparableClassify.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal HTML/text captured from DWDS lemma pages (2026-07-27). */
const FIXTURES = {
  abwarten: 'GrammatikVerb · wartet ab, wartete ab, hat abgewartet',
  abwickeln: 'GrammatikVerb · wickelt ab, wickelte ab, hat abgewickelt',
  austragen: 'GrammatikVerb · trägt aus, trug aus, hat ausgetragen',
  fortsetzen: 'GrammatikVerb · setzt fort, setzte fort, hat fortgesetzt',
  herunterladen: 'GrammatikVerb · lädt herunter, lud herunter, hat heruntergeladen',
  zurückfahren: 'GrammatikVerb · fährt zurück, fuhr zurück, ist/hat zurückgefahren',
  zurückgehen: 'GrammatikVerb · geht zurück, ging zurück, ist zurückgegangen',
  zurücklaufen: 'GrammatikVerb · läuft zurück, lief zurück, ist zurückgelaufen',
  zusammenarbeiten: 'GrammatikVerb · arbeitet zusammen, arbeitete zusammen, hat zusammengearbeitet',
};

const results = [];
let failed = 0;
for (const [lemma, html] of Object.entries(FIXTURES)) {
  const c = classifyDwdsHtml(lemma, html);
  const ok = c.status === 'accept' && c.separable;
  if (!ok) failed += 1;
  results.push({ lemma, ...c, ok });
  console.log(`${ok ? '✅' : '❌'} ${lemma}: ${c.status} — ${(c.reasons || []).join('; ')}`);
}

const out = path.join(ROOT, 'batches/ready/gate-logs/separable-vocab-gap-dwds-verify.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  `${JSON.stringify({ at: new Date().toISOString(), source: 'dwds-fixtures-2026-07-27', results, allAccepted: failed === 0 }, null, 2)}\n`,
);

if (failed) {
  console.error(`\n${failed} lemma(s) not accepted`);
  process.exit(1);
}
console.log('\nWrote', path.relative(ROOT, out));
