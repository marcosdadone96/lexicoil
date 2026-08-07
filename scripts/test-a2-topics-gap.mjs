#!/usr/bin/env node
/**
 * A2 gap topic scope — official 5 slugs only for pickScarcestTopic (§18.2).
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { topicsForLevel } from './lib/levelPlanner.mjs';
import { printGapStatus } from './lib/poolFillTeilLib.mjs';
import {
  loadPoolRecords,
  pickScarcestTopic,
  rankTopicGaps,
  countTopicStock,
} from './lib/poolGapPlanner.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { A2_OFFICIAL_TOPICS, normalizeA2Topic } = require(path.join(ROOT, 'js/data/a2Topics.js'));

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

assert('A2 pool scope has 16 slugs', topicsForLevel('A2', { scope: 'pool' }).length === 16);
assert('A2 gap scope has 5 slugs', topicsForLevel('A2', { scope: 'gap' }).length === 5);
assert(
  'gap list equals A2_OFFICIAL_TOPICS',
  topicsForLevel('A2', { scope: 'gap' }).every((t, i) => t === A2_OFFICIAL_TOPICS[i]),
);

assert('Natur und Wetter → Umwelt', normalizeA2Topic('Natur und Wetter') === 'Umwelt');
assert('Freizeit normalizes but not official', normalizeA2Topic('Freizeit') === 'Freizeit');

const records = loadPoolRecords('de', 'A2');
const h2 = countTopicStock(records, 'horen', 2, 'A2');
assert('Hören T2 gap counts only 5 keys', Object.keys(h2.counts).length === 5);

const picked = pickScarcestTopic(records, 'horen', 2, { level: 'A2', targetPerCell: 3 });
assert(`pickScarcestTopic A2 H2 ∈ official (got ${picked})`, A2_OFFICIAL_TOPICS.includes(picked));

const ranked = rankTopicGaps(records, 'horen', 2, 3, 'A2');
assert('rankTopicGaps A2 length 5', ranked.length === 5);
assert(
  'no non-official slug in ranked',
  ranked.every((r) => A2_OFFICIAL_TOPICS.includes(r.topic)),
);

const statusOut = spawnSync(
  process.execPath,
  ['scripts/pool-fill-teil.mjs', '--module', 'lesen', '--teil', '3', '--level', 'A2', '--status'],
  { cwd: ROOT, encoding: 'utf8' },
);
const statusText = `${statusOut.stdout || ''}${statusOut.stderr || ''}`;
assert(
  'printGapStatus A2 T3 lists official 5 (not Arbeit)',
  statusText.includes('Reisen') && statusText.includes('Umwelt') && !/^\s*Arbeit\s/m.test(statusText),
);
assert('printGapStatus mentions 5 ejes', /5 ejes/.test(statusText));

console.log('\nA2 gap topic scope tests passed.');
console.log('Sample H2 pick:', picked, 'top gaps:', ranked.slice(0, 3));
