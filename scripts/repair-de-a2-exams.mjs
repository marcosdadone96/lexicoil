#!/usr/bin/env node
/**
 * Repair curated de/A2 exams: Lesen T4, Hören T2 MCQ, Sprechen bank fill, Schreiben A2 word counts.
 * Does NOT regenerate Lesen T1–T3 or Hören T1/T3/T4.
 *
 * Usage:
 *   node scripts/repair-de-a2-exams.mjs --apply      # write changes to disk
 *   node scripts/repair-de-a2-exams.mjs [--dry-run]  # show what would change (default)
 *
 * SAFETY: sin --apply = dry-run, CERO escrituras a disco.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { GOETHE_A2_INSTRUCTIONS } from './lib/goethe-a2-modellsatz.mjs';
import { validateCrossExamPassageUniqueness } from './lib/passageDedupe.mjs';

const require = createRequire(import.meta.url);
const { GOETHE_A2_SCHREIBEN_WORDS } = require('../js/library/goetheB1Constants.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'data/exams/de_A2.json');
const BANK_PATH = path.join(ROOT, 'library/de/A2/questions.json');
// Require explicit --apply to write; --dry-run is accepted as alias but not required
const dryRun = !process.argv.includes('--apply');

const T4_SET_BY_TOPIC = {
  health: 'vegetarismus-schule-02',
  work: 'vier-tage-woche-02',
  society: 'pfand-erhoehung-02',
  education: 'kostenlos-museum-01',
};

const HOREN_T2_PASSAGE_BY_TOPIC = {
  health: 'de-a2-p-horen-t2-gesund-leben-01',
  work: 'de-a2-p-horen-t2-stadtplanung-01',
  society: 'de-a2-p-horen-t2-ehrenamt-chancen-01',
  education: 'de-a2-p-horen-t2-umweltschutz-vortrag-01',
};

const SPRECHEN_SET_BY_TOPIC = {
  health: 'gesund-leben-02',
  work: 'reise-vorbereitung-01',
  society: 'ehrenamt-thema-02',
  education: 'sport-praesentation-01',
};

const SPRECHEN_TITLES = {
  1: 'Teil 1 — Fragen zur Person',
  2: 'Teil 2 — Von sich erzählen',
  3: 'Teil 3 — Gemeinsam planen',
};

const SPRECHEN_TASK_TYPES = {
  1: 'personal_questions',
  2: 'about_self',
  3: 'plan_together',
};

function loadBank() {
  return JSON.parse(fs.readFileSync(BANK_PATH, 'utf8'));
}

function bankQuestions(bank, filter) {
  return (bank.questions || []).filter(filter);
}

function parseMatchingOption(raw) {
  const m = String(raw || '')
    .trim()
    .match(/^([a-i])\)\s*(.+)$/i);
  return m ? { letter: m[1].toLowerCase(), text: m[2].trim() } : null;
}

function matchingToMcq(q, number) {
  const correctLetter =
    String(q.correct || q.correctAnswer || 'a')
      .toLowerCase()
      .replace(/[^a-i]/, '') || 'a';
  const parsed = (q.options || []).map(parseMatchingOption).filter(Boolean);
  const correctOpt = parsed.find((o) => o.letter === correctLetter);
  if (!correctOpt) throw new Error(`No correct option ${correctLetter} in ${q.id}`);
  const wrong = parsed.filter((o) => o.letter !== correctLetter);
  if (wrong.length < 2) throw new Error(`Not enough distractors in ${q.id}`);
  const trio = [correctOpt, wrong[0], wrong[1]];
  const rot = number % 3;
  const ordered = [trio[rot], trio[(rot + 1) % 3], trio[(rot + 2) % 3]];
  const letters = ['a', 'b', 'c'];
  const correctIdx = ordered.findIndex((o) => o.letter === correctLetter);
  return {
    id: String(number),
    type: 'multiple',
    question: q.question || 'Welche Aussage passt zum Gespräch?',
    options: ordered.map((o, i) => `${letters[i]}) ${o.text}`),
    correct: letters[correctIdx],
    correctAnswer: letters[correctIdx],
    explanation: q.explanation || '',
    grammarTags: q.grammarTags || [],
    topicTags: q.topicTags || [],
    vocabularyTags: q.vocabularyTags || [],
    difficulty: q.difficulty ?? 2,
    passageId: q.passageId || '',
    number,
    nr: number,
    nummer: number,
  };
}

function buildHorenT2Part(passageId, bank) {
  const passage = (bank.passages || []).find((p) => p.id === passageId);
  if (!passage) throw new Error(`Missing horen T2 passage: ${passageId}`);
  const bankQs = bankQuestions(
    bank,
    (q) => q.module === 'horen' && q.teil === 2 && q.passageId === passageId,
  ).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (bankQs.length < 5) throw new Error(`Horen T2 questions incomplete: ${passageId} (${bankQs.length}/5)`);
  const questions = bankQs.slice(0, 5).map((q, i) => matchingToMcq(q, 6 + i));
  const transcript = passage.text || '';
  return {
    teil: 2,
    instruction: GOETHE_A2_INSTRUCTIONS.horen[1],
    blueprintSlot: 'conversation_mcq',
    plays: 1,
    transcript,
    segments: [
      {
        id: `seg_t2_${passageId.slice(-12)}`,
        label: passage.title || 'Aufnahme 1',
        transcript,
        passageId,
        questions,
      },
    ],
    _itemCount: 5,
    _numberRange: { start: 6, end: 10, officialEnd: 10 },
  };
}

function extractBulletPoints(text) {
  return String(text || '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => /^[•*–-]\s+/.test(l))
    .map((l) => l.replace(/^[•*–-]\s+/, '').trim());
}

function sprechenQuestionForSet(bank, teil, slug) {
  const q = (bank.questions || []).find(
    (x) => x.module === 'sprechen' && x.teil === teil && String(x.id).includes(`-${slug}-`),
  );
  if (!q) throw new Error(`Missing sprechen set ${slug} teil ${teil}`);
  return q;
}

function buildSprechenParts(topic, bank) {
  const slug = SPRECHEN_SET_BY_TOPIC[topic];
  if (!slug) throw new Error(`No sprechen set for topic ${topic}`);
  return [1, 2, 3].map((teil) => {
    const q = sprechenQuestionForSet(bank, teil, slug);
    const taskType = SPRECHEN_TASK_TYPES[teil];
    const prompts = extractBulletPoints(q.question);
    return {
      teil,
      title: SPRECHEN_TITLES[teil],
      fieldId: `speak_bp_${teil}`,
      situation: q.question,
      topic: q.topicTags?.[0] || topic,
      taskType,
      points: prompts.length ? prompts : [taskType],
      prompts: prompts.length ? prompts : undefined,
      blueprintSlot: 'speaking_task',
      grammarTags: q.grammarTags || [],
      topicTags: q.topicTags?.length ? q.topicTags : [topic],
      bankQuestionId: q.id,
    };
  });
}

function trimLesenMcqPart(part, teil, expected = 5) {
  if (!part) return;
  part.instruction = GOETHE_A2_INSTRUCTIONS.lesen[teil - 1] || part.instruction;
  const qs = part.questions || [];
  if (qs.length > expected) {
    part.questions = qs.slice(0, expected).map((q, i) => ({
      ...q,
      number: i + 1 + (teil - 1) * 5,
      nr: i + 1 + (teil - 1) * 5,
      nummer: i + 1 + (teil - 1) * 5,
      id: String(i + 1 + (teil - 1) * 5),
    }));
  }
  part._itemCount = expected;
  part._numberRange = {
    start: (teil - 1) * 5 + 1,
    end: teil * 5,
    officialEnd: teil * 5,
  };
}

function buildLesenT4(setSlug, bank) {
  const prefix = `de-a2-l-t4-${setSlug}-q`;
  const items = bankQuestions(
    bank,
    (q) => q.module === 'lesen' && q.teil === 4 && q.type === 'matching' && String(q.id).startsWith(prefix),
  ).sort((a, b) => String(a.id).localeCompare(String(b.id)));

  if (items.length < 5) throw new Error(`Lesen T4 set incomplete: ${setSlug} (${items.length}/5)`);

  const passagePrefix = `de-a2-p-lesen-t4-${setSlug}-`;
  const ads = (bank.passages || [])
    .filter((p) => p.module === 'lesen' && p.teil === 4 && String(p.id).startsWith(passagePrefix))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  if (ads.length < 6) throw new Error(`Lesen T4 ads incomplete: ${setSlug} (${ads.length}/6)`);

  const passages = ads.slice(0, 6).map((p) => ({
    id: p.id,
    passageId: p.id,
    title: p.title || '',
    text: p.text || '',
  }));

  const adList = ads.slice(0, 6).map((p, i) => ({
    key: String.fromCharCode(97 + i),
    title: p.title || '',
    text: p.text || '',
  }));

  const examItems = items.slice(0, 5).map((q, i) => {
    const rawCorrect = String(q.correct || q.correctAnswer || '').trim();
    const correct = rawCorrect.toUpperCase() === 'X' ? 'g' : rawCorrect.toLowerCase();
    return {
      id: String(16 + i),
      type: 'matching',
      signText: '',
      question: q.question || '',
      options: q.options || ['a) a', 'b) b', 'c) c', 'd) d', 'e) e', 'f) f', 'g) X'],
      correct,
      correctAnswer: correct,
      explanation: q.explanation || '',
      grammarTags: q.grammarTags || [],
      topicTags: q.topicTags || [],
      vocabularyTags: q.vocabularyTags || [],
      difficulty: q.difficulty ?? 2,
      passageId: q.passageId || '',
      number: 16 + i,
      nr: 16 + i,
      nummer: 16 + i,
    };
  });

  return {
    teil: 4,
    instruction: GOETHE_A2_INSTRUCTIONS.lesen[3],
    blueprintSlot: 'ads_matching',
    passages,
    ads: adList,
    items: examItems,
    questions: [],
    _itemCount: 5,
    _numberRange: { start: 16, end: 20, officialEnd: 20 },
  };
}

function patchSchreiben(exam) {
  for (const part of exam.schreibenParts || []) {
    const teil = Number(part.teil ?? part.aufgabe ?? 1);
    part.teil = teil;
    part.aufgabe = teil;
    const words = GOETHE_A2_SCHREIBEN_WORDS[teil];
    if (!words) continue;
    part.minWords = words.min;
    part.maxWords = words.max;
    part.targetWords = words.target;
    if (part.task) {
      part.task = part.task
        .replace(/\bcirca\s*80\s*Wörter\b/gi, `${words.min}–${words.max} Wörter`)
        .replace(/\b80\s*Wörter\b/gi, `${words.min}–${words.max} Wörter`)
        .replace(/\b20–30\s*Wörter\b/gi, `${words.min}–${words.max} Wörter`)
        .replace(/\b30–40\s*Wörter\b/gi, `${words.min}–${words.max} Wörter`)
        .replace(/\b20-30\s*Wörter\b/gi, `${words.min}–${words.max} Wörter`)
        .replace(/\b30-40\s*Wörter\b/gi, `${words.min}–${words.max} Wörter`);
    }
  }
}

function collectPassageIds(exam) {
  const ids = new Set();
  const add = (id) => {
    if (id) ids.add(String(id));
  };
  for (const p of exam.lesenParts || []) {
    add(p.passageId);
    for (const q of p.questions || []) add(q.passageId);
    for (const it of p.items || []) add(it.passageId);
    for (const pp of p.passages || []) add(pp.id || pp.passageId);
  }
  for (const p of exam.horenParts || []) {
    for (const s of p.segments || []) add(s.passageId);
    for (const q of p.questions || []) add(q.passageId);
  }
  return ids;
}

function horenSegmentFromBank(bank, passageId, teil) {
  const passage = (bank.passages || []).find((p) => p.id === passageId);
  if (!passage) return null;
  const questions = (bank.questions || []).filter(
    (q) => q.module === 'horen' && q.teil === teil && q.passageId === passageId,
  );
  if (!questions.length) return null;
  const q = questions[0];
  return {
    id: `seg_${teil}_${passageId.slice(-8)}`,
    label: passage.title || `Text ${teil}`,
    transcript: passage.text || '',
    passageId,
    questions: [
      {
        id: q.id,
        type: q.type || 'multiple',
        question: q.question || '',
        correct: q.correct || q.correctAnswer,
        correctAnswer: q.correctAnswer || q.correct,
        explanation: q.explanation || '',
        grammarTags: q.grammarTags || [],
        topicTags: q.topicTags || [],
        vocabularyTags: q.vocabularyTags || [],
        difficulty: q.difficulty ?? 2,
        options: q.options || [],
        passageId,
        number: q.number,
        nr: q.nr,
        nummer: q.nummer,
      },
    ],
  };
}

function dedupeHorenExam(exam, bank, globalUsed) {
  for (const part of exam.horenParts || []) {
    const teil = Number(part.teil);
    if (teil === 2) continue;
    if (!teil || !Array.isArray(part.segments)) continue;
    const pool = (bank.passages || [])
      .filter((p) => p.module === 'horen' && p.teil === teil)
      .map((p) => p.id);

    part.segments = part.segments.map((seg) => {
      let pid = seg.passageId;
      if (pid && !globalUsed.has(pid)) {
        globalUsed.add(pid);
        return seg;
      }
      const replacement = pool.find((id) => !globalUsed.has(id) && horenSegmentFromBank(bank, id, teil));
      if (!replacement) return seg;
      globalUsed.add(replacement);
      const built = horenSegmentFromBank(bank, replacement, teil);
      if (!built) return seg;
      built.label = seg.label || built.label;
      return built;
    });

    const transcripts = part.segments.map((s) => s.transcript).filter(Boolean);
    if (transcripts.length) part.transcript = transcripts.join('\n\n');
  }

  for (const part of exam.lesenParts || []) {
    const teil = Number(part.teil);
    if (teil === 4) continue;
    let pid = part.passageId;
    if (pid && globalUsed.has(pid)) {
      const alt = (bank.passages || []).find(
        (p) =>
          p.module === 'lesen' &&
          p.teil === teil &&
          !globalUsed.has(p.id) &&
          (bank.questions || []).some((q) => q.passageId === p.id),
      );
      if (alt) {
        part.passageId = alt.id;
        part.text = alt.text;
        part.textTitle = alt.title || part.textTitle;
        for (const q of part.questions || []) {
          const bq = (bank.questions || []).find(
            (x) => x.passageId === alt.id && x.module === 'lesen' && x.teil === teil,
          );
          if (bq) {
            Object.assign(q, {
              question: bq.question,
              options: bq.options,
              correct: bq.correct,
              correctAnswer: bq.correctAnswer,
              explanation: bq.explanation,
              passageId: alt.id,
            });
          } else {
            q.passageId = alt.id;
          }
        }
        pid = alt.id;
      }
    }
    if (pid) globalUsed.add(pid);
    for (const q of part.questions || []) {
      if (q.passageId) globalUsed.add(q.passageId);
    }
  }
}

function patchBlueprintCoverage(exam) {
  for (const row of exam.blueprintCoverage || []) {
    if (row.module === 'horen' && row.teil === 2) {
      row.slotType = 'conversation_mcq';
      row.taskFormat = 'short_dialogue_mcq';
    }
    if (row.module === 'schreiben') {
      const teil = Number(row.teil);
      const words = GOETHE_A2_SCHREIBEN_WORDS[teil];
      if (words) row.wordsPerPassage = { min: words.min, max: words.max };
    }
  }
}

function repairExam(exam, bank, globalUsed) {
  const topic = String(exam.topic || '').toLowerCase();
  const t4Set = T4_SET_BY_TOPIC[topic];
  if (!t4Set) throw new Error(`No T4 set mapping for topic ${topic}`);

  trimLesenMcqPart((exam.lesenParts || []).find((p) => p.teil === 1), 1);
  trimLesenMcqPart((exam.lesenParts || []).find((p) => p.teil === 2), 2);

  const t4Idx = (exam.lesenParts || []).findIndex((p) => p.teil === 4);
  const t4 = buildLesenT4(t4Set, bank);
  if (t4Idx >= 0) exam.lesenParts[t4Idx] = t4;
  else exam.lesenParts.push(t4);

  for (const pp of t4.passages || []) globalUsed.add(pp.id);
  for (const it of t4.items || []) if (it.passageId) globalUsed.add(it.passageId);

  const horenT2Passage = HOREN_T2_PASSAGE_BY_TOPIC[topic];
  if (!horenT2Passage) throw new Error(`No horen T2 passage for topic ${topic}`);
  const horenT2 = buildHorenT2Part(horenT2Passage, bank);
  const h2Idx = (exam.horenParts || []).findIndex((p) => p.teil === 2);
  if (h2Idx >= 0) exam.horenParts[h2Idx] = horenT2;
  else exam.horenParts.push(horenT2);
  globalUsed.add(horenT2Passage);

  exam.sprechenParts = buildSprechenParts(topic, bank);
  patchSchreiben(exam);
  dedupeHorenExam(exam, bank, globalUsed);
  patchBlueprintCoverage(exam);

  for (const row of exam.blueprintCoverage || []) {
    if (row.module === 'lesen' && row.teil <= 4) {
      row.filled = 5;
      row.complete = true;
    }
    if (row.module === 'horen' && row.teil === 2) {
      row.filled = 5;
      row.complete = true;
    }
  }
}

function main() {
  const bank = loadBank();
  const exams = JSON.parse(fs.readFileSync(TARGET, 'utf8'));
  if (!Array.isArray(exams) || exams.length !== 4) {
    throw new Error(`Expected 4 exams in ${TARGET}, got ${exams?.length ?? '?'}`);
  }

  const globalUsed = new Set();
  for (const exam of exams) repairExam(exam, bank, globalUsed);

  const dedupe = validateCrossExamPassageUniqueness(
    exams.map((e) => ({ id: e.topic, exam: e, label: e.topic })),
  );

  if (!dedupe.ok) {
    console.warn(`Warning: ${dedupe.violations.length} dedupe issue(s) remain — manual review may be needed`);
    for (const v of dedupe.violations.slice(0, 8)) console.warn(' ', v.message);
  }

  if (dryRun) {
    console.log('[dry-run] Would write', TARGET);
    return;
  }

  fs.writeFileSync(TARGET, `${JSON.stringify(exams, null, 2)}\n`, 'utf8');
  console.log('Wrote', TARGET);
}

main();
