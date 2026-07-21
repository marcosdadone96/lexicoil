#!/usr/bin/env node
/**
 * CHK-18b / explanation repair recurrence from generation-cost.jsonl
 *   node scripts/analyze-chk18b-repair-recurrence.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { readGenerationCostLog, GENERATION_COST_LOG } from './lib/generationCostLog.mjs';

const OUT = path.join(ROOT, 'batches/ready/gate-logs/chk18b-repair-recurrence.json');

const entries = readGenerationCostLog(GENERATION_COST_LOG).filter((e) => e.module === 'lesen');

function classify(reason = '') {
  const r = String(reason);
  if (/encaja mejor|CHK-18b|clave.*explicaci/i.test(r)) return 'chk18b';
  if (/Explanation posiblemente no está en alemán/i.test(r)) return 'spanish_explanation';
  if (/sesgo de longitud|length bias/i.test(r)) return 'length_bias';
  if (/word.?match|palabra de alcance/i.test(r)) return 'word_match';
  return 'other';
}

const byKind = {};
const chk18bByTopic = {};
const chk18bSequences = [];

for (const e of entries) {
  if (e.ok) continue;
  const k = classify(e.failReason);
  byKind[k] = (byKind[k] || 0) + 1;
  if (k === 'chk18b') {
    const t = e.topic || '?';
    chk18bByTopic[t] = (chk18bByTopic[t] || 0) + 1;
  }
}

// Consecutive CHK-18b on same item (proxy: same topic within 5 min window)
const fails = entries.filter((e) => !e.ok && classify(e.failReason) === 'chk18b');
for (let i = 1; i < fails.length; i++) {
  const prev = fails[i - 1];
  const cur = fails[i];
  const dt = Date.parse(cur.ts) - Date.parse(prev.ts);
  if (
    prev.topic === cur.topic &&
    dt >= 0 &&
    dt < 120000 &&
    String(prev.failReason).slice(0, 40) === String(cur.failReason).slice(0, 40)
  ) {
    chk18bSequences.push({
      topic: cur.topic,
      teil: cur.teil,
      gapMs: dt,
      reason: String(cur.failReason).slice(0, 100),
    });
  }
}

const totalFail = entries.filter((e) => !e.ok).length;
const report = {
  generatedAt: new Date().toISOString(),
  lesenCalls: entries.length,
  lesenFails: totalFail,
  failKinds: byKind,
  chk18bShareOfFails: totalFail ? (byKind.chk18b || 0) / totalFail : 0,
  lengthBiasShare: totalFail ? (byKind.length_bias || 0) / totalFail : 0,
  spanishExplanationShare: totalFail ? (byKind.spanish_explanation || 0) / totalFail : 0,
  chk18bByTopic,
  rapidRepeatSequences: chk18bSequences.length,
  sampleSequences: chk18bSequences.slice(0, 20),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

console.log('Lesen fail kinds:', byKind);
console.log(`CHK-18b: ${byKind.chk18b || 0} (${((report.chk18bShareOfFails || 0) * 100).toFixed(1)}% of fails)`);
console.log(`length_bias: ${byKind.length_bias || 0}`);
console.log(`spanish_explanation: ${byKind.spanish_explanation || 0}`);
console.log('CHK-18b by topic:', chk18bByTopic);
console.log(`Rapid repeat sequences: ${chk18bSequences.length}`);
console.log(`Wrote ${path.relative(ROOT, OUT)}`);
