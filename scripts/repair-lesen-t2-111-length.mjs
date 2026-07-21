#!/usr/bin/env node
/**
 * Recover lesen-t2-gemini-111.json via localized passage-length repair (1 LLM call).
 * Run: node scripts/repair-lesen-t2-111-length.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { generateContent as generateGemini } from './lib/geminiClient.mjs';
import {
  combinedPassageWordCount,
  repairT2PassageLengthBatch,
  verifyT2IngestOk,
} from './lib/passageLengthRepair.mjs';
import { formatIngestReport } from './lib/lesenBatchIngestCheck.mjs';

loadEnvFile();

const SRC = path.join(ROOT, 'batches/rejected/lesen-t2-gemini-111.json');
const OUT = path.join(ROOT, 'batches/generated/lesen-t2-gemini-111.json');
const dryRun = process.argv.includes('--dry-run');

const batch = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const before = combinedPassageWordCount(batch);
console.log(`Before: ${before} words (CEFR max 400)`);
console.log(formatIngestReport(verifyT2IngestOk(batch, { batchId: 'lesen-t2-gemini-111' })));

if (dryRun) {
  console.log('\n[dry-run] Would call repairT2PassageLengthBatch once and write', path.relative(ROOT, OUT));
  process.exit(0);
}

const repaired = await repairT2PassageLengthBatch(
  batch,
  async ({ prompt, maxTokens }) => {
    const result = await generateGemini({
      prompt,
      maxTokens,
      jsonMode: true,
    });
    return { text: result.text };
  },
  { maxTokens: 4096, lang: 'de', level: 'B1' },
);

if (!repaired) {
  console.error('Repair failed — batch not recovered');
  process.exit(1);
}

const after = combinedPassageWordCount(repaired);
const ingest = verifyT2IngestOk(repaired, { batchId: 'lesen-t2-gemini-111' });
console.log(`After: ${after} words`);
console.log(formatIngestReport(ingest));

if (!ingest.ok) {
  console.error('Ingest still failing after repair');
  process.exit(1);
}

delete repaired._rejectedReason;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(repaired, null, 2)}\n`, 'utf8');
console.log(`\nRecovered → ${path.relative(ROOT, OUT)}`);
