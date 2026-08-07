#!/usr/bin/env node
/**
 * Fire test: 15 simulated Hören A2 name picks (T1/T2/T3) after backfill —
 * must not select Emma+Jonas or Clara+Tobias; usage store grows on record.
 *
 *   node scripts/smoke-a2-dialogue-name-rotation.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';
import {
  pickDialogueNameCast,
  recordDialogueCastsFromGeneration,
  loadPersistedDialogueCasts,
  pairKey,
} from './lib/dialogueNamesBank.mjs';

const FORBIDDEN = new Set(['Emma+Jonas', 'Clara+Tobias']);
const RUNS = 15;

const usagePath = path.join(ROOT, 'data/dialogue-names-usage.json');
const usageBefore = fs.existsSync(usagePath)
  ? JSON.parse(fs.readFileSync(usagePath, 'utf8'))
  : { cells: {} };

const picks = [];
let forbiddenHits = 0;

for (let i = 0; i < RUNS; i += 1) {
  const teil = [1, 2, 3][i % 3];
  const count = teil === 2 ? 1 : 5;
  const sessionExclude = new Set();
  const pick = pickDialogueNameCast(count, {
    level: 'A2',
    module: 'horen',
    teil,
    entropy: `smoke-${Date.now()}-${i}`,
    sessionExcludeCasts: sessionExclude,
  });
  const pairs = pick.pairs.map(([a, b]) => pairKey(a, b));
  for (const p of pairs) {
    if (FORBIDDEN.has(p)) forbiddenHits += 1;
  }
  picks.push({ i, teil, castSignature: pick.castSignature, pairs });

  recordDialogueCastsFromGeneration({
    level: 'A2',
    module: 'horen',
    teil,
    plannedSignature: pick.castSignature,
    batch: {
      level: 'A2',
      module: 'horen',
      teil,
      passages: pick.pairs.map(([a, b], idx) => ({
        id: `smoke-p-${i}-${idx}`,
        text: `${a}: Hallo!\n${b}: Guten Tag!`,
      })),
    },
  });
}

const usageAfter = JSON.parse(fs.readFileSync(usagePath, 'utf8'));
const persistedT1 = loadPersistedDialogueCasts({ level: 'A2', module: 'horen', teil: 1 });

const report = {
  at: new Date().toISOString(),
  runs: RUNS,
  forbiddenPairHits: forbiddenHits,
  pass: forbiddenHits === 0,
  picks,
  usageCellsBefore: Object.keys(usageBefore.cells || {}).length,
  usageCellsAfter: Object.keys(usageAfter.cells || {}).length,
  a2HorenT1Casts: (usageAfter.cells['A2:horen:t1']?.casts || []).length,
  persistedT1EmmaJonasBlocked: persistedT1.pairCounts.has('Emma+Jonas'),
};

const out = path.join(ROOT, 'batches/ready/gate-logs/a2-dialogue-name-rotation-smoke.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);
