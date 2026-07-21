/**
 * Exhaustive pool audit — 100% of pool-verified + pool-content-ok-lesen.
 * Report only; no fixes.
 *
 *   node scripts/audit-pool-exhaustive-2026-07-10.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { checkPassageContentTopic } from './lib/qualityGates/contentTopicCheck.mjs';
import { collapseIdenticalPassages } from './lib/normalizeBatch.mjs';
import { inferGrammarTagsFromText } from './lib/enrichBatchMetadata.mjs';
import { POOL_VERIFIED_DIR, POOL_CONTENT_OK_LESEN_DIR } from './lib/finalizePoolReady.mjs';

const OUT_JSON = path.join(ROOT, 'batches/ready/gate-logs/POOL-EXHAUSTIVE-AUDIT-2026-07-10.json');
const OUT_MD = path.join(ROOT, 'batches/ready/gate-logs/POOL-EXHAUSTIVE-AUDIT-2026-07-10.md');

const CONJUGATED = new Set(
  `findet geht macht nimmt gibt kommt sieht hat ist sind war wird kann muss soll will läuft steht liegt fährt spricht schreibt liest lernt arbeitet wohnt kauft verkauft hilft braucht denkt glaubt weiß weiss kennt empfand empfiehlt unterstützt unterstuetzt findet findest brauchst hilfst kommt kommtst nimmt gibst sieht spricht`.split(
    /\s+/,
  ),
);

const LOWER_NOUNS = new Set(
  `alltag urlaub arbeit familie freund schule stadt land haus auto zug bus bahn geld zeit mensch kind frau mann problem angebot termin umwelt verkehr freizeit gesundheit bildung engagement lebensstil umzug hilfe erfahrung mitglied wortschatz grammatik beispiel abschnitt fortschritt organisation nachbar entscheidung umstellung bewegung innenstadt bewohner kurs mobilität unterkunft lebensmittel verein viertel region urlaub`.split(
    /\s+/,
  ),
);

const INFLECTED_ADJ = new Set(
  `entspannter besser größer kleiner neuer guter nachhaltiger anstrengender lokalen aktuellen wichtigen schönen großen grossen guten neuen alten`.split(
    /\s+/,
  ),
);

const FUNCTION_TAGS = new Set(
  `sich mein statt teil punkt thema wann was wer wie wo dies erst also weit eigenen`.split(/\s+/),
);

/** Swiss/ss where standard DE expects ß (word-level). */
const SS_FOR_SZ = [
  { bad: /\bgross(?:e[rnms]?)?\b/gi, good: 'groß…', word: 'gross' },
  { bad: /\bstrasse(?:n)?\b/gi, good: 'Straße(n)', word: 'strasse' },
  { bad: /\bfuss(?:ball|gänger|weg)?\b/gi, good: 'Fuß…', word: 'fuss' },
  { bad: /\bgruss(?:e)?\b/gi, good: 'Gruß…', word: 'gruss' },
  { bad: /\bheiss(?:e[rnms]?)?\b/gi, good: 'heiß…', word: 'heiss' },
  { bad: /\bweiss(?:e[rnms]?)?\b/gi, good: 'weiß… (adj/verb care)', word: 'weiss' },
  { bad: /\bschluss\b/gi, good: 'Schluss OK / check context', word: 'schluss', soft: true },
  { bad: /\bmasse\b/gi, good: 'Maße vs Masse', word: 'masse', soft: true },
  { bad: /\bspass\b/gi, good: 'Spaß', word: 'spass' },
  { bad: /\bfluss(?:es|es)?\b/gi, good: 'Fluss OK in CH; DE Fluss same', word: 'fluss', soft: true },
  { bad: /\bschiess(?:en|t)?\b/gi, good: 'schieß…', word: 'schiess' },
  { bad: /\bliess(?:e)?\b/gi, good: 'ließ…', word: 'liess' },
  { bad: /\bmuss\b/gi, good: 'muss is correct DE!', word: 'muss', soft: true },
];

/** Known gender: wrong article+adj patterns (partial coverage). */
const GENDER_PATTERNS = [
  // neuter nouns with feminine article/adj
  { re: /\beine\s+(?:bessere|gute|schlechte|neue|große|grosse|kleine|moderne|wichtige)\s+(\w*netz)\b/gi, expect: 'ein …es …netz (n.)', nounClass: 'netz' },
  { re: /\beine\s+(?:bessere|gute|schlechte|neue|große|grosse|kleine)\s+(\w*system)\b/gi, expect: 'ein …es …system (n.)', nounClass: 'system' },
  { re: /\beine\s+(?:bessere|gute|schlechte|neue|große|grosse|kleine)\s+(\w*problem)\b/gi, expect: 'ein …es Problem (n.)', nounClass: 'problem' },
  { re: /\beine\s+(?:bessere|gute|schlechte|neue|große|grosse|kleine)\s+(\w*angebot)\b/gi, expect: 'ein …es Angebot (n.)', nounClass: 'angebot' },
  { re: /\beine\s+(?:bessere|gute|schlechte|neue|große|grosse|kleine)\s+(\w*zentrum)\b/gi, expect: 'ein …es Zentrum (n.)', nounClass: 'zentrum' },
  { re: /\beine\s+(?:bessere|gute|schlechte|neue|große|grosse|kleine)\s+(Auto|Haus|Kind|Buch|Ticket|Ziel|Ende|Amt|Büro|Hobby|Thema)\b/g, expect: 'ein …es (n.)', nounClass: 'neuter-word' },
  { re: /\bder\s+(?:gute|neue|große|grosse)\s+(Auto|Haus|Kind|Problem|Angebot|Netz)\b/gi, expect: 'das (n.)', nounClass: 'der-neuter' },
  { re: /\bdie\s+(?:gute|neue|große|grosse)\s+(Auto|Haus|Kind|Problem|Angebot|Netz|System)\b/gi, expect: 'das (n.)', nounClass: 'die-neuter' },
  // masculine with eine
  { re: /\beine\s+(?:bessere|gute|neue|große|grosse|kleine)\s+(Tag|Weg|Platz|Arzt|Freund|Mann|Tisch|Stuhl|Kurs|Termin)\b/g, expect: 'ein …er (m.)', nounClass: 'masc' },
];

/** Forced-vocab / register break heuristics (deterministic proxy for Q3B). */
const FORCED_VOCAB_RES = [
  { re: /\bOntologie\b/g, label: 'Ontologie' },
  { re: /\bKonjunktiv\b/g, label: 'Konjunktiv meta-grammar' },
  { re: /\bHermeneutik\b/g, label: 'Hermeneutik' },
  { re: /\bEpistemologie\b/g, label: 'Epistemologie' },
  { re: /\bDialektik\b/g, label: 'Dialektik' },
  { re: /\bPhänomenologie\b/g, label: 'Phänomenologie' },
  { re: /\bSo ein Konjunktiv hilft\b/gi, label: 'forced Konjunktiv phrase' },
  { re: /\bdie Ontologie des\b/gi, label: 'Ontologie des…' },
];

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
}

function jaccard(a, b) {
  const A = new Set(a.map((x) => String(x).toLowerCase()));
  const B = new Set(b.map((x) => String(x).toLowerCase()));
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

function normQText(q) {
  return [q.question, q.explanation, ...(q.options || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-zäöüß\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectAllText(batch) {
  const parts = [];
  for (const p of batch.passages || []) {
    if (p.title) parts.push(p.title);
    if (p.text) parts.push(p.text);
    if (p.transcript) parts.push(p.transcript);
  }
  for (const q of batch.questions || []) {
    if (q.question) parts.push(q.question);
    if (q.explanation) parts.push(q.explanation);
    if (q.signText) parts.push(q.signText);
    for (const o of q.options || []) parts.push(String(o));
  }
  return parts.join('\n');
}

function tagIssues(tags) {
  const issues = [];
  for (const t of tags) {
    const s = String(t);
    const low = s.toLowerCase();
    if (CONJUGATED.has(low)) issues.push({ t: s, kind: 'conjugated' });
    if (LOWER_NOUNS.has(low) && s === low) issues.push({ t: s, kind: 'lowercase_noun' });
    if (INFLECTED_ADJ.has(low)) issues.push({ t: s, kind: 'inflected_adj' });
    if (FUNCTION_TAGS.has(low)) issues.push({ t: s, kind: 'function_word' });
  }
  return issues;
}

function scanSs(text, tagsOnly = false) {
  const hits = [];
  for (const rule of SS_FOR_SZ) {
    if (rule.soft) continue;
    rule.bad.lastIndex = 0;
    const m = text.match(rule.bad);
    if (m?.length) hits.push({ word: rule.word, good: rule.good, count: m.length, samples: [...new Set(m)].slice(0, 3) });
  }
  return hits;
}

function scanGender(text) {
  const hits = [];
  for (const g of GENDER_PATTERNS) {
    g.re.lastIndex = 0;
    let m;
    while ((m = g.re.exec(text)) !== null) {
      hits.push({ match: m[0], expect: g.expect, nounClass: g.nounClass });
      if (hits.length >= 20) return hits;
    }
  }
  return hits;
}

function scanForced(text) {
  const hits = [];
  for (const f of FORCED_VOCAB_RES) {
    f.re.lastIndex = 0;
    const m = text.match(f.re);
    if (m?.length) hits.push({ label: f.label, count: m.length, sample: m[0] });
  }
  return hits;
}

const buckets = {
  vocabIdenticalAcrossQs: [],
  vocabNearIdenticalAcrossQs: [],
  vocabConjugated: [],
  vocabLowerNoun: [],
  vocabInflectedAdj: [],
  vocabFunction: [],
  ssInTags: [],
  ssInText: [],
  topicMismatch: [],
  rejectMetaInVerified: [],
  passageDupInternal: [],
  questionNearDupInternal: [],
  genderAgreement: [],
  forcedVocabHeuristic: [],
  grammarGenericSample: [],
};

const summary = {
  scanned: 0,
  byPool: { 'pool-verified': 0, 'pool-content-ok-lesen': 0 },
  byModule: {},
};

const grammarSampleFiles = [];
const GRAMMAR_SAMPLE_TARGET = 40;

const targets = [
  { dir: POOL_VERIFIED_DIR, label: 'pool-verified' },
  { dir: POOL_CONTENT_OK_LESEN_DIR, label: 'pool-content-ok-lesen' },
];

for (const { dir, label } of targets) {
  for (const file of listJson(dir)) {
    const abs = path.join(dir, file);
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch {
      continue;
    }
    summary.scanned++;
    summary.byPool[label]++;
    const mod = (file.match(/^(lesen|horen|schreiben|sprechen)/i) || ['?', '?'])[1].toLowerCase();
    summary.byModule[mod] = (summary.byModule[mod] || 0) + 1;
    const ref = { file, pool: label, module: mod };

    // 4 reject meta
    if (label === 'pool-verified' && batch._poolRejectReason) {
      buckets.rejectMetaInVerified.push({ ...ref, reason: batch._poolRejectReason });
    }

    const qs = batch.questions || [];
    const tagSets = qs.map((q) => [...(q.vocabularyTags || [])].map((t) => String(t).toLowerCase()).sort());
    // 1a identical / near-identical vocab across questions
    if (tagSets.length >= 2) {
      let identicalPairs = 0;
      let nearPairs = 0;
      const examples = [];
      for (let i = 0; i < tagSets.length; i++) {
        for (let j = i + 1; j < tagSets.length; j++) {
          if (!tagSets[i].length || !tagSets[j].length) continue;
          const jac = jaccard(tagSets[i], tagSets[j]);
          if (jac >= 0.999) {
            identicalPairs++;
            if (examples.length < 2) examples.push({ i, j, tags: tagSets[i], jac });
          } else if (jac >= 0.8) {
            nearPairs++;
            if (examples.length < 2) examples.push({ i, j, tags: tagSets[i], jac });
          }
        }
      }
      // Flag file if majority of pairs are identical (shared-block pattern)
      const pairCount = (tagSets.length * (tagSets.length - 1)) / 2;
      const identicalRatio = pairCount ? identicalPairs / pairCount : 0;
      if (identicalPairs > 0 && (identicalRatio >= 0.5 || (qs.length >= 3 && identicalPairs >= qs.length - 1))) {
        buckets.vocabIdenticalAcrossQs.push({
          ...ref,
          identicalPairs,
          pairCount,
          identicalRatio: Math.round(identicalRatio * 100) / 100,
          exampleTags: examples[0]?.tags?.slice(0, 8),
          nQuestions: qs.length,
        });
      } else if (nearPairs > 0 && identicalRatio < 0.5) {
        // only near, not counted in identical
        buckets.vocabNearIdenticalAcrossQs.push({
          ...ref,
          nearPairs,
          pairCount,
          exampleJac: examples[0]?.jac,
        });
      }
    }

    // 1c–e + function per file (union of tags)
    const allTags = [];
    for (const q of qs) for (const t of q.vocabularyTags || []) allTags.push(String(t));
    const issues = tagIssues(allTags);
    const byKind = {};
    for (const it of issues) {
      byKind[it.kind] = byKind[it.kind] || new Set();
      byKind[it.kind].add(it.t);
    }
    if (byKind.conjugated?.size) {
      buckets.vocabConjugated.push({ ...ref, samples: [...byKind.conjugated].slice(0, 5) });
    }
    if (byKind.lowercase_noun?.size) {
      buckets.vocabLowerNoun.push({ ...ref, samples: [...byKind.lowercase_noun].slice(0, 5) });
    }
    if (byKind.inflected_adj?.size) {
      buckets.vocabInflectedAdj.push({ ...ref, samples: [...byKind.inflected_adj].slice(0, 5) });
    }
    if (byKind.function_word?.size) {
      buckets.vocabFunction.push({ ...ref, samples: [...byKind.function_word].slice(0, 5) });
    }

    // 1b ss in tags
    const tagBlob = allTags.join(' ');
    const ssTags = scanSs(tagBlob);
    if (ssTags.length) buckets.ssInTags.push({ ...ref, hits: ssTags });

    const fullText = collectAllText(batch);
    const ssText = scanSs(fullText);
    if (ssText.length) buckets.ssInText.push({ ...ref, hits: ssText.slice(0, 5) });

    // 3 topic
    for (const p of batch.passages || []) {
      if (!p?.topicTag && !batch.topicTag) continue;
      const tagged = { ...p, topicTag: batch.topicTag || p.topicTag };
      const ct = checkPassageContentTopic(tagged);
      if (ct.mismatch) {
        buckets.topicMismatch.push({
          ...ref,
          passageId: p.id,
          detail: ct.detail || ct.reason,
          tag: ct.tag,
          detected: ct.detected,
        });
      }
    }

    // 5 passage collapse would change?
    const beforeN = (batch.passages || []).length;
    const collapsed = collapseIdenticalPassages(structuredClone(batch));
    const afterN = (collapsed.passages || []).length;
    if (afterN < beforeN) {
      buckets.passageDupInternal.push({ ...ref, before: beforeN, after: afterN });
    }

    // 5 question near-dup
    if (qs.length >= 2) {
      const nearQ = [];
      for (let i = 0; i < qs.length; i++) {
        const ti = normQText(qs[i]);
        if (ti.length < 20) continue;
        for (let j = i + 1; j < qs.length; j++) {
          const tj = normQText(qs[j]);
          if (tj.length < 20) continue;
          // token jaccard
          const tok = (s) => s.split(' ').filter((w) => w.length > 2);
          const jac = jaccard(tok(ti), tok(tj));
          if (jac >= 0.85) {
            nearQ.push({
              i,
              j,
              jac: Math.round(jac * 100) / 100,
              a: String(qs[i].question || '').slice(0, 80),
              b: String(qs[j].question || '').slice(0, 80),
            });
          }
        }
      }
      if (nearQ.length) {
        buckets.questionNearDupInternal.push({ ...ref, pairs: nearQ.slice(0, 3) });
      }
    }

    // 6 gender
    const gen = scanGender(fullText);
    if (gen.length) {
      buckets.genderAgreement.push({ ...ref, hits: gen.slice(0, 4) });
    }

    // 7 forced vocab heuristic
    const forced = scanForced(fullText);
    if (forced.length) {
      buckets.forcedVocabHeuristic.push({ ...ref, hits: forced });
    }

    // 2 grammar sample collection
    if (grammarSampleFiles.length < GRAMMAR_SAMPLE_TARGET && qs.length) {
      grammarSampleFiles.push({ abs, file, label, mod, batch });
    }
  }
}

// 2 grammarTags sample validation
for (const g of grammarSampleFiles) {
  const qs = g.batch.questions || [];
  let mismatchQs = 0;
  const examples = [];
  for (const q of qs.slice(0, 4)) {
    const stored = q.grammarTags || [];
    if (!stored.length) continue;
    const blob = [q.question, q.explanation, ...(g.batch.passages || []).map((p) => p.text)]
      .filter(Boolean)
      .join(' ');
    const inferred = inferGrammarTagsFromText(blob, q.teil || 1);
    const jac = jaccard(stored, inferred);
    // "generic" if stored equals default-ish and jac low vs content-inferred
    if (jac < 0.34 && stored.length) {
      mismatchQs++;
      if (examples.length < 2) {
        examples.push({ id: q.id, stored, inferred, jac: Math.round(jac * 100) / 100 });
      }
    }
  }
  if (mismatchQs > 0) {
    buckets.grammarGenericSample.push({
      file: g.file,
      pool: g.label,
      module: g.mod,
      mismatchQs,
      examples,
    });
  }
}

function topExamples(arr, n = 3) {
  return arr.slice(0, n);
}

const report = {
  generatedAt: new Date().toISOString(),
  summary,
  checks: {
    '1a_vocab_identical_across_questions': {
      files: buckets.vocabIdenticalAcrossQs.length,
      note: '≥50% of question-pairs share identical vocabularyTags (shared-block pattern)',
      examples: topExamples(buckets.vocabIdenticalAcrossQs),
    },
    '1a_vocab_near_identical_across_questions': {
      files: buckets.vocabNearIdenticalAcrossQs.length,
      note: 'pairs with Jaccard≥0.8 but not counted as identical-majority',
      examples: topExamples(buckets.vocabNearIdenticalAcrossQs),
    },
    '1b_ss_instead_of_eszett_in_vocabTags': {
      files: buckets.ssInTags.length,
      examples: topExamples(buckets.ssInTags),
    },
    '1b_ss_instead_of_eszett_in_text_fields': {
      files: buckets.ssInText.length,
      examples: topExamples(buckets.ssInText),
    },
    '1c_conjugated_verb_in_vocabTags': {
      files: buckets.vocabConjugated.length,
      examples: topExamples(buckets.vocabConjugated),
    },
    '1d_lowercase_noun_in_vocabTags': {
      files: buckets.vocabLowerNoun.length,
      examples: topExamples(buckets.vocabLowerNoun),
    },
    '1e_inflected_adj_in_vocabTags': {
      files: buckets.vocabInflectedAdj.length,
      examples: topExamples(buckets.vocabInflectedAdj),
    },
    '1_function_word_in_vocabTags': {
      files: buckets.vocabFunction.length,
      examples: topExamples(buckets.vocabFunction),
    },
    '2_grammarTags_low_overlap_vs_inferred_SAMPLE': {
      files: buckets.grammarGenericSample.length,
      sampleSize: grammarSampleFiles.length,
      note: 'Not 100% automatable as ground-truth; heuristic: jaccard(stored, re-inferred)<0.34 on up to 4 qs',
      examples: topExamples(buckets.grammarGenericSample),
    },
    '3_topicTag_content_mismatch': {
      files: new Set(buckets.topicMismatch.map((x) => x.file)).size,
      findings: buckets.topicMismatch.length,
      examples: topExamples(buckets.topicMismatch),
    },
    '4_poolRejectReason_in_pool_verified': {
      files: buckets.rejectMetaInVerified.length,
      examples: topExamples(buckets.rejectMetaInVerified),
    },
    '5_internal_duplicate_passages': {
      files: buckets.passageDupInternal.length,
      examples: topExamples(buckets.passageDupInternal),
    },
    '5_internal_near_duplicate_questions': {
      files: buckets.questionNearDupInternal.length,
      examples: topExamples(buckets.questionNearDupInternal),
    },
    '6_gender_agreement_partial_lexicon': {
      files: buckets.genderAgreement.length,
      note: 'Partial deterministic lexicon only — false negatives expected; false positives possible on edge cases',
      examples: topExamples(buckets.genderAgreement),
    },
    '7_forced_vocab_register_heuristic': {
      files: buckets.forcedVocabHeuristic.length,
      note: 'Deterministic proxy (academic jargon / known forced phrases). Full Q3B needs LLM — not run ($).',
      examples: topExamples(buckets.forcedVocabHeuristic),
    },
  },
  // full lists for follow-up fixes
  full: {
    vocabIdenticalAcrossQs: buckets.vocabIdenticalAcrossQs.map((x) => x.file),
    vocabConjugated: buckets.vocabConjugated.map((x) => x.file),
    vocabLowerNoun: buckets.vocabLowerNoun.map((x) => x.file),
    vocabInflectedAdj: buckets.vocabInflectedAdj.map((x) => x.file),
    ssInText: buckets.ssInText.map((x) => x.file),
    topicMismatch: buckets.topicMismatch.map((x) => `${x.file}::${x.passageId}`),
    genderAgreement: buckets.genderAgreement.map((x) => x.file),
    questionNearDupInternal: buckets.questionNearDupInternal.map((x) => x.file),
    passageDupInternal: buckets.passageDupInternal.map((x) => x.file),
    forcedVocabHeuristic: buckets.forcedVocabHeuristic.map((x) => x.file),
    rejectMetaInVerified: buckets.rejectMetaInVerified.map((x) => x.file),
  },
};

// Breakdown 1a by module/teil
const identicalByTeil = {};
for (const x of buckets.vocabIdenticalAcrossQs) {
  const m = x.file.match(/t(\d)/i);
  const key = `${x.module}-t${m ? m[1] : '?'}`;
  identicalByTeil[key] = (identicalByTeil[key] || 0) + 1;
}
report.checks['1a_vocab_identical_across_questions'].byTeil = identicalByTeil;

fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);

const c = report.checks;
const rows = [
  ['1a', 'vocabularyTags idénticos entre preguntas del mismo archivo', c['1a_vocab_identical_across_questions'].files, '100%', ex(c['1a_vocab_identical_across_questions'])],
  ['1a′', 'vocabularyTags casi idénticos (J≥0.8, no mayoría idéntica)', c['1a_vocab_near_identical_across_questions'].files, '100%', ex(c['1a_vocab_near_identical_across_questions'])],
  ['1b', 'ß→ss en vocabularyTags', c['1b_ss_instead_of_eszett_in_vocabTags'].files, '100% lexicon parcial', ex(c['1b_ss_instead_of_eszett_in_vocabTags'])],
  ['1b′', 'ß→ss en campos de texto', c['1b_ss_instead_of_eszett_in_text_fields'].files, '100% lexicon parcial', ex(c['1b_ss_instead_of_eszett_in_text_fields'])],
  ['1c', 'Verbo conjugado en vocabularyTags', c['1c_conjugated_verb_in_vocabTags'].files, '100% lista finita', ex(c['1c_conjugated_verb_in_vocabTags'])],
  ['1d', 'Sustantivo en minúscula en vocabularyTags', c['1d_lowercase_noun_in_vocabTags'].files, '100% lista B1', ex(c['1d_lowercase_noun_in_vocabTags'])],
  ['1e', 'Adjetivo flexionado en vocabularyTags', c['1e_inflected_adj_in_vocabTags'].files, '100% lista', ex(c['1e_inflected_adj_in_vocabTags'])],
  ['1f', 'Palabra funcional en vocabularyTags', c['1_function_word_in_vocabTags'].files, '100%', ex(c['1_function_word_in_vocabTags'])],
  ['2', 'grammarTags poco relacionados al texto', c['2_grammarTags_low_overlap_vs_inferred_SAMPLE'].files, `muestra ${c['2_grammarTags_low_overlap_vs_inferred_SAMPLE'].sampleSize}`, ex(c['2_grammarTags_low_overlap_vs_inferred_SAMPLE'])],
  ['3', 'topicTag mismatch vs contenido', c['3_topicTag_content_mismatch'].files, '100%', ex(c['3_topicTag_content_mismatch'])],
  ['4', '_poolRejectReason en pool-verified', c['4_poolRejectReason_in_pool_verified'].files, '100%', ex(c['4_poolRejectReason_in_pool_verified'])],
  ['5a', 'Pasajes duplicados internos', c['5_internal_duplicate_passages'].files, '100%', ex(c['5_internal_duplicate_passages'])],
  ['5b', 'Preguntas casi idénticas en el mismo archivo', c['5_internal_near_duplicate_questions'].files, '100% J≥0.85', ex(c['5_internal_near_duplicate_questions'])],
  ['6', 'Concordancia género (lexicón parcial)', c['6_gender_agreement_partial_lexicon'].files, '100% cobertura parcial', ex(c['6_gender_agreement_partial_lexicon'])],
  ['7', 'Vocabulario forzado / registro (heurística)', c['7_forced_vocab_register_heuristic'].files, '100% proxy; Q3B LLM no corrido', ex(c['7_forced_vocab_register_heuristic'])],
];

function ex(check) {
  const e = check.examples || [];
  if (!e.length) return '—';
  return e
    .map((x) => {
      if (x.exampleTags) return `\`${x.file}\` tags=[${(x.exampleTags || []).slice(0, 5).join(', ')}]`;
      if (x.samples) return `\`${x.file}\` [${x.samples.join(', ')}]`;
      if (x.hits) return `\`${x.file}\` ${JSON.stringify(x.hits[0]).slice(0, 80)}`;
      if (x.detail) return `\`${x.file}\` ${String(x.detail).slice(0, 70)}`;
      if (x.pairs) return `\`${x.file}\` «${x.pairs[0]?.a?.slice(0, 40)}»`;
      if (x.examples) return `\`${x.file}\` stored=${JSON.stringify(x.examples[0]?.stored)}`;
      if (x.reason) return `\`${x.file}\` ${x.reason}`;
      if (x.before) return `\`${x.file}\` passages ${x.before}→${x.after}`;
      return `\`${x.file}\``;
    })
    .join('<br>');
}

const md = [
  '# Pool exhaustive audit — 2026-07-10',
  '',
  `**Universo:** ${summary.scanned} archivos (` +
    `verified ${summary.byPool['pool-verified']}, ok-lesen ${summary.byPool['pool-content-ok-lesen']})`,
  '',
  `Módulos: ${JSON.stringify(summary.byModule)}`,
  '',
  '## Tabla única de hallazgos',
  '',
  '| # | Check | Archivos que fallan | Cobertura | Ejemplos (2–3) |',
  '|---|-------|--------------------:|-----------|----------------|',
  ...rows.map(([id, name, n, cov, examples]) => `| ${id} | ${name} | **${n}** | ${cov} | ${examples} |`),
  '',
  '### 1a por módulo/Teil',
  '',
  '```',
  JSON.stringify(identicalByTeil, null, 2),
  '```',
  '',
  '## Límites de automatización',
  '',
  '| Check | ¿100% auto? | Si no, muestra mínima recomendada |',
  '|-------|-------------|-----------------------------------|',
  '| 1 vocab structure/quality | Sí (listas/heurísticas; FN posibles en conjugados raros) | — |',
  '| 1b ß/ss | Parcial (lexicón de pares conocidos) | Ampliar lexicón; no hace falta muestra manual si se acepta cobertura parcial |',
  '| 2 grammarTags | **No** (sin ground truth) | **40 archivos** multi-módulo (ya corridos) + revisión manual de los flagged |',
  '| 3 topicTag | Sí (detector actual) | — |',
  '| 4 reject meta | Sí | — |',
  '| 5 dup internos | Sí | — |',
  '| 6 género | **Parcial** (lexicón) | Para confianza alta en residual: muestra manual **30** textos tras fix del lexicón |',
  '| 7 forced vocab | **Proxy only**; Q3B real = LLM | Si proxy=0: muestra manual **20** (Hören T1+T2) basta para confianza media; LLM Q3B = coste a confirmar |',
  '',
  '## Orden de arreglo recomendado (impacto búsqueda por vocabulario)',
  '',
  '1. **1a vocabularyTags idénticos entre preguntas** — rompe la utilidad del buscador a nivel ítem (mismo tag set en todo el archivo). Prioridad máxima; afecta sobre todo T3 / estructuras multi-pregunta.',
  '2. **1c/1d/1e/1f residuales post-v2** — si n>0, segunda pasada del extractor (casos que escaparon).',
  '3. **1b ß→ss en texto** — calidad lingüística visible; en tags también si aparece.',
  '4. **6 género (lexicón)** — errores reales de alemán; cobertura parcial pero barato de ampliar.',
  '5. **5b preguntas casi duplicadas** — confunde práctica; menos crítico que vocab search.',
  '6. **3 topic mismatch** — si n>0, alinear tags; impacto en filtrado temático.',
  '7. **2 grammarTags** — metadata secundaria; sample-fix, no bloquea búsqueda por vocab.',
  '8. **7 forced vocab** — si proxy=0, solo muestra manual/LLM; no regenerar en masa sin evidencia.',
  '9. **4 reject meta / 5a pasajes** — higiene; deberían ser 0.',
  '',
  `Datos completos (listas de archivos): \`${path.basename(OUT_JSON)}\``,
  '',
];

fs.writeFileSync(OUT_MD, md.join('\n'));
console.log(JSON.stringify({
  scanned: summary.scanned,
  checks: Object.fromEntries(Object.entries(report.checks).map(([k, v]) => [k, v.files])),
  identicalByTeil,
  out: OUT_MD,
}, null, 2));
