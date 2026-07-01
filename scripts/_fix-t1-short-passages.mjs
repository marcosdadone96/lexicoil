#!/usr/bin/env node
// Replace the 3 T1 passages that are too short (<150 words) with longer ones from the bank.
import fs from 'node:fs';

const bank = JSON.parse(fs.readFileSync('library/de/B1/questions.json', 'utf8'));
const passages = JSON.parse(fs.readFileSync('library/de/B1/passages.json', 'utf8'));
const passMap = new Map(passages.passages.map((p) => [p.id, p]));

/** Map passageId → bank questions */
const byPassage = new Map();
for (const q of bank.questions || []) {
  if (q.type !== 'richtig_falsch') continue;
  if (!q.passageId) continue;
  if (!byPassage.has(q.passageId)) byPassage.set(q.passageId, []);
  byPassage.get(q.passageId).push(q);
}

function toQ(q) {
  return {
    id: 'ql_' + q.id,
    type: q.type,
    question: q.question || q.statement || '',
    correct: q.correct || q.correctAnswer || '',
    correctAnswer: q.correctAnswer || q.correct || '',
    explanation: q.explanation || '',
    grammarTags: q.grammarTags || [],
    topicTags: q.topicTags || [],
    vocabularyTags: q.vocabularyTags || [],
    difficulty: q.difficulty || 3,
    passageId: q.passageId || '',
  };
}

function wordCount(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

// Mapping: current short passage → replacement long passage
const SWAPS = [
  { file: 'library/curated/de/B1/curated_de_B1_20b59a8d03ca.json', newPassId: 'de-b1-p-lesen-t1-stadtgarten-koeln-03' },
  { file: 'library/curated/de/B1/curated_de_B1_23a356f5dd47.json', newPassId: 'de-b1-p-lesen-t1-volkshochschule-04' },
  { file: 'library/curated/de/B1/curated_de_B1_27e358cedfdc.json', newPassId: 'p-lesen-t1-579cc63bde' },
];

for (const { file, newPassId } of SWAPS) {
  const x = JSON.parse(fs.readFileSync(file, 'utf8'));
  const t1 = x.exam.lesenParts.find((p) => p.teil === 1);
  if (!t1) { console.log(`${file}: sin T1`); continue; }

  const newPassage = passMap.get(newPassId);
  if (!newPassage) { console.log(`${file}: pasaje ${newPassId} no encontrado en passages.json`); continue; }

  const newQs = (byPassage.get(newPassId) || []).map(toQ);
  if (newQs.length < 6) { console.log(`${file}: solo ${newQs.length} preguntas para ${newPassId} en el banco`); continue; }

  const oldPassId = t1.passageId;
  const oldWc = wordCount(t1.text);
  const newWc = wordCount(newPassage.text);

  t1.passageId = newPassId;
  t1.textTitle = newPassage.title || newPassage.textTitle || newPassId;
  t1.text = newPassage.text || '';
  t1.questions = newQs.slice(0, 6);

  fs.writeFileSync(file, JSON.stringify(x, null, 2), 'utf8');
  console.log(`✅ ${file}`);
  console.log(`   T1: ${oldPassId} (${oldWc} palabras) → ${newPassId} (${newWc} palabras), ${t1.questions.length} preguntas`);
}
