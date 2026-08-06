#!/usr/bin/env node
/**
 * Backfill topicTag raíz en batches/ready/lesen/ sin topicTag (legacy).
 *
 *   node scripts/backfill-topictags-ready.mjs              # dry-run (default) + CSV
 *   node scripts/backfill-topictags-ready.mjs --apply      # escribe JSON
 *   node scripts/backfill-topictags-ready.mjs --teil 3     # solo un Teil
 *
 * Marca _topicTagInferred: true en cada batch actualizado.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { ROOT } from './lib/loadEnv.mjs';

const require = createRequire(import.meta.url);
const { detectTopic } = require(path.join(ROOT, 'js/engine/partTopicDetect.js'));
const { normalizeB1Topic, B1_TOPICS } = require(path.join(ROOT, 'js/data/b1Topics.js'));

const READY_DIR = path.join(ROOT, 'batches', 'ready', 'lesen');
const REPORT_DIR = path.join(ROOT, 'batches', 'reports');

function parseArgs(argv) {
  const apply = argv.includes('--apply');
  const teilIdx = argv.indexOf('--teil');
  const teilFilter = teilIdx >= 0 ? Number(argv[teilIdx + 1]) : null;
  return { apply, teilFilter: Number.isFinite(teilFilter) ? teilFilter : null };
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function batchTeil(batch) {
  return Number(batch.teil ?? batch.questions?.[0]?.teil);
}

function hasRootTopicTag(batch) {
  return Boolean(normalizeB1Topic(batch.topicTag || batch._requestedTopic));
}

function collectInferenceText(batch) {
  const chunks = [];
  for (const p of batch.passages || []) {
    if (p.title) chunks.push(p.title);
    if (p.text) chunks.push(p.text);
  }
  for (const q of batch.questions || []) {
    if (q.question) chunks.push(q.question);
    if (q.signText) chunks.push(q.signText);
    for (const opt of q.options || []) {
      chunks.push(String(opt).replace(/^[A-Ja-d]\)\s*/i, ''));
    }
  }
  if (batch.ads) {
    for (const ad of batch.ads) {
      chunks.push(String(ad.title || ad.name || ad.text || ad.body || ''));
    }
  }
  return chunks.join('\n');
}

function scoreTopics(text) {
  const lower = String(text || '').toLowerCase();
  const scores = {};
  const { TOPIC_KEYWORDS } = require(path.join(ROOT, 'js/engine/partTopicDetect.js'));
  const keywords = TOPIC_KEYWORDS || {};
  for (const topic of B1_TOPICS) {
    const kws = keywords[topic] || [];
    scores[topic] = kws.filter((kw) => lower.includes(kw.toLowerCase())).length;
  }
  const ranked = Object.entries(scores)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  return ranked;
}

function inferTopicTag(batch) {
  const text = collectInferenceText(batch);
  const detected = detectTopic(text);
  const ranked = scoreTopics(text);
  const topScore = ranked[0]?.[1] || 0;
  const secondScore = ranked[1]?.[1] || 0;
  const confidence = topScore >= 2 && topScore > secondScore
    ? 'high'
    : topScore >= 1
      ? 'medium'
      : 'low';

  return {
    topicTag: detected ? normalizeB1Topic(detected) : null,
    detected,
    topHits: ranked.slice(0, 3).map(([t, n]) => `${t}:${n}`).join(' | '),
    confidence,
    sample: text.replace(/\s+/g, ' ').slice(0, 120),
  };
}

function applyTopicTag(batch, topicTag) {
  const tagged = {
    ...batch,
    topicTag,
    _topicTagInferred: true,
  };
  if (batch._requestedTopic == null) tagged._requestedTopic = topicTag;
  tagged.passages = (batch.passages || []).map((p) => ({ ...p, topicTag }));
  return tagged;
}

function main() {
  const { apply, teilFilter } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(READY_DIR)) {
    console.error(`No existe ${READY_DIR}`);
    process.exit(1);
  }

  const rows = [];
  const byTeil = {};
  let skippedHasTag = 0;
  let skippedNoInfer = 0;

  for (const name of fs.readdirSync(READY_DIR).sort()) {
    if (!name.endsWith('.json')) continue;
    const abs = path.join(READY_DIR, name);
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch (err) {
      rows.push({ file: name, teil: '?', action: 'error', topicTag: '', confidence: '', hits: '', sample: err.message });
      continue;
    }

    const teil = batchTeil(batch);
    if (teilFilter != null && teil !== teilFilter) continue;

    if (hasRootTopicTag(batch)) {
      skippedHasTag += 1;
      continue;
    }

    const inf = inferTopicTag(batch);
    if (!inf.topicTag) {
      skippedNoInfer += 1;
      rows.push({
        file: name,
        teil,
        action: 'skip_no_infer',
        topicTag: '',
        confidence: inf.confidence,
        hits: inf.topHits,
        sample: inf.sample,
      });
      continue;
    }

    byTeil[teil] = (byTeil[teil] || 0) + 1;
    rows.push({
      file: name,
      teil,
      action: apply ? 'applied' : 'would_apply',
      topicTag: inf.topicTag,
      confidence: inf.confidence,
      hits: inf.topHits,
      sample: inf.sample,
    });

    if (apply) {
      const updated = applyTopicTag(batch, inf.topicTag);
      fs.writeFileSync(abs, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
    }
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const csvPath = path.join(REPORT_DIR, `backfill-topictags-ready-${stamp}.csv`);
  const header = ['file', 'teil', 'action', 'topicTag', 'confidence', 'hits', 'sample'];
  const csv = [
    header.join(','),
    ...rows.map((r) => header.map((k) => csvEscape(r[k])).join(',')),
  ].join('\n');
  fs.writeFileSync(csvPath, `${csv}\n`, 'utf8');

  console.log(`Modo: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Directorio: ${path.relative(ROOT, READY_DIR)}`);
  console.log(`Candidatos inferidos: ${rows.filter((r) => r.action !== 'skip_no_infer' && r.action !== 'error').length}`);
  console.log(`Por Teil: ${JSON.stringify(byTeil)}`);
  console.log(`Omitidos (ya tenían topicTag): ${skippedHasTag}`);
  console.log(`Sin inferencia: ${skippedNoInfer}`);
  console.log(`CSV: ${path.relative(ROOT, csvPath).replace(/\\/g, '/')}`);
  if (!apply) {
    console.log('\nRevisa el CSV y ejecuta con --apply para escribir los JSON.');
  }
}

main();
