#!/usr/bin/env node
/**
 * pool-fill-teil.mjs — Un comando por módulo+Teil: planifica huecos, rota tema/vocab,
 * genera, valida y (opcional) publica al banco/pool.
 *
 * Uso:
 *   node scripts/pool-fill-teil.mjs --module lesen --teil 3 --target 5 --publish --sync-pool
 *   node scripts/pool-fill-teil.mjs --module horen --teil 2 --target 10 --rotate-every 3
 *   node scripts/pool-fill-teil.mjs --module lesen --teil 1 --status
 *   node scripts/pool-fill-teil.mjs --module lesen --teil 3 --dry-run
 *
 * Rotación: cada --rotate-every partes OK publicadas elige nuevo tema (más escaso) y
 * nuevo lote de lemas flojos (vocab-coverage-report).
 */
import { loadEnvFile } from './lib/loadEnv.mjs';
import {
  checkpointKey,
  clearPoolFillCheckpoint,
  loadPoolFillCheckpoint,
  savePoolFillCheckpoint,
} from './lib/poolGapPlanner.mjs';
import {
  planRotation,
  printGapStatus,
  rebuildPoolManifest,
  refreshVocabCoverage,
  runPoolFillCycle,
} from './lib/poolFillTeilLib.mjs';
import { DailyQuotaError } from './lib/geminiClient.mjs';

loadEnvFile();

const MODULE_TEILS = {
  lesen: [1, 2, 3, 4, 5],
  horen: [1, 2, 3, 4],
  schreiben: [1, 2, 3],
  sprechen: [1, 2, 3],
};

function parseArgs(argv) {
  const out = {
    module: null,
    teil: null,
    lang: 'de',
    level: 'B1',
    target: 5,
    targetPerCell: 3,
    rotateEvery: 2,
    wordCount: 10,
    tag: 'gemini',
    publish: false,
    syncPool: false,
    dryRun: false,
    status: false,
    reset: false,
    resume: true,
    maxAttempts: null,
    fixRetries: 2,
    maxApiCalls: 80,
    pauseMs: 5000,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--module') out.module = String(argv[++i] || '').toLowerCase();
    else if (a === '--teil') out.teil = Number(argv[++i]);
    else if (a === '--lang') out.lang = String(argv[++i]).toLowerCase();
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--target') out.target = Math.max(1, Number(argv[++i]) || 5);
    else if (a === '--target-per-cell') out.targetPerCell = Math.max(1, Number(argv[++i]) || 3);
    else if (a === '--rotate-every') out.rotateEvery = Math.max(1, Number(argv[++i]) || 2);
    else if (a === '--word-count') out.wordCount = Math.max(4, Number(argv[++i]) || 10);
    else if (a === '--tag') out.tag = String(argv[++i] || 'gemini');
    else if (a === '--publish') out.publish = true;
    else if (a === '--sync-pool') out.syncPool = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--status') out.status = true;
    else if (a === '--reset') out.reset = true;
    else if (a === '--no-resume') out.resume = false;
    else if (a === '--max-attempts') out.maxAttempts = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--fix-retries') out.fixRetries = Math.max(0, Number(argv[++i]) || 2);
    else if (a === '--max-api-calls') out.maxApiCalls = Math.max(1, Number(argv[++i]) || 80);
    else if (a === '--pause-ms') out.pauseMs = Math.max(0, Number(argv[++i]) || 5000);
    else if (a === '--help' || a === '-h') out.help = true;
  }

  if (out.maxAttempts == null) out.maxAttempts = Math.max(out.target * 4, out.target + 8);
  return out;
}

function validateArgs(args) {
  if (args.help || !args.module) {
    console.log(`pool-fill-teil — generación dirigida por huecos del pool

  node scripts/pool-fill-teil.mjs --module lesen --teil 3 --target 5 --publish --sync-pool
  node scripts/pool-fill-teil.mjs --module horen --teil 2 --target 10 --rotate-every 3 --publish
  node scripts/pool-fill-teil.mjs --module schreiben --teil 1 --target 3 --publish
  node scripts/pool-fill-teil.mjs --module lesen --teil 3 --status

Opciones:
  --target N           partes OK a conseguir (default 5)
  --target-per-cell N  stock mínimo por tema en la celda (default 3)
  --rotate-every N     cada N OK rota tema + vocab (default 2)
  --word-count N       lemas por parte (default 10)
  --publish            ingest → banco → pool local
  --sync-pool          sube también a Netlify Blobs (requiere .env)
  --dry-run            solo muestra plan de rotación
  --reset              borra checkpoint y empieza de cero

Carpetas (ver docs/pool-content-map.md):
  batches/generated/     borradores validados (formato+calidad)
  batches/rejected/      fallos movidos aquí (no van al banco)
  library/reusable-seed/ partes finales del pool personal
`);
    process.exit(args.help ? 0 : 1);
  }

  const mod = args.module;
  if (!MODULE_TEILS[mod]) {
    console.error(`Módulo desconocido: ${mod}. Usa: ${Object.keys(MODULE_TEILS).join(', ')}`);
    process.exit(1);
  }
  if (!Number.isFinite(args.teil) || !MODULE_TEILS[mod].includes(args.teil)) {
    console.error(`${mod} requiere --teil ${MODULE_TEILS[mod].join(' | ')}`);
    process.exit(1);
  }
  if (
    !args.dryRun &&
    !args.status &&
    !(args.module === 'lesen' && args.teil === 3) &&
    !process.env.GEMINI_API_KEY &&
    !process.env.GOOGLE_API_KEY
  ) {
    console.error('Falta GEMINI_API_KEY en .env (Lesen T3 usa make-t3 y no la necesita)');
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  validateArgs(args);

  if (args.status) {
    printGapStatus(args.lang, args.level, args.module, args.teil, args.targetPerCell);
    return;
  }

  const key = checkpointKey(args.lang, args.level, args.module, args.teil);
  if (args.reset) clearPoolFillCheckpoint();

  let cp = args.resume ? loadPoolFillCheckpoint(key) : null;
  let saved = cp?.saved || 0;
  let attempts = cp?.attempts || 0;
  let partsSinceRotate = cp?.partsSinceRotate ?? args.rotateEvery;
  let currentTopic = cp?.currentTopic || null;
  let currentWords = cp?.currentWords || [];
  let vocabCursor = cp?.vocabCursor || 0;
  let recentTopics = cp?.recentTopics || [];
  let sessionLesen = cp?.sessionLesen || null;
  let sessionExam = cp?.sessionExam || null;
  const publishedFiles = cp?.publishedFiles ? [...cp.publishedFiles] : [];

  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║ Pool fill · ${args.module} T${args.teil}`.padEnd(53) + '║');
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`Objetivo: ${saved}/${args.target} partes OK · rotar cada ${args.rotateEvery}`);
  console.log(`Celda objetivo: ${args.targetPerCell} partes/tema · publish=${args.publish}`);

  refreshVocabCoverage(args.lang, args.level);
  printGapStatus(args.lang, args.level, args.module, args.teil, args.targetPerCell);

  if (args.dryRun) {
    const plan = planRotation({
      lang: args.lang,
      level: args.level,
      module: args.module,
      teil: args.teil,
      targetPerCell: args.targetPerCell,
      rotateEvery: args.rotateEvery,
      wordCount: args.wordCount,
      vocabCursor,
      recentTopics,
    });
    console.log('\n[dry-run] Siguiente lote planificado (no se llama a Gemini).');
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  while (saved < args.target && attempts < args.maxAttempts) {
    if (!currentTopic || partsSinceRotate >= args.rotateEvery) {
      if (partsSinceRotate >= args.rotateEvery) {
        refreshVocabCoverage(args.lang, args.level);
      }
      const plan = planRotation({
        lang: args.lang,
        level: args.level,
        module: args.module,
        teil: args.teil,
        targetPerCell: args.targetPerCell,
        rotateEvery: args.rotateEvery,
        wordCount: args.wordCount,
        vocabCursor,
        recentTopics,
      });
      currentTopic = plan.topic;
      currentWords = plan.words;
      vocabCursor = plan.nextCursor;
      recentTopics = plan.recentTopics;
      partsSinceRotate = 0;
    }

    attempts++;
    console.log(`\n── Intento ${attempts} · OK ${saved}/${args.target} ──`);

    const cycle = await runPoolFillCycle({
      module: args.module,
      teil: args.teil,
      topic: currentTopic,
      words: currentWords,
      lang: args.lang,
      level: args.level,
      tag: args.tag,
      publish: args.publish,
      syncPool: args.syncPool,
      maxApiCalls: args.maxApiCalls,
      fixRetries: args.fixRetries,
      sessionLesen,
      sessionExam,
    });

    sessionLesen = cycle.sessionLesen || sessionLesen;
    sessionExam = cycle.sessionExam || sessionExam;

    savePoolFillCheckpoint({
      key,
      module: args.module,
      teil: args.teil,
      saved,
      target: args.target,
      attempts,
      partsSinceRotate,
      currentTopic,
      currentWords,
      vocabCursor,
      recentTopics,
      publishedFiles,
      updatedAt: new Date().toISOString(),
    });

    if (!cycle.ok) {
      console.warn(`⚠ Falló (${cycle.stage}): ${cycle.reason || 'unknown'}`);
      if (args.pauseMs > 0) await new Promise((r) => setTimeout(r, args.pauseMs));
      continue;
    }

    saved++;
    partsSinceRotate++;
    if (cycle.file) publishedFiles.push(cycle.file);
    rebuildPoolManifest();

    savePoolFillCheckpoint({
      key,
      module: args.module,
      teil: args.teil,
      saved,
      target: args.target,
      attempts,
      partsSinceRotate,
      currentTopic,
      currentWords,
      vocabCursor,
      recentTopics,
      publishedFiles,
      updatedAt: new Date().toISOString(),
    });

    if (saved < args.target && args.pauseMs > 0) {
      console.log(`Pausa ${args.pauseMs / 1000}s…`);
      await new Promise((r) => setTimeout(r, args.pauseMs));
    }
  }

  console.log(`\n══ Fin · ${saved}/${args.target} partes OK · ${attempts} intentos ══`);
  if (saved < args.target) {
    console.warn(`No se alcanzó el objetivo. Reanuda con el mismo comando (checkpoint en batches/.pool-fill-checkpoint.json).`);
    process.exit(1);
  }
  clearPoolFillCheckpoint();
}

main().catch((err) => {
  if (err instanceof DailyQuotaError || err?.name === 'DailyQuotaError') {
    console.error(`\n${err.message}`);
    process.exit(2);
  }
  console.error(err.stack || err.message || err);
  process.exit(1);
});
