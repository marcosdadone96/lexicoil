#!/usr/bin/env node
/**
 * Muestra pool-fill fresca: ~N partes nuevas (temas hueco) + desglose de fallos con SEM-1 activo.
 *
 *   NODE_OPTIONS=--use-system-ca node scripts/pool-fill-fresh-sample.mjs
 *   NODE_OPTIONS=--use-system-ca node scripts/pool-fill-fresh-sample.mjs --target 20
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { generateLesenPart, createLesenFactorySession } from './generate-lesen-part-gemini.mjs';
import { loadPoolRecords, rankTopicGaps } from './lib/poolGapPlanner.mjs';
import { pushSessionMoldExclude, pushSessionStructuralCorpus } from './lib/poolFillSessionExclude.mjs';

loadEnvFile();
process.env.SEMANTIC_USE_GEMINI = process.env.SEMANTIC_USE_GEMINI || '1';

const FRESH_TOPICS = [
  'Wohnen',
  'Bildung',
  'Arbeit',
  'Umwelt',
  'Medien',
  'Gesundheit',
  'Familie',
  'Konsum',
  'Reisen',
  'Stadtleben',
];
const EXCLUDE_TOPICS = new Set(['Technik', 'Freizeit']);
const TEILE = [1, 2, 3, 4, 5];

function parseTarget(argv) {
  const i = argv.indexOf('--target');
  return i >= 0 ? Math.max(1, Number(argv[i + 1]) || 20) : 20;
}

function extractItemIds(texts) {
  const ids = new Set();
  for (const t of texts) {
    for (const m of String(t).matchAll(/(gen-q-[a-z0-9-]+)/gi)) ids.add(m[1]);
    for (const m of String(t).matchAll(/(ql_[a-z0-9-]+)/gi)) ids.add(m[1]);
  }
  return [...ids];
}

function classifyFailure(gen) {
  const gate = String(gen.gate || '');
  const reason = String(gen.reason || gen.issue || '');
  const issues = (gen.issues || []).map(String);
  const all = [reason, ...issues].join('\n');

  let bucket = 'other';
  if (/SEM-CORRECTNESS/i.test(all)) bucket = 'sem_correctness';
  else if (/SEM-AMBIGUITY/i.test(all)) bucket = 'sem_ambiguity';
  else if (/SEM-LLM-ERROR|fetch failed/i.test(all)) bucket = 'sem_api';
  else if (gate === 'calidad' || /palabras idénticas|copia.*pasaje|word-matching|mcq_distinct|CHK-28|opción correcta copia|opciones no excluyentes|sesgo de respuesta|distractores poco plausibles/i.test(all)) {
    bucket = 'calidad';
  } else if (/CHK-14|mayúscula errónea|capitaliz/i.test(all)) bucket = 'caps';
  else if (gate === 'lexico' || /vocabulario B2|error léxico|CHK-15/i.test(all)) bucket = 'lexico';
  else if (gate === 'dedup' || /DEDUP|deduplic/i.test(all)) bucket = 'dedup';
  else if (gate === 'audit2' && /CHK-/i.test(all)) bucket = 'audit2_other';
  else if (/fetch failed|503|quota|API/i.test(all)) bucket = 'api';

  let scope = 'whole_part';
  const itemIds = extractItemIds([reason, ...issues]);
  const isGlobal =
    /sesgo grave|Ja=\d+%|Teil \d: sesgo de respuesta|parte entera|template|passage/i.test(all) &&
    itemIds.length === 0;
  const semItem = /\[SEM-(CORRECTNESS|AMBIGUITY)\]/i.test(all) && itemIds.length <= 1;

  if (isGlobal) scope = 'whole_part';
  else if (itemIds.length === 1 || semItem) scope = 'single_item';
  else if (itemIds.length > 1) scope = 'multi_item';
  else if (bucket === 'caps' && /«[A-Z][a-z]+»/.test(all)) scope = 'single_item';
  else if (bucket === 'calidad' && itemIds.length === 1) scope = 'single_item';

  return { bucket, scope, gate, reason: reason.slice(0, 200), itemIds, issueCount: issues.length };
}

function pickFreshTopic(records, teil, usedRecently) {
  const ranked = rankTopicGaps(records, 'lesen', teil, 3)
    .filter((r) => !EXCLUDE_TOPICS.has(r.topic))
    .filter((r) => FRESH_TOPICS.includes(r.topic) || r.deficit > 0);
  const pool = ranked.length ? ranked : FRESH_TOPICS.map((t) => ({ topic: t, deficit: 3 }));
  for (const row of pool) {
    if (!usedRecently.has(row.topic)) return row.topic;
  }
  return pool[0]?.topic || FRESH_TOPICS[0];
}

async function main() {
  const target = parseTarget(process.argv.slice(2));
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    console.error('Falta GEMINI_API_KEY');
    process.exit(1);
  }

  const records = loadPoolRecords('de', 'B1');
  console.log('\n══ Pool-fill muestra fresca (SEM-1 activo, sin publish) ══');
  console.log(`Objetivo: ${target} intentos · temas: ${FRESH_TOPICS.slice(0, 6).join(', ')}…\n`);

  const { session, args: sessionArgs } = createLesenFactorySession({
    lang: 'de',
    level: 'B1',
    writeFile: true,
    maxApiCalls: Math.max(200, target * 12),
    fixRetries: 2,
    semantic: true,
    skipSem2: true,
  });
  sessionArgs.fromCoverage = true;
  sessionArgs.wordCount = 10;

  const attempts = [];
  let okCount = 0;
  let failCount = 0;
  let sem1Calls = 0;
  const topicRecent = new Set();

  let i = 0;
  while (attempts.length < target) {
    const teil = TEILE[i % TEILE.length];
    const topic = pickFreshTopic(records, teil, topicRecent);
    topicRecent.add(topic);
    if (topicRecent.size > 4) topicRecent.delete([...topicRecent][0]);

    sessionArgs.topic = topic;
    sessionArgs._resolvedTopic = topic;

    const apiBefore = session.apiCallsUsed;
    const t0 = Date.now();

    console.log(`\n── Intento ${attempts.length + 1}/${target} · T${teil} · ${topic} ──`);

    const gen = await generateLesenPart({
      teil,
      topic,
      session: { session, args: sessionArgs },
      fixRetries: 2,
      writeFile: true,
      semantic: true,
      skipSem2: true,
    });

    const genCalls = session.apiCallsUsed - apiBefore;
    const row = {
      n: attempts.length + 1,
      teil,
      topic,
      ok: gen.ok,
      file: gen.file || null,
      genCalls,
      attempts: gen.attempts,
      ms: Date.now() - t0,
    };

    if (gen.ok) {
      okCount += 1;
      row.outcome = 'ok';
      console.log(`  ✅ OK · ${gen.file} · genLLM=${genCalls}`);
      if (gen.batch) {
        pushSessionMoldExclude(sessionArgs, gen.batch);
        pushSessionStructuralCorpus(sessionArgs, gen.batch);
        const ex = sessionArgs._excludeSubtypes?.length
          ? ` · exclude subtypes: ${sessionArgs._excludeSubtypes.slice(-3).join(', ')}`
          : '';
        if (ex) console.log(`  ↳ sesión${ex}`);
      }
    } else {
      failCount += 1;
      const cls = classifyFailure(gen);
      row.outcome = 'fail';
      row.classification = cls;
      console.log(`  ❌ ${cls.bucket} · scope=${cls.scope} · ${cls.reason.slice(0, 90)}`);
      if (cls.itemIds?.length) console.log(`     items: ${cls.itemIds.join(', ')}`);
    }

    attempts.push(row);
    i += 1;

    if (session.stopped) {
      console.warn('\n⚠ Cuota API alcanzada — parando.');
      break;
    }
  }

  const fails = attempts.filter((a) => !a.ok);
  const byBucket = {};
  const byScope = {};
  for (const f of fails) {
    const b = f.classification?.bucket || 'unknown';
    const s = f.classification?.scope || 'unknown';
    byBucket[b] = (byBucket[b] || 0) + 1;
    byScope[s] = (byScope[s] || 0) + 1;
  }

  const calidad = (byBucket.calidad || 0) + (byBucket.audit2_other || 0);
  const semKey = (byBucket.sem_correctness || 0) + (byBucket.sem_ambiguity || 0);
  const caps = byBucket.caps || 0;
  const lexico = byBucket.lexico || 0;

  const report = {
    generatedAt: new Date().toISOString(),
    target,
    completed: attempts.length,
    ok: okCount,
    failed: failCount,
    okRate: attempts.length ? Number((okCount / attempts.length).toFixed(3)) : 0,
    factory: { semantic: sessionArgs.semantic, skipSem2: sessionArgs.skipSem2 },
    apiCallsTotal: session.apiCallsUsed,
    summary: {
      calidad_word_matching: calidad,
      sem1_clave_ambiguedad: semKey,
      caps_determinista: caps,
      lexico: lexico,
      dedup: byBucket.dedup || 0,
      api_errors: (byBucket.api || 0) + (byBucket.sem_api || 0),
      other: byBucket.other || 0,
    },
    byBucket,
    byScope,
    pctOfFailures: fails.length
      ? Object.fromEntries(
          Object.entries({
            calidad: calidad / fails.length,
            sem_key: semKey / fails.length,
            caps: caps / fails.length,
            lexico: lexico / fails.length,
          }).map(([k, v]) => [k, Number((v * 100).toFixed(1))]),
        )
      : {},
    attempts,
  };

  const outPath = path.join(ROOT, 'batches/generated/pool-fill-fresh-sample-report.json');
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('\n══ Resumen ══');
  console.log(`OK: ${okCount}/${attempts.length} · API calls: ${session.apiCallsUsed}`);
  console.log(`Fallos por bucket:`, byBucket);
  console.log(`Scope fallos:`, byScope);
  console.log(`Informe: ${path.relative(ROOT, outPath)}`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
