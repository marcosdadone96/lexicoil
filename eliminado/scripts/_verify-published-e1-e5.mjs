#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'library/published-exams/de/B1');
const ASM = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, `assembled-exam-b1-e${n}.json`), 'utf8'));

const WRONG = [
  /\bPersönlich\b/,
  /\bIch Glaube,/,
  /\bTrotzdem Glaube\b/,
  /\bIch Stimme nicht\b/,
  /\bDem Stimme ich\b/,
  /\bfrisch Kochen\b/,
  /\bzusammen Kochen\b/,
  /\bwas sie Essen\b/,
  /\bbesonders Junge Erwachsene\b/,
  /\bum Junge Menschen\b/,
];

function collectStrings(obj, acc = []) {
  if (typeof obj === 'string') acc.push(obj);
  else if (Array.isArray(obj)) for (const v of obj) collectStrings(v, acc);
  else if (obj && typeof obj === 'object') for (const v of Object.values(obj)) collectStrings(v, acc);
  return acc;
}

function keySeq(part, type) {
  const qs = part?.snapshot?.questions || [];
  if (type === 'L2') {
    return qs.map((q) => (q.correctAnswer || q.answer || q.key || '').toString().trim().toLowerCase()).join(',');
  }
  if (type === 'L4') {
    return qs.map((q) => {
      const a = q.correctAnswer ?? q.answer ?? q.key;
      if (typeof a === 'boolean') return a ? 'ja' : 'nein';
      return String(a).trim().toLowerCase();
    }).join(',');
  }
  if (type === 'L5') {
    return qs.map((q) => String(q.correctAnswer ?? q.answer ?? q.key ?? '').trim().toLowerCase()).join(',');
  }
  return '';
}

function getPart(doc, cell) {
  return doc.parts.find((p) => p.cell === cell);
}

console.log('=== 1. Files + status + parts ===\n');
const exams = [];
for (let n = 1; n <= 5; n++) {
  const fp = path.join(DIR, `official-de-B1-e${n}.json`);
  const ok = fs.existsSync(fp);
  if (!ok) {
    console.log(`E${n}: MISSING ${fp}`);
    continue;
  }
  const doc = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const expectedParts = n === 1 ? 15 : 12;
  const partsOk =
    doc.parts?.length === expectedParts &&
    doc.parts.every((p) => p.partId && p.contentHash && p.snapshot);
  console.log(
    `E${n}: status=${doc.status} parts=${doc.parts?.length}/${expectedParts} snapshot+hash=${partsOk ? 'OK' : 'FAIL'}`,
  );
  exams.push({ n, doc });
}

console.log('\n=== 2. Spot-checks ===\n');

// E4 L3 ads
const e4 = exams.find((e) => e.n === 4)?.doc;
const e4l3 = getPart(e4, 'lesen_3');
const ads4 = e4l3?.snapshot?.ads || e4l3?.snapshot?.passage?.ads || [];
const titles4 = ads4.map((a) => a.title);
console.log(`E4 lesen_3: ${ads4.length} ads — TechDeal24=${titles4.includes('TechDeal24')} PC-Hilfe=${titles4.some((t) => t.includes('PC-Hilfe'))}`);

// E3 L3
const e3 = exams.find((e) => e.n === 3)?.doc;
const e3l3 = getPart(e3, 'lesen_3');
const ads3 = e3l3?.snapshot?.ads || e3l3?.snapshot?.passage?.ads || [];
console.log(`E3 lesen_3: ${ads3.length} ads, empty=${ads3.every((a) => !(a.text || '').trim()) ? 'YES BAD' : 'no'}`);

// E5 L3
const e5 = exams.find((e) => e.n === 5)?.doc;
const e5l3 = getPart(e5, 'lesen_3');
const ads5 = e5l3?.snapshot?.ads || e5l3?.snapshot?.passage?.ads || [];
console.log(`E5 lesen_3: ${ads5.length} ads, sample titles: ${ads5.slice(0, 3).map((a) => a.title).join(', ')}`);

// Caps E4/E5
console.log('\nCaps wrong patterns in E4/E5 snapshots:');
for (const n of [4, 5]) {
  const doc = exams.find((e) => e.n === n)?.doc;
  const texts = collectStrings(doc.parts.map((p) => p.snapshot)).join('\n');
  const hits = WRONG.filter((re) => re.test(texts)).map((re) => re.source);
  console.log(`  E${n}: ${hits.length ? hits.join(', ') : 'none (OK)'}`);
}

// Key entropy from published snapshots
console.log('\n=== 3. Key sequences (published snapshots) ===\n');
const seqs = { L2: [], L4: [], L5: [] };
for (const { n, doc } of exams) {
  for (const type of ['L2', 'L4', 'L5']) {
    const cell = `lesen_${type === 'L2' ? 2 : type === 'L4' ? 4 : 5}`;
    const part = getPart(doc, cell);
    const seq = keySeq(part, type);
    seqs[type].push({ n, seq });
  }
}
for (const type of ['L2', 'L4', 'L5']) {
  console.log(`${type}:`);
  for (const { n, seq } of seqs[type]) {
    const asm = ASM(n)._meta.keySequences?.[type] || '(no meta)';
    console.log(`  E${n}: published=${seq || '(empty)'}  assembled-meta=${asm}`);
  }
  const uniq = new Set(seqs[type].map((s) => s.seq).filter(Boolean));
  const allSame = uniq.size === 1 && seqs[type][0]?.seq;
  const isAbabab = seqs[type].every((s) => s.seq === 'a,b,c,a,b,c' || s.seq === 'a,b,c,a,b,c,a');
  console.log(`  distinct=${uniq.size} all-identical=${allSame} all-a,b,c,a,b,c=${isAbabab}`);
}
