#!/usr/bin/env node
/**
 * One-off calibration: A2 Lesen T4 content_topic — current per-passage vs proposed batch-level.
 *   node scripts/audit-a2-lesen-t4-topic-calibration.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './lib/loadEnv.mjs';
import { normalizeB1Topic } from './lib/b1Topics.mjs';
import { topicsAreCompatible } from './lib/qualityGates/topicFamilies.mjs';
import { checkPassageContentTopic } from './lib/qualityGates/contentTopicCheck.mjs';

const require = createRequire(import.meta.url);
const { TOPIC_KEYWORDS } = require(path.join(ROOT, 'js/engine/partTopicDetect.js'));

/** Option A minimal: keywords that give tagScore=0 on valid Stadtleben/Verkehr ads. */
const LESEN_A2_T4_TAG_ZERO_EXTRAS = Object.freeze({
  Stadtleben: ['Werkstatt', 'Stadtführer', 'Stadtfuehrer', 'Radfahren', 'Fahrrad', 'Mobilität'],
  Verkehr: ['Fahrrad', 'Rad', 'Werkstatt', 'Mobilität'],
  Freizeit: ['Gemeinschaftsgarten', 'Kochkurs'],
});

function keywordsForTopicWithExtras(topic) {
  const base = TOPIC_KEYWORDS[topic] || [];
  const extra = LESEN_A2_T4_TAG_ZERO_EXTRAS[topic] || [];
  const seen = new Set();
  const out = [];
  for (const kw of [...base, ...extra]) {
    const key = kw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(kw);
  }
  return out;
}

function scorePassageWithExtras(passage, topicTag) {
  const blob = [passage?.title, passage?.text].filter((s) => typeof s === 'string' && s.trim()).join('\n');
  const scores = {};
  for (const topic of Object.keys(TOPIC_KEYWORDS)) {
    let n = 0;
    const kws = topic === topicTag ? keywordsForTopicWithExtras(topic) : TOPIC_KEYWORDS[topic] || [];
    for (const kw of kws) {
      const re = new RegExp(`(?:^|[^A-Za-zÄÖÜäöüß])${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^A-Za-zÄÖÜäöüß]|$)`, 'i');
      if (re.test(blob)) n++;
    }
    if (n) scores[topic] = n;
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const best = ranked[0]?.[0] || null;
  const bestScore = ranked[0]?.[1] || 0;
  const tagScore = topicTag ? scores[topicTag] || 0 : 0;
  return { scores, best, bestScore, tagScore };
}

function currentPerPassageFails(batch) {
  const tag = normalizeB1Topic(batch?.topicTag || batch?._requestedTopic);
  if (!tag) return { fails: [], ok: true };
  const fails = [];
  for (const p of batch?.passages || []) {
    const tagged = { ...p, topicTag: tag };
    const ct = checkPassageContentTopic(tagged);
    if (ct.mismatch) fails.push({ passageId: p.id, detail: ct.detail, reason: ct.reason });
  }
  return { fails, ok: fails.length === 0, tag };
}

function proposedBatchCheck(batch, majorityThreshold = 4) {
  const tag = normalizeB1Topic(batch?.topicTag || batch?._requestedTopic);
  if (!tag) return { ok: true, rule: 'no_tag' };
  const passages = batch?.passages || [];
  if (!passages.length) return { ok: true, rule: 'no_passages' };

  const agg = {};
  const per = [];
  for (const p of passages) {
    const tagged = { ...p, topicTag: tag };
    const sc = scorePassageWithExtras(tagged, tag);
    const ct = checkPassageContentTopic(tagged);
    per.push({ id: p.id, ...sc, legacyMismatch: ct.mismatch, legacyDetail: ct.detail });
    for (const [t, n] of Object.entries(sc.scores)) agg[t] = (agg[t] || 0) + n;
  }

  const tagAgg = agg[tag] || 0;
  const ranked = Object.entries(agg).sort((a, b) => b[1] - a[1]);
  const best = ranked[0]?.[0] || null;
  const bestAgg = ranked[0]?.[1] || 0;

  if (best === tag && tagAgg > 0) {
    return { ok: true, rule: 'batch_tag_wins', tagAgg, bestAgg, per };
  }

  const supported = per.filter((p) => {
    if (p.tagScore > 0) return true;
    if (p.best && topicsAreCompatible(tag, p.best).match) return true;
    return false;
  }).length;
  if (supported >= majorityThreshold) {
    return { ok: true, rule: `majority_${supported}_of_${passages.length}`, tagAgg, bestAgg, per };
  }

  if (best && best !== tag && bestAgg > tagAgg) {
    const compat = topicsAreCompatible(tag, best);
    if (!compat.match && bestAgg - tagAgg >= 2) {
      return { ok: false, rule: 'incompatible_dominates_batch', tagAgg, bestAgg, best, per };
    }
  }

  const hardPerPassage = per.filter((p) => {
    if (!p.legacyMismatch) return false;
    if (p.tagScore === 0 && p.bestScore === 0) return false;
    if (p.best && topicsAreCompatible(tag, p.best).match) return false;
    if (p.bestScore - p.tagScore >= 2) return true;
    return p.tagScore === 0 && p.bestScore >= 2;
  });
  if (hardPerPassage.length >= 2) {
    return { ok: false, rule: 'multiple_hard_passage_mismatch', count: hardPerPassage.length, per };
  }

  return { ok: true, rule: 'borderline_pass', tagAgg, bestAgg, per };
}

function walkJsonFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJsonFiles(abs, out);
    else if (ent.name.endsWith('.json') && /lesen-t4/i.test(ent.name)) out.push(abs);
  }
  return out;
}

function loadBatch(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isA2LesenT4(batch) {
  const level = String(batch?.level || batch?.passages?.[0]?.level || '').toUpperCase();
  const teil = Number(batch?.teil ?? batch?.passages?.[0]?.teil ?? batch?.questions?.[0]?.teil);
  const mod = String(batch?.module || batch?.passages?.[0]?.module || 'lesen').toLowerCase();
  return level === 'A2' && mod === 'lesen' && teil === 4;
}

const roots = [
  path.join(ROOT, 'batches/generated/A2'),
  path.join(ROOT, 'batches/generated/.rejected'),
  path.join(ROOT, 'batches/needs-regeneration/A2'),
  path.join(ROOT, 'batches/ready/pool-verified/A2'),
  path.join(ROOT, 'batches/ready/pool-content-ok-lesen/A2'),
  path.join(ROOT, 'batches/ready'),
];

const seen = new Set();
const files = [];
for (const r of roots) {
  for (const f of walkJsonFiles(r)) {
    const key = path.basename(f);
    if (seen.has(key)) continue;
    seen.add(key);
    files.push(f);
  }
}

const results = [];
for (const f of files) {
  const batch = loadBatch(f);
  if (!batch || !isA2LesenT4(batch)) continue;
  const cur = currentPerPassageFails(batch);
  const prop = proposedBatchCheck(batch, 4);
  results.push({
    file: path.relative(ROOT, f).replace(/\\/g, '/'),
    basename: path.basename(f),
    topicTag: cur.tag,
    currentOk: cur.ok,
    currentFailCount: cur.fails.length,
    proposedOk: prop.ok,
    proposedRule: prop.rule,
    flipsToPass: !cur.ok && prop.ok,
    stillFails: !cur.ok && !prop.ok,
    newlyWouldFail: cur.ok && !prop.ok,
  });
}

const currentFail = results.filter((r) => !r.currentOk);
const flips = currentFail.filter((r) => r.flipsToPass);
const still = currentFail.filter((r) => r.stillFails);
const falsePos = results.filter((r) => r.newlyWouldFail);

const out = {
  at: new Date().toISOString(),
  uniqueBatches: results.length,
  currentPerPassageFail: currentFail.length,
  proposedBatchPassOfCurrentFails: flips.length,
  proposedBatchStillFail: still.length,
  flipRate: currentFail.length ? (flips.length / currentFail.length).toFixed(3) : 'n/a',
  newlyWouldFail: falsePos.length,
  samplesFlip: flips.slice(0, 8).map((r) => ({ file: r.basename, topic: r.topicTag, rule: r.proposedRule, fails: r.currentFailCount })),
  samplesStillFail: still.slice(0, 8).map((r) => ({ file: r.basename, topic: r.topicTag, rule: r.proposedRule, fails: r.currentFailCount })),
  thresholdSweep: [3, 4, 5].map((t) => {
    let flip = 0;
    for (const f of files) {
      const batch = loadBatch(f);
      if (!batch || !isA2LesenT4(batch)) continue;
      const cur = currentPerPassageFails(batch);
      if (cur.ok) continue;
      const prop = proposedBatchCheck(batch, t);
      if (prop.ok) flip++;
    }
    return { majorityThreshold: t, flipsOfCurrentFails: flip, rate: currentFail.length ? (flip / currentFail.length).toFixed(3) : 'n/a' };
  }),
};

const outPath = path.join(ROOT, 'batches/ready/gate-logs/a2-lesen-t4-topic-calibration-2026-08-01.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
