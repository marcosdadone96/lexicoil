#!/usr/bin/env node
/**
 * Seed pool-verified/A2 from curated reusable-seed + bank Hören T2 + served Sprechen.
 *   node scripts/seed-a2-pool-verified-from-curated.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { poolVerifiedDir, ensureLevelStagingDirs } from './lib/batchPaths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = path.join(ROOT, 'library/reusable-seed/de_A2.json');
const BANK = path.join(ROOT, 'library/de/A2/questions.json');
const EXAMS = path.join(ROOT, 'data/exams/de_A2.json');
const apply = process.argv.includes('--apply');

const TOPIC_SLUG = {
  'curated:health': 'health',
  'curated:work': 'work',
  'curated:society': 'society',
  'curated:education': 'education',
};

function normQ(q, mod, teil, lv, passageId) {
  const mcq = q.type === 'multiple' || q.type === 'multiple_choice';
  const expl = q.explanation
    || (mod === 'lesen' || mod === 'horen'
      ? 'Die richtige Antwort steht im Text. Lesen Sie den Text noch einmal genau.'
      : '');
  return {
    ...q,
    module: mod,
    teil,
    level: lv,
    type: mcq ? 'multiple_choice' : q.type,
    passageId: q.passageId || passageId,
    options: q.options || [],
    correct: q.correct ?? q.correctAnswer ?? '',
    correctAnswer: q.correctAnswer ?? q.correct ?? '',
    explanation: expl,
  };
}

function horenSegmentsBatch(record, teil, lv) {
  const passages = record.segments.map((s, i) => ({
    id: s.passageId || `seg-${i}`,
    module: 'horen',
    teil,
    level: lv,
    title: s.label || `Text ${i + 1}`,
    text: s.transcript || '',
  }));
  const questions = record.segments.flatMap((s) =>
    (s.questions || []).map((q) => normQ(q, 'horen', teil, lv, s.passageId)),
  );
  return {
    level: lv,
    lang: 'de',
    instruction: record.instruction || '',
    passages,
    questions,
  };
}

function recordToBatch(record) {
  const mod = record.module;
  const teil = Number(record.teil);
  const lv = 'A2';
  if (mod === 'horen' && [1, 3, 4].includes(teil) && record.segments?.length) {
    return horenSegmentsBatch(record, teil, lv);
  }
  if (mod === 'lesen' && teil === 4) {
    const ads = record.passage?.ads || record.ads || [];
    const passages = ads.map((a, i) => ({
      id: a.passageId || `ad-${a.key || i}`,
      module: 'lesen',
      teil: 4,
      level: lv,
      title: a.title || a.textTitle || '',
      text: a.text || '',
    }));
    return {
      level: lv,
      lang: 'de',
      instruction: record.instruction || '',
      passages,
      questions: (record.questions || []).map((q) => normQ(q, mod, teil, lv)),
    };
  }
  const passage = record.passage || {};
  const pid = record.questions?.[0]?.passageId || passage.passageId || passage.id || `cur-${mod}-t${teil}`;
  const p = {
    id: pid,
    module: mod,
    teil,
    level: lv,
    title: passage.title || '',
    text: passage.text || passage.transcript || '',
    ...(passage.pictures ? { pictures: passage.pictures } : {}),
  };
  return {
    level: lv,
    lang: 'de',
    instruction: record.instruction || '',
    passages: [p],
    questions: (record.questions || []).map((q) => normQ(q, mod, teil, lv, p.id)),
  };
}

function horenT2FromBank(bank, passageId, slug) {
  const passage = (bank.passages || []).find((p) => p.id === passageId);
  if (!passage) return null;
  const questions = (bank.questions || [])
    .filter((q) => q.passageId === passageId)
    .map((q) => ({ ...q, module: 'horen', teil: 2, level: 'A2' }));
  return {
    level: 'A2',
    lang: 'de',
    passages: [{ ...passage, module: 'horen', teil: 2, level: 'A2' }],
    questions,
    topicTag: passage.topicTag,
    _seedSlug: slug,
  };
}

function sprechenBundleFromExam(exam, slug) {
  const taskTypes = ['personal_questions', 'about_self', 'plan_together'];
  const questions = (exam.sprechenParts || []).map((p, i) => ({
    id: `sp-${slug}-t${p.teil}`,
    module: 'sprechen',
    teil: p.teil,
    level: 'A2',
    lang: 'de',
    type: p.taskType || taskTypes[i] || 'short_answer',
    question: p.situation || p.title || '',
    correct: 'rubric',
    correctAnswer: 'rubric',
    topicTags: p.topicTags || [exam.topic],
    options: [],
  }));
  return { level: 'A2', lang: 'de', questions, topicTag: exam.topic };
}

function schreibenBundle(records, slug) {
  const qs = records.flatMap((r) =>
    (r.questions || [{ question: r.instruction || r.task }]).map((q, i) => ({
      id: `sch-${slug}-t${r.teil}-q${i + 1}`,
      module: 'schreiben',
      teil: Number(r.teil),
      level: 'A2',
      lang: 'de',
      type: 'short_answer',
      question: q.question || r.instruction || '',
      correct: 'rubric',
      correctAnswer: 'rubric',
      topicTags: q.topicTags || [slug],
      options: [],
    })),
  );
  return { level: 'A2', lang: 'de', questions: qs, topicTag: slug };
}

function main() {
  ensureLevelStagingDirs('A2');
  const outDir = poolVerifiedDir('A2');
  const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  const bank = JSON.parse(fs.readFileSync(BANK, 'utf8'));
  const exams = JSON.parse(fs.readFileSync(EXAMS, 'utf8'));
  const records = seed.records || [];
  const written = [];

  for (const record of records) {
    const mod = record.module;
    const teil = Number(record.teil);
    if (mod === 'horen' && teil === 2) continue;
    if (mod === 'schreiben') continue;
    const slug = TOPIC_SLUG[record.contributor] || 'misc';
    const name = `${mod}-t${teil}-cur-${slug}.json`;
    const batch = recordToBatch(record);
    written.push({ name, batch });
  }

  const h2Map = {
    health: 'de-a2-p-horen-t2-health-pic01',
    work: 'de-a2-p-horen-t2-work-pic01',
    society: 'de-a2-p-horen-t2-society-pic01',
    education: 'de-a2-p-horen-t2-education-pic01',
  };
  for (const [slug, pid] of Object.entries(h2Map)) {
    const batch = horenT2FromBank(bank, pid, slug);
    if (batch) written.push({ name: `horen-t2-cur-${slug}.json`, batch });
  }

  for (const [contrib, slug] of Object.entries(TOPIC_SLUG)) {
    const sch = records.filter((r) => r.module === 'schreiben' && r.contributor === contrib);
    if (sch.length >= 2) {
      written.push({ name: `schreiben-cur-${slug}.json`, batch: schreibenBundle(sch, slug) });
    }
  }

  for (const exam of exams) {
    const slug = String(exam.topic || 'misc').toLowerCase();
    if ((exam.sprechenParts || []).length >= 3) {
      written.push({ name: `sprechen-cur-${slug}.json`, batch: sprechenBundleFromExam(exam, slug) });
    }
  }

  console.log(`Would write ${written.length} pool-verified/A2 files`);
  if (!apply) {
    console.log(written.map((w) => `  ${w.name}`).join('\n'));
    console.log('[dry-run] Pass --apply');
    return;
  }
  for (const { name, batch } of written) {
    fs.writeFileSync(path.join(outDir, name), `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  }
  console.log(`Applied ${written.length} files → ${path.relative(ROOT, outDir)}`);
}

main();
