#!/usr/bin/env node
/**
 * Scan pool-verified for non-German explanations (Q5 + CHK-18-style).
 *   node scripts/scan-pool-german-explanations.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { KNOWN_LEVELS, listPoolVerifiedJson } from './lib/batchPaths.mjs';
import {
  assessGermanExamText,
  runGermanContentLanguageGate,
} from './lib/qualityGates/germanContentLanguageGate.mjs';

const OUT = path.join(ROOT, 'batches/ready/gate-logs/pool-german-explanation-scan.json');

const hits = [];
const q5Hits = [];
const seen = new Set();

for (const level of KNOWN_LEVELS) {
  for (const abs of listPoolVerifiedJson(level)) {
    if (seen.has(abs)) continue;
    seen.add(abs);
    const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const gate = runGermanContentLanguageGate(batch, { file: rel, lang: 'de' });
    const explFindings = (gate.findings || []).filter((f) =>
      String(f.detail || '').includes('explanation'),
    );
    if (explFindings.length) {
      q5Hits.push({ file: rel, findings: explFindings.map((f) => f.detail) });
    }
    for (const q of batch.questions || []) {
      const expl = String(q.explanation || '').trim();
      if (!expl) continue;
      const check = assessGermanExamText(expl, { minTokens: 6, mode: 'question' });
      if (!check.ok) {
        hits.push({
          file: rel,
          qid: q.id,
          reason: check.reason,
          preview: expl.slice(0, 120),
        });
      }
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  filesScanned: seen.size,
  q5ExplanationBlocks: q5Hits.length,
  assessGermanHits: hits.length,
  q5Hits,
  hits,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Scanned ${seen.size} pool-verified files`);
console.log(`Q5 explanation blocks: ${q5Hits.length}`);
console.log(`assessGermanExamText hits: ${hits.length}`);
for (const h of hits.slice(0, 15)) {
  console.log(`  ${h.file} · ${h.qid}: ${h.preview}…`);
}
console.log(`Wrote ${path.relative(ROOT, OUT)}`);
