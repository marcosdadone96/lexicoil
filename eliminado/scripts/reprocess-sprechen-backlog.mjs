#!/usr/bin/env node
/**
 * Reprocess Sprechen backlog: strip markdown in questions[].question + dedup skills[].
 * Does NOT regenerate content, change topicTags, or touch German prose.
 *
 *   node scripts/reprocess-sprechen-backlog.mjs
 *   node scripts/reprocess-sprechen-backlog.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripMarkdownLeakInBatch } from './lib/stripMarkdownLeak.mjs';
import { dedupSkillsInBatch } from './lib/dedupSkills.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = [
  'batches/generated',
  'batches/merged',
  'batches/rejected',
  'para-claude-verificacion/muestras-sprechen-auditoria-2026-07-10',
];

const dryRun = process.argv.includes('--dry-run');

function hasMarkdownAsteriskInQuestions(batch) {
  return (batch.questions || []).some((q) => typeof q.question === 'string' && /\*/.test(q.question));
}

function listSprechenFiles(dirRel) {
  const abs = path.join(ROOT, dirRel);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((f) => /^sprechen/i.test(f) && f.endsWith('.json'))
    .map((f) => path.join(dirRel, f));
}

let filesTouched = 0;
let markdownFixedTotal = 0;
let skillsDupTotal = 0;
let remainingAsterisk = 0;

for (const dir of DIRS) {
  for (const rel of listSprechenFiles(dir)) {
    const abs = path.join(ROOT, rel);
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const { batch: stripped, totalFixed: mdFixed } = stripMarkdownLeakInBatch(raw);
    const { batch: cleaned, skillsDupRemoved } = dedupSkillsInBatch(stripped);

    markdownFixedTotal += mdFixed;
    skillsDupTotal += skillsDupRemoved;

    const changed = mdFixed > 0 || skillsDupRemoved > 0;
    if (changed) {
      filesTouched++;
      console.log(
        `${rel}: markdown=${mdFixed} skillsDupRemoved=${skillsDupRemoved}${dryRun ? ' (dry-run)' : ''}`,
      );
      if (!dryRun) {
        fs.writeFileSync(abs, `${JSON.stringify(cleaned, null, 2)}\n`, 'utf8');
      }
    }

    const check = dryRun ? cleaned : JSON.parse(fs.readFileSync(abs, 'utf8'));
    if (hasMarkdownAsteriskInQuestions(check)) {
      remainingAsterisk++;
      console.error(`  ❌ still has * in question: ${rel}`);
    }
  }
}

console.log('\n── Summary ──');
console.log(`filesTouched: ${filesTouched}`);
console.log(`markdownFixedTotal: ${markdownFixedTotal}`);
console.log(`skillsDupTotal: ${skillsDupTotal}`);
console.log(`remainingAsteriskFiles: ${remainingAsterisk}`);
if (remainingAsterisk > 0) process.exit(1);
console.log('OK: 0 markdown asterisks remaining in Sprechen questions');
