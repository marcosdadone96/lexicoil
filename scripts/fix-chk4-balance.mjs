#!/usr/bin/env node
/**
 * fix-chk4-balance.mjs — Shuffles MC option order to fix CHK-4 balance.
 *
 * Strategy: for each multiple_choice question, strips letter prefixes from
 * options, shuffles all option texts, re-adds prefixes, and updates both
 * `correct` AND `correctAnswer` to the new letter of the originally-correct text.
 * Tries up to 100 random shuffles to achieve ≤50% per letter.
 *
 * Usage: node scripts/fix-chk4-balance.mjs <file.json> [...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LETTERS = ['a', 'b', 'c', 'd', 'e'];

/** Strip leading "a) " / "a." / "a - " etc. from option text */
function stripPrefix(opt) {
  return String(opt).replace(/^[a-eA-E][).:\-]\s*/, '').trim();
}

/** Add standard "x) " prefix */
function addPrefix(letter, text) {
  return `${letter}) ${text}`;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getCorrectLetter(q) {
  const v = (q.correct ?? q.correctAnswer ?? '').toString().toLowerCase();
  return LETTERS.includes(v) ? v : null;
}

function countDist(qs) {
  const dist = {};
  for (const q of qs) {
    const k = getCorrectLetter(q);
    if (k) dist[k] = (dist[k] || 0) + 1;
  }
  return dist;
}

function maxPct(dist, total) {
  if (total === 0) return 0;
  return Math.max(0, ...Object.values(dist).map(v => v / total * 100));
}

/**
 * Shuffle the options of a single MC question.
 * Returns the mutated question object with updated options + correct + correctAnswer.
 */
function shuffleQuestion(q) {
  const corrLetter = getCorrectLetter(q);
  if (!corrLetter || !Array.isArray(q.options)) return q;

  const corrIdx = LETTERS.indexOf(corrLetter);
  if (corrIdx < 0 || corrIdx >= q.options.length) return q;

  // Strip prefixes to get raw texts
  const raw = q.options.map(stripPrefix);
  const correctText = raw[corrIdx];

  // Shuffle
  const shuffled = shuffle(raw);

  // Find new index of the correct text
  const newIdx = shuffled.indexOf(correctText);
  if (newIdx < 0) return q; // safety

  const newLetter = LETTERS[newIdx];
  q.options = shuffled.map((t, i) => addPrefix(LETTERS[i], t));
  q.correct = newLetter;
  q.correctAnswer = newLetter;
  return q;
}

/**
 * Iteratively shuffle MC questions in the batch until balance ≤ 50%.
 * Only shuffles questions whose letter is currently dominant.
 */
function rebalance(questions, maxAttempts = 200) {
  const mcQs = questions.filter(q => q.type === 'multiple_choice' && q.options && getCorrectLetter(q));
  if (mcQs.length === 0) return questions;

  const mcSet = new Set(mcQs.map(q => q.id));
  let dist = countDist(mcQs);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const pct = maxPct(dist, mcQs.length);
    if (pct <= 50) break;

    // Find dominant letter
    const dominant = Object.entries(dist).sort((a,b) => b[1]-a[1])[0][0];
    // Pick a random question with the dominant letter
    const candidates = mcQs.filter(q => getCorrectLetter(q) === dominant);
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    shuffleQuestion(target); // mutates in place
    dist = countDist(mcQs);
  }

  // Rebuild full question list
  const mcMap = new Map(mcQs.map(q => [q.id, q]));
  return questions.map(q => mcSet.has(q.id) ? mcMap.get(q.id) : q);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (args.length === 0) {
  console.error('Usage: node fix-chk4-balance.mjs <file.json> [...]');
  process.exit(1);
}

let fixed = 0, skipped = 0, failed = 0;

for (const arg of args) {
  const filePath = path.isAbsolute(arg) ? arg : path.join(ROOT, arg);
  if (!fs.existsSync(filePath)) { console.warn(`⚠  No existe: ${filePath}`); skipped++; continue; }

  const batch = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const mcQs = (batch.questions || []).filter(q => q.type === 'multiple_choice' && q.options && getCorrectLetter(q));
  const total = mcQs.length;

  if (total === 0) {
    console.log(`  skip (sin MC): ${path.basename(filePath)}`);
    skipped++;
    continue;
  }

  const distBefore = countDist(mcQs);
  const maxBefore  = maxPct(distBefore, total);

  batch.questions = rebalance(batch.questions || []);

  const mcAfter  = batch.questions.filter(q => q.type === 'multiple_choice' && q.options && getCorrectLetter(q));
  const distAfter = countDist(mcAfter);
  const maxAfter  = maxPct(distAfter, mcAfter.length);

  // Verify correct === correctAnswer for all MC questions
  const mismatch = mcAfter.filter(q => String(q.correct) !== String(q.correctAnswer));
  if (mismatch.length > 0) {
    console.warn(`  ⚠  mismatch correct≠correctAnswer en ${mismatch.length} preguntas — forzando sync`);
    for (const q of mismatch) q.correctAnswer = q.correct;
  }

  if (maxAfter > 50) {
    console.warn(`  ❌ no balanceado: ${path.basename(filePath)} (max ${maxAfter.toFixed(0)}%)`);
    failed++;
  } else {
    console.log(`  ✅ balanceado: ${path.basename(filePath)} (${maxBefore.toFixed(0)}% → ${maxAfter.toFixed(0)}%)`);
    fixed++;
  }

  fs.writeFileSync(filePath, JSON.stringify(batch, null, 2), 'utf8');
}

console.log(`\nDone: fixed=${fixed}, skipped=${skipped}, failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
