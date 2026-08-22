#!/usr/bin/env node
/**
 * Compare E1-E5 assembled .exam vs current seed for cap fixes (L1 + L2).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalPartHash } from './lib/partContentHash.mjs';
import { seedRecordToSnapshotPayload } from './lib/publishedExamLib.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const L2_FIXES = [
  { partId: 'bank-de-B1-lesen-t1-235c8165041c0905', from: 'Ich Glaube, diese', to: 'Ich glaube, diese' },
  { partId: 'bank-de-B1-lesen-t4-c62fdd02c8f9859d', from: 'Trotzdem Glaube ich nicht', to: 'Trotzdem glaube ich nicht' },
  { partId: 'bank-de-B1-lesen-t4-c62fdd02c8f9859d', from: 'Ich Stimme nicht zu', to: 'Ich stimme nicht zu' },
  { partId: 'gen-h4-008', from: 'Dem Stimme ich zu', to: 'Dem stimme ich zu' },
  { partId: 'bank-de-B1-lesen-t2-6e99d4850239d932', from: 'besonders Junge Erwachsene', to: 'besonders junge Erwachsene' },
  { partId: 'bank-de-B1-lesen-t2-ba71396239379089', from: 'um Junge Menschen', to: 'um junge Menschen' },
  { partId: 'bank-de-B1-lesen-t2-949e613c5a3587b1', from: 'wenn sie frisch Kochen', to: 'wenn sie frisch kochen' },
  { partId: 'bank-de-B1-lesen-t1-235c8165041c0905', from: 'wir zusammen Kochen oder Spiele', to: 'wir zusammen kochen oder Spiele' },
  { partId: 'bank-de-B1-lesen-t2-949e613c5a3587b1', from: 'was sie Essen', to: 'was sie essen' },
];

const FIX_L1_AT = Date.parse('2026-07-03T21:10:52.394Z');
const FIX_L2_AT = Date.parse('2026-07-03T21:14:04.800Z');

function loadSeed(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const records = Array.isArray(raw.records) ? raw.records : [];
  return { raw, byId: new Map(records.map((r) => [r.id, r])) };
}

function collectStrings(obj, acc = []) {
  if (typeof obj === 'string') {
    acc.push(obj);
    return acc;
  }
  if (Array.isArray(obj)) {
    for (const v of obj) collectStrings(v, acc);
    return acc;
  }
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) collectStrings(v, acc);
  }
  return acc;
}

function getExamPartBlob(exam, cell) {
  const [mod, teilStr] = cell.split('_');
  const teil = Number(teilStr);
  const key = `${mod}Parts`;
  const parts = exam[key] || [];
  return parts.find((p) => Number(p.teil) === teil) || null;
}

function checkL2Fixes(partId, texts) {
  const fixes = L2_FIXES.filter((f) => f.partId === partId);
  const issues = [];
  for (const fix of fixes) {
    const hasWrong = texts.some((t) => t.includes(fix.from));
    const hasRight = texts.some((t) => t.includes(fix.to));
    if (hasWrong) issues.push(`WRONG:${fix.from.slice(0, 40)}`);
    else if (!hasRight) issues.push(`MISSING:${fix.to.slice(0, 40)}`);
  }
  return issues;
}

function hashRecord(rec) {
  if (!rec) return null;
  return canonicalPartHash(seedRecordToSnapshotPayload(rec));
}

const seedNow = loadSeed(path.join(ROOT, 'library/reusable-seed/de_B1.json'));
const seedPreL2 = loadSeed(path.join(ROOT, 'backups/pre-l2-exam-fixes-2026-07-03T21-14-04.json'));
const seedPreL1 = loadSeed(path.join(ROOT, 'backups/pre-l1-decap-2026-07-03T21-10-52.json'));
const l1Parts = new Set(seedNow.raw._l1DecapParts || []);

const rows = [];

for (let n = 1; n <= 5; n++) {
  const fp = path.join(ROOT, `assembled-exam-b1-e${n}.json`);
  const asm = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const genAt = Date.parse(asm._meta.generatedAt);
  const postL1 = genAt >= FIX_L1_AT;
  const postL2 = genAt >= FIX_L2_AT;

  const partIssues = [];
  const touchedParts = [];
  let allMatch = true;

  for (const [cell, partId] of Object.entries(asm._meta.partIds)) {
    const recNow = seedNow.byId.get(partId);
    const recPreL2 = seedPreL2.byId.get(partId);
    const recPreL1 = seedPreL1.byId.get(partId);
    const hNow = hashRecord(recNow);
    const hPreL2 = hashRecord(recPreL2);
    const hPreL1 = hashRecord(recPreL1);

    const l2Changed = hNow !== hPreL2;
    const l1Changed = l1Parts.has(partId) || hNow !== hPreL1;

    if (!l1Changed && !l2Changed) continue;
    touchedParts.push(partId.slice(-12));

    const asmPart = getExamPartBlob(asm.exam, cell);
    const asmTexts = asmPart ? collectStrings(asmPart) : [];
    const seedTexts = recNow ? collectStrings(recNow) : [];

    const l2Issues = checkL2Fixes(partId, asmTexts);
    if (l2Issues.length) {
      allMatch = false;
      partIssues.push(`${cell}:${l2Issues.join(';')}`);
    }

    // L1: if part in l1DecapParts, assembled strings should not match pre-l1 wrong tokens when seed fixed
    if (l1Parts.has(partId) && hNow !== hPreL1) {
      const preL1Texts = recPreL1 ? collectStrings(recPreL1) : [];
      // If assembled text blob equals pre-L1 record text for passage (rough), it's stale
      const asmJoined = asmTexts.join('\n');
      const preL1Joined = preL1Texts.join('\n');
      const nowJoined = seedTexts.join('\n');
      if (asmJoined === preL1Joined && asmJoined !== nowJoined) {
        allMatch = false;
        partIssues.push(`${cell}:L1-stale-vs-seed`);
      } else if (asmJoined !== nowJoined && hNow === hashRecord(recNow)) {
        // Format diff between assembled part shape vs seed record — check L2 only was done above
        // For L1-only parts: compare decap — if seed has fix and assembled still has pre-L1 substring
        for (const t of preL1Texts) {
          if (t === nowJoined) continue;
        }
      }
    }

    // Direct hash: if we could compare — use fix phrases for L2; for L1 use record hash match via text
    if (l2Changed && !l2Issues.length) {
      // assembled has correct L2 phrases
    }
  }

  // Stronger check: for each part in exam that's in l1Parts or l2 target, compare hash of seed vs whether assembled content contains any L2 `from` strings anywhere in exam for that part
  for (const [cell, partId] of Object.entries(asm._meta.partIds)) {
    const fixes = L2_FIXES.filter((f) => f.partId === partId);
    if (!fixes.length && !l1Parts.has(partId)) continue;
    const asmPart = getExamPartBlob(asm.exam, cell);
    if (!asmPart) continue;
    const asmTexts = collectStrings(asmPart).join('\n');
    const recNow = seedNow.byId.get(partId);
    const seedText = recNow ? collectStrings(recNow).join('\n') : '';

    for (const fix of fixes) {
      if (asmTexts.includes(fix.from)) {
        allMatch = false;
        if (!partIssues.some((p) => p.startsWith(cell))) {
          partIssues.push(`${cell}:has-${fix.from.slice(0, 25)}`);
        }
      }
    }

    if (l1Parts.has(partId)) {
      const hNow = hashRecord(recNow);
      const hPreL1 = hashRecord(seedPreL1.byId.get(partId));
      if (hNow !== hPreL1) {
        // Sample: if assembled still contains pre-L1-only wrong patterns - skip exhaustive L1
        // Compare: seed snapshot hash vs re-derived - if asm has all seed `to` and no `from` for L2 we're good for L2
        // For L1: check if asm text equals seed text for passage fields (normalized)
        const norm = (s) => s.replace(/\s+/g, ' ').trim();
        const asmPassageTexts = [];
        if (asmPart.text) asmPassageTexts.push(asmPart.text);
        if (asmPart.passages) asmPassageTexts.push(...asmPart.passages.map((p) => p.text));
        const seedPassage = recNow?.passage;
        const seedPassageTexts = [];
        if (seedPassage?.text) seedPassageTexts.push(seedPassage.text);
        if (seedPassage?.passages) seedPassageTexts.push(...seedPassage.passages.map((p) => p.text));

        for (let i = 0; i < Math.max(asmPassageTexts.length, seedPassageTexts.length); i++) {
          const a = norm(asmPassageTexts[i] || '');
          const s = norm(seedPassageTexts[i] || '');
          if (a && s && a !== s) {
            const preRec = seedPreL1.byId.get(partId);
            const preP = preRec?.passage;
            const preTexts = [];
            if (preP?.text) preTexts.push(preP.text);
            if (preP?.passages) preTexts.push(...preP.passages.map((p) => p.text));
            const p = norm(preTexts[i] || '');
            if (a === p && a !== s) {
              allMatch = false;
              partIssues.push(`${cell}:L1-passage-stale`);
            }
          }
        }
      }
    }
  }

  const hasFixes = postL2;
  let verdict;
  let action;
  if (allMatch && postL2) {
    verdict = 'assembled = seed';
    action = 'publicar directo';
  } else if (postL2 && allMatch) {
    verdict = 'assembled = seed';
    action = 'publicar directo';
  } else if (!postL2) {
    verdict = 'exportado antes de L2';
    action = allMatch ? 'publicar desde seed' : 're-exportar o seed';
  } else {
    verdict = allMatch ? 'assembled = seed' : 'assembled diverge';
    action = allMatch ? 'publicar directo' : 're-exportar o publicar desde seed';
  }

  if (allMatch && postL2) {
    verdict = 'assembled = seed';
    action = 'publicar directo';
  } else if (allMatch && !postL2) {
    verdict = 'assembled ok pero pre-L2 export';
    action = 'publicar desde seed (más seguro)';
  } else if (!allMatch && postL2) {
    verdict = 'assembled diverge del seed';
    action = 're-exportar o publicar desde seed';
  } else {
    verdict = 'assembled viejo + diverge';
    action = 're-exportar o publicar desde seed';
  }

  rows.push({
    exam: `E${n}`,
    generatedAt: asm._meta.generatedAt,
    postL1: postL1 ? 'sí' : 'no',
    postL2: postL2 ? 'sí' : 'no',
    touched: touchedParts.length ? touchedParts.join(',') : '—',
    issues: partIssues.length ? partIssues.join(' | ') : '—',
    verdict,
    action,
  });
}

console.log('\n| Examen | generatedAt | post-L1 (21:10) | post-L2 (21:14) | partes tocadas | issues | veredicto | acción |');
console.log('|--------|-------------|-----------------|-----------------|----------------|--------|-----------|--------|');
for (const r of rows) {
  console.log(`| ${r.exam} | ${r.generatedAt} | ${r.postL1} | ${r.postL2} | ${r.touched} | ${r.issues} | ${r.verdict} | ${r.action} |`);
}
