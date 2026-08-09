#!/usr/bin/env node
/**
 * Expand gender ground truth to 300–500 DWDS-verified lemmas.
 *
 * Sources (priority):
 *   1. Existing DWDS benchmark + pool expansion (2026-07-13)
 *   2. content/vocabulary/de/ (der|die|das prefixes)
 *   3. DWDS Goethe A1/A2 cache + B1 API (Substantiv, single genus)
 *   4. DWDS /wb/ HTML fetch for high-frequency pool gaps (batches of 50)
 *
 * Usage:
 *   node scripts/dev/expand-gender-ground-truth.mjs
 *   node scripts/dev/expand-gender-ground-truth.mjs --target 400
 *   node scripts/dev/expand-gender-ground-truth.mjs --dry-run
 *   node scripts/dev/expand-gender-ground-truth.mjs --batch 2   # fetch batch index only
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import {
  normLemma,
  genderFromGoetheRow,
  buildGoetheIndex,
  lookupDwdsGender,
  sleep,
} from '../lib/dwdsGenderLookup.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const OUT_PATH = path.join(ROOT, 'data/gender-ground-truth/dwds-verified.json');
const LOG_DIR = path.join(ROOT, 'batches/ready/gate-logs');
const CACHE_DIR = path.join(ROOT, 'scripts/cache');

const TARGET = Number(process.argv.find((a) => a.startsWith('--target='))?.split('=')[1]
  || (process.argv.includes('--target') ? process.argv[process.argv.indexOf('--target') + 1] : 400));
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_ONLY = process.argv.includes('--batch')
  ? Number(process.argv[process.argv.indexOf('--batch') + 1])
  : null;
const BATCH_SIZE = 50;
const FETCH_DELAY_MS = 350;

/** Prior verified sets — keep in sync with audit-noun-gender-systematic.mjs */
const DWDS_BENCHMARK = {
  haus: 'n', schule: 'f', mann: 'm', kind: 'n', freund: 'm', problem: 'n', information: 'f',
  mädchen: 'n', fenster: 'n', haustür: 'f', arbeitsplatz: 'm', hauptstadt: 'f', kindergarten: 'm',
  fußballplatz: 'm', wochenende: 'n', pizza: 'f', 'e-mail': 'f', laptop: 'm', team: 'n',
  meeting: 'n', restaurant: 'n', smartphone: 'n',
};

const DWDS_POOL = {
  autorin: 'f', beispiel: 'n', alltag: 'm', anmeldung: 'f', bedeutung: 'f', angebot: 'n',
  anzeige: 'f', nutzung: 'f', tätigkeit: 'f', möglichkeit: 'f', stress: 'm', umgebung: 'f',
  heizung: 'f', wunsch: 'm', beratung: 'f', bildschirm: 'm', abholung: 'f', hausverwaltung: 'f',
  entsorgung: 'f', nachbarschaft: 'f', verwaltung: 'f', aktivität: 'f', beginn: 'm', erholung: 'f',
  luft: 'f', nachhilfe: 'f', aspekt: 'm', einstellung: 'f', kauf: 'm', wichtigkeit: 'f',
};

const DE_NOUN_SUFFIX =
  /(ung|heit|keit|schaft|tion|tät|ität|ismus|ment|chen|lein|tum|nis|sal|mal|ion)$/i;

const ARTICLE_TO_GENDER = { der: 'm', die: 'f', das: 'n' };

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'LexiLoop-gender-gt/1.0' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
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

function collectPoolNouns() {
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
  return [...freq.values()].sort((a, b) => b.count - a.count || a.lemma.localeCompare(b.lemma));
}

function collectContentVocab() {
  const out = new Map();
  const cvRoot = path.join(ROOT, 'content/vocabulary/de');
  for (const langDir of fs.readdirSync(cvRoot)) {
    const dir = path.join(cvRoot, langDir);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      for (const sec of data.sections || []) {
        for (const item of sec.items || []) {
          const raw = String(item.word || '').trim();
          const m = raw.match(/^(der|die|das)\s+(.+)$/i);
          if (!m) continue;
          const key = normLemma(m[2]);
          const gender = ARTICLE_TO_GENDER[m[1].toLowerCase()];
          if (!key || !gender) continue;
          if (!out.has(key)) out.set(key, { lemma: m[2].trim(), gender, source: `content-vocab/${langDir}/${file}` });
        }
      }
    }
  }
  return out;
}

async function loadGoetheIndex() {
  const index = new Map();
  for (const level of ['A1', 'A2']) {
    const cachePath = path.join(CACHE_DIR, `dwds-goethe-${level}.json`);
    const rows = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    for (const [k, v] of buildGoetheIndex(rows, `dwds-goethe-${level}`)) index.set(k, v);
  }

  const b1Cache = path.join(CACHE_DIR, 'dwds-goethe-B1.json');
  let b1Rows;
  if (fs.existsSync(b1Cache) && !process.argv.includes('--refresh-b1')) {
    b1Rows = JSON.parse(fs.readFileSync(b1Cache, 'utf8'));
    console.log(`Loaded B1 Goethe cache (${b1Rows.length} rows)`);
  } else {
    console.log('Fetching DWDS Goethe B1 API…');
    b1Rows = await fetchJson('https://www.dwds.de/api/lemma/goethe/B1.json');
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(b1Cache, JSON.stringify(b1Rows));
    console.log(`Cached B1 Goethe (${b1Rows.length} rows)`);
  }
  for (const [k, v] of buildGoetheIndex(b1Rows, 'dwds-goethe-B1')) index.set(k, v);

  return index;
}

function addEntry(truth, lemma, gender, source, meta = {}) {
  const key = normLemma(lemma);
  if (!key || !gender) return false;
  const g = String(gender).toLowerCase();
  if (!['m', 'f', 'n'].includes(g)) return false;
  if (truth.has(key)) {
    const row = truth.get(key);
    if (row.gender !== g) {
      row.conflicts = row.conflicts || [];
      row.conflicts.push({ gender: g, source, ...meta });
      return false;
    }
    row.sources.add(source);
    return false;
  }
  truth.set(key, {
    lemma: String(lemma).trim(),
    gender: g,
    sources: new Set([source]),
    ...meta,
  });
  return true;
}

function serializeTruth(truth) {
  const entries = {};
  for (const [k, row] of [...truth.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    entries[k] = {
      lemma: row.lemma,
      gender: row.gender,
      sources: [...row.sources].sort(),
      url: row.url || undefined,
      poolCount: row.poolCount || undefined,
      conflicts: row.conflicts || undefined,
    };
  }
  return entries;
}

async function main() {
  const truth = new Map();
  let added = 0;

  for (const [k, v] of Object.entries(DWDS_BENCHMARK)) {
    if (addEntry(truth, k, v, 'dwds-benchmark')) added += 1;
  }
  for (const [k, v] of Object.entries(DWDS_POOL)) {
    if (addEntry(truth, k, v, 'dwds-pool-expansion')) added += 1;
  }
  for (const [k, row] of collectContentVocab()) {
    if (addEntry(truth, k, row.gender, row.source)) added += 1;
  }

  const goetheIndex = await loadGoetheIndex();
  const pool = collectPoolNouns();
  console.log(`Seed GT: ${truth.size} | Goethe index: ${goetheIndex.size} | Pool nouns: ${pool.length}`);

  for (const row of pool) {
    if (truth.size >= TARGET) break;
    const hit = goetheIndex.get(normLemma(row.lemma));
    if (!hit) continue;
    if (addEntry(truth, row.lemma, hit.gender, hit.source, { url: hit.url, poolCount: row.count })) {
      added += 1;
    }
  }
  console.log(`After Goethe pool match: ${truth.size} entries`);

  const pending = pool
    .filter((row) => !truth.has(normLemma(row.lemma)))
    .map((row) => row.lemma);

  const batches = [];
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    batches.push(pending.slice(i, i + BATCH_SIZE));
  }

  if (DRY_RUN) {
    console.log(`Dry run — would fetch ${pending.length} lemmas in ${batches.length} batches to reach ~${TARGET}`);
    console.log(`Current size ${truth.size}; need ${Math.max(0, TARGET - truth.size)} more`);
    console.log('First batch sample:', batches[0]?.slice(0, 10));
    return;
  }

  const batchStart = BATCH_ONLY != null ? BATCH_ONLY : 0;
  const batchEnd = BATCH_ONLY != null ? BATCH_ONLY + 1 : batches.length;

  for (let bi = batchStart; bi < batchEnd && truth.size < TARGET; bi += 1) {
    const batch = batches[bi];
    if (!batch?.length) continue;
    console.log(`\n── Batch ${bi + 1}/${batches.length} (${batch.length} lemmas) ──`);
    for (const lemma of batch) {
      if (truth.size >= TARGET) break;
      if (truth.has(normLemma(lemma))) continue;
      try {
        const hit = await lookupDwdsGender(lemma, fetch);
        if (hit.status === 'ok' && hit.gender) {
          if (addEntry(truth, lemma, hit.gender, 'dwds-html', { url: hit.url })) {
            added += 1;
            console.log(`  ✓ ${lemma} → ${hit.gender}`);
          }
        } else {
          console.log(`  – ${lemma}: ${hit.status} (${(hit.reasons || []).join('; ')})`);
        }
      } catch (e) {
        console.log(`  ! ${lemma}: ${e.message}`);
      }
      await sleep(FETCH_DELAY_MS);
    }
  }

  const entries = serializeTruth(truth);
  const sourceCounts = {};
  for (const row of Object.values(entries)) {
    for (const s of row.sources) sourceCounts[s] = (sourceCounts[s] || 0) + 1;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    targetSize: TARGET,
    totalEntries: Object.keys(entries).length,
    sourceCounts,
    poolNounsScanned: pool.length,
    dwdsFetchBatches: batches.length,
    entries,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));

  const logPath = path.join(LOG_DIR, 'GENDER-GT-EXPANSION-2026-08-09.json');
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(
    logPath,
    JSON.stringify(
      {
        ...report,
        entries: undefined,
        sampleEntries: Object.fromEntries(Object.entries(entries).slice(0, 20)),
      },
      null,
      2,
    ),
  );

  console.log(`\n── Ground truth expansion complete ──`);
  console.log(`Total entries: ${report.totalEntries} (target ${TARGET})`);
  console.log(`Sources:`, sourceCounts);
  console.log(`Wrote ${path.relative(ROOT, OUT_PATH)}`);
  console.log(`Log: ${path.relative(ROOT, logPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
