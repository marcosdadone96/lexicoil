#!/usr/bin/env node
/**
 * Escaneo Lesen T4 A2 — enunciados sin mini-situación (stem genérico).
 *   node scripts/scan-a2-lesen-t4-situations.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { isGenericLesenA2T4QuestionStem, hasLesenA2T4PersonSituation, lesenA2T4QuestionStem } from './lib/lesenA2T4Situations.mjs';

const poolDir = path.join(ROOT, 'batches/ready/pool-verified/A2');
const files = fs.readdirSync(poolDir).filter((f) => /^lesen-t4.*\.json$/i.test(f)).sort();

const GENERIC_ONLY = /^Welche Anzeige passt\?\s*$/i;

const report = {
  at: new Date().toISOString(),
  files: [],
  affectedCount: 0,
  genericExactCount: 0,
};

for (const file of files) {
  const batch = JSON.parse(fs.readFileSync(path.join(poolDir, file), 'utf8'));
  const qs = batch.questions || [];
  const rows = qs.map((q, i) => {
    const stem = lesenA2T4QuestionStem(q);
    const genericExact = GENERIC_ONLY.test(stem);
    const genericLib = isGenericLesenA2T4QuestionStem(stem);
    const personSitu = hasLesenA2T4PersonSituation(stem);
    const signEmpty = !String(q.signText || '').trim();
    const broken = genericLib;
    return {
      index: i + 1,
      id: q.id,
      correct: q.correct || q.correctAnswer,
      genericExact,
      personSitu,
      signTextEmpty: signEmpty,
      broken,
      questionPreview: stem.slice(0, 120),
    };
  });
  const brokenQs = rows.filter((r) => r.broken).length;
  if (brokenQs > 0) report.affectedCount += 1;
  report.genericExactCount += rows.filter((r) => r.genericExact).length;
  report.files.push({ file, questionCount: qs.length, brokenQuestions: brokenQs, rows });
}

const out = path.join(ROOT, 'batches/ready/gate-logs/a2-lesen-t4-situation-scan.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  files: report.files.length,
  affectedFiles: report.affectedCount,
  genericExactQuestions: report.genericExactCount,
  out: out.replace(/\\/g, '/'),
}, null, 2));
