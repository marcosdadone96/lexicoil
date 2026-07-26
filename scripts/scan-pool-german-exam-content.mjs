#!/usr/bin/env node
/**
 * Full Q5 scan: questions, options, passages, explanations in pool-verified.
 *   node scripts/scan-pool-german-exam-content.mjs
 */
import fs from 'fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { runGermanContentLanguageGate } from './lib/qualityGates/germanContentLanguageGate.mjs';

const LEVELS = ['B1', 'A2'];
const OUT = path.join(ROOT, 'batches/ready/gate-logs/pool-german-exam-content-scan.json');

const hits = [];
let total = 0;

for (const level of LEVELS) {
  const dir = path.join(ROOT, 'batches/ready/pool-verified', level);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f.startsWith('.')) continue;
    total++;
    const rel = `batches/ready/pool-verified/${level}/${f}`.replace(/\\/g, '/');
    const batch = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const gate = runGermanContentLanguageGate(batch, { file: rel, lang: 'de' });
    if ((gate.findings || []).length) {
      hits.push({
        file: rel,
        findings: gate.findings.map((x) => x.detail),
      });
    }
  }
}

const report = { generatedAt: new Date().toISOString(), filesScanned: total, hits: hits.length, q5Hits: hits };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Scanned ${total} files — Q5 language hits: ${hits.length}`);
for (const h of hits.slice(0, 20)) {
  console.log(`  ${h.file}`);
  console.log(`    ${h.findings[0]}`);
}
console.log(`Wrote ${path.relative(ROOT, OUT)}`);
process.exit(hits.length ? 1 : 0);
