/**
 * Dry-run then apply pool reprocess for attr-adj-before-noun (decapOnly).
 *   node scripts/reprocess-pool-attr-adj-noun-2026-07-11.mjs --dry-run
 *   node scripts/reprocess-pool-attr-adj-noun-2026-07-11.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import {
  applyGermanCapsNormalize,
  GERMAN_CAPS_NORMALIZE_VERSION,
} from './lib/germanCapsNormalize.mjs';
import { stampGermanCapsVersion } from './lib/poolReadyCheck.mjs';

const DRY = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply') || !DRY;

const DIR = path.join(ROOT, 'batches/ready/pool-verified');
const OUT = path.join(
  ROOT,
  'batches/ready/gate-logs/pool-attr-adj-noun-reprocess-2026-07-11.json',
);

const EXPECTED_FIXES = [
  { re: /\bInteressanter\b/, fileHint: '' },
  { re: /\bMittelständischen\b/ },
  { re: /\bSolchen\s+Modell\b/ },
  { re: /\bUnterschiedlichen\b/ },
  { re: /\bMonatlichen\b/ },
  { re: /\bWunderbarer\b/ },
  { re: /\bChemischen\b/ },
  { re: /\bStädtischen\b/ },
  { re: /\bBlaue\s+Papiertonne\b/ },
  { re: /\bZahlenden\b/ },
];

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const changed = [];

for (const f of files) {
  const abs = path.join(DIR, f);
  const before = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const { batch: normalized, stats, changes } = applyGermanCapsNormalize(
    structuredClone(before),
    { decapOnly: true },
  );
  const tokenChanges = changes.filter((c) => c.kind === 'token');
  if (stats.decapFixed > 0 || stats.markdownFixed > 0 || tokenChanges.length > 0) {
    changed.push({
      file: f,
      stats,
      tokens: tokenChanges.map((c) => ({ path: c.path, from: c.from, to: c.to })),
    });
    if (APPLY && !DRY) {
      const next = stampGermanCapsVersion(normalized);
      fs.writeFileSync(abs, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    }
  } else if (APPLY && !DRY) {
    // stamp-only so READY matches current version
    const next = stampGermanCapsVersion(structuredClone(before));
    fs.writeFileSync(abs, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }
}

// Verify expected leftovers / proper names on disk (after apply) or on projected text
function collectText(d) {
  const texts = [];
  for (const p of d.passages || []) {
    if (p.text) texts.push(p.text);
    if (p.title) texts.push(p.title);
  }
  for (const q of d.questions || []) {
    for (const k of ['question', 'explanation', 'statement', 'signText']) {
      if (q[k]) texts.push(q[k]);
    }
  }
  return texts.join('\n');
}

const knownLeft = [];
const allTokens = changed.flatMap((c) => c.tokens.map((t) => ({ file: c.file, ...t })));

for (const f of files) {
  const abs = path.join(DIR, f);
  let blob;
  if (APPLY && !DRY) {
    blob = collectText(JSON.parse(fs.readFileSync(abs, 'utf8')));
  } else {
    const before = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const { batch } = applyGermanCapsNormalize(structuredClone(before), { decapOnly: true });
    blob = collectText(batch);
  }
  for (const n of [
    'Interessanter',
    'Mittelständischen',
    'Unterschiedlichen',
    'Monatlichen',
    'Wunderbarer',
    'Chemischen',
    'Städtischen',
    'Blaue Papiertonne',
    'Zahlenden',
    'Solchen Modell',
  ]) {
    if (blob.includes(n)) knownLeft.push({ file: f, needle: n });
  }
}

const suspicious = allTokens.filter((t) => {
  const from = t.from;
  // Flag noun-looking decaps for review
  if (/^(Frau|Herr|Schmidt|Weber|Nele|Paul|Jonas|Tim)$/.test(from)) return true;
  if (/Viertel|Woche|Leben|Körper|Ihnen|Gemeinschaft|Umweltfragen|Gutes|Neues/.test(from)) return true;
  if (from.includes('-')) return true;
  return false;
});

const report = {
  generatedAt: new Date().toISOString(),
  version: GERMAN_CAPS_NORMALIZE_VERSION,
  mode: DRY ? 'dry-run' : 'decapOnly-apply',
  total: files.length,
  contentChanged: changed.length,
  changedFiles: changed,
  knownCapLeftInTextFields: knownLeft,
  suspiciousTokenChanges: suspicious,
  gruenesViertelPreserved: files
    .filter((f) => /lesen-t5-gemini-(022|026|027|033|037)/.test(f))
    .map((f) => {
      const raw = fs.readFileSync(path.join(DIR, f), 'utf8');
      const { batch } = applyGermanCapsNormalize(JSON.parse(raw), { decapOnly: true });
      const t = collectText(batch);
      return {
        file: f,
        hasGruenes: /\bGrünes Viertel\b/.test(t),
        hasGruenen: /\bGrünen Viertel\b/.test(t),
        lowercased: /\bgrünes viertel\b|\bgrünen viertel\b/.test(t),
      };
    }),
};

fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  mode: report.mode,
  version: report.version,
  contentChanged: report.contentChanged,
  tokenCount: allTokens.length,
  knownCapLeftInTextFields: report.knownCapLeftInTextFields,
  suspiciousTokenChanges: report.suspiciousTokenChanges,
  gruenesViertelPreserved: report.gruenesViertelPreserved,
  sample: changed.slice(0, 30).map((c) => ({ file: c.file, tokens: c.tokens })),
}, null, 2));
console.log(`\nWrote ${OUT}`);
