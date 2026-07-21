#!/usr/bin/env node
/**
 * Reconstruct B1.json = clean-2026-07-10 (634 from HEAD) + gap-fill 48.
 * Then run same criteria as clean-vocab-b1-bank.mjs.
 *
 *   node scripts/reconstruct-b1-clean-plus-gapfill-2026-07-12.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { isBlacklistedLemma } from './lib/lexicalCheck.mjs';
import { resetVocabBankCache } from './lib/vocabBank.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 48 curated gap-fill lemmas from 2026-07-12 CEFR fill (A1/A2/B1 classified). */
const GAP48 = [
  'halten',
  'zusammen',
  'einmal',
  'freuen',
  'nutzen',
  'gemeinsam',
  'sondern',
  'versuchen',
  'aktiv',
  'gehören',
  'melden',
  'anmeldung',
  'trennen',
  'bedeuten',
  'packen',
  'vorteil',
  'gerät',
  'aufgabe',
  'direkt',
  'täglich',
  'zukunft',
  'bitten',
  'beachten',
  'aktuell',
  'angenehm',
  'bieten',
  'pflegen',
  'achten',
  'schaffen',
  'diskutieren',
  'vermitteln',
  'positiv',
  'speziell',
  'genießen',
  'zentral',
  'verlassen',
  'nutzung',
  'heizung',
  'bedeutung',
  'reinigung',
  'mülltrennung',
  'sorgfältig',
  'finanziwell', // typo guard — real form below
  'finanziell',
  'aktivität',
  'erwachsen',
  'erfolgen',
  'betreffen',
  'schritt',
].filter((w) => w !== 'finanziwell');

const LOST33 = [
  'genehmigen',
  'handy',
  'besitzen',
  'räume',
  'küche',
  'groß',
  'entscheidung',
  'gemüse',
  'ernte',
  'engagement',
  'ehrenamt',
  'dokumente',
  'therapie',
  'verein',
  'lehrerin',
  'unterstützung',
  'verkehrsmittel',
  'urlaub',
  'regionen',
  'region',
  'kulturell',
  'partner',
  'veränderung',
  'viertel',
  'kündigen',
  'hobby',
  'backen',
  'wald',
  'gehen',
  'stress',
  'kopf',
  'reisen',
  'umwelt',
];

function loadKnowledge(level) {
  const f = path.join(ROOT, 'knowledge/cefr/vocab/de', `${level}.json`);
  if (!fs.existsSync(f)) return new Set();
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  return new Set((d.lemmas || []).map((l) => String(l).toLowerCase()));
}

function cleanLemmas(lemmas, { A1, A2, B1k, C1, C2 }) {
  const lowerOrEqB1 = new Set([...A1, ...A2, ...B1k]);
  const removed = [];
  const kept = [];
  const seen = new Set();
  for (const raw of lemmas) {
    const w = String(raw || '')
      .toLowerCase()
      .trim();
    if (!w || w.startsWith('de_lemma_pad')) {
      removed.push({ lemma: w || '(empty)', reason: 'pad_or_empty' });
      continue;
    }
    if (seen.has(w)) {
      removed.push({ lemma: w, reason: 'duplicate' });
      continue;
    }
    const onlyHigh = (C1.has(w) || C2.has(w)) && !lowerOrEqB1.has(w);
    if (onlyHigh) {
      removed.push({ lemma: w, reason: 'c1_c2_only' });
      continue;
    }
    if (isBlacklistedLemma(w)) {
      removed.push({ lemma: w, reason: 'blacklist' });
      continue;
    }
    seen.add(w);
    kept.push(w);
  }
  return { kept, removed };
}

const knowledge = {
  A1: loadKnowledge('A1'),
  A2: loadKnowledge('A2'),
  B1k: loadKnowledge('B1'),
  C1: loadKnowledge('C1'),
  C2: loadKnowledge('C2'),
};

const head = JSON.parse(
  execSync('git show HEAD:library/vocab/de/B1.json', {
    encoding: 'utf8',
    maxBuffer: 10e6,
    cwd: ROOT,
  }),
);

const pass1 = cleanLemmas(head.lemmas, knowledge);
console.log('Pass1 clean from HEAD:', {
  head: head.lemmas.length,
  kept: pass1.kept.length,
  removed: pass1.removed.length,
});

const combined = [...pass1.kept];
const seen = new Set(combined);
let gapAdded = 0;
for (const w of GAP48) {
  const low = w.toLowerCase();
  if (seen.has(low)) continue;
  seen.add(low);
  combined.push(low);
  gapAdded += 1;
}
console.log('Gap48 added (not already in clean):', gapAdded, '/', GAP48.length);

const pass2 = cleanLemmas(combined, knowledge);
const byReason = {};
for (const r of pass2.removed) byReason[r.reason] = (byReason[r.reason] || 0) + 1;
console.log('Pass2 clean on combined:', {
  before: combined.length,
  kept: pass2.kept.length,
  removed: pass2.removed.length,
  byReason,
});

const lostOk = LOST33.every((w) => pass2.kept.includes(w.toLowerCase()));
const gapOk = GAP48.every((w) => pass2.kept.includes(w.toLowerCase()));
const pads = pass2.kept.filter((w) => w.startsWith('de_lemma_pad'));
console.log('Lost33 all present:', lostOk, 'missing', LOST33.filter((w) => !pass2.kept.includes(w)));
console.log('Gap48 all present:', gapOk, 'missing', GAP48.filter((w) => !pass2.kept.includes(w)));
console.log('Pads in final:', pads.length);

const bankPath = path.join(ROOT, 'library/vocab/de/B1.json');
const out = {
  level: 'B1',
  lang: 'de',
  source: 'open-frequency+manual+lesen-batch-extras+cleaned-c1c2-leak-2026-07-10+gapfill-2026-07-12',
  lemmaCount: pass2.kept.length,
  cleanedAt: '2026-07-10',
  reconstructedAt: new Date().toISOString(),
  reconstruction: {
    from: 'git HEAD B1 → clean-vocab criteria → +48 gapfill → clean again',
    cleanBase: pass1.kept.length,
    gapAdded,
    final: pass2.kept.length,
  },
  lemmas: pass2.kept.sort((a, b) => a.localeCompare(b, 'de')),
};

fs.writeFileSync(bankPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
resetVocabBankCache();
console.log('Wrote', path.relative(ROOT, bankPath), 'lemmaCount', out.lemmaCount);

// Restore A1/A2 from HEAD (undo pad/rebuild pollution) so CEFR union is not inflated by rebuild slices
for (const lv of ['A1', 'A2']) {
  const raw = execSync(`git show HEAD:library/vocab/de/${lv}.json`, {
    encoding: 'utf8',
    maxBuffer: 10e6,
    cwd: ROOT,
  });
  fs.writeFileSync(path.join(ROOT, 'library/vocab/de', `${lv}.json`), raw.endsWith('\n') ? raw : `${raw}\n`, 'utf8');
  console.log('Restored', lv, 'from HEAD');
}
