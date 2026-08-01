#!/usr/bin/env node
/**
 * Scan Lesen T2 pool for Regeltext explanation leakage + weil+V2 order in explanations.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';

const level = process.argv.includes('--level')
  ? process.argv[process.argv.indexOf('--level') + 1]
  : 'B1';

const dirs = [
  path.join(ROOT, `batches/ready/pool-verified/${level}`),
  path.join(ROOT, `batches/needs-regeneration/${level}`),
  path.join(ROOT, `batches/generated/${level}`),
];

const REGELN_RE = /steht so in den regeln|die regeln festlegen|laut den regeln/i;
const WEIL_V2_RE = /\bweil\s+(?:es|das|der|die)\s+(?:ist|sind|war|waren|wird|werden)\s+/i;
const ANGEBOTE_LC_RE = /\bregional(?:en|er|es|e)?\s+angebot(?:en|e)\b/i;

const hits = { regeln: [], weil: [], angebote: [] };

for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir)) {
    if (!/^lesen-t2.*\.json$/i.test(name)) continue;
    const abs = path.join(dir, name);
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch {
      continue;
    }
    const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
    for (const q of batch.questions || []) {
      const expl = String(q.explanation || '');
      const qid = q.id || q.question?.slice(0, 40) || '?';
      if (REGELN_RE.test(expl)) hits.regeln.push({ file: rel, qid, snippet: expl.slice(0, 120) });
      if (WEIL_V2_RE.test(expl)) hits.weil.push({ file: rel, qid, snippet: expl.slice(0, 120) });
    }
    const blob = JSON.stringify(batch);
    if (ANGEBOTE_LC_RE.test(blob)) hits.angebote.push({ file: rel });
  }
}

console.log(`# Lesen T2 pool scan · ${level}\n`);
console.log(`Regeltext en explanation: ${hits.regeln.length} hits`);
for (const h of hits.regeln.slice(0, 15)) console.log(`  - ${h.file} · ${h.snippet}`);
console.log(`\nweil + V2 (ist/sind…): ${hits.weil.length} hits`);
for (const h of hits.weil.slice(0, 15)) console.log(`  - ${h.file} · ${h.snippet}`);
console.log(`\nregional* + angebot* minúscula: ${hits.angebote.length} archivos`);
for (const h of hits.angebote.slice(0, 15)) console.log(`  - ${h.file}`);
