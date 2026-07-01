#!/usr/bin/env node
/**
 * Seed reusable-parts store from library bank — excludes content already in curated exams.
 *
 *   node scripts/seed-reusable-from-bank.mjs --dry-run --verify
 *   node scripts/seed-reusable-from-bank.mjs --apply --verify
 *   node scripts/seed-reusable-from-bank.mjs --out-json library/reusable-seed/de_B1.bank.json
 *
 * Requires Netlify Blobs for --apply: NETLIFY_SITE_ID, NETLIFY_API_TOKEN
 * Optional structural gate: validates blueprint fidelity + partQualityGate (AI verify if ANTHROPIC_API_KEY set)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { examTypeForLang, comboKey } from './lib/examPipeline.mjs';
import { defaultSeedOutJson } from './lib/seedReusableCommon.mjs';
import {
  loadBank,
  loadCuratedExams,
  extractBankReusableParts,
  countByTeil,
} from './lib/bankReusableParts.mjs';
import { checkLesenBatchQuality } from './lib/lesenBatchQuality.mjs';
import { checkHorenBatchQuality } from './lib/horenBatchQuality.mjs';
import { checkPromptBatchQuality } from './lib/promptBatchQuality.mjs';

const require = createRequire(import.meta.url);

const { addReusablePart, listPartsIndex, rotateReusablePartsForModule } = require(path.join(
  ROOT,
  'netlify/functions/lib/reusablePartsStore.js',
));
const { loadBlueprintFileSync } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintResolver.js',
));
const { validateStagingRecord } = require(path.join(
  ROOT,
  'netlify/functions/lib/partQualityGate.js',
));
const { readAnthropicKey } = require(path.join(ROOT, 'netlify/functions/lib/anthropicKey.js'));

const STORE_NAME = 'lexicoil-data';
const WRITE_TIMEOUT_MS = Number(process.env.REUSABLE_WRITE_TIMEOUT_MS || 20000);

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label}: timeout tras ${ms}ms`)),
        ms,
      );
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function parseArgs(argv) {
  const o = {
    lang: 'de',
    level: 'B1',
    apply: false,
    verify: false,
    outJson: null,
    verbose: false,
    skipGate: false,
    withAi: false,
    maxPerTeil: 20,
    qualityGate: true,
    allowUnchecked: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--dry-run') o.apply = false;
    else if (a === '--verify') o.verify = true;
    else if (a === '--verbose') o.verbose = true;
    else if (a === '--skip-gate') o.skipGate = true;
    else if (a === '--with-ai') o.withAi = true;
    else if (a === '--quality-gate') o.qualityGate = true;
    else if (a === '--no-quality-gate') o.qualityGate = false;
    else if (a === '--allow-unchecked') o.allowUnchecked = true;
    else if (a === '--max-per-teil') o.maxPerTeil = parseInt(argv[++i], 10);
    else if (a === '--out-json') o.outJson = argv[++i];
    else if (a === '--lang') o.lang = String(argv[++i]).toLowerCase();
    else if (a === '--level') o.level = String(argv[++i]).toUpperCase();
    else if (a === '--help' || a === '-h') o.help = true;
  }
  return o;
}

function warnTlsOnWindows() {
  if (process.platform !== 'win32') return;
  if (process.env.NODE_OPTIONS?.includes('use-system-ca')) return;
  console.warn(
    'WARN: En Windows, si ves "fetch failed" al escribir Blobs, ejecuta con:\n' +
      '  set NODE_OPTIONS=--use-system-ca   (cmd)  o  $env:NODE_OPTIONS="--use-system-ca"   (PowerShell)',
  );
}

function getStoreForCli() {
  const { getStore } = require('@netlify/blobs');
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) return getStore({ name: STORE_NAME, siteID, token });
  return getStore(STORE_NAME);
}

async function verifyInventory(store, lang, level) {
  const modules = ['lesen', 'horen', 'schreiben', 'sprechen'];
  const report = {};
  for (const module of modules) {
    const entries = await listPartsIndex(store, lang, level, module);
    const byTeil = {};
    const byTeilAll = {};
    for (const e of entries) {
      const t = Number(e.teil);
      if (!Number.isFinite(t)) continue;
      byTeilAll[t] = (byTeilAll[t] || 0) + 1;
      if (e.complete && e.verified && !e.disabled) {
        byTeil[t] = (byTeil[t] || 0) + 1;
      }
    }
    report[module] = { verified: byTeil, total: byTeilAll, indexRows: entries.length };
  }
  return report;
}

function minForKey(k) {
  return k.startsWith('schreiben:') ? 8 : 1;
}

const UNCHECKED_MODULES = new Set(['horen', 'schreiben', 'sprechen']);

function slotKey(rec) {
  return `${rec.module}:t${rec.teil}`;
}

function initSlotCounts() {
  return {};
}

function bumpSlot(map, rec, n = 1) {
  const k = slotKey(rec);
  map[k] = (map[k] || 0) + n;
}

function lesenBatchFromRecord(rec) {
  const passages = (rec.passage?.passages || []).map((p) => ({
    id: p.passageId || p.id,
    text: p.text,
    title: p.textTitle || p.title,
  }));
  if (!passages.length && rec.passage?.text) {
    passages.push({
      id: rec.passage.passageId || 'main',
      text: rec.passage.text,
      title: rec.passage.title,
    });
  }
  return {
    questions: rec.questions || [],
    passages,
    ads: rec.ads || rec.passage?.ads,
  };
}

function moduleBatchFromRecord(rec) {
  if (rec.module === 'lesen') return lesenBatchFromRecord(rec);
  const passages = (rec.passage?.passages || []).map((p) => ({
    id: p.passageId || p.id,
    text: p.text,
    title: p.textTitle || p.title,
  }));
  if (!passages.length && rec.passage?.text) {
    passages.push({
      id: rec.passage.passageId || 'main',
      text: rec.passage.text,
      title: rec.passage.title,
    });
  }
  return {
    questions: rec.questions || [],
    passages,
    ads: rec.ads || rec.passage?.ads,
  };
}

function passesModuleQualityGate(rec, opts) {
  const batch = moduleBatchFromRecord(rec);
  if (rec.module === 'lesen') return checkLesenBatchQuality(batch, rec.teil).ok;
  if (rec.module === 'horen') return checkHorenBatchQuality(batch, rec.teil).ok;
  if (rec.module === 'schreiben' || rec.module === 'sprechen') {
    return checkPromptBatchQuality(batch, rec.module, rec.teil, {
      lang: opts.lang,
      level: opts.level,
    }).ok;
  }
  return true;
}

/** Decide si una parte extraída puede subirse al pool en --apply. */
function preUploadDecision(rec, opts) {
  if (opts.qualityGate) {
    if (!passesModuleQualityGate(rec, opts)) {
      return { upload: false, reason: 'quality' };
    }
    return { upload: true };
  }
  if (UNCHECKED_MODULES.has(rec.module)) {
    if (!opts.allowUnchecked) {
      return { upload: false, reason: 'unchecked' };
    }
  }
  return { upload: true };
}

function printSlotSummary(title, uploaded, quality, format, unchecked, errors) {
  const keys = new Set([
    ...Object.keys(uploaded),
    ...Object.keys(quality),
    ...Object.keys(format),
    ...Object.keys(unchecked),
    ...Object.keys(errors),
  ]);
  if (!keys.size) return;
  console.log(`\n── ${title} (por module/teil) ──`);
  console.log('slot\t\tsubidas\tdesc. calidad\tdesc. formato\tunchecked\terrores');
  for (const k of [...keys].sort()) {
    console.log(
      `${k.padEnd(12)}\t${uploaded[k] || 0}\t${quality[k] || 0}\t${format[k] || 0}\t${unchecked[k] || 0}\t${errors[k] || 0}`,
    );
  }
  const sum = (m) => Object.values(m).reduce((a, b) => a + b, 0);
  console.log(
    `Total\t\t${sum(uploaded)}\t${sum(quality)}\t${sum(format)}\t${sum(unchecked)}\t${sum(errors)}`,
  );
}

function simulateApplyFilter(records, opts) {
  const uploaded = initSlotCounts();
  const quality = initSlotCounts();
  const unchecked = initSlotCounts();
  for (const rec of records) {
    const d = preUploadDecision(rec, opts);
    if (d.upload) bumpSlot(uploaded, rec);
    else if (d.reason === 'quality') bumpSlot(quality, rec);
    else if (d.reason === 'unchecked') bumpSlot(unchecked, rec);
  }
  return { uploaded, quality, unchecked };
}

async function main() {
  loadEnvFile();
  warnTlsOnWindows();
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage: node scripts/seed-reusable-from-bank.mjs [--dry-run] [--apply] [--verify] [--verbose]
  --lang de --level B1
  --out-json library/reusable-seed/de_B1.bank.json
  --skip-gate   blueprint fidelity only (no structural gate)
  --with-ai     run AI semantic verify (needs ANTHROPIC_API_KEY + network)
  --quality-gate   calidad pedagógica antes de subir (default ON; lesen/horen/schreiben/sprechen)
  --no-quality-gate  desactiva checkLesenBatchQuality y checkers de otros módulos
  --allow-unchecked  sin --quality-gate: subir horen/schreiben/sprechen sin checker
  --max-per-teil N   cap parts per module/teil before apply (default 20)`);
    process.exit(0);
  }

  const blueprint = loadBlueprintFileSync(`${examTypeForLang(opts.lang)}_${opts.level}`);
  if (!blueprint) {
    console.error(`No blueprint for ${opts.lang}_${opts.level}`);
    process.exit(1);
  }

  const bank = loadBank(opts.lang, opts.level);
  const curated = loadCuratedExams(opts.lang, opts.level);
  const apiKey = opts.withAi ? readAnthropicKey() : null;

  const validateRecord =
    opts.skipGate
      ? null
      : async (record, { blueprint: bp }) =>
          validateStagingRecord(record, { blueprint: bp, apiKey: apiKey || null });

  console.log(`Bank: ${(bank.questions || []).length} questions | curated exams excluded: ${curated.length}`);
  if (opts.withAi && !apiKey) {
    console.warn('WARN: --with-ai set but ANTHROPIC_API_KEY missing — structural gate only.');
  }

  const { records, stats } = await extractBankReusableParts({
    lang: opts.lang,
    level: opts.level,
    blueprint,
    bank,
    curatedExams: curated,
    validateRecord,
    verbose: opts.verbose,
    maxPerTeil: opts.maxPerTeil,
  });

  const counts = countByTeil(records);
  console.log(`\n══ seed-reusable-from-bank (${opts.apply ? 'apply' : 'dry-run'}) ══ ${opts.lang}/${opts.level} ══`);
  console.log(`Candidates scanned: ${stats.candidates}`);
  console.log(`Excluded (curated overlap): ${stats.rejectedCurated}`);
  console.log(`Rejected (blueprint fidelity): ${stats.rejectedFidelity}`);
  console.log(`Rejected (quality gate): ${stats.rejectedGate}`);
  console.log(`Deduped: ${stats.deduped}`);
  console.log(`Bank-only parts accepted: ${records.length}`);
  console.log('Counts by Teil:', counts);
  if (opts.qualityGate) {
    console.log('Filtro apply: --quality-gate (lesen, horen, schreiben, sprechen)');
  } else if (opts.allowUnchecked) {
    console.log('Filtro apply: --allow-unchecked (horen/schreiben/sprechen sin checker)');
  } else {
    console.log('Apply: horen/schreiben/sprechen omitidos sin --quality-gate ni --allow-unchecked');
  }

  const formatBySlot = stats.rejectedFormatBySlot || {};
  console.log(
    `\nDescartadas por formato (extracción): fidelity=${stats.rejectedFidelity}, gate=${stats.rejectedGate}`,
  );

  const dryFilter = simulateApplyFilter(records, opts);
  printSlotSummary(
    opts.apply ? 'Previsión upload' : 'Simulación upload (dry-run)',
    dryFilter.uploaded,
    dryFilter.quality,
    formatBySlot,
    dryFilter.unchecked,
    initSlotCounts(),
  );

  if (!opts.apply) {
    if (opts.outJson) {
      const outPath = path.isAbsolute(opts.outJson) ? opts.outJson : path.join(ROOT, opts.outJson);
      console.log(`\nDRY-RUN — would write ${records.length} parts to ${outPath}`);
    }
    console.log('DRY-RUN — re-run with --apply to write to disk and Netlify Blobs.');
    process.exit(records.length ? 0 : 1);
  }

  if (opts.outJson) {
    const outPath = path.isAbsolute(opts.outJson) ? opts.outJson : path.join(ROOT, opts.outJson);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(
      outPath,
      `${JSON.stringify({ lang: opts.lang, level: opts.level, source: 'bank', records }, null, 2)}\n`,
    );
    console.log('Wrote', outPath);
  }

  const toUpload = [];
  const skippedQuality = initSlotCounts();
  const skippedUnchecked = initSlotCounts();

  for (const rec of records) {
    const d = preUploadDecision(rec, opts);
    if (d.upload) toUpload.push(rec);
    else if (d.reason === 'quality') {
      bumpSlot(skippedQuality, rec);
      if (opts.verbose) {
        const batch = moduleBatchFromRecord(rec);
        let firstIssue = 'FAIL';
        if (rec.module === 'lesen') {
          firstIssue = checkLesenBatchQuality(batch, rec.teil).issues?.[0] || firstIssue;
        } else if (rec.module === 'horen') {
          firstIssue = checkHorenBatchQuality(batch, rec.teil).issues?.[0] || firstIssue;
        } else if (rec.module === 'schreiben' || rec.module === 'sprechen') {
          firstIssue =
            checkPromptBatchQuality(batch, rec.module, rec.teil, {
              lang: opts.lang,
              level: opts.level,
            }).issues?.[0] || firstIssue;
        }
        console.warn(`  skip calidad ${rec.id}: ${firstIssue}`);
      }
    } else if (d.reason === 'unchecked') {
      bumpSlot(skippedUnchecked, rec);
    }
  }

  let store;
  try {
    store = getStoreForCli();
  } catch (err) {
    console.error('Could not connect to Netlify Blobs. Set NETLIFY_SITE_ID and NETLIFY_API_TOKEN.');
    console.error(err.message);
    process.exit(1);
  }

  let added = 0;
  let writeErrors = initSlotCounts();
  let timedOut = 0;
  const uploaded = initSlotCounts();
  const total = toUpload.length;
  console.log(
    `\nEscribiendo ${total} partes (${records.length - total} filtradas antes de upload; timeout ${WRITE_TIMEOUT_MS}ms)…`,
  );

  for (let i = 0; i < toUpload.length; i++) {
    const rec = toUpload[i];
    const label = `${rec.module} T${rec.teil} ${rec.id}`;
    const n = i + 1;
    console.log(`[${n}/${total}] → ${label}`);
    const t0 = Date.now();
    try {
      await withTimeout(
        addReusablePart(store, rec, { deferRotate: true }),
        WRITE_TIMEOUT_MS,
        label,
      );
      added++;
      bumpSlot(uploaded, rec);
      console.log(`[${n}/${total}] ✓ ${label} (${Date.now() - t0}ms)`);
    } catch (err) {
      bumpSlot(writeErrors, rec);
      if (/timeout/i.test(err.message)) timedOut++;
      console.warn(`[${n}/${total}] ✗ ${label}: ${err.message}`);
    }
  }

  printSlotSummary(
    'Resumen seed apply',
    uploaded,
    skippedQuality,
    formatBySlot,
    skippedUnchecked,
    writeErrors,
  );
  console.log(`\nSubidas: ${added} · timeouts: ${timedOut}`);

  if (added > 0) {
    console.log('\nRotando buckets (max 50/Teil)…');
    for (const module of ['lesen', 'horen']) {
      const deleted = await rotateReusablePartsForModule(store, opts.lang, opts.level, module);
      console.log(`  ${module}: ${deleted} partes rotadas fuera`);
    }
  }

  if (opts.verify) {
    const inv = await verifyInventory(store, opts.lang, opts.level);
    console.log('\nStore inventory (Blobs):');
    console.log(JSON.stringify(inv, null, 2));
    for (const [k, n] of Object.entries(counts)) {
      const [mod, tLabel] = k.split(':');
      const teil = Number(tLabel.replace('t', ''));
      const inStore = inv[mod]?.verified?.[teil] || 0;
      const totalInStore = inv[mod]?.total?.[teil] || 0;
      if (inStore < minForKey(k)) {
        console.warn(
          `WARN: ${k} has ${inStore} verified in store (${totalInStore} total index) — bank batch had ${n}`,
        );
      }
    }
    console.log('Verify complete.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
