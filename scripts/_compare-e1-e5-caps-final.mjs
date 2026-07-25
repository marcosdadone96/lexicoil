#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/reusable-seed/de_B1.json'), 'utf8'));
const preL2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'backups/pre-l2-exam-fixes-2026-07-03T21-14-04.json'), 'utf8'));
const byId = new Map(seed.records.map((r) => [r.id, r]));
const preL2ById = new Map((preL2.records || []).map((r) => [r.id, r]));
const l1Parts = new Set(seed._l1DecapParts || []);

const L2_FIXES = (seed._l2ExamFixes || []).map((f) => ({ partId: f.partId, from: f.from, to: f.to }));

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

function passageTextsFromExamPart(part) {
  const out = [];
  if (part?.text) out.push(part.text);
  if (part?.passages) for (const p of part.passages) if (p.text) out.push(p.text);
  if (part?.transcript) out.push(part.transcript);
  return out;
}

function passageTextsFromSeed(rec) {
  const out = [];
  const p = rec?.passage;
  if (p?.text) out.push(p.text);
  if (p?.passages) for (const x of p.passages) if (x.text) out.push(x.text);
  if (rec?.transcript) out.push(rec.transcript);
  return out;
}

function norm(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

const FIX_L1 = '2026-07-03T21:10:52.394Z';
const FIX_L2 = '2026-07-03T21:14:04.800Z';

console.log('| Examen | generatedAt | post-fixes | caps OK | veredicto | acción |');
console.log('|--------|-------------|------------|---------|-----------|--------|');

for (let n = 1; n <= 5; n++) {
  const asm = JSON.parse(fs.readFileSync(path.join(ROOT, `assembled-exam-b1-e${n}.json`), 'utf8'));
  const gen = asm._meta.generatedAt;
  const postFixes = Date.parse(gen) >= Date.parse(FIX_L2) ? 'sí' : 'no';
  const issues = [];

  for (const [cell, partId] of Object.entries(asm._meta.partIds)) {
    const isL1 = l1Parts.has(partId);
    const l2Fixes = L2_FIXES.filter((f) => f.partId === partId);
    if (!isL1 && !l2Fixes.length) continue;

    const ap = getExamPart(asm.exam, cell);
    const rec = byId.get(partId);
    const preRec = preL2ById.get(partId);
    const asmAll = collectStrings(ap || {}).join('\n');

    for (const fix of l2Fixes) {
      if (asmAll.includes(fix.from)) issues.push(`${cell}: still has "${fix.from.slice(0, 35)}"`);
      else if (!asmAll.includes(fix.to)) issues.push(`${cell}: missing "${fix.to.slice(0, 35)}"`);
    }

    if (isL1 && rec && ap) {
      const asmPassages = passageTextsFromExamPart(ap).map(norm);
      const seedPassages = passageTextsFromSeed(rec).map(norm);
      const prePassages = passageTextsFromSeed(preRec).map(norm);

      for (let i = 0; i < seedPassages.length; i++) {
        const s = seedPassages[i];
        const a = asmPassages[i] || '';
        const p = prePassages[i] || '';
        if (!s) continue;
        if (a === s) continue;
        if (a === p && a !== s) {
          issues.push(`${cell}: L1 passage still pre-decap`);
        } else if (a !== s) {
          // Allow structural diffs if seed passage is substring of assembled or vice versa for caps check
          const seedInAsm = asmPassages.some((x) => x.includes(s) || s.includes(x));
          const preInAsm = prePassages.some((x) => x && asmPassages.some((a2) => a2 === x));
          if (preInAsm && !seedInAsm) issues.push(`${cell}: L1 passage mismatch vs seed`);
        }
      }
    }
  }

  const capsOk = issues.length === 0 ? 'sí' : 'no';
  let verdict;
  let action;
  if (postFixes === 'sí' && issues.length === 0) {
    verdict = 'assembled = seed';
    action = 'publicar directo';
  } else if (postFixes === 'no') {
    verdict = 'assembled viejo';
    action = issues.length ? 're-exportar o seed' : 'publicar desde seed';
  } else {
    verdict = 'assembled diverge (caps)';
    action = 're-exportar o publicar desde seed';
  }

  console.log(`| E${n} | ${gen} | ${postFixes} | ${capsOk} | ${verdict} | ${action} |`);
  if (issues.length) {
    for (const i of issues) console.log(`  - ${i}`);
  }
}
