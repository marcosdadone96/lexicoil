/**
 * Reprocess pool-verified with current germanCapsNormalize + AUD-5 name backfill for t4-008.
 *   node scripts/reprocess-pool-verified-caps.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import {
  applyGermanCapsNormalize,
  GERMAN_CAPS_NORMALIZE_VERSION,
} from './lib/germanCapsNormalize.mjs';
import { stampGermanCapsVersion } from './lib/poolReadyCheck.mjs';
import { pickNextNames, replaceGuestNamesInBatch } from './lib/nameRotation.mjs';

const DIR = path.join(ROOT, 'batches/ready/pool-verified');
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();

function walkFixStrings(batch, fn) {
  for (const p of batch.passages || []) {
    if (typeof p.text === 'string') p.text = fn(p.text);
    if (typeof p.transcript === 'string') p.transcript = fn(p.transcript);
    if (Array.isArray(p.audio)) {
      for (const t of p.audio) {
        if (typeof t.text === 'string') t.text = fn(t.text);
      }
    }
  }
  for (const q of batch.questions || []) {
    for (const k of ['question', 'explanation', 'signText']) {
      if (typeof q[k] === 'string') q[k] = fn(q[k]);
    }
  }
}

const changedContent = [];
const stampOnly = [];

for (const f of files) {
  const abs = path.join(DIR, f);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const hadZuViel = f === 'horen-t4-gemini-007.json'
    && JSON.stringify(batch).includes('zu viel Abgase');

  const { batch: normalized, stats, changes } = applyGermanCapsNormalize(
    structuredClone(batch),
  );
  let next = stampGermanCapsVersion(normalized);

  if (f === 'horen-t4-gemini-007.json') {
    walkFixStrings(next, (s) => s.replace(/\bzu viel Abgase\b/g, 'zu viele Abgase'));
  }

  const contentChanged =
    stats.markdownFixed + stats.decapFixed + stats.capFixed > 0 || hadZuViel;
  if (contentChanged) {
    changedContent.push({
      file: f,
      stats,
      tokens: changes.filter((c) => c.kind === 'token').slice(0, 20),
      zuVielFixed: hadZuViel,
    });
  } else {
    stampOnly.push(f);
  }

  fs.writeFileSync(abs, `${JSON.stringify(next, null, 2)}\n`);
}

// AUD-5: replace Dana/Florian in t4-008 (deterministic, $0) — skip if already rotated
const f008 = 'horen-t4-gemini-008.json';
const abs008 = path.join(DIR, f008);
let b008 = JSON.parse(fs.readFileSync(abs008, 'utf8'));

const text008 = (b008.passages || []).map((p) => p.text || '').join('\n');
const stillHasTemplateNames = /\bDana\b/.test(text008) || /\bFlorian\b/.test(text008);

let nameRotation008;
if (stillHasTemplateNames) {
  const used = new Set();
  for (const f of files.filter((x) => /^horen-t4-/.test(x) && x !== f008)) {
    const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    const text = (j.passages || []).map((p) => p.text || '').join('\n');
    for (const m of text.matchAll(/^([A-ZÄÖÜ][a-zäöüß]+):/gm)) {
      if (m[1] !== 'Moderator') used.add(m[1]);
    }
  }

  const picked = pickNextNames(DIR, 2, {
    module: 'horen',
    teil: 4,
    sessionExclude: [...used],
    avoidTemplateDefaults: true,
  });

  const renamed = replaceGuestNamesInBatch(b008, ['Dana', 'Florian'], picked);
  renamed.batch._nameRotation = {
    at: new Date().toISOString(),
    from: ['Dana', 'Florian'],
    to: picked,
    note: 'AUD-5 backfill via replaceGuestNamesInBatch (no LLM)',
  };
  renamed.batch = stampGermanCapsVersion(renamed.batch);
  fs.writeFileSync(abs008, `${JSON.stringify(renamed.batch, null, 2)}\n`);
  b008 = renamed.batch;
  nameRotation008 = {
    from: ['Dana', 'Florian'],
    to: picked,
    replacements: renamed.replacements,
  };
} else {
  nameRotation008 = {
    skipped: true,
    reason: 'Dana/Florian already absent in passage text',
    existing: b008._nameRotation || null,
  };
}

const passageText008 = (b008.passages || []).map((p) => p.text || '').join('\n');
const verify007 = fs.readFileSync(path.join(DIR, 'horen-t4-gemini-007.json'), 'utf8');

const report = {
  generatedAt: new Date().toISOString(),
  version: GERMAN_CAPS_NORMALIZE_VERSION,
  total: files.length,
  contentChanged: changedContent.length,
  stampOnly: stampOnly.length,
  changedFiles: changedContent,
  nameRotation008: {
    ...nameRotation008,
    danaLeftInPassage: /\bDana\b/.test(passageText008),
    florianLeftInPassage: /\bFlorian\b/.test(passageText008),
    stimmeCapLeft: /Dem Stimme ich/.test(passageText008),
    speakers: [...new Set([...passageText008.matchAll(/^([A-ZÄÖÜ][a-zäöüß]+):/gm)].map((m) => m[1]))],
  },
  t4_007: {
    autofreieLeft: /Autofreie/.test(verify007),
    zuVielAbgaseLeft: /zu viel Abgase/.test(verify007),
    zuVieleOk: /zu viele Abgase/.test(verify007),
  },
};

const out = path.join(ROOT, 'batches/ready/gate-logs/pool-verified-caps-reprocess-2026-07-10.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.log(`\nWrote ${out}`);
