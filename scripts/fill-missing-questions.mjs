#!/usr/bin/env node
/**
 * fill-missing-questions.mjs — Rellena huecos en T1, T2 y T5 de exámenes curated
 * usando el banco de preguntas y el espejo de pasajes.
 *
 * Para T1 y T5: busca preguntas en el banco con el mismo passageId que la parte.
 * Para T2: busca las preguntas de AMBOS pasajes (A y B) y añade el texto del
 *   segundo pasaje desde passages.json si falta en el examen.
 *
 * Uso:
 *   node scripts/fill-missing-questions.mjs --dir library/curated/de/B1 \
 *     --bank library/de/B1/questions.json \
 *     --passages library/de/B1/passages.json \
 *     [--write] [--report report.json]
 */
import fs from 'node:fs';
import path from 'node:path';

function arg(name, def) {
  const i = process.argv.indexOf(name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const dir       = arg('--dir',      'library/curated/de/B1');
const bankPath  = arg('--bank',     'library/de/B1/questions.json');
const passPath  = arg('--passages', 'library/de/B1/passages.json');
const doWrite   = !!arg('--write',  false);
const reportPath = arg('--report',  null);

const bank     = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
const passagesRaw = JSON.parse(fs.readFileSync(passPath, 'utf8'));

/** Map: passageId → passage object */
const passageMap = new Map();
for (const p of passagesRaw.passages || []) {
  if (p.id) passageMap.set(p.id, p);
}

/** Map: passageId → bank questions[] for that passage */
const byPassage = new Map();
for (const q of bank.questions || []) {
  if (!q.passageId) continue;
  if (!byPassage.has(q.passageId)) byPassage.set(q.passageId, []);
  byPassage.get(q.passageId).push(q);
}

// IDs already used across exams (to avoid reuse when possible)
const usedIds = new Set();

function bankToExamQuestion(q, prefix) {
  const id = `ql_${q.id}${prefix ? '-' + prefix : ''}`;
  return {
    id,
    type: q.type || 'multiple',
    question: q.question || q.statement || '',
    correct: q.correct || q.correctAnswer || '',
    correctAnswer: q.correctAnswer || q.correct || '',
    explanation: q.explanation || '',
    options: q.options || [],
    grammarTags: q.grammarTags || [],
    topicTags: q.topicTags || [],
    vocabularyTags: q.vocabularyTags || [],
    difficulty: q.difficulty || 3,
    passageId: q.passageId || '',
  };
}

/** Get bank items for a passageId, sorted by id, excluding already-used */
function getItems(passageId, needed, alreadyInExam) {
  const examIds = new Set(alreadyInExam.map((q) => (q.id || '').replace(/^ql_/, '').replace(/-[0-9a-f]{8}$/, '')));
  const bankItems = (byPassage.get(passageId) || [])
    .filter((q) => !examIds.has(q.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  // Prefer unused across exams, but allow reuse if needed
  const unused = bankItems.filter((q) => !usedIds.has(q.id));
  return unused.length >= needed ? unused.slice(0, needed) : bankItems.slice(0, needed);
}

// ── Process files ─────────────────────────────────────────────────────────────
const files = fs.readdirSync(dir).filter((f) => f.startsWith('curated') && f.endsWith('.json'));
const report = { files: 0, t1Added: 0, t2Added: 0, t5Added: 0, t2PassageAdded: 0, details: [] };

for (const file of files) {
  const full = path.join(dir, file);
  const x = JSON.parse(fs.readFileSync(full, 'utf8'));
  const e = x.exam || {};
  const tok = file.match(/_([0-9a-f]{8,12})\.json$/i)?.[1]?.slice(0, 8) || 'xxx';
  const detail = { file, changes: [] };

  for (const p of e.lesenParts || []) {
    // ── T1: fill missing questions ───────────────────────────────────────────
    if (p.teil === 1) {
      const target = 6;
      const existing = p.questions || [];
      if (existing.length < target && p.passageId) {
        const toAdd = getItems(p.passageId, target - existing.length, existing);
        if (toAdd.length > 0) {
          const newItems = toAdd.map((q) => bankToExamQuestion(q, tok));
          p.questions = [...existing, ...newItems];
          toAdd.forEach((q) => usedIds.add(q.id));
          report.t1Added += newItems.length;
          detail.changes.push(`T1: +${newItems.length} preguntas (${p.passageId})`);
        } else {
          detail.changes.push(`T1: DÉFICIT — banco sin preguntas adicionales para ${p.passageId}`);
        }
      }
    }

    // ── T2: fill questions for both passages ─────────────────────────────────
    if (p.teil === 2) {
      const target = 6; // 3 per passage × 2 passages
      const existing = p.questions || [];
      const existingPassageIds = new Set(existing.map((q) => q.passageId).filter(Boolean));

      // If T2 has a passageId, find its counterpart (A ↔ B pair)
      const partPassId = p.passageId;

      // Fill questions for the main passage (A)
      if (partPassId && existing.filter((q) => q.passageId === partPassId).length < 3) {
        const toAdd = getItems(partPassId, 3 - existing.filter((q) => q.passageId === partPassId).length, existing.filter((q) => q.passageId === partPassId));
        if (toAdd.length > 0) {
          const newItems = toAdd.map((q) => bankToExamQuestion(q, tok));
          p.questions = [...existing, ...newItems];
          toAdd.forEach((q) => usedIds.add(q.id));
          report.t2Added += newItems.length;
          detail.changes.push(`T2 passageA: +${newItems.length} preguntas`);
        }
      }

      // Find the paired B (or A) passage
      // Convention: passageId ending in -a pairs with -b (and vice versa)
      let bPassageId = null;
      let aPassageId = null;
      if (partPassId) {
        if (partPassId.endsWith('-a')) {
          // Main is A → find B
          bPassageId = partPassId.slice(0, -2) + '-b';
          if (!byPassage.has(bPassageId)) bPassageId = null;
        } else if (partPassId.endsWith('-b')) {
          // Main is B → find A (the A questions need to be added too)
          aPassageId = partPassId.slice(0, -2) + '-a';
          if (!byPassage.has(aPassageId)) aPassageId = null;
          bPassageId = null; // B is already the main text
        } else {
          // Try with different separator patterns
          const withA = partPassId + '-a';
          const withB = partPassId + '-b';
          if (byPassage.has(withB)) bPassageId = withB;
        }
      }

      // If main is B, fill A questions into the same part
      if (aPassageId && byPassage.has(aPassageId)) {
        const currentAQuestions = (p.questions || []).filter((q) => q.passageId === aPassageId);
        const aToAdd = getItems(aPassageId, 3 - currentAQuestions.length, currentAQuestions);
        if (aToAdd.length > 0) {
          const newItems = aToAdd.map((q) => bankToExamQuestion(q, tok));
          p.questions = [...(p.questions || []), ...newItems];
          aToAdd.forEach((q) => usedIds.add(q.id));
          report.t2Added += newItems.length;
          detail.changes.push(`T2 passageA: +${newItems.length} preguntas (${aPassageId})`);
        }
      }

      if (bPassageId && byPassage.has(bPassageId)) {
        const currentBQuestions = (p.questions || []).filter((q) => q.passageId === bPassageId);
        const bToAdd = getItems(bPassageId, 3 - currentBQuestions.length, currentBQuestions);

        if (bToAdd.length > 0) {
          // Add passage B text if not present
          if (!p.passages || !p.passages.find((pp) => pp.passageId === bPassageId)) {
            const bPassage = passageMap.get(bPassageId);
            if (bPassage) {
              if (!p.passages) p.passages = [];
              p.passages.push({
                passageId: bPassageId,
                textTitle: bPassage.title || bPassage.textTitle || '',
                text: bPassage.text || '',
              });
              report.t2PassageAdded++;
              detail.changes.push(`T2 passageB texto añadido (${bPassageId})`);
            }
          }

          const newItems = bToAdd.map((q) => bankToExamQuestion(q, tok));
          p.questions = [...(p.questions || []), ...newItems];
          bToAdd.forEach((q) => usedIds.add(q.id));
          report.t2Added += newItems.length;
          detail.changes.push(`T2 passageB: +${newItems.length} preguntas (${bPassageId})`);
        }
      } else if (!bPassageId) {
        detail.changes.push(`T2: no se encontró pasaje B para ${partPassId}`);
      }
    }

    // ── T5: fill missing questions ───────────────────────────────────────────
    if (p.teil === 5) {
      const target = 4;
      const existing = p.questions || [];
      if (existing.length < target && p.passageId) {
        const toAdd = getItems(p.passageId, target - existing.length, existing);
        if (toAdd.length > 0) {
          const newItems = toAdd.map((q) => bankToExamQuestion(q, tok));
          p.questions = [...existing, ...newItems];
          toAdd.forEach((q) => usedIds.add(q.id));
          report.t5Added += newItems.length;
          detail.changes.push(`T5: +${newItems.length} preguntas (${p.passageId})`);
        } else {
          detail.changes.push(`T5: DÉFICIT — banco sin preguntas adicionales para ${p.passageId}`);
        }
      }
    }
  }

  report.details.push(detail);
  report.files++;
  if (doWrite) fs.writeFileSync(full, JSON.stringify(x, null, 2), 'utf8');
}

// ── Output ────────────────────────────────────────────────────────────────────
console.log('\n══ fill-missing-questions ════════════════════════════');
console.log(`Archivos: ${report.files}`);
console.log(`T1 añadidas: ${report.t1Added}`);
console.log(`T2 añadidas: ${report.t2Added} (${report.t2PassageAdded} textos de pasaje B añadidos)`);
console.log(`T5 añadidas: ${report.t5Added}`);
console.log(doWrite ? 'MODO ESCRITURA: archivos actualizados.' : 'DRY-RUN (usa --write para guardar).');
console.log('');

for (const d of report.details) {
  if (d.changes.length === 0) {
    console.log(`  ✅ ${d.file}: sin cambios`);
  } else {
    console.log(`  📝 ${d.file}:`);
    d.changes.forEach((c) => console.log(`       ${c}`));
  }
}

if (reportPath) {
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nInforme guardado: ${reportPath}`);
}
console.log('');
