#!/usr/bin/env node
/**
 * audit-pool-quality.mjs — Audita calidad pedagógica de partes Lesen en Netlify Blobs.
 *
 * El seed estructural no ejecuta checkLesenBatchQuality; este script detecta copias
 * literales y otros fallos pedagógicos antes de servir partes del pool.
 *
 *   node scripts/audit-pool-quality.mjs --lang de --level B1              # dry-run (default)
 *   node scripts/audit-pool-quality.mjs --lang de --level B1 --apply      # deshabilita las que fallan
 *
 * Windows + Blobs remotos:
 *   $env:NODE_OPTIONS="--use-system-ca"
 *   NETLIFY_SITE_ID + NETLIFY_API_TOKEN en .env
 *
 * --apply: marca disabled:true en índice + payload (reversible; no borra).
 * Añade qualityRejectedAt / qualityRejectReason al payload para auditoría.
 */

import path from 'node:path';
import { createRequire } from 'node:module';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { checkLesenBatchQuality } from './lib/lesenBatchQuality.mjs';

const require = createRequire(import.meta.url);

loadEnvFile();

const {
  listPartsIndex,
  getReusablePart,
} = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsStore.js'));

const STORE_NAME = 'lexicoil-data';
const WRITE_TIMEOUT_MS = Number(process.env.REUSABLE_WRITE_TIMEOUT_MS || 20000);

function parseArgs(argv) {
  const o = {
    lang: 'de',
    level: 'B1',
    apply: false,
    verbose: false,
    teil: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--dry-run') o.apply = false;
    else if (a === '--verbose') o.verbose = true;
    else if (a === '--lang') o.lang = String(argv[++i]).toLowerCase();
    else if (a === '--level') o.level = String(argv[++i]).toUpperCase();
    else if (a === '--teil') o.teil = parseInt(argv[++i], 10);
    else if (a === '--help' || a === '-h') o.help = true;
  }
  return o;
}

function warnTlsOnWindows() {
  if (process.platform !== 'win32') return;
  if (process.env.NODE_OPTIONS?.includes('use-system-ca')) return;
  console.warn(
    'WARN: En Windows, si ves "fetch failed", ejecuta:\n' +
      '  $env:NODE_OPTIONS="--use-system-ca"',
  );
}

function getStoreForCli() {
  const { getStore } = require('@netlify/blobs');
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) return getStore({ name: STORE_NAME, siteID, token });
  return getStore(STORE_NAME);
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}: timeout tras ${ms}ms`)), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** Reconstruye batch Lesen para checkLesenBatchQuality (misma forma que load-bank-to-postgres). */
function lesenBatchFromPart(part) {
  const passages = (part.passage?.passages || []).map((p) => ({
    id: p.passageId || p.id,
    text: p.text,
    title: p.textTitle || p.title,
  }));
  if (!passages.length && part.passage?.text) {
    passages.push({
      id: part.passage.passageId || 'main',
      text: part.passage.text,
      title: part.passage.title,
    });
  }
  return {
    questions: part.questions || [],
    passages,
    ads: part.ads || part.passage?.ads,
  };
}

function initTeilStats() {
  return { audited: 0, ok: 0, fail: 0, skippedDisabled: 0, marked: 0, alreadyDisabled: 0 };
}

function teilKey(t) {
  return Number.isFinite(Number(t)) ? Number(t) : '?';
}

async function loadIndexRow(store, indexKey) {
  try {
    return await store.get(indexKey, { type: 'json' });
  } catch (_) {
    return null;
  }
}

/**
 * Deshabilita parte en índice + payload. Reversible (disabled:false manual o script futuro).
 * No borra blobs.
 */
async function markPartRejected(store, entry, part, reason) {
  const now = Date.now();
  const meta = {
    qualityRejectedAt: now,
    qualityRejectReason: reason,
    qualityRejectedBy: 'audit-pool-quality',
  };

  const updatedPart = { ...part, disabled: true, ...meta };
  await store.setJSON(entry.partKey, updatedPart);

  const idx = (await loadIndexRow(store, entry.indexKey)) || {
    partKey: entry.partKey,
    id: entry.id,
    teil: entry.teil,
    complete: entry.complete,
    verified: entry.verified,
    createdAt: entry.createdAt,
    contributor: entry.contributor,
    servedCount: entry.servedCount || 0,
  };
  await store.setJSON(entry.indexKey, {
    ...idx,
    disabled: true,
    qualityRejectedAt: now,
  });
}

async function main() {
  warnTlsOnWindows();
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(`Usage: node scripts/audit-pool-quality.mjs [options]
  --lang de --level B1
  --teil N          auditar solo un Teil
  --dry-run         informe sin cambios (default)
  --apply           disabled:true en índice + payload (reversible)
  --verbose`);
    process.exit(0);
  }

  let store;
  try {
    store = getStoreForCli();
  } catch (err) {
    console.error('No se pudo conectar a Netlify Blobs. NETLIFY_SITE_ID + NETLIFY_API_TOKEN.');
    console.error(err.message);
    process.exit(1);
  }

  const siteID = process.env.NETLIFY_SITE_ID || '';
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN || '';
  console.log(
    `\n══ audit-pool-quality (${opts.apply ? 'APPLY' : 'DRY-RUN'}) ══ ${opts.lang}/${opts.level} lesen ══`,
  );
  console.log(
    `Blobs: store=${STORE_NAME} site=${siteID ? `${siteID.slice(0, 8)}…` : '(local)'} token=${token ? 'OK' : 'missing'}`,
  );

  const entries = await listPartsIndex(store, opts.lang, opts.level, 'lesen');
  let rows = entries;
  if (opts.teil != null && Number.isFinite(opts.teil)) {
    rows = rows.filter((e) => Number(e.teil) === opts.teil);
  }

  console.log(`Índice lesen: ${rows.length} partes${opts.teil ? ` (Teil ${opts.teil})` : ''}\n`);

  const byTeil = {};
  const failures = [];
  let totalAudited = 0;
  let totalOk = 0;
  let totalFail = 0;
  let totalMarked = 0;
  let totalAlreadyDisabled = 0;
  let totalSkippedNoPayload = 0;

  for (let i = 0; i < rows.length; i++) {
    const entry = rows[i];
    const t = teilKey(entry.teil);
    if (!byTeil[t]) byTeil[t] = initTeilStats();
    byTeil[t].audited += 1;
    totalAudited += 1;

    const label = `[${i + 1}/${rows.length}] T${t} ${entry.id}`;
    if (opts.verbose) console.log(`${label} …`);

    const part = await getReusablePart(store, opts.lang, opts.level, 'lesen', entry.id);
    if (!part) {
      totalSkippedNoPayload += 1;
      if (opts.verbose) console.warn(`  skip ${entry.id}: payload missing`);
      continue;
    }

    if (entry.disabled || part.disabled) {
      byTeil[t].alreadyDisabled += 1;
      totalAlreadyDisabled += 1;
      if (opts.verbose) console.log(`  already disabled`);
      continue;
    }

    const batch = lesenBatchFromPart(part);
    const result = checkLesenBatchQuality(batch, t);

    if (result.ok) {
      byTeil[t].ok += 1;
      totalOk += 1;
      if (opts.verbose) console.log(`  OK (~${result.scoreEstimate}%)`);
      continue;
    }

    const firstIssue = result.issues[0] || 'calidad pedagógica FAIL';
    byTeil[t].fail += 1;
    totalFail += 1;
    failures.push({ id: entry.id, teil: t, issue: firstIssue, issues: result.issues.length });
    console.log(`  FAIL T${t} ${entry.id}: ${firstIssue}`);

    if (opts.apply) {
      try {
        await withTimeout(
          markPartRejected(store, entry, part, firstIssue),
          WRITE_TIMEOUT_MS,
          entry.id,
        );
        byTeil[t].marked += 1;
        totalMarked += 1;
        console.log(`    → disabled (reversible)`);
      } catch (err) {
        console.error(`    → ERROR: ${err.message}`);
      }
    }
  }

  console.log('\n── Por Teil ──');
  console.log('Teil\tauditadas\tOK\tFAIL\t ya disabled\tmarcadas (apply)');
  for (const t of Object.keys(byTeil).sort((a, b) => Number(a) - Number(b))) {
    const s = byTeil[t];
    console.log(
      `T${t}\t${s.audited}\t${s.ok}\t${s.fail}\t${s.alreadyDisabled}\t${s.marked}`,
    );
  }

  console.log('\n── Resumen ──');
  console.log(`Total auditadas:     ${totalAudited}`);
  console.log(`OK (pedagógico):     ${totalOk}`);
  console.log(`FAIL:                ${totalFail}`);
  console.log(`Ya disabled:         ${totalAlreadyDisabled}`);
  if (totalSkippedNoPayload) console.log(`Sin payload:         ${totalSkippedNoPayload}`);
  if (opts.apply) {
    console.log(`Marcadas rejected:   ${totalMarked}`);
  } else if (totalFail > 0) {
    console.log('\nDRY-RUN — re-ejecuta con --apply para deshabilitar las que fallan.');
    console.log('Recuperación: set disabled:false en índice + payload (o borrar qualityRejected*).');
  }

  if (failures.length && !opts.verbose) {
    console.log('\n── IDs que fallan (primer problema) ──');
    for (const f of failures) {
      console.log(`  T${f.teil}  ${f.id}`);
      console.log(`         ${f.issue}`);
    }
  }

  process.exit(totalFail > 0 && !opts.apply ? 2 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
