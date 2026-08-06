/**
 * Audit CEFR vocab level of pool-verified exam-facing German text (measurement only).
 *
 * Source of truth for "≤B1 OK":
 *   union of library/vocab/de/{A1,A2,B1}.json
 *   (built from scripts/lib/de-frequency-tiers.mjs via build-vocab-open.mjs;
 *    knowledge/cefr/vocab is a smaller partial seed — not used as allow-list)
 *
 * Text coverage (v2 — extended beyond passages):
 *   - passages[].text / transcript (Lesen, Hören)
 *   - questions[].question — Schreiben, Sprechen, Lesen T3
 *   - questions[].options — Lesen T3 Kleinanzeigen only
 *   - questions[].signText — Lesen T4 forum posts
 *   - EXCLUDES Schreiben/Sprechen explanation (scoring rubric)
 *
 * Classification of unique content lemmas:
 *   - allowed: in A1∪A2∪B1
 *   - knownHigh: in knowledge B2/C1/C2 OR library/vocab/de/_overrides.json exclude
 *   - unknown: not in ≤B1 bank and not knownHigh (catalog gap OR genuine hard word)
 *
 * Lemmatization: js/engine/validation/lemmatizer.js (fixed DE path).
 *
 *   node scripts/audit-cefr-vocab-level.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './lib/loadEnv.mjs';
import { listPoolVerifiedJson } from './lib/batchPaths.mjs';

const require = createRequire(import.meta.url);
const Lemmatizer = require(path.join(ROOT, 'js/engine/validation/lemmatizer.js'));
const OUT = path.join(
  ROOT,
  'batches/ready/gate-logs/cefr-vocab-level-audit-2026-07-11.json',
);
const VOCAB_DIR = path.join(ROOT, 'library/vocab/de');
const KNOWLEDGE_DIR = path.join(ROOT, 'knowledge/cefr/vocab/de');

/** Same spirit as enrichBatchMetadata STOP (function words / low content). */
const STOP = new Set([
  'sein', 'haben', 'werden', 'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer',
  'eines', 'einem', 'einen', 'und', 'oder', 'aber', 'nicht', 'auch', 'sie', 'er', 'es', 'wir',
  'ihr', 'ich', 'du', 'man', 'mit', 'von', 'zu', 'zum', 'zur', 'auf', 'in', 'im', 'ins', 'an',
  'am', 'für', 'bei', 'nach', 'vor', 'über', 'unter', 'durch', 'als', 'wenn', 'weil', 'dass',
  'ob', 'so', 'noch', 'nur', 'schon', 'sehr', 'mehr', 'kann', 'können', 'muss', 'müssen',
  'soll', 'sollen', 'will', 'wollen', 'darf', 'dürfen', 'mag', 'mögen', 'wird', 'wurde',
  'worden', 'hat', 'hatte', 'sind', 'war', 'waren', 'ist', 'bin', 'bist', 'seid', 'wurden',
  'dieser', 'diese', 'dieses', 'diesen', 'diesem', 'jeder', 'jede', 'alle', 'alles', 'viel',
  'wenig', 'sich', 'mein', 'meine', 'dein', 'seine', 'ihr', 'unser', 'mich', 'dich', 'ihm',
  'ihn', 'uns', 'euch', 'ihnen', 'mir', 'dir', 'hier', 'dort', 'dann', 'denn', 'immer', 'oft',
  'mal', 'wieder', 'etwa', 'fast', 'kaum', 'doch', 'wohl', 'eben', 'wann', 'was', 'wer', 'wie',
  'wo', 'warum', 'also', 'jedoch', 'trotzdem', 'außerdem', 'deshalb', 'deswegen', 'dennoch',
  'allerdings', 'bitte', 'gar', 'ohne', 'gegen', 'zwischen', 'neben', 'hinter', 'bis', 'seit',
  'während', 'trotz', 'kein', 'keine', 'keiner', 'ja', 'nein', 'vielleicht', 'etwas', 'nichts',
  'jemand', 'niemand', 'heute', 'morgen', 'gestern', 'jetzt', 'später', 'früher', 'nie',
  'manchmal', 'wohin', 'woher', 'womit', 'worauf', 'davon', 'dazu', 'dabei', 'darauf', 'dafür',
  'darum', 'hin', 'her', 'aus', 'ab', 'um', 'per', 'via', 'etc',
]);

/** Manual / targeted content-edit stamps (exclude mass caps/balance reprocess). */
const CONTENT_EDIT_STAMPS = [
  '_contentSpotFixedAt',
  '_horenT2DistractorFixedAt',
  '_lemmatizerFixReprocessedAt',
  '_sprPerspectiveFixedAt',
  '_horenT2OpeningVariedAt',
  '_separableSplitFixReprocessedAt',
  '_orphanTagCleanupAt',
];

function loadLemmaFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return (data.lemmas || [])
    .map((w) => String(w).toLowerCase().trim())
    .filter((w) => w && !w.startsWith('de_lemma_pad'));
}

function loadAllowedLeB1() {
  const set = new Set();
  for (const lv of ['A1', 'A2', 'B1']) {
    for (const w of loadLemmaFile(path.join(VOCAB_DIR, `${lv}.json`))) set.add(w);
  }
  return set;
}

function loadKnownHigh() {
  const set = new Set();
  for (const lv of ['B2', 'C1', 'C2']) {
    for (const w of loadLemmaFile(path.join(KNOWLEDGE_DIR, `${lv}.json`))) set.add(w);
    for (const w of loadLemmaFile(path.join(VOCAB_DIR, `${lv}.json`))) set.add(w);
  }
  const ovPath = path.join(VOCAB_DIR, '_overrides.json');
  if (fs.existsSync(ovPath)) {
    const ov = JSON.parse(fs.readFileSync(ovPath, 'utf8'));
    for (const w of ov.exclude || []) set.add(String(w).toLowerCase());
  }
  return set;
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

/**
 * Collect exam-facing German text from a batch.
 *
 * Covered:
 *   - passages[].text / passages[].transcript / batch.transcript (Lesen/Hören body)
 *   - questions[].question for Schreiben, Sprechen, Lesen T3 (prompts / situations)
 *   - questions[].options for Lesen T3 only (A–H Kleinanzeigen — main reading content;
 *     situations alone are too short to represent the Teil)
 *   - questions[].signText when present (Lesen T4 forum posts — denser than passage intro)
 *
 * Explicitly EXCLUDED:
 *   - questions[].explanation for Schreiben / Sprechen (official scoring rubric, not exam text)
 *   - explanations in general (meta / answer keys — not learner-facing stem content)
 *
 * @param {object} batch
 * @param {string} file
 * @returns {{ text: string, sources: Record<string, number> }}
 */
function collectExamText(batch, file) {
  const chunks = [];
  /** @type {Record<string, number>} */
  const sources = {
    passageText: 0,
    passageTranscript: 0,
    batchTranscript: 0,
    question: 0,
    t3Options: 0,
    signText: 0,
  };

  const base = String(file || '').toLowerCase();
  const isSchreiben = base.startsWith('schreiben-');
  const isSprechen = base.startsWith('sprechen-');
  const isLesenT3 = base.startsWith('lesen-t3-');
  const includeQuestion =
    isSchreiben || isSprechen || isLesenT3;
  const includeT3Options = isLesenT3;

  for (const p of batch.passages || []) {
    if (p?.text) {
      chunks.push(String(p.text));
      sources.passageText += String(p.text).length;
    }
    if (p?.transcript) {
      chunks.push(String(p.transcript));
      sources.passageTranscript += String(p.transcript).length;
    }
  }
  if (batch.transcript) {
    chunks.push(String(batch.transcript));
    sources.batchTranscript += String(batch.transcript).length;
  }

  for (const q of batch.questions || []) {
    if (includeQuestion && q?.question) {
      chunks.push(String(q.question));
      sources.question += String(q.question).length;
    }
    if (includeT3Options && Array.isArray(q?.options)) {
      for (const opt of q.options) {
        const t = typeof opt === 'string' ? opt : opt?.text || '';
        if (t) {
          chunks.push(String(t));
          sources.t3Options += String(t).length;
        }
      }
    }
    // Lesen T4 (and any other part that stores learner-facing forum text here)
    if (q?.signText) {
      chunks.push(String(q.signText));
      sources.signText += String(q.signText).length;
    }
    // explanation intentionally skipped (Schreiben/Sprechen rubric; other modules = answer meta)
  }

  return { text: chunks.join('\n\n'), sources };
}

/**
 * @deprecated use collectExamText — kept name alias for readability in inventory comments
 */
function collectPassageText(batch, file) {
  return collectExamText(batch, file).text;
}

/**
 * Split into approximate sentences for context snippets.
 * @param {string} text
 */
function sentencesOf(text) {
  return String(text || '')
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

/**
 * Tokenize preserving surface casing for proper-name heuristic.
 * @param {string} text
 * @returns {{ surface: string, lower: string, atSentenceStart: boolean }[]}
 */
function tokenizeWithMeta(text) {
  const out = [];
  const parts = String(text || '').split(/([.!?…]\s+|\n+)/);
  let atStart = true;
  for (const part of parts) {
    if (/^[.!?…]/.test(part) || part === '\n' || /^\n+$/.test(part)) {
      atStart = true;
      continue;
    }
    const re = /[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\-]*/g;
    let m;
    while ((m = re.exec(part)) !== null) {
      const surface = m[0];
      out.push({
        surface,
        lower: surface.toLowerCase(),
        atSentenceStart: atStart,
      });
      atStart = false;
    }
  }
  return out;
}

function looksLikeProperName(surface, atSentenceStart) {
  if (!/^[A-ZÄÖÜ]/.test(surface)) return false;
  // Mid-sentence capital → likely proper noun / institution in German
  if (!atSentenceStart) return true;
  // Sentence-start capital is ambiguous; only treat as PN if camel / multi-cap
  if (/[A-ZÄÖÜ].*[A-ZÄÖÜ]/.test(surface)) return true;
  return false;
}

function isNumericToken(w) {
  return /^\d+$/.test(w) || /^\d+[\.,]\d+$/.test(w);
}

/** ASCII ↔ umlaut variants for bank lookup. */
function spellingVariants(w) {
  const s = String(w || '').toLowerCase();
  const set = new Set([s]);
  set.add(
    s
      .replace(/ae/g, 'ä')
      .replace(/oe/g, 'ö')
      .replace(/ue/g, 'ü')
      .replace(/ss/g, 'ß'),
  );
  set.add(
    s
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss'),
  );
  return [...set];
}

/**
 * Candidate lemmas for bank lookup (surface + lemmatizer forms + light infinitive repair).
 * Cuts false "unknown" from over-stripping (bitten→bit, beachten→beach).
 * @param {string} lower
 */
function candidateLemmas(lower) {
  const forms = new Set(Lemmatizer.lemmaForms(lower, 'de'));
  forms.add(lower);
  const primary = Lemmatizer.normalizeLemma(lower, 'de') || lower;
  forms.add(primary);
  if (primary.length >= 3 && !/(?:en|eln|ern)$/.test(primary)) {
    forms.add(`${primary}en`);
    forms.add(`${primary}n`);
    if (primary.endsWith('e')) forms.add(`${primary}n`);
  }
  if (/^ge.+t$/.test(lower) && lower.length >= 6) {
    forms.add(`${lower.slice(2, -1)}en`);
  }
  const out = new Set();
  for (const f of forms) {
    for (const v of spellingVariants(f)) out.add(v);
  }
  return [...out];
}

/** @param {string[]} cands @param {Set<string>} bank */
function hitsBank(cands, bank) {
  return cands.some((c) => bank.has(c));
}

/** Over-stripped stubs that are almost always lemmatizer noise, not content lemmas. */
const LEMMA_NOISE = new Set([
  'bit', 'beach', 'ach', 'ander', 'end', 'leis', 'ers', 'hal', 'lau', 'dus',
  'schi', 'ruf', 'meld', 'nutz', 'leb', 'mach', 'helf', 'lern', 'fuehl', 'denk',
  'kenn', 'hoff', 'koenn', 'meint', 'gibt', 'gilt', 'kostet', 'bereit', 'all',
]);

/**
 * @param {string} text
 * @param {Set<string>} allowed
 * @param {Set<string>} knownHigh
 */
function analyzeText(text, allowed, knownHigh) {
  const tokens = tokenizeWithMeta(text);
  const sents = sentencesOf(text);
  /** @type {Map<string, { lemma: string, surface: string, class: string, context: string }>} */
  const unique = new Map();

  for (const tok of tokens) {
    if (tok.lower.length <= 2) continue;
    if (isNumericToken(tok.lower)) continue;
    if (STOP.has(tok.lower)) continue;
    if (looksLikeProperName(tok.surface, tok.atSentenceStart)) continue;

    const cands = candidateLemmas(tok.lower);
    const lemma = Lemmatizer.normalizeLemma(tok.lower, 'de') || tok.lower;
    if (!lemma || lemma.length <= 2) continue;

    let klass = 'unknown';
    if (hitsBank(cands, allowed)) klass = 'allowed';
    else if (hitsBank(cands, knownHigh)) klass = 'knownHigh';

    // Drop pure lemmatizer stubs that never hit any bank
    if (klass === 'unknown' && LEMMA_NOISE.has(lemma) && lemma.length <= 5) continue;
    if (klass === 'unknown' && STOP.has(lemma)) continue;

    const display =
      cands.find((c) => allowed.has(c) || knownHigh.has(c)) || lemma;

    const key = display;
    if (unique.has(key)) continue;

    const ctx =
      sents.find((s) => s.toLowerCase().includes(tok.lower)) ||
      sents.find((s) => s.toLowerCase().includes(lemma)) ||
      tok.surface;

    unique.set(key, {
      lemma: display,
      surface: tok.surface,
      class: klass,
      context: String(ctx).slice(0, 160),
    });
  }

  const lemmas = [...unique.values()];
  const allowedN = lemmas.filter((x) => x.class === 'allowed').length;
  const knownHighN = lemmas.filter((x) => x.class === 'knownHigh').length;
  const unknownN = lemmas.filter((x) => x.class === 'unknown').length;
  const scored = lemmas.length;
  const notLeB1 = knownHighN + unknownN;
  const pctNotLeB1 = scored > 0 ? (100 * notLeB1) / scored : 0;

  return {
    uniqueLemmas: scored,
    allowed: allowedN,
    knownHigh: knownHighN,
    unknown: unknownN,
    notLeB1,
    pctNotLeB1: round1(pctNotLeB1),
    notLeB1Lemmas: lemmas
      .filter((x) => x.class !== 'allowed')
      .sort((a, b) => a.lemma.localeCompare(b.lemma)),
  };
}

function contentEditStamps(batch) {
  const found = {};
  for (const k of CONTENT_EDIT_STAMPS) {
    if (batch[k] != null) found[k] = batch[k];
  }
  return found;
}

const allowed = loadAllowedLeB1();
const knownHigh = loadKnownHigh();

const poolPaths = listPoolVerifiedJson('B1');
const files = poolPaths.map((abs) => path.basename(abs)).sort();
/** @type {object[]} */
const rows = [];

for (const abs of poolPaths.sort((a, b) => path.basename(a).localeCompare(path.basename(b)))) {
  const file = path.basename(abs);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const { text, sources } = collectExamText(batch, file);
  const analysis = analyzeText(text, allowed, knownHigh);
  const stamps = contentEditStamps(batch);
  rows.push({
    file,
    chars: text.length,
    sources,
    ...analysis,
    contentEditStamps: stamps,
    wasContentEdited:
      Object.keys(stamps).length > 0
        ? Object.keys(stamps)
        : [],
  });
}

rows.sort((a, b) => b.pctNotLeB1 - a.pctNotLeB1 || b.notLeB1 - a.notLeB1);

const NEW_COVERAGE_RE = /^(schreiben-|sprechen-|lesen-t3-|lesen-t4-)/i;
const newlyCovered = rows.filter((r) => NEW_COVERAGE_RE.test(r.file) && r.uniqueLemmas > 0);

const top15 = rows.slice(0, 15).map((r) => ({
  file: r.file,
  pctNotLeB1: r.pctNotLeB1,
  uniqueLemmas: r.uniqueLemmas,
  allowed: r.allowed,
  knownHigh: r.knownHigh,
  unknown: r.unknown,
  sources: r.sources,
  wasContentEdited: r.wasContentEdited,
  contentEditStamps: r.contentEditStamps,
  notLeB1Lemmas: r.notLeB1Lemmas.slice(0, 40),
}));

const editedInTop15 = top15.filter((r) => r.wasContentEdited.length > 0);

/** All knownHigh hits across pool (for postkolonial + new-module check). */
const knownHighHits = [];
for (const r of rows) {
  for (const w of r.notLeB1Lemmas || []) {
    if (w.class === 'knownHigh') {
      knownHighHits.push({
        file: r.file,
        lemma: w.lemma,
        context: w.context,
        newlyCoveredModule: NEW_COVERAGE_RE.test(r.file),
      });
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  poolDir: 'batches/ready/pool-verified/B1 (+ legacy flat)',
  method: {
    allowList: 'library/vocab/de/{A1,A2,B1}.json union (≤B1)',
    allowListSize: allowed.size,
    knownHighSources:
      'knowledge/cefr/vocab/de/{B2,C1,C2} + library B2–C2 real lemmas + _overrides.exclude',
    knownHighSize: knownHigh.size,
    lemmatizer: 'js/engine/validation/lemmatizer.js normalizeLemma',
    textCoverage: {
      always: ['passages[].text', 'passages[].transcript', 'batch.transcript'],
      schreibenSprechenLesenT3: ['questions[].question'],
      lesenT3Also: ['questions[].options (Kleinanzeigen)'],
      lesenT4Also: ['questions[].signText'],
      excluded: [
        'questions[].explanation for Schreiben/Sprechen (scoring rubric)',
        'questions[].explanation elsewhere (answer meta — not stems)',
      ],
    },
    ignored: 'stopwords, proper-name heuristic (mid-sentence capitals), numbers, length≤2',
    unit: 'unique lemmas per file (not token repetitions)',
    pctNotLeB1: '(knownHigh + unknown) / uniqueLemmas * 100',
    note:
      'unknown ≠ B2+: many unknowns are compounds, admin/Hausordnung terms, or common B1 lemmas missing from the 1796 allow-list. ' +
      'knownHigh is the only explicit above-B1 bucket.',
  },
  filesScanned: files.length,
  rankingAll: rows.map((r) => ({
    file: r.file,
    pctNotLeB1: r.pctNotLeB1,
    uniqueLemmas: r.uniqueLemmas,
    allowed: r.allowed,
    knownHigh: r.knownHigh,
    unknown: r.unknown,
    sources: r.sources,
    wasContentEdited: r.wasContentEdited,
  })),
  top15Detail: top15,
  newlyCoveredModules: newlyCovered.map((r) => ({
    file: r.file,
    pctNotLeB1: r.pctNotLeB1,
    uniqueLemmas: r.uniqueLemmas,
    allowed: r.allowed,
    knownHigh: r.knownHigh,
    unknown: r.unknown,
    sources: r.sources,
    notLeB1Lemmas: r.notLeB1Lemmas.slice(0, 40),
  })),
  knownHighHits,
  point5: {
    contentEditStampKeys: CONTENT_EDIT_STAMPS,
    editedFilesInTop15: editedInTop15.map((r) => ({
      file: r.file,
      pctNotLeB1: r.pctNotLeB1,
      stamps: r.contentEditStamps,
    })),
    countEditedInTop15: editedInTop15.length,
  },
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`Allow-list ≤B1: ${allowed.size} lemmas | knownHigh: ${knownHigh.size}`);
console.log(`Files: ${files.length}\n`);
console.log(
  'rank | pctNot≤B1 | uniq | allow | high | unk | edited? | file',
);
console.log('-'.repeat(100));
rows.forEach((r, i) => {
  const ed = r.wasContentEdited.length ? 'YES' : 'no';
  console.log(
    `${String(i + 1).padStart(3)} | ${String(r.pctNotLeB1).padStart(8)}% | ${String(r.uniqueLemmas).padStart(4)} | ${String(r.allowed).padStart(5)} | ${String(r.knownHigh).padStart(4)} | ${String(r.unknown).padStart(3)} | ${ed.padEnd(7)} | ${r.file}`,
  );
});

console.log('\n=== TOP 15 — not-≤B1 lemmas (lemma | class | context) ===');
for (const [i, r] of top15.entries()) {
  console.log(
    `\n#${i + 1} ${r.file} — ${r.pctNotLeB1}% not≤B1 (${r.knownHigh} knownHigh / ${r.unknown} unknown of ${r.uniqueLemmas})` +
      (r.wasContentEdited.length
        ? ` [EDITED: ${r.wasContentEdited.join(',')}]`
        : ''),
  );
  for (const w of r.notLeB1Lemmas.slice(0, 25)) {
    console.log(`  - ${w.lemma} [${w.class}] ← ${w.context.replace(/\s+/g, ' ').slice(0, 120)}`);
  }
  if (r.notLeB1Lemmas.length > 25) {
    console.log(`  … +${r.notLeB1Lemmas.length - 25} more`);
  }
}

console.log('\n=== NEWLY COVERED MODULES (schreiben / sprechen / lesen-t3 / lesen-t4) ===');
const newHigh = newlyCovered
  .slice()
  .sort((a, b) => b.pctNotLeB1 - a.pctNotLeB1);
for (const r of newHigh) {
  console.log(
    `\n${r.file} — ${r.pctNotLeB1}% not≤B1 (${r.knownHigh} knownHigh / ${r.unknown} unknown of ${r.uniqueLemmas}) ` +
      `sources=${JSON.stringify(r.sources)}`,
  );
  for (const w of r.notLeB1Lemmas.slice(0, 20)) {
    console.log(`  - ${w.lemma} [${w.class}] ← ${w.context.replace(/\s+/g, ' ').slice(0, 120)}`);
  }
  if (r.notLeB1Lemmas.length > 20) {
    console.log(`  … +${r.notLeB1Lemmas.length - 20} more`);
  }
}

console.log('\n=== knownHigh HITS (all pool) ===');
if (!knownHighHits.length) console.log('(none)');
for (const h of knownHighHits) {
  console.log(
    `  ${h.file}: ${h.lemma}` +
      (h.newlyCoveredModule ? ' [new-coverage module]' : '') +
      ` ← ${String(h.context).replace(/\s+/g, ' ').slice(0, 100)}`,
  );
}

console.log('\n=== POINT 5 — content-edited files in top 15 ===');
console.log(`count: ${editedInTop15.length}`);
for (const r of editedInTop15) {
  console.log(`  ${r.file} (${r.pctNotLeB1}%) stamps=`, r.contentEditStamps);
}
console.log(`\nWrote ${OUT}`);
