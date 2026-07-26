#!/usr/bin/env node
/**
 * Fix lesen-t4-claude-test Frankenstein (CHK-22) → canonical single-passage T4.
 */
import fs from 'node:fs';
import path from 'node:path';
import { poolVerifiedDir } from './lib/batchPaths.mjs';
import { normalizeBatch } from './lib/normalizeBatch.mjs';

const file = 'lesen-t4-claude-test.json';
const abs = path.join(poolVerifiedDir('B1'), file);
const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
const topic = batch.topicTag || 'Umwelt';
const passageId = 'gen-l4-claudetest01-forum';

const intro =
  'In vielen Städten wird über kostenlose Leihfahrräder diskutiert. Soll die Stadt solche ' +
  'Systeme einführen oder ausbauen? Lesen Sie die Meinungen und entscheiden Sie, ob die Person ' +
  'den Vorschlag unterstützt.';

const questions = (batch.passages || []).map((p, i) => {
  const q0 = (batch.questions || [])[i] || {};
  const name = p.title || q0.question || `Person ${i + 1}`;
  const ja = /dafür|unterstütz|Ja|positiv|klar dafür|voll und ganz dafür/i.test(p.text);
  const correct = ja ? 'Ja' : 'Nein';
  return {
    ...q0,
    id: `gen-q-4-claudetest01-${i + 1}`,
    module: 'lesen',
    teil: 4,
    type: 'ja_nein',
    question: `Ist ${name} für den Vorschlag?`,
    options: ['a) Ja', 'b) Nein'],
    correct,
    correctAnswer: correct,
    signText: p.text,
    passageId,
    lang: 'de',
    level: 'B1',
    topicTags: [topic],
  };
});

let next = normalizeBatch(
  {
    ...batch,
    passages: [
      {
        id: passageId,
        module: 'lesen',
        teil: 4,
        lang: 'de',
        level: 'B1',
        topicTag: topic,
        title: 'Forum: Kostenlose Leihfahrräder in der Stadt',
        text: intro,
      },
    ],
    questions,
    _b1T4FrankensteinRepairAt: new Date().toISOString(),
  },
  { module: 'lesen', teil: 4, lang: 'de', level: 'B1' },
);

fs.writeFileSync(abs, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
console.log('OK repair lesen-t4-claude-test → single passage T4');
