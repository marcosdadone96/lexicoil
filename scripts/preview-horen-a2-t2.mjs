#!/usr/bin/env node
/** Preview HTML for generated Hören A2 T2 picture_matching part. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { buildExamSeedRecordFromBatch } from './lib/publishToPool.mjs';
import { partRecordToExamPart } from './audit-pass-2.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const batchPath = process.argv[2] || path.join(ROOT, 'batches/generated/horen-t2-gemini-040.json');
const raw = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
const batch = normalizeBatch(raw, { module: 'horen', teil: 2, lang: 'de', level: 'A2' });
const record = buildExamSeedRecordFromBatch(batch, { module: 'horen', teil: 2, lang: 'de', level: 'A2' });
const part = partRecordToExamPart(record);
part.instruction =
  'Sie hören ein Gespräch. Sie hören den Text einmal.\nWählen Sie für die Aufgaben 6 bis 10 ein passendes Bild aus a bis i.';

const seg = part.segments[0];
const pics = seg.pictures || [];
const qs = seg.questions || [];

console.log('=== Hören A2 T2 — picture_matching preview ===');
console.log('File:', path.relative(ROOT, batchPath));
console.log('Dialog (excerpt):', String(seg.transcript).slice(0, 120) + '…');
console.log('\nBanco compartido (9 actividades):');
pics.forEach((p) => console.log(`  ${p.key}) ${p.icon} ${p.label}`));
console.log('\nPreguntas (día → letra única):');
const used = new Set();
qs.forEach((q, i) => {
  const c = String(q.correct).toLowerCase();
  used.add(c);
  console.log(`  ${i + 6}. ${q.question} → ${c}`);
});
console.log(`\nUnicidad: ${used.size} letras distintas de 5 preguntas — ${used.size === 5 ? 'OK' : 'FAIL'}`);
console.log('Blueprint slot:', part.blueprintSlot);
