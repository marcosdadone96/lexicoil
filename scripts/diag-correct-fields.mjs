import { readFileSync } from 'fs';

function auditFile(path, label) {
  const raw = readFileSync(path, 'utf8');
  const data = JSON.parse(raw);
  // de_B1.json has { records: [...] }, curated exams are plain arrays
  const records = Array.isArray(data) ? data : Array.isArray(data.records) ? data.records : [data];

  let totalQ = 0, missingCorrect = 0, onlyCorrect = 0, bothPresent = 0, missingBoth = 0;
  const missingExamples = [];
  const seen = new Set();

  function checkQ(q, recId) {
    const key = q.id || `${recId}_${totalQ}`;
    if (seen.has(key)) return;
    seen.add(key);
    totalQ++;
    const hasC = q.correct != null && q.correct !== '';
    const hasCA = q.correctAnswer != null && q.correctAnswer !== '';
    if (!hasC && hasCA) {
      missingCorrect++;
      if (missingExamples.length < 6)
        missingExamples.push({ recId, qId: q.id, correctAnswer: q.correctAnswer });
    } else if (!hasC && !hasCA) {
      missingBoth++;
    } else if (hasC && !hasCA) {
      onlyCorrect++;
    } else {
      bothPresent++;
    }
  }

  for (const rec of records) {
    const id = rec.id || rec._id || '?';
    // pool/seed records
    for (const q of rec.questions || []) checkQ(q, id);
    for (const seg of rec.segments || []) for (const q of seg.questions || []) checkQ(q, id);
    // curated exam records
    for (const part of [...(rec.lesenParts || []), ...(rec.horenParts || []), ...(rec.schreibenParts || [])]) {
      for (const q of part.questions || []) checkQ(q, id);
      for (const seg of part.segments || []) for (const q of seg.questions || []) checkQ(q, id);
    }
  }

  console.log(`\n=== ${label} (${records.length} records) ===`);
  console.log(`  Total questions (deduped):       ${totalQ}`);
  console.log(`  both correct + correctAnswer:    ${bothPresent}`);
  console.log(`  only correct  (no correctAnswer): ${onlyCorrect}  ← fine`);
  console.log(`  only correctAnswer (no correct):  ${missingCorrect}  ← RISK: grader fails silently`);
  console.log(`  neither field present:            ${missingBoth}`);
  if (missingExamples.length) {
    console.log('  Examples with missing correct:');
    for (const e of missingExamples) console.log('   ', JSON.stringify(e));
  }
}

auditFile('library/reusable-seed/de_B1.json', 'reusable-seed B1');
auditFile('data/exams/de_B1.json', 'curated exams B1');

// Check A2 if exists
try {
  auditFile('library/reusable-seed/de_A2.json', 'reusable-seed A2');
} catch { /* skip */ }
try {
  auditFile('data/exams/de_A2.json', 'curated exams A2');
} catch { /* skip */ }
