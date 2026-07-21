/**
 * P0: reprocess vocabularyTags per-question for 1a files (+ full-pool verify).
 * P1: verein → Verein (lexicon + file).
 *
 *   node scripts/fix-pool-vocab-p0-p1-2026-07-10.mjs --dry-run
 *   node scripts/fix-pool-vocab-p0-p1-2026-07-10.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import {
  enrichBatchMetadata,
  VOCAB_TAGS_NORMALIZE_VERSION,
} from './lib/enrichBatchMetadata.mjs';
import { POOL_VERIFIED_DIR, POOL_CONTENT_OK_LESEN_DIR } from './lib/finalizePoolReady.mjs';

const dryRun = process.argv.includes('--dry-run');
const AUDIT = path.join(ROOT, 'batches/ready/gate-logs/POOL-EXHAUSTIVE-AUDIT-2026-07-10.json');
const audit = JSON.parse(fs.readFileSync(AUDIT, 'utf8'));
const target1a = new Set(audit.full.vocabIdenticalAcrossQs || []);

function vocabSig(tags) {
  return [...(tags || [])].map((t) => String(t).toLowerCase()).sort().join('\0');
}

function hasIdenticalVocabAcrossQuestions(batch) {
  const sigs = (batch.questions || [])
    .map((q) => vocabSig(q.vocabularyTags))
    .filter(Boolean);
  const seen = new Set();
  for (const s of sigs) {
    if (seen.has(s)) return true;
    seen.add(s);
  }
  return false;
}

function findFile(name) {
  for (const dir of [POOL_VERIFIED_DIR, POOL_CONTENT_OK_LESEN_DIR]) {
    const abs = path.join(dir, name);
    if (fs.existsSync(abs)) return { dir, abs, pool: path.basename(dir) };
  }
  return null;
}

const report = {
  generatedAt: new Date().toISOString(),
  dryRun,
  version: VOCAB_TAGS_NORMALIZE_VERSION,
  p0: { targeted: target1a.size, reprocessed: 0, stillIdentical: [], examples: [] },
  p1: { file: 'lesen-t4-gemini-026.json', fixed: false, lexicon: 'verein added to NOUN_LEMMAS' },
  verify100: { scanned: 0, identicalFiles: [] },
};

// ——— P0: reprocess 1a set ———
for (const file of [...target1a].sort()) {
  const loc = findFile(file);
  if (!loc) continue;
  const batch = JSON.parse(fs.readFileSync(loc.abs, 'utf8'));
  const before = (batch.questions || []).map((q) => [...(q.vocabularyTags || [])]);
  const { batch: enriched } = enrichBatchMetadata(batch, {
    topic: false,
    grammar: false,
    vocab: true,
    forceVocab: true,
  });
  const after = (enriched.questions || []).map((q) => [...(q.vocabularyTags || [])]);
  const still = hasIdenticalVocabAcrossQuestions(enriched);
  report.p0.reprocessed++;
  if (still) report.p0.stillIdentical.push(file);
  if (report.p0.examples.length < 4) {
    report.p0.examples.push({
      file,
      pool: loc.pool,
      before: before.slice(0, 3),
      after: after.slice(0, 3),
      stillIdentical: still,
    });
  }
  if (!dryRun) {
    fs.writeFileSync(loc.abs, `${JSON.stringify(enriched, null, 2)}\n`);
  }
}

// ——— P1: verein ———
{
  const loc = findFile('lesen-t4-gemini-026.json');
  if (loc) {
    const batch = JSON.parse(fs.readFileSync(loc.abs, 'utf8'));
    let changed = false;
    for (const q of batch.questions || []) {
      if (!Array.isArray(q.vocabularyTags)) continue;
      q.vocabularyTags = q.vocabularyTags.map((t) => {
        if (String(t).toLowerCase() === 'verein' && t !== 'Verein') {
          changed = true;
          return 'Verein';
        }
        return t;
      });
    }
    // Also force re-enrich so lexicon capitalizes
    const { batch: enriched } = enrichBatchMetadata(batch, {
      topic: false,
      grammar: false,
      vocab: true,
      forceVocab: true,
    });
    const hasLower = (enriched.questions || []).some((q) =>
      (q.vocabularyTags || []).some((t) => t === 'verein'),
    );
    const hasUpper = (enriched.questions || []).some((q) =>
      (q.vocabularyTags || []).some((t) => t === 'Verein'),
    );
    report.p1.fixed = !hasLower;
    report.p1.hasVerein = hasUpper;
    report.p1.changed = changed || hasUpper;
    report.p1.pool = loc.pool;
    if (!dryRun) {
      fs.writeFileSync(loc.abs, `${JSON.stringify(enriched, null, 2)}\n`);
    }
  }
}

// ——— Verify 1a on 100% pool ———
for (const dir of [POOL_VERIFIED_DIR, POOL_CONTENT_OK_LESEN_DIR]) {
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    // After dry-run, verify against in-memory would be wrong for non-reprocessed;
    // for dry-run, only check reprocessed set; for apply, check all.
    const abs = path.join(dir, file);
    let batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    if (dryRun && target1a.has(file)) {
      batch = enrichBatchMetadata(batch, {
        topic: false,
        grammar: false,
        vocab: true,
        forceVocab: true,
      }).batch;
    } else if (dryRun && !target1a.has(file)) {
      // skip non-targets in dry-run full verify — still count disk state
    }
    report.verify100.scanned++;
    if (hasIdenticalVocabAcrossQuestions(batch)) {
      report.verify100.identicalFiles.push(file);
    }
  }
}

const outJson = path.join(ROOT, 'batches/ready/gate-logs/POOL-VOCAB-P0-P1-FIX-2026-07-10.json');
const outMd = path.join(ROOT, 'batches/ready/gate-logs/POOL-VOCAB-P0-P1-FIX-2026-07-10.md');
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);

const md = [
  '# P0+P1 vocab fix — 2026-07-10',
  '',
  `**Dry-run:** ${dryRun}`,
  `**Version:** \`${VOCAB_TAGS_NORMALIZE_VERSION}\``,
  '',
  '## P0',
  '',
  `| Métrica | N |`,
  `|--------|--:|`,
  `| Archivos 1a objetivo | ${report.p0.targeted} |`,
  `| Reprocesados | ${report.p0.reprocessed} |`,
  `| Siguen con tags idénticos (en set 1a) | ${report.p0.stillIdentical.length} |`,
  `| Verify 100% pool — con tags idénticos | **${report.verify100.identicalFiles.length}** / ${report.verify100.scanned} |`,
  '',
  '## P1',
  '',
  `- File: \`${report.p1.file}\` (${report.p1.pool || '?'})`,
  `- Fixed (no lowercase \`verein\`): **${report.p1.fixed}**`,
  `- Léxico: \`verein\` añadido a \`NOUN_LEMMAS\` (capitaliza en futuros extracts)`,
  '',
  `Datos: \`${path.basename(outJson)}\``,
  '',
];
fs.writeFileSync(outMd, md.join('\n'));
console.log(JSON.stringify({
  dryRun,
  p0: {
    reprocessed: report.p0.reprocessed,
    stillIdentical: report.p0.stillIdentical.length,
    verifyIdentical: report.verify100.identicalFiles.length,
    verifyScanned: report.verify100.scanned,
  },
  p1: report.p1,
  examples: report.p0.examples,
}, null, 2));
