#!/usr/bin/env node
/**
 * Lesen T4 forum name frequency + cast overlap (pool + simulated session picks).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import {
  pickLesenT4ForumCast,
  tallyLesenT4ForumNameFrequency,
  loadPersistedLesenT4ForumCasts,
} from './lib/dialogueNamesBank.mjs';

const level = process.argv.includes('--level')
  ? process.argv[process.argv.indexOf('--level') + 1]
  : 'B1';
const simN = process.argv.includes('--simulate')
  ? Number(process.argv[process.argv.indexOf('--simulate') + 1] || 10)
  : 0;

const extraDirs = [
  path.join(ROOT, `batches/ready/pool-verified/${level}`),
  path.join(ROOT, `batches/needs-regeneration/${level}`),
  path.join(ROOT, `batches/generated/${level}`),
];

console.log(`# Lesen T4 forum names · level=${level}\n`);

const { nameFileCounts, castByFile, pairOverlap } = tallyLesenT4ForumNameFrequency({
  level,
  teil: 4,
  extraDirs,
});

const files = castByFile.length;
console.log(`Archivos escaneados (casts): ${files}\n`);

const sorted = [...nameFileCounts.entries()].sort((a, b) => b[1] - a[1]);
console.log('| Nombre | Archivos | % pool |');
console.log('|--------|----------|--------|');
for (const [name, cnt] of sorted) {
  const pct = files ? ((100 * cnt) / files).toFixed(1) : '0';
  console.log(`| ${name} | ${cnt} | ${pct}% |`);
}
if (!sorted.length) console.log('| (ninguno) | 0 | — |');

console.log('\n## Pares con ≥3 nombres compartidos\n');
if (pairOverlap.size === 0) {
  console.log('(ninguno ≥3)');
} else {
  for (const [key, shared] of pairOverlap) {
    console.log(`- ${key}: ${shared.join(', ')} (${shared.length})`);
  }
}

if (simN > 0) {
  console.log(`\n## Simulación ${simN} picks (sesión vacía + pool persistido)\n`);
  const sessionCast = new Set();
  const sessionNames = [];
  const simCounts = new Map();
  for (let i = 0; i < simN; i += 1) {
    const pick = pickLesenT4ForumCast({
      level,
      teil: 4,
      sessionExclude: sessionNames,
      sessionExcludeCasts: sessionCast,
      entropy: `sim:${i}:${Date.now()}`,
      extraDirs,
    });
    sessionCast.add(pick.castSignature);
    for (const n of pick.names) {
      sessionNames.push(n);
      simCounts.set(n, (simCounts.get(n) || 0) + 1);
    }
    console.log(`${i + 1}. ${pick.names.join(', ')}`);
  }
  console.log('\n| Nombre | Apariciones en sim | % sim |');
  console.log('|--------|-------------------|-------|');
  for (const [name, cnt] of [...simCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`| ${name} | ${cnt} | ${((100 * cnt) / simN).toFixed(0)}% |`);
  }
}

const persisted = loadPersistedLesenT4ForumCasts({ level, teil: 4, extraDirs });
console.log(`\nCasts únicos persistidos (pool+usage): ${persisted.casts.size}`);
