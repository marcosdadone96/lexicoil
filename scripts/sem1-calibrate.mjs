#!/usr/bin/env node
/**
 * sem1-calibrate.mjs — Calibración SEM-1 con LLM REAL contra verdad conocida.
 *
 * NO bloquea ingestión. Solo mide:
 *   FALSOS POSITIVOS: partes KNOWN-CLEAN → SEM debería decir ok:true en todas.
 *     Targets: Hören T4 (7 partes, todas 0/0 en pool-health), Lesen T2 (14 partes, known-clean).
 *   VERDADEROS POSITIVOS: partes KNOWN-DIRTY → SEM debería detectar issues.
 *     Target: Lesen T4 (20 partes, CHK-7 en todas = incoherencia postura↔clave).
 *
 * Uso:
 *   node scripts/sem1-calibrate.mjs              # calibra los 3 grupos
 *   node scripts/sem1-calibrate.mjs --group h4   # solo Hören T4
 *   node scripts/sem1-calibrate.mjs --group l2   # solo Lesen T2
 *   node scripts/sem1-calibrate.mjs --group l4   # solo Lesen T4
 *   node scripts/sem1-calibrate.mjs --dry-run    # muestra prompts sin llamar LLM
 *
 * IMPORTANTE: Requiere GEMINI_API_KEY o ANTHROPIC_API_KEY en .env.
 *             Gasta ~(N_partes × 1 llamada) de cuota. Para las 41 partes = 41 llamadas.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Use the same .env loader as the rest of the project
import { loadEnvFile } from './lib/loadEnv.mjs';
loadEnvFile();

import {
  validatePartSemantics,
  clearSemanticCache,
  clearTemplateRegistry,
  _setLlmFn,
} from './lib/semanticValidator.mjs';

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const GROUP = args.includes('--group') ? args[args.indexOf('--group') + 1] : null;
const DRY_RUN = args.includes('--dry-run');
const PAUSE_MS = Number(process.env.SEM_CALIBRATE_PAUSE_MS || 1500);

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ─── Load pool records ───────────────────────────────────────────────────────
const POOL_FILE = path.join(ROOT, 'library', 'reusable-seed', 'de_B1.json');
if (!fs.existsSync(POOL_FILE)) {
  console.error('Missing:', POOL_FILE);
  process.exit(1);
}
const { records } = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));

function pickGroup(module, teil) {
  return records.filter((r) => r.module === module && Number(r.teil) === teil);
}

const GROUPS = {
  h4: { label: 'Hören T4 (KNOWN-CLEAN)',  expectedOk: true,  parts: pickGroup('horen', 4) },
  l2: { label: 'Lesen T2 (KNOWN-CLEAN)',  expectedOk: true,  parts: pickGroup('lesen', 2) },
  l4: { label: 'Lesen T4 (KNOWN-DIRTY)',  expectedOk: false, parts: pickGroup('lesen', 4) },
};

// ─── Dry-run: print prompt for first part of each group ──────────────────────
if (DRY_RUN) {
  // Import internals via a tiny shim
  const semModule = await import('./lib/semanticValidator.mjs');
  console.log('\n=== DRY-RUN: prompts para primer registro de cada grupo ===\n');
  for (const [gk, g] of Object.entries(GROUPS)) {
    if (GROUP && GROUP !== gk) continue;
    const part = g.parts[0];
    if (!part) { console.log(`${gk}: sin partes`); continue; }
    console.log(`\n${'─'.repeat(60)}\n[${gk}] ${part.id}\n${'─'.repeat(60)}`);
    // Call with a spy that captures the prompt
    let capturedPrompt = null;
    semModule._setLlmFn(async (p) => { capturedPrompt = p; return '{"themeTags":[],"issues":[]}'; });
    clearSemanticCache(); clearTemplateRegistry();
    await validatePartSemantics(part);
    semModule._setLlmFn(null);
    if (capturedPrompt) console.log(capturedPrompt);
    else console.log('(parte skipped — no MCQ, e.g. Schreiben)');
  }
  process.exit(0);
}

// ─── Provider info ────────────────────────────────────────────────────────────
{
  const useGemini = !!process.env.SEMANTIC_USE_GEMINI && !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const provider = useGemini ? `Gemini (${process.env.GEMINI_MODEL||'gemini-2.5-flash'})` : `Claude (${process.env.CLAUDE_GEN_MODEL||'claude-haiku-4-5'})`;
  const keySet = useGemini ? !!(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY) : !!process.env.ANTHROPIC_API_KEY;
  console.log(`Provider: ${provider} | Key set: ${keySet ? 'yes' : '⚠  NO'}`);
  if (!keySet) { console.error('API key missing.'); process.exit(1); }
  console.log('(LLM connectivity will be confirmed on first call)\n');
}

// ─── Real calibration run ───────────────────────────────────────────────────
clearSemanticCache();
clearTemplateRegistry();

const report = {};

for (const [gk, g] of Object.entries(GROUPS)) {
  if (GROUP && GROUP !== gk) continue;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`▶  ${g.label} — ${g.parts.length} partes`);
  console.log('═'.repeat(60));

  const results = [];

  for (let i = 0; i < g.parts.length; i++) {
    const part = g.parts[i];
    const pLabel = part.id || `${part.module}-t${part.teil}-#${i}`;
    process.stdout.write(`  [${i + 1}/${g.parts.length}] ${pLabel} … `);

    try {
      clearSemanticCache(); // force LLM call each time (no cross-part cache bleed)
      const result = await validatePartSemantics(part, { skipTemplate: gk !== 'l4' });

      if (result._llmError) {
        console.log(`⚠  LLM-ERROR (fail-open): ${result._llmError}`);
        results.push({ id: pLabel, ok: null, error: result._llmError });
      } else {
        const status = result.ok ? '✅ ok' : `❌ ${result.issues.length} issue(s)`;
        console.log(status);
        if (!result.ok) {
          for (const iss of result.issues) {
            const conf = typeof iss.confidence === 'number' ? ` (conf=${iss.confidence.toFixed(2)})` : '';
            console.log(`       ${iss.kind.padEnd(12)} [${iss.itemId}]${conf} ${iss.detail}`);
          }
        }
        results.push({ id: pLabel, partId: part.id, module: part.module, teil: part.teil, ok: result.ok, issues: result.issues });
      }
    } catch (err) {
      console.log(`⚠  ERROR: ${err.message}`);
      results.push({ id: pLabel, ok: null, error: err.message });
    }

    if (i < g.parts.length - 1) await sleep(PAUSE_MS);
  }

  const okCount   = results.filter((r) => r.ok === true).length;
  const failCount = results.filter((r) => r.ok === false).length;
  const errCount  = results.filter((r) => r.ok === null).length;

  let verdict = '';
  if (g.expectedOk) {
    const fp = failCount;
    verdict = fp === 0
      ? `✅ 0 falsos positivos (${okCount}/${g.parts.length} ok)`
      : `⚠  ${fp} FALSO(S) POSITIVO(S) — ajustar prompt (${okCount}/${g.parts.length} ok)`;
  } else {
    const tp = failCount;
    verdict = tp > 0
      ? `✅ ${tp}/${g.parts.length} true positivos detectados`
      : `❌ 0/20 detectados — validador CIEGO en L4, revisar prompt`;
  }

  console.log(`\n  ── Resumen ${g.label} ──`);
  console.log(`  ok: ${okCount}  fail: ${failCount}  error: ${errCount}`);
  console.log(`  VEREDICTO: ${verdict}\n`);

  report[gk] = { label: g.label, ok: okCount, fail: failCount, error: errCount, results };
}

// ─── Final table ─────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log('CALIBRACIÓN SEM-1 — RESUMEN FINAL');
console.log('═'.repeat(60));
console.log(`${'Grupo'.padEnd(25)} ${'OK'.padStart(4)} ${'Fail'.padStart(4)} ${'Err'.padStart(4)}  ${'Veredicto'}`);
console.log('─'.repeat(60));
for (const [gk, g] of Object.entries(GROUPS)) {
  if (GROUP && GROUP !== gk) continue;
  const r = report[gk];
  if (!r) continue;
  const isCleanGroup = GROUPS[gk].expectedOk;
  const verdict = isCleanGroup
    ? (r.fail === 0 ? '✅ 0 FP' : `⚠  ${r.fail} FP`)
    : (r.fail > 0   ? `✅ ${r.fail} TP` : '❌ CIEGO');
  console.log(`${g.label.padEnd(25)} ${String(r.ok).padStart(4)} ${String(r.fail).padStart(4)} ${String(r.error).padStart(4)}  ${verdict}`);
}
console.log('═'.repeat(60));
console.log('\nDECISIÓN: si FP=0 en grupos clean y TP>0 en L4 → SEM-1 listo para bloqueo.');
console.log('Si FP>0 → ajustar prompt (más restrictivo, añadir "solo marca si estás seguro").');
console.log('Si TP=0 en L4 → prompt demasiado permisivo, revisar checks 1-2.\n');

// ─── Write sem1-findings-baseline.json ───────────────────────────────────────
// Collects every part where SEM-1 found at least one issue (conf ≥ threshold).
// These are structurally-clean parts with semantic bugs that must NOT be reused.
const baselineFindings = [];
for (const [gk, g] of Object.entries(GROUPS)) {
  if (GROUP && GROUP !== gk) continue;
  const r = report[gk];
  if (!r) continue;
  for (const res of r.results) {
    if (res.ok === false && Array.isArray(res.issues) && res.issues.length > 0) {
      baselineFindings.push({
        group: gk,
        partId: res.partId || res.id,
        module: res.module,
        teil: res.teil,
        issues: res.issues.map((iss) => ({
          kind: iss.kind,
          itemId: iss.itemId,
          confidence: iss.confidence,
          detail: iss.detail,
        })),
      });
    }
  }
}

if (baselineFindings.length > 0) {
  const BASELINE_FILE = path.join(ROOT, 'sem1-findings-baseline.json');
  const baseline = {
    generated: new Date().toISOString(),
    description: 'Parts structurally OK but flagged by SEM-1 (conf ≥ 0.85). Must be regenerated in POOL-3, not reused.',
    confidenceThreshold: 0.85,
    totalFindings: baselineFindings.length,
    findings: baselineFindings,
  };
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2), 'utf8');
  console.log(`\n📄 sem1-findings-baseline.json escrito — ${baselineFindings.length} parte(s) con bugs reales.`);
  console.log(`   Ruta: ${BASELINE_FILE}\n`);
} else {
  console.log('\n✅ 0 bugs reales encontrados — sem1-findings-baseline.json no escrito (nada que marcar).\n');
}
