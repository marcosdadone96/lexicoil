#!/usr/bin/env node
/**
 * Valida catálogo T4_DEBATE_SEEDS (preflight completo).
 */
import { B1_TOPICS } from '../b1Topics.mjs';
import { T4_DEBATE_SEEDS, checkT4DebateSeedPreflight, validateT4DebateSeeds } from '../t4DebateSeeds.mjs';

const val = validateT4DebateSeeds();
const all = [];
for (const topic of B1_TOPICS) {
  for (const seed of T4_DEBATE_SEEDS[topic] || []) {
    const pf = checkT4DebateSeedPreflight(seed, topic);
    all.push({ topic, seed, ok: pf.ok, reason: pf.reason, detail: pf.detail });
  }
}
const bad = all.filter((r) => !r.ok);
console.log(JSON.stringify({
  validateT4DebateSeeds: val,
  total: all.length,
  preflightOk: all.length - bad.length,
  preflightFail: bad.length,
  failures: bad,
}, null, 2));
if (!val.ok || bad.length) process.exitCode = 1;
