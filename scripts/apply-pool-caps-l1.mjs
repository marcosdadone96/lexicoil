#!/usr/bin/env node
/**
 * apply-pool-caps-l1.mjs — Apply Nivel 1 decapitalizeMidSentence to affected seed parts.
 *
 * Usage:
 *   node scripts/apply-pool-caps-l1.mjs --dry-run
 *   node scripts/apply-pool-caps-l1.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decapitalizeMidSentence } from './lib/capitalizeNouns.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const POOL_FILE = path.join(ROOT, 'library/reusable-seed/de_B1.json');
const APPLY = process.argv.includes('--apply');

const TOKEN_RE = /([A-Za-zÄÖÜäöüß]+)|([^A-Za-zÄÖÜäöüß]+)/g;

function loadPool() {
  const raw = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));
  const records = Array.isArray(raw) ? raw : raw.records || [];
  return { raw, records };
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

function applyDecapDeep(obj) {
  if (typeof obj === 'string') {
    return decapitalizeMidSentence(obj).result;
  }
  if (Array.isArray(obj)) {
    return obj.map((v) => applyDecapDeep(v));
  }
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = applyDecapDeep(v);
    }
    return out;
  }
  return obj;
}

function tokenize(text) {
  const tokens = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    tokens.push(m[0]);
  }
  return tokens;
}

function diffStringChanges(before, after, ctx) {
  const bt = tokenize(before);
  const at = tokenize(after);
  const changes = [];
  if (before === after) return changes;
  if (bt.length !== at.length) {
    changes.push({ kind: 'length', ctx, before, after });
    return changes;
  }
  for (let i = 0; i < bt.length; i++) {
    if (bt[i] !== at[i]) {
      changes.push({ kind: 'token', ctx, index: i, from: bt[i], to: at[i] });
    }
  }
  return changes;
}

function findExpectedL1Parts(records) {
  const targets = [];
  for (const rec of records) {
    const partId = rec.id || '(no-id)';
    const fields = collectStringFields(rec);
    const expected = [];
    for (const { path: fieldPath, value } of fields) {
      const { result, count } = decapitalizeMidSentence(value);
      if (count === 0) continue;
      for (const ch of diffStringChanges(value, result, fieldPath)) {
        if (ch.kind === 'token') expected.push({ fieldPath, ...ch });
      }
    }
    if (expected.length) targets.push({ partId, cell: `${rec.module} T${rec.teil}`, expected });
  }
  return targets;
}

function backupSeed() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(ROOT, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `pre-l1-decap-${ts}.json`);
  fs.copyFileSync(POOL_FILE, dest);
  return dest;
}

async function verifyPool2NoRegression(beforeRecords, afterRecords, partIds) {
  const fails = [];
  const improved = [];
  for (const id of partIds) {
    const beforeRec = beforeRecords.find((r) => r.id === id);
    const afterRec = afterRecords.find((r) => r.id === id);
    const beforeGate = await isPartPoolReady(beforeRec, { semantic: false });
    const afterGate = await isPartPoolReady(afterRec, { semantic: false });
    const beforeIds = new Set(beforeGate.blocking.map((f) => f.id));
    const afterIds = new Set(afterGate.blocking.map((f) => f.id));
    const added = [...afterIds].filter((x) => !beforeIds.has(x));
    const removed = [...beforeIds].filter((x) => !afterIds.has(x));
    if (added.length) fails.push({ id, added, removed });
    else if (removed.length) improved.push({ id, removed });
  }
  return { fails, improved };
}

async function main() {
  const { raw, records } = loadPool();
  const targetsBefore = findExpectedL1Parts(records);
  const targetIds = new Set(targetsBefore.map((t) => t.partId));
  const expectedFixCount = targetsBefore.reduce((n, t) => n + t.expected.length, 0);

  console.log(`\nNivel 1 apply · ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Partes objetivo: ${targetsBefore.length}`);
  console.log(`Casos esperados: ${expectedFixCount}`);

  if (targetsBefore.length === 0) {
    console.log('Nada que aplicar.');
    return;
  }

  if (!APPLY) {
    for (const t of targetsBefore) {
      console.log(`\n  [${t.cell}] ${t.partId} (${t.expected.length} fixes)`);
      for (const e of t.expected.slice(0, 5)) {
        console.log(`    ${e.from} → ${e.to}  @ ${e.fieldPath}`);
      }
      if (t.expected.length > 5) console.log(`    … +${t.expected.length - 5} más`);
    }
    console.log('\nPasa --apply para escribir seed.');
    return;
  }

  const backupPath = backupSeed();
  console.log(`Backup: ${backupPath}`);

  const backupRecords = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const backupList = Array.isArray(backupRecords) ? backupRecords : backupRecords.records;

  const updated = records.map((rec) => {
    if (!targetIds.has(rec.id)) return rec;
    return applyDecapDeep(rec);
  });

  // ── Verification 1: non-target parts byte-identical ──
  let untouchedOk = true;
  for (let i = 0; i < records.length; i++) {
    if (targetIds.has(records[i].id)) continue;
    if (JSON.stringify(records[i]) !== JSON.stringify(updated[i])) {
      console.error(`FAIL: parte no objetivo modificada: ${records[i].id}`);
      untouchedOk = false;
    }
  }

  // ── Verification 2: target parts — only expected token changes ──
  const allChanges = [];
  const expectedKeys = new Set();
  for (const t of targetsBefore) {
    for (const e of t.expected) {
      expectedKeys.add(`${t.partId}|${e.fieldPath}|${e.index}|${e.from}|${e.to}`);
    }
  }

  let verifyOk = true;
  for (const t of targetsBefore) {
    const beforeRec = backupList.find((r) => r.id === t.partId);
    const afterRec = updated.find((r) => r.id === t.partId);
    const beforeFields = collectStringFields(beforeRec);
    const afterFields = collectStringFields(afterRec);
    const afterMap = new Map(afterFields.map((f) => [f.path, f.value]));

    for (const { path: fieldPath, value: beforeVal } of beforeFields) {
      const afterVal = afterMap.get(fieldPath);
      if (beforeVal === afterVal) continue;
      const changes = diffStringChanges(beforeVal, afterVal, fieldPath);
      for (const ch of changes) {
        allChanges.push({ partId: t.partId, ...ch });
        if (ch.kind !== 'token') {
          console.error(`FAIL: cambio no-token en ${t.partId} ${fieldPath}`);
          verifyOk = false;
          continue;
        }
        const key = `${t.partId}|${fieldPath}|${ch.index}|${ch.from}|${ch.to}`;
        if (!expectedKeys.has(key)) {
          console.error(`FAIL: cambio inesperado ${ch.from}→${ch.to} en ${t.partId} ${fieldPath}`);
          verifyOk = false;
        }
      }
    }
  }

  // ── Verification 3: all expected fixes applied ──
  const appliedKeys = new Set(
    allChanges.filter((c) => c.kind === 'token').map(
      (c) => `${c.partId}|${c.ctx}|${c.index}|${c.from}|${c.to}`,
    ),
  );
  let missing = 0;
  for (const key of expectedKeys) {
    if (!appliedKeys.has(key)) {
      console.error(`FAIL: fix esperado no aplicado: ${key}`);
      missing++;
      verifyOk = false;
    }
  }

  console.log(`\n── Verificación diff ──`);
  console.log(`  Partes no objetivo intactas: ${untouchedOk ? 'OK' : 'FAIL'}`);
  console.log(`  Cambios token aplicados: ${allChanges.filter((c) => c.kind === 'token').length}`);
  console.log(`  Esperados: ${expectedFixCount}`);
  console.log(`  Inesperados: ${verifyOk && missing === 0 ? 0 : 'FAIL'}`);

  if (!untouchedOk || !verifyOk) {
    console.error('\nAbortando escritura — verificación fallida.');
    process.exit(1);
  }

  // ── POOL-2: no new blocking vs backup (parts may already fail other CHKs) ──
  const { fails: pool2Regressions, improved: pool2Improved } = await verifyPool2NoRegression(
    backupList,
    updated,
    targetIds,
  );
  console.log(`\n── POOL-2 (${targetIds.size} partes) ──`);
  if (pool2Regressions.length) {
    for (const f of pool2Regressions) {
      console.error(`  REGRESSION ${f.id}: new blocking ${f.added.join(', ')}`);
    }
    console.error('\nAbortando escritura — POOL-2 regresión.');
    process.exit(1);
  }
  console.log(`  0 regresiones · ${pool2Improved.length} partes mejoradas (CHK-14 eliminado)`);
  for (const p of pool2Improved.slice(0, 5)) {
    console.log(`    ${p.id}: −${p.removed.join(', ')}`);
  }
  if (pool2Improved.length > 5) console.log(`    … +${pool2Improved.length - 5} más`);

  // ── Write seed ──
  const out = Array.isArray(raw) ? updated : { ...raw, records: updated };
  out._l1DecapAppliedAt = new Date().toISOString();
  out._l1DecapParts = [...targetIds].sort();
  out._l1DecapFixCount = expectedFixCount;
  fs.writeFileSync(POOL_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');

  console.log(`\nSeed actualizado: ${POOL_FILE}`);
  console.log(`  ${targetsBefore.length} partes · ${expectedFixCount} fixes · sin blobs`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
