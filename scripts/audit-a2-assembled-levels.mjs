#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'batches/ready/assembled-from-verified');

function collectLevels(doc) {
  const levels = new Map();
  const add = (lv, where) => {
    const k = lv == null ? '(null)' : String(lv);
    levels.set(k, (levels.get(k) || 0) + 1);
  };
  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (const x of obj) walk(x);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(obj, 'level') && (obj.module || obj.id || obj.teil != null)) {
      add(obj.level, obj.id);
    }
    for (const v of Object.values(obj)) walk(v);
  };
  walk(doc.exam || doc);
  return levels;
}

const files = fs.readdirSync(DIR).filter((f) => /^assembled-exam-a2-verified-e\d+\.json$/i.test(f)).sort();
for (const f of files) {
  const doc = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const levels = collectLevels(doc);
  const meta = doc._meta || {};
  console.log(`\n${f}`);
  console.log('  examId:', meta.examId, '| gate1:', meta.gate1?.ok, '| capacity:', meta.capacityAtAssemble);
  console.log('  partIds:', JSON.stringify(meta.partIds));
  console.log('  question levels:', Object.fromEntries(levels));
  const b1 = levels.get('B1') || 0;
  const a2 = levels.get('A2') || 0;
  const nulls = levels.get('(null)') || 0;
  console.log('  verdict:', b1 > 0 && a2 === 0 ? 'ALL_B1' : b1 > 0 && a2 > 0 ? 'MIXED' : b1 === 0 ? 'ALL_A2' : 'OTHER');
}
