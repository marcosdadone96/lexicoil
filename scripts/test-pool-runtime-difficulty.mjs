/**
 * Regression: pool Lesen/Hören get force-recomputed difficulty;
 * Schreiben/Sprechen converters untouched; library scoreQuestion short-circuit intact.
 *
 *   node scripts/test-pool-runtime-difficulty.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');

const DifficultyScorer = require(path.join(ROOT, 'js/engine/validation/difficultyScorer.js'));
const PF = require(path.join(ROOT, 'js/engine/personalLesenPoolFallback.js'));

function load(file) {
  return JSON.parse(fs.readFileSync(path.join(POOL, file), 'utf8'));
}

/** Shape pool-verified batch → reusable part record (same fields converters expect). */
function toLesenPoolPart(batch, file, teil) {
  const passages = batch.passages || [];
  const p0 = passages[0] || {};
  return {
    id: file.replace(/\.json$/i, ''),
    module: 'lesen',
    teil,
    lang: 'de',
    level: 'B1',
    questions: (batch.questions || []).map((q) => ({ ...q })),
    passage: {
      id: p0.id,
      title: p0.title,
      text: p0.text || '',
      textB: passages[1]?.text,
      passages: passages.length >= 2
        ? passages.map((p, i) => ({
            passageId: p.id || String.fromCharCode(65 + i),
            title: p.title,
            text: p.text || '',
          }))
        : undefined,
    },
    ads: batch.ads,
  };
}

function toHorenPoolPart(batch, file, teil) {
  const passages = batch.passages || [];
  const questions = (batch.questions || []).map((q) => ({ ...q }));
  const segments =
    passages.length > 1
      ? passages.map((p, i) => ({
          id: p.id || `seg_${i}`,
          label: p.title || `Aufnahme ${i + 1}`,
          transcript: p.transcript || p.text || '',
          passageId: p.id || null,
          questions: questions.filter((q) => !q.passageId || q.passageId === p.id),
        }))
      : undefined;
  // If segment filter emptied questions, put all on first seg
  if (segments?.length && segments.every((s) => !(s.questions || []).length)) {
    segments[0].questions = questions;
  }
  return {
    id: file.replace(/\.json$/i, ''),
    module: 'horen',
    teil,
    lang: 'de',
    level: 'B1',
    questions,
    segments,
    passage: {
      id: passages[0]?.id,
      text: passages[0]?.transcript || passages[0]?.text || '',
      transcript: passages[0]?.transcript || passages[0]?.text || '',
      segments,
    },
  };
}

function collectDiffs(part) {
  const out = [];
  for (const q of part.questions || []) {
    out.push({ id: q.id, difficulty: q.difficulty, where: 'questions' });
  }
  for (const it of part.items || []) {
    out.push({ id: it.id, difficulty: it.difficulty, where: 'items' });
  }
  for (const seg of part.segments || []) {
    for (const q of seg.questions || []) {
      out.push({ id: q.id, difficulty: q.difficulty, where: `seg:${seg.id}` });
    }
  }
  return out;
}

function pickFiles(prefix, n) {
  return fs
    .readdirSync(POOL)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .sort()
    .slice(0, n);
}

const report = {
  generatedAt: new Date().toISOString(),
  a_lesenHoren: [],
  b_schreibenSprechen: [],
  c_libraryShortCircuit: null,
  pass: true,
  failures: [],
};

// --- A) Lesen ×5 + Hören ×5 ---
const lesenFiles = [
  ...pickFiles('lesen-t1-', 1),
  ...pickFiles('lesen-t2-', 1),
  ...pickFiles('lesen-t4-', 1),
  ...pickFiles('lesen-t5-', 2),
].slice(0, 5);
const horenFiles = [
  ...pickFiles('horen-t1-', 1),
  ...pickFiles('horen-t2-', 2),
  ...pickFiles('horen-t3-', 1),
  ...pickFiles('horen-t4-', 1),
].slice(0, 5);

for (const file of lesenFiles) {
  const batch = load(file);
  const teil = Number(file.match(/lesen-t(\d)/i)[1]);
  const persisted = (batch.questions || [])
    .map((q) => q.difficulty)
    .filter((d) => d != null);
  const part = PF.reusablePartToLesenPart(toLesenPoolPart(batch, file, teil));
  const served = collectDiffs(part);
  const allConst4 =
    persisted.length > 0 &&
    persisted.every((d) => d === 4) &&
    served.length > 0 &&
    served.every((s) => s.difficulty === 4);
  const variesOrDiffers =
    served.length > 0 &&
    (new Set(served.map((s) => s.difficulty)).size > 1 ||
      served.some((s) => s.difficulty !== 4));
  // If scorer happens to return 4 for all, still OK if forceRecompute ran —
  // detect recompute by comparing to stem-only forced score with empty passage vs with passage,
  // OR require at least one != persisted when persisted were uniform.
  // Stronger check: scoreQuestion with forceRecompute on first q must equal served.
  const q0 = served[0];
  const ok =
    served.length > 0 &&
    served.every((s) => s.difficulty >= 1 && s.difficulty <= 10) &&
    (variesOrDiffers || !allConst4 || served.some((s) => s.difficulty !== persisted[0]));
  // Even if all scored 4, verify forceRecompute path: shortCircuit would return persisted;
  // call scoreQuestion WITHOUT force on a clone that still has difficulty 4 — same;
  // WITH force and passage should be what we served.
  const sampleQ = (part.questions || part.items || [])[0];
  let forceMatches = true;
  if (sampleQ) {
    const pt = DifficultyScorer.passageTextForPoolQuestion(part, sampleQ);
    const forced = DifficultyScorer.scoreQuestion(sampleQ, null, 'B1', 'de', {
      forceRecompute: true,
      passageText: pt,
    });
    forceMatches = forced === sampleQ.difficulty;
  }
  const row = {
    file,
    module: 'lesen',
    persistedSample: persisted.slice(0, 3),
    served: served.slice(0, 5),
    variesOrDiffersFromTemplate4: variesOrDiffers,
    forceRecomputeMatchesServed: forceMatches,
  };
  report.a_lesenHoren.push(row);
  if (!forceMatches || !served.length) {
    report.pass = false;
    report.failures.push(`lesen ${file}: force/serve mismatch or empty`);
  }
  // Must NOT be "blindly copied template" when scorer disagrees
  if (allConst4 && sampleQ) {
    const pt = DifficultyScorer.passageTextForPoolQuestion(part, sampleQ);
    const forced = DifficultyScorer.scoreQuestion(
      { ...sampleQ, difficulty: 4 },
      null,
      'B1',
      'de',
      { forceRecompute: true, passageText: pt },
    );
    const shorted = DifficultyScorer.scoreQuestion(
      { ...sampleQ, difficulty: 4 },
      null,
      'B1',
      'de',
      {},
    );
    if (forced !== 4 && sampleQ.difficulty === 4) {
      report.pass = false;
      report.failures.push(`lesen ${file}: still serving template 4 but scorer wants ${forced}`);
    }
    if (shorted !== 4) {
      report.pass = false;
      report.failures.push(`lesen ${file}: short-circuit broken`);
    }
  }
}

for (const file of horenFiles) {
  const batch = load(file);
  const teil = Number(file.match(/horen-t(\d)/i)[1]);
  const persisted = (batch.questions || [])
    .map((q) => q.difficulty)
    .filter((d) => d != null);
  const part = PF.reusablePartToHorenPart(toHorenPoolPart(batch, file, teil));
  const served = collectDiffs(part);
  const sampleQ =
    (part.segments || []).flatMap((s) => s.questions || [])[0] ||
    (part.questions || [])[0];
  let forceMatches = !!sampleQ;
  if (sampleQ) {
    const pt = DifficultyScorer.passageTextForPoolQuestion(part, sampleQ);
    const forced = DifficultyScorer.scoreQuestion(sampleQ, null, 'B1', 'de', {
      forceRecompute: true,
      passageText: pt,
    });
    forceMatches = forced === sampleQ.difficulty;
  }
  const variesOrDiffers =
    served.length > 0 &&
    (new Set(served.map((s) => s.difficulty)).size > 1 ||
      served.some((s) => s.difficulty !== 5));
  report.a_lesenHoren.push({
    file,
    module: 'horen',
    persistedSample: persisted.slice(0, 3),
    served: served.slice(0, 5),
    variesOrDiffersFromTemplate5: variesOrDiffers,
    forceRecomputeMatchesServed: forceMatches,
  });
  if (!forceMatches || !served.length) {
    report.pass = false;
    report.failures.push(`horen ${file}: force/serve mismatch or empty`);
  }
  // At least some of the 5+5 should differ from template (aggregate check later)
}

const lhDiffer = report.a_lesenHoren.filter(
  (r) => r.variesOrDiffersFromTemplate4 || r.variesOrDiffersFromTemplate5,
);
if (lhDiffer.length < 1) {
  report.pass = false;
  report.failures.push(
    'expected at least one Lesen/Hören sample to differ from constant template 4/5',
  );
}

// --- B) Schreiben ×3 + Sprechen ×3: converters must not attach scored difficulty ---
const schFiles = pickFiles('schreiben-', 3);
const sprFiles = pickFiles('sprechen-', 3);
for (const file of schFiles) {
  const batch = load(file);
  const teil = 1;
  const part = PF.reusablePartToSchreibenPart(
    {
      id: file,
      teil,
      questions: batch.questions,
      passage: batch.passages?.[0],
      task: batch.questions?.find((q) => Number(q.teil) === teil)?.question,
    },
    null,
  );
  const templateDiff = batch.questions?.find((q) => Number(q.teil) === teil)?.difficulty;
  const row = {
    file,
    module: 'schreiben',
    poolQuestionDifficulty: templateDiff,
    partHasDifficultyField: Object.prototype.hasOwnProperty.call(part, 'difficulty'),
    partKeys: Object.keys(part).sort(),
  };
  report.b_schreibenSprechen.push(row);
  if (part.difficulty != null) {
    report.pass = false;
    report.failures.push(`schreiben ${file}: unexpected part.difficulty=${part.difficulty}`);
  }
  if (templateDiff !== 6 && templateDiff != null) {
    // pool template for schreiben is 6; note if missing
    row.note = `pool difficulty was ${templateDiff}, expected template 6`;
  }
}
for (const file of sprFiles) {
  const batch = load(file);
  const teil = 2;
  const q = batch.questions?.find((q) => Number(q.teil) === teil) || batch.questions?.[0];
  const part = PF.reusablePartToSprechenPart(
    {
      id: file,
      teil,
      questions: [q],
      situation: q?.question,
    },
    null,
  );
  const templateDiff = q?.difficulty;
  report.b_schreibenSprechen.push({
    file,
    module: 'sprechen',
    poolQuestionDifficulty: templateDiff,
    partHasDifficultyField: Object.prototype.hasOwnProperty.call(part, 'difficulty'),
    partKeys: Object.keys(part).sort(),
  });
  if (part.difficulty != null) {
    report.pass = false;
    report.failures.push(`sprechen ${file}: unexpected part.difficulty=${part.difficulty}`);
  }
  if (templateDiff !== 5) {
    report.b_schreibenSprechen[report.b_schreibenSprechen.length - 1].note =
      `pool difficulty was ${templateDiff}, expected template 5`;
  }
}

// --- C) Library path short-circuit unchanged (no forceRecompute) ---
const libQ = {
  id: 'lib-q',
  question: 'Was ist richtig?',
  difficulty: 7,
};
const shorted = DifficultyScorer.scoreQuestion(libQ, null, 'B1', 'de');
const forced = DifficultyScorer.scoreQuestion(libQ, null, 'B1', 'de', {
  forceRecompute: true,
  passageText: 'Kurzer Text.',
});
const applied = DifficultyScorer.applyToQuestions([libQ], null, 'B1', 'de');
report.c_libraryShortCircuit = {
  scoreQuestionDefaultReturnsPersisted: shorted,
  expectedPersisted: 7,
  applyToQuestionsDefault: applied[0].difficulty,
  forceRecomputeCanOverride: forced !== 7 || forced === DifficultyScorer.scoreText('Kurzer Text. Was ist richtig?', 'B1', 'de'),
  forcedValue: forced,
};
if (shorted !== 7 || applied[0].difficulty !== 7) {
  report.pass = false;
  report.failures.push('library short-circuit broken');
}

const out = path.join(
  ROOT,
  'batches/ready/gate-logs/pool-runtime-difficulty-test-2026-07-11.json',
);
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.log(report.pass ? '\nPASS' : '\nFAIL');
console.log('Wrote', out);
process.exit(report.pass ? 0 : 1);
