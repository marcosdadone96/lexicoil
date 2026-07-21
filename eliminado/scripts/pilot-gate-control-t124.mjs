#!/usr/bin/env node
/**
 * Piloto de control pre-regeneración: T1/T2/T4 con gate completo (P0–P3 + SEM-1).
 *
 *   node scripts/pilot-gate-control-t124.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { generateLesenPart, createLesenFactorySession } from './generate-lesen-part-gemini.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { validatePart } from './lib/partGate.mjs';

loadEnvFile();
process.env.SEMANTIC_USE_GEMINI = process.env.SEMANTIC_USE_GEMINI || '1';

const OUT_DIR = path.join(ROOT, 'batches', 'generated', 'pilot-gate-control');
const CELLS = [
  { teil: 1, topic: 'Technik', out: 'pilot-t1-technik.json', fixRetries: 10 },
  { teil: 2, topic: 'Freizeit', out: 'pilot-t2-freizeit.json', fixRetries: 5 },
  {
    teil: 4,
    topic: 'Technik',
    out: 'pilot-t4-technik.json',
    fixRetries: 8,
    forceDebate: 'handy_schule',
  },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

console.log('══ Piloto gate completo (P0+P1+P2+P3+SEM-1) — T1/T2/T4 ══');
console.log(`SEM-1: ${process.env.SEMANTIC_USE_GEMINI === '1' ? 'Gemini' : 'Claude'}\n`);

const { session, args: baseArgs } = createLesenFactorySession({
  maxApiCalls: 120,
  fixRetries: 6,
  semantic: true,
  writeFile: false,
  skipDedup: true,
});
baseArgs.fromCoverage = true;

const results = [];

for (const cell of CELLS) {
  console.log(`\n── ${cell.topic}×T${cell.teil} ──`);
  const args = {
    ...baseArgs,
    _excludeSubtypes: cell.excludeDebates || [],
    _forceDebateTopic: cell.forceDebate || null,
  };
  session.args = args;

  const gen = await generateLesenPart({
    teil: cell.teil,
    topic: cell.topic,
    session: { session, args },
    fixRetries: cell.fixRetries,
    semantic: true,
    writeFile: false,
    skipDedup: true,
  });

  if (!gen.ok || !gen.batch) {
    console.log(`  ❌ generación fallida: ${gen.reason || 'unknown'}`);
    if (gen.issues?.length) console.log(`     ${gen.issues.join('\n     ')}`);
    results.push({ ...cell, ok: false, stage: 'generation', reason: gen.reason, issues: gen.issues });
    continue;
  }

  const gate = await validatePart(gen.batch, {
    semantic: true,
    module: 'lesen',
    teil: cell.teil,
    skipDedup: true,
  });
  const reaudit = await isPartPoolReady(gate.batch || gen.batch, { semantic: true });

  const batch = gate.batch || gen.batch;
  const dest = path.join(OUT_DIR, cell.out);
  fs.writeFileSync(dest, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');

  const ok = gate.ok && reaudit.ok;
  console.log(`  gate.validatePart: ${gate.ok ? 'OK' : 'FAIL'}`);
  console.log(`  gate.isPartPoolReady+SEM: ${reaudit.ok ? 'OK' : 'FAIL'}`);
  if (!ok) {
    [...(gate.blocking || []), ...(reaudit.blocking || [])]
      .slice(0, 5)
      .forEach((f) => console.log(`    [${f.id}] ${f.message}`));
  } else {
    console.log(`  ✅ guardado → ${path.relative(ROOT, dest).replace(/\\/g, '/')}`);
  }

  results.push({
    ...cell,
    ok,
    dest: path.relative(ROOT, dest).replace(/\\/g, '/'),
    apiCalls: gen.apiCalls,
    ms: gen.ms,
    debate: batch._debateTopic || null,
    blocking: [...new Set([...(gate.blocking || []), ...(reaudit.blocking || [])].map((f) => `[${f.id}] ${f.message}`))],
  });
}

console.log('\n══ Resumen piloto ══');
for (const r of results) {
  console.log(`  ${r.topic}×T${r.teil}: ${r.ok ? '✅' : '❌'} ${r.dest || r.reason || ''}`);
}
console.log(`\nJSON: batches/generated/pilot-gate-control/`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
