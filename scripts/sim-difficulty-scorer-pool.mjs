/**
 * Simulate DifficultyScorer on pool questions WITHOUT touching files.
 * Compares persisted difficulty vs forced recalculation (difficulty stripped).
 *
 *   node scripts/sim-difficulty-scorer-pool.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CefrGate = require('../js/engine/validation/CefrGate.js');
const DifficultyScorer = require('../js/engine/validation/difficultyScorer.js');

const POOL = path.join(__dirname, '../batches/ready/pool-verified');

const SAMPLES = [
  { file: 'lesen-t1-gemini-149.json', qIndex: 0, module: 'lesen', teil: 1 },
  { file: 'lesen-t2-gemini-055.json', qIndex: 0, module: 'lesen', teil: 2 },
  { file: 'lesen-t4-gemini-006.json', qIndex: 0, module: 'lesen', teil: 4 },
  { file: 'lesen-t5-gemini-050.json', qIndex: 1, module: 'lesen', teil: 5 },
  { file: 'horen-t1-gemini-016.json', qIndex: 0, module: 'horen', teil: 1 },
  { file: 'horen-t2-gemini-001.json', qIndex: 0, module: 'horen', teil: 2 },
  { file: 'horen-t3-gemini-004.json', qIndex: 0, module: 'horen', teil: 3 },
  { file: 'horen-t4-gemini-008.json', qIndex: 0, module: 'horen', teil: 4 },
  { file: 'schreiben-gemini-005.json', qIndex: 2, module: 'schreiben', teil: 3 }, // T3
  { file: 'sprechen-gemini-001.json', qIndex: 1, module: 'sprechen', teil: 2 },
];

function passageTextForQuestion(batch, q) {
  const passages = batch.passages || [];
  if (!passages.length) return '';
  if (q.passageId) {
    const hit = passages.find((p) => p.id === q.passageId);
    if (hit) return hit.text || hit.transcript || hit.signText || '';
  }
  // Hören multi-segment / default first
  if (passages.length === 1) return passages[0].text || passages[0].transcript || '';
  // concatenate for matching / multi
  return passages
    .map((p) => p.text || p.transcript || p.signText || '')
    .filter(Boolean)
    .join('\n');
}

function scoreForced(q, passageText, level, lang) {
  // Mirror scoreQuestion WITHOUT short-circuit and WITH passage (as PassageResolver would)
  const text = `${passageText || ''} ${q.question || q.prompt || q.situation || ''}`.trim();
  let score = DifficultyScorer.scoreText(text, level, lang);
  if (q.inferenceLevel === 'inference' || q.inferenceLevel === 'global') {
    score = Math.max(1, Math.min(10, score + 1));
  }
  return score;
}

function scoreViaScoreQuestionStripped(q, level, lang) {
  const clone = { ...q };
  delete clone.difficulty;
  // No PassageResolver in Node → only stem (documents current Node-path limitation)
  return DifficultyScorer.scoreQuestion(clone, null, level, lang);
}

const rows = [];
for (const s of SAMPLES) {
  const fp = path.join(POOL, s.file);
  if (!fs.existsSync(fp)) {
    rows.push({ ...s, error: 'missing file' });
    continue;
  }
  const batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const q = (batch.questions || [])[s.qIndex];
  if (!q) {
    rows.push({ ...s, error: 'missing question' });
    continue;
  }
  const persisted = q.difficulty ?? null;
  const passage = passageTextForQuestion(batch, q);
  const metrics = CefrGate.validatePassage(
    `${passage} ${q.question || q.prompt || ''}`.trim(),
    { level: 'B1', lang: 'de' },
  ).metrics;
  const scoredWithPassage = scoreForced(q, passage, 'B1', 'de');
  const scoredStemOnly = scoreViaScoreQuestionStripped(q, 'B1', 'de');
  const shortCircuit = DifficultyScorer.scoreQuestion(q, null, 'B1', 'de');

  rows.push({
    file: s.file,
    module: s.module,
    teil: s.teil,
    qId: q.id,
    persisted,
    shortCircuitReturnsPersisted: shortCircuit,
    scoredStemOnly_noPassageResolver: scoredStemOnly,
    scoredWithPassage_realistic: scoredWithPassage,
    deltaVsPersisted: scoredWithPassage - (persisted ?? 0),
    metrics: {
      wordCount: metrics.wordCount,
      avgSentenceLen: metrics.avgSentenceLen,
      subordinatePct: metrics.subordinatePct,
      coverageVsLevel: metrics.coverageVsLevel,
      vocabListSize: metrics.vocabListSize,
    },
    passageChars: passage.length,
    questionPreview: String(q.question || q.prompt || '').slice(0, 80),
  });
}

// Also: if we strip difficulty, does ExamBuilder path matter for pool?
const OUT = path.join(
  __dirname,
  '../batches/ready/gate-logs/difficulty-scorer-sim-2026-07-11.json',
);
const report = {
  generatedAt: new Date().toISOString(),
  scorerSignals:
    'scoreMetrics(B1 mid=4): avgSentenceLen, coverageVsLevel (<85 penalty), subordinatePct (>20 penalty), wordCount (>300 penalty); +1 if inferenceLevel inference/global',
  invocation: {
    libraryExamBuilder: 'ExamBuilder.applyExamDifficulty → applyToQuestions on all parts (buildExam path)',
    poolPersonalPath: 'assembleModuleFromPool does NOT call DifficultyScorer; copies q.difficulty from pool JSON',
    shortCircuit:
      'scoreQuestion L67-70: if q.difficulty != null && >=1 && <=10 return q.difficulty',
  },
  point2:
    'Deleting difficulty alone is NOT enough for pool-verified serve path: assembleModuleFromPool never invokes the scorer. Library QuestionLibrary.buildExam WOULD recalculate via applyExamDifficulty. So Option A requires wiring applyExamDifficulty (or equivalent) into the pool assembly path too.',
  samples: rows,
  summary: {
    n: rows.filter((r) => !r.error).length,
    avgAbsDelta: (() => {
      const ok = rows.filter((r) => !r.error && r.persisted != null);
      if (!ok.length) return null;
      return (
        Math.round(
          (10 * ok.reduce((s, r) => s + Math.abs(r.deltaVsPersisted), 0)) / ok.length,
        ) / 10
      );
    })(),
    deltas: rows.filter((r) => !r.error).map((r) => ({
      file: r.file,
      persisted: r.persisted,
      scored: r.scoredWithPassage_realistic,
      delta: r.deltaVsPersisted,
    })),
  },
};

fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.samples.map((r) => ({
  file: r.file,
  persisted: r.persisted,
  shortCircuit: r.shortCircuitReturnsPersisted,
  stemOnly: r.scoredStemOnly_noPassageResolver,
  withPassage: r.scoredWithPassage_realistic,
  delta: r.deltaVsPersisted,
  metrics: r.metrics,
})), null, 2));
console.log('\navgAbsDelta', report.summary.avgAbsDelta);
console.log('Wrote', OUT);
