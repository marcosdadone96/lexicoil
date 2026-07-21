#!/usr/bin/env node
/**
 * Consolidated verify: known patterns + v2.3.9/v3.9 findings over 148 files.
 *   node scripts/verify-lemma-caps-v239-v39-2026-07-11.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { VOCAB_TAGS_NORMALIZE_VERSION } from './lib/enrichBatchMetadata.mjs';
import { GERMAN_CAPS_NORMALIZE_VERSION } from './lib/germanCapsNormalize.mjs';
import { capitalizeNounsInText } from './lib/capitalizeNouns.mjs';

const require = createRequire(import.meta.url);
const Lemmatizer = require('../js/engine/validation/lemmatizer.js');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const READY = path.join(ROOT, 'batches/ready');
const OUT = path.join(
  ROOT,
  'batches/ready/gate-logs/lemma-caps-v239-v39-verify-2026-07-11.json',
);

const DIRS = [
  'pool-verified',
  'lesen-t4-staging-2026-07-11-canary',
  'lesen-t5-staging-2026-07-11-canary',
  'horen-t3-staging-2026-07-11-canary',
];

const BAD_TAGS = new Set([
  'robuen',
  'mindesten',
  'hinterlässen',
  'läsen',
  'laesen',
  'yoga-kur',
  'streaming-dien',
  'vier-tage-woch',
]);

const BAD_TAG_RE = /\b(robuen|mindesten|hinterlässen|läsen|yoga-kur|streaming-dien)\b/i;
const CAPS_BAD_RE = /kleine unternehmen|unserem Jährlichen|für die kleinen\./;

const LEMMA_CASES = [
  ['robust', 'robust'],
  ['mindestens', 'mindestens'],
  ['hinterlässt', 'hinterlassen'],
  ['lässt', 'lassen'],
  ['vermisst', 'vermissen'],
  ['bewusst', 'bewusst'],
  ['meistens', 'meistens'],
];

function collectTexts(batch) {
  const texts = [];
  for (const p of batch.passages || []) {
    for (const f of ['text', 'title', 'signText', 'transcript']) {
      if (p[f]) texts.push({ where: `passage.${p.id}.${f}`, text: p[f] });
    }
  }
  for (const q of batch.questions || []) {
    for (const f of ['question', 'explanation', 'signText']) {
      if (q[f]) texts.push({ where: `q.${q.id}.${f}`, text: q[f] });
    }
    (q.options || []).forEach((opt, i) => {
      texts.push({ where: `q.${q.id}.opt${i}`, text: String(opt) });
    });
  }
  return texts;
}

const files = [];
for (const dir of DIRS) {
  const abs = path.join(READY, dir);
  if (!fs.existsSync(abs)) continue;
  for (const f of fs.readdirSync(abs).filter((x) => x.endsWith('.json')).sort()) {
    files.push({ dir, file: f, abs: path.join(abs, f) });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  expectedVocabVersion: VOCAB_TAGS_NORMALIZE_VERSION,
  expectedCapsVersion: GERMAN_CAPS_NORMALIZE_VERSION,
  filesScanned: files.length,
  lemmaUnit: [],
  fails: [],
  ok: 0,
};

for (const [surface, want] of LEMMA_CASES) {
  const got = Lemmatizer.normalizeLemma(surface, 'de');
  if (got !== want) {
    report.lemmaUnit.push({ surface, want, got, ok: false });
  } else {
    report.lemmaUnit.push({ surface, want, got, ok: true });
  }
}

const capsProbe = capitalizeNounsInText('für kleine unternehmen und große Firmen.');
if (capsProbe.result !== 'für kleine Unternehmen und große Firmen.') {
  report.fails.push({
    file: '(unit)',
    kind: 'capsUnit',
    detail: capsProbe.result,
  });
}

for (const { dir, file, abs } of files) {
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const key = `${dir}/${file}`;
  const fileFails = [];

  if (batch._vocabTagsNormalizeVersion !== VOCAB_TAGS_NORMALIZE_VERSION) {
    fileFails.push({ kind: 'vocabStamp', got: batch._vocabTagsNormalizeVersion });
  }
  if (batch._germanCapsNormalizeVersion !== GERMAN_CAPS_NORMALIZE_VERSION) {
    fileFails.push({ kind: 'capsStamp', got: batch._germanCapsNormalizeVersion });
  }

  for (const q of batch.questions || []) {
    for (const tag of q.vocabularyTags || []) {
      const low = String(tag).toLowerCase();
      if (BAD_TAGS.has(low) || BAD_TAG_RE.test(low)) {
        fileFails.push({ kind: 'badTag', qid: q.id, tag });
      }
    }
  }

  for (const { where, text } of collectTexts(batch)) {
    if (CAPS_BAD_RE.test(text)) {
      fileFails.push({ kind: 'capsBad', where, match: text.match(CAPS_BAD_RE)?.[0] });
    }
    // Live lemma chew on surfaces in text
    for (const m of text.matchAll(/\b(robust|mindestens|hinterlässt|lässt|vermisst|meistens)\b/gi)) {
      const surf = m[1].toLowerCase();
      const lem = Lemmatizer.normalizeLemma(surf, 'de');
      const expect = {
        robust: 'robust',
        mindestens: 'mindestens',
        hinterlässt: 'hinterlassen',
        lässt: 'lassen',
        vermisst: 'vermissen',
        meistens: 'meistens',
      }[surf];
      if (expect && lem !== expect) {
        fileFails.push({ kind: 'liveLemma', where, surface: surf, lemma: lem, expect });
      }
    }
  }

  if (fileFails.length) {
    report.fails.push({ file: key, fails: fileFails });
  } else {
    report.ok += 1;
  }
}

report.failCount = report.fails.length;
report.lemmaUnitFail = report.lemmaUnit.filter((x) => !x.ok).length;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Scanned: ${report.filesScanned}`);
console.log(`OK files: ${report.ok}`);
console.log(`Fail files: ${report.failCount}`);
console.log(`Lemma unit fails: ${report.lemmaUnitFail}`);
console.log(`Log: ${OUT}`);
if (report.failCount || report.lemmaUnitFail) process.exit(1);
