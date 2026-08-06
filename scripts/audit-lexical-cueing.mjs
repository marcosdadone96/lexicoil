/**
 * Audit lexical cueing in pool-verified MCQ parts (measurement only).
 *
 * Phenomenon:
 *   A rare content lemma appears in the passage AND in the correct path
 *   (question stem ∪ correct option), while NO distractor shares that lemma.
 *   Candidates can then match surface vocabulary without comprehension.
 *
 * "Rare" = lemmatized content word NOT in library/vocab/de A1∪A2
 *   (same banks as CEFR allow-list lower tiers), excluding STOP + proper-name heuristic.
 *
 * Scope (same as answer-position / answer-length bias):
 *   Lesen T2, Lesen T5, Hören T2
 *
 * Null model (parallel to length/position "expected vs real"):
 *   Among rare lemmas that appear in the passage and in EXACTLY ONE of the
 *   three options, P(that option is correct) = 1/3 if keys were random.
 *   Observed exclusive-correct rate is compared to 33.3%.
 *
 *   node scripts/audit-lexical-cueing.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './lib/loadEnv.mjs';

const require = createRequire(import.meta.url);
const Lemmatizer = require(path.join(ROOT, 'js/engine/validation/lemmatizer.js'));

const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const VOCAB_DIR = path.join(ROOT, 'library/vocab/de');
const OUT = path.join(
  ROOT,
  'batches/ready/gate-logs/lexical-cueing-2026-07-12.json',
);
const SAMPLE_OUT = path.join(
  ROOT,
  'batches/ready/gate-logs/lexical-cueing-sample-2026-07-12.json',
);

/** @typedef {'lesen-t2'|'lesen-t5'|'horen-t2'} PartKey */
const PART_KEYS = /** @type {const} */ (['lesen-t2', 'lesen-t5', 'horen-t2']);

/** Same spirit as audit-cefr-vocab-level.mjs STOP. */
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
  'darum', 'hin', 'her', 'aus', 'ab', 'um', 'per', 'via', 'etc', 'gibt', 'gibt', 'lassen',
  'machen', 'gehen', 'kommen', 'geben', 'nehmen', 'sehen', 'hören', 'sagen', 'sprechen',
  'lesen', 'schreiben', 'finden', 'suchen', 'helfen', 'fragen', 'brauchen', 'wissen', 'denken',
  'glauben', 'bleiben', 'fahren', 'stehen', 'sitzen', 'liegen', 'heißen', 'kennen', 'verstehen',
  'zeigen', 'bringen', 'halten', 'gut', 'neu', 'alt', 'groß', 'klein', 'lang', 'kurz', 'richtig',
  'falsch', 'wichtig', 'möglich', 'ganz', 'erst', 'zwei', 'drei', 'vier', 'fünf', 'jahr', 'jahre',
  'tag', 'tage', 'zeit', 'uhr', 'leute', 'mensch', 'menschen', 'person', 'person', 'ding',
]);

function loadLemmaFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return (data.lemmas || [])
    .map((w) => String(w).toLowerCase().trim())
    .filter((w) => w && !w.startsWith('de_lemma_pad'));
}

function loadA1A2() {
  const set = new Set();
  for (const lv of ['A1', 'A2']) {
    for (const w of loadLemmaFile(path.join(VOCAB_DIR, `${lv}.json`))) set.add(w);
  }
  return set;
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

/**
 * @param {string} filename
 * @returns {PartKey|null}
 */
function classifyFile(filename) {
  const base = filename.toLowerCase();
  if (base.startsWith('lesen-t2-')) return 'lesen-t2';
  if (base.startsWith('lesen-t5-')) return 'lesen-t5';
  if (base.startsWith('horen-t2-')) return 'horen-t2';
  return null;
}

/**
 * @param {object} q
 * @returns {'a'|'b'|'c'|null}
 */
function correctLetter(q) {
  const raw = String(q.correct ?? q.correctAnswer ?? '')
    .trim()
    .toLowerCase();
  const m = raw.match(/^[abc]/);
  return m ? /** @type {'a'|'b'|'c'} */ (m[0]) : null;
}

/**
 * @param {unknown} opt
 * @returns {string}
 */
function optionBody(opt) {
  const t = typeof opt === 'string' ? opt : opt?.text || '';
  return String(t)
    .replace(/^\s*[a-cA-C]\)\s*/, '')
    .trim();
}

/**
 * @param {object} q
 */
function isContentMcq(q) {
  if (String(q.type || '') !== 'multiple_choice') return false;
  const opts = q.options;
  if (!Array.isArray(opts) || opts.length < 3) return false;
  const letters = opts.slice(0, 3).map((o) => {
    const t = typeof o === 'string' ? o : o?.text || '';
    const m = String(t).trim().match(/^([a-cA-C])\)/);
    return m ? m[1].toLowerCase() : null;
  });
  return letters[0] === 'a' && letters[1] === 'b' && letters[2] === 'c';
}

function looksLikeProperName(surface, atSentenceStart) {
  if (!/^[A-ZÄÖÜ]/.test(surface)) return false;
  if (!atSentenceStart) return true;
  if (/[A-ZÄÖÜ].*[A-ZÄÖÜ]/.test(surface)) return true;
  return false;
}

/**
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

/**
 * Content lemmas from text (all content, not yet rarity-filtered).
 * Returns Map lemma → one surface form (for A1/A2 membership expansion).
 * @param {string} text
 * @param {{ dropProperNames?: boolean }} [opts]
 * @returns {Map<string, string>}
 */
function contentLemmas(text, opts = {}) {
  const dropPN = opts.dropProperNames !== false;
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const tok of tokenizeWithMeta(text)) {
    if (tok.lower.length < 4) continue;
    if (STOP.has(tok.lower)) continue;
    if (dropPN && looksLikeProperName(tok.surface, tok.atSentenceStart)) continue;
    const lemma = String(Lemmatizer.normalizeLemma(tok.lower, 'de') || tok.lower).toLowerCase();
    if (lemma.length < 4) continue;
    if (STOP.has(lemma)) continue;
    if (!map.has(lemma)) map.set(lemma, tok.lower);
  }
  return map;
}

/** @param {Map<string,string>} map */
function lemmaSet(map) {
  return new Set(map.keys());
}

/** ASCII ↔ umlaut variants for bank lookup (same spirit as audit-cefr-vocab-level). */
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
  return set;
}

/**
 * Light DE ending peel for bank membership only (lemmatizer often leaves adj -en forms).
 * @param {string} w
 * @returns {Set<string>}
 */
function morphologicalCandidates(w) {
  const s = String(w || '').toLowerCase();
  const out = new Set([s]);
  for (const suf of ['chen', 'lein', 'ungen', 'ung', 'heit', 'keit', 'lich', 'isch', 'eren', 'en', 'em', 'er', 'es', 'e', 'n', 's']) {
    if (s.length > suf.length + 3 && s.endsWith(suf)) out.add(s.slice(0, -suf.length));
  }
  return out;
}

/**
 * Common = in A1∪A2 after lemma/surface/umlaut/light-ending expansion.
 * Guards against lemmatizer noise (bereit→bereien, selbst→selben, klein→klei).
 * @param {string} lemma
 * @param {string} [surface]
 * @param {Set<string>} a1a2
 */
function isCommonLemma(lemma, surface, a1a2) {
  const seeds = new Set([lemma, surface].filter(Boolean).map((x) => String(x).toLowerCase()));
  for (const seed of [...seeds]) {
    for (const v of spellingVariants(seed)) seeds.add(v);
    for (const m of morphologicalCandidates(seed)) {
      seeds.add(m);
      for (const v of spellingVariants(m)) seeds.add(v);
    }
  }
  for (const c of seeds) {
    if (a1a2.has(c)) return true;
  }
  return false;
}

/**
 * Rare content lemmas: not A1∪A2 under isCommonLemma.
 * Input may be Set<string> lemmas OR Map lemma→surface.
 * @param {Set<string>|Map<string,string>} lemmasOrMap
 * @param {Set<string>} a1a2
 * @returns {Set<string>}
 */
function rareOf(lemmasOrMap, a1a2) {
  const out = new Set();
  if (lemmasOrMap instanceof Map) {
    for (const [lemma, surface] of lemmasOrMap) {
      if (!isCommonLemma(lemma, surface, a1a2)) out.add(lemma);
    }
  } else {
    for (const w of lemmasOrMap) {
      if (!isCommonLemma(w, w, a1a2)) out.add(w);
    }
  }
  return out;
}

/**
 * @param {object} batch
 * @param {object} q
 * @returns {string}
 */
function passageTextForQuestion(batch, q) {
  const pid = q.passageId;
  const passages = batch.passages || [];
  if (pid) {
    const hit = passages.find((p) => p && p.id === pid);
    if (hit) return String(hit.text || hit.transcript || '');
  }
  // Hören T2 often single passage
  if (passages.length === 1) {
    return String(passages[0].text || passages[0].transcript || '');
  }
  return passages.map((p) => String(p?.text || p?.transcript || '')).join('\n');
}

const a1a2 = loadA1A2();

/** @type {Record<PartKey, { n: number, cueing: number, cueingOptionOnly: number, exclusiveOptionHits: number, exclusiveOptionTrials: number }>} */
const byPart = Object.fromEntries(
  PART_KEYS.map((k) => [
    k,
    {
      n: 0,
      cueing: 0,
      cueingOptionOnly: 0,
      exclusiveOptionHits: 0,
      exclusiveOptionTrials: 0,
    },
  ]),
);

const combined = {
  n: 0,
  cueing: 0,
  cueingOptionOnly: 0,
  exclusiveOptionHits: 0,
  exclusiveOptionTrials: 0,
};

const filesScanned = { lesen_t2: 0, lesen_t5: 0, horen_t2: 0, skipped: 0 };

/** @type {object[]} */
const hits = [];

const files = fs.readdirSync(POOL).filter((f) => f.endsWith('.json')).sort();

for (const file of files) {
  const part = classifyFile(file);
  if (!part) {
    filesScanned.skipped++;
    continue;
  }
  if (part === 'lesen-t2') filesScanned.lesen_t2++;
  if (part === 'lesen-t5') filesScanned.lesen_t5++;
  if (part === 'horen-t2') filesScanned.horen_t2++;

  const batch = JSON.parse(fs.readFileSync(path.join(POOL, file), 'utf8'));
  for (const q of batch.questions || []) {
    if (!isContentMcq(q)) continue;
    const letter = correctLetter(q);
    if (!letter) continue;

    const passage = passageTextForQuestion(batch, q);
    if (!passage.trim()) continue;

    const passageRare = rareOf(contentLemmas(passage), a1a2);
    const stemMap = contentLemmas(String(q.question || ''));
    const optAMap = contentLemmas(optionBody(q.options[0]));
    const optBMap = contentLemmas(optionBody(q.options[1]));
    const optCMap = contentLemmas(optionBody(q.options[2]));
    const stemLemmas = lemmaSet(stemMap);
    const optA = lemmaSet(optAMap);
    const optB = lemmaSet(optBMap);
    const optC = lemmaSet(optCMap);
    const opts = { a: optA, b: optB, c: optC };
    const distractorLetters = /** @type {('a'|'b'|'c')[]} */ (
      ['a', 'b', 'c'].filter((L) => L !== letter)
    );
    const correctLemmas = opts[letter];
    const distractorUnion = new Set([
      ...opts[distractorLetters[0]],
      ...opts[distractorLetters[1]],
    ]);
    const cueSide = new Set([...stemLemmas, ...correctLemmas]);

    // Primary cueing: rare passage lemma on cue side, absent from all distractors
    /** @type {string[]} */
    const cueWords = [];
    for (const w of passageRare) {
      if (cueSide.has(w) && !distractorUnion.has(w)) cueWords.push(w);
    }
    const isCueing = cueWords.length > 0;

    // Stricter: rare exclusive to correct option (ignore stem-only cues)
    /** @type {string[]} */
    const optionCueWords = [];
    for (const w of passageRare) {
      if (correctLemmas.has(w) && !distractorUnion.has(w)) optionCueWords.push(w);
    }
    const isOptionCueing = optionCueWords.length > 0;

    // Null-model trials: rare lemma in passage ∩ exactly one option
    /** @type {{ lemma: string, exclusiveLetter: 'a'|'b'|'c', isCorrect: boolean }[]} */
    const exclusiveTrials = [];
    for (const w of passageRare) {
      const inA = optA.has(w);
      const inB = optB.has(w);
      const inC = optC.has(w);
      const nOpts = (inA ? 1 : 0) + (inB ? 1 : 0) + (inC ? 1 : 0);
      if (nOpts !== 1) continue;
      const exclusiveLetter = inA ? 'a' : inB ? 'b' : 'c';
      exclusiveTrials.push({
        lemma: w,
        exclusiveLetter,
        isCorrect: exclusiveLetter === letter,
      });
    }

    byPart[part].n++;
    combined.n++;
    if (isCueing) {
      byPart[part].cueing++;
      combined.cueing++;
    }
    if (isOptionCueing) {
      byPart[part].cueingOptionOnly++;
      combined.cueingOptionOnly++;
    }
    for (const t of exclusiveTrials) {
      byPart[part].exclusiveOptionTrials++;
      combined.exclusiveOptionTrials++;
      if (t.isCorrect) {
        byPart[part].exclusiveOptionHits++;
        combined.exclusiveOptionHits++;
      }
    }

    if (isCueing) {
      const inStem = cueWords.filter((w) => stemLemmas.has(w) && !correctLemmas.has(w));
      const inCorrect = cueWords.filter((w) => correctLemmas.has(w));
      const inBoth = cueWords.filter((w) => stemLemmas.has(w) && correctLemmas.has(w));
      hits.push({
        file,
        part,
        qid: q.id || '?',
        correct: letter,
        cueWords: cueWords.sort(),
        optionCueWords: optionCueWords.sort(),
        isOptionCueing,
        cueInStemOnly: inStem,
        cueInCorrectOption: inCorrect,
        cueInBoth: inBoth,
        exclusiveOptionTrials: exclusiveTrials,
        question: String(q.question || ''),
        options: {
          a: optionBody(q.options[0]),
          b: optionBody(q.options[1]),
          c: optionBody(q.options[2]),
        },
        passage,
        passageRareCount: passageRare.size,
      });
    }
  }
}

function summarizeBucket(b) {
  const expectedPct = round1(100 / 3);
  const cueingPct = b.n > 0 ? round1((100 * b.cueing) / b.n) : 0;
  const exclusiveHitPct =
    b.exclusiveOptionTrials > 0
      ? round1((100 * b.exclusiveOptionHits) / b.exclusiveOptionTrials)
      : 0;
  return {
    nMcq: b.n,
    cueingCount: b.cueing,
    cueingPct,
    cueingOptionOnlyCount: b.cueingOptionOnly,
    cueingOptionOnlyPct: b.n > 0 ? round1((100 * b.cueingOptionOnly) / b.n) : 0,
    nullModel: {
      exclusiveRareInExactlyOneOption: {
        trials: b.exclusiveOptionTrials,
        hitsWhereExclusiveIsCorrect: b.exclusiveOptionHits,
        observedPct: exclusiveHitPct,
        expectedPct,
        deviationPp: round1(exclusiveHitPct - expectedPct),
      },
    },
  };
}

/** Stratified sample: up to 5 per part, prefer option-cue over stem-only, diversify files. */
function pickSample(allHits, perPart = 5) {
  const out = [];
  for (const part of PART_KEYS) {
    const pool = allHits
      .filter((h) => h.part === part)
      .sort((a, b) => {
        const score = (h) =>
          (h.cueInCorrectOption?.length || 0) * 10 +
          (h.cueWords?.length || 0) -
          (h.cueInStemOnly?.length || 0);
        return score(b) - score(a);
      });
    const picked = [];
    const seenFiles = new Set();
    // Pass 1: one per file
    for (const h of pool) {
      if (picked.length >= perPart) break;
      if (seenFiles.has(h.file)) continue;
      seenFiles.add(h.file);
      picked.push(h);
    }
    // Pass 2: fill
    for (const h of pool) {
      if (picked.length >= perPart) break;
      if (picked.some((x) => x.qid === h.qid && x.file === h.file)) continue;
      picked.push(h);
    }
    out.push(...picked);
  }
  return out.slice(0, 15);
}

const sampleRaw = pickSample(hits, 5);

const report = {
  generatedAt: new Date().toISOString(),
  poolDir: 'batches/ready/pool-verified',
  method: {
    rareDefinition:
      'content lemma (len≥4, not STOP, not proper-name heuristic) NOT in library/vocab/de A1∪A2 ' +
      'after surface/lemma/umlaut/light-ending expansion (guards lemmatizer noise: bereit→bereien, klein→klei)',
    cueingDefinition:
      '∃ rare passage lemma that appears in (question stem ∪ correct option) and in NO distractor',
    cueingOptionOnlyDefinition:
      'same but rare lemma must appear in the correct option (stem-only cues excluded)',
    lemmatizer: 'js/engine/validation/lemmatizer.js normalizeLemma',
    a1a2LemmaCount: a1a2.size,
    nullModel:
      'Among rare lemmas in passage ∩ exactly one option, P(exclusive option = correct) = 1/3 under random keys',
  },
  scope: {
    included: [...PART_KEYS],
    excludedNote:
      'Same as answer-position/length bias: Hören T4 / Lesen T3 matching / Lesen T4 Ja-Nein / RF excluded.',
  },
  filesScanned,
  poolJsonCount: files.length,
  byPart: Object.fromEntries(
    PART_KEYS.map((k) => [k, { counts: byPart[k], summary: summarizeBucket(byPart[k]) }]),
  ),
  combined: { counts: combined, summary: summarizeBucket(combined) },
  hitCount: hits.length,
  allHitIds: hits.map((h) => ({
    file: h.file,
    part: h.part,
    qid: h.qid,
    correct: h.correct,
    cueWords: h.cueWords,
  })),
};

const sampleReport = {
  generatedAt: report.generatedAt,
  note: 'Full passage/question/options for human review. preliminaryEval filled by follow-up pass in console / companion.',
  n: sampleRaw.length,
  cases: sampleRaw.map((h, i) => ({
    sampleIndex: i + 1,
    file: h.file,
    part: h.part,
    qid: h.qid,
    correct: h.correct,
    cueWords: h.cueWords,
    cueInStemOnly: h.cueInStemOnly,
    cueInCorrectOption: h.cueInCorrectOption,
    cueInBoth: h.cueInBoth,
    question: h.question,
    options: h.options,
    passage: h.passage,
    exclusiveOptionTrials: h.exclusiveOptionTrials,
    preliminaryEval: null,
  })),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.writeFileSync(SAMPLE_OUT, `${JSON.stringify(sampleReport, null, 2)}\n`, 'utf8');

function printSummary(title, summary) {
  console.log(`\n=== ${title} ===`);
  console.log(`n MCQ = ${summary.nMcq}`);
  console.log(
    `cueing (stem∪correct) = ${summary.cueingCount} (${summary.cueingPct}%)`,
  );
  console.log(
    `cueing option-only = ${summary.cueingOptionOnlyCount} (${summary.cueingOptionOnlyPct}%)`,
  );
  const nm = summary.nullModel.exclusiveRareInExactlyOneOption;
  console.log(
    `null-model exclusive rare→1 option: trials=${nm.trials} hits=${nm.hitsWhereExclusiveIsCorrect} ` +
      `observed=${nm.observedPct}% expected=${nm.expectedPct}% deviation=${nm.deviationPp} pp`,
  );
}

printSummary('lesen-t2', report.byPart['lesen-t2'].summary);
printSummary('lesen-t5', report.byPart['lesen-t5'].summary);
printSummary('horen-t2', report.byPart['horen-t2'].summary);
printSummary('COMBINED', report.combined.summary);
console.log('\nFiles scanned:', filesScanned);
console.log(`Hits total: ${hits.length}; sample written: ${sampleRaw.length}`);
console.log(`Wrote ${OUT}`);
console.log(`Wrote ${SAMPLE_OUT}`);
