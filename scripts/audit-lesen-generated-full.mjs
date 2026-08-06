#!/usr/bin/env node
/**
 * Audita partes Lesen en batches/generated/ con todos los filtros del pipeline.
 * No modifica archivos — solo informe repair vs discard.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { validatePart } from './lib/partGate.mjs';
import { buildLesenSeedRecordFromBatch } from './lib/publishToPool.mjs';
import { checkLesenBatchQuality } from './lib/lesenBatchQuality.mjs';
import { checkLexical, formatLexicalReport } from './lib/lexicalCheck.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { checkStructuralMoldDuplicate, loadStructuralCorpusFromDir } from './lib/structuralMoldDedup.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED_DIR = path.join(ROOT, 'batches/generated');
const POOL_FILE = path.join(ROOT, 'library/reusable-seed/de_B1.json');

const TEIL_FILTER = (() => {
  const i = process.argv.indexOf('--teil');
  return i >= 0 ? Number(process.argv[i + 1]) : null;
})();

function parseName(filename) {
  const base = filename.replace(/\.json$/i, '');
  const parts = base.split('-');
  const tPart = parts.find((p) => /^t\d$/i.test(p));
  return { module: parts[0], teil: tPart ? Number(tPart.slice(1)) : null };
}

function isAuditFile(name) {
  if (!name.endsWith('.json') || name.startsWith('.')) return false;
  if (/^\.tmp-|^verify-|^\.tmp-test-/i.test(name)) return false;
  return true;
}

function batchToRecord(batch, file, teil) {
  const rec = buildLesenSeedRecordFromBatch(batch, { lang: 'de', level: 'B1', teil, idPrefix: 'audit' });
  rec.id = batch.id || file.replace(/\.json$/i, '');
  return rec;
}

function runValidateBatch(relFile) {
  try {
    const out = execSync(`node scripts/validate-batch.mjs de B1 ${relFile}`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, output: out };
  } catch (err) {
    return { ok: false, output: (err.stdout || '') + (err.stderr || '') + (err.message || '') };
  }
}

async function auditFile(file) {
  const { teil } = parseName(file);
  if (teil == null || (TEIL_FILTER != null && teil !== TEIL_FILTER)) return null;

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(GENERATED_DIR, file), 'utf8'));
  } catch (e) {
    return { file, teil, verdict: 'discard', reason: `JSON inválido: ${e.message}` };
  }

  const batch0 = normalizeBatch(raw, { module: 'lesen', teil, lang: 'de', level: 'B1' });
  const relFile = path.relative(ROOT, path.join(GENERATED_DIR, file)).replace(/\\/g, '/');

  const gates = {
    format: null,
    quality: null,
    lexical: null,
    pool2: null,
    partGate: null,
    chk29: null,
  };
  const issues = [];

  // 1. validate-batch (formato técnico)
  const fmt = runValidateBatch(relFile);
  gates.format = fmt.ok;
  if (!fmt.ok) {
    const line = fmt.output.split(/\r?\n/).find((l) => l.trim() && !l.startsWith('==')) || fmt.output.slice(0, 120);
    issues.push(`formato: ${line.slice(0, 120)}`);
  }

  // 2. Calidad pedagógica
  const qual = checkLesenBatchQuality(batch0, teil);
  gates.quality = qual.ok;
  if (!qual.ok) issues.push(...qual.issues.slice(0, 3).map((i) => `calidad: ${i}`));

  // 3. Léxico
  const lex = checkLexical(batch0);
  gates.lexical = lex.ok;
  if (!lex.ok) issues.push(...lex.issues.slice(0, 2).map((i) => `léxico: ${i}`));

  // 4. POOL-2 vía validatePart (normalize ya aplicado)
  const vGate = await validatePart(batch0, {
    semantic: false,
    skipSem2: true,
    skipNormalize: true,
    skipDedup: true,
    module: 'lesen',
    teil,
    structuralCorpusDir: GENERATED_DIR,
  });
  gates.partGate = vGate.ok;
  if (!vGate.ok) {
    for (const b of vGate.blocking.slice(0, 3)) {
      issues.push(`POOL-2[${b.id}]: ${(b.message || '').slice(0, 100)}`);
    }
  }

  // 5. POOL-2 vía record (como publish)
  const record = batchToRecord(batch0, file, teil);
  const poolGate = await isPartPoolReady(record, { semantic: false, skipSem2: true });
  gates.pool2 = poolGate.ok;
  if (!poolGate.ok && vGate.ok) {
    for (const b of poolGate.blocking.slice(0, 2)) {
      issues.push(`pool-record[${b.id}]: ${(b.message || '').slice(0, 100)}`);
    }
  }

  // 6. CHK-29 intra-celda (duplicado estructural vs otras del mismo teil)
  if ([4, 5].includes(teil)) {
    const corpus = loadStructuralCorpusFromDir(GENERATED_DIR).filter(
      (b) => b !== raw && Number(b.teil ?? b.questions?.[0]?.teil) === teil,
    );
    const mold = checkStructuralMoldDuplicate(batch0, corpus, { teil });
    gates.chk29 = mold.ok;
    if (!mold.ok) issues.push(`CHK-29-duplicado: ${mold.issue?.slice(0, 100)}`);
  }

  const allOk = Object.values(gates).every((v) => v === true || v === null);
  const gateFails = Object.entries(gates).filter(([, v]) => v === false).map(([k]) => k);

  let verdict = 'perfect';
  let action = 'subir';
  if (!allOk) {
    const repairable = gateFails.every((g) =>
      ['quality', 'lexical', 'format'].includes(g) ||
      (g === 'partGate' && issues.some((i) => /CHK-14|word|copia|mcq/i.test(i))) ||
      (g === 'pool2' && issues.some((i) => /CHK-14/i.test(i))),
    );
    const structural = gateFails.some((g) => g === 'chk29') ||
      issues.some((i) => /CHK-29|molde/i.test(i));
    const hardBlock = issues.some((i) =>
      /CHK-6|CHK-8|CHK-10|CHK-18|CHK-28|CHK-29|word-copy|copia ≥|DEDUP/i.test(i),
    );

    if (structural && teil >= 4) {
      verdict = 'discard';
      action = 'descartar (molde duplicado — regenerar otro subtipo)';
    } else if (hardBlock && !repairable) {
      verdict = 'discard';
      action = 'descartar (fallo pedagógico/estructural difícil de reparar localmente)';
    } else if (gateFails.includes('format')) {
      verdict = 'discard';
      action = 'descartar (formato técnico roto)';
    } else if (issues.some((i) => /CHK-14/i.test(i))) {
      verdict = 'repair_or_discard';
      action = 'reparar caps (normalizeBatch) o descartar si persiste tras normalize';
    } else if (issues.some((i) => /calidad|word|copia|mcq_distinct/i.test(i))) {
      verdict = 'repair_or_discard';
      action = 'reparar word-copy/mcq (repair local) o descartar si LLM repair falla';
    } else {
      verdict = 'review';
      action = 'revisar manualmente';
    }
  }

  return {
    file,
    teil,
    gates,
    gateFails,
    issues: issues.slice(0, 5),
    allOk,
    verdict,
    action,
  };
}

async function main() {
  const poolIds = new Set();
  if (fs.existsSync(POOL_FILE)) {
    const pool = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));
    for (const r of pool.records || pool) {
      if (r?.id) poolIds.add(r.id);
    }
  }

  const files = fs.readdirSync(GENERATED_DIR).filter(isAuditFile).sort();
  const results = [];
  for (const file of files) {
    const { module, teil } = parseName(file);
    if (module !== 'lesen' || teil == null) continue;
    if (poolIds.has(file.replace(/\.json$/i, ''))) continue;
    const r = await auditFile(file);
    if (r) results.push(r);
  }

  const byTeil = {};
  for (const r of results) {
    if (!byTeil[r.teil]) byTeil[r.teil] = { perfect: [], repair: [], discard: [], review: [] };
    const bucket = r.allOk ? 'perfect' : r.verdict === 'discard' ? 'discard' : r.verdict === 'repair_or_discard' ? 'repair' : 'review';
    byTeil[r.teil][bucket].push(r);
  }

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('  AUDITORÍA COMPLETA Lesen generated/ — todos los filtros');
  console.log('  (formato + calidad + léxico + POOL-2 + CHK-29 intra-teil)');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  for (const t of [1, 2, 3, 4, 5]) {
    const b = byTeil[t] || { perfect: [], repair: [], discard: [], review: [] };
    const total = b.perfect.length + b.repair.length + b.discard.length + b.review.length;
    console.log(`── T${t} (${total} archivos en generated/, sin duplicar pool) ──`);
    console.log(`  ✅ Perfectas (todos filtros):     ${b.perfect.length}`);
    console.log(`  🔧 Reparar o descartar:         ${b.repair.length}`);
    console.log(`  ❌ Descartar:                   ${b.discard.length}`);
    console.log(`  ❓ Revisar:                     ${b.review.length}`);

    if (b.repair.length) {
      const byIssue = {};
      for (const r of b.repair) {
        const key = r.gateFails.join('+') || r.issues[0]?.slice(0, 40) || '?';
        byIssue[key] = (byIssue[key] || 0) + 1;
      }
      console.log('  Motivos reparar/descartar:');
      for (const [k, n] of Object.entries(byIssue).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
        console.log(`    · ${k}: ${n}`);
      }
    }
    if (b.discard.length && b.discard.length <= 8) {
      for (const r of b.discard.slice(0, 5)) {
        console.log(`    descartar: ${r.file} — ${r.issues[0] || r.action}`);
      }
    }
    if (b.perfect.length && b.perfect.length <= 5) {
      for (const r of b.perfect) console.log(`    ok: ${r.file}`);
    } else if (b.perfect.length > 5) {
      console.log(`    ok (muestra): ${b.perfect.slice(0, 3).map((r) => r.file).join(', ')} … +${b.perfect.length - 3}`);
    }
    console.log('');
  }

  const summary = {
    total: results.length,
    perfect: results.filter((r) => r.allOk).length,
    notPerfect: results.filter((r) => !r.allOk).length,
  };
  console.log('── RESUMEN GLOBAL ──');
  console.log(`  Total auditadas: ${summary.total}`);
  console.log(`  Perfectas:       ${summary.perfect} (${Math.round((summary.perfect / summary.total) * 100) || 0}%)`);
  console.log(`  Con fallos:      ${summary.notPerfect}`);

  if (process.argv.includes('--json')) {
    console.log('\n' + JSON.stringify({ byTeil, summary }, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
