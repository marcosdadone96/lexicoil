#!/usr/bin/env node
/**
 * Repair Lesen Teil 2 in curated B1 exams that have 1 passage in passages[]
 * but 6 questions spanning two passageIds.
 *
 *   node scripts/fix-b1-lesen-t2-two-passages.mjs [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  loadBlueprint,
  loadJsonFile,
  bankPath,
  passagesPath,
  curatedDir,
  servedExamPath,
} from './lib/examPipeline.mjs';
import { normalizeMcqOptions } from './lib/normalizeMcq.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ExamRenumber = require(path.join(ROOT, 'js/engine/examRenumber.js'));
const { validateExamAgainstBlueprint, countPassagesInPart } = require(
  path.join(ROOT, 'js/engine/validation/blueprintFidelity.js'),
);

const APPLY = process.argv.includes('--apply');
const SERVED = process.argv.includes('--served');

const TARGETS = [
  { topic: 'daily_life', fixQuestions: true },
  { topic: 'work', fixQuestions: false },
  { topic: 'health', fixQuestions: false },
  { topic: 'travel', fixQuestions: false },
];

const CURATED_FILES = {
  daily_life: 'curated_de_B1_4ef471830279.json',
  work: 'curated_de_B1_b84732dc8afc.json',
  health: 'curated_de_B1_b8f192726155.json',
  travel: 'curated_de_B1_dee95c2d7ab5.json',
};

function loadPassageMap() {
  const bank = loadJsonFile(bankPath('de', 'B1'));
  const extra = fs.existsSync(passagesPath('de', 'B1'))
    ? loadJsonFile(passagesPath('de', 'B1'))
    : { passages: [] };
  const map = new Map();
  for (const p of [...(bank.passages || []), ...(extra.passages || [])]) {
    if (p?.id) map.set(p.id, p);
  }
  return { map, bank };
}

function passageEntry(meta, fallback = {}) {
  const id = meta?.id || fallback.passageId || fallback.id;
  const title = meta?.title || fallback.textTitle || fallback.title || '';
  const text = meta?.text || fallback.text || '';
  return { id, title, text, passageId: id, textTitle: title };
}

function bankQuestionToExam(q, token, number) {
  const options = Array.isArray(q.options) && q.options.length ? normalizeMcqOptions(q.options) : q.options;
  return {
    id: `${number}-${token}`,
    type: 'multiple',
    question: q.question || '',
    correct: q.correct ?? q.correctAnswer ?? '',
    correctAnswer: q.correctAnswer ?? q.correct ?? '',
    explanation: q.explanation || '',
    options,
    grammarTags: q.grammarTags || [],
    topicTags: q.topicTags || [],
    vocabularyTags: q.vocabularyTags || [],
    difficulty: q.difficulty ?? 3,
    passageId: q.passageId || '',
    number,
    nr: number,
    nummer: number,
  };
}

function collectPassageIds(part) {
  const ids = new Set();
  if (part.passageId) ids.add(part.passageId);
  for (const pp of part.passages || []) {
    const pid = pp.passageId || pp.id;
    if (pid) ids.add(pid);
  }
  for (const q of part.questions || []) {
    if (q.passageId) ids.add(q.passageId);
  }
  return [...ids];
}

function repairLesenT2(part, passageMap, bank, token, { fixQuestions }) {
  const ids = collectPassageIds(part);
  if (ids.length < 2) {
    throw new Error(`expected 2 passageIds in questions/part, got ${ids.join(', ')}`);
  }

  const primaryId = part.passageId || ids[0];
  const secondaryId = ids.find((id) => id !== primaryId) || ids[1];

  const primaryMeta = passageMap.get(primaryId);
  const secondaryMeta = passageMap.get(secondaryId);
  const primaryFb = { passageId: primaryId, textTitle: part.textTitle, text: part.text };
  const secondaryFb = (part.passages || []).find(
    (p) => (p.passageId || p.id) === secondaryId,
  ) || { passageId: secondaryId };

  part.passages = [
    passageEntry(primaryMeta, primaryFb),
    passageEntry(secondaryMeta, secondaryFb),
  ];

  part.passageId = primaryId;
  part.textTitle = part.passages[0].title;
  part.text = part.passages[0].text;

  if (fixQuestions) {
    const bankQs = (bank.questions || [])
      .filter((q) => q.passageId === primaryId && Number(q.teil) === 2)
      .slice(0, 3);
    if (bankQs.length < 3) {
      throw new Error(`bank missing 3 questions for ${primaryId}`);
    }
    const tail = (part.questions || []).filter((q) => q.passageId === secondaryId).slice(0, 3);
    if (tail.length < 3) {
      throw new Error(`exam missing 3 questions for ${secondaryId}`);
    }
    part.questions = [
      ...bankQs.map((q, i) => bankQuestionToExam(q, token, 7 + i)),
      ...tail.map((q, i) => ({
        ...q,
        number: 10 + i,
        nr: 10 + i,
        nummer: 10 + i,
      })),
    ];
  }

  part._itemCount = 6;
  part._numberRange = { start: 7, end: 12, officialEnd: 12 };
}

function examTokenFromFile(file) {
  return file.match(/_([0-9a-f]{8,12})\.json$/i)?.[1]?.slice(0, 8) || 'fix';
}

function examTokenFromExam(exam) {
  const id = String(exam.id || exam.topic || 'fix');
  return id.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'fix';
}

function main() {
  const blueprint = loadBlueprint('de', 'B1');
  const { map: passageMap, bank } = loadPassageMap();
  const bpT2 = blueprint.modules?.lesen?.parts?.find((p) => Number(p.teil) === 2);

  let ok = 0;

  if (SERVED) {
    const servedPath = servedExamPath('de', 'B1');
    const exams = loadJsonFile(servedPath);
    if (!Array.isArray(exams)) {
      console.error('Expected served file to be an exam array');
      process.exit(1);
    }
    for (const { topic, fixQuestions } of TARGETS) {
      const exam = exams.find((e) => e.topic === topic);
      if (!exam) {
        console.error(`  ${topic}: not found in served file`);
        continue;
      }
      const t2 = (exam.lesenParts || []).find((p) => Number(p.teil) === 2);
      if (!t2) {
        console.error(`  ${topic}: no lesen T2`);
        continue;
      }
      const before = countPassagesInPart(t2, bpT2);
      repairLesenT2(t2, passageMap, bank, examTokenFromExam(exam), { fixQuestions });
      ExamRenumber.renumberExam(exam, blueprint);
      const after = countPassagesInPart(t2, bpT2);
      const t2Ok = after === 2 && (t2.questions || []).length === 6;
      console.log(
        `  ${topic} (served): passages ${before}→${after}, items=${t2.questions?.length}, t2=${t2Ok ? 'OK' : 'FAIL'}`,
      );
      if (t2Ok) ok += 1;
    }
    if (APPLY) {
      fs.writeFileSync(servedPath, JSON.stringify(exams, null, 2) + '\n', 'utf8');
    }
  } else {
    const dir = curatedDir('de', 'B1');
    for (const { topic, fixQuestions } of TARGETS) {
      const file = CURATED_FILES[topic];
      const fp = path.join(dir, file);
      const wrapper = loadJsonFile(fp);
      const exam = wrapper.exam || wrapper;
      const t2 = (exam.lesenParts || []).find((p) => Number(p.teil) === 2);
      if (!t2) {
        console.error(`  ${topic}: no lesen T2`);
        continue;
      }

      const before = countPassagesInPart(t2, bpT2);
      repairLesenT2(t2, passageMap, bank, examTokenFromFile(file), { fixQuestions });
      ExamRenumber.renumberExam(exam, blueprint);
      const after = countPassagesInPart(t2, bpT2);
      const t2Ok = after === 2 && (t2.questions || []).length === 6;

      console.log(
        `  ${topic} (${file}): passages ${before}→${after}, items=${t2.questions?.length}, t2=${t2Ok ? 'OK' : 'FAIL'}`,
      );

      if (t2Ok) {
        ok += 1;
        if (APPLY) {
          if (wrapper.exam) wrapper.exam = exam;
          fs.writeFileSync(fp, JSON.stringify(wrapper, null, 2) + '\n', 'utf8');
        }
      }
    }
  }

  console.log(`\n${APPLY ? 'Applied' : 'Dry-run'}: ${ok}/${TARGETS.length} repaired`);
  if (!APPLY) console.log('Use --apply to write files.');
  process.exit(ok === TARGETS.length ? 0 : 1);
}

main();
