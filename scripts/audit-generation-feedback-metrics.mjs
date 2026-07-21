#!/usr/bin/env node
/**
 * Audit generation feedback metrics (PASO 13 P0-2).
 *
 *   node scripts/audit-generation-feedback-metrics.mjs
 *   node scripts/audit-generation-feedback-metrics.mjs --batches batches/generated
 *
 * Reports candidate/approved/active counts and which rule IDs appear in
 * generationMetadata.feedbackRules across generated batches.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { getStore } from '@netlify/blobs';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';

loadEnvFile();

const require = createRequire(import.meta.url);
const {
  listFeedback,
  feedbackMetrics,
} = require(path.join(ROOT, 'netlify/functions/lib/generationFeedbackStore.js'));

function parseArgs(argv) {
  const out = { batches: path.join(ROOT, 'batches', 'generated'), help: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--batches' && argv[i + 1]) out.batches = path.resolve(argv[++i]);
    if (argv[i] === '--help') out.help = true;
  }
  return out;
}

function scanUsedInGeneration(dir) {
  const used = new Map();
  if (!fs.existsSync(dir)) return { used, files: 0 };
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.includes('qualityReport'));
  let scanned = 0;
  for (const f of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const meta = raw.generationMetadata || raw.batch?.generationMetadata || null;
      const rules = meta?.feedbackRules;
      if (!Array.isArray(rules) || !rules.length) continue;
      scanned++;
      for (const id of rules) {
        const k = String(id);
        if (!used.has(k)) used.set(k, []);
        used.get(k).push(f);
      }
    } catch (_) {
      /* skip */
    }
  }
  return { used, files: scanned };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('Usage: node scripts/audit-generation-feedback-metrics.mjs [--batches dir]');
    process.exit(0);
  }

  let counts = { candidate: 0, approved: 0, active: 0, deprecated: 0, all: 0 };
  try {
    const store = getStore({ name: 'lexicoil-data', consistency: 'strong' });
    const listed = await listFeedback(store, { status: 'all', limit: 500 });
    if (listed.ok) counts = listed.counts;
  } catch (err) {
    console.warn('(Blobs unavailable — metrics from batches only)', err.message);
  }

  const metrics = feedbackMetrics(counts);
  const { used, files } = scanUsedInGeneration(args.batches);

  const report = {
    generatedAt: new Date().toISOString(),
    candidate_count: metrics.candidate_count,
    approved_count: metrics.approved_count,
    active_count: metrics.active_count,
    deprecated_count: metrics.deprecated_count,
    used_in_generation_count: used.size,
    batches_with_feedback_meta: files,
    used_rules: [...used.entries()].map(([id, files]) => ({
      id,
      generations: files.slice(0, 20),
      count: files.length,
    })),
  };

  const outDir = path.join(ROOT, 'generation-evaluation', 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'FEEDBACK-METRICS.json');
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
