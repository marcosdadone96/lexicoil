#!/usr/bin/env node
/**
 * Re-tag A2 pool grammarTags (g-de-b1-* → g-de-a2-* via enrich).
 *
 *   node scripts/re-enrich-a2-pool-grammar.mjs --preview [--sample 12]
 *   node scripts/re-enrich-a2-pool-grammar.mjs --apply --confirm
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { enrichBatchMetadata } from './lib/enrichBatchMetadata.mjs';

loadEnvFile();

const POOL = path.join(ROOT, 'batches/ready/pool-verified/A2');

function parseArgs(argv) {
  let sample = 12;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sample') sample = Math.max(1, Number(argv[++i]) || 12);
  }
  return {
    apply: argv.includes('--apply'),
    preview: argv.includes('--preview'),
    confirm: argv.includes('--confirm'),
    sample,
  };
}

function listFiles() {
  return fs
    .readdirSync(POOL)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(POOL, f))
    .sort();
}

function grammarSummary(batch) {
  const b1 = [];
  const a2 = [];
  for (const q of batch.questions || []) {
    for (const t of q.grammarTags || []) {
      if (/^g-de-b1-/.test(t)) b1.push(t);
      if (/^g-de-a2-/.test(t)) a2.push(t);
    }
  }
  return { b1: b1.length, a2: a2.length, qs: (batch.questions || []).length };
}

function enrichFile(batch) {
  const { batch: out } = enrichBatchMetadata(structuredClone(batch), {
    forceGrammar: true,
    grammar: true,
    vocab: false,
    topic: false,
  });
  out._a2GrammarRetagAt = new Date().toISOString();
  out._a2GrammarRetagNote = 're-enrich-a2-pool-grammar.mjs';
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.preview && !(args.apply && args.confirm)) {
    console.error(`
Usage:
  node scripts/re-enrich-a2-pool-grammar.mjs --preview [--sample 12]
  node scripts/re-enrich-a2-pool-grammar.mjs --apply --confirm
`);
    process.exit(1);
  }

  const files = listFiles();
  let beforeB1 = 0;
  let beforeA2 = 0;
  const changes = [];

  for (const abs of files) {
    const before = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const sb = grammarSummary(before);
    beforeB1 += sb.b1;
    beforeA2 += sb.a2;
    const after = enrichFile(before);
    const sa = grammarSummary(after);
    if (sb.b1 !== sa.b1 || sb.a2 !== sa.a2 || JSON.stringify(before.questions?.map((q) => q.grammarTags)) !== JSON.stringify(after.questions?.map((q) => q.grammarTags))) {
      changes.push({
        file: path.basename(abs),
        before: sb,
        after: sa,
        sampleTags: (after.questions || []).slice(0, 2).map((q) => q.grammarTags),
      });
    }
    if (args.apply && args.confirm) {
      fs.writeFileSync(abs, `${JSON.stringify(after, null, 2)}\n`, 'utf8');
    }
  }

  console.log(`\nA2 pool: ${files.length} files`);
  console.log(`Before: ${beforeB1} g-de-b1-* tag slots, ${beforeA2} g-de-a2-*`);
  const afterB1 = changes.reduce((n, c) => n + c.after.b1, 0);
  const afterA2 = changes.reduce((n, c) => n + c.after.a2, 0);
  if (args.preview) {
    let simB1 = 0;
    let simA2 = 0;
    for (const abs of files) {
      const after = enrichFile(JSON.parse(fs.readFileSync(abs, 'utf8')));
      simB1 += grammarSummary(after).b1;
      simA2 += grammarSummary(after).a2;
    }
    console.log(`After (simulated): ${simB1} g-de-b1-*, ${simA2} g-de-a2-*`);
    console.log(`Files with tag changes: ${changes.length}`);
    for (const c of changes.slice(0, args.sample)) {
      console.log(`  ${c.file}: b1 ${c.before.b1}→${c.after.b1}, a2 ${c.before.a2}→${c.after.a2}`, c.sampleTags);
    }
    if (simB1 > 0) process.exit(1);
  } else {
    let simB1 = 0;
    for (const abs of files) {
      simB1 += grammarSummary(JSON.parse(fs.readFileSync(abs, 'utf8'))).b1;
    }
    console.log(`Applied ${files.length} files. Remaining g-de-b1-* slots: ${simB1}`);
    if (simB1 > 0) process.exit(1);
  }
}

main();
