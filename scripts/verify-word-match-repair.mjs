#!/usr/bin/env node
/**
 * Verifica reparación word-matching: ~10 partes T1/T2/T5.
 *   NODE_OPTIONS=--use-system-ca node scripts/verify-word-match-repair.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { generateLesenPart, createLesenFactorySession } from './generate-lesen-part-gemini.mjs';

loadEnvFile();
process.env.SEMANTIC_USE_GEMINI = process.env.SEMANTIC_USE_GEMINI || '1';

const TOPICS = ['Wohnen', 'Bildung', 'Arbeit', 'Umwelt', 'Medien'];
const PLAN = [
  { teil: 1, topic: 'Wohnen' },
  { teil: 1, topic: 'Bildung' },
  { teil: 1, topic: 'Arbeit' },
  { teil: 2, topic: 'Bildung' },
  { teil: 2, topic: 'Wohnen' },
  { teil: 2, topic: 'Medien' },
  { teil: 5, topic: 'Gesundheit' },
  { teil: 5, topic: 'Familie' },
  { teil: 5, topic: 'Arbeit' },
  { teil: 5, topic: 'Umwelt' },
];

async function main() {
  const { session, args: sessionArgs } = createLesenFactorySession({
    writeFile: true,
    maxApiCalls: 120,
    fixRetries: 2,
  });
  sessionArgs.fromCoverage = true;
  sessionArgs.wordCount = 10;

  const rows = [];

  console.log('\n══ Verificación word-match repair (T1/T2/T5 × 10) ══\n');

  for (let i = 0; i < PLAN.length; i++) {
    const { teil, topic } = PLAN[i];
    sessionArgs.topic = topic;
    sessionArgs._resolvedTopic = topic;
    const apiBefore = session.apiCallsUsed;

    const gen = await generateLesenPart({
      teil,
      topic,
      session: { session, args: sessionArgs },
      fixRetries: 2,
      writeFile: true,
    });

    rows.push({
      n: i + 1,
      teil,
      topic,
      ok: gen.ok,
      genCalls: session.apiCallsUsed - apiBefore,
      attempts: gen.attempts,
      firstPass: gen.ok && gen.attempts === 1,
      localizedRepair: gen.localizedRepair || null,
      file: gen.file,
      reason: gen.reason,
    });
  }

  const ok = rows.filter((r) => r.ok).length;
  const firstPassOk = rows.filter((r) => r.ok && r.attempts === 1).length;
  const multiGenOk = rows.filter((r) => r.ok && (r.genCalls || 0) > 2).length;
  const localizedRepairCount = rows.filter((r) => r.localizedRepair === 'word_match').length;

  const report = {
    generatedAt: new Date().toISOString(),
    plan: PLAN.length,
    ok,
    firstPassOk,
    firstPassRate: ok ? Number((firstPassOk / ok).toFixed(3)) : 0,
    localizedRepairCount,
    multiGenCallsDespiteOk: multiGenOk,
    apiCallsTotal: session.apiCallsUsed,
    rows,
  };

  const out = path.join(ROOT, 'batches/generated/verify-word-match-repair-report.json');
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('\n── Resumen ──');
  console.log(`OK: ${ok}/${PLAN.length}`);
  console.log(`1er intento OK (sin regen múltiple): ${firstPassOk}/${ok} OK (${((firstPassOk / Math.max(ok, 1)) * 100).toFixed(0)}%)`);
  console.log(`Reparaciones localizadas word-match: ${localizedRepairCount}`);
  console.log(`OK pero >2 gen LLM calls: ${multiGenOk}`);
  console.log(`Informe: ${path.relative(ROOT, out)}`);
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
