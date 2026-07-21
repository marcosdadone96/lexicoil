#!/usr/bin/env node
/**
 * Hygiene remate Schreiben B1 generated:
 *  1) Re-label _rejectedReason on obsolete rejects; promote 003
 *  2) Backfill topicTags via detectTopic + tagBatchWithTopic
 *
 *   node scripts/reprocess-schreiben-generated-hygiene.mjs
 *   node scripts/reprocess-schreiben-generated-hygiene.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectTopic, tagBatchWithTopic, B1_TOPICS } from './lib/topicRotation.mjs';
import { checkPromptBatchQuality } from './lib/promptBatchQuality.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED = path.join(ROOT, 'batches', 'generated');
const REJECTED = path.join(GENERATED, '.rejected');
const dryRun = process.argv.includes('--dry-run');

const INSTITUTIONAL_REASON =
  'Schreiben T3: destinatario institucional sin persona concreta (hasInstitutionalAddress)';

const REJECT_MAP = {
  'schreiben-gemini-001-2026-06-29T14-32-10-372Z.json': { action: 'relabel', reason: INSTITUTIONAL_REASON },
  'schreiben-gemini-002-2026-06-29T14-32-10-393Z.json': { action: 'relabel', reason: INSTITUTIONAL_REASON },
  'schreiben-gemini-003-metadata-contaminated.json': { action: 'promote' },
  'schreiben-gemini-005-2026-06-29T14-32-10-440Z.json': { action: 'relabel', reason: INSTITUTIONAL_REASON },
};

/** Prefer content topics over template noise (Freund/Hobby → Freizeit). */
function pickTopicForBatch(batch) {
  const texts = (batch.questions || []).map((q) => String(q.question || ''));
  const full = texts.join('\n');
  // Score all topics manually with same keyword table via per-teil + full
  const candidates = [];
  const fullHit = detectTopic(full);
  if (fullHit) candidates.push(fullHit);
  for (const t of texts) {
    const d = detectTopic(t);
    if (d) candidates.push(d);
  }
  const counts = Object.fromEntries(B1_TOPICS.map((t) => [t, 0]));
  for (const c of candidates) {
    if (counts[c] != null) counts[c]++;
  }
  // Soft-penalize Freizeit (every T1 mentions Freund)
  if (counts.Freizeit) counts.Freizeit = Math.max(0, counts.Freizeit - 1);

  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] > 0) return ranked[0][0];
  return fullHit || detectTopic(full) || 'Freizeit';
}

function stripRejectMeta(batch) {
  const { _rejectedReason, _scoreEstimate, ...rest } = batch;
  return rest;
}

function writeJson(abs, obj) {
  if (dryRun) return;
  fs.writeFileSync(abs, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

function assertPromote003Ok(batch) {
  const issues = [];
  for (const t of [1, 2, 3]) {
    const subset = {
      passages: batch.passages || [],
      questions: (batch.questions || []).filter((q) => Number(q.teil) === t),
    };
    if (!subset.questions.length) continue;
    const r = checkPromptBatchQuality(subset, 'schreiben', t);
    if (!r.ok) issues.push(...r.issues.map((i) => `T${t}: ${i}`));
  }
  if (issues.length) {
    throw new Error(`Cannot promote 003 — quality FAIL:\n${issues.join('\n')}`);
  }
}

// ── Tarea 1: relabel / promote ──────────────────────────────────────────────
console.log('── Tarea 1: _rejectedReason + promote 003 ──');
let promotedPath = null;

for (const [filename, spec] of Object.entries(REJECT_MAP)) {
  const abs = path.join(REJECTED, filename);
  if (!fs.existsSync(abs)) {
    console.error(`missing: ${filename}`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));

  if (spec.action === 'relabel') {
    const next = { ...raw, _rejectedReason: spec.reason };
    console.log(
      `${filename}: ${JSON.stringify(raw._rejectedReason)} → ${JSON.stringify(spec.reason)}${dryRun ? ' (dry-run)' : ''}`,
    );
    writeJson(abs, next);
  } else if (spec.action === 'promote') {
    assertPromote003Ok(raw);
    const clean = stripRejectMeta(raw);
    const destName = 'schreiben-gemini-003.json';
    const dest = path.join(GENERATED, destName);
    if (fs.existsSync(dest)) {
      throw new Error(`promote blocked: ${destName} already exists`);
    }
    console.log(
      `${filename}: PROMOTE → batches/generated/${destName} (was FP «registro informal ausente»)${dryRun ? ' (dry-run)' : ''}`,
    );
    if (!dryRun) {
      writeJson(dest, clean);
      fs.unlinkSync(abs);
    }
    promotedPath = dest;
  }
}

// ── Tarea 2: topicTags backfill ─────────────────────────────────────────────
console.log('\n── Tarea 2: topicTags backfill ──');

function listSchreibenGemini() {
  const out = [];
  for (const f of fs.readdirSync(GENERATED).filter((x) => /^schreiben-gemini-\d+\.json$/i.test(x))) {
    out.push(path.join(GENERATED, f));
  }
  if (fs.existsSync(REJECTED)) {
    for (const f of fs.readdirSync(REJECTED).filter((x) => /^schreiben-gemini/i.test(x) && x.endsWith('.json'))) {
      out.push(path.join(REJECTED, f));
    }
  }
  return out.sort();
}

let filesTouched = 0;
let questionsTagged = 0;
const topicHist = {};

for (const abs of listSchreibenGemini()) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const topic = pickTopicForBatch(raw);
  const tagged = tagBatchWithTopic(raw, topic);
  topicHist[topic] = (topicHist[topic] || 0) + 1;

  const before = (raw.questions || []).map((q) => (q.topicTags || []).join(',')).join('|');
  const after = (tagged.questions || []).map((q) => (q.topicTags || []).join(',')).join('|');
  const rootChanged = raw.topicTag !== tagged.topicTag;

  if (before !== after || rootChanged) {
    filesTouched++;
    questionsTagged += (tagged.questions || []).length;
    console.log(`${rel}: topic=${topic} (was daily_life)${dryRun ? ' (dry-run)' : ''}`);
    writeJson(abs, tagged);
  } else {
    console.log(`${rel}: already topic=${topic}`);
  }
}

console.log('\n── Summary ──');
console.log(`filesTouched: ${filesTouched}`);
console.log(`questionsTagged: ${questionsTagged}`);
console.log('topicHistogram:', topicHist);
if (promotedPath) console.log(`promoted: ${path.relative(ROOT, promotedPath).replace(/\\/g, '/')}`);
console.log(dryRun ? 'DRY-RUN OK' : 'OK');
