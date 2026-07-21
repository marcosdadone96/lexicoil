#!/usr/bin/env node
/** Audit: which T4 debate molds pass CHK-26 + CHK-27 cleanly for Technik? */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';
import {
  LESEN_T4_DEBATE_TOPICS,
  T4_TOPIC_DEBATE_PREFERENCE,
  getDebateById,
} from './lib/lesenSubtypeRotation.mjs';
import { assessT4TopicAlignment, T4_DEBATE_TOPIC_AFFINITY } from './lib/t4TopicAlign.mjs';

const require = createRequire(import.meta.url);
const { detectTopic } = require(path.join(ROOT, 'js/engine/partTopicDetect.js'));

const TOPIC = 'Technik';

function mkSyntheticBatch(debateId) {
  const d = getDebateById(debateId);
  if (!d) return null;
  const intro =
    `In unserer Stadt wird über Technik und digitale Medien diskutiert. ` +
    `Der Vorschlag: ${d.vorschlag} Lesen Sie die Meinungen im Forum.`;
  return {
    topicTag: TOPIC,
    _debateTopic: debateId,
    passages: [{ id: 'p0', title: d.titleExample, text: intro, topicTag: TOPIC }],
    questions: Array.from({ length: 7 }, (_, i) => ({
      id: `q${i}`,
      module: 'lesen',
      teil: 4,
      signText:
        `Meinung ${i + 1} zu Apps, Smartphones und digitaler Technik im Alltag. ` +
        `Ich finde den Vorschlag wichtig für Schule und Familie.`,
      question: `Ist Person${i} für den Vorschlag?`,
    })),
  };
}

function chk26WouldPass(batch) {
  const expected = TOPIC;
  for (const p of batch.passages || []) {
    if (p.topicTag && p.topicTag !== expected) return false;
    const detected = detectTopic(String(p.text || p.title || ''));
    if (!p.topicTag && detected && detected !== expected) return false;
  }
  return true;
}

console.log(`\n══ T4 debates × ${TOPIC} (CHK-26 + CHK-27) ══\n`);

const preferred = T4_TOPIC_DEBATE_PREFERENCE[TOPIC] || [];
const rows = [];

for (const d of LESEN_T4_DEBATE_TOPICS) {
  const batch = mkSyntheticBatch(d.id);
  const a = assessT4TopicAlignment(batch);
  const c26 = chk26WouldPass(batch);
  const clean = a.ok && c26;
  rows.push({
    id: d.id,
    label: d.label,
    preferred: preferred.includes(d.id),
    affinity: (T4_DEBATE_TOPIC_AFFINITY[d.id] || []).join(', '),
    chk27: a.ok ? 'OK' : a.reason,
    chk26: c26 ? 'OK' : detectTopic(batch.passages[0].text),
    clean,
  });
}

const cleanRows = rows.filter((r) => r.clean);
const cleanPreferred = cleanRows.filter((r) => r.preferred);

console.log('ID | preferred | CHK-27 | CHK-26 | label');
for (const r of rows.sort((a, b) => Number(b.clean) - Number(a.clean))) {
  console.log(
    `${r.clean ? '✅' : '❌'} ${r.id.padEnd(20)} | ${r.preferred ? 'yes' : 'no '} | ${String(r.chk27).padEnd(12)} | ${String(r.chk26).padEnd(8)} | ${r.label}`,
  );
}

console.log(`\nTotal clean for ${TOPIC}: ${cleanRows.length}`);
console.log(`Clean + in T4_TOPIC_DEBATE_PREFERENCE: ${cleanPreferred.length}`);
console.log(`Preferred list: ${preferred.join(', ')}`);
console.log(`\n≥3 clean preferred: ${cleanPreferred.length >= 3 ? 'YES ✓' : 'NO ✗'}`);

process.exit(cleanPreferred.length >= 3 ? 0 : 1);
