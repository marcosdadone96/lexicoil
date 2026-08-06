#!/usr/bin/env node
/**
 * Apply P0.3 audit leftovers: R/F chrono restore, manual text fixes, caps v3.10.
 * Targets: 9 canary + mirrors + pool T3 001–004 (same shuffle bug) + Hören T1 staging (6).
 *
 *   node scripts/reprocess-p03-audit-leftovers-2026-07-11.mjs
 *   node scripts/reprocess-p03-audit-leftovers-2026-07-11.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyGermanCapsNormalize,
  GERMAN_CAPS_NORMALIZE_VERSION,
} from './lib/germanCapsNormalize.mjs';
import { stampGermanCapsVersion } from './lib/poolReadyCheck.mjs';
import { BALANCE_MCQ_VERSION } from './lib/balanceMcq.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const READY = path.join(ROOT, 'batches/ready');
const LOG = path.join(ROOT, 'batches/ready/gate-logs/p03-audit-leftovers-2026-07-11.json');
const dryRun = process.argv.includes('--dry-run');

/** Sort richtig_falsch by trailing numeric id (generation / chrono order). */
function restoreRfChronoOrder(batch) {
  const qs = batch.questions || [];
  if (qs.length < 2) return { changed: false, before: [], after: [] };
  const allRf = qs.every((q) => q.type === 'richtig_falsch');
  if (!allRf) return { changed: false, before: [], after: [] };

  const before = qs.map((q) => q.id);
  const sorted = [...qs].sort((a, b) => {
    const na = Number(String(a.id).match(/-(\d+)$/)?.[1] || 0);
    const nb = Number(String(b.id).match(/-(\d+)$/)?.[1] || 0);
    return na - nb;
  });
  const after = sorted.map((q) => q.id);
  const changed = before.join('|') !== after.join('|');
  if (changed) batch.questions = sorted;
  return { changed, before, after };
}

function replaceAllInBatch(batch, from, to) {
  const hits = [];
  const walk = (obj, pathPrefix) => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => {
        if (typeof v === 'string' && v.includes(from)) {
          obj[i] = v.split(from).join(to);
          hits.push({ path: `${pathPrefix}[${i}]`, from, to });
        } else if (v && typeof v === 'object') walk(v, `${pathPrefix}[${i}]`);
      });
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && v.includes(from)) {
        obj[k] = v.split(from).join(to);
        hits.push({ path: `${pathPrefix}.${k}`, from, to });
      } else if (v && typeof v === 'object') walk(v, `${pathPrefix}.${k}`);
    }
  };
  walk(batch, '$');
  return hits;
}

/** File-specific surgical content fixes (audit P0.3). */
function applyManualFixes(relKey, batch) {
  const notes = [];
  const base = path.basename(relKey);

  if (base === 'horen-t3-gemini-001.json') {
    for (const q of batch.questions || []) {
      // Only the Anna/Ben canary misattribution (Anna wrongly credited with Ben's line)
      if (
        /Anna fragt:.*"Machst du Sport\?".*sagt:.*"Ich sollte mehr machen\."/s.test(q.explanation || '')
      ) {
        const before = q.explanation;
        q.explanation =
          'Anna fragt: "Machst du Sport?" Ben antwortet: "Ich sollte mehr machen." Sie schlägt auch einen Spaziergang vor.';
        if (before !== q.explanation) notes.push({ kind: 'misattributed-quote', qid: q.id });
      }
    }
  }

  if (base === 'horen-t3-gemini-002.json') {
    const agendaHits = replaceAllInBatch(
      batch,
      'eine gute Agenda für den Sommer',
      'ein guter Plan für den Sommer',
    );
    if (agendaHits.length) notes.push({ kind: 'agenda→plan', hits: agendaHits.length });

    for (const q of batch.questions || []) {
      if (/Familientreffen organisiert/.test(q.question || '')) {
        const beforeQ = q.question;
        const beforeE = q.explanation;
        // Avoid circular organisiert↔organisiert: test host/location instead
        q.question = 'Ben hat das Familientreffen bei sich zu Hause ausgerichtet.';
        q.explanation =
          'Ben sagt: "Wir hatten ein großes Familientreffen bei meinen Eltern." Das Treffen fand also bei den Eltern statt, nicht bei Ben.';
        if (beforeQ !== q.question || beforeE !== q.explanation) {
          notes.push({ kind: 'circular-inference-rewrite', qid: q.id, beforeQ, afterQ: q.question });
        }
        // Drop organisiert from tags if present
        if (Array.isArray(q.vocabularyTags)) {
          q.vocabularyTags = q.vocabularyTags
            .map((t) => (String(t).toLowerCase() === 'organisiert' ? 'eltern' : t))
            .filter((t, i, a) => a.findIndex((x) => String(x).toLowerCase() === String(t).toLowerCase()) === i);
        }
      }
    }
  }

  if (base === 'horen-t3-gemini-004.json') {
    const hits = replaceAllInBatch(
      batch,
      'Die Bestände an verlässlichen Informationen scheinen immer kleiner zu werden',
      'Verlässliche Informationen scheinen immer knapper zu werden',
    );
    if (hits.length) notes.push({ kind: 'bestaende-rewrite', hits: hits.length });
  }

  if (base === 'lesen-t5-gemini-002.json') {
    if (batch._textSubtype === 'kantine') {
      batch._textSubtype = 'hausordnung';
      notes.push({ kind: '_textSubtype', from: 'kantine', to: 'hausordnung' });
    }
  }

  return notes;
}

const TARGETS = [
  // Canary 9
  'lesen-t4-staging-2026-07-11-canary/lesen-t4-gemini-001.json',
  'lesen-t4-staging-2026-07-11-canary/lesen-t4-gemini-002.json',
  'lesen-t4-staging-2026-07-11-canary/lesen-t4-gemini-003.json',
  'lesen-t5-staging-2026-07-11-canary/lesen-t5-gemini-001.json',
  'lesen-t5-staging-2026-07-11-canary/lesen-t5-gemini-002.json',
  'lesen-t5-staging-2026-07-11-canary/lesen-t5-gemini-003.json',
  'horen-t3-staging-2026-07-11-canary/horen-t3-gemini-001.json',
  'horen-t3-staging-2026-07-11-canary/horen-t3-gemini-002.json',
  'horen-t3-staging-2026-07-11-canary/horen-t3-gemini-004.json',
  // Mirror
  'canary-all-staging-2026-07-11/lesen-t4-gemini-001.json',
  'canary-all-staging-2026-07-11/lesen-t4-gemini-002.json',
  'canary-all-staging-2026-07-11/lesen-t4-gemini-003.json',
  'canary-all-staging-2026-07-11/lesen-t5-gemini-001.json',
  'canary-all-staging-2026-07-11/lesen-t5-gemini-002.json',
  'canary-all-staging-2026-07-11/lesen-t5-gemini-003.json',
  'canary-all-staging-2026-07-11/horen-t3-gemini-001.json',
  'canary-all-staging-2026-07-11/horen-t3-gemini-002.json',
  'canary-all-staging-2026-07-11/horen-t3-gemini-004.json',
  // Pool T3 (same shuffle bug; 003 only lives here)
  'pool-verified/horen-t3-gemini-001.json',
  'pool-verified/horen-t3-gemini-002.json',
  'pool-verified/horen-t3-gemini-003.json',
  'pool-verified/horen-t3-gemini-004.json',
  // Hören T1 staging (verify set of 15)
  'horen-t1-staging-2026-07-11/horen-t1-gemini-001.json',
  'horen-t1-staging-2026-07-11/horen-t1-gemini-002.json',
  'horen-t1-staging-2026-07-11/horen-t1-gemini-003.json',
  'horen-t1-staging-2026-07-11/horen-t1-gemini-004.json',
  'horen-t1-staging-2026-07-11/horen-t1-gemini-005.json',
  'horen-t1-staging-2026-07-11/horen-t1-gemini-016.json',
];

const stampAt = new Date().toISOString();
const report = {
  generatedAt: stampAt,
  dryRun,
  versions: {
    caps: GERMAN_CAPS_NORMALIZE_VERSION,
    balanceMcq: BALANCE_MCQ_VERSION,
  },
  files: {},
};

console.log(`P0.3 leftovers · ${TARGETS.length} targets · dryRun=${dryRun}`);

for (const rel of TARGETS) {
  const abs = path.join(READY, rel);
  if (!fs.existsSync(abs)) {
    report.files[rel] = { skipped: 'missing' };
    console.warn('  SKIP missing', rel);
    continue;
  }
  const raw = fs.readFileSync(abs, 'utf8');
  const batch = JSON.parse(raw);
  const entry = {
    chrono: null,
    manual: [],
    capsFixed: 0,
    contentChanged: false,
  };

  entry.chrono = restoreRfChronoOrder(batch);
  entry.manual = applyManualFixes(rel, batch);

  const { batch: capped, stats } = applyGermanCapsNormalize(structuredClone(batch));
  let next = stampGermanCapsVersion(capped);
  next._balanceMcqVersion = BALANCE_MCQ_VERSION;
  next._balanceMcqNormalizedAt = stampAt;
  entry.capsFixed =
    (stats?.markdownFixed || 0) + (stats?.decapFixed || 0) + (stats?.capFixed || 0);

  const nextJson = `${JSON.stringify(next, null, 2)}\n`;
  entry.contentChanged = nextJson !== raw;
  report.files[rel] = entry;

  if (!dryRun && entry.contentChanged) {
    fs.writeFileSync(abs, nextJson);
  }
  console.log(
    `  ${entry.contentChanged ? 'WRITE' : 'ok   '} ${rel}` +
      ` chrono=${entry.chrono.changed} caps=${entry.capsFixed} manual=${entry.manual.length}`,
  );
}

fs.mkdirSync(path.dirname(LOG), { recursive: true });
fs.writeFileSync(LOG, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Log: ${LOG}`);
