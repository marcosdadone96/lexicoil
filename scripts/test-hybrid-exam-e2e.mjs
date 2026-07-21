#!/usr/bin/env node
/**
 * test-hybrid-exam-e2e.mjs — E2E hybrid Lesen (plan + pool + live + gate + exam).
 *
 *   node scripts/test-hybrid-exam-e2e.mjs              # structural (~12/17; T3 sin seed gated)
 *   ALLOW_LIVE_GEN=1 node scripts/test-hybrid-exam-e2e.mjs --live   # live (17/17 esperado)
 *
 * Ver scripts/test-hybrid-exam-e2e.md — structural vs --live NO son el mismo test.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { assembleHybridLesenModule } from './lib/hybridLesenAssembly.mjs';

loadEnvFile();

const require = createRequire(import.meta.url);
const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
const blueprint = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'library/blueprints/goethe_B1.json'), 'utf8'),
);

const LIVE = process.argv.includes('--live');
const ALLOW_LIVE = process.env.ALLOW_LIVE_GEN === '1' || process.env.ALLOW_LIVE_GEN === 'true';

const WORDS = [
  'Klimawandel',
  'Mülltrennung',
  'Recycling',
  'Plastik',
  'Energie',
  'Umwelt',
  'Nachhaltigkeit',
  'Naturschutz',
  'erneuerbar',
  'Klima',
];

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ ${msg}`);
    failed++;
  }
}

function lesenTeilItemCount(part, bpPart) {
  const teil = Number(part.teil);
  if (teil === 3) {
    const n = (part.items || part.questions || []).length;
    if ((part.ads || []).length >= 10) return n;
    if (n >= 5) return n;
    return 0;
  }
  if (teil === 2) return (part.passages || []).length >= 2 ? (part.questions || []).length : 0;
  if (teil === 4) return (part.opinions || part.items || part.questions || []).length;
  return (part.questions || part.items || []).length;
}

function expectedItems(bpPart) {
  return bpPart?.itemsTotal || bpPart?.questionsTotal?.max || 6;
}

console.log('\n══════════════════════════════════════════════════════════');
console.log(' HYBRID E2E — 5 Lesen · topic Umwelt · 10 palabras');
console.log(` Modo: ${LIVE ? 'LIVE (Gemini)' : 'STRUCTURAL (pool real + live simulado)'}`);
console.log(` ALLOW_LIVE_GEN=${process.env.ALLOW_LIVE_GEN || '(unset)'}`);
console.log('══════════════════════════════════════════════════════════\n');

if (LIVE && !ALLOW_LIVE) {
  console.error('  ❌ --live requiere ALLOW_LIVE_GEN=1');
  process.exit(1);
}

if (LIVE && !process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
  console.error('  ❌ --live requiere GEMINI_API_KEY o GOOGLE_API_KEY');
  process.exit(1);
}

const result = await assembleHybridLesenModule({
  topicTag: 'Umwelt',
  words: WORDS,
  lang: 'de',
  level: 'B1',
  live: LIVE,
});

const { plan, exam, trace, timings, stockBefore, stockAfter, stockDelta } = result;

console.log('── PLAN ──');
console.log(`  Pool: ${plan.stats.poolCount} teils → [${plan.pool.map((p) => `T${p.teil}`).join(', ') || '—'}]`);
console.log(`  Live: ${plan.stats.liveCount} teils → [${plan.live.join(', ') || '—'}]`);
console.log(`  Vocab cubierto pool: [${plan.vocab.coveredByPool.join(', ')}]`);
console.log(`  Vocab → generador:     [${plan.vocab.remaining.join(', ')}]`);

console.log('\n── POOL SERVIDAS ──');
for (const p of trace.pool) {
  console.log(`  T${p.teil}  id=${p.id}  topicTag=${p.topicTag}  score=${p.score}  words=[${p.coveredWords.join(', ')}]`);
}

console.log('\n── LIVE ──');
for (const l of trace.live) {
  console.log(
    `  T${l.teil}  ok=${l.ok}  ${l.ms != null ? `${l.ms}ms` : ''}  vocabUsed=[${(l.vocabUsed || []).join(', ')}]${l.fallback ? ' (fallback sim)' : ''}${l.reason ? `  reason=${l.reason}` : ''}`,
  );
}

console.log('\n── GATE ──');
for (const g of trace.gates) {
  const block = g.blocking?.length ? g.blocking.map((b) => b.id).join(',') : '—';
  console.log(`  T${g.teil} ${g.source}  ok=${g.ok}  blocking=${block}`);
}

console.log('\n── STOCK (mock store) ──');
for (const t of [1, 2, 3, 4, 5]) {
  console.log(`  T${t}: ${stockBefore[t]} → ${stockAfter[t]} (Δ ${stockDelta[t] >= 0 ? '+' : ''}${stockDelta[t]})`);
}

console.log('\n── INGEST (mock store) ──');
for (const t of [1, 2, 3, 4, 5]) {
  const ing = result.ingestDelta?.[t] || 0;
  console.log(`  T${t}: +${ing} nueva(s) parte(s) live`);
}

console.log('\n── EXAMEN ──');
for (const p of exam.lesenParts) {
  const bpPart = blueprint.modules?.find((m) => m.id === 'lesen')?.parts?.find((x) => x.teil === p.teil);
  const n = lesenTeilItemCount(p, bpPart);
  const exp = expectedItems(bpPart);
  console.log(
    `  T${p.teil}  source=${p._source}  items≈${n}/${exp}  poolId=${p._poolId || p._generatedFile || '—'}`,
  );
}

console.log('\n── TIEMPO ──');
console.log(`  Pool fetch:  ${timings.poolMs}ms`);
console.log(`  Live gen:    ${timings.liveMs}ms`);
console.log(`  Total:       ${timings.totalMs}ms (${(timings.totalMs / 1000).toFixed(1)}s)`);

console.log('\n── ASSERTIONS ──');

assert(exam.lesenParts.length === 5, '5 partes Lesen T1–T5');
assert(plan.stats.poolCount + plan.stats.liveCount === 5, 'plan cubre 5 celdas');

for (const p of trace.pool) {
  assert(p.topicTag === 'Umwelt', `pool T${p.teil} topicTag Umwelt`);
}

for (const g of trace.gates) {
  assert(g.ok === true, `gate/playable OK T${g.teil} (${g.source})`);
}

const liveOk = trace.live.filter((l) => l.ok).length;
assert(liveOk === plan.live.length, `todas las live (${liveOk}/${plan.live.length}) completadas`);

const liveIngested = Object.values(result.ingestDelta || {}).filter((d) => d > 0).length;
if (plan.live.length) {
  assert(liveIngested >= plan.live.length, `live ingest al pool (${liveIngested}/${plan.live.length} celdas)`);
}

const v = new ExamValidator().validate(exam, { strict: false, blueprint, partialExam: true });
assert(v.valid, `ExamValidator OK (${v.errors.slice(0, 2).join('; ') || 'sin errores'})`);

for (const p of exam.lesenParts) {
  const bpPart = blueprint.modules?.find((m) => m.id === 'lesen')?.parts?.find((x) => x.teil === p.teil);
  const n = lesenTeilItemCount(p, bpPart);
  const exp = expectedItems(bpPart);
  assert(n >= exp * 0.85, `T${p.teil} conteo practicable (${n}/${exp})`);
}

console.log(`\n${'─'.repeat(50)}`);
console.log(`Resultado: ${passed} passed, ${failed} failed`);
console.log(`Modo: ${result.mode} · ${LIVE ? 'LLM real en live teils' : 'sin API — simula live con gate+ingest'}`);
console.log('Nota: el flujo web UI aún no cablea planHybridExam; este E2E valida la orquestación terminal.\n');

process.exit(failed ? 1 : 0);
