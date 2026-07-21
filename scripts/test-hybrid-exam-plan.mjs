#!/usr/bin/env node
/**
 * test-hybrid-exam-plan.mjs — dynamic hybrid decision layer.
 *
 *   node scripts/test-hybrid-exam-plan.mjs
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  planHybridDecision,
  computeHybridPlan,
  DEFAULT_TEIL_LIST,
  countTeilInventory,
} from './lib/hybridExamPlan.mjs';
import { loadPoolRecords } from './lib/hybridLesenAssembly.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

function teils(plan) {
  return {
    pool: (plan.fromPool || []).map((p) => Number(p.teil)).sort((a, b) => a - b),
    live: (plan.toGenerate || []).map((p) => Number(p.teil)).sort((a, b) => a - b),
  };
}

function part(id, teil, topicTag, words = []) {
  return {
    id,
    lang: 'de',
    level: 'B1',
    module: 'lesen',
    teil,
    topicTag,
    complete: true,
    verified: true,
    disabled: false,
    servedCount: 0,
    vocabIndex: words.map((w) => ({ word: w, lemma: w })),
  };
}

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

console.log('\n── Pool stock actual (de B1 lesen) ──');
const realRecords = loadPoolRecords('de', 'B1');
for (const t of [1, 2, 3, 4, 5]) {
  const n = countTeilInventory(realRecords, {
    lang: 'de',
    level: 'B1',
    module: 'lesen',
    teil: t,
    topicTag: 'Umwelt',
  });
  const nAny = countTeilInventory(realRecords, {
    lang: 'de',
    level: 'B1',
    module: 'lesen',
    teil: t,
    topicTag: null,
  });
  console.log(`  T${t}: ${n} Umwelt-tagged · ${nAny} total`);
}
console.log('  → pickForcedPoolPart falla solo si total=0 (excepcional con pool actual)');

console.log('\n── determinismo ──');
const realPlanA = planHybridDecision({
  module: 'lesen',
  teils: DEFAULT_TEIL_LIST,
  topic: 'Umwelt',
  vocab: WORDS,
  poolIndex: realRecords,
  lang: 'de',
  level: 'B1',
});
const realPlanB = planHybridDecision({
  module: 'lesen',
  teils: DEFAULT_TEIL_LIST,
  topic: 'Umwelt',
  vocab: WORDS,
  poolIndex: realRecords,
  lang: 'de',
  level: 'B1',
});
assert(JSON.stringify(realPlanA) === JSON.stringify(realPlanB), 'mismos inputs → mismo plan');

console.log('\n── escenario REAL Umwelt (pool dinámico) ──');
const real = teils(realPlanA);
console.log(`  pool [${real.pool.join(', ')}] live [${real.live.join(', ')}]`);
assert(real.pool.length + real.live.length === 5, '5 celdas repartidas');
assert(real.live.filter((t) => [1, 2].includes(t)).length <= 1, 'máximo 1 slow live');
if (real.live.includes(1) || real.live.includes(2)) {
  assert(
    [1, 2, 3, 4, 5].filter((t) => !real.live.includes(t)).length >= 4,
    'slow live solo si las otras 4 van pool',
  );
}

console.log('\n── escenario 0 live (todo pool con vocab) ──');
const poolAll = [
  part('p-t1', 1, 'Umwelt', ['Mülltrennung', 'Umwelt']),
  part('p-t2', 2, 'Umwelt', ['Nachhaltigkeit', 'Recycling']),
  part('p-t3', 3, 'Umwelt', ['Klimawandel', 'Plastik']),
  part('p-t4', 4, 'Umwelt', ['Energie', 'Klima']),
  part('p-t5', 5, 'Umwelt', ['Naturschutz', 'erneuerbar']),
];
const plan0 = planHybridDecision({
  module: 'lesen',
  teils: DEFAULT_TEIL_LIST,
  topic: 'Umwelt',
  vocab: WORDS,
  poolIndex: poolAll,
});
const s0 = teils(plan0);
console.log(`  pool [${s0.pool.join(', ')}] live [${s0.live.join(', ')}]`);
assert(s0.live.length === 0, '0 live');
assert(s0.pool.length === 5, '5 fromPool');

console.log('\n── escenario 1 live (4 pool + 1 generada) ──');
const poolFour = [
  part('p-t1', 1, 'Umwelt', ['Mülltrennung', 'Umwelt']),
  part('p-t2', 2, 'Umwelt', ['Nachhaltigkeit']),
  part('p-t3', 3, 'Umwelt', ['Recycling']),
  part('p-t4', 4, 'Umwelt', ['Plastik']),
  // T5 sin match vocab — mucho stock
  part('p-t5a', 5, 'Technik', ['Computer']),
  part('p-t5b', 5, 'Technik', ['Internet']),
  part('p-t5c', 5, 'Sport', ['Fitness']),
];
const plan1 = planHybridDecision({
  module: 'lesen',
  teils: DEFAULT_TEIL_LIST,
  topic: 'Umwelt',
  vocab: WORDS,
  poolIndex: poolFour,
});
const s1 = teils(plan1);
console.log(`  pool [${s1.pool.join(', ')}] live [${s1.live.join(', ')}]`);
assert(s1.live.length === 1, 'exactamente 1 live');
assert(s1.pool.length === 4, '4 fromPool');
assert(s1.live[0] === 5, 'T5 live (sin match vocab, pool Technik no cuenta)');

console.log('\n── escenario T1 live (pool cubre T2–T5, T1 stock bajo sin match) ──');
const poolT1Live = [
  // T1: stock bajo, sin vocab Umwelt del usuario
  part('p-t1-only', 1, 'Technik', ['Computer']),
  part('p-t2', 2, 'Umwelt', ['Mülltrennung', 'Umwelt']),
  part('p-t3', 3, 'Umwelt', ['Recycling', 'Plastik']),
  part('p-t4a', 4, 'Umwelt', ['Energie']),
  part('p-t4b', 4, 'Umwelt', ['Klima']),
  part('p-t5a', 5, 'Umwelt', ['Naturschutz']),
  part('p-t5b', 5, 'Umwelt', ['Klimawandel']),
  // T2 alto stock (forced ok)
  part('p-t2b', 2, 'Freizeit', ['Hobby']),
  part('p-t2c', 2, 'Freizeit', ['Sport']),
];
const planT1 = planHybridDecision({
  module: 'lesen',
  teils: DEFAULT_TEIL_LIST,
  topic: 'Umwelt',
  vocab: WORDS,
  poolIndex: poolT1Live,
});
const sT1 = teils(planT1);
console.log(`  pool [${sT1.pool.join(', ')}] live [${sT1.live.join(', ')}]`);
console.log(`  decision: slowLive=${planT1.decision?.slowLive} stock=${JSON.stringify(planT1.decision?.stock)}`);
assert(sT1.live.includes(1), 'T1 live');
assert(!sT1.live.includes(2), 'T2 pool (otra slow)');
assert(sT1.pool.includes(2) && sT1.pool.includes(3) && sT1.pool.includes(4) && sT1.pool.includes(5), 'T2–T5 pool');

console.log('\n── escenario pool vacío en T1 (excepción → T1 live) ──');
const poolNoT1 = [
  part('p-t2', 2, 'Umwelt', ['Mülltrennung', 'Umwelt']),
  part('p-t3', 3, 'Umwelt', ['Recycling']),
  part('p-t4', 4, 'Umwelt', ['Plastik', 'Energie']),
  part('p-t5', 5, 'Umwelt', ['Klima', 'Naturschutz']),
];
const planEmptyT1 = planHybridDecision({
  module: 'lesen',
  teils: DEFAULT_TEIL_LIST,
  topic: 'Umwelt',
  vocab: WORDS,
  poolIndex: poolNoT1,
});
const sE = teils(planEmptyT1);
console.log(`  pool [${sE.pool.join(', ')}] live [${sE.live.join(', ')}]`);
assert(countTeilInventory(poolNoT1, { lang: 'de', level: 'B1', module: 'lesen', teil: 1, topicTag: null }) === 0, 'T1 stock 0 en fixture');
assert(sE.live.includes(1), 'T1 live por pool vacío');
assert(sE.pool.includes(2), 'T2 sigue en pool');

console.log('\n── orden live: stock ASC, FAST antes que SLOW al empatar ──');
const poolOrder = [
  part('p-t1a', 1, 'Technik', ['A']),
  part('p-t1b', 1, 'Technik', ['B']),
  part('p-t2', 2, 'Technik', ['C']),
  part('p-t3', 3, 'Technik', ['D']),
  part('p-t4', 4, 'Technik', ['E']),
  // sin T5 → live T3,T4,T5? T5 missing entirely
];
const planOrder = planHybridDecision({
  module: 'lesen',
  teils: DEFAULT_TEIL_LIST,
  topic: 'Umwelt',
  vocab: WORDS,
  poolIndex: poolOrder,
});
const liveOrder = (planOrder.toGenerate || []).map((c) => Number(c.teil));
console.log(`  live order [${liveOrder.join(' → ')}]`);
if (liveOrder.length >= 2) {
  const stocks = planOrder.decision?.stock || {};
  for (let i = 0; i < liveOrder.length; i++) {
    for (let j = i + 1; j < liveOrder.length; j++) {
      const a = liveOrder[i];
      const b = liveOrder[j];
      const sa = stocks[a] ?? 0;
      const sb = stocks[b] ?? 0;
      if (sa !== sb) {
        assert(sa <= sb, `stock ASC: T${a}(${sa}) before T${b}(${sb})`);
      } else {
        const aSlow = [1, 2].includes(a) ? 1 : 0;
        const bSlow = [1, 2].includes(b) ? 1 : 0;
        assert(aSlow <= bSlow, `FAST before SLOW on tie: T${a} before T${b}`);
      }
    }
  }
  assert(liveOrder.includes(5), 'T5 live (sin stock en pool)');
}

console.log(`\n${'─'.repeat(40)}`);
console.log(`Resultado: ${passed} passed, ${failed} failed`);
console.log(
  `Real Umwelt: pool [${real.pool.join(', ')}] live [${real.live.join(', ')}] · covered [${realPlanA.vocabCoverage.covered.join(', ')}]\n`,
);

process.exit(failed ? 1 : 0);
