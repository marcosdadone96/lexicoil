#!/usr/bin/env node
/**
 * renormalize-seed-key-entropy.mjs
 *
 * Re-aplica normalizeBatch (shuffle MCQ + orden ja_nein/RF) sobre el seed local
 * para eliminar secuencias posicionales repetidas (CHK-25) sin regenerar con LLM.
 *
 * FLUJO CANÓNICO (revisar dry-run antes de escribir nada):
 *
 *   1. node scripts/backup-blobs.mjs --out backups/pre-key-entropy-<fecha>.json
 *   2. node scripts/pull-seed-from-blobs.mjs   # opcional si el seed está desactualizado
 *   3. node scripts/renormalize-seed-key-entropy.mjs --dry-run
 *   4. node scripts/renormalize-seed-key-entropy.mjs --apply --yes
 *      (crea backup local de de_B1.json en backups/ antes de escribir)
 *   5. node scripts/verify-blobs-vs-seed.mjs     # debe seguir LOCAL_ONLY hasta push
 *   6. node scripts/push-seed-to-blobs.mjs --dry-run
 *   7. node scripts/push-seed-to-blobs.mjs --apply --yes
 *   8. node scripts/verify-blobs-vs-seed.mjs     # 0 divergencias
 *
 * Uso:
 *   node scripts/renormalize-seed-key-entropy.mjs --dry-run
 *   node scripts/renormalize-seed-key-entropy.mjs --dry-run --sample 3 --module lesen --teil 4
 *   node scripts/renormalize-seed-key-entropy.mjs --apply --yes
 *
 * Flags:
 *   --dry-run     Solo simula (default si no se pasa --apply)
 *   --apply       Escribe library/reusable-seed/de_B1.json (+ backup local)
 *   --yes         Salta confirmación interactiva
 *   --seed <p>    Seed alternativo (default: library/reusable-seed/de_B1.json)
 *   --module      Filtra módulo
 *   --teil        Filtra teil
 *   --sample N    Partes de ejemplo en el reporte (default 3)
 *   --ids a,b     Solo IDs concretos
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { answerKeySequence } from './lib/balanceMcq.mjs';
import { chk25PoolRecords } from './audit-pass-2.mjs';

loadEnvFile();

const DEFAULT_SEED = path.join(ROOT, 'library/reusable-seed/de_B1.json');

/** Goethe B1 Lesen T2 = 3 MCQ options; 4+ is malformed (regenerar, no re-normalizar). */
export const LESEN_T2_MALFORMED_REASON =
  'lesen-t2-mcq-options-not-3: malformada (Goethe B1 L2 = 3 opciones a/b/c) — pendiente regenerar';

export function isMalformedLesenT2Record(rec) {
  if (String(rec?.module || '').toLowerCase() !== 'lesen' || Number(rec?.teil) !== 2) {
    return false;
  }
  return (rec.questions || []).some(
    (q) => isMcqType(q.type) && Array.isArray(q.options) && q.options.length !== 3,
  );
}

export function markLesenT2MalformedDeprecated(rec) {
  return {
    ...rec,
    verified: false,
    complete: rec.complete === true ? false : rec.complete,
    _deprecated: true,
    _deprecatedReason: LESEN_T2_MALFORMED_REASON,
    _deprecatedAt: new Date().toISOString(),
  };
}

function collisionStats(records, { activeOnly = false } = {}) {
  const pool = activeOnly ? records.filter((r) => !r._deprecated) : records;
  const bySeq = new Map();
  for (const rec of pool) {
    const qs = rec.questions || [];
    if (!qs.length) continue;
    const t = String(qs[0]?.type || '').toLowerCase();
    let typeKey;
    let seq;
    if (isMcqType(t)) {
      typeKey = 'multiple_choice';
      seq = answerKeySequence(qs, 'multiple_choice');
    } else if (t === 'ja_nein') {
      typeKey = 'ja_nein';
      seq = answerKeySequence(qs, 'ja_nein');
    } else if (isKeyedType(t)) {
      typeKey = 'richtig_falsch';
      seq = answerKeySequence(qs, 'richtig_falsch');
    } else continue;
    if (!seq.includes(',')) continue;
    const cell = `${rec.module}-${rec.teil}:${typeKey}:${seq}`;
    if (!bySeq.has(cell)) bySeq.set(cell, 0);
    bySeq.set(cell, bySeq.get(cell) + 1);
  }
  const groups = [...bySeq.values()].filter((n) => n >= 2);
  const hist = {};
  for (const n of groups) hist[n] = (hist[n] || 0) + 1;
  return {
    findings: groups.length,
    partsInCollisions: groups.reduce((a, b) => a + b, 0),
    max: groups.length ? Math.max(...groups) : 0,
    hist,
  };
}

function cellCollisionStats(records, cell, opts) {
  const filtered = records.filter((r) => `${r.module}-${r.teil}` === cell);
  return collisionStats(filtered, opts);
}

function summarizeChk25(findings) {
  const counts = { INFO: 0, IMPORTANT: 0, CRITICAL: 0 };
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] || 0) + 1;
  }
  return {
    total: findings.length,
    actionable: counts.IMPORTANT + counts.CRITICAL,
    ...counts,
  };
}

function printChk25Line(label, findings) {
  const s = summarizeChk25(findings);
  console.log(
    `  CHK-25 ${label}: ${s.total} total (${s.actionable} accionables: ` +
    `${s.IMPORTANT} IMPORTANT, ${s.CRITICAL} CRITICAL; ` +
    `${s.INFO} INFO colisión estadística)`,
  );
}

function parseArgs(argv) {
  const o = {
    dryRun: true,
    apply: false,
    yes: false,
    seed: DEFAULT_SEED,
    module: null,
    teil: null,
    sample: 3,
    ids: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--apply') { o.apply = true; o.dryRun = false; }
    else if (a === '--yes') o.yes = true;
    else if (a === '--seed') o.seed = path.resolve(argv[++i]);
    else if (a === '--module') o.module = String(argv[++i]).toLowerCase();
    else if (a === '--teil') o.teil = Number(argv[++i]);
    else if (a === '--sample') o.sample = Math.max(1, Number(argv[++i]) || 3);
    else if (a === '--ids') o.ids = new Set(argv[++i].split(',').map((s) => s.trim()).filter(Boolean));
  }
  if (!o.apply) o.dryRun = true;
  return o;
}

function optionText(opt) {
  if (opt == null) return '';
  if (typeof opt === 'string') return opt.replace(/^[a-c]\)\s*/i, '').trim();
  if (typeof opt === 'object') return String(opt.text ?? opt.label ?? '').trim();
  return String(opt);
}

function optionKey(opt, fallbackIdx) {
  if (typeof opt === 'object' && opt.key) {
    return String(opt.key).toLowerCase().replace(/[^a-c]/g, '').slice(0, 1);
  }
  if (typeof opt === 'string') {
    const m = opt.match(/^([a-c])\)/i);
    if (m) return m[1].toLowerCase();
  }
  return String.fromCharCode(97 + fallbackIdx);
}

function mcqCorrectText(q) {
  const letter = String(q.correct ?? q.correctAnswer ?? '')
    .toLowerCase().replace(/[^a-d]/g, '').slice(0, 1);
  const opts = q.options || [];
  for (let i = 0; i < opts.length; i++) {
    if (optionKey(opts[i], i) === letter) return optionText(opts[i]);
  }
  const idx = letter ? letter.charCodeAt(0) - 97 : -1;
  if (idx >= 0 && opts[idx]) return optionText(opts[idx]);
  return '';
}

/** Lesen/Hören MCQ blueprint = 3 options; 4-option records skip balanceMcqGroup. */
function isStandardMcqPart(questions) {
  return (questions || [])
    .filter((q) => isMcqType(q.type))
    .every((q) => Array.isArray(q.options) && q.options.length === 3);
}

function recordPassages(rec) {
  if (Array.isArray(rec.passages) && rec.passages.length) return rec.passages;
  if (rec.passage && typeof rec.passage === 'object') {
    if (Array.isArray(rec.passage.passages)) return rec.passage.passages;
    return [rec.passage];
  }
  return [];
}

function recordToBatch(rec) {
  return {
    passages: recordPassages(rec),
    questions: JSON.parse(JSON.stringify(rec.questions || [])),
  };
}

function applyNormalizedToRecord(rec, norm) {
  const byId = Object.fromEntries((norm.questions || []).map((q) => [q.id, q]));
  const out = { ...rec, questions: (norm.questions || []).map((q) => ({ ...q })) };
  if (Array.isArray(out.segments)) {
    out.segments = out.segments.map((seg) => ({
      ...seg,
      questions: (seg.questions || []).map((q) => byId[q.id] || q),
    }));
  }
  return out;
}

function normalizeCompareText(t) {
  return String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function verifyMcqIntegrity(before, after) {
  if (!isStandardMcqPart(before)) return [];
  const afterById = Object.fromEntries((after || []).map((q) => [q.id, q]));
  const failures = [];
  for (const b of before) {
    if (!isMcqType(b.type)) continue;
    const a = afterById[b.id];
    if (!a) {
      failures.push({ id: b.id, reason: 'missing-after' });
      continue;
    }
    const bt = mcqCorrectText(b);
    const at = mcqCorrectText(a);
    if (normalizeCompareText(bt) !== normalizeCompareText(at)) {
      failures.push({ id: b.id, before: bt, after: at });
    }
  }
  return failures;
}

function normBinaryCorrect(c, type) {
  const s = String(c ?? '').trim().toLowerCase();
  if (type === 'ja_nein') return /^j/.test(s) ? 'ja' : 'nein';
  if (type === 'richtig_falsch') return /^r/.test(s) ? 'richtig' : 'falsch';
  return s;
}

function verifyKeyedIntegrity(before, after) {
  const map = Object.fromEntries(before.map((q) => [q.id, q]));
  const failures = [];
  for (const q of after) {
    const orig = map[q.id];
    if (!orig) {
      failures.push({ id: q.id, reason: 'missing-id' });
      continue;
    }
    const type = String(orig.type || q.type || '').toLowerCase();
    if (!isKeyedType(type)) continue;
    const bc = normBinaryCorrect(orig.correct, type);
    const ac = normBinaryCorrect(q.correct, type);
    if (bc !== ac) {
      failures.push({ id: q.id, reason: 'correct-changed', before: orig.correct, after: q.correct });
    }
  }
  return failures;
}

function keySeqForRecord(rec) {
  const qs = rec.questions || [];
  const t = String(qs[0]?.type || '').toLowerCase();
  if (isMcqType(t)) return answerKeySequence(qs, 'multiple_choice');
  if (t === 'ja_nein') return answerKeySequence(qs, 'ja_nein');
  if (isKeyedType(t)) return answerKeySequence(qs, 'richtig_falsch');
  return '';
}

function normalizeRecord(rec) {
  const batch = recordToBatch(rec);
  const norm = normalizeBatch(batch, {
    module: rec.module,
    teil: rec.teil,
    lang: rec.lang || 'de',
    level: rec.level || 'B1',
  });
  return applyNormalizedToRecord(rec, norm);
}

function filterRecords(records, args) {
  return records.filter((rec) => {
    if (args.module && rec.module !== args.module) return false;
    if (args.teil != null && Number(rec.teil) !== args.teil) return false;
    if (args.ids && !args.ids.has(rec.id)) return false;
    return true;
  });
}

function isMcqType(type) {
  const t = String(type || '').toLowerCase();
  return t === 'multiple_choice' || t === 'multiple' || t === 'mcq';
}

function isKeyedType(type) {
  const t = String(type || '').toLowerCase();
  return t === 'ja_nein' || t === 'richtig_falsch' || t === 'true_false';
}

function affectsKeyEntropy(rec) {
  const types = (rec.questions || []).map((q) => String(q.type || '').toLowerCase());
  return types.some((t) => isMcqType(t) || isKeyedType(t));
}

function printSampleDiff(rec, updated, idx) {
  const beforeQs = rec.questions || [];
  const afterQs = updated.questions || [];
  const cell = `${rec.module}-${rec.teil}`;
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  MUESTRA ${idx + 1}: ${rec.id}  (${cell})`);
  console.log(`  Secuencia ANTES : ${keySeqForRecord(rec) || '(n/a)'}`);
  console.log(`  Secuencia DESPUÉS: ${keySeqForRecord(updated) || '(n/a)'}`);

  if (isMcqType((beforeQs[0]?.type || '').toLowerCase())) {
    let qi = beforeQs.findIndex((q, i) => q.correct !== afterQs[i]?.correct);
    if (qi < 0) qi = 0;
    const b = beforeQs[qi];
    const a = afterQs[qi];
    console.log(`\n  MCQ pregunta ${qi + 1} (${b.id}):`);
    console.log(`    ANTES  clave=${b.correct}  texto correcto="${mcqCorrectText(b).slice(0, 72)}…"`);
    console.log(`    DESPUÉS clave=${a.correct}  texto correcto="${mcqCorrectText(a).slice(0, 72)}…"`);
    console.log(`    ¿Mismo texto? ${normalizeCompareText(mcqCorrectText(b)) === normalizeCompareText(mcqCorrectText(a)) ? 'SÍ' : 'NO'}`);
  }

  if ((beforeQs[0]?.type || '').toLowerCase() === 'ja_nein') {
    const orig = beforeQs[0];
    const moved = afterQs.find((q) => q.id === orig.id);
    const newPos = afterQs.indexOf(moved) + 1;
    console.log(`\n  L4 par emparejado (id ${orig.id}):`);
    console.log(`    ANTES  pos 1 | clave ${orig.correct} | "${String(orig.signText).slice(0, 65)}…"`);
    console.log(`    DESPUÉS pos ${newPos} | clave ${moved?.correct} | "${String(moved?.signText).slice(0, 65)}…"`);
    console.log(`    ¿signText+clave intactos? ${
      moved && orig.signText === moved.signText && orig.correct === moved.correct ? 'SÍ' : 'NO'
    }`);
  }

  if ((beforeQs[0]?.type || '').toLowerCase() === 'richtig_falsch') {
    console.log(`\n  RF: orden barajado por passageId; cada pregunta conserva su clave.`);
  }
}

async function confirmApply(n) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans = await new Promise((resolve) => {
    rl.question(`\n¿Escribir ${n} parte(s) en ${DEFAULT_SEED}? [y/N] `, resolve);
  });
  rl.close();
  return /^y(es)?$/i.test(String(ans).trim());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.seed)) {
    console.error(`No existe seed: ${args.seed}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(args.seed, 'utf8'));
  const records = Array.isArray(raw) ? raw : (raw.records || []);

  const malformedLesenT2 = records.filter(isMalformedLesenT2Record);
  const eligible = filterRecords(records, args).filter(affectsKeyEntropy);
  const excludedMalformed = eligible.filter(isMalformedLesenT2Record);
  const targets = eligible.filter((rec) => !isMalformedLesenT2Record(rec));

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  renormalize-seed-key-entropy  ${args.dryRun ? '[DRY-RUN]' : '[APPLY]'}`);
  console.log(`  Seed: ${args.seed}`);
  console.log(`  Partes elegibles (sin malformadas): ${targets.length} / ${records.length}`);
  if (malformedLesenT2.length) {
    console.log(`\n  EXCLUIDAS (${malformedLesenT2.length}): malformadas lesen-2 (≠3 opciones MCQ), pendientes regenerar`);
    console.log(`  ${LESEN_T2_MALFORMED_REASON}`);
    for (const rec of malformedLesenT2) {
      const bad = (rec.questions || []).filter((q) => isMcqType(q.type) && (q.options || []).length !== 3).length;
      console.log(`    · ${rec.id}  (${bad} pregunta(s) con ≠3 opciones)`);
    }
    if (excludedMalformed.length !== malformedLesenT2.length) {
      console.log(`  (${malformedLesenT2.length - excludedMalformed.length} malformadas fuera del filtro --module/--teil/--ids)`);
    }
  }
  console.log(`${'═'.repeat(70)}`);

  const updatedRecords = [];
  let changed = 0;
  let mcqOk = 0;
  let mcqFail = 0;
  let keyedOk = 0;
  let keyedFail = 0;
  const samples = [];

  for (const rec of targets) {
    const updated = normalizeRecord(rec);
    const beforeQs = rec.questions || [];
    const afterQs = updated.questions || [];
    const seqBefore = keySeqForRecord(rec);
    const seqAfter = keySeqForRecord(updated);
    const didChange = seqBefore !== seqAfter
      || JSON.stringify(beforeQs.map((q) => q.correct)) !== JSON.stringify(afterQs.map((q) => q.correct))
      || JSON.stringify(beforeQs.map((q) => q.options)) !== JSON.stringify(afterQs.map((q) => q.options));

    if (didChange) changed++;

    const mcqFails = verifyMcqIntegrity(beforeQs, afterQs);
    const keyedFails = verifyKeyedIntegrity(beforeQs, afterQs);
    const hasMcq = beforeQs.some((q) => isMcqType(q.type));
    const hasKeyed = beforeQs.some((q) => isKeyedType(q.type));
    if (hasMcq) {
      if (mcqFails.length) mcqFail++;
      else mcqOk++;
    }
    if (hasKeyed) {
      if (keyedFails.length) keyedFail++;
      else keyedOk++;
    }

    if (samples.length < args.sample && didChange) {
      samples.push({ rec, updated });
    }
    updatedRecords.push({ id: rec.id, updated, mcqFails, keyedFails, didChange });
  }

  const chkBefore = chk25PoolRecords(records);
  const afterAll = records.map((rec) => {
    if (isMalformedLesenT2Record(rec)) {
      return markLesenT2MalformedDeprecated(rec);
    }
    const hit = updatedRecords.find((u) => u.id === rec.id);
    return hit?.updated || rec;
  });
  const chkAfter = chk25PoolRecords(afterAll);

  const collBefore = collisionStats(records);
  const collAfterActive = collisionStats(afterAll, { activeOnly: true });

  console.log(`\n  Partes con cambio de secuencia/opciones: ${changed}`);
  console.log(`  Integridad MCQ (partes): ${mcqOk} OK, ${mcqFail} fallos`);
  console.log(`  Integridad ja_nein/RF (partes): ${keyedOk} OK, ${keyedFail} fallos`);
  printChk25Line('ANTES', chkBefore);
  printChk25Line('DESPUÉS (simulado, sin _deprecated)', chkAfter);
  console.log(`\n  Colisiones globales ANTES : max=${collBefore.max} hist=${JSON.stringify(collBefore.hist)}`);
  console.log(`  Colisiones globales DESPUÉS (pool activo): max=${collAfterActive.max} hist=${JSON.stringify(collAfterActive.hist)}`);
  for (const cell of ['lesen-2', 'lesen-4', 'horen-2', 'lesen-1']) {
    const b = cellCollisionStats(records, cell);
    const a = cellCollisionStats(afterAll, cell, { activeOnly: true });
    if (!b.findings && !a.findings) continue;
    console.log(`  ${cell} max: ${b.max} → ${a.max}  hist DESPUÉS: ${JSON.stringify(a.hist)}`);
  }

  if (mcqFail || keyedFail) {
    console.error('\n  ✗ ABORT: integridad rota en simulación — no aplicar.');
    for (const row of updatedRecords.filter((r) => r.mcqFails.length || r.keyedFails.length).slice(0, 5)) {
      console.error(`    ${row.id}: mcq=${row.mcqFails.length} keyed=${row.keyedFails.length}`);
    }
    process.exit(1);
  }

  for (let i = 0; i < samples.length; i++) {
    printSampleDiff(samples[i].rec, samples[i].updated, i);
  }

  if (args.dryRun) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log('  DRY-RUN completado — no se ha escrito ningún archivo.');
    console.log('  Siguiente paso tras revisar:');
    console.log('    1. node scripts/backup-blobs.mjs --out backups/pre-key-entropy-<fecha>.json');
    console.log('    2. node scripts/renormalize-seed-key-entropy.mjs --apply --yes');
    console.log('    3. node scripts/push-seed-to-blobs.mjs --dry-run');
    console.log(`${'═'.repeat(70)}\n`);
    return;
  }

  if (!args.yes) {
    const ok = await confirmApply(targets.length);
    if (!ok) {
      console.log('Cancelado.');
      process.exit(0);
    }
  }

  const backupDir = path.join(ROOT, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = path.join(backupDir, `de_B1-pre-key-entropy-${stamp}.json`);
  fs.copyFileSync(args.seed, backupPath);
  console.log(`\n  Backup local: ${backupPath}`);

  const byId = Object.fromEntries(updatedRecords.map((r) => [r.id, r.updated]));
  const newRecords = records.map((rec) => {
    if (isMalformedLesenT2Record(rec)) return markLesenT2MalformedDeprecated(rec);
    return byId[rec.id] || rec;
  });
  const output = {
    ...raw,
    _pulledAt: raw._pulledAt || new Date().toISOString(),
    _renormalizedKeyEntropyAt: new Date().toISOString(),
    records: newRecords,
  };
  fs.writeFileSync(args.seed, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`  ✓ Escrito: ${args.seed}`);
  console.log(`  Siguiente: node scripts/push-seed-to-blobs.mjs --dry-run\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
