#!/usr/bin/env node
/**
 * Preventive audit: A2 official topics × Teil structural readiness (offline, no API).
 *
 *   node scripts/audit-topic-cell-preflight-a2.mjs
 *   node scripts/audit-topic-cell-preflight-a2.mjs --json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOETHE_A2_INSTRUCTIONS } from './lib/goethe-a2-modellsatz.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/topic-cell-preflight-a2-2026-07-15.json');
const jsonOut = process.argv.includes('--json');

const A2_TOPICS = ['health', 'work', 'society', 'education'];
const BANK_PATH = path.join(ROOT, 'library/de/A2/questions.json');
const BLUEPRINT_PATH = path.join(ROOT, 'library/blueprints/goethe_A2.json');
const EXAMS_PATH = path.join(ROOT, 'data/exams/de_A2.json');

const CELLS = [
  { module: 'lesen', teil: 1, mechanism: 'press_mcq', expectedSlot: 'press_mcq' },
  { module: 'lesen', teil: 2, mechanism: 'floor_plan_mcq', expectedSlot: 'info_board_mcq' },
  { module: 'lesen', teil: 3, mechanism: 'email_mcq', expectedSlot: 'email_mcq' },
  { module: 'lesen', teil: 4, mechanism: 'ads_matching', expectedSlot: 'ads_matching' },
  { module: 'horen', teil: 1, mechanism: 'short_texts_mcq', expectedSlot: 'short_texts_twice' },
  { module: 'horen', teil: 2, mechanism: 'picture_matching', expectedSlot: 'picture_matching' },
  { module: 'horen', teil: 3, mechanism: 'short_dialogues_mcq', expectedSlot: 'short_dialogues_once' },
  { module: 'horen', teil: 4, mechanism: 'interview_ja_nein', expectedSlot: 'interview_twice' },
  { module: 'schreiben', teil: 1, mechanism: 'sms_task', expectedSlot: 'writing_task' },
  { module: 'schreiben', teil: 2, mechanism: 'email_chef', expectedSlot: 'writing_task' },
  { module: 'sprechen', teil: 1, mechanism: 'personal_questions', expectedSlot: 'speaking_task' },
  { module: 'sprechen', teil: 2, mechanism: 'about_self', expectedSlot: 'speaking_task' },
  { module: 'sprechen', teil: 3, mechanism: 'plan_together', expectedSlot: 'speaking_task' },
];

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function topicTagForExamTopic(topic) {
  const map = {
    health: ['Gesundheit', 'gesund', 'health'],
    work: ['Arbeit', 'Beruf', 'work'],
    society: ['Gesellschaft', 'Stadtleben', 'society'],
    education: ['Bildung', 'Schule', 'education'],
  };
  return map[topic] || [topic];
}

function matchesTopic(item, topic) {
  const tags = [
    ...(item.topicTags || []),
    item.topicTag,
    item.topic,
    item.examTopic,
  ]
    .filter(Boolean)
    .map((t) => String(t).toLowerCase());
  const needles = [topic, ...topicTagForExamTopic(topic)].map((t) => String(t).toLowerCase());
  return tags.some((t) => needles.some((n) => t.includes(n) || n.includes(t)));
}

function bankPoolForCell(bank, module, teil, topic) {
  const passages = (bank.passages || []).filter(
    (p) => p.module === module && Number(p.teil) === teil && matchesTopic(p, topic),
  );
  const questions = (bank.questions || []).filter(
    (q) => q.module === module && Number(q.teil) === teil && matchesTopic(q, topic),
  );
  return { passages, questions };
}

function auditLesenT2Formula(questions) {
  const stockRe = /stock|etage|obergeschoss|untergeschoss|erdgeschoss|welchem stock|welcher etage/i;
  const andererRe = /anderer stock|anderes stockwerk|einem anderen stock/i;
  const stockHits = questions.filter((q) => stockRe.test(String(q.question || '')));
  const andererHits = questions.filter((q) =>
    andererRe.test((q.options || []).map((o) => String(o)).join(' ')),
  );
  const ok = stockHits.length >= 4 && andererHits.length >= 4;
  return {
    ok,
    note: ok
      ? `${stockHits.length}/5 Stock/Etage + ${andererHits.length}/5 «anderer Stock»`
      : `${stockHits.length}/5 Stock/Etage, ${andererHits.length}/5 «anderer Stock» (mín 4+4)`,
  };
}

function auditLesenT4Format(questions) {
  const xCount = questions.filter((q) =>
    String(q.correct || q.correctAnswer || '').toUpperCase() === 'X',
  ).length;
  const gCount = questions.filter((q) =>
    String(q.correct || q.correctAnswer || '').toLowerCase() === 'g',
  ).length;
  const personHits = questions.filter((q) =>
    /\b(Herr|Frau|Lisa|Tom|Maria|sucht|möchte|braucht|Jahre alt)\b/i.test(String(q.question || '')),
  ).length;
  const ok = xCount === 1 && gCount === 0 && personHits >= 4;
  return {
    ok,
    note: ok
      ? `X=${xCount}, sin g, ${personHits}/5 situaciones con persona`
      : `X=${xCount} (espera 1), g=${gCount}, persona=${personHits}/5`,
  };
}

function auditHorenT2Picture(passages, questions) {
  const picPassages = passages.filter((p) => Array.isArray(p.pictures) && p.pictures.length >= 9);
  const matchingQs = questions.filter((q) => String(q.type) === 'matching' && !q.options?.length);
  const weekdays = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
  const days = matchingQs.map((q) => String(q.question || '').trim());
  const missing = weekdays.filter((d) => !days.includes(d));
  return {
    ok: picPassages.length > 0 && matchingQs.length >= 5 && missing.length === 0,
    note:
      `picture passages=${picPassages.length}, matching=${matchingQs.length}` +
      (missing.length ? `, faltan días: ${missing.join(',')}` : ', días OK'),
  };
}

function auditSchreibenT2Chef(questions) {
  const chefHits = questions.filter((q) => /\bChef\b/i.test(String(q.question || '')));
  return {
    ok: chefHits.length > 0,
    note: chefHits.length ? 'consigna E-Mail al Chef presente' : 'falta referencia a Chef en Schreiben T2',
  };
}

function auditExamServed(exams, topic, module, teil) {
  const exam = exams.find((e) => String(e.topic).toLowerCase() === topic);
  if (!exam) return { ok: false, note: 'examen no encontrado en de_A2.json' };
  const partsKey = `${module}Parts`;
  const part = (exam[partsKey] || []).find((p) => Number(p.teil) === teil);
  if (!part) return { ok: false, note: `sin parte servida ${module} T${teil}` };

  if (module === 'horen' && teil === 2) {
    const slot = part.blueprintSlot || part.slotType;
    const pics = part.segments?.[0]?.pictures?.length || 0;
    return {
      ok: slot === 'picture_matching' && pics >= 9,
      note: `served slot=${slot}, pictures=${pics}`,
    };
  }
  if (module === 'schreiben' && teil === 2) {
    const task = part.task || part.instruction || '';
    return {
      ok: /\bChef\b/i.test(task),
      note: /\bChef\b/i.test(task) ? 'served: E-Mail Chef OK' : 'served: sin Chef en T2',
    };
  }
  return { ok: true, note: 'parte servida presente' };
}

function auditCell(topic, cell, bank, blueprint, exams) {
  const bpMod = blueprint.modules?.find((m) => m.id === cell.module);
  const bpPart = bpMod?.parts?.find((p) => Number(p.teil) === cell.teil);
  const pool = bankPoolForCell(bank, cell.module, cell.teil, topic);
  const served = auditExamServed(exams, topic, cell.module, cell.teil);

  let status = 'OK';
  const notes = [];

  if (!bpPart) {
    status = 'PROBLEM';
    notes.push('sin parte en blueprint A2');
  } else if (bpPart.slotType !== cell.expectedSlot) {
    status = 'PROBLEM';
    notes.push(`blueprint slot ${bpPart.slotType} ≠ esperado ${cell.expectedSlot}`);
  }

  if (pool.passages.length + pool.questions.length === 0) {
    status = status === 'PROBLEM' ? status : 'WARN';
    notes.push('pool vacío para tema×teil');
  } else {
    notes.push(`pool: ${pool.passages.length}p + ${pool.questions.length}q`);
  }

  if (!served.ok) {
    status = 'PROBLEM';
    notes.push(`served: ${served.note}`);
  } else {
    notes.push(served.note);
  }

  if (cell.module === 'lesen' && cell.teil === 2 && pool.questions.length) {
    const f = auditLesenT2Formula(pool.questions);
    if (!f.ok) {
      status = status === 'OK' ? 'WARN' : status;
      notes.push(`Lesen T2: ${f.note}`);
    } else notes.push(`Lesen T2: ${f.note}`);
  }

  if (cell.module === 'horen' && cell.teil === 2) {
    const f = auditHorenT2Picture(pool.passages, pool.questions);
    if (!f.ok) {
      status = 'PROBLEM';
      notes.push(`Hören T2: ${f.note}`);
    } else notes.push(`Hören T2: ${f.note}`);
  }

  if (cell.module === 'schreiben' && cell.teil === 2 && pool.questions.length) {
    const f = auditSchreibenT2Chef(pool.questions);
    if (!f.ok) {
      status = status === 'OK' ? 'WARN' : status;
      notes.push(`Schreiben T2: ${f.note}`);
    } else notes.push(`Schreiben T2: ${f.note}`);
  }

  if (cell.module === 'lesen' && cell.teil === 4 && pool.questions.length) {
    const f = auditLesenT4Format(pool.questions);
    if (!f.ok) {
      status = status === 'OK' ? 'WARN' : status;
      notes.push(`Lesen T4: ${f.note}`);
    } else notes.push(`Lesen T4: ${f.note}`);
  }

  return {
    topic,
    module: cell.module,
    teil: cell.teil,
    mechanism: cell.mechanism,
    status,
    note: notes.join('; '),
  };
}

function main() {
  const bank = loadJson(BANK_PATH);
  const blueprint = loadJson(BLUEPRINT_PATH);
  const exams = loadJson(EXAMS_PATH);

  const matrix = [];
  for (const topic of A2_TOPICS) {
    for (const cell of CELLS) {
      matrix.push(auditCell(topic, cell, bank, blueprint, exams));
    }
  }

  const problems = matrix.filter((m) => m.status === 'PROBLEM');
  const warns = matrix.filter((m) => m.status === 'WARN');
  const ok = matrix.filter((m) => m.status === 'OK');

  const report = {
    at: new Date().toISOString(),
    level: 'A2',
    topics: A2_TOPICS.length,
    cells: matrix.length,
    summary: { ok: ok.length, warn: warns.length, problem: problems.length },
    instructions: GOETHE_A2_INSTRUCTIONS,
    passageLengthGate: {
      applies: false,
      reason:
        'Goethe A2 Lesen usa 1 pasaje por Teil (T4 = 6 anuncios cortos exempt); no hay Lesen T2 doble pasaje B1 (CEFR 400).',
    },
    problems,
    warns,
    matrix,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n=== Preflight A2 ${A2_TOPICS.length} temas × ${CELLS.length} Teile (${matrix.length} celdas) ===\n`);
  console.log('topic     | mod      | T | status   | note');
  console.log('----------|----------|---|----------|------');
  for (const m of matrix) {
    console.log(
      `${m.topic.padEnd(9)} | ${m.module.padEnd(8)} | ${String(m.teil).padStart(1)} | ${m.status.padEnd(8)} | ${m.note.slice(0, 52)}`,
    );
  }
  console.log(`\nOK: ${ok.length} · WARN: ${warns.length} · PROBLEM: ${problems.length}`);
  if (problems.length) {
    console.log('\nPENDIENTES:');
    for (const p of problems) console.log(`  ${p.topic} ${p.module} T${p.teil}: ${p.note}`);
  }
  console.log(`\nReport: ${path.relative(ROOT, OUT)}`);
}

main();
