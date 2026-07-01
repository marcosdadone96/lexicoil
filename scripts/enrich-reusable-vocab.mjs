/**
 * enrich-reusable-vocab.mjs — Track A.1
 *
 * Añade a cada parte reutilizable un campo `vocab: [lemas]` (y un `topic`)
 * extraído de su pasaje, para poder seleccionar partes por el vocabulario
 * que pide el usuario.
 *
 * Reutiliza el MISMO pipeline de lematización que el resto del proyecto:
 *   netlify/functions/lib/passageVocab.js  →  extractPassageVocab(text, lang, level)
 *
 * Dos destinos (no excluyentes):
 *   1) Archivo local de seed: library/reusable-seed/{lang}_{level}.json  (siempre)
 *   2) Store de Netlify Blobs en producción: solo con --apply (in-place, idempotente)
 *
 * Uso:
 *   node scripts/enrich-reusable-vocab.mjs --lang de --level B1 --dry-run
 *   NETLIFY_SITE_ID=... NETLIFY_API_TOKEN=... \
 *     node scripts/enrich-reusable-vocab.mjs --lang de --level B1 --apply
 *
 * Idempotente: re-ejecutar recalcula `vocab`/`topic` y sobrescribe (no duplica).
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';

const require = createRequire(import.meta.url);
loadEnvFile();

// — APIs internas del proyecto (mismas que usa el runtime) —
const { extractPassageVocab } = require(
  path.join(ROOT, 'netlify/functions/lib/passageVocab.js'),
);
const { listPartsIndex } = require(
  path.join(ROOT, 'netlify/functions/lib/reusablePartsStore.js'),
);
const { STORE_NAME } = require(
  path.join(ROOT, 'netlify/functions/lib/blobStore.js'),
);

// Cuántos lemas guardar por parte (suficiente para emparejar sin inflar el blob).
const MAX_VOCAB = 30;

// ─── Args ──────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = { lang: 'de', level: 'B1', apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--dry-run') o.apply = false;
    else if (a === '--lang') o.lang = String(argv[++i]).toLowerCase();
    else if (a === '--level') o.level = String(argv[++i]).toUpperCase();
  }
  return o;
}

// ─── Texto y tema de una parte ───────────────────────────────────────────────
/**
 * Reúne TODO el texto legible de una parte. Cubre las distintas formas:
 *   - passage.text / passage.title           (Lesen Teil 1, 3, 5; Hören)
 *   - passage.passages[].text / .textTitle   (Lesen Teil 2: Texto A + B)
 *   - segments[].transcript / .text          (Hören)
 *   - ads[].text / .title                    (Lesen Teil 3: ads_matching)
 *   - questions[].signText / .question / options[]  (Lesen Teil 4 foro, y refuerzo general)
 */
function partText(part) {
  const chunks = [];
  const p = part?.passage;
  if (p) {
    if (p.text) chunks.push(String(p.text));
    if (p.title) chunks.push(String(p.title));
    if (Array.isArray(p.passages)) {
      for (const pp of p.passages) {
        if (pp?.text) chunks.push(String(pp.text));
        if (pp?.textTitle) chunks.push(String(pp.textTitle));
      }
    }
  }
  if (Array.isArray(part?.segments)) {
    for (const seg of part.segments) {
      if (seg?.transcript) chunks.push(String(seg.transcript));
      if (seg?.text) chunks.push(String(seg.text));
    }
  }
  if (Array.isArray(part?.ads)) {
    for (const ad of part.ads) {
      if (ad?.text) chunks.push(String(ad.text));
      if (ad?.title) chunks.push(String(ad.title));
    }
  }
  if (Array.isArray(part?.questions)) {
    for (const q of part.questions) {
      if (q?.signText) chunks.push(String(q.signText));
      if (q?.question) chunks.push(String(q.question));
      if (Array.isArray(q.options)) {
        for (const o of q.options) {
          if (typeof o === 'string') chunks.push(o);
          else if (o?.text) chunks.push(String(o.text));
        }
      }
    }
  }
  return chunks.join('\n').trim();
}

/** Tema estable para la diversidad intra-módulo (A.2/A.3). */
function partTopic(part, vocab) {
  const title = String(part?.passage?.title || '').trim().toLowerCase();
  if (title) {
    return title
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // sin acentos
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }
  return (vocab.slice(0, 2).join('-') || 'sin-tema').slice(0, 48);
}

/** Calcula { vocab, topic } para una parte. Mutará la parte el llamante. */
function computeTags(part, lang, level) {
  if (part.schemaVersion == null) part.schemaVersion = 1;
  const text = partText(part);
  const vocab = text ? extractPassageVocab(text, lang, level, MAX_VOCAB) : [];
  const topic = partTopic(part, vocab);
  return { vocab, topic };
}

// ─── Enriquecer el archivo local de seed ─────────────────────────────────────
function enrichLocalSeed(lang, level) {
  const file = path.join(ROOT, 'library', 'reusable-seed', `${lang}_${level}.json`);
  if (!fs.existsSync(file)) {
    console.warn(`[local] no existe ${file} — se omite el archivo local`);
    return { file: null, total: 0, tagged: 0 };
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const records = Array.isArray(data.records) ? data.records : [];
  let tagged = 0;
  for (const rec of records) {
    const { vocab, topic } = computeTags(rec, lang, level);
    rec.vocab = vocab;
    rec.topic = topic;
    if (vocab.length) tagged++;
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return { file, total: records.length, tagged };
}

// ─── Enriquecer el store de Blobs (in-place, idempotente) ────────────────────
function getStoreForCli() {
  const { getStore } = require('@netlify/blobs');
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) return getStore({ name: STORE_NAME, siteID, token });
  return getStore(STORE_NAME); // contexto Netlify (no CLI) — normalmente no aquí
}

const MODULES = ['lesen', 'horen', 'schreiben', 'sprechen'];
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

async function enrichBlobs(lang, level) {
  let store;
  try {
    store = getStoreForCli();
  } catch (err) {
    console.error('No se pudo conectar a Netlify Blobs. Define NETLIFY_SITE_ID y NETLIFY_API_TOKEN.');
    throw err;
  }

  const summary = {};
  for (const module of MODULES) {
    const index = await listPartsIndex(store, lang, level, module);
    let updated = 0;
    let failed = 0;
    const total = index.length;
    console.log(`[blobs] ${module}: ${total} partes`);
    for (let i = 0; i < index.length; i++) {
      const row = index[i];
      const label = `${module} T${row.teil} ${row.id}`;
      console.log(`  [${i + 1}/${total}] ${label}`);
      try {
        const part = await store.get(row.partKey, { type: 'json' });
        if (!part) continue;
        const { vocab, topic } = computeTags(part, lang, level);
        part.vocab = vocab;
        part.topic = topic;
        await withTimeout(store.setJSON(row.partKey, part), WRITE_TIMEOUT_MS, label);
        updated++;
      } catch (err) {
        failed++;
        console.warn(`  ✗ ${label}: ${err.message}`);
      }
    }
    if (index.length) summary[module] = `${updated}/${index.length}${failed ? ` (${failed} fail)` : ''}`;
  }
  return summary;
}

// ─── Main ────────────────────────────────────────────────────────────────────
(async () => {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`Enrich vocab — ${opts.lang}_${opts.level} — ${opts.apply ? 'APPLY (local + Blobs)' : 'DRY-RUN (sin escrituras)'}`);

  if (!opts.apply) {
    // Dry-run: compute tags and show stats without writing anything
    const file = path.join(ROOT, 'library', 'reusable-seed', `${opts.lang}_${opts.level}.json`);
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const records = Array.isArray(data.records) ? data.records : [];
      console.log(`[dry-run] ${records.length} partes en ${path.relative(ROOT, file)} — se enriquecerían con vocab/topic`);
    } else {
      console.warn(`[dry-run] no existe ${file}`);
    }
    console.log('\nDRY-RUN — re-ejecuta con --apply (y NETLIFY_SITE_ID/NETLIFY_API_TOKEN) para escribir vocab al disco y al store de Blobs.');
    return;
  }

  // 1) Archivo local (solo con --apply)
  const local = enrichLocalSeed(opts.lang, opts.level);
  if (local.file) {
    console.log(`[local] ${local.tagged}/${local.total} partes con vocab → ${path.relative(ROOT, local.file)}`);
  }

  // 2) Blobs (solo con --apply)
  const blobs = await enrichBlobs(opts.lang, opts.level);
  console.log('[blobs] partes actualizadas por módulo:');
  for (const [m, ratio] of Object.entries(blobs)) console.log(`  ${m}: ${ratio}`);
  console.log('\nOK — vocab[] y topic escritos en el store de producción.');
})().catch((err) => {
  console.error('ERROR:', err?.message || err);
  process.exit(1);
});
