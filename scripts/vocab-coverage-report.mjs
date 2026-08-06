/**
 * vocab-coverage-report.mjs — Track B (medición)
 *
 * Mide, sobre el vocab[] que añadió A.1, en cuántas partes del pool aparece cada lema
 * del nivel (library/vocab/{lang}/{level}.json, 1200 lemas en de/B1). Te dice:
 *   - cuántos lemas están cubiertos (≥1) y bien cubiertos (≥umbral),
 *   - la distribución (0 / 1-2 / ≥umbral partes),
 *   - por módulo+Teil, cuántos lemas quedan flojos,
 *   - y escribe la LISTA DE LEMAS FLOJOS (objetivo de la generación) a un archivo.
 *
 * Solo lee. No gasta IA. Idempotente.
 *
 * Uso:
 *   node scripts/vocab-coverage-report.mjs --lang de --level B1
 *   node scripts/vocab-coverage-report.mjs --lang de --level B1 --threshold 3
 *   NETLIFY_SITE_ID=... NETLIFY_API_TOKEN=... \
 *     node scripts/vocab-coverage-report.mjs --lang de --level B1 --source blobs
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';

const require = createRequire(import.meta.url);
loadEnvFile();

function parseArgs(argv) {
  const o = { lang: 'de', level: 'B1', threshold: 3, source: 'seed', json: false, jsonOut: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') o.lang = String(argv[++i]).toLowerCase();
    else if (a === '--level') o.level = String(argv[++i]).toUpperCase();
    else if (a === '--threshold') o.threshold = Math.max(1, Number(argv[++i]) || 3);
    else if (a === '--source') o.source = String(argv[++i]); // seed | blobs
    else if (a === '--json') o.json = true;
    else if (a === '--json-out') o.jsonOut = argv[++i];
  }
  return o;
}

function blobConnectionInfo() {
  const siteID = process.env.NETLIFY_SITE_ID || '';
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN || '';
  const { STORE_NAME } = require(path.join(ROOT, 'netlify/functions/lib/blobStore.js'));
  return {
    storeName: STORE_NAME,
    siteID: siteID ? `${siteID.slice(0, 8)}…` : '(missing)',
    hasToken: Boolean(token),
    remote: Boolean(siteID && token),
  };
}

function summarizePartsByTeil(parts) {
  const byTeil = {};
  for (const p of parts) {
    const k = `${p.module}:T${p.teil}`;
    byTeil[k] = (byTeil[k] || 0) + 1;
  }
  return byTeil;
}

// ── Lemas objetivo del nivel ─────────────────────────────────────────────────
function loadLemmaSet(lang, level) {
  const file = path.join(ROOT, 'library', 'vocab', lang, `${level}.json`);
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const lemmas = Array.isArray(d) ? d : d.lemmas || [];
  return [...new Set(lemmas.map((l) => String(l).toLowerCase()))];
}

// ── Partes del pool (seed local o Blobs de producción) ───────────────────────
function loadPartsFromSeed(lang, level) {
  const file = path.join(ROOT, 'library', 'reusable-seed', `${lang}_${level}.json`);
  if (!fs.existsSync(file)) return [];
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (d.records || []).map((r) => ({
    module: r.module, teil: r.teil, vocab: Array.isArray(r.vocab) ? r.vocab : [],
  }));
}

async function loadPartsFromBlobs(lang, level) {
  const { getStore } = require('@netlify/blobs');
  const { listPartsIndex } = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsStore.js'));
  const conn = blobConnectionInfo();
  if (!conn.remote) {
    throw new Error(
      'Falta NETLIFY_SITE_ID y NETLIFY_API_TOKEN (o NETLIFY_AUTH_TOKEN) en .env para --source blobs',
    );
  }
  console.log(
    `Blobs: store=${conn.storeName} site=${conn.siteID} token=${conn.hasToken ? 'OK' : 'missing'} (remoto)`,
  );
  const store = getStore({
    name: conn.storeName,
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN,
  });
  const out = [];
  for (const module of ['lesen', 'horen', 'schreiben', 'sprechen']) {
    const idx = await listPartsIndex(store, lang, level, module);
    console.log(`  list ${module}: ${idx.length} índices`);
    let loaded = 0;
    for (const row of idx) {
      loaded++;
      if (loaded === 1 || loaded === idx.length || loaded % 20 === 0) {
        console.log(`  ${module}: cargando payloads ${loaded}/${idx.length}…`);
      }
      const part = await store.get(row.partKey, { type: 'json' });
      if (part) out.push({ module, teil: part.teil, vocab: Array.isArray(part.vocab) ? part.vocab : [] });
    }
  }
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const opts = parseArgs(process.argv.slice(2));
  const lemmas = loadLemmaSet(opts.lang, opts.level);
  const lemmaSet = new Set(lemmas);

  const parts = opts.source === 'blobs'
    ? await loadPartsFromBlobs(opts.lang, opts.level)
    : loadPartsFromSeed(opts.lang, opts.level);

  if (!parts.length) {
    console.error('No hay partes que medir. ¿Has sembrado/etiquetado el pool?');
    process.exit(1);
  }

  const byTeil = summarizePartsByTeil(parts);
  console.log(`Partes por Teil (${opts.source}):`);
  for (const [k, n] of Object.entries(byTeil).sort()) {
    console.log(`  ${k.padEnd(14)} ${n}`);
  }

  // Conteo global: en cuántas partes aparece cada lema.
  const globalCount = new Map(lemmas.map((l) => [l, 0]));
  // Conteo por módulo+teil: cuántas partes de ese Teil contienen cada lema.
  const teilCount = new Map(); // key `${module}:T${teil}` -> Map(lemma -> n)

  for (const p of parts) {
    const tk = `${p.module}:T${p.teil}`;
    if (!teilCount.has(tk)) teilCount.set(tk, new Map());
    const tm = teilCount.get(tk);
    // lemas distintos de esta parte que son del nivel
    const seen = new Set();
    for (const v of p.vocab) {
      const lv = String(v).toLowerCase();
      if (!lemmaSet.has(lv) || seen.has(lv)) continue;
      seen.add(lv);
      globalCount.set(lv, (globalCount.get(lv) || 0) + 1);
      tm.set(lv, (tm.get(lv) || 0) + 1);
    }
  }

  // Distribución global.
  const T = opts.threshold;
  let cov0 = 0, cov12 = 0, covT = 0;
  const weak = []; // lemas en < T partes (objetivo de generación)
  for (const l of lemmas) {
    const n = globalCount.get(l) || 0;
    if (n === 0) cov0++; else if (n < T) cov12++; else covT++;
    if (n < T) weak.push({ lemma: l, parts: n });
  }
  weak.sort((a, b) => a.parts - b.parts);

  // Salida.
  console.log(`\n=== Cobertura de vocabulario · ${opts.lang}/${opts.level} · fuente: ${opts.source} ===`);
  console.log(`Partes medidas: ${parts.length} | lemas del nivel: ${lemmas.length} | umbral: ${T}`);
  console.log(`\nGlobal (en cuántas partes aparece cada lema):`);
  console.log(`  0 partes (sin cubrir):      ${cov0}  (${(cov0 / lemmas.length * 100).toFixed(1)}%)`);
  console.log(`  1..${T - 1} partes (flojo):        ${cov12}  (${(cov12 / lemmas.length * 100).toFixed(1)}%)`);
  console.log(`  ≥${T} partes (bien cubierto): ${covT}  (${(covT / lemmas.length * 100).toFixed(1)}%)`);

  console.log(`\nPor módulo+Teil (lemas del nivel sin ninguna parte que los contenga):`);
  const tks = [...teilCount.keys()].sort();
  for (const tk of tks) {
    const tm = teilCount.get(tk);
    let zero = 0;
    for (const l of lemmas) if (!(tm.get(l) > 0)) zero++;
    const partsHere = parts.filter((p) => `${p.module}:T${p.teil}` === tk).length;
    console.log(`  ${tk.padEnd(14)} partes=${String(partsHere).padStart(3)}  lemas_sin_cubrir=${zero}`);
  }

  // Escribe la lista de lemas flojos (objetivo de generación).
  // Defensa: no incluir lemas que fallen blacklist C1/C2 (por si el banco se recontamina).
  const { isBlacklistedLemma } = await import('./lib/lexicalCheck.mjs');
  const weakClean = weak.filter((w) => !isBlacklistedLemma(w.lemma));
  if (weakClean.length < weak.length) {
    console.log(
      `  (filtro blacklist: ${weak.length - weakClean.length} lemas flojos excluidos del weak pool)`,
    );
  }

  const outDir = path.join(ROOT, 'data', 'coverage');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `weak-${opts.lang}_${opts.level}.json`);
  fs.writeFileSync(outFile, JSON.stringify({
    lang: opts.lang, level: opts.level, threshold: T,
    generatedAt: new Date().toISOString(),
    totalLemmas: lemmas.length, weakCount: weakClean.length,
    weakLemmas: weakClean.map((w) => w.lemma),
    detail: weakClean,
  }, null, 2));
  console.log(`\nLemas flojos (en <${T} partes): ${weakClean.length} → escritos en ${path.relative(ROOT, outFile)}`);
  console.log(`Top 20 más flojos: ${weakClean.slice(0, 20).map((w) => w.lemma).join(', ')}\n`);

  const metrics = {
    lang: opts.lang,
    level: opts.level,
    source: opts.source,
    partsTotal: parts.length,
    partsByTeil: byTeil,
    lemmas: lemmas.length,
    threshold: T,
    cov0,
    cov12,
    covT,
    weakCount: weakClean.length,
  };

  if (opts.jsonOut) {
    const outPath = path.isAbsolute(opts.jsonOut)
      ? opts.jsonOut
      : path.join(ROOT, opts.jsonOut);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
    console.log(`Métricas JSON → ${path.relative(ROOT, outPath)}`);
  }

  if (opts.json) {
    console.log(JSON.stringify(metrics));
  }
})().catch((err) => { console.error('ERROR:', err?.message || err); process.exit(1); });
