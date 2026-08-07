#!/usr/bin/env node
/**
 * Escaneo pares Emma+Jonas / Clara+Tobias en exámenes A2 servidos.
 *   node scripts/scan-a2-published-hot-dialogue-pairs.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { extractDialoguePairs, pairKey, DIALOGUE_HOT_PAIRS } from './lib/dialogueNamesBank.mjs';

const servedPath = path.join(ROOT, 'data/exams/de_A2.json');
const exams = JSON.parse(fs.readFileSync(servedPath, 'utf8'));

function collectText(ex) {
  const chunks = [];
  for (const part of ex.horenParts || []) {
    chunks.push(part.text, part.transcript, part.instruction);
    for (const s of part.segments || []) chunks.push(s.text, s.transcript);
    for (const q of part.questions || part.items || []) {
      chunks.push(q.question, q.transcript, q.statement);
    }
  }
  return chunks.filter(Boolean).join('\n');
}

const hits = [];
for (const ex of exams) {
  const text = collectText(ex);
  const pairs = extractDialoguePairs({ passages: [{ text }], questions: [{ transcript: text }] });
  const hot = [];
  for (const [a, b] of pairs) {
    const k = pairKey(a, b);
    if (DIALOGUE_HOT_PAIRS.has(k)) hot.push(k);
  }
  if (hot.length) {
    hits.push({ examId: ex.examId || ex.id, slot: ex.slot, hotPairs: [...new Set(hot)] });
  }
}

const report = {
  at: new Date().toISOString(),
  examCount: exams.length,
  hotPairExamHits: hits.length,
  hits,
};
const out = path.join(ROOT, 'batches/ready/gate-logs/a2-published-hot-dialogue-pairs-scan.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
console.log('Wrote', path.relative(ROOT, out));
process.exitCode = hits.length ? 1 : 0;
