#!/usr/bin/env node
/**
 * apply-pool-caps-l2-exam-fixes.mjs — Exact-phrase fixes for 9 E1–E5 ambiguous errors.
 *
 * Usage: node scripts/apply-pool-caps-l2-exam-fixes.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const POOL_FILE = path.join(ROOT, 'library/reusable-seed/de_B1.json');
const APPLY = process.argv.includes('--apply');

/** @type {{ partId: string, from: string, to: string, label: string }[]} */
const FIXES = [
  {
    label: '1 Glaube',
    partId: 'bank-de-B1-lesen-t1-235c8165041c0905',
    from: 'Ich Glaube, diese',
    to: 'Ich glaube, diese',
  },
  {
    label: '2 Glaube',
    partId: 'bank-de-B1-lesen-t4-c62fdd02c8f9859d',
    from: 'Trotzdem Glaube ich nicht',
    to: 'Trotzdem glaube ich nicht',
  },
  {
    label: '3 Stimme',
    partId: 'bank-de-B1-lesen-t4-c62fdd02c8f9859d',
    from: 'Ich Stimme nicht zu',
    to: 'Ich stimme nicht zu',
  },
  {
    label: '4 Stimme',
    partId: 'gen-h4-008',
    from: 'Dem Stimme ich zu',
    to: 'Dem stimme ich zu',
  },
  {
    label: '5 Junge Erwachsene',
    partId: 'bank-de-B1-lesen-t2-6e99d4850239d932',
    from: 'besonders Junge Erwachsene',
    to: 'besonders junge Erwachsene',
  },
  {
    label: '6 Junge Menschen',
    partId: 'bank-de-B1-lesen-t2-ba71396239379089',
    from: 'um Junge Menschen',
    to: 'um junge Menschen',
  },
  {
    label: '7 Kochen',
    partId: 'bank-de-B1-lesen-t2-949e613c5a3587b1',
    from: 'wenn sie frisch Kochen',
    to: 'wenn sie frisch kochen',
  },
  {
    label: '8 Kochen',
    partId: 'bank-de-B1-lesen-t1-235c8165041c0905',
    from: 'wir zusammen Kochen oder Spiele',
    to: 'wir zusammen kochen oder Spiele',
  },
  {
    label: '9 Essen',
    partId: 'bank-de-B1-lesen-t2-949e613c5a3587b1',
    from: 'was sie Essen',
    to: 'was sie essen',
  },
];

const TARGET_PART_IDS = new Set(FIXES.map((f) => f.partId));

function loadPool() {
  const raw = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));
  const records = Array.isArray(raw) ? raw : raw.records || [];
  return { raw, records };
}

function backupSeed() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(ROOT, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `pre-l2-exam-fixes-${ts}.json`);
  fs.copyFileSync(POOL_FILE, dest);
  return dest;
}

function applyFixesToString(str, partId, stats) {
  if (typeof str !== 'string') return str;
  let out = str;
  for (const fix of FIXES) {
    if (fix.partId !== partId) continue;
    if (!out.includes(fix.from)) continue;
    const count = out.split(fix.from).length - 1;
    out = out.split(fix.from).join(fix.to);
    stats.push({ ...fix, count, partId });
  }
  return out;
}

function applyFixesToRecord(rec, stats) {
  const partId = rec.id;
  if (!TARGET_PART_IDS.has(partId)) return rec;

  const walk = (obj) => {
    if (typeof obj === 'string') return applyFixesToString(obj, partId, stats);
    if (Array.isArray(obj)) return obj.map(walk);
    if (obj && typeof obj === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(obj)) out[k] = walk(v);
      return out;
    }
    return obj;
  };
  return walk(rec);
}

function collectStringFields(obj, fp = '', acc = []) {
  if (!obj || typeof obj !== 'object') return acc;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => collectStringFields(v, `${fp}[${i}]`, acc));
    return acc;
  }
  for (const [k, v] of Object.entries(obj)) {
    const p = fp ? `${fp}.${k}` : k;
    if (typeof v === 'string') acc.push({ path: p, value: v });
    else if (v && typeof v === 'object') collectStringFields(v, p, acc);
  }
  return acc;
}

function verifyDiff(beforeRecords, afterRecords) {
  const targetIds = TARGET_PART_IDS;
  let ok = true;

  for (let i = 0; i < beforeRecords.length; i++) {
    const before = beforeRecords[i];
    const after = afterRecords[i];
    if (before.id !== after.id) {
      console.error('FAIL: record order changed');
      ok = false;
      break;
    }

    if (!targetIds.has(before.id)) {
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        console.error(`FAIL: non-target part modified: ${before.id}`);
        ok = false;
      }
      continue;
    }

    const bFields = collectStringFields(before);
    const aMap = new Map(collectStringFields(after).map((f) => [f.path, f.value]));

    for (const { path: fieldPath, value: bVal } of bFields) {
      const aVal = aMap.get(fieldPath);
      if (bVal === aVal) continue;

      let expected = bVal;
      for (const fix of FIXES) {
        if (fix.partId !== before.id) continue;
        if (expected.includes(fix.from)) {
          expected = expected.split(fix.from).join(fix.to);
        }
      }

      if (expected !== aVal) {
        console.error(`FAIL: unexpected change in ${before.id} ${fieldPath}`);
        console.error(`  before: ${bVal.slice(0, 100)}...`);
        console.error(`  after : ${aVal.slice(0, 100)}...`);
        ok = false;
      }
    }
  }

  return ok;
}

function main() {
  const { raw, records } = loadPool();
  const stats = [];
  const updated = records.map((rec) => applyFixesToRecord(rec, stats));

  const byLabel = {};
  for (const s of stats) {
    byLabel[s.label] = (byLabel[s.label] || 0) + s.count;
  }

  console.log('\nL2 exam fixes (exact phrase) ·', APPLY ? 'APPLY' : 'DRY-RUN');
  console.log('Replacements by fix:');
  for (const fix of FIXES) {
    console.log(`  ${fix.label}: ${byLabel[fix.label] || 0}× in ${fix.partId}`);
  }
  console.log(`Total replacements: ${stats.reduce((n, s) => n + s.count, 0)}`);

  if (!APPLY) {
    console.log('\nPasa --apply para escribir seed.');
    return;
  }

  const missing = FIXES.filter((fix) => !(byLabel[fix.label] > 0));
  if (missing.length) {
    console.error('\nFAIL: fixes sin coincidencias:');
    for (const m of missing) console.error(`  ${m.label}: ${m.from}`);
    process.exit(1);
  }

  const backupPath = backupSeed();
  console.log(`\nBackup: ${backupPath}`);

  const backupRecords = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const backupList = Array.isArray(backupRecords) ? backupRecords : backupRecords.records;

  if (!verifyDiff(backupList, updated)) {
    console.error('\nAbortando — verificación diff fallida.');
    process.exit(1);
  }
  console.log('Diff OK: solo frases objetivo en 6 partes');

  const out = Array.isArray(raw) ? updated : { ...raw, records: updated };
  out._l2ExamFixesAppliedAt = new Date().toISOString();
  out._l2ExamFixes = FIXES.map((f) => ({ label: f.label, partId: f.partId, from: f.from, to: f.to }));
  fs.writeFileSync(POOL_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`Seed escrito: ${POOL_FILE}`);
}

main();
