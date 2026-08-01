#!/usr/bin/env node
/**
 * Repara Lesen T4 A2: pool society + banco completo (pfand-02, vier-tage-woche-01-q1, …).
 *   node scripts/repair-a2-lesen-t4-situations.mjs --apply
 *   node scripts/repair-a2-lesen-t4-situations.mjs --apply --health-only
 *   node scripts/repair-a2-lesen-t4-situations.mjs --apply --society-only
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import {
  applyVegetarismusSchule02Situations,
  applyPfandErhoehung02Situations,
  patchBankLesenT4Situations,
  listGenericLesenT4BankQuestions,
  isGenericLesenA2T4QuestionStem,
  hasLesenA2T4PersonSituation,
} from './lib/lesenA2T4Situations.mjs';
import { syncPoolVerifiedBatch } from './lib/autoSyncPersonalPoolLib.mjs';

const apply = process.argv.includes('--apply');
const healthOnly = process.argv.includes('--health-only');
const societyOnly = process.argv.includes('--society-only');
const bankPath = path.join(ROOT, 'library/de/A2/questions.json');

function verifyQuestions(questions, label) {
  const rows = (questions || []).map((q) => {
    const stem = String(q.question || '').trim();
    return {
      id: q.id,
      generic: isGenericLesenA2T4QuestionStem(stem),
      personSitu: hasLesenA2T4PersonSituation(stem),
      correct: q.correct || q.correctAnswer,
    };
  });
  const xCount = rows.filter((r) => String(r.correct).toUpperCase() === 'X').length;
  return {
    label,
    pass: rows.every((r) => !r.generic && r.personSitu) && xCount === 1,
    personSituCount: rows.filter((r) => r.personSitu).length,
    xCount,
    rows,
  };
}

async function syncPool(rel) {
  const fp = path.join(ROOT, rel);
  const batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
  await syncPoolVerifiedBatch({
    file: fp,
    batch,
    level: 'A2',
    opts: { lang: 'de', module: 'lesen', teil: 4, syncBlobs: false },
  });
}

const report = {
  at: new Date().toISOString(),
  apply,
  pool: {},
  bank: { genericBefore: 0, genericAfter: 0, patchedCount: 0 },
};

const runHealth = !societyOnly;
const runSociety = !healthOnly;

if (runHealth) {
  const poolFile = path.join(ROOT, 'batches/ready/pool-verified/A2/lesen-t4-cur-health.json');
  let batch = JSON.parse(fs.readFileSync(poolFile, 'utf8'));
  report.pool.health = { before: verifyQuestions(batch.questions, 'health-before') };
  if (apply) {
    batch.questions = applyVegetarismusSchule02Situations(batch.questions);
    batch._lesenT4SituationRepairAt = report.at;
    fs.writeFileSync(poolFile, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
    await syncPool('batches/ready/pool-verified/A2/lesen-t4-cur-health.json');
  }
  batch = JSON.parse(fs.readFileSync(poolFile, 'utf8'));
  report.pool.health.after = verifyQuestions(batch.questions, 'health-after');
}

if (runSociety) {
  const poolFile = path.join(ROOT, 'batches/ready/pool-verified/A2/lesen-t4-cur-society.json');
  let batch = JSON.parse(fs.readFileSync(poolFile, 'utf8'));
  report.pool.society = { before: verifyQuestions(batch.questions, 'society-before') };
  if (apply) {
    batch.questions = applyPfandErhoehung02Situations(batch.questions);
    batch._lesenT4SituationRepairAt = report.at;
    batch._lesenT4SituationRepairNote = 'pfand-erhoehung-02 mini-situaciones (persona+Bedarf)';
    fs.writeFileSync(poolFile, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
    await syncPool('batches/ready/pool-verified/A2/lesen-t4-cur-society.json');
  }
  batch = JSON.parse(fs.readFileSync(poolFile, 'utf8'));
  report.pool.society.after = verifyQuestions(batch.questions, 'society-after');
}

const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
report.bank.genericBefore = listGenericLesenT4BankQuestions(bank).length;

if (apply) {
  report.bank.patchedCount = patchBankLesenT4Situations(bank);
  fs.writeFileSync(bankPath, `${JSON.stringify(bank, null, 2)}\n`, 'utf8');
}

report.bank.genericAfter = listGenericLesenT4BankQuestions(
  apply ? bank : JSON.parse(fs.readFileSync(bankPath, 'utf8')),
).length;

const out = path.join(ROOT, 'batches/ready/gate-logs/a2-lesen-t4-situation-repair-evidence.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));

if (apply) {
  const fail =
    (runSociety && !report.pool.society?.after?.pass) ||
    (runHealth && !report.pool.health?.after?.pass) ||
    report.bank.genericAfter > 0;
  if (fail) process.exit(1);
}
