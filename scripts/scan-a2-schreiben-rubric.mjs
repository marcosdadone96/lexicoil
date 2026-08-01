#!/usr/bin/env node
/**
 * Escaneo Schreiben A2 — explanation con criterios B1 / «Ca. 80 Wörter».
 *   node scripts/scan-a2-schreiben-rubric.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';

const poolDir = path.join(ROOT, 'batches/ready/pool-verified/A2');
const BAD = /B1-Niveau|Grammatik B1|Ca\.\s*80\s*Wörter/i;

const report = { at: new Date().toISOString(), files: [], badExplanationCount: 0 };

for (const file of fs.readdirSync(poolDir).filter((f) => /^schreiben.*\.json$/i.test(f)).sort()) {
  const batch = JSON.parse(fs.readFileSync(path.join(poolDir, file), 'utf8'));
  const rows = (batch.questions || [])
    .filter((q) => String(q.module || '').toLowerCase() === 'schreiben')
    .map((q, i) => {
      const expl = String(q.explanation || '');
      const bad = BAD.test(expl);
      return { index: i + 1, id: q.id, teil: q.teil, bad, preview: expl.slice(0, 80) };
    })
    .filter((r) => r.bad);
  if (rows.length) {
    report.badExplanationCount += rows.length;
    report.files.push({ file, hits: rows.length, rows });
  }
}

const out = path.join(ROOT, 'batches/ready/gate-logs/a2-schreiben-rubric-scan.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(
  JSON.stringify(
    {
      schreibenFilesScanned: fs.readdirSync(poolDir).filter((f) => /^schreiben.*\.json$/i.test(f)).length,
      affectedFiles: report.files.length,
      badExplanations: report.badExplanationCount,
      out: out.replace(/\\/g, '/'),
    },
    null,
    2,
  ),
);

process.exitCode = report.badExplanationCount > 0 ? 1 : 0;
