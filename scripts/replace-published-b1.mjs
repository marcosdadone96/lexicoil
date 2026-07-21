#!/usr/bin/env node
/**
 * Reemplaza los exámenes publicados B1 por un único examen POOL-2+GATE-1 limpio.
 *
 *   node scripts/replace-published-b1.mjs --dry-run
 *   node scripts/replace-published-b1.mjs --apply --yes
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { validatePart } from './lib/partGate.mjs';
import { buildLesenSeedRecordFromBatch } from './lib/publishToPool.mjs';
import { isPartPoolReady, isExamPublishable } from './audit-pass-2.mjs';
import {
  buildPublishedExamDoc,
  defaultExamId,
  localPublishedDir,
  OFFICIAL_CELLS,
  seedRecordToSnapshotPayload,
  writePublishedExam,
} from './lib/publishedExamLib.mjs';
import { canonicalPartHash } from './lib/partContentHash.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSEMBLED = path.join(ROOT, 'assembled-exam-b1-clean.json');
const POOL_FILE = path.join(ROOT, 'library/reusable-seed/de_B1.json');
const GENERATED_DIR = path.join(ROOT, 'batches/generated');
const LANG = 'de';
const LEVEL = 'B1';

const APPLY = process.argv.includes('--apply');
const YES = process.argv.includes('--yes');

const PICKS = {
  lesen_1: { file: 'lesen-t1-gemini-154.json', source: 'generated' },
  lesen_2: { file: 'lesen-t2-gemini-064.json', source: 'generated' },
  lesen_3: { file: 'lesen-t3-auto-001.json', source: 'generated' },
  lesen_4: { file: 'lesen-t4-gemini-004.json', source: 'generated' },
  lesen_5: { file: 'lesen-t5-gemini-016.json', source: 'generated' },
  horen_1: { file: 'horen-t1-gemini-001.json', source: 'generated' },
  horen_2: { file: 'horen-t2-gemini-003.json', source: 'generated' },
  horen_3: { file: 'horen-t3-gemini-002.json', source: 'generated' },
  horen_4: { id: 'gen-h4-010', source: 'pool' },
};

function batchToRecord(batch, file, module, teil) {
  const mod = String(module).toLowerCase();
  const t = Number(teil);
  if (mod === 'lesen') {
    const rec = buildLesenSeedRecordFromBatch(batch, { lang: LANG, level: LEVEL, teil: t, idPrefix: 'pub' });
    rec.id = batch.id || file.replace(/\.json$/i, '');
    return rec;
  }
  const passages = batch.passages || [];
  const rec = {
    id: batch.id || file.replace(/\.json$/i, ''),
    module: mod,
    teil: t,
    lang: LANG,
    level: LEVEL,
    questions: batch.questions || [],
  };
  if (mod === 'horen') {
    if (passages.length > 1) {
      rec.segments = passages.map((p, i) => ({
        passageId: p.id,
        label: p.title || `Aufnahme ${i + 1}`,
        text: p.text || p.transcript || '',
        transcript: p.transcript || p.text || '',
        questions: (batch.questions || []).filter((q) => q.passageId === p.id),
      }));
    }
    rec.passage = passages[0]
      ? { title: passages[0].title, text: passages[0].text, transcript: passages[0].transcript || passages[0].text }
      : null;
    return rec;
  }
  rec.task = batch.task || batch.instruction || passages[0]?.text || '';
  return rec;
}

async function resolveRecord(cell, partId) {
  const [module, teilStr] = cell.split('_');
  const teil = Number(teilStr);
  const pick = PICKS[cell];

  if (pick?.source === 'generated') {
    const batch = normalizeBatch(
      JSON.parse(fs.readFileSync(path.join(GENERATED_DIR, pick.file), 'utf8')),
      { module, teil, lang: LANG, level: LEVEL },
    );
    return batchToRecord(batch, pick.file, module, teil);
  }

  const pool = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));
  const rec = (pool.records || pool).find((r) => r.id === partId);
  if (!rec) throw new Error(`${cell}: record ${partId} not in pool`);
  return rec;
}

async function main() {
  if (!fs.existsSync(ASSEMBLED)) {
    console.error('Falta assembled-exam-b1-clean.json — ejecuta: node scripts/assemble-clean-exam.mjs');
    process.exit(1);
  }

  const assembled = JSON.parse(fs.readFileSync(ASSEMBLED, 'utf8'));
  const gate1 = isExamPublishable(assembled);
  if (!gate1.ok) {
    console.error('assembled-exam-b1-clean.json no pasa GATE-1');
    process.exit(1);
  }

  const parts = [];
  for (const cell of OFFICIAL_CELLS) {
    const partId = assembled._meta.partIds[cell];
    if (!partId) throw new Error(`Missing partId for ${cell}`);
    const record = await resolveRecord(cell, partId);
    const poolGate = await isPartPoolReady(record, { semantic: false, skipSem2: true });
    if (!poolGate.ok) {
      console.error(`✗ ${cell} POOL-2 FAIL: ${poolGate.blocking?.[0]?.id}`);
      process.exit(1);
    }
    const snapshot = seedRecordToSnapshotPayload(record);
    const { module, teil } = { module: cell.split('_')[0], teil: Number(cell.split('_')[1]) };
    parts.push({
      cell,
      module,
      teil,
      partId: record.id,
      contentHash: canonicalPartHash(snapshot),
      snapshot,
    });
    console.log(`✓ ${cell} → ${record.id}`);
  }

  const examId = defaultExamId(LANG, LEVEL, 1);
  const doc = buildPublishedExamDoc({
    examId,
    lang: LANG,
    level: LEVEL,
    title: 'Official B1 Exam 1',
    slot: 1,
    parts,
    status: 'live',
    manifestVersion: 1,
    gate1: { ok: true, blocking: 0, advisory: assembled._meta.gate1?.advisory || 0 },
    sourceAssembled: 'assembled-exam-b1-clean.json',
  });

  const pubDir = localPublishedDir(LANG, LEVEL);
  const toRemove = [];
  if (fs.existsSync(pubDir)) {
    for (const f of fs.readdirSync(pubDir)) {
      if (f.startsWith('official-de-B1-e') && f.endsWith('.json')) toRemove.push(f);
    }
  }

  console.log(`\n=== ${APPLY ? 'APPLY' : 'DRY-RUN'} ===`);
  console.log(`  Publicar: ${examId} (${parts.length} partes POOL-2 OK)`);
  console.log(`  Eliminar: ${toRemove.length} exámenes antiguos (${toRemove.join(', ') || 'ninguno'})`);
  console.log(`  Catálogo: 1 examen live`);

  if (!APPLY) {
    console.log('\n[DRY-RUN] Añade --apply --yes para escribir.');
    return;
  }

  if (!YES) {
    console.error('Añade --yes para confirmar.');
    process.exit(1);
  }

  for (const f of toRemove) {
    fs.unlinkSync(path.join(pubDir, f));
  }

  await writePublishedExam({ store: null, lang: LANG, level: LEVEL, doc, applyLocal: true, applyBlob: false });

  const catalog = {
    schema: 'published-catalog/v1',
    version: new Date().toISOString(),
    lang: LANG,
    level: LEVEL,
    exams: [
      {
        examId,
        slot: 1,
        title: doc.title,
        status: 'live',
        manifestVersion: 1,
        publishedAt: doc.publishedAt,
      },
    ],
  };
  fs.mkdirSync(pubDir, { recursive: true });
  fs.writeFileSync(path.join(pubDir, '_catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

  console.log(`\n✅ Publicado ${examId} — catálogo actualizado (solo E1)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
