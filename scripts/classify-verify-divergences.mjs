#!/usr/bin/env node
/**
 * classify-verify-divergences.mjs — diagnóstico de CONTENT_DIFFERS (solo lectura).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import {
  buildUpdatedPayload,
  normalizeCompareText,
  countRealAds,
} from './lib/mergeSeedBlobPayload.mjs';
import {
  loadBlobIndexStrict,
  fetchBlobPayloadStrict,
  abortVerifyMessage,
  BlobStoreReadError,
} from './lib/pushSeedBlobStrict.mjs';

loadEnvFile();

const require = createRequire(import.meta.url);
const { getStore } = require('@netlify/blobs');

const seedRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/reusable-seed/de_B1.json'), 'utf8'));
const seedArr = seedRaw.records || seedRaw;

const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
if (!siteID || !token) {
  console.error('Missing NETLIFY credentials');
  process.exit(1);
}

const store = getStore({ name: 'lexicoil-data', siteID, token });

function norm(v) { return v === undefined ? null : v; }
function normArr(v) { return (v == null || (Array.isArray(v) && v.length === 0)) ? null : v; }

function verifyFields(expected, blobPart) {
  const fields = ['passage', 'questions', 'segments', 'ads', 'instruction', 'complete', 'verified', '_deprecated', '_deprecatedReason'];
  const diffs = [];
  for (const field of fields) {
    const sv = ['questions', 'segments'].includes(field) ? normArr(expected[field]) : norm(expected[field]);
    const bv = ['questions', 'segments'].includes(field) ? normArr(blobPart[field]) : norm(blobPart[field]);
    if (JSON.stringify(sv) !== JSON.stringify(bv)) diffs.push(field);
  }
  return diffs;
}

function isEmptyish(v) {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0);
}

function passageText(part) {
  if (!part?.passage) return '';
  return String(part.passage.text ?? '').trim();
}

function instructionText(part) {
  return String(part.instruction ?? part.passage?.instruction ?? '').trim();
}

function structuralPassageDiff(blobPassage, expPassage) {
  if (!blobPassage && !expPassage) return { cosmetic: true, notes: ['both null'] };
  const b = blobPassage || {};
  const e = expPassage || {};
  const notes = [];

  const textSame = normalizeCompareText(b.text) === normalizeCompareText(e.text);
  const titleSame = normalizeCompareText(b.title) === normalizeCompareText(e.title);
  if (!textSame) notes.push(`passage.text REAL: blob ${(b.text || '').length} chars vs expected ${(e.text || '').length} chars`);
  if (!titleSame && (b.title || e.title)) notes.push(`passage.title differs`);

  const bTrans = b.transcript;
  const eTrans = e.transcript;
  if (!isEmptyish(bTrans) || !isEmptyish(eTrans)) {
    if (normalizeCompareText(bTrans) !== normalizeCompareText(eTrans)) {
      notes.push(`passage.transcript REAL: "${String(bTrans).slice(0, 40)}" vs "${String(eTrans).slice(0, 40)}"`);
    }
  } else if (bTrans !== eTrans) {
    notes.push(`passage.transcript structural: blob=${JSON.stringify(bTrans)} expected=${JSON.stringify(eTrans)}`);
  }

  const bAds = b.ads;
  const eAds = e.ads;
  const bReal = countRealAds(bAds);
  const eReal = countRealAds(eAds);
  if (bReal !== eReal || (bReal > 0 && JSON.stringify(bAds) !== JSON.stringify(eAds))) {
    notes.push(`passage.ads REAL: blob real=${bReal} expected real=${eReal}`);
  } else if (JSON.stringify(normArr(bAds)) !== JSON.stringify(normArr(eAds))) {
    notes.push(`passage.ads structural: blob=${JSON.stringify(bAds)} expected=${JSON.stringify(eAds)}`);
  }

  const cosmetic = notes.every(n => n.includes('structural') || n.includes('both null'));
  const real = notes.some(n => n.includes(' REAL:'));
  return { cosmetic: !real, real, notes };
}

function structuralAdsDiff(blobAds, expAds) {
  const bReal = countRealAds(blobAds);
  const eReal = countRealAds(expAds);
  if (bReal !== eReal) return { cosmetic: false, real: true, notes: [`top-level ads REAL: blob real=${bReal} expected real=${eReal}`] };
  if (JSON.stringify(normArr(blobAds)) !== JSON.stringify(normArr(expAds))) {
    return { cosmetic: true, real: false, notes: [`top-level ads structural: blob=${JSON.stringify(blobAds)} expected=${JSON.stringify(expAds)}`] };
  }
  return { cosmetic: true, real: false, notes: [] };
}

function instructionDiff(blobPart, expected) {
  const bt = instructionText(blobPart);
  const et = instructionText({ instruction: expected.instruction, passage: expected.passage });
  if (normalizeCompareText(bt) === normalizeCompareText(et)) {
    if (blobPart.instruction !== expected.instruction) {
      return { cosmetic: true, real: false, notes: [`instruction structural: blob=${JSON.stringify(blobPart.instruction)} expected=${JSON.stringify(expected.instruction)}`] };
    }
    return { cosmetic: true, real: false, notes: [] };
  }
  return { cosmetic: false, real: true, notes: [`instruction REAL: blob ${bt.length} chars vs expected ${et.length} chars`] };
}

function questionsDiff(blobQs, expQs) {
  const byId = (qs) => Object.fromEntries((qs || []).map(q => [q.id, q]));
  const bMap = byId(blobQs);
  const eMap = byId(expQs);
  const notes = [];
  let real = false;
  for (const id of new Set([...Object.keys(bMap), ...Object.keys(eMap)])) {
    const bq = bMap[id];
    const eq = eMap[id];
    if (!bq || !eq) { real = true; notes.push(`questions REAL: missing id ${id}`); continue; }
    if (normalizeCompareText(bq.question) !== normalizeCompareText(eq.question)) {
      real = true; notes.push(`questions REAL: ${id} question text`);
    }
    if (String(bq.correct ?? '').toLowerCase() !== String(eq.correct ?? '').toLowerCase()) {
      real = true; notes.push(`questions REAL: ${id} correct key`);
    }
  }
  const orderB = (blobQs || []).map(q => q.id).join(',');
  const orderE = (expQs || []).map(q => q.id).join(',');
  if (orderB !== orderE && !real) notes.push(`questions order-only (same ids, different order)`);
  if (orderB !== orderE && real) notes.push(`questions order+content`);
  return { cosmetic: !real, real, notes };
}

function classify(blobPart, expected, diffFields) {
  const allNotes = [];
  let anyReal = false;
  let allCosmetic = true;

  if (diffFields.includes('passage')) {
    const r = structuralPassageDiff(blobPart.passage, expected.passage);
    allNotes.push(...r.notes);
    if (r.real) { anyReal = true; allCosmetic = false; }
    else if (!r.cosmetic) allCosmetic = false;
  }
  if (diffFields.includes('ads')) {
    const r = structuralAdsDiff(blobPart.ads, expected.ads);
    allNotes.push(...r.notes);
    if (r.real) { anyReal = true; allCosmetic = false; }
  }
  if (diffFields.includes('instruction')) {
    const r = instructionDiff(blobPart, expected);
    allNotes.push(...r.notes);
    if (r.real) { anyReal = true; allCosmetic = false; }
  }
  if (diffFields.includes('questions')) {
    const r = questionsDiff(blobPart.questions, expected.questions);
    allNotes.push(...r.notes);
    if (r.real) { anyReal = true; allCosmetic = false; }
  }

  return {
    kind: anyReal ? 'REAL' : (allCosmetic ? 'COSMETIC' : 'MIXED'),
    notes: allNotes,
  };
}

let blobIndex;
try {
  ({ blobIndex } = await loadBlobIndexStrict(store));
} catch (err) {
  console.error(abortVerifyMessage(err));
  process.exit(1);
}

const divergent = [];
const samples = { schreiben: null, lesenT3: null, any: null };

for (const seedPart of seedArr) {
  const id = seedPart.id || seedPart.partId;
  if (!id || !blobIndex.has(id)) continue;
  const mod = seedPart.module || blobIndex.get(id)?.module || 'lesen';
  let blobPart;
  try {
    blobPart = await fetchBlobPayloadStrict(store, 'de', 'B1', mod, id);
  } catch (err) {
    console.error(abortVerifyMessage(err));
    process.exit(1);
  }
  let expected;
  try {
    expected = buildUpdatedPayload(blobPart, seedPart);
  } catch {
    continue;
  }
  const diffFields = verifyFields(expected, blobPart);
  if (!diffFields.length) continue;

  const analysis = classify(blobPart, expected, diffFields);
  const row = {
    id,
    module: mod,
    teil: seedPart.teil,
    diffFields,
    ...analysis,
    seedPassageAds: seedPart.passage?.ads,
    blobPassageAds: blobPart.passage?.ads,
    seedTopAds: seedPart.ads,
    blobTopAds: blobPart.ads,
    seedPassageKeys: seedPart.passage ? Object.keys(seedPart.passage) : [],
    blobPassageKeys: blobPart.passage ? Object.keys(blobPart.passage) : [],
  };
  divergent.push(row);

  if (!samples.schreiben && mod === 'schreiben') samples.schreiben = row;
  if (!samples.lesenT3 && mod === 'lesen' && seedPart.teil === 3) samples.lesenT3 = row;
  if (!samples.any && mod === 'lesen' && seedPart.teil === 1) samples.any = row;
}

const counts = { COSMETIC: 0, REAL: 0, MIXED: 0 };
const byModule = {};
const fieldCombo = {};
for (const d of divergent) {
  counts[d.kind] = (counts[d.kind] || 0) + 1;
  byModule[d.module] = (byModule[d.module] || 0) + 1;
  const k = d.diffFields.join('+');
  fieldCombo[k] = (fieldCombo[k] || 0) + 1;
}

console.log('\n=== RESUMEN CLASIFICACIÓN (blobs live) ===');
console.log(`Total CONTENT_DIFFERS: ${divergent.length}`);
console.log(`  COSMETIC (solo estructural): ${counts.COSMETIC || 0}`);
console.log(`  REAL (contenido distinto):    ${counts.REAL || 0}`);
console.log(`  MIXED:                       ${counts.MIXED || 0}`);
console.log('\nPor módulo:', byModule);
console.log('\nPor campos reportados:', fieldCombo);

function printSample(label, row) {
  if (!row) return;
  console.log(`\n=== MUESTRA: ${label} ===`);
  console.log(`ID: ${row.id}`);
  console.log(`Campos verify: ${row.diffFields.join(', ')}`);
  console.log(`Clasificación: ${row.kind}`);
  console.log(`seed.passage keys: ${row.seedPassageKeys.join(', ') || '(none)'}`);
  console.log(`blob.passage keys: ${row.blobPassageKeys.join(', ') || '(none)'}`);
  console.log(`seed.passage.ads: ${JSON.stringify(row.seedPassageAds)}`);
  console.log(`blob.passage.ads: ${JSON.stringify(row.blobPassageAds)}`);
  console.log(`seed top-level ads: ${JSON.stringify(row.seedTopAds)}`);
  console.log(`blob top-level ads: ${JSON.stringify(row.blobTopAds)}`);
  for (const n of row.notes) console.log(`  → ${n}`);
}

printSample('Schreiben', samples.schreiben);
printSample('Lesen T3', samples.lesenT3);
printSample('Lesen T1 (cualquiera)', samples.any);
