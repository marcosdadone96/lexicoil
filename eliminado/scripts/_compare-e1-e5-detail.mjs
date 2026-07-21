#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalPartHash } from './lib/partContentHash.mjs';
import { seedRecordToSnapshotPayload } from './lib/publishedExamLib.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/reusable-seed/de_B1.json'), 'utf8'));
const byId = new Map(seed.records.map((r) => [r.id, r]));
const l1Parts = new Set(seed._l1DecapParts || []);
const l2PartIds = new Set((seed._l2ExamFixes || []).map((f) => f.partId));

function collectStrings(obj, acc = []) {
  if (typeof obj === 'string') acc.push(obj);
  else if (Array.isArray(obj)) for (const v of obj) collectStrings(v, acc);
  else if (obj && typeof obj === 'object') for (const v of Object.values(obj)) collectStrings(v, acc);
  return acc;
}

function getExamPart(exam, cell) {
  const [mod, teilStr] = cell.split('_');
  const teil = Number(teilStr);
  return (exam[`${mod}Parts`] || []).find((p) => Number(p.teil) === teil) || null;
}

function hashRec(rec) {
  return rec ? canonicalPartHash(seedRecordToSnapshotPayload(rec)) : null;
}

const FIX_L1 = '2026-07-03T21:10:52.394Z';
const FIX_L2 = '2026-07-03T21:14:04.800Z';

for (let n = 1; n <= 5; n++) {
  const asm = JSON.parse(fs.readFileSync(path.join(ROOT, `assembled-exam-b1-e${n}.json`), 'utf8'));
  const gen = asm._meta.generatedAt;
  console.log(`\n## E${n}`);
  console.log(`generatedAt: ${gen}`);
  console.log(`post-L1: ${Date.parse(gen) >= Date.parse(FIX_L1) ? 'sí' : 'no'} | post-L2: ${Date.parse(gen) >= Date.parse(FIX_L2) ? 'sí' : 'no'}`);

  const touched = [];
  for (const [cell, partId] of Object.entries(asm._meta.partIds)) {
    if (!l1Parts.has(partId) && !l2PartIds.has(partId)) continue;
    const rec = byId.get(partId);
    const ap = getExamPart(asm.exam, cell);
    const asmText = collectStrings(ap || {}).join('\n');
    const seedText = collectStrings(rec || {}).join('\n');
    const match = asmText === seedText;
    const tags = [];
    if (l1Parts.has(partId)) tags.push('L1');
    if (l2PartIds.has(partId)) tags.push('L2');
    touched.push({ cell, partId: partId.slice(-12), tags: tags.join('+'), match, asmLen: asmText.length, seedLen: seedText.length });
  }

  if (!touched.length) {
    console.log('partes tocadas hoy: ninguna en este examen');
  } else {
    console.log('partes tocadas hoy:');
    for (const t of touched) {
      console.log(`  ${t.cell} …${t.partId} [${t.tags}] assembled=seed text: ${t.match ? 'SÍ' : 'NO'} (asm ${t.asmLen} / seed ${t.seedLen})`);
    }
  }
}
