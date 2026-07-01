#!/usr/bin/env node
/**
 * load-bank-to-postgres.mjs — CLI loader (NOT runtime)
 *
 * Groups library bank questions into reusable Teile (same logic as seed-reusable-from-bank)
 * and upserts into Supabase tables: parts + part_lemmas.
 *
 * Prerequisites:
 *   1. Run supabase/migrations/007_reusable_parts_pool.sql
 *   2. SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env
 *
 * Usage:
 *   node scripts/load-bank-to-postgres.mjs --lang de --level B1 --dry-run
 *   node scripts/load-bank-to-postgres.mjs --lang de --level B1
 *   node scripts/load-bank-to-postgres.mjs --lang de --level B1 --quality-gate
 *   node scripts/load-bank-to-postgres.mjs --lang de --level B1 --max-per-teil 50
 *
 * Idempotent: re-run upserts same id and refreshes part_lemmas.
 * Does NOT touch Netlify Blobs or exam-part.js.
 */

import path from 'node:path';
import { createRequire } from 'node:module';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { examTypeForLang } from './lib/examPipeline.mjs';
import {
  loadBank,
  loadCuratedExams,
  extractBankReusableParts,
} from './lib/bankReusableParts.mjs';
import { checkLesenBatchQuality } from './lib/lesenBatchQuality.mjs';

const require = createRequire(import.meta.url);

loadEnvFile();

const { createClient } = require('@supabase/supabase-js');
const { loadBlueprintFileSync } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintResolver.js',
));
const { extractPassageVocab } = require(path.join(
  ROOT,
  'netlify/functions/lib/passageVocab.js',
));

const MAX_VOCAB = 30;
const BATCH = 50;

function parseArgs(argv) {
  const o = {
    lang: 'de',
    level: 'B1',
    dryRun: false,
    qualityGate: false,
    maxPerTeil: null,
    verbose: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--quality-gate') o.qualityGate = true;
    else if (a === '--verbose') o.verbose = true;
    else if (a === '--lang') o.lang = String(argv[++i]).toLowerCase();
    else if (a === '--level') o.level = String(argv[++i]).toUpperCase();
    else if (a === '--max-per-teil') o.maxPerTeil = parseInt(argv[++i], 10);
    else if (a === '--help' || a === '-h') o.help = true;
  }
  return o;
}

/** Mirrors enrich-reusable-vocab.mjs — all readable text in a part. */
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
        for (const opt of q.options) {
          if (typeof opt === 'string') chunks.push(opt);
          else if (opt?.text) chunks.push(String(opt.text));
        }
      }
    }
  }
  return chunks.join('\n').trim();
}

function computeVocab(record, lang, level) {
  const text = partText(record);
  if (!text) return [];
  return extractPassageVocab(text, lang, level, MAX_VOCAB).map((l) => String(l).toLowerCase());
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

function parseSource(record) {
  const c = String(record.contributor || '');
  if (c.startsWith('bank:')) return 'bank';
  if (c.startsWith('curated') || c.includes('cur-de-')) return 'curated';
  if (c.startsWith('gemini') || c.includes('gemini')) return 'gemini';
  if (c.startsWith('auto')) return 'auto';
  return c.split(':')[0] || 'bank';
}

function slotKey(module, teil) {
  return `${module}:t${teil}`;
}

function initSummary() {
  return { inserted: {}, updated: {}, skipped: {} };
}

function bump(map, key, field) {
  if (!map[field][key]) map[field][key] = 0;
  map[field][key] += 1;
}

async function fetchExistingIds(sb, lang, level) {
  const ids = new Set();
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await sb
      .from('parts')
      .select('id')
      .eq('lang', lang)
      .eq('level', level)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`fetch existing ids: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) ids.add(row.id);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return ids;
}

async function upsertPart(sb, row) {
  const { error } = await sb.from('parts').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`upsert parts ${row.id}: ${error.message}`);
}

async function syncPartLemmas(sb, partId, lemmas) {
  const { error: delErr } = await sb.from('part_lemmas').delete().eq('part_id', partId);
  if (delErr) throw new Error(`delete part_lemmas ${partId}: ${delErr.message}`);
  if (!lemmas.length) return;
  const rows = lemmas.map((lemma) => ({ part_id: partId, lemma }));
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await sb.from('part_lemmas').insert(chunk);
    if (error) throw new Error(`insert part_lemmas ${partId}: ${error.message}`);
  }
}

function printSummary(summary) {
  const keys = new Set([
    ...Object.keys(summary.inserted),
    ...Object.keys(summary.updated),
    ...Object.keys(summary.skipped),
  ]);
  const sorted = [...keys].sort();
  console.log('\n── Resumen por module/teil ──');
  console.log('slot\t\tinserted\tupdated\tskipped');
  for (const k of sorted) {
    console.log(
      `${k.padEnd(12)}\t${summary.inserted[k] || 0}\t\t${summary.updated[k] || 0}\t\t${summary.skipped[k] || 0}`,
    );
  }
  const tot = (m) => Object.values(m).reduce((a, b) => a + b, 0);
  console.log(
    `\nTotal: inserted=${tot(summary.inserted)} updated=${tot(summary.updated)} skipped=${tot(summary.skipped)}`,
  );
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage: node scripts/load-bank-to-postgres.mjs [options]
  --lang de --level B1
  --dry-run              preview without writing
  --quality-gate         lesen only: skip parts failing checkLesenBatchQuality
  --max-per-teil N       cap candidates per slot (same as bank seed)
  --verbose`);
    process.exit(0);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!opts.dryRun && (!supabaseUrl || !supabaseKey)) {
    console.error('ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const blueprint = loadBlueprintFileSync(`${examTypeForLang(opts.lang)}_${opts.level}`);
  if (!blueprint) {
    console.error(`No blueprint for ${opts.lang}_${opts.level}`);
    process.exit(1);
  }

  const bank = loadBank(opts.lang, opts.level);
  const curated = loadCuratedExams(opts.lang, opts.level);

  console.log(
    `load-bank-to-postgres — ${opts.lang}/${opts.level} — ${opts.dryRun ? 'DRY-RUN' : 'APPLY'}${
      opts.qualityGate ? ' + quality-gate (lesen)' : ''
    }`,
  );
  console.log(`Bank questions: ${(bank.questions || []).length} | curated exams excluded: ${curated.length}`);

  const { records, stats } = await extractBankReusableParts({
    lang: opts.lang,
    level: opts.level,
    blueprint,
    bank,
    curatedExams: curated,
    validateRecord: null,
    maxPerTeil: opts.maxPerTeil,
    verbose: opts.verbose,
  });

  console.log(
    `Extracted: ${records.length} parts (candidates=${stats.candidates}, curated=${stats.rejectedCurated}, fidelity=${stats.rejectedFidelity})`,
  );

  const sb =
    !opts.dryRun &&
    createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

  const existingIds = sb ? await fetchExistingIds(sb, opts.lang, opts.level) : new Set();
  const summary = initSummary();

  for (const rec of records) {
    const key = slotKey(rec.module, rec.teil);

    if (rec.module === 'lesen' && opts.qualityGate) {
      const batch = lesenBatchFromRecord(rec);
      const q = checkLesenBatchQuality(batch, rec.teil);
      if (!q.ok) {
        bump(summary, key, 'skipped');
        if (opts.verbose) {
          console.warn(`  skip ${rec.id}: quality ${q.issues.slice(0, 2).join('; ')}`);
        }
        continue;
      }
    }

    const vocab = computeVocab(rec, opts.lang, opts.level);
    const qualityOk =
      rec.module !== 'lesen'
        ? true
        : opts.qualityGate
          ? true
          : false;

    const row = {
      id: rec.id,
      lang: rec.lang,
      level: rec.level,
      module: rec.module,
      teil: rec.teil,
      payload: rec,
      vocab,
      schema_version: rec.schemaVersion || 1,
      quality_ok: qualityOk,
      source: parseSource(rec),
    };

    if (opts.dryRun) {
      const action = existingIds.has(rec.id) ? 'updated' : 'inserted';
      bump(summary, key, action);
      continue;
    }

    try {
      await upsertPart(sb, row);
      await syncPartLemmas(sb, rec.id, vocab);
      bump(summary, key, existingIds.has(rec.id) ? 'updated' : 'inserted');
      existingIds.add(rec.id);
    } catch (err) {
      console.error(`  FAIL ${rec.id}: ${err.message}`);
      bump(summary, key, 'skipped');
    }
  }

  printSummary(summary);
  if (opts.dryRun) {
    console.log('\nDRY-RUN — re-run without --dry-run to write to Supabase.');
  } else {
    console.log('\nOK — parts + part_lemmas loaded (Postgres pool; Blobs runtime unchanged).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
