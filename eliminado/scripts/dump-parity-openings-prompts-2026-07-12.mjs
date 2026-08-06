/**
 * Prompt-scope dump: parity gaps (Lesen T2 distractor, Hören T4 openings,
 * Lesen structural openings). Run: node scripts/dump-parity-openings-prompts-2026-07-12.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildExamPrompt } from './lib/examTemplatePrompt.mjs';
import { buildLesenPrompt } from './lib/lesenTemplatePrompt.mjs';
import { ROOT } from './lib/loadEnv.mjs';

const words = ['Stadt', 'Freizeit', 'Arbeit', 'Familie', 'Kurs'];
const outDir = path.join(ROOT, 'batches', 'ready', 'gate-logs');
fs.mkdirSync(outDir, { recursive: true });

function has(hay, needle) {
  return String(hay).includes(needle);
}

const report = {
  generatedAt: new Date().toISOString(),
  checks: [],
};

// ── Hören ──────────────────────────────────────────────────────────────────
for (const teil of [1, 2, 3, 4]) {
  const prompt = buildExamPrompt('horen', teil, words, { idSuffix: 'parity' });
  const dumpPath = path.join(outDir, `prompt-dump-horen-t${teil}-parity-2026-07-12.txt`);
  fs.writeFileSync(dumpPath, prompt, 'utf8');
  const row = {
    module: 'horen',
    teil,
    dump: path.relative(ROOT, dumpPath).replace(/\\/g, '/'),
    hasT4OpeningsBlock: has(prompt, 'APERTURA DEL MODERADOR (Hören T4'),
    hasT4ChecklistApertura: has(prompt, 'APERTURA DEL MODERADOR: prohibido el estereotipo'),
    hasT2Openings: has(prompt, 'Varía la apertura del Vortrag') || has(prompt, 'horen-t2'),
    hasT3Openings: has(prompt, 'APERTURA DEL DIÁLOGO (Hören T3'),
    hasT1Openings: has(prompt, 'APERTURAS POR TIPO'),
    hasDistractorCoherente: has(prompt, 'DISTRACTOR COHERENTE'),
  };
  report.checks.push(row);
}

// ── Lesen ──────────────────────────────────────────────────────────────────
const debateSeed = {
  vorschlag: 'In Parks soll es abends Ruhezeiten geben.',
  topicTag: 'Freizeit',
};
for (const teil of [1, 2, 3, 4, 5]) {
  const prompt = buildLesenPrompt(teil, words, {
    idSuffix: 'parity',
    debateSeed: teil === 4 ? debateSeed : undefined,
    topic: 'Freizeit',
  });
  const dumpPath = path.join(outDir, `prompt-dump-lesen-t${teil}-parity-2026-07-12.txt`);
  fs.writeFileSync(dumpPath, prompt, 'utf8');
  const row = {
    module: 'lesen',
    teil,
    dump: path.relative(ROOT, dumpPath).replace(/\\/g, '/'),
    hasT2DistractorCoherente: has(prompt, '(T2) DISTRACTOR COHERENTE'),
    hasT5DistractorCoherente: has(prompt, '(T5) DISTRACTOR COHERENTE'),
    hasT1AperturaEstructural: has(prompt, '(T1) APERTURA ESTRUCTURAL'),
    hasT2AperturaEstructural: has(prompt, '(T2) APERTURA ESTRUCTURAL'),
    hasT4AperturaEstructural: has(prompt, '(T4) APERTURA ESTRUCTURAL'),
    hasT5AperturaEstructural: has(prompt, '(T5) APERTURA ESTRUCTURAL'),
    hasHorenT4ModeratorBlock: has(prompt, 'APERTURA DEL MODERADOR (Hören T4'),
    hasStadtgaertenExample: has(prompt, 'Stadtgärten'),
  };
  report.checks.push(row);
}

// Assertions
const assert = (cond, msg) => {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
};

const h4 = report.checks.find((c) => c.module === 'horen' && c.teil === 4);
assert(h4.hasT4OpeningsBlock, 'H4 must include openings bank block');
assert(h4.hasT4ChecklistApertura, 'H4 checklist must mention moderator apertura');
for (const t of [1, 2, 3]) {
  const row = report.checks.find((c) => c.module === 'horen' && c.teil === t);
  assert(!row.hasT4OpeningsBlock, `Hören T${t} must NOT get T4 openings bank`);
}

const l2 = report.checks.find((c) => c.module === 'lesen' && c.teil === 2);
assert(l2.hasT2DistractorCoherente, 'Lesen T2 must have DISTRACTOR COHERENTE');
assert(l2.hasStadtgaertenExample, 'Lesen T2 distractor example must be press-themed');
assert(l2.hasT2AperturaEstructural, 'Lesen T2 structural opening');
assert(!l2.hasT5DistractorCoherente, 'Lesen T2 must not carry T5-only label');
assert(!l2.hasHorenT4ModeratorBlock, 'Lesen must not get Hören T4 bank');

const l1 = report.checks.find((c) => c.module === 'lesen' && c.teil === 1);
assert(l1.hasT1AperturaEstructural, 'Lesen T1 structural opening');
assert(!l1.hasT2DistractorCoherente, 'Lesen T1 must not get T2 distractor rule');

const l3 = report.checks.find((c) => c.module === 'lesen' && c.teil === 3);
assert(!l3.hasT2DistractorCoherente, 'Lesen T3 must not get T2 distractor');
assert(!l3.hasT1AperturaEstructural, 'Lesen T3 must not get T1 apertura');

const l4 = report.checks.find((c) => c.module === 'lesen' && c.teil === 4);
assert(l4.hasT4AperturaEstructural, 'Lesen T4 structural opening');
assert(!l4.hasT2DistractorCoherente, 'Lesen T4 must not get T2 distractor');

const l5 = report.checks.find((c) => c.module === 'lesen' && c.teil === 5);
assert(l5.hasT5DistractorCoherente, 'Lesen T5 keeps DISTRACTOR COHERENTE');
assert(l5.hasT5AperturaEstructural, 'Lesen T5 structural opening');
assert(!l5.hasT2DistractorCoherente, 'Lesen T5 must not get T2-labeled distractor');

const outJson = path.join(outDir, 'parity-openings-prompt-dump-2026-07-12.json');
fs.writeFileSync(outJson, JSON.stringify(report, null, 2) + '\n');
console.log('OK — all scope assertions passed');
console.log('Report:', path.relative(ROOT, outJson));
for (const c of report.checks) {
  console.log(
    `${c.module} T${c.teil}`,
    Object.entries(c)
      .filter(([k, v]) => k.startsWith('has') && v)
      .map(([k]) => k.replace(/^has/, ''))
      .join(', ') || '(none of tracked flags)',
  );
}
