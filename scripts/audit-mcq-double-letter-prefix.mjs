#!/usr/bin/env node
/**
 * Scan pool + generated for duplicate MCQ option letter prefixes.
 * Run: node scripts/audit-mcq-double-letter-prefix.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyGermanCapsNormalize } from './lib/germanCapsNormalize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = [
  path.join(ROOT, 'batches/ready/pool-verified'),
  path.join(ROOT, 'batches/generated'),
];

const DOUBLE_RE = /^[a-c]\)\s*[a-c]\)\s/i;

function findDoubles(batch, file) {
  const hits = [];
  for (let qi = 0; qi < (batch.questions || []).length; qi++) {
    const q = batch.questions[qi];
    for (let oi = 0; oi < (q.options || []).length; oi++) {
      const opt = q.options[oi];
      const text = typeof opt === 'string' ? opt : String(opt?.text ?? opt?.label ?? '');
      if (DOUBLE_RE.test(text)) {
        hits.push({
          file,
          qIndex: qi,
          qId: q.id || `q${qi + 1}`,
          oIndex: oi,
          module: q.module,
          teil: q.teil,
          text: text.slice(0, 80),
        });
      }
    }
  }
  return hits;
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('.'));
}

const before = [];
for (const dir of SCAN_DIRS) {
  for (const f of listJsonFiles(dir)) {
    const abs = path.join(dir, f);
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch {
      continue;
    }
    before.push(...findDoubles(batch, path.relative(ROOT, abs).replace(/\\/g, '/')));
  }
}

console.log(`\n=== MCQ double-prefix scan ===`);
console.log(`Before fix: ${before.length} hit(s)`);
if (before.length) {
  for (const h of before) {
    console.log(`  ${h.file} ${h.qId} opt[${h.oIndex}]: ${h.text}`);
  }
}

const gateCheck = applyGermanCapsNormalize(
  {
    questions: [{
      module: 'lesen',
      teil: 2,
      options: ['b) b) Test'],
    }, {
      module: 'horen',
      teil: 4,
      options: ['a) a) Test'],
    }],
  },
  { decapOnly: true },
);
const afterGate = findDoubles(gateCheck.batch, 'synthetic');
console.log(`\nGate decapOnly universal: ${afterGate.length === 0 ? 'PASS' : 'FAIL'} (dedupe=${gateCheck.stats.dedupeFixed})`);

process.exit(before.length ? 1 : 0);
