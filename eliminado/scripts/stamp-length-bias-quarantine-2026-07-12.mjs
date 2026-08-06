#!/usr/bin/env node
/**
 * Stamp _lengthBiasQuarantine on MCQ questions where the correct option is the
 * longest among a/b/c (same method as audit-answer-length-bias.mjs).
 *
 *   node scripts/stamp-length-bias-quarantine-2026-07-12.mjs
 *   node scripts/stamp-length-bias-quarantine-2026-07-12.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/length-bias-quarantine-2026-07-12.json');
const dryRun = process.argv.includes('--dry-run');

const STAMP_AT = new Date().toISOString();
const STAMP_NOTE =
  'correct option is longest among a/b/c (answer-length-bias method 2026-07-11); blocked from official assemble, allowed in practice';

function classifyFile(filename) {
  const base = filename.toLowerCase();
  if (base.startsWith('lesen-t2-')) return 'lesen-t2';
  if (base.startsWith('lesen-t5-')) return 'lesen-t5';
  if (base.startsWith('horen-t2-')) return 'horen-t2';
  return null;
}

function correctLetter(q) {
  const raw = String(q.correct ?? q.correctAnswer ?? '').trim().toLowerCase();
  const m = raw.match(/^[abc]/);
  return m ? m[0] : null;
}

function optionBody(opt) {
  const t = typeof opt === 'string' ? opt : opt?.text || '';
  return String(t).replace(/^\s*[a-cA-C]\)\s*/, '').trim();
}

function isContentMcq(q) {
  if (String(q.type || '') !== 'multiple_choice') return false;
  const opts = q.options;
  if (!Array.isArray(opts) || opts.length < 3) return false;
  const letters = opts.slice(0, 3).map((o) => {
    const t = typeof o === 'string' ? o : o?.text || '';
    const m = String(t).trim().match(/^([a-cA-C])\)/);
    return m ? m[1].toLowerCase() : null;
  });
  return letters[0] === 'a' && letters[1] === 'b' && letters[2] === 'c';
}

function rankCorrect(correctLen, allLens) {
  const max = Math.max(...allLens);
  const min = Math.min(...allLens);
  if (max === min) return { isLongest: false };
  return { isLongest: correctLen === max };
}

const quarantined = [];
const byPart = { 'lesen-t2': 0, 'lesen-t5': 0, 'horen-t2': 0 };
const filesTouched = [];

for (const file of fs.readdirSync(POOL).filter((f) => f.endsWith('.json')).sort()) {
  const part = classifyFile(file);
  if (!part) continue;
  const abs = path.join(POOL, file);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  let changed = false;
  for (const q of batch.questions || []) {
    // Clear stale stamps outside scope / no longer longest (idempotent re-run)
    if (q._lengthBiasQuarantine && !isContentMcq(q)) continue;

    if (!isContentMcq(q)) continue;
    const letter = correctLetter(q);
    if (!letter) continue;
    const bodies = q.options.slice(0, 3).map(optionBody);
    const lens = bodies.map((b) => b.length);
    const idx = letter.charCodeAt(0) - 97;
    const correctLen = lens[idx];
    const { isLongest } = rankCorrect(correctLen, lens);

    if (isLongest) {
      if (!q._lengthBiasQuarantine) {
        q._lengthBiasQuarantine = true;
        q._lengthBiasQuarantinedAt = STAMP_AT;
        q._lengthBiasQuarantineNote = STAMP_NOTE;
        changed = true;
      }
      quarantined.push({
        file,
        part,
        qid: q.id,
        correct: letter,
        lengths: { a: lens[0], b: lens[1], c: lens[2] },
        correctLen,
      });
      byPart[part] += 1;
    } else if (q._lengthBiasQuarantine) {
      delete q._lengthBiasQuarantine;
      delete q._lengthBiasQuarantinedAt;
      delete q._lengthBiasQuarantineNote;
      changed = true;
    }
  }
  if (changed && !dryRun) {
    fs.writeFileSync(abs, `${JSON.stringify(batch, null, 2)}\n`);
    filesTouched.push(file);
  }
}

const report = {
  generatedAt: STAMP_AT,
  dryRun,
  method:
    'Same as audit-answer-length-bias.mjs: correct option length === max among a/b/c (ties for longest included). Scope lesen-t2, lesen-t5, horen-t2.',
  originalAuditCount2026_07_11: 168,
  quarantinedCount: quarantined.length,
  byPart,
  filesTouched: dryRun ? '(dry-run)' : filesTouched,
  ids: quarantined.map((x) => ({ file: x.file, qid: x.qid, part: x.part })),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Quarantined ${report.quarantinedCount} (audit-2026-07-11 had 168). byPart=${JSON.stringify(byPart)}`,
);
console.log(`Wrote ${path.relative(ROOT, OUT)}`);
if (report.quarantinedCount === 0) process.exit(1);
