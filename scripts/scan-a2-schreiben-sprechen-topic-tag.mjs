#!/usr/bin/env node
/**
 * Escaneo Schreiben/Sprechen A2 — topicTag declarado vs contenido (detectQuestionTopicTag).
 *   node scripts/scan-a2-schreiben-sprechen-topic-tag.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { detectQuestionTopicTag } from './lib/topicRotation.mjs';

const poolDir = path.join(ROOT, 'batches/ready/pool-verified/A2');
const report = { at: new Date().toISOString(), mismatches: [], mismatchCount: 0 };

function declaredTag(q) {
  const t = q.topicTags?.[0] || q.topicTag;
  return t ? String(t) : null;
}

for (const file of fs
  .readdirSync(poolDir)
  .filter((f) => /^(schreiben|sprechen).*\.json$/i.test(f))
  .sort()) {
  const batch = JSON.parse(fs.readFileSync(path.join(poolDir, file), 'utf8'));
  const root = batch.topicTag || batch._requestedTopic || null;
  for (const q of batch.questions || []) {
    const mod = String(q.module || '').toLowerCase();
    if (mod !== 'schreiben' && mod !== 'sprechen') continue;
    const lv = String(q.level || batch.level || 'A2').trim().toUpperCase();
    if (lv !== 'A2') continue;
    const declared = declaredTag(q);
    const expected = detectQuestionTopicTag(q, root);
    if (declared && expected && declared !== expected) {
      report.mismatchCount++;
      report.mismatches.push({
        file,
        id: q.id,
        teil: q.teil,
        module: mod,
        declared,
        expected,
        questionPreview: String(q.question || '').slice(0, 100),
      });
    }
  }
}

const out = path.join(ROOT, 'batches/ready/gate-logs/a2-schreiben-sprechen-topic-tag-scan.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(
  JSON.stringify(
    {
      mismatchCount: report.mismatchCount,
      out: out.replace(/\\/g, '/'),
    },
    null,
    2,
  ),
);

process.exitCode = report.mismatchCount > 0 ? 1 : 0;
