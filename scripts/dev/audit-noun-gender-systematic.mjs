#!/usr/bin/env node
/**
 * Systematic German noun gender audit.
 *
 * Ground truth (external to runtime heuristics):
 *   - content/vocabulary/de/ (all level JSON files) — explicit der/die/das in word field
 *   - DWDS-verified sets (benchmark sample + pool expansion 2026-07-13)
 *
 * System under test (deterministic, no Gemini):
 *   ArticleLexicon + ManualVocab.enrichFlashcard (same as save path minus AI)
 *
 * Usage:
 *   node scripts/dev/audit-noun-gender-systematic.mjs
 *   node scripts/dev/audit-noun-gender-systematic.mjs --include-users
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from '../lib/loadEnv.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile();

const require = createRequire(import.meta.url);
const { syncKey, normalizeEmail } = require(path.join(ROOT, 'netlify/functions/lib/authLib.js'));

/** DWDS-checked benchmark (scripts/benchmark-gemini-gender-accuracy.mjs) — non-dual only */
const DWDS_BENCHMARK = {
  haus: 'n', schule: 'f', mann: 'm', kind: 'n', freund: 'm', problem: 'n', information: 'f',
  mädchen: 'n', fenster: 'n', haustür: 'f', arbeitsplatz: 'm', hauptstadt: 'f', kindergarten: 'm',
  fußballplatz: 'm', wochenende: 'n', pizza: 'f', 'e-mail': 'f', laptop: 'm', team: 'n',
  meeting: 'n', restaurant: 'n', smartphone: 'n',
};

/** DWDS-checked pool additions (scripts/expand-gender-lexicon-from-pool.mjs) */
const DWDS_POOL = {
  autorin: 'f', beispiel: 'n', alltag: 'm', anmeldung: 'f', bedeutung: 'f', angebot: 'n',
  anzeige: 'f', nutzung: 'f', tätigkeit: 'f', möglichkeit: 'f', stress: 'm', umgebung: 'f',
  heizung: 'f', wunsch: 'm', beratung: 'f', bildschirm: 'm', abholung: 'f', hausverwaltung: 'f',
  entsorgung: 'f', nachbarschaft: 'f', verwaltung: 'f', aktivität: 'f', beginn: 'm', erholung: 'f',
  luft: 'f', nachhilfe: 'f', aspekt: 'm', einstellung: 'f', kauf: 'm', wichtigkeit: 'f',
};

const ARTICLE_TO_GENDER = { der: 'm', die: 'f', das: 'n' };
const GENDER_TO_ARTICLE = { m: 'der', f: 'die', n: 'das' };

const DE_NOUN_SUFFIX =
  /(ung|heit|keit|schaft|tion|tät|ität|ismus|ment|chen|lein|tum|nis|sal|mal|ion)$/i;

function norm(s) {
  return String(s || '').trim().normalize('NFC').toLowerCase();
}

function loadGenderStack() {
  const ctx = { console, window: {}, globalThis: {} };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.normWordType = (pos) => {
    const p = String(pos || '').toLowerCase().replace(/[^a-z]/g, '');
    if (p.startsWith('noun') || p === 'n') return 'noun';
    if (p.startsWith('verb') || p === 'v') return 'verb';
    return p || 'other';
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/articleLexicon.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/manualVocab.js'), 'utf8'), ctx);
  const lex = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lexicon/de-gender.json'), 'utf8'));
  ctx.ArticleLexicon.loadSync(lex);
  return { ManualVocab: ctx.ManualVocab, ArticleLexicon: ctx.ArticleLexicon, lex };
}

function systemAssign(word, MV) {
  const fc = { word, type: 'noun', pos: 'noun', sourceLang: 'de' };
  MV.enrichFlashcard(fc, 'de');
  return {
    article: fc.article || null,
    gender: fc.gender || null,
    plural: !!fc.plural,
    pos: fc.type || fc.pos || null,
    source: fc.genderSource || (fc.article ? 'lexicon/heuristic' : 'none'),
  };
}

function buildGroundTruth() {
  const truth = new Map();

  function add(lemma, gender, source) {
    const key = norm(lemma);
    if (!key || !gender) return;
    const g = String(gender).toLowerCase();
    if (!['m', 'f', 'n'].includes(g)) return;
    if (!truth.has(key)) truth.set(key, { gender: g, article: GENDER_TO_ARTICLE[g], sources: new Set([source]) });
    else truth.get(key).sources.add(source);
  }

  for (const [k, v] of Object.entries(DWDS_BENCHMARK)) add(k, v, 'dwds-benchmark');
  for (const [k, v] of Object.entries(DWDS_POOL)) add(k, v, 'dwds-pool-expansion');

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
          add(m[2], ARTICLE_TO_GENDER[m[1].toLowerCase()], `content-vocab/${langDir}/${file}`);
        }
      }
    }
  }

  return truth;
}

function isPoolNounCandidate(tag) {
  const raw = String(tag || '').trim();
  if (!raw || raw.length < 2) return false;
  if (!/^[A-ZÄÖÜ]/.test(raw)) return false;
  const low = norm(raw);
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
  let files = 0;
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const file of fs.readdirSync(root).filter((f) => f.endsWith('.json'))) {
      files += 1;
      const batch = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
      for (const q of batch.questions || []) {
        for (const tag of q.vocabularyTags || []) {
          if (!isPoolNounCandidate(tag)) continue;
          const key = norm(tag);
          const row = freq.get(key) || { lemma: tag.trim(), count: 0, levels: new Set() };
          row.count += 1;
          row.levels.add(batch.level || path.basename(root));
          freq.set(key, row);
        }
      }
    }
  }
  return { freq, files };
}

async function collectUserNouns() {
  const siteId = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  if (!siteId || !token) return { nouns: [], emails: [] };
  const { getStore } = await import('@netlify/blobs');
  const { STORE_NAME } = require(path.join(ROOT, 'netlify/functions/lib/blobStore.js'));
  const store = getStore({ name: STORE_NAME, siteID: siteId, token });
  const emails = [];
  let cursor;
  for (;;) {
    const page = await store.list({ prefix: 'sync:', cursor, directories: false });
    for (const b of page?.blobs || []) {
      const key = String(b?.key || '');
      if (key.startsWith('sync:')) emails.push(normalizeEmail(key.slice(5)));
    }
    if (!page?.hasMore) break;
    cursor = page.cursor;
  }
  const nouns = [];
  for (const email of emails.sort()) {
    const raw = await store.get(syncKey(email), { type: 'text' });
    if (!raw) continue;
    const sync = JSON.parse(raw);
    for (const fc of sync.flashcards || []) {
      const pos = norm(fc.type || fc.pos || '');
      if (!pos.startsWith('noun')) continue;
      nouns.push({
        email,
        word: fc.word,
        lemma: norm(fc.word),
        article: fc.article || null,
        gender: fc.gender || null,
        genderSource: fc.genderSource || null,
        plural: !!fc.plural,
      });
    }
  }
  return { nouns, emails };
}

function auditSample(label, entries, truth, MV, lex) {
  const rows = [];
  for (const entry of entries) {
    const lemma = norm(entry.lemma || entry.word);
    const gt = truth.get(lemma);
    if (!gt) continue;
    const sys = entry.stored
      ? { article: entry.article, gender: entry.gender, source: entry.genderSource || 'stored' }
      : systemAssign(entry.word || entry.lemma, MV);
    const ok = sys.gender === gt.gender;
    rows.push({
      lemma: entry.lemma || entry.word,
      normLemma: lemma,
      assignedArticle: sys.article,
      assignedGender: sys.gender,
      correctArticle: gt.article,
      correctGender: gt.gender,
      ok,
      truthSource: [...gt.sources].join(','),
      systemSource: sys.source,
      context: entry.context || label,
    });
  }
  const verified = rows.length;
  const ok = rows.filter((r) => r.ok).length;
  const errors = rows.filter((r) => !r.ok);
  return { label, verified, ok, errors, accuracyPct: verified ? Math.round((ok / verified) * 1000) / 10 : null };
}

function auditLexiconVsTruth(truth, lex) {
  const errors = [];
  for (const [lemma, gt] of truth.entries()) {
    const lx = lex[lemma];
    if (!lx) continue;
    if (lx !== gt.gender) {
      errors.push({
        lemma,
        lexiconGender: lx,
        lexiconArticle: GENDER_TO_ARTICLE[lx],
        correctGender: gt.gender,
        correctArticle: gt.article,
        truthSource: [...gt.sources].join(','),
      });
    }
  }
  return errors;
}

function groupErrors(errors) {
  const buckets = {};
  for (const e of errors) {
    const key = `${e.assignedGender || 'null'}→${e.correctGender} (${e.systemSource || 'lexicon'})`;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(e.lemma || e.normLemma);
  }
  return Object.fromEntries(
    Object.entries(buckets)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([k, v]) => [k, { count: v.length, samples: v.slice(0, 8) }]),
  );
}

async function main() {
  const includeUsers = process.argv.includes('--include-users');
  const { ManualVocab: MV, lex } = loadGenderStack();
  const truth = buildGroundTruth();

  const { freq: poolFreq, files: poolFiles } = collectPoolNouns();
  const poolEntries = [...poolFreq.values()].map((r) => ({
    lemma: r.lemma,
    word: r.lemma,
    context: `pool (${[...r.levels].join('/')}, ${r.count}×)`,
  }));

  const poolAudit = auditSample('pool-vocabularyTags', poolEntries, truth, MV, lex);
  const benchmarkEntries = Object.keys(DWDS_BENCHMARK).map((w) => ({ lemma: w, word: w, context: 'dwds-benchmark' }));
  const benchmarkAudit = auditSample('dwds-benchmark', benchmarkEntries, truth, MV, lex);

  let userAudit = null;
  let userNouns = [];
  if (includeUsers) {
    const u = await collectUserNouns();
    userNouns = u.nouns;
    userAudit = auditSample(
      'user-blobs',
      u.nouns.map((n) => ({ ...n, stored: true, context: `${n.email}` })),
      truth,
      MV,
      lex,
    );
  }

  const lexiconErrors = auditLexiconVsTruth(truth, lex);

  // Pool coverage: nouns with/without ground truth
  const poolWithTruth = poolEntries.filter((e) => truth.has(norm(e.lemma))).length;
  const poolUnique = poolEntries.length;

  let poolWithArticle = 0;
  let poolNullArticle = 0;
  let poolMisclassified = 0;
  const schaftBlocked = [];
  for (const e of poolEntries) {
    const sys = systemAssign(e.word || e.lemma, MV);
    if (sys.pos !== 'noun') poolMisclassified += 1;
    if (sys.article) poolWithArticle += 1;
    else poolNullArticle += 1;
    if (/schaft$/i.test(norm(e.lemma)) && !sys.article) schaftBlocked.push(e.lemma);
  }
  const assignmentCoveragePct = poolUnique
    ? Math.round((poolWithArticle / poolUnique) * 1000) / 10
    : 0;

  // Full union audit (deduped lemmas with ground truth)
  const unionMap = new Map();
  for (const e of poolEntries) unionMap.set(norm(e.lemma), e);
  for (const e of benchmarkEntries) unionMap.set(norm(e.lemma), e);
  const unionAudit = auditSample('union-pool+benchmark', [...unionMap.values()], truth, MV, lex);

  const allErrors = [
    ...unionAudit.errors.map((e) => ({ ...e, bucket: 'runtime-system' })),
    ...lexiconErrors.map((e) => ({ ...e, bucket: 'lexicon-file', assignedGender: e.lexiconGender, assignedArticle: e.lexiconArticle })),
  ];

  const report = {
    runAt: new Date().toISOString(),
    groundTruth: {
      totalEntries: truth.size,
      sources: {
        contentVocabulary: [...truth.values()].filter((v) => [...v.sources].some((s) => s.startsWith('content-vocab'))).length,
        dwdsBenchmark: Object.keys(DWDS_BENCHMARK).length,
        dwdsPoolExpansion: Object.keys(DWDS_POOL).length,
      },
    },
    poolScan: {
      files: poolFiles,
      uniqueNounCandidates: poolUnique,
      withGroundTruth: poolWithTruth,
      coveragePct: poolUnique ? Math.round((poolWithTruth / poolUnique) * 1000) / 10 : 0,
      deterministicAssignment: {
        withArticle: poolWithArticle,
        nullArticle: poolNullArticle,
        misclassifiedNonNoun: poolMisclassified,
        assignmentCoveragePct,
      },
      schaftHaftBugScan: {
        poolLemmaCount: poolEntries.filter((e) => /schaft$/i.test(norm(e.lemma))).length,
        withoutArticle: schaftBlocked.length,
        samples: schaftBlocked.slice(0, 20),
      },
    },
    systemAccuracy: {
      poolVocabularyTags: poolAudit,
      dwdsBenchmark: benchmarkAudit,
      unionVerified: unionAudit,
      userBlobs: userAudit,
    },
    lexiconFileVsTruth: {
      compared: Object.keys(lex).filter((k) => truth.has(k)).length,
      errors: lexiconErrors.length,
      accuracyPct:
        Object.keys(lex).filter((k) => truth.has(k)).length
          ? Math.round(
              ((Object.keys(lex).filter((k) => truth.has(k)).length - lexiconErrors.length) /
                Object.keys(lex).filter((k) => truth.has(k)).length) *
                1000,
            ) / 10
          : null,
      errorList: lexiconErrors,
    },
    runtimeErrors: unionAudit.errors,
    errorPatterns: groupErrors(unionAudit.errors),
    lexiconPollutionSamples: Object.entries(lex)
      .filter(([k]) => ['alle', 'ohne', 'aber', 'bei', 'von', 'zum', 'zur', 'über', 'unter', 'dich', 'sich', 'nie', 'wie'].includes(k))
      .map(([k, v]) => ({ lemma: k, lexiconGender: v, note: 'non-noun/function word in de-gender.json' })),
    userNounCount: userNouns.length,
  };

  const outDir = path.join(ROOT, 'batches/ready/gate-logs');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'GENDER-AUDIT-SYSTEMATIC-2026-08-09.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log('\n── Systematic gender audit ──\n');
  console.log(`Ground truth entries: ${truth.size}`);
  console.log(`Pool files scanned: ${poolFiles} | unique noun tags: ${poolUnique} | with GT: ${poolWithTruth} (${report.poolScan.coveragePct}%)`);
  console.log(`Deterministic assignment: ${poolWithArticle}/${poolUnique} (${assignmentCoveragePct}%) with article | null: ${poolNullArticle} | misclassified: ${poolMisclassified}`);
  console.log(`-schaft lemmas: ${report.poolScan.schaftHaftBugScan.poolLemmaCount} | without article (haft-bug proxy): ${schaftBlocked.length}`);
  console.log(`\nRuntime system (ArticleLexicon + inferNounGender, no AI):`);
  console.log(`  Pool tags verified: ${poolAudit.verified} → ${poolAudit.accuracyPct}% accurate`);
  console.log(`  DWDS benchmark:    ${benchmarkAudit.verified} → ${benchmarkAudit.accuracyPct}% accurate`);
  console.log(`  Union (deduped):   ${unionAudit.verified} → ${unionAudit.accuracyPct}% accurate`);
  if (userAudit) console.log(`  User blob nouns:   ${userAudit.verified}/${userNouns.length} with GT → ${userAudit.accuracyPct}%`);
  console.log(`\nLexicon file vs truth: ${report.lexiconFileVsTruth.compared} compared → ${report.lexiconFileVsTruth.accuracyPct}% accurate (${lexiconErrors.length} errors)`);

  if (unionAudit.errors.length) {
    console.log('\n── Runtime errors (assigned ≠ DWDS/content-vocab) ──');
    for (const e of unionAudit.errors.slice(0, 40)) {
      console.log(`  ${e.lemma}: ${e.assignedArticle || '—'} (${e.assignedGender}) → ${e.correctArticle} (${e.correctGender}) [${e.truthSource}]`);
    }
    if (unionAudit.errors.length > 40) console.log(`  … +${unionAudit.errors.length - 40} more`);
  }
  if (lexiconErrors.length) {
    console.log('\n── Lexicon file errors vs ground truth ──');
    for (const e of lexiconErrors.slice(0, 20)) {
      console.log(`  ${e.lemma}: lexicon=${e.lexiconArticle} → correct=${e.correctArticle}`);
    }
  }
  if (Object.keys(report.errorPatterns).length) {
    console.log('\n── Error patterns ──');
    for (const [pat, info] of Object.entries(report.errorPatterns)) {
      console.log(`  ${pat}: ${info.count} (e.g. ${info.samples.join(', ')})`);
    }
  }
  console.log(`\nReport: ${path.relative(ROOT, outPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
