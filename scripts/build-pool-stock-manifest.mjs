#!/usr/bin/env node
/**
 * build-pool-stock-manifest.mjs — Regenera manifests de stock desde reusable-seed limpio.
 * Solo cuenta partes verified + sem1VerifiedAt (o sem1Skipped para Schreiben/Sprechen).
 *
 * Run: node scripts/build-pool-stock-manifest.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { normalizeB1Topic, B1_TOPICS } = require(path.join(ROOT, 'js/data/b1Topics.js'));

function loadVerifiedRecords() {
  const files = ['library/reusable-seed/de_B1.json'];
  const records = [];
  for (const f of files) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (Array.isArray(data.records)) records.push(...data.records);
  }
  return records.filter(
    (r) =>
      r.verified === true &&
      r.complete !== false &&
      r.disabled !== true &&
      (r.sem1VerifiedAt || r.sem1Skipped),
  );
}

function buildModuleManifest(module, teils, records) {
  const mod = String(module).toLowerCase();
  const filtered = records.filter(
    (r) =>
      String(r.module).toLowerCase() === mod &&
      String(r.level).toUpperCase() === 'B1',
  );

  const topics = [];
  for (const topic of B1_TOPICS) {
    const counts = Object.fromEntries(teils.map((t) => [String(t), 0]));
    for (const r of filtered) {
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

  return {
    v: 2,
    lang: 'de',
    level: 'B1',
    module: mod,
    generatedAt: new Date().toISOString(),
    teils,
    gate: 'verified+sem1',
    topics,
  };
}

function replaceEmbeddedManifest(src, manifestJson) {
  const start = src.indexOf('const MANIFEST =');
  if (start < 0) {
    throw new Error('Could not find const MANIFEST in topic stock JS');
  }
  const factoryIdx = src.indexOf('return PersonalTopicStockFactory', start);
  if (factoryIdx < 0) {
    throw new Error('Could not find PersonalTopicStockFactory.create after MANIFEST');
  }
  const before = src.slice(0, start);
  const after = src.slice(factoryIdx);
  return `${before}const MANIFEST = ${manifestJson};\n\n  ${after}`;
}

function syncLesenTopicStockJs(lesenManifest) {
  const jsPath = path.join(ROOT, 'js/data/personalLesenTopicStock.js');
  let src = fs.readFileSync(jsPath, 'utf8');
  const manifestJson = JSON.stringify(
    {
      v: lesenManifest.v,
      lang: lesenManifest.lang,
      level: lesenManifest.level,
      module: lesenManifest.module,
      teils: lesenManifest.teils,
      topics: lesenManifest.topics,
    },
    null,
    4,
  );
  src = replaceEmbeddedManifest(src, manifestJson);
  fs.writeFileSync(jsPath, src, 'utf8');
  console.log('Updated', path.relative(ROOT, jsPath));
}

function syncHorenTopicStockJs(horenManifest) {
  const jsPath = path.join(ROOT, 'js/data/personalHorenTopicStock.js');
  let src = fs.readFileSync(jsPath, 'utf8');
  const manifestJson = JSON.stringify(
    {
      v: horenManifest.v,
      lang: horenManifest.lang,
      level: horenManifest.level,
      module: horenManifest.module,
      teils: horenManifest.teils,
      topics: horenManifest.topics,
    },
    null,
    4,
  );
  src = replaceEmbeddedManifest(src, manifestJson);
  fs.writeFileSync(jsPath, src, 'utf8');
  console.log('Updated', path.relative(ROOT, jsPath));
}

const records = loadVerifiedRecords();
console.log(`Verified+SEM-1 records: ${records.length}`);

const lesenTeils = [1, 2, 3, 4, 5];
const lesenManifest = buildModuleManifest('lesen', lesenTeils, records);
const horenManifest = buildModuleManifest('horen', [1, 2, 3, 4], records);

const outDir = path.join(ROOT, 'library/pool-stock');
fs.mkdirSync(outDir, { recursive: true });

const lesenOut = path.join(outDir, 'de_B1-lesen.json');
fs.writeFileSync(lesenOut, `${JSON.stringify(lesenManifest, null, 2)}\n`);
console.log('Wrote', path.relative(ROOT, lesenOut));
console.log('Full lesen topics:', lesenManifest.topics.filter((t) => t.full).map((t) => t.topic).join(', ') || '(none)');

const horenOut = path.join(outDir, 'de_B1-horen.json');
fs.writeFileSync(horenOut, `${JSON.stringify(horenManifest, null, 2)}\n`);
console.log('Wrote', path.relative(ROOT, horenOut));

syncLesenTopicStockJs(lesenManifest);
syncHorenTopicStockJs(horenManifest);

// Summary grid for all modules
const summary = { generatedAt: new Date().toISOString(), modules: {}, byTopic: {} };
for (const mod of ['lesen', 'horen', 'schreiben', 'sprechen']) {
  const teils = mod === 'lesen' ? [1, 2, 3, 4, 5] : mod === 'horen' ? [1, 2, 3, 4] : [1, 2, 3];
  const rows = records.filter((r) => String(r.module).toLowerCase() === mod);
  summary.modules[mod] = { total: rows.length, byTeil: {} };
  for (const t of teils) {
    summary.modules[mod].byTeil[String(t)] = rows.filter((r) => Number(r.teil) === t).length;
  }
}
for (const topic of B1_TOPICS) {
  summary.byTopic[topic] = {};
  for (const mod of ['lesen', 'horen', 'schreiben', 'sprechen']) {
    const teils = mod === 'lesen' ? [1, 2, 3, 4, 5] : mod === 'horen' ? [1, 2, 3, 4] : [1, 2, 3];
    const counts = {};
    for (const t of teils) {
      counts[String(t)] = records.filter(
        (r) =>
          String(r.module).toLowerCase() === mod &&
          normalizeB1Topic(r.topicTag) === topic &&
          Number(r.teil) === t,
      ).length;
    }
    summary.byTopic[topic][mod] = counts;
  }
}
const summaryOut = path.join(outDir, 'de_B1-summary.json');
fs.writeFileSync(summaryOut, `${JSON.stringify(summary, null, 2)}\n`);
console.log('Wrote', path.relative(ROOT, summaryOut));
