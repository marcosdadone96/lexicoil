#!/usr/bin/env node
/**
 * Expand data/lexicon/de-gender.json from pool gaps using DWDS (Goethe + HTML).
 *
 * Modes:
 *   --calibrate 60     smoke batch (process 60 eligible gaps)
 *   --full               all eligible pool null lemmas
 *   --max 50             cap eligible lemmas this run (tandas)
 *   --batch-size 50      lemmas per checkpoint file
 *   --apply              merge additions into de-gender.json
 *
 * Checkpoints: batches/ready/gate-logs/gender-lexicon-batch/checkpoint-NNN.json
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  normLemma,
  buildGoetheIndex,
  lookupDwdsGender,
  sleep,
} from '../lib/dwdsGenderLookup.mjs';
import { shouldSkipLemma } from '../lib/genderLexiconBatchFilters.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const LEX_PATH = path.join(ROOT, 'data/lexicon/de-gender.json');
const CHECKPOINT_DIR = path.join(ROOT, 'batches/ready/gate-logs/gender-lexicon-batch');
const FETCH_DELAY_MS = 350;

const DE_NOUN_SUFFIX =
  /(ung|heit|keit|schaft|tion|tät|ität|ismus|ment|chen|lein|tum|nis|sal|mal|ion)$/i;

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const FULL = argv.includes('--full');
const calIdx = argv.indexOf('--calibrate');
const CALIBRATE = calIdx >= 0 ? Number(argv[calIdx + 1] || 60) : null;
const maxIdx = argv.indexOf('--max');
const MAX = maxIdx >= 0 ? Number(argv[maxIdx + 1] || 50) : FULL ? Infinity : CALIBRATE || 60;
const batchSizeIdx = argv.indexOf('--batch-size');
const BATCH_SIZE = batchSizeIdx >= 0 ? Number(argv[batchSizeIdx + 1] || 50) : 50;

function loadGenderStack() {
  const ctx = { console, window: {}, globalThis: {} };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.normWordType = (p) => {
    const x = String(p || '').toLowerCase();
    if (x.startsWith('noun') || x === 'n') return 'noun';
    return x || 'other';
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/articleLexicon.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/manualVocab.js'), 'utf8'), ctx);
  const lex = JSON.parse(fs.readFileSync(LEX_PATH, 'utf8'));
  ctx.ArticleLexicon.loadSync(lex);
  return { ManualVocab: ctx.ManualVocab, ArticleLexicon: ctx.ArticleLexicon, lex };
}

function isPoolNounCandidate(tag) {
  const raw = String(tag || '').trim();
  if (!raw || raw.length < 2) return false;
  if (!/^[A-ZÄÖÜ]/.test(raw)) return false;
  const low = normLemma(raw);
  if (/^(Der|Die|Das)\s/i.test(raw)) return false;
  if (/(lichen|lichem|liches|licher|liche|igen|igem|iges|iger|ige|enen|endem|enden|endes|ender|ende)$/i.test(low)) {
    return false;
  }
  if (DE_NOUN_SUFFIX.test(low)) return true;
  if (/^[A-ZÄÖÜ][a-zäöüß-]+$/.test(raw) && raw.length >= 3) {
    if (/(?:ieren|eln)$/i.test(low) && !DE_NOUN_SUFFIX.test(low) && low.length <= 9) return false;
    return true;
  }
  return false;
}

function collectPoolGaps(MV) {
  const freq = new Map();
  const roots = [
    path.join(ROOT, 'batches/ready/pool-verified/A2'),
    path.join(ROOT, 'batches/ready/pool-verified/B1'),
    path.join(ROOT, 'batches/ready/pool-verified/B2'),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const file of fs.readdirSync(root).filter((f) => f.endsWith('.json'))) {
      const batch = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
      for (const q of batch.questions || []) {
        for (const tag of q.vocabularyTags || []) {
          if (!isPoolNounCandidate(tag)) continue;
          const key = normLemma(tag);
          const row = freq.get(key) || { lemma: tag.trim(), count: 0 };
          row.count += 1;
          freq.set(key, row);
        }
      }
    }
  }

  const gaps = [];
  for (const row of freq.values()) {
    const fc = { word: row.lemma, type: 'noun', pos: 'noun', sourceLang: 'de' };
    MV.enrichFlashcard(fc, 'de');
    if (!fc.article && fc.type === 'noun') {
      gaps.push({ ...row, norm: normLemma(row.lemma) });
    }
  }
  return gaps.sort((a, b) => b.count - a.count || a.lemma.localeCompare(b.lemma));
}

function buildTargets(allGaps, lex, goetheIndex, ArticleLexicon, limit) {
  const targets = [];
  const skipped = [];
  for (const row of allGaps) {
    if (targets.length >= limit) break;
    if (lex[row.norm]) continue;
    const pluralCheck = (low) => ArticleLexicon?.pluralGenderDe?.(low) || null;
    const { skip, reason } = shouldSkipLemma(row.lemma, goetheIndex, pluralCheck);
    if (skip) {
      skipped.push({ lemma: row.lemma, norm: row.norm, poolCount: row.count, reason });
      continue;
    }
    targets.push(row);
  }
  return { targets, skipped };
}

async function loadGoetheIndex() {
  const index = new Map();
  const cacheDir = path.join(ROOT, 'scripts/cache');
  for (const level of ['A1', 'A2', 'B1']) {
    const p = path.join(cacheDir, `dwds-goethe-${level}.json`);
    if (!fs.existsSync(p)) continue;
    const rows = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const [k, v] of buildGoetheIndex(rows, `dwds-goethe-${level}`)) index.set(k, v);
  }
  return index;
}

async function resolveGender(lemma, goetheIndex) {
  const key = normLemma(lemma);
  const goethe = goetheIndex.get(key);
  if (goethe) {
    return { gender: goethe.gender, source: goethe.source, url: goethe.url, method: 'goethe' };
  }
  try {
    const hit = await lookupDwdsGender(lemma, fetch);
    if (hit.status === 'ok' && hit.gender) {
      return { gender: hit.gender, source: 'dwds-html', url: hit.url, method: 'html' };
    }
    return { gender: null, source: null, status: hit.status, reasons: hit.reasons, method: 'html' };
  } catch (e) {
    return { gender: null, source: null, status: 'error', reasons: [e.message], method: 'html' };
  }
}

async function main() {
  const { ManualVocab: MV, ArticleLexicon, lex } = loadGenderStack();
  const goetheIndex = await loadGoetheIndex();
  const allGaps = collectPoolGaps(MV);
  const limit = FULL ? (Number.isFinite(MAX) ? MAX : allGaps.length) : CALIBRATE || 60;
  const { targets, skipped } = buildTargets(allGaps, lex, goetheIndex, ArticleLexicon, limit);

  const modeLabel = FULL ? (Number.isFinite(MAX) ? `full-max-${MAX}` : 'full') : `calibrate-${limit}`;

  console.log(`\n── Gender lexicon batch expand ──`);
  console.log(`Mode: ${modeLabel} | apply: ${APPLY} | batch-size: ${BATCH_SIZE}`);
  console.log(`Pool null-article: ${allGaps.length} | eligible: ${targets.length} | skipped: ${skipped.length}`);

  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  const additions = {};
  const failures = [];
  let goetheHits = 0;
  let htmlHits = 0;

  for (let i = 0; i < targets.length; i += 1) {
    const row = targets[i];
    const hit = await resolveGender(row.lemma, goetheIndex);
    if (hit.gender) {
      additions[row.norm] = {
        lemma: row.lemma,
        gender: hit.gender,
        source: hit.source,
        method: hit.method,
        poolCount: row.count,
        url: hit.url || undefined,
      };
      if (hit.method === 'goethe') goetheHits += 1;
      else htmlHits += 1;
      console.log(`  ✓ ${row.lemma} → ${hit.gender} (${hit.method})`);
    } else {
      failures.push({
        lemma: row.lemma,
        norm: row.norm,
        poolCount: row.count,
        status: hit.status,
        reasons: hit.reasons,
      });
      console.log(`  – ${row.lemma}: ${hit.status || 'miss'}`);
    }

    if (hit.method === 'html') await sleep(FETCH_DELAY_MS);

    if ((i + 1) % BATCH_SIZE === 0 || i === targets.length - 1) {
      const batchNum = Math.ceil((i + 1) / BATCH_SIZE);
      const ckpt = {
        batchNum,
        mode: modeLabel,
        processed: i + 1,
        total: targets.length,
        addedSoFar: Object.keys(additions).length,
        failedSoFar: failures.length,
        additions: { ...additions },
        failures: [...failures],
        at: new Date().toISOString(),
      };
      fs.writeFileSync(
        path.join(CHECKPOINT_DIR, `${modeLabel}-checkpoint-${String(batchNum).padStart(3, '0')}.json`),
        JSON.stringify(ckpt, null, 2),
      );
    }
  }

  const addedCount = Object.keys(additions).length;
  const processedCount = targets.length;
  const cleanPct = processedCount ? ((addedCount / processedCount) * 100).toFixed(1) : '0';

  const summary = {
    runAt: new Date().toISOString(),
    mode: modeLabel,
    limit,
    poolNullTotal: allGaps.length,
    eligible: processedCount,
    skipped: skipped.length,
    skippedSamples: skipped.slice(0, 30),
    processed: processedCount,
    added: addedCount,
    failed: failures.length,
    goetheHits,
    htmlHits,
    cleanPct: Number(cleanPct),
    apply: APPLY,
    additions,
    failures,
  };

  const summaryPath = path.join(CHECKPOINT_DIR, `${modeLabel}-summary.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  if (APPLY && addedCount) {
    for (const [k, row] of Object.entries(additions)) lex[k] = row.gender;
    const sorted = Object.fromEntries(Object.keys(lex).sort().map((k) => [k, lex[k]]));
    fs.writeFileSync(LEX_PATH, JSON.stringify(sorted));
    console.log(`\nApplied ${addedCount} entries → ${LEX_PATH}`);
  }

  console.log(`\n── Summary ──`);
  console.log(`Added: ${addedCount}/${processedCount} (${cleanPct}%)`);
  console.log(`  Goethe: ${goetheHits} | HTML: ${htmlHits} | Failed: ${failures.length} | Skipped: ${skipped.length}`);
  console.log(`Report: ${path.relative(ROOT, summaryPath)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
