#!/usr/bin/env node
/**
 * Reprocess Schreiben A2 backlog:
 *  1) dedup skills[]
 *  2) unify correct/correctAnswer → "rubric"/"rubric" (preserve examples in explanation)
 *  3) normalize rubric → { content, vocabulary, grammar, coherence, length? }
 *
 * Does NOT regenerate content or invent model answers.
 *
 *   node scripts/reprocess-schreiben-a2-backlog.mjs
 *   node scripts/reprocess-schreiben-a2-backlog.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedupSkillsInBatch } from './lib/dedupSkills.mjs';
import {
  normalizeSchreibenCorrectFields,
  normalizeSchreibenRubric,
} from './lib/normalizeSchreibenRubric.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MERGED = path.join(ROOT, 'batches', 'merged');
const dryRun = process.argv.includes('--dry-run');

function isA2Schreiben(batch, filename) {
  if (!/^schreiben/i.test(filename)) return false;
  const level = String(batch.level || batch.questions?.[0]?.level || '').toUpperCase();
  return level === 'A2';
}

function reprocessQuestion(q) {
  let out = normalizeSchreibenCorrectFields(q);
  if (out.type === 'schreiben' || out.type === 'rubric' || !out.type) {
    out = { ...out, type: 'short_answer' };
  }
  if (out.rubric != null) {
    const rubric = normalizeSchreibenRubric(out.rubric);
    if (rubric) out = { ...out, rubric };
    else {
      out = { ...out };
      delete out.rubric;
    }
  }
  return out;
}

function situationSlug(filename) {
  return filename
    .replace(/^schreiben-/i, '')
    .replace(/-\d+\.json$/i, '')
    .replace(/\.json$/i, '');
}

const files = fs
  .readdirSync(MERGED)
  .filter((f) => f.endsWith('.json') && /^schreiben/i.test(f))
  .sort();

let filesTouched = 0;
let skillsDupTotal = 0;
let correctFixed = 0;
let rubricFixed = 0;
const situations = new Map();
const noExampleMoved = [];

for (const filename of files) {
  const abs = path.join(MERGED, filename);
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (!isA2Schreiben(raw, filename)) continue;

  const sit = situationSlug(filename);
  if (!situations.has(sit)) situations.set(sit, []);
  situations.get(sit).push(filename);

  const { batch: deduped, skillsDupRemoved } = dedupSkillsInBatch(raw);
  skillsDupTotal += skillsDupRemoved;

  let fileCorrectFixed = 0;
  let fileRubricFixed = 0;
  let fileTypeFixed = 0;
  const questions = (deduped.questions || []).map((q) => {
    const beforeCorrect = JSON.stringify({ c: q.correct, ca: q.correctAnswer });
    const beforeRubric = JSON.stringify(q.rubric ?? null);
    const beforeType = q.type;
    const beforeExpl = q.explanation;

    // Detect broken cases with no model text to relocate
    const caEmpty =
      q.correctAnswer == null ||
      q.correctAnswer === '' ||
      (typeof q.correctAnswer === 'string' && q.correctAnswer.toLowerCase() === 'rubric');
    const hasBeispielInExpl = typeof q.explanation === 'string' && /beispiel\s*:/i.test(q.explanation);
    if (
      (q.correct === true || q.correct === '' || q.correct == null) &&
      caEmpty &&
      !hasBeispielInExpl
    ) {
      noExampleMoved.push(`${filename}#${q.id || q.teil}`);
    }

    const out = reprocessQuestion(q);
    if (JSON.stringify({ c: out.correct, ca: out.correctAnswer }) !== beforeCorrect) {
      fileCorrectFixed++;
      correctFixed++;
    }
    if (JSON.stringify(out.rubric ?? null) !== beforeRubric) {
      fileRubricFixed++;
      rubricFixed++;
    }
    if (out.type !== beforeType) fileTypeFixed++;
    // Ensure we did not drop explanation text
    if (beforeExpl && (!out.explanation || out.explanation.length < String(beforeExpl).length)) {
      throw new Error(`explanation shrunk in ${filename} ${q.id}`);
    }
    return out;
  });

  const cleaned = { ...deduped, questions };
  const changed = skillsDupRemoved > 0 || fileCorrectFixed > 0 || fileRubricFixed > 0 || fileTypeFixed > 0;

  if (changed) {
    filesTouched++;
    console.log(
      `${filename}: skillsDupRemoved=${skillsDupRemoved} correctFixed=${fileCorrectFixed} rubricFixed=${fileRubricFixed} typeFixed=${fileTypeFixed}${dryRun ? ' (dry-run)' : ''}`,
    );
    if (!dryRun) {
      fs.writeFileSync(abs, `${JSON.stringify(cleaned, null, 2)}\n`, 'utf8');
    }
  } else {
    console.log(`${filename}: already clean`);
  }
}

// Post-check
let remainingSkillDups = 0;
let remainingBadCorrect = 0;
let remainingBadRubric = 0;
const a2Files = [];
for (const filename of files) {
  const abs = path.join(MERGED, filename);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (!isA2Schreiben(batch, filename)) continue;
  a2Files.push(filename);
  for (const q of batch.questions || []) {
    const skills = (q.skills || []).map((s) => String(s).toLowerCase());
    if (skills.length !== new Set(skills).size) remainingSkillDups++;
    if (q.correct !== 'rubric' || q.correctAnswer !== 'rubric') remainingBadCorrect++;
    if (q.rubric != null) {
      if (typeof q.rubric !== 'object' || Array.isArray(q.rubric)) remainingBadRubric++;
      else {
        const keys = Object.keys(q.rubric);
        const allowed = new Set(['content', 'vocabulary', 'grammar', 'coherence', 'length']);
        if (keys.some((k) => !allowed.has(k))) remainingBadRubric++;
      }
    }
  }
}

console.log('\n── Summary ──');
console.log(`a2Files: ${a2Files.length}`);
console.log(`filesTouched: ${filesTouched}`);
console.log(`skillsDupTotal: ${skillsDupTotal}`);
console.log(`correctFixed: ${correctFixed}`);
console.log(`rubricFixed: ${rubricFixed}`);
console.log(`remainingSkillDups: ${remainingSkillDups}`);
console.log(`remainingBadCorrect: ${remainingBadCorrect}`);
console.log(`remainingBadRubric: ${remainingBadRubric}`);
console.log(
  'situations:',
  [...situations.entries()]
    .map(([k, v]) => `${k}×${v.length}`)
    .sort()
    .join(', '),
);
if (noExampleMoved.length) {
  console.log(
    'note: no model-answer text to relocate (explanation had no Beispiel; left as-is):',
    noExampleMoved.join(', '),
  );
}

if (!dryRun && (remainingSkillDups || remainingBadCorrect || remainingBadRubric)) {
  process.exit(1);
}
console.log(dryRun ? 'DRY-RUN OK' : 'OK: Schreiben A2 backlog normalized');
