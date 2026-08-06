#!/usr/bin/env node
/**
 * Undo v2.3.14 over-aggressive vocabularyTags repair: restore tags from git HEAD, re-enrich with v2.3.15.
 *   node scripts/remediate-v2314-vocab-tags.mjs --dry-run
 *   node scripts/remediate-v2314-vocab-tags.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { ROOT } from './lib/loadEnv.mjs';
import { enrichBatchMetadata, VOCAB_TAGS_NORMALIZE_VERSION } from './lib/enrichBatchMetadata.mjs';

const apply = process.argv.includes('--apply');
const STAMP = 'v2.3.14-lemmatizer-t-artifacts-2026-07-24';
const TRUNC_RE =
  /^(sophi|berli|konkren|plän|wett|komfortabl|demnächen|bereien|möchen|zukunfen|wochenend|nachbar|attraktion)$/i;

function gitHeadBatch(rel) {
  try {
    const raw = execSync(`git show HEAD:${rel.replace(/\\/g, '/')}`, { encoding: 'utf8', cwd: ROOT });
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function tagsByQid(batch) {
  const m = new Map();
  for (const q of batch.questions || []) {
    if (q.id && Array.isArray(q.vocabularyTags)) m.set(q.id, [...q.vocabularyTags]);
  }
  return m;
}

function countBadTags(batch) {
  let n = 0;
  for (const q of batch.questions || []) {
    for (const t of q.vocabularyTags || []) {
      if (TRUNC_RE.test(String(t))) n++;
    }
  }
  return n;
}

const report = { stamp: STAMP, newVersion: VOCAB_TAGS_NORMALIZE_VERSION, files: [], at: new Date().toISOString() };

for (const level of ['B1', 'A2']) {
  const dir = path.join(ROOT, 'batches/ready/pool-verified', level);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const abs = path.join(dir, f);
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const ver = batch._vocabTagsNormalizeVersion || '';
    const repairedToday = String(batch._poolArtifactRepairAt || '').startsWith('2026-07-24');
    if (!ver.includes('v2.3.14') && !repairedToday) continue;

    const rel = `batches/ready/pool-verified/${level}/${f}`;
    const beforeBad = countBadTags(batch);
    const head = gitHeadBatch(rel);
    const headTags = head ? tagsByQid(head) : new Map();

    let next = structuredClone(batch);
    if (headTags.size) {
      for (const q of next.questions || []) {
        if (q.id && headTags.has(q.id)) q.vocabularyTags = headTags.get(q.id);
      }
    }

    ({ batch: next } = enrichBatchMetadata(next, { vocab: true, grammar: false, topic: false }));
    const afterBad = countBadTags(next);

    report.files.push({
      file: `${level}/${f}`,
      restoredFromGit: headTags.size > 0,
      badTagsBefore: beforeBad,
      badTagsAfter: afterBad,
      version: next._vocabTagsNormalizeVersion,
    });

    if (apply) {
      fs.writeFileSync(abs, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    }
  }
}

const logPath = path.join(
  ROOT,
  'batches/ready/gate-logs',
  `remediate-v2314-vocab-tags-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`,
);
fs.mkdirSync(path.dirname(logPath), { recursive: true });
fs.writeFileSync(logPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`v2.3.14 remediate — ${report.files.length} files (${apply ? 'APPLIED' : 'dry-run'})`);
const stillBad = report.files.filter((x) => x.badTagsAfter > 0);
console.log(`Trunc-artifact tags remaining: ${stillBad.length} files`);
for (const x of stillBad.slice(0, 15)) {
  console.log(`  ${x.file}: before=${x.badTagsBefore} after=${x.badTagsAfter}`);
}
console.log(`Log: ${path.relative(ROOT, logPath)}`);
if (stillBad.length && apply) process.exit(1);
