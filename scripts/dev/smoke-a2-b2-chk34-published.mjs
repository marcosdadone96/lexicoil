#!/usr/bin/env node
/** CHK-34 scan on published A2/B2 — no Gemini */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { findExplanationOptionTextAlignFindings } = require('../lib/explanationOptionTextAlign.mjs');

function scanLevel(level) {
  const pubDir = path.join(ROOT, 'library/published-exams/de', level);
  const cat = JSON.parse(fs.readFileSync(path.join(pubDir, '_catalog.json'), 'utf8'));
  let totalQ = 0;
  let critical = 0;
  let minor = 0;
  const criticalItems = [];
  const exams = [];

  for (const e of cat.exams || []) {
    const fp = path.join(pubDir, `${e.examId}.json`);
    if (!fs.existsSync(fp)) continue;
    const doc = JSON.parse(fs.readFileSync(fp, 'utf8'));
    let eq = 0;
    let ec = 0;
    let em = 0;
    for (const p of doc.parts || []) {
      for (const q of p.snapshot?.questions || []) {
        totalQ++;
        eq++;
        const hits = findExplanationOptionTextAlignFindings({ questions: [q] });
        for (const h of hits) {
          if (h.severity === 'CRITICAL') {
            critical++;
            ec++;
            criticalItems.push({ exam: e.examId, partId: p.partId, id: q.id, message: h.message?.slice(0, 100) });
          } else {
            minor++;
            em++;
          }
        }
      }
    }
    exams.push({ examId: e.examId, status: e.status, questions: eq, critical: ec, minor: em });
  }
  return { level, totalQ, critical, minor, exams, criticalItems: criticalItems.slice(0, 20) };
}

const out = {
  generatedAt: new Date().toISOString(),
  A2: scanLevel('A2'),
  B2: scanLevel('B2'),
};
const outPath = path.join(ROOT, 'batches/ready/gate-logs/smoke-a2-b2-chk34-published-2026-08-07.json');
fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ A2: { q: out.A2.totalQ, crit: out.A2.critical, minor: out.A2.minor }, B2: { q: out.B2.totalQ, crit: out.B2.critical, minor: out.B2.minor }, outPath }, null, 2));
