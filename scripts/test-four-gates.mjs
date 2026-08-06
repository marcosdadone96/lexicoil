#!/usr/bin/env node
/**
 * Verifica los 4 gates cerrados (Flash pipeline):
 *   CHK-14c  — mayúsculas MCQ T2/T5
 *   CHK-18b  — clave vs explicación
 *   CHK-26   — topic T3 sin passages
 *   CHK-29   — molde estructural T4/T5
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { checkStructuralMoldDuplicate } from './lib/structuralMoldDedup.mjs';
import {
  analyzeExplanationMismatch,
  filterForbiddenOverlapTokens,
} from './lib/keyExplanationGate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN = path.join(ROOT, 'batches', 'generated');

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(GEN, name), 'utf8'));
}

async function poolFindings(batch) {
  batch.module = batch.module || 'lesen';
  batch.teil = batch.teil ?? batch.questions?.[0]?.teil;
  const gate = await isPartPoolReady(batch, { semantic: false, skipSem2: true });
  return gate.blocking || [];
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`OK: ${msg}`);
  return true;
}

async function main() {
  // Gate 1 — CHK-14c (t2-083: «allein Verantwortlich»)
  {
    const batch = load('lesen-t2-gemini-083.json');
    const hits = (await poolFindings(batch)).filter((f) => f.id === 'CHK-14c');
    assert(hits.length > 0, 'CHK-14c bloquea t2-083 (Verantwortlich en opción)');
  }

  // Gate 2 — CHK-18b (t2-084 Q3: clave c, explicación motiviert → b)
  {
    const batch = load('lesen-t2-gemini-084.json');
    const hits = (await poolFindings(batch)).filter((f) => f.id === 'CHK-18b');
    assert(hits.length > 0, 'CHK-18b bloquea t2-084 Q3 clave↔explicación');
  }

  // CHK-18b repair — tokens compartidos con opción correcta no se prohíben
  {
    const correctBody = 'Der Eintritt wird in Euro an der Kasse bezahlt.';
    const wrongBody = 'Man bezahlt den Eintritt in Euro bar am Eingang.';
    const expl =
      'Im Text steht, dass man den Eintritt in Euro bar am Eingang bezahlen kann, deshalb passt b).';
    const hit = analyzeExplanationMismatch(
      {
        id: 'gen-q-test-euro',
        module: 'lesen',
        teil: 5,
        type: 'multiple_choice',
        correct: 'a',
        correctAnswer: 'a',
        options: [
          `a) ${correctBody}`,
          `b) ${wrongBody}`,
          'c) Der Eintritt ist immer kostenlos für alle.',
        ],
        explanation: expl,
      },
      { module: 'lesen', teil: 5 },
    );
    assert(hit != null, 'CHK-18b repair test: mismatch sintético detectado');
    assert(
      !hit.overlapTokens.includes('euro'),
      'CHK-18b repair: «Euro» compartido con opción correcta no está en overlapTokens',
    );
    const filtered = filterForbiddenOverlapTokens(['euro', 'eingang', 'bar'], correctBody);
    assert(
      !filtered.includes('euro'),
      'CHK-18b repair: filterForbiddenOverlapTokens excluye «Euro» si está en la opción correcta',
    );
    assert(
      filtered.includes('eingang') || filtered.includes('bar'),
      'CHK-18b repair: tokens exclusivos de la incorrecta sí se prohíben',
    );
  }

  // Gate 3 — CHK-26 T3 (t3-073 Ernährung vs contenido Technik)
  {
    const batch = load('lesen-t3-gemini-073.json');
    const hits = (await poolFindings(batch)).filter(
      (f) => f.id === 'CHK-26' && /T3 detectado|lesen-3/i.test(f.message),
    );
    assert(hits.length > 0, 'CHK-26 bloquea t3-073 (Ernährung vs Technik)');
  }

  // Gate 4 — CHK-29 (dos T5 mismo subtipo en celda)
  {
    const a = {
      teil: 5,
      module: 'lesen',
      topicTag: 'Gesundheit',
      _textSubtype: 'krankenhaus-alltag',
      passages: [{ title: 'Im Krankenhaus — Alltag der Pflege', text: 'x'.repeat(80) }],
      questions: [{ module: 'lesen', teil: 5, id: 'q1' }],
      id: 'mock-a',
    };
    const b = {
      ...a,
      id: 'mock-b',
      passages: [{ title: 'Station 12 — ein Tag in der Klinik', text: 'y'.repeat(80) }],
    };
    const r = checkStructuralMoldDuplicate(b, [a], { teil: 5 });
    assert(!r.ok && /CHK-29|molde estructural/i.test(r.issue || ''), 'CHK-29 bloquea T5 subtipo duplicado');
  }

  // Retro-scan: 14 partes Flash sample (si existe informe)
  const reportPath = path.join(GEN, 'pool-fill-fresh-sample-report.json');
  if (fs.existsSync(reportPath)) {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const okFiles = (report.attempts || report.rows || [])
      .filter((r) => r.ok && r.file)
      .map((r) => r.file.replace(/^.*\//, ''));

    let blocked = 0;
    for (const file of okFiles) {
      const abs = path.join(GEN, file);
      if (!fs.existsSync(abs)) continue;
      const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
      const findings = await poolFindings(batch);
      const gateIds = new Set(['CHK-14c', 'CHK-18b', 'CHK-26', 'CHK-29']);
      const hit = findings.filter((f) => gateIds.has(f.id));
      if (hit.length) {
        blocked += 1;
        console.log(`  retro ${file}: ${hit.map((f) => f.id).join(', ')}`);
      }
    }
    console.log(`Retro-scan: ${blocked}/${okFiles.length} partes OK habrían sido bloqueadas por los 4 gates`);
  }

  if (process.exitCode) {
    console.error('\nAlgunos tests fallaron.');
  } else {
    console.log('\nTodos los gates verificados.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
