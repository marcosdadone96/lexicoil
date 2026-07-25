#!/usr/bin/env node
/**
 * Regenerate library/pool-stock/de_B1-lesen.json from reusable seed.
 * Run: node scripts/build-pool-stock-manifest.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { normalizeB1Topic, B1_TOPICS } = require(path.join(ROOT, 'js/data/b1Topics.js'));

const files = ['library/reusable-seed/de_B1.json', 'library/reusable-seed/de_B1.bank.json'];
const records = [];
for (const f of files) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (Array.isArray(data.records)) records.push(...data.records);
}

const teils = [1, 2, 3, 4, 5];
const lesen = records.filter(
  (r) =>
    String(r.module).toLowerCase() === 'lesen' &&
    String(r.level).toUpperCase() === 'B1' &&
    r.complete &&
    r.verified &&
    !r.disabled,
);

const topics = [];
for (const topic of B1_TOPICS) {
  const counts = Object.fromEntries(teils.map((t) => [String(t), 0]));
  for (const r of lesen) {
    if (normalizeB1Topic(r.topicTag) !== topic) continue;
    const t = Number(r.teil);
    if (teils.includes(t)) counts[String(t)]++;
  }
  const total = teils.reduce((s, t) => s + counts[String(t)], 0);
  const missing = teils.filter((t) => !counts[String(t)]);
  const filled = teils.length - missing.length;
  const full = missing.length === 0;
  let status = full ? 'full' : 'partial';
  if (total <= 2) status = 'sparse';
  else if (total <= 8 || missing.length >= 2) status = 'partial';
  topics.push({ topic, counts, total, filled, missing, full, status });
}

const manifest = {
  v: 1,
  lang: 'de',
  level: 'B1',
  module: 'lesen',
  generatedAt: new Date().toISOString().slice(0, 10),
  teils,
  topics,
};

const out = path.join(ROOT, 'library/pool-stock/de_B1-lesen.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log('Wrote', out);
console.log('Full topics:', topics.filter((t) => t.full).map((t) => t.topic).join(', '));
