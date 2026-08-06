#!/usr/bin/env node
/**
 * Via A matchability — realistic surface forms from pool learner text.
 *
 *   node scripts/probe-via-a-matchability.mjs           # fresh sample of 38
 *   node scripts/probe-via-a-matchability.mjs --retest  # same 38 as baseline JSON
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const {
  canonicalizeVocabQuery,
  vocabEntryKeys,
} = require(path.join(ROOT, 'netlify/functions/lib/vocabIndexQuality.js'));
const { getPartVocabIndex } = require(path.join(ROOT, 'netlify/functions/lib/partIndex.js'));
const Lemmatizer = require(path.join(ROOT, 'js/engine/validation/lemmatizer.js'));
const SeparableResolve = require(path.join(ROOT, 'js/engine/separableResolve.js'));
globalThis.Lemmatizer = Lemmatizer;

const BASELINE = path.join(ROOT, 'batches/ready/gate-logs/via-a-matchability-2026-07-12.json');
const RETEST = process.argv.includes('--retest');
const OUT_PATH = RETEST
  ? path.join(ROOT, 'batches/ready/gate-logs/via-a-matchability-2026-07-12-retest.json')
  : BASELINE;
const FINITE_TO_INF = {
  macht: 'machen', machst: 'machen', mache: 'machen', gemacht: 'machen',
  nimmt: 'nehmen', nimmst: 'nehmen', nehme: 'nehmen', genommen: 'nehmen',
  kommt: 'kommen', kommst: 'kommen', komme: 'kommen', gekommen: 'kommen',
  geht: 'gehen', gehst: 'gehen', gehe: 'gehen', gegangen: 'gehen',
  gibt: 'geben', gibst: 'geben', gebe: 'geben', gegeben: 'geben',
  sieht: 'sehen', siehst: 'sehen', sehe: 'sehen', gesehen: 'sehen',
  spricht: 'sprechen', sprichst: 'sprechen', spreche: 'sprechen', gesprochen: 'sprechen',
  schreibt: 'schreiben', schreibst: 'schreiben', schrieb: 'schreiben', geschrieben: 'schreiben',
  liest: 'lesen', lese: 'lesen', las: 'lesen', gelesen: 'lesen',
  fährt: 'fahren', fährst: 'fahren', fahre: 'fahren', fuhr: 'fahren', gefahren: 'fahren',
  läuft: 'laufen', läufst: 'laufen', laufe: 'laufen', lief: 'laufen', gelaufen: 'laufen',
  steht: 'stehen', stehst: 'stehen', stehe: 'stehen', stand: 'stehen', gestanden: 'stehen',
  liegt: 'liegen', liegst: 'liegen', liege: 'liegen', lag: 'liegen', gelegen: 'liegen',
  wohnt: 'wohnen', wohnst: 'wohnen', wohne: 'wohnen', gewohnt: 'wohnen',
  arbeitet: 'arbeiten', arbeitest: 'arbeiten', arbeite: 'arbeiten', gearbeitet: 'arbeiten',
  lernt: 'lernen', lernst: 'lernen', lerne: 'lernen', gelernt: 'lernen',
  kauft: 'kaufen', kaufst: 'kaufen', kaufe: 'kaufen', gekauft: 'kaufen',
  denkt: 'denken', denkst: 'denken', denke: 'denken', gedacht: 'denken',
  glaubt: 'glauben', glaubst: 'glauben', glaube: 'glauben', geglaubt: 'glauben',
  kennt: 'kennen', kennst: 'kennen', kenne: 'kennen', gekannt: 'kennen',
  spielt: 'spielen', spielst: 'spielen', spiele: 'spielen', gespielt: 'spielen',
  findet: 'finden', findest: 'finden', finde: 'finden', gefunden: 'finden',
  braucht: 'brauchen', brauchst: 'brauchen', brauche: 'brauchen', gebraucht: 'brauchen',
  hilft: 'helfen', hilfst: 'helfen', helfe: 'helfen', geholfen: 'helfen',
  bringt: 'bringen', bringst: 'bringen', bringe: 'bringen', gebracht: 'bringen',
  bleibt: 'bleiben', bleibst: 'bleiben', bleibe: 'bleiben', geblieben: 'bleiben',
  beginnt: 'beginnen', beginnst: 'beginnen', beginne: 'beginnen', begonnen: 'beginnen',
  schlägt: 'schlagen', schlägst: 'schlagen',
  fängt: 'fangen', fängst: 'fangen',
  ruft: 'rufen', rufst: 'rufen',
  stellt: 'stellen', stellst: 'stellen', gestellt: 'stellen',
  nutzt: 'nutzen', nutze: 'nutzen', genutzt: 'nutzen',
  sucht: 'suchen', suchst: 'suchen', gesucht: 'suchen',
  wünscht: 'wünschen', wuenscht: 'wünschen',
  erwartet: 'erwarten',
  unterstützt: 'unterstützen', unterstuetzt: 'unterstützen',
  verändert: 'verändern',
  informiert: 'informieren',
  konsumiert: 'konsumieren',
  empfiehlt: 'empfehlen', empfohlen: 'empfehlen',
  vergisst: 'vergessen',
  angefangen: 'anfangen',
};

function clientCanon(raw) {
  let t = String(raw || '').trim();
  const m = t.match(/^(der|die|das|den|dem|des|ein|eine|einer|eines|einem|einen)\s+(.+)$/i);
  if (m) t = m[2];
  return t;
}

function learnerText(doc) {
  const parts = [];
  const grab = (n, key = '') => {
    if (n == null) return;
    if (typeof n === 'string') {
      if (['question', 'explanation', 'text', 'situation', 'title', 'transcript', 'prompt'].includes(key)) {
        parts.push(n);
      }
      return;
    }
    if (Array.isArray(n)) {
      if (key === 'options') n.forEach((x) => typeof x === 'string' && parts.push(x));
      else n.forEach((x) => grab(x, key));
      return;
    }
    if (typeof n === 'object') {
      for (const [k, v] of Object.entries(n)) {
        if (k === 'vocabularyTags' || k === 'vocabIndex' || k.startsWith('_')) continue;
        grab(v, k);
      }
    }
  };
  grab(doc);
  return parts.join('\n');
}

function collectTags(doc) {
  const tags = new Set();
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (Array.isArray(n.vocabularyTags)) {
      for (const t of n.vocabularyTags) {
        tags.add(String(typeof t === 'string' ? t : t?.word || '').toLowerCase());
      }
    }
    for (const v of Object.values(n)) if (v && typeof v === 'object') walk(v);
  };
  walk(doc);
  return tags;
}

const files = fs.readdirSync(POOL).filter((f) => f.endsWith('.json'));
const allTagSet = new Set();
const allVocabKeys = new Set();
const tagToFiles = new Map();
const textByFile = new Map();

for (const f of files) {
  const doc = JSON.parse(fs.readFileSync(path.join(POOL, f), 'utf8'));
  const tags = collectTags(doc);
  for (const t of tags) {
    allTagSet.add(t);
    if (!tagToFiles.has(t)) tagToFiles.set(t, []);
    tagToFiles.get(t).push(f);
  }
  textByFile.set(f, learnerText(doc));
  try {
    const idx = getPartVocabIndex({ ...doc, lang: 'de', level: 'B1' });
    for (const e of idx || []) {
      for (const k of vocabEntryKeys(e)) allVocabKeys.add(String(k).toLowerCase());
    }
  } catch (_) {}
  for (const t of tags) allVocabKeys.add(t);
}

/** Mine realistic surfaces */
const mined = [];

// 1) Finite / participle verbs present in text whose expected infinitive is a pool tag
for (const f of files) {
  const text = textByFile.get(f);
  const lowText = text.toLowerCase();
  for (const [finite, inf] of Object.entries(FINITE_TO_INF)) {
    const re = new RegExp(`(?:^|[^a-zäöüß])${finite}(?:[^a-zäöüß]|$)`, 'i');
    if (!re.test(text)) continue;
    // Prefer when infinitive (or separable containing it) is tagged somewhere
    const tagged =
      allTagSet.has(inf) ||
      [...allTagSet].some((t) => t.endsWith(inf) && t.length <= inf.length + 8);
    mined.push({
      surface: finite,
      goldLemma: inf,
      kind: 'verb-finite',
      file: f,
      taggedGold: tagged || allVocabKeys.has(inf),
    });
  }
}

// 2) Separable: «schlägt … vor», «nimmt … teil», «macht … mit»
const sepPatterns = [
  { re: /\b(schlägt)\b[\s\S]{0,40}?\bvor\b/i, surface: 'schlägt', gold: 'vorschlagen', kind: 'separable' },
  { re: /\b(nimmt)\b[\s\S]{0,40}?\bteil\b/i, surface: 'nimmt', gold: 'teilnehmen', kind: 'separable' },
  { re: /\b(macht)\b[\s\S]{0,40}?\bmit\b/i, surface: 'macht', gold: 'mitmachen', kind: 'separable' },
  { re: /\b(kommt)\b[\s\S]{0,40}?\bmit\b/i, surface: 'kommt', gold: 'mitkommen', kind: 'separable' },
  { re: /\b(ruft)\b[\s\S]{0,40}?\ban\b/i, surface: 'ruft', gold: 'anrufen', kind: 'separable' },
  { re: /\b(fängt)\b[\s\S]{0,40}?\ban\b/i, surface: 'fängt', gold: 'anfangen', kind: 'separable' },
  { re: /\b(stellt)\b[\s\S]{0,40}?\bvor\b/i, surface: 'stellt', gold: 'vorstellen', kind: 'separable' },
];
for (const f of files) {
  const text = textByFile.get(f);
  for (const p of sepPatterns) {
    if (p.re.test(text)) {
      mined.push({
        surface: p.surface,
        goldLemma: p.gold,
        kind: p.kind,
        file: f,
        taggedGold: allTagSet.has(p.gold) || allVocabKeys.has(p.gold),
      });
    }
  }
}

// 3) Plurals / weak noun forms: token whose lemmatizer or -en/-er strip hits a tagged noun
const NOUN_PLURAL_RE = /\b([A-ZÄÖÜ][a-zäöüß]{3,}(?:en|er|e|n|s))\b/g;
for (const f of files) {
  const text = textByFile.get(f);
  let m;
  const re = new RegExp(NOUN_PLURAL_RE.source, 'g');
  while ((m = re.exec(text))) {
    const surface = m[1];
    const low = surface.toLowerCase();
    // skip sentence starters that are verbs? keep nouns capitalized mid-sentence too hard — keep all caps-start
    const candidates = [
      Lemmatizer.normalizeLemma(surface, 'de'),
      low.replace(/en$/, ''),
      low.replace(/er$/, ''),
      low.replace(/e$/, ''),
      low.replace(/n$/, ''),
      low.replace(/s$/, ''),
    ].map((x) => String(x || '').toLowerCase()).filter(Boolean);
    const gold = candidates.find((c) => allTagSet.has(c) || allVocabKeys.has(c));
    if (!gold) continue;
    if (gold === low) continue; // not inflected relative to tag
    mined.push({
      surface,
      goldLemma: gold,
      kind: 'noun-plural',
      file: f,
      taggedGold: true,
    });
  }
}

// 4) Inflected adjectives ending -en/-e/-er whose base is tagged
const ADJ_RE = /\b([a-zäöüß]{4,}(?:ischen|lichen|igen|erten|enen|sten|eren|em|en|er|es|e))\b/gi;
for (const f of files) {
  const text = textByFile.get(f);
  let m;
  const re = new RegExp(ADJ_RE.source, 'gi');
  while ((m = re.exec(text))) {
    const surface = m[1];
    const low = surface.toLowerCase();
    if (/^(einen|einem|einer|eines|diesen|dieser|dieses|einen|einen)$/.test(low)) continue;
    const base = String(Lemmatizer.normalizeLemma(surface, 'de') || low).toLowerCase();
    if (!allTagSet.has(base) && !allVocabKeys.has(base)) continue;
    if (base === low) continue;
    mined.push({
      surface: low,
      goldLemma: base,
      kind: 'adj-flex',
      file: f,
      taggedGold: true,
    });
  }
}

// Dedup by surface, prefer taggedGold + separable
function pickSample(items, n = 38) {
  const byKey = new Map();
  for (const it of items) {
    const k = it.surface.toLowerCase() + '|' + (it.goldLemma || '');
    const prev = byKey.get(k);
    if (!prev || (it.taggedGold && !prev.taggedGold) || it.kind === 'separable') byKey.set(k, it);
  }
  const all = [...byKey.values()];
  const buckets = {
    separable: [],
    'verb-finite': [],
    'noun-plural': [],
    'adj-flex': [],
  };
  for (const it of all) {
    (buckets[it.kind] || buckets['verb-finite']).push(it);
  }
  for (const b of Object.values(buckets)) {
    b.sort((a, b) => Number(b.taggedGold) - Number(a.taggedGold) || a.surface.localeCompare(b.surface));
  }
  const out = [];
  const seenSurf = new Set();
  const take = (arr, q) => {
    for (const it of arr) {
      if (out.length >= n) return;
      const s = it.surface.toLowerCase();
      // allow same finite for different gold (macht→machen vs mitmachen) once each gold
      const key = s + '::' + it.goldLemma;
      if (seenSurf.has(key)) continue;
      seenSurf.add(key);
      out.push(it);
      if (out.filter((x) => x.kind === it.kind).length >= q) break;
    }
  };
  take(buckets.separable, 8);
  take(buckets['verb-finite'].filter((x) => x.taggedGold), 14);
  take(buckets['noun-plural'].filter((x) => x.taggedGold), 10);
  take(buckets['adj-flex'].filter((x) => x.taggedGold), 8);
  // fill
  for (const it of all) {
    if (out.length >= n) break;
    const key = it.surface.toLowerCase() + '::' + it.goldLemma;
    if (seenSurf.has(key)) continue;
    seenSurf.add(key);
    out.push(it);
  }
  return out.slice(0, n);
}

const sample = RETEST
  ? (() => {
      const prev = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
      return (prev.rows || []).map((r) => ({
        surface: r.saved,
        goldLemma: r.goldLemma,
        kind: r.kind,
        file: r.sourceFile,
        taggedGold: r.taggedGold,
        prevMatch: r.match,
        prevLemmas: r.lemmas,
      }));
    })()
  : pickSample(mined, 38);

const rows = [];
for (const c of sample) {
  const surface = c.surface;
  // Simulate save-time reunification (Parte 1) using passage text as sentence context
  const ctx = textByFile.get(c.file) || '';
  const resolved = SeparableResolve.resolveForSave(surface, ctx);
  const saved = resolved.word;
  const afterClient = clientCanon(saved);
  const server = canonicalizeVocabQuery([afterClient], { lang: 'de' });
  const lemmas = (server.words || []).map((w) => String(w).toLowerCase());
  const goldLow = String(c.goldLemma || '').toLowerCase();

  const tagHit = lemmas.some((l) => allTagSet.has(l));
  const keyHit = lemmas.some((l) => allVocabKeys.has(l));
  const goldHit = allTagSet.has(c.goldLemma) || allVocabKeys.has(c.goldLemma) ||
    allTagSet.has(goldLow) || allVocabKeys.has(goldLow);
  const match = tagHit || keyHit;
  const goldLemmaFound = lemmas.some((l) => l === goldLow);

  let cause = '';
  if (!match) {
    if (goldHit) {
      cause = `matching_bug: gold «${c.goldLemma}» is in pool tags/keys but query resolved to [${lemmas.join(', ')}]`;
    } else {
      cause = `content_gap: neither query keys nor gold «${c.goldLemma}» in pool tags`;
    }
  }

  let evidence = '';
  if (match) {
    for (const l of lemmas) {
      if (tagToFiles.has(l)) {
        evidence = tagToFiles.get(l)[0];
        break;
      }
    }
  } else if (goldHit && tagToFiles.has(c.goldLemma)) {
    evidence = tagToFiles.get(c.goldLemma)[0];
  }

  rows.push({
    saved: surface,
    savedAs: saved,
    reunified: !!resolved.reunified,
    lemmaUncertain: !!resolved.lemmaUncertain,
    kind: c.kind,
    goldLemma: c.goldLemma,
    afterClient,
    lemmas: lemmas.join(' | '),
    match: match ? 'YES' : 'NO',
    goldLemmaFound: goldLemmaFound ? 'YES' : 'NO',
    via: match ? (tagHit ? 'vocabularyTags' : 'vocabKeys') : '',
    cause,
    sourceFile: c.file,
    evidenceFile: evidence,
    taggedGold: c.taggedGold,
    prevMatch: c.prevMatch || '',
    prevLemmas: c.prevLemmas || '',
  });
}

console.log('surface | savedAs | kind | gold | server lemmas | match | goldOK | detail');
console.log('-'.repeat(120));
for (const r of rows) {
  const detail = r.match === 'YES'
    ? `${r.via}${r.evidenceFile ? ' @' + r.evidenceFile : ''}${r.reunified ? ' [reunified]' : ''}`
    : r.cause;
  console.log(`${r.saved} | ${r.savedAs} | ${r.kind} | ${r.goldLemma} | ${r.lemmas} | ${r.match} | ${r.goldLemmaFound} | ${detail}`);
}

const yes = rows.filter((r) => r.match === 'YES').length;
const goldYes = rows.filter((r) => r.goldLemmaFound === 'YES').length;
const bugs = rows.filter((r) => r.cause.startsWith('matching_bug'));
const gaps = rows.filter((r) => r.cause.startsWith('content_gap'));

const fair = rows.filter((r) => r.taggedGold || allTagSet.has(r.goldLemma) || allVocabKeys.has(r.goldLemma));
const fairYes = fair.filter((r) => r.match === 'YES').length;
const fairGold = fair.filter((r) => r.goldLemmaFound === 'YES').length;

const prevYes = rows.filter((r) => r.prevMatch === 'YES').length;
const regression = rows.filter((r) => r.prevMatch === 'YES' && r.match === 'NO');
const fixed = rows.filter((r) => r.prevMatch === 'NO' && r.match === 'YES');

console.log('\n=== SUMMARY ===');
console.log({
  n: rows.length,
  matched: yes,
  missed: rows.length - yes,
  matchabilityPct: ((yes / rows.length) * 100).toFixed(1) + '%',
  goldLemmaFound: goldYes,
  goldLemmaPct: ((goldYes / rows.length) * 100).toFixed(1) + '%',
  matching_bug: bugs.length,
  content_gap: gaps.length,
  fairSubset_n: fair.length,
  fairSubset_matched: fairYes,
  fairMatchabilityPct: fair.length ? ((fairYes / fair.length) * 100).toFixed(1) + '%' : 'n/a',
  fairGoldLemmaPct: fair.length ? ((fairGold / fair.length) * 100).toFixed(1) + '%' : 'n/a',
  retest: RETEST,
  prevMatched: prevYes || undefined,
  newlyFixed: RETEST ? fixed.map((r) => r.saved) : undefined,
  regressions: RETEST ? regression.map((r) => r.saved) : undefined,
});

console.log('\n=== FAILURES ===');
for (const r of rows.filter((r) => r.match === 'NO')) {
  console.log('-', r.saved, '→', r.savedAs, '→', r.lemmas, '|', r.cause);
}

if (RETEST && regression.length) {
  console.log('\n=== REGRESSIONS (were YES, now NO) ===');
  for (const r of regression) console.log('-', r.saved, r.prevLemmas, '→', r.lemmas);
}

const out = {
  generatedAt: new Date().toISOString(),
  mode: RETEST ? 'retest-fixed-38' : 'fresh-sample',
  poolFiles: files.length,
  tagCount: allTagSet.size,
  vocabKeyCount: allVocabKeys.size,
  rows,
  summary: {
    n: rows.length,
    matched: yes,
    matchabilityPct: (yes / rows.length) * 100,
    goldLemmaFound: goldYes,
    goldLemmaPct: (goldYes / rows.length) * 100,
    matching_bug: bugs.length,
    content_gap: gaps.length,
    fairSubset: { n: fair.length, matched: fairYes, pct: fair.length ? (fairYes / fair.length) * 100 : null },
    newlyFixed: RETEST ? fixed.map((r) => r.saved) : [],
    regressions: RETEST ? regression.map((r) => r.saved) : [],
  },
};
fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
console.log('\nWrote', path.relative(ROOT, OUT_PATH));
