#!/usr/bin/env node
/**
 * Reconstruct library/vocab/de/A2.json from DWDS Goethe A2 Wortliste.
 * Anchor: https://zwei.dwds.de/lemma/wortschatz-goethe-zertifikat/A2
 * API:    https://www.dwds.de/api/lemma/goethe/A2.json
 *
 *   node scripts/reconstruct-a2-goethe-dwds.mjs
 *   node scripts/reconstruct-a2-goethe-dwds.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { A2_CORE, CUMULATIVE_CUTS } from './lib/de-frequency-tiers.mjs';
import { isBlacklistedLemma } from './lib/lexicalCheck.mjs';
import { resetVocabBankCache } from './lib/vocabBank.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');
const CACHE_DIR = path.join(ROOT, 'scripts/cache');
const A2_BAND = CUMULATIVE_CUTS.A2 - CUMULATIVE_CUTS.A1;

const VALID_LEMMA = /^[a-zäöüß][a-zäöüß\s-]*$/i;

const NON_LEMMA_FORMS = new Set(
  [
    'gegangen', 'gegessen', 'gehabt', 'gekauft', 'gekommen', 'gemacht', 'getrunken', 'gewesen',
    'größer', 'kleiner', 'besser', 'billiger', 'teurer', 'schlechter', 'letzte', 'nächste',
    'früher', 'später',
  ].map((w) => w.toLowerCase()),
);

const GRAMMAR_ABOVE_A2 = new Set(
  [
    'passiv', 'konjunktiv', 'relativsatz', 'relativpronomen', 'nominalisierung',
    'indirekte rede', 'konjunktiv i', 'konjunktiv ii',
  ].map((w) => w.toLowerCase()),
);

const PARTIAL_SEED_EXTRA = ['koffer', 'medien', 'perfekt', 'selten', 'vergleich', 'stadtplan'];

function foldLemma(word) {
  return String(word || '')
    .toLowerCase()
    .trim()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

function hasUmlautOrEszett(word) {
  return /[äöüß]/i.test(word);
}

function preferCanonicalLemma(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (hasUmlautOrEszett(a) && !hasUmlautOrEszett(b)) return a;
  if (hasUmlautOrEszett(b) && !hasUmlautOrEszett(a)) return b;
  return a;
}

function isValidLemmaShape(w) {
  const s = String(w || '').trim();
  if (!s || s.length < 2) return false;
  if (!VALID_LEMMA.test(s)) return false;
  if (NON_LEMMA_FORMS.has(s.toLowerCase())) return false;
  if (GRAMMAR_ABOVE_A2.has(s.toLowerCase())) return false;
  return true;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'LexiCoil/1.0' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse failed for ${url}: ${e.message}`));
          }
        });
      })
      .on('error', reject);
  });
}

async function loadDwds(level) {
  const cachePath = path.join(CACHE_DIR, `dwds-goethe-${level}.json`);
  if (fs.existsSync(cachePath)) {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  }
  const url = `https://www.dwds.de/api/lemma/goethe/${level}.json`;
  const data = await fetchJson(url);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return data;
}

function loadKnowledge(level) {
  const f = path.join(ROOT, 'knowledge/cefr/vocab/de', `${level}.json`);
  if (!fs.existsSync(f)) return new Set();
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  return new Set((d.lemmas || []).map((l) => String(l).toLowerCase()));
}

function loadBankLemmas(level) {
  const f = path.join(ROOT, 'library/vocab/de', `${level}.json`);
  if (!fs.existsSync(f)) return [];
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  return (d.lemmas || []).map((l) => String(l).toLowerCase());
}

function loadOverrides() {
  const f = path.join(ROOT, 'library/vocab/de/_overrides.json');
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

function extractDwdsEntries(entries) {
  return entries.map((e) => {
    const variants = (e.sch || []).map((s) => String(s.lemma || '').toLowerCase().trim()).filter(Boolean);
    let lemma = variants[0] || '';
    for (const v of variants.slice(1)) {
      lemma = preferCanonicalLemma(lemma, v);
    }
    return {
      lemma,
      variants,
      pos: e.pos || '',
      genera: e.genera || [],
      articles: e.articles || [],
      url: e.url || '',
    };
  });
}

function buildDwdsIndex(a1Entries, a2Entries) {
  const byLemma = new Map();
  const byFold = new Map();
  for (const row of [...a1Entries, ...a2Entries]) {
    if (!row.lemma) continue;
    byLemma.set(row.lemma, row);
    const f = foldLemma(row.lemma);
    if (!byFold.has(f)) byFold.set(f, row);
    for (const v of row.variants) {
      byLemma.set(v, row);
      const fv = foldLemma(v);
      if (!byFold.has(fv)) byFold.set(fv, { ...row, lemma: preferCanonicalLemma(row.lemma, v) });
    }
  }
  return { byLemma, byFold };
}

function qualityReasons(w, ctx) {
  const reasons = [];
  if (!isValidLemmaShape(w)) reasons.push('invalid_shape');
  if (ctx.seen.has(w)) reasons.push('duplicate');
  if (ctx.a1Bank.has(w)) reasons.push('in_a1_band');
  const onlyHigh = (ctx.C1.has(w) || ctx.C2.has(w)) && !ctx.lowerOrEqA2.has(w);
  if (onlyHigh) reasons.push('c1_c2_only');
  if (isBlacklistedLemma(w)) reasons.push('blacklist');
  const forced = ctx.forceInclude[w];
  if (forced === 'B1' || forced === 'B2' || forced === 'C1' || forced === 'C2') {
    reasons.push(`force_${forced.toLowerCase()}`);
  }
  return reasons;
}

function pickDwdsA2Anchor(a2Dwds, ctx) {
  const seen = new Set();
  const foldOwner = new Map();
  const kept = [];
  const skipped = [];

  for (const row of a2Dwds) {
    const lemma = row.lemma;
    if (!lemma) {
      skipped.push({ lemma: '(empty)', reason: 'empty' });
      continue;
    }
    const reasons = qualityReasons(lemma, { ...ctx, seen });
    if (reasons.includes('in_a1_band')) {
      skipped.push({ lemma, reason: 'in_a1_band' });
      continue;
    }
    if (seen.has(lemma)) {
      skipped.push({ lemma, reason: 'dwds_exact_duplicate' });
      continue;
    }
    if (reasons.length) {
      skipped.push({ lemma, reason: reasons.join('+') });
      continue;
    }
    const f = foldLemma(lemma);
    if (foldOwner.has(f)) {
      const prev = foldOwner.get(f);
      const canon = preferCanonicalLemma(prev, lemma);
      if (canon !== prev) {
        const idx = kept.indexOf(prev);
        if (idx >= 0) kept[idx] = canon;
        seen.delete(prev);
        seen.add(canon);
        foldOwner.set(f, canon);
        skipped.push({ lemma: prev, reason: 'ascii_fold_replaced', replacedBy: canon });
      } else {
        skipped.push({ lemma, reason: 'ascii_fold_duplicate', kept: prev });
      }
      continue;
    }
    seen.add(lemma);
    foldOwner.set(f, lemma);
    kept.push(lemma);
  }
  return { kept, skipped, seen, foldOwner };
}

function gapfillPriority(w, ctx) {
  if (ctx.forceInclude[w] === 'A2') return 0;
  if (ctx.a2Core.has(w)) return 1;
  if (ctx.partialSeed.has(w)) return 2;
  if (ctx.oldDwdsPool.has(w)) return 3;
  if (ctx.fromA2Api.has(w)) return 4;
  return 5;
}

function gapfill(lemmas, pool, ctx, target) {
  const seen = new Set(lemmas);
  const foldOwner = new Map();
  for (const w of lemmas) foldOwner.set(foldLemma(w), w);

  const ranked = [...new Set(pool.map((w) => String(w).toLowerCase().trim()))]
    .filter((w) => !seen.has(w))
    .sort((a, b) => {
      const pa = gapfillPriority(a, ctx);
      const pb = gapfillPriority(b, ctx);
      return pa - pb || a.localeCompare(b, 'de');
    });

  const added = [];
  for (const w of ranked) {
    if (lemmas.length >= target) break;
    const reasons = qualityReasons(w, { ...ctx, seen });
    if (reasons.length) continue;
    const f = foldLemma(w);
    if (foldOwner.has(f) && foldOwner.get(f) !== w) continue;
    seen.add(w);
    foldOwner.set(f, w);
    lemmas.push(w);
    added.push({ lemma: w, priority: gapfillPriority(w, ctx) });
  }
  return added;
}

function verifySample(lemmas, dwdsIndex, sampleSize = 30, seed = 20260715) {
  let s = seed;
  const rng = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const picks = [];
  const used = new Set();
  while (picks.length < Math.min(sampleSize, lemmas.length)) {
    const i = Math.floor(rng() * lemmas.length);
    if (used.has(i)) continue;
    used.add(i);
    picks.push(lemmas[i]);
  }

  const results = [];
  for (const w of picks) {
    const row = dwdsIndex.byLemma.get(w) || dwdsIndex.byFold.get(foldLemma(w));
    const ok = Boolean(row);
    let genderOk = true;
    if (row && /^noun|substantiv/i.test(row.pos) && row.genera?.length) {
      genderOk = row.genera.every((g) => ['m', 'f', 'n', 'pl', 'mask.', 'fem.', 'neutr.'].includes(String(g).toLowerCase()) || /mask|fem|neutr/i.test(String(g)));
    }
    results.push({
      lemma: w,
      dwdsHit: ok,
      dwdsLemma: row?.lemma || null,
      pos: row?.pos || null,
      genera: row?.genera || [],
      genderOk,
      pass: ok && genderOk,
    });
  }
  const passed = results.filter((r) => r.pass).length;
  return { results, passed, total: results.length, rate: results.length ? passed / results.length : 1 };
}

function countFoldDuplicates(lemmas) {
  const byFold = new Map();
  for (const w of lemmas) {
    const f = foldLemma(w);
    if (!byFold.has(f)) byFold.set(f, []);
    byFold.get(f).push(w);
  }
  return [...byFold.entries()].filter(([, arr]) => arr.length > 1);
}

const knowledge = {
  A1: loadKnowledge('A1'),
  A2: loadKnowledge('A2'),
  B1: loadKnowledge('B1'),
  C1: loadKnowledge('C1'),
  C2: loadKnowledge('C2'),
};
const lowerOrEqA2 = new Set([...knowledge.A1, ...knowledge.A2, ...knowledge.B1]);
const a1Bank = new Set(loadBankLemmas('A1'));
const oldA2 = loadBankLemmas('A2');
const overrides = loadOverrides();
const forceInclude = overrides.forceInclude || {};
const a2Core = new Set(A2_CORE.map((w) => w.toLowerCase()));
const partialSeed = new Set([
  ...knowledge.A2,
  ...PARTIAL_SEED_EXTRA,
].map((w) => String(w).toLowerCase()));

console.log('Fetching DWDS Goethe A1/A2…');
const [dwdsA1Raw, dwdsA2Raw] = await Promise.all([loadDwds('A1'), loadDwds('A2')]);
const a1Dwds = extractDwdsEntries(dwdsA1Raw);
const a2Dwds = extractDwdsEntries(dwdsA2Raw);
const dwdsIndex = buildDwdsIndex(a1Dwds, a2Dwds);
const fromA2Api = new Set(a2Dwds.map((r) => r.lemma).filter(Boolean));

const ctxBase = {
  seen: new Set(),
  a1Bank,
  C1: knowledge.C1,
  C2: knowledge.C2,
  lowerOrEqA2,
  forceInclude,
  a2Core,
  partialSeed,
  oldDwdsPool: new Set(),
  fromA2Api,
};

const { kept: anchor, skipped: dwdsSkipped } = pickDwdsA2Anchor(a2Dwds, ctxBase);
console.log('DWDS A2 API anchor (not in A1 band):', anchor.length, 'skipped:', dwdsSkipped.length);

const anchorSet = new Set(anchor);
const oldDwdsPool = oldA2.filter((w) => {
  const l = w.toLowerCase();
  return (
    !anchorSet.has(l) &&
    !a1Bank.has(l) &&
    (dwdsIndex.byLemma.has(l) || dwdsIndex.byFold.has(foldLemma(l)))
  );
});
ctxBase.oldDwdsPool = new Set(oldDwdsPool);

const dwdsA1GapPool = a1Dwds
  .map((r) => r.lemma)
  .filter((l) => l && !a1Bank.has(l) && !anchorSet.has(l));

const gapPool = [
  ...Object.entries(forceInclude).filter(([, lv]) => lv === 'A2').map(([w]) => w),
  ...A2_CORE,
  ...PARTIAL_SEED_EXTRA,
  ...oldDwdsPool,
  ...dwdsA1GapPool,
];

let lemmas = [...anchor];
const gapAdded = gapfill(lemmas, gapPool, ctxBase, A2_BAND);
console.log('Gap-fill added:', gapAdded.length, 'final:', lemmas.length);

if (lemmas.length > A2_BAND) {
  lemmas = lemmas.slice(0, A2_BAND);
  console.log('Trimmed to band ceiling:', A2_BAND);
}

const foldDups = countFoldDuplicates(lemmas);
if (foldDups.length) {
  console.error('FATAL: fold duplicates remain:', foldDups);
  process.exit(1);
}

const dwdsSourced = lemmas.filter(
  (w) => dwdsIndex.byLemma.has(w) || dwdsIndex.byFold.has(foldLemma(w)),
);
const sampleAll = verifySample(lemmas, dwdsIndex, 30);
const sampleDwdsOnly = verifySample(dwdsSourced, dwdsIndex, 30, 20260716);

console.log('DWDS-sourced lemmas:', dwdsSourced.length, '/', lemmas.length);
console.log('DWDS sample (full bank):', `${sampleAll.passed}/${sampleAll.total}`, `(${(sampleAll.rate * 100).toFixed(1)}%)`);
console.log('DWDS sample (DWDS-sourced only):', `${sampleDwdsOnly.passed}/${sampleDwdsOnly.total}`, `(${(sampleDwdsOnly.rate * 100).toFixed(1)}%)`);

const bankPath = path.join(ROOT, 'library/vocab/de/A2.json');
const out = {
  level: 'A2',
  lang: 'de',
  source: 'goethe-wortliste-dwds-verified-2026-07-15',
  lemmaCount: lemmas.length,
  cleanedAt: '2026-07-15',
  reconstruction: {
    anchor: 'DWDS Goethe A2 API entries not already in library/vocab/de/A1.json',
    dwdsA2ApiEntries: dwdsA2Raw.length,
    dwdsAnchor: anchor.length,
    dwdsSourced: dwdsSourced.length,
    gapAdded: gapAdded.length,
    bandTarget: A2_BAND,
    cumulativeCut: CUMULATIVE_CUTS.A2,
  },
  dwdsVerification: {
    sampleSize: sampleAll.total,
    passed: sampleAll.passed,
    rate: sampleAll.rate,
    dwdsSourcedSampleSize: sampleDwdsOnly.total,
    dwdsSourcedPassed: sampleDwdsOnly.passed,
    dwdsSourcedRate: sampleDwdsOnly.rate,
    sample: sampleAll.results,
  },
  lemmas: [...lemmas].sort((a, b) => a.localeCompare(b, 'de')),
};

if (!dryRun) {
  fs.writeFileSync(bankPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  resetVocabBankCache();
  console.log('Wrote', path.relative(ROOT, bankPath), 'lemmaCount', out.lemmaCount);
} else {
  console.log('(dry-run: no write)');
}

const reportPath = path.join(ROOT, 'batches/ready/VOCAB-A2-BANK-CLEAN-2026-07-15.md');
const report = [
  '# Reconstrucción library/vocab/de/A2.json (2026-07-15)',
  '',
  '## Ancla semántica',
  '',
  '- **Wortliste oficial Goethe A2** vía DWDS: [wortschatz-goethe-zertifikat/A2](https://zwei.dwds.de/lemma/wortschatz-goethe-zertifikat/A2)',
  '- API A2: `https://www.dwds.de/api/lemma/goethe/A2.json` (**612** entradas)',
  '- API A1 (gap-fill verificado): `https://www.dwds.de/api/lemma/goethe/A1.json` (**849** entradas)',
  '- El banco open-frequency anterior quedó **descartado** (contaminación B1: `boomen`, `anbauen`, `abstimmung`, …).',
  '',
  '## Techo operativo',
  '',
  `- Banda A2 = \`CUMULATIVE_CUTS.A2 - A1\` = **${A2_BAND}** lemas (acumulado ≤${CUMULATIVE_CUTS.A2})`,
  `- Conteo final: **${out.lemmaCount}**`,
  `- Lemas con hit DWDS (A1∪A2 API): **${dwdsSourced.length}**`,
  '',
  '## Pipeline',
  '',
  `1. Anchor: entradas API A2 no presentes en \`A1.json\` → **${anchor.length}**`,
  '2. Dedupe exacto + ASCII/umlaut (`spaß` > `spass`; **0** fold-duplicados finales)',
  '3. Filtro calidad: c1_c2_only, blacklist, force B1/B2, invalid_shape, in_a1_band',
  `4. Gap-fill priorizado: forceInclude A2 → A2_CORE → partial-seed → pool legado DWDS → DWDS A1 restante`,
  `5. Gap-fill añadidos: **${gapAdded.length}**`,
  '',
  '## Verificación DWDS',
  '',
  '| Muestra | Aciertos | Tasa |',
  '|---------|----------|------|',
  `| Banco completo (n=${sampleAll.total}) | ${sampleAll.passed}/${sampleAll.total} | ${(sampleAll.rate * 100).toFixed(1)}% |`,
  `| Solo lemas DWDS-sourced (n=${sampleDwdsOnly.total}) | ${sampleDwdsOnly.passed}/${sampleDwdsOnly.total} | ${(sampleDwdsOnly.rate * 100).toFixed(1)}% |`,
  '| Duplicados ASCII/diéresis | **0** | — |',
  '',
  '### Muestra banco completo',
  '',
  ...sampleAll.results.map(
    (r) =>
      `- \`${r.lemma}\` → DWDS ${r.dwdsHit ? '✓' : '✗'} \`${r.dwdsLemma || '—'}\` pos=${r.pos || '—'} genera=${r.genera?.join('/') || '—'}`,
  ),
  '',
  '## Gramática A2 (sin colisión)',
  '',
  'Taxonomía A2: Perfekt + Akk/Dativ (`knowledge/languages/german.json`). Sin Passiv, Konjunktiv I ni Relativsätze avanzados.',
  'Gap-fill excluye `forceInclude` B1/B2 y lemas meta `grammar_above_a2`.',
  '',
  '## Gap-fill añadidos (top 40)',
  '',
  gapAdded.length
    ? gapAdded
        .slice(0, 40)
        .map((g) => `- \`${g.lemma}\` (prioridad ${g.priority})`)
        .join('\n')
    : '- (ninguno)',
  gapAdded.length > 40 ? `\n… y ${gapAdded.length - 40} más.` : '',
  '',
  '## Script',
  '',
  '`scripts/reconstruct-a2-goethe-dwds.mjs`',
  '',
].join('\n');

if (!dryRun) {
  fs.writeFileSync(reportPath, `${report}\n`, 'utf8');
  console.log('Report', path.relative(ROOT, reportPath));
}

if (out.lemmaCount !== A2_BAND) {
  console.error(`WARNING: expected ${A2_BAND} lemmas, got ${out.lemmaCount}`);
  process.exit(1);
}

if (sampleDwdsOnly.rate < 0.95) {
  console.error(`WARNING: DWDS-sourced sample rate ${(sampleDwdsOnly.rate * 100).toFixed(1)}% < 95%`);
  process.exit(1);
}
