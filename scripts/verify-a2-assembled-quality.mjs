#!/usr/bin/env node
/**
 * Post-reenrich checks on assembled A2 verified exams (embedded exam body).
 *   node scripts/verify-a2-assembled-quality.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { extractDialoguePairs, pairKey, DIALOGUE_HOT_PAIRS } from './lib/dialogueNamesBank.mjs';
import {
  isGenericLesenA2T4QuestionStem,
  hasLesenA2T4PersonSituation,
} from './lib/lesenA2T4Situations.mjs';

function isLesenA2T4SpecificStem(stem) {
  if (isGenericLesenA2T4QuestionStem(stem)) return false;
  if (hasLesenA2T4PersonSituation(stem)) return true;
  const s = String(stem || '').trim();
  return s.length >= 30 && /\b(Museum|Museen|Besucher|Eintritt|Anzeige|Unternehmen|Wochenende)\b/i.test(s);
}
import { runGermanContentLanguageGate } from './lib/qualityGates/germanContentLanguageGate.mjs';

const asmDir = path.join(ROOT, 'batches/ready/assembled-from-verified');
const slots = [1, 2, 3, 4];
const report = { at: new Date().toISOString(), exams: [], ok: true };

function collectExamText(exam) {
  return JSON.stringify(exam);
}

for (const slot of slots) {
  const fp = path.join(asmDir, `assembled-exam-a2-verified-e${slot}.json`);
  const doc = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const exam = doc.exam || {};
  const text = collectExamText(exam);
  const b1Grammar = (text.match(/g-de-b1-/g) || []).length;
  const lesenT4 = (exam.lesenParts || []).find((p) => Number(p.teil) === 4);
  const t4Questions = (lesenT4?.questions || lesenT4?.items || []).map((q) => ({
    id: q.id,
    question: String(q.question || '').trim(),
    generic: isGenericLesenA2T4QuestionStem(q.question),
    personSitu: hasLesenA2T4PersonSituation(q.question),
    specific: isLesenA2T4SpecificStem(q.question),
  }));
  const hot = [];
  for (const [a, b] of extractDialoguePairs({ passages: exam.horenParts || [], questions: [] })) {
    const k = pairKey(a, b);
    if (DIALOGUE_HOT_PAIRS.has(k)) hot.push(k);
  }
  for (const hp of exam.horenParts || []) {
    for (const [a, b] of extractDialoguePairs({ passages: [hp], questions: hp.questions || [] })) {
      const k = pairKey(a, b);
      if (DIALOGUE_HOT_PAIRS.has(k)) hot.push(k);
    }
  }
  const langBatch = { passages: [], questions: [] };
  for (const mod of ['lesenParts', 'horenParts', 'schreibenParts', 'sprechenParts']) {
    for (const p of exam[mod] || []) {
      for (const q of p.questions || p.items || []) langBatch.questions.push(q);
      if (p.text) langBatch.passages = langBatch.passages || [];
      if (p.text) langBatch.passages.push({ text: p.text });
    }
  }
  const langFull = runGermanContentLanguageGate(langBatch, { file: `assembled-e${slot}-full`, lang: 'de' });

  const row = {
    slot,
    b1GrammarTagCount: b1Grammar,
    lesenT4Questions: t4Questions,
    lesenT4AllSpecific: t4Questions.every((q) => q.specific),
    hotPairs: [...new Set(hot)],
    languageFindings: langFull.findings?.length || 0,
  };
  if (b1Grammar > 0 || row.hotPairs.length || !row.lesenT4AllSpecific || row.languageFindings > 0) {
    report.ok = false;
  }
  report.exams.push(row);
}

const out = path.join(ROOT, 'batches/ready/gate-logs/a2-assembled-quality-verify.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
console.log('Wrote', path.relative(ROOT, out));
process.exitCode = report.ok ? 0 : 1;
