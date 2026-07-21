/**
 * Retroactive: align explanation option-letter mentions to `correct` in pool-verified.
 * Only rewrites explanation text when mentioned letter ≠ correct.
 * Does not touch options or correct.
 *
 *   node scripts/repair-pool-explanation-option-letters.mjs
 *   node scripts/repair-pool-explanation-option-letters.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  alignExplanationOptionLetters,
  findExplanationOptionLetters,
} = require('../js/engine/prompts/explanationOptionResync.js');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const dryRun = process.argv.includes('--dry-run');

function normalizeCorrect(c) {
  const s = String(c ?? '').trim().toLowerCase();
  const m = s.match(/^([abc])\b/);
  return m ? m[1] : null;
}

const report = { scanned: 0, filesTouched: [], desyncFixed: [], syncLeftAlone: [], stillDesync: [] };

for (const name of fs.readdirSync(POOL).filter((n) => n.endsWith('.json')).sort()) {
  report.scanned++;
  const file = path.join(POOL, name);
  const batch = JSON.parse(fs.readFileSync(file, 'utf8'));
  let fileChanged = false;
  for (const q of batch.questions || []) {
    const correct = normalizeCorrect(q.correct ?? q.correctAnswer);
    const before = String(q.explanation || '');
    const hits = findExplanationOptionLetters(before);
    if (!hits.length) continue;
    if (!correct) continue;

    const syncHits = hits.filter((h) => h.letter === correct);
    const desyncHits = hits.filter((h) => h.letter !== correct);

    if (desyncHits.length === 0) {
      report.syncLeftAlone.push({
        file: name,
        qid: q.id,
        letter: syncHits[0]?.letter,
        explanation: before,
      });
      continue;
    }

    const { explanation, changed, fixes } = alignExplanationOptionLetters(before, correct);
    if (!changed) {
      report.stillDesync.push({ file: name, qid: q.id, hits: desyncHits, correct });
      continue;
    }
    q.explanation = explanation;
    fileChanged = true;
    report.desyncFixed.push({
      file: name,
      qid: q.id,
      correct,
      fixes,
      before,
      after: explanation,
    });
  }
  if (fileChanged && !dryRun) {
    fs.writeFileSync(file, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
    report.filesTouched.push(name);
  } else if (fileChanged) {
    report.filesTouched.push(`${name} (dry-run)`);
  }
}

const outPath = path.join(ROOT, 'batches/ready/gate-logs/repair-expl-option-letters-2026-07-11.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({
  dryRun,
  scanned: report.scanned,
  filesTouched: report.filesTouched,
  desyncFixed: report.desyncFixed.map((x) => ({
    file: x.file,
    qid: x.qid,
    correct: x.correct,
    fixes: x.fixes,
    before: x.before,
    after: x.after,
  })),
  syncLeftAlone: report.syncLeftAlone.map((x) => ({
    file: x.file,
    qid: x.qid,
    letter: x.letter,
  })),
  stillDesync: report.stillDesync,
}, null, 2));
console.log('report →', outPath);
