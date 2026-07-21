#!/usr/bin/env node
/**
 * Classify lexical-cueing hits (same detection as audit-lexical-cueing.mjs) and
 * stamp _lexicalCueingQuarantine only on "problematico" items — not FP / weak /
 * borderline / stem-only.
 *
 * Classification mirrors the 2026-07-12 sample of 15 (11 problematic / 4 non):
 *   - stem-only cues → skip
 *   - single ultra-weak lemma (selben, weiteren, speziell, …) → skip
 *   - ≥2 option-side rare cues → problematic (quarantine)
 *   - single strong lemma length≥12 (compounds) → problematic
 *   - single other → borderline (skip; e.g. untersagen)
 *
 *   node scripts/stamp-lexical-cueing-quarantine-2026-07-12.mjs --dry-run
 *   node scripts/stamp-lexical-cueing-quarantine-2026-07-12.mjs
 *   node scripts/stamp-lexical-cueing-quarantine-2026-07-12.mjs --validate-sample
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';

const require = createRequire(import.meta.url);
const Lemmatizer = require(path.join(ROOT, 'js/engine/validation/lemmatizer.js'));

const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const OUT = path.join(
  ROOT,
  'batches/ready/gate-logs/lexical-cueing-quarantine-2026-07-12.json',
);
const SAMPLE = path.join(
  ROOT,
  'batches/ready/gate-logs/lexical-cueing-sample-2026-07-12.json',
);

const dryRun = process.argv.includes('--dry-run');
const validateSample = process.argv.includes('--validate-sample');

const STAMP_AT = new Date().toISOString();
const STAMP_NOTE =
  'lexical cueing: correct option exclusively reuses rare passage lemma(s) (audit 2026-07-12); blocked from official assemble, allowed in practice';

/** Single-lemma cues treated as FP / weak / coincident in the 15-case review. */
const ULTRA_WEAK = new Set([
  'selben',
  'selbst',
  'weiteren',
  'weiter',
  'anderen',
  'ander',
  'meisten',
  'meist',
  'speziell',
  'speziellen',
  'kleinen',
  'klein',
  'klei',
  'sollten',
  'sollte',
]);

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
  'darum', 'hin', 'her', 'aus', 'ab', 'um', 'per', 'via', 'etc', 'lassen', 'machen', 'gehen',
  'kommen', 'geben', 'nehmen', 'sehen', 'hören', 'sagen', 'sprechen', 'lesen', 'schreiben',
  'finden', 'suchen', 'helfen', 'fragen', 'brauchen', 'wissen', 'denken', 'glauben', 'bleiben',
  'fahren', 'stehen', 'sitzen', 'liegen', 'heißen', 'kennen', 'verstehen', 'zeigen', 'bringen',
  'halten', 'gut', 'neu', 'alt', 'groß', 'klein', 'lang', 'kurz', 'richtig', 'falsch', 'wichtig',
  'möglich', 'ganz', 'erst', 'zwei', 'drei', 'vier', 'fünf', 'jahr', 'jahre', 'tag', 'tage',
  'zeit', 'uhr', 'leute', 'mensch', 'menschen', 'person', 'ding',
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
  const dir = path.join(ROOT, 'library/vocab/de');
  for (const lv of ['A1', 'A2']) {
    for (const w of loadLemmaFile(path.join(dir, `${lv}.json`))) set.add(w);
  }
  return set;
}

function spellingVariants(w) {
  const s = String(w || '').toLowerCase();
  const set = new Set([s]);
  set.add(s.replace(/ae/g, 'ä').replace(/oe/g, 'ö').replace(/ue/g, 'ü').replace(/ss/g, 'ß'));
  set.add(s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss'));
  return set;
}

function morphologicalCandidates(w) {
  const s = String(w || '').toLowerCase();
  const out = new Set([s]);
  for (const suf of ['chen', 'lein', 'ungen', 'ung', 'heit', 'keit', 'lich', 'isch', 'eren', 'en', 'em', 'er', 'es', 'e', 'n', 's']) {
    if (s.length > suf.length + 3 && s.endsWith(suf)) out.add(s.slice(0, -suf.length));
  }
  return out;
}

function isCommonLemma(lemma, surface, a1a2) {
  const seeds = new Set([lemma, surface].filter(Boolean).map((x) => String(x).toLowerCase()));
  for (const seed of [...seeds]) {
    for (const v of spellingVariants(seed)) seeds.add(v);
    for (const m of morphologicalCandidates(seed)) {
      seeds.add(m);
      for (const v of spellingVariants(m)) seeds.add(v);
    }
  }
  for (const c of seeds) if (a1a2.has(c)) return true;
  return false;
}

function looksLikeProperName(surface, atSentenceStart) {
  if (!/^[A-ZÄÖÜ]/.test(surface)) return false;
  if (!atSentenceStart) return true;
  if (/[A-ZÄÖÜ].*[A-ZÄÖÜ]/.test(surface)) return true;
  return false;
}

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
      out.push({ surface: m[0], lower: m[0].toLowerCase(), atSentenceStart: atStart });
      atStart = false;
    }
  }
  return out;
}

function contentLemmas(text) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const tok of tokenizeWithMeta(text)) {
    if (tok.lower.length < 4 || STOP.has(tok.lower)) continue;
    if (looksLikeProperName(tok.surface, tok.atSentenceStart)) continue;
    const lemma = String(Lemmatizer.normalizeLemma(tok.lower, 'de') || tok.lower).toLowerCase();
    if (lemma.length < 4 || STOP.has(lemma)) continue;
    if (!map.has(lemma)) map.set(lemma, tok.lower);
  }
  return map;
}

function rareOf(map, a1a2) {
  const out = new Set();
  for (const [lemma, surface] of map) {
    if (!isCommonLemma(lemma, surface, a1a2)) out.add(lemma);
  }
  return out;
}

function lemmaSet(map) {
  return new Set(map.keys());
}

function classifyFile(filename) {
  const base = filename.toLowerCase();
  if (base.startsWith('lesen-t2-')) return 'lesen-t2';
  if (base.startsWith('lesen-t5-')) return 'lesen-t5';
  if (base.startsWith('horen-t2-')) return 'horen-t2';
  return null;
}

function correctLetter(q) {
  const raw = String(q.correct ?? q.correctAnswer ?? '').trim().toLowerCase();
  const m = raw.match(/^[abc]/);
  return m ? m[0] : null;
}

function optionBody(opt) {
  const t = typeof opt === 'string' ? opt : opt?.text || '';
  return String(t).replace(/^\s*[a-cA-C]\)\s*/, '').trim();
}

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

function passageTextForQuestion(batch, q) {
  const pid = q.passageId;
  const passages = batch.passages || [];
  if (pid) {
    const hit = passages.find((p) => p && p.id === pid);
    if (hit) return String(hit.text || hit.transcript || '');
  }
  if (passages.length === 1) return String(passages[0].text || passages[0].transcript || '');
  return passages.map((p) => String(p?.text || p?.transcript || '')).join('\n');
}

/**
 * @param {{ optionCueWords: string[], cueWords: string[] }} hit
 * @returns {{ class: string, quarantine: boolean, reason: string }}
 */
function classifyCueingHit(hit) {
  const optionCues = [...(hit.optionCueWords || [])];
  const stemOnly = (hit.cueWords || []).filter((w) => !optionCues.includes(w));

  if (!optionCues.length) {
    return {
      class: 'stem_only',
      quarantine: false,
      reason: 'cue only in stem — not treated as MCQ option exploit',
    };
  }

  const strong = optionCues.filter((w) => !ULTRA_WEAK.has(w));
  if (!strong.length) {
    return {
      class: optionCues.some((w) => w === 'selben' || w === 'selbst')
        ? 'falso_positivo'
        : 'debil',
      quarantine: false,
      reason: `only ultra-weak option cues: ${optionCues.join(',')}`,
    };
  }

  // ≥2 option-side rare cues with ≥1 non-weak → problematic (sample 1–3,6–8,11–15)
  if (optionCues.length >= 2) {
    return {
      class: 'problematico',
      quarantine: true,
      reason: `≥2 option cues with strong=${strong.join(',')}`,
    };
  }

  const w = strong[0];
  if (w.length >= 12) {
    return {
      class: 'problematico',
      quarantine: true,
      reason: `single compound/specific cue len≥12: ${w}`,
    };
  }

  return {
    class: 'borderline',
    quarantine: false,
    reason: `single non-weak cue len<12 (${w}); sample pattern like untersagen — skip`,
  };
}

function detectHit(batch, q, file, part, a1a2) {
  const letter = correctLetter(q);
  if (!letter) return null;
  const passage = passageTextForQuestion(batch, q);
  if (!passage.trim()) return null;

  const passageRare = rareOf(contentLemmas(passage), a1a2);
  const stemLemmas = lemmaSet(contentLemmas(String(q.question || '')));
  const optA = lemmaSet(contentLemmas(optionBody(q.options[0])));
  const optB = lemmaSet(contentLemmas(optionBody(q.options[1])));
  const optC = lemmaSet(contentLemmas(optionBody(q.options[2])));
  const opts = { a: optA, b: optB, c: optC };
  const distractors = ['a', 'b', 'c'].filter((L) => L !== letter);
  const correctLemmas = opts[letter];
  const distractorUnion = new Set([...opts[distractors[0]], ...opts[distractors[1]]]);
  const cueSide = new Set([...stemLemmas, ...correctLemmas]);

  const cueWords = [];
  for (const w of passageRare) {
    if (cueSide.has(w) && !distractorUnion.has(w)) cueWords.push(w);
  }
  if (!cueWords.length) return null;

  const optionCueWords = cueWords.filter((w) => correctLemmas.has(w));
  return {
    file,
    part,
    qid: q.id || '?',
    correct: letter,
    cueWords: cueWords.sort(),
    optionCueWords: optionCueWords.sort(),
  };
}

function validateAgainstSample(classifiedByKey) {
  if (!fs.existsSync(SAMPLE)) {
    console.error('Sample file missing:', SAMPLE);
    process.exit(1);
  }
  const sample = JSON.parse(fs.readFileSync(SAMPLE, 'utf8'));
  /** Map sample verdict → expected quarantine */
  const expectQ = {
    problematico: true,
    falso_positivo: false,
    debil_inevitable: false,
    debil_coincidente: false,
    borderline: false,
  };
  let ok = 0;
  let fail = 0;
  for (const c of sample.cases || []) {
    const key = `${c.file}::${c.qid}`;
    const got = classifiedByKey.get(key);
    const wantQ = expectQ[c.preliminaryEval?.verdict];
    const pass = got && wantQ === got.quarantine;
    if (pass) ok++;
    else {
      fail++;
      console.log(
        `SAMPLE MISS ${c.sampleIndex} ${key}: human=${c.preliminaryEval?.verdict} ` +
          `auto=${got?.class}/${got?.quarantine} cues=${(got?.optionCueWords || c.cueInCorrectOption || []).join('|')}`,
      );
    }
  }
  console.log(`Sample validation: ${ok}/${ok + fail} quarantine decisions match`);
  return fail === 0;
}

const a1a2 = loadA1A2();
/** @type {Map<string, object>} */
const classifiedByKey = new Map();
const byClass = {};
const byPart = { 'lesen-t2': 0, 'lesen-t5': 0, 'horen-t2': 0 };
const quarantined = [];
const skipped = [];
const filesTouched = [];

let cueingDetected = 0;

for (const file of fs.readdirSync(POOL).filter((f) => f.endsWith('.json')).sort()) {
  const part = classifyFile(file);
  if (!part) continue;
  const abs = path.join(POOL, file);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  let changed = false;

  for (const q of batch.questions || []) {
    // Clear stale lexical stamps outside detection / reclassified away
    const hadStamp = q._lexicalCueingQuarantine === true;

    if (!isContentMcq(q)) {
      if (hadStamp) {
        delete q._lexicalCueingQuarantine;
        delete q._lexicalCueingQuarantinedAt;
        delete q._lexicalCueingQuarantineNote;
        delete q._lexicalCueingQuarantineClass;
        changed = true;
      }
      continue;
    }

    const hit = detectHit(batch, q, file, part, a1a2);
    if (!hit) {
      if (hadStamp) {
        delete q._lexicalCueingQuarantine;
        delete q._lexicalCueingQuarantinedAt;
        delete q._lexicalCueingQuarantineNote;
        delete q._lexicalCueingQuarantineClass;
        changed = true;
      }
      continue;
    }

    cueingDetected++;
    const decision = classifyCueingHit(hit);
    const row = { ...hit, ...decision };
    classifiedByKey.set(`${file}::${hit.qid}`, row);
    byClass[decision.class] = (byClass[decision.class] || 0) + 1;

    if (decision.quarantine) {
      if (!q._lexicalCueingQuarantine) {
        q._lexicalCueingQuarantine = true;
        q._lexicalCueingQuarantinedAt = STAMP_AT;
        q._lexicalCueingQuarantineNote = STAMP_NOTE;
        q._lexicalCueingQuarantineClass = decision.class;
        changed = true;
      } else {
        q._lexicalCueingQuarantineClass = decision.class;
        q._lexicalCueingQuarantineNote = STAMP_NOTE;
      }
      quarantined.push(row);
      byPart[part] += 1;
    } else {
      skipped.push(row);
      if (hadStamp) {
        delete q._lexicalCueingQuarantine;
        delete q._lexicalCueingQuarantinedAt;
        delete q._lexicalCueingQuarantineNote;
        delete q._lexicalCueingQuarantineClass;
        changed = true;
      }
    }
  }

  if (changed && !dryRun && !validateSample) {
    fs.writeFileSync(abs, `${JSON.stringify(batch, null, 2)}\n`);
    filesTouched.push(file);
  }
}

if (validateSample) {
  const pass = validateAgainstSample(classifiedByKey);
  process.exit(pass ? 0 : 1);
}

// Combined with length bias
let lengthOnly = 0;
let lexicalOnly = 0;
let both = 0;
let either = 0;
const unionIds = [];

for (const file of fs.readdirSync(POOL).filter((f) => f.endsWith('.json')).sort()) {
  if (!classifyFile(file)) continue;
  const batch = JSON.parse(fs.readFileSync(path.join(POOL, file), 'utf8'));
  for (const q of batch.questions || []) {
    // For dry-run, simulate lexical stamps from this run
    const key = `${file}::${q.id}`;
    const lex =
      (!dryRun && q._lexicalCueingQuarantine === true) ||
      (dryRun && classifiedByKey.get(key)?.quarantine === true);
    const len = q._lengthBiasQuarantine === true;
    if (!lex && !len) continue;
    either++;
    if (lex && len) both++;
    else if (lex) lexicalOnly++;
    else lengthOnly++;
    unionIds.push({
      file,
      qid: q.id,
      length: len,
      lexical: !!lex,
    });
  }
}

const report = {
  generatedAt: STAMP_AT,
  dryRun,
  method: {
    detection: 'Same as audit-lexical-cueing.mjs (rare ∉ A1∪A2; exclusive to stem∪correct)',
    classification:
      'problematico if ≥2 strong option cues OR single strong cue len≥12; skip stem_only / ultra-weak singles / borderline singles',
    ultraWeak: [...ULTRA_WEAK],
    sampleCalibration: 'Matches quarantine decisions on lexical-cueing-sample-2026-07-12.json',
  },
  cueingDetected,
  byClass,
  quarantinedCount: quarantined.length,
  skippedCount: skipped.length,
  byPart,
  filesTouched: dryRun ? '(dry-run)' : filesTouched,
  combinedWithLengthBias: {
    lengthOnly,
    lexicalOnly,
    both,
    unionUniqueQuestions: either,
    note: 'Union of _lengthBiasQuarantine ∪ _lexicalCueingQuarantine (official exclusion set)',
  },
  quarantinedIds: quarantined.map((r) => ({
    file: r.file,
    part: r.part,
    qid: r.qid,
    optionCueWords: r.optionCueWords,
    reason: r.reason,
  })),
  skippedSample: skipped.slice(0, 40).map((r) => ({
    file: r.file,
    qid: r.qid,
    class: r.class,
    optionCueWords: r.optionCueWords,
    reason: r.reason,
  })),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      cueingDetected,
      byClass,
      quarantinedCount: quarantined.length,
      combined: report.combinedWithLengthBias,
      dryRun,
      filesTouched: filesTouched.length,
    },
    null,
    2,
  ),
);
console.log(`Wrote ${OUT}`);
