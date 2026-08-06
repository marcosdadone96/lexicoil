#!/usr/bin/env node
// One-shot fix for the two remaining T2 incomplete exams.
import fs from 'node:fs';
const bank = JSON.parse(fs.readFileSync('library/de/B1/questions.json', 'utf8'));
const passages = JSON.parse(fs.readFileSync('library/de/B1/passages.json', 'utf8'));
const passMap = new Map(passages.passages.map((p) => [p.id, p]));

function toQ(q) {
  return {
    id: 'ql_' + q.id,
    type: q.type || 'multiple',
    question: q.question || '',
    correct: q.correct || q.correctAnswer || '',
    correctAnswer: q.correctAnswer || q.correct || '',
    options: q.options || [],
    explanation: q.explanation || '',
    grammarTags: q.grammarTags || [],
    topicTags: q.topicTags || [],
    vocabularyTags: q.vocabularyTags || [],
    difficulty: q.difficulty || 3,
    passageId: q.passageId || '',
  };
}

// ── Fix 4ef471830279 (daily_life): T2 foodsharing-a → add radtourismus-b ────
{
  const file = 'library/curated/de/B1/curated_de_B1_4ef471830279.json';
  const x = JSON.parse(fs.readFileSync(file, 'utf8'));
  const t2 = x.exam.lesenParts.find((p) => p.teil === 2);
  const AID = 'de-b1-p-lesen-t2-foodsharing-a';
  const BID = 'de-b1-p-lesen-t2-radtourismus-b';
  const aItems = bank.questions.filter((q) => q.passageId === AID);
  const bItems = bank.questions.filter((q) => q.passageId === BID);
  const bPassage = passMap.get(BID);
  // Ensure 3 A + 3 B questions
  const existingAQs = (t2.questions || []).filter((q) => q.passageId === AID);
  const aToAdd = aItems.filter((q) => !existingAQs.find((e) => e.id === 'ql_' + q.id)).slice(0, 3 - existingAQs.length);
  const newBQs = bItems.map(toQ);
  t2.questions = [...existingAQs, ...aToAdd.map(toQ), ...newBQs];
  // Set up passages array so the UI can render both texts
  t2.passages = [
    { passageId: AID, textTitle: t2.textTitle || 'Lebensmittel retten', text: t2.text || '' },
    { passageId: BID, textTitle: bPassage?.title || bPassage?.textTitle || 'Radurlaub in Deutschland', text: bPassage?.text || '' },
  ];
  fs.writeFileSync(file, JSON.stringify(x, null, 2));
  console.log(`4ef47 T2: ${t2.questions.length} preguntas (A:${t2.questions.filter(q=>q.passageId===AID).length} B:${t2.questions.filter(q=>q.passageId===BID).length})`);
}

// ── Fix b84732dc8afc (work): Replace T2 with ernaehrung-bio-discount pair ────
{
  const file = 'library/curated/de/B1/curated_de_B1_b84732dc8afc.json';
  const x = JSON.parse(fs.readFileSync(file, 'utf8'));
  const t2 = x.exam.lesenParts.find((p) => p.teil === 2);
  const AID = 'de-b1-p-lesen-t2-ernaehrung-bio-discount-01-a';
  const BID = 'de-b1-p-lesen-t2-ernaehrung-bio-discount-01-b';
  const aItems = bank.questions.filter((q) => q.passageId === AID);
  const bItems = bank.questions.filter((q) => q.passageId === BID);
  const aPassage = passMap.get(AID);
  const bPassage = passMap.get(BID);
  t2.passageId = AID;
  t2.textTitle = aPassage?.title || aPassage?.textTitle || 'Bio-Lebensmittel';
  t2.text = aPassage?.text || '';
  t2.passages = [
    { passageId: AID, textTitle: t2.textTitle, text: t2.text },
    { passageId: BID, textTitle: bPassage?.title || bPassage?.textTitle || 'Discount-Supermarkt', text: bPassage?.text || '' },
  ];
  t2.questions = [...aItems.map(toQ), ...bItems.map(toQ)];
  fs.writeFileSync(file, JSON.stringify(x, null, 2));
  console.log(`b84732 T2: ${t2.questions.length} preguntas (A:${aItems.length} B:${bItems.length})`);
}

console.log('Listo.');
