#!/usr/bin/env node
/**
 * generate-cli.mjs — Herramienta CLI reusable para generar contenido del pool.
 *
 * Modo prueba (smoke): 1 parte por cada celda (Lesen T1–T5, Hören T1–T4, Schreiben/Sprechen T1–T3).
 * Modo volumen: N partes de una celda (--cell lesen-t1 --count 10).
 *
 * Rotación: tema más escaso (pickScarcestTopic) + vocab menos cubierto alineado al tema.
 * Gates: mismos que pool-fill-teil (validate, calidad, lexico, caps, POOL-2, LanguageTool, etc.).
 *
 * Uso:
 *   node scripts/generate-cli.mjs --smoke --dry-run
 *   node scripts/generate-cli.mjs --smoke --publish
 *   node scripts/generate-cli.mjs --cell lesen-t1 --count 10 --publish
 *   node scripts/generate-cli.mjs --cell horen-t2 --count 5 --word-count 7
 */
import { loadEnvFile } from './lib/loadEnv.mjs';
import {
  checkpointKey,
  clearPoolFillCheckpoint,
  loadPoolFillCheckpoint,
  savePoolFillCheckpoint,
} from './lib/poolGapPlanner.mjs';
import { restoreSessionMoldExclude, snapshotSessionMoldExclude } from './lib/poolFillSessionExclude.mjs';
import {
  planRotation,
  printGapStatus,
  rebuildPoolManifest,
  refreshVocabCoverage,
  runPoolFillCycle,
  shouldSkipLesenT3Topic,
  preflightLesenT3Topic,
  shouldSkipLesenT4Topic,
  preflightLesenT4Topic,
  lesenForcedTopicPreflightAction,
} from './lib/poolFillTeilLib.mjs';
import { isTopicMoldSessionBlockReason } from './lib/topicMoldCircuitBreaker.mjs';
import { printCoverageSummary, refreshCoverageRegistry } from './lib/coverageRegistry.mjs';
import { DailyQuotaError } from './lib/geminiClient.mjs';
import {
  formatCostUsd,
  filterGenerationCostSince,
  readGenerationCostLog,
  summarizeGenerationCost,
  sumCellCostSince,
} from './lib/generationCostLog.mjs';
import { setupConsoleUtf8, boxTop, boxLine, boxBottom, hrDouble } from './lib/consoleSafe.mjs';
import { smokeCellsForLevel } from './lib/levelPlanner.mjs';

loadEnvFile();
setupConsoleUtf8();

const MODULE_TEILS = {
  lesen: [1, 2, 3, 4, 5],
  horen: [1, 2, 3, 4],
  schreiben: [1, 2, 3],
  sprechen: [1, 2, 3],
};

const SMOKE_CELLS = smokeCellsForLevel('B1');

function parseCell(raw) {
  const s = String(raw || '').trim().toLowerCase();
  const m = s.match(/^([a-z]+)-t(\d+)$/);
  if (!m) return null;
  const module = m[1];
  const teil = Number(m[2]);
  if (!MODULE_TEILS[module]?.includes(teil)) return null;
  return { module, teil };
}

function resolveCells(args) {
  if (args.smoke) {
    return smokeCellsForLevel(args.level).map((c) => ({ ...c, target: 1 }));
  }
  if (!args.module || !Number.isFinite(args.teil)) {
    throw new Error('Indica --smoke, --cell lesen-t1, o --module + --teil');
  }
  return [{ module: args.module, teil: args.teil, target: args.count }];
}

function parseArgs(argv) {
  const out = {
    smoke: false,
    cell: null,
    module: null,
    teil: null,
    lang: 'de',
    level: 'B1',
    count: 1,
    targetPerCell: 3,
    rotateEvery: 1,
    wordCount: 6,
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
    maxAttemptsPerFile: 10,
    maxCostPerFileUsd: 0.3,
    pauseMs: 5000,
    topic: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--smoke') out.smoke = true;
    else if (a === '--cell') out.cell = String(argv[++i] || '').trim().toLowerCase();
    else if (a === '--teil') {
      const v = String(argv[++i] || '');
      if (v.includes('-')) out.cell = v.toLowerCase();
      else out.teil = Number(v);
    } else if (a === '--module') out.module = String(argv[++i] || '').toLowerCase();
    else if (a === '--lang') out.lang = String(argv[++i]).toLowerCase();
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--count') out.count = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--target-per-cell') out.targetPerCell = Math.max(1, Number(argv[++i]) || 3);
    else if (a === '--rotate-every') out.rotateEvery = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--word-count') out.wordCount = Math.min(8, Math.max(5, Number(argv[++i]) || 6));
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
    else if (a === '--max-attempts-per-file') {
      out.maxAttemptsPerFile = Math.max(1, Number(argv[++i]) || 10);
    } else if (a === '--max-cost-per-file') {
      out.maxCostPerFileUsd = Math.max(0.01, Number(argv[++i]) || 0.3);
    }     else if (a === '--pause-ms') out.pauseMs = Math.max(0, Number(argv[++i]) || 5000);
    else if (a === '--topic') out.topic = String(argv[++i] || '').trim();
    else if (a === '--help' || a === '-h') out.help = true;
  }

  if (out.cell) {
    const parsed = parseCell(out.cell);
    if (!parsed) throw new Error(`Celda inválida: ${out.cell}. Usa p. ej. lesen-t1, horen-t2`);
    out.module = parsed.module;
    out.teil = parsed.teil;
  }

  if (out.maxAttempts == null) {
    out.maxAttempts = Math.max(out.count * 4, out.count + 8);
  }
  return out;
}

function printHelp() {
  console.log(`generate-cli — generación pool con rotación de tema + cobertura vocab

MODO PRUEBA (1 parte por cada celda = 15 partes):
  node scripts/generate-cli.mjs --smoke --dry-run
  node scripts/generate-cli.mjs --smoke --publish

MODO VOLUMEN (N partes de una celda):
  node scripts/generate-cli.mjs --cell lesen-t1 --count 10 --publish
  node scripts/generate-cli.mjs --cell horen-t2 --count 5 --word-count 7
  node scripts/generate-cli.mjs --module lesen --teil 3 --count 3 --publish --sync-pool

ESTADO / COBERTURA:
  node scripts/generate-cli.mjs --cell lesen-t1 --status
  node scripts/vocab-coverage-report.mjs --lang de --level B1

Opciones:
  --smoke              1× cada celda (Lesen T1–T5, Hören T1–T4, Schreiben/Sprechen T1–T3)
  --cell MODULE-tN       Celda objetivo (ej. lesen-t1, horen-t4, schreiben-t2)
  --count N              Partes OK a generar (default 1; smoke fuerza 1 por celda)
  --word-count 5..8      Lemas sugeridos por parte (default 6)
  --rotate-every N       Rota tema+vocab cada N OK (default 1 en volumen, 1 en smoke)
  --publish              Publica al pool tras gates OK
  --sync-pool            Sube a Netlify Blobs (requiere .env)
  --dry-run              Solo planifica rotación, sin API
  --status               Muestra huecos tema + cobertura vocab
  --reset                Borra checkpoint de la celda
  --max-api-calls N      Límite global de llamadas API por sesión (default 80)
  --max-attempts-per-file N  Freno: máx. llamadas API por archivo (default 10)
  --max-cost-per-file USD    Freno: máx. costo USD por archivo (default 0.30)
  --pause-ms N           Pausa entre intentos de celda (default 5000)
  --topic NAME           Forzar tema B1 (ej. Kultur, Gesundheit)
`);
}

function resolveCellGenerationLimits(cell, args) {
  const base = {
    maxAttemptsPerFile: args.maxAttemptsPerFile,
    maxCostPerFileUsd: args.maxCostPerFileUsd,
    fixRetries: args.fixRetries,
  };
  if (cell.module === 'lesen' && cell.teil === 5) {
    return {
      maxAttemptsPerFile: Math.max(base.maxAttemptsPerFile, 18),
      maxCostPerFileUsd: Math.max(base.maxCostPerFileUsd, 0.38),
      fixRetries: Math.max(base.fixRetries, 3),
    };
  }
  return base;
}

async function fillOneCell(args, cell) {
  const key = checkpointKey(args.lang, args.level, cell.module, cell.teil);
  if (args.reset) clearPoolFillCheckpoint();

  let cp = args.resume ? loadPoolFillCheckpoint(key) : null;

  if (cp && !args.reset) {
    const cpTarget = cp.target ?? cell.target;
    if (cp.saved >= cell.target) {
      console.warn(
        `\n⚠ Checkpoint heredado: ${cp.saved}/${cpTarget} (${cp.attempts} intentos de corrida anterior). ` +
          `Objetivo nuevo: ${cell.target}. Sin --reset no se genera contenido nuevo.\n`
      );
      return {
        saved: cp.saved,
        target: cell.target,
        attempts: cp.attempts,
        sessionAttempts: 0,
        skipped: true,
        publishedFiles: cp.publishedFiles || [],
        cellCostUsd: 0,
      };
    }
    if (cp.target != null && cp.target !== cell.target) {
      console.warn(
        `\n⚠ Checkpoint con objetivo ${cp.target} ≠ --count ${cell.target}. ` +
          `Continuando desde ${cp.saved} guardados (--resume). Usá --reset para empezar de cero.\n`
      );
    }
  }

  let saved = cp?.saved || 0;
  let attempts = cp?.attempts || 0;
  const attemptsAtStart = attempts;
  let partsSinceRotate = cp?.partsSinceRotate ?? args.rotateEvery;
  let currentTopic = cp?.currentTopic || null;
  let currentWords = cp?.currentWords || [];
  let vocabCursor = cp?.vocabCursor || 0;
  let recentTopics = cp?.recentTopics || [];
  let sessionLesen = cp?.sessionLesen || null;
  let sessionExam = cp?.sessionExam || null;
  const publishedFiles = cp?.publishedFiles ? [...cp.publishedFiles] : [];
  let excludeSubtypes = cp?.excludeSubtypes || [];
  let excludeTitles = cp?.excludeTitles || [];
  let exhaustedTopics = cp?.exhaustedTopics ? [...cp.exhaustedTopics] : [];

  if (sessionLesen?.args) {
    restoreSessionMoldExclude(sessionLesen.args, { excludeSubtypes, excludeTitles });
  }

  const target = cell.target;
  const cellLimits = resolveCellGenerationLimits(cell, args);

  console.log(`\n${boxTop(`${cell.module} T${cell.teil}`)}`);
  console.log(boxLine(`Objetivo: ${saved}/${target} · vocab: ${args.wordCount} · publish=${args.publish}`));
  console.log(
    boxLine(
      `Freno/archivo: ≤${cellLimits.maxAttemptsPerFile} llamadas · ≤$${cellLimits.maxCostPerFileUsd} · API sesión max ${args.maxApiCalls}`,
    ),
  );
  console.log(boxBottom());

  refreshVocabCoverage(args.lang, args.level);
  printGapStatus(args.lang, args.level, cell.module, cell.teil, args.targetPerCell);

  const cellCostSince = new Date().toISOString();

  if (args.dryRun) {
    const plan = planRotation({
      lang: args.lang,
      level: args.level,
      module: cell.module,
      teil: cell.teil,
      targetPerCell: args.targetPerCell,
      rotateEvery: args.rotateEvery,
      wordCount: args.wordCount,
      vocabCursor,
      recentTopics,
      forcedTopic: args.topic || null,
      exhaustedTopics,
    });
    console.log('\n[dry-run] Plan de rotación:');
    console.log(JSON.stringify(plan, null, 2));
    return { saved, target, dryRun: true, cellCostUsd: 0 };
  }

  let forcedTopicAborted = false;

  while (saved < target && attempts < args.maxAttempts) {
    if (!currentTopic || partsSinceRotate >= args.rotateEvery) {
      if (partsSinceRotate >= args.rotateEvery) {
        refreshVocabCoverage(args.lang, args.level);
      }
      const plan = planRotation({
        lang: args.lang,
        level: args.level,
        module: cell.module,
        teil: cell.teil,
        targetPerCell: args.targetPerCell,
        rotateEvery: args.rotateEvery,
        wordCount: args.wordCount,
        vocabCursor,
        recentTopics,
        forcedTopic: args.topic || null,
        exhaustedTopics,
      });
      if (plan.exhausted || !plan.topic) {
        if (plan.forcedTopicExhausted) {
          console.error(
            `\n⛔ Tema forzado «${plan.forcedTopicExhausted}» agotado — no se puede generar.` +
              (plan.vocabPlanError ? ` (${plan.vocabPlanError})` : ''),
          );
          forcedTopicAborted = true;
        } else if (plan.vocabTopicsExhausted?.length) {
          console.warn(
            `\n⛔ Sin vocab planificable para ${cell.module} T${cell.teil}. ` +
              `Temas probados sin palabras: ${plan.vocabTopicsExhausted.join(', ')}`,
          );
        } else {
          console.warn(
            `\n⛔ Sin temas con stock disponible para ${cell.module} T${cell.teil}. ` +
              `Saltados (${exhaustedTopics.length}): ${exhaustedTopics.join(', ') || '(ninguno)'}`,
          );
        }
        break;
      }
      currentTopic = plan.topic;
      currentWords = plan.words;
      vocabCursor = plan.nextCursor;
      recentTopics = plan.recentTopics;
      partsSinceRotate = 0;
    }

    if (cell.module === 'lesen' && cell.teil === 3 && currentTopic) {
      const stock = preflightLesenT3Topic(currentTopic, sessionLesen, args.level);
      const pf = lesenForcedTopicPreflightAction(args.topic, currentTopic, stock, 3);
      if (pf.action === 'abort') {
        console.error(`\n${pf.message}`);
        forcedTopicAborted = true;
        break;
      }
      if (pf.action === 'skip') {
        if (!exhaustedTopics.includes(currentTopic)) {
          exhaustedTopics.push(currentTopic);
          console.warn(
            `\n⏭ Lesen T3 · «${currentTopic}» sin stock de blueprint ` +
              `(${stock.compatibleTotal} compatibles, 0 disponibles tras dedup/exclusión) — saltando tema`,
          );
        }
        partsSinceRotate = args.rotateEvery;
        continue;
      }
    }

    if (cell.module === 'lesen' && cell.teil === 4 && currentTopic) {
      const stock = preflightLesenT4Topic(currentTopic, sessionLesen, args.level);
      const pf = lesenForcedTopicPreflightAction(args.topic, currentTopic, stock, 4);
      if (pf.action === 'abort') {
        console.error(`\n${pf.message}`);
        forcedTopicAborted = true;
        break;
      }
      if (pf.action === 'skip') {
        if (!exhaustedTopics.includes(currentTopic)) {
          exhaustedTopics.push(currentTopic);
          console.warn(
            `\n⏭ Lesen T4 · «${currentTopic}» sin semillas frescas ` +
              `(${stock.preflightOkCount} preflight-OK, ${stock.freshCount} frescas, ` +
              `tier=${stock.pickTier}) — saltando tema`,
          );
        }
        partsSinceRotate = args.rotateEvery;
        continue;
      }
    }

    attempts++;
    console.log(`\n── ${cell.module} T${cell.teil} · intento ${attempts} · OK ${saved}/${target} ──`);

    const cycle = await runPoolFillCycle({
      module: cell.module,
      teil: cell.teil,
      topic: currentTopic,
      words: currentWords,
      lang: args.lang,
      level: args.level,
      tag: args.tag,
      publish: args.publish,
      syncPool: args.syncPool,
      maxApiCalls: args.maxApiCalls,
      fixRetries: cellLimits.fixRetries,
      maxAttemptsPerFile: cellLimits.maxAttemptsPerFile,
      maxCostPerFileUsd: cellLimits.maxCostPerFileUsd,
      sessionLesen,
      sessionExam,
    });

    sessionLesen = cycle.sessionLesen || sessionLesen;
    sessionExam = cycle.sessionExam || sessionExam;
    if (sessionLesen?.args) {
      ({ excludeSubtypes, excludeTitles } = snapshotSessionMoldExclude(sessionLesen.args));
    }

    savePoolFillCheckpoint({
      key,
      module: cell.module,
      teil: cell.teil,
      saved,
      target,
      attempts,
      partsSinceRotate,
      currentTopic,
      currentWords,
      vocabCursor,
      recentTopics,
      publishedFiles,
      excludeSubtypes,
      excludeTitles,
      exhaustedTopics,
      updatedAt: new Date().toISOString(),
    });

    if (!cycle.ok) {
      const moldBlock = isTopicMoldSessionBlockReason({ reason: cycle.reason, gate: cycle.gate });
      const skipTopic =
        moldBlock ||
        shouldSkipLesenT3Topic(cell.module, cell.teil, currentTopic, cycle.reason, sessionLesen, args.level) ||
        shouldSkipLesenT4Topic(cell.module, cell.teil, currentTopic, cycle.reason, sessionLesen, args.level);
      if (skipTopic && currentTopic && !exhaustedTopics.includes(currentTopic)) {
        exhaustedTopics.push(currentTopic);
        const label = cell.teil === 3 ? 'Lesen T3' : cell.teil === 4 ? 'Lesen T4' : cell.module;
        const why = moldBlock ? 'circuit breaker / topic×molde' : cycle.reason || 'unknown';
        console.warn(
          `\n⏭ ${label} · «${currentTopic}» excluido en esta sesión (${why}) — rotando tema`,
        );
        partsSinceRotate = args.rotateEvery;
      }
      const brakeNote = cycle.braked ? ' [FRENO por archivo]' : '';
      console.warn(`⚠ Falló (${cycle.stage})${brakeNote}: ${cycle.reason || 'unknown'}`);
      if (args.pauseMs > 0 && !skipTopic) await new Promise((r) => setTimeout(r, args.pauseMs));
      continue;
    }

    saved++;
    partsSinceRotate++;
    if (cycle.file) publishedFiles.push(cycle.file);
    rebuildPoolManifest();

    savePoolFillCheckpoint({
      key,
      module: cell.module,
      teil: cell.teil,
      saved,
      target,
      attempts,
      partsSinceRotate,
      currentTopic,
      currentWords,
      vocabCursor,
      recentTopics,
      publishedFiles,
      excludeSubtypes,
      excludeTitles,
      exhaustedTopics,
      updatedAt: new Date().toISOString(),
    });

    if (saved < target && args.pauseMs > 0) {
      console.log(`Pausa ${args.pauseMs / 1000}s…`);
      await new Promise((r) => setTimeout(r, args.pauseMs));
    }
  }

  if (saved >= target) clearPoolFillCheckpoint();

  const costEntries = readGenerationCostLog();
  const cellCostUsd = sumCellCostSince(
    costEntries,
    cellCostSince,
    cell.module,
    cell.teil,
  );

  return {
    saved,
    target,
    attempts,
    sessionAttempts: attempts - attemptsAtStart,
    publishedFiles,
    cellCostUsd,
    forcedTopicAborted,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (args.status) {
    if (!args.module || !Number.isFinite(args.teil)) {
      throw new Error('--status requiere --cell o --module + --teil');
    }
    refreshCoverageRegistry(args.lang, args.level);
    printCoverageSummary(args.lang, args.level);
    printGapStatus(args.lang, args.level, args.module, args.teil, args.targetPerCell);
    return;
  }

  if (
    !args.dryRun &&
    !process.env.GEMINI_API_KEY &&
    !process.env.GOOGLE_API_KEY &&
    !(args.module === 'lesen' && args.teil === 3)
  ) {
    console.error('Falta GEMINI_API_KEY en .env');
    process.exit(1);
  }

  const cells = resolveCells(args);
  const results = [];
  const sessionStartedAt = new Date().toISOString();

  for (const cell of cells) {
    const r = await fillOneCell(args, cell);
    results.push({ ...cell, ...r });
  }

  console.log(`\n${hrDouble()}`);
  console.log('Resumen generate-cli');
  console.log(hrDouble());
  const colCell = 14;
  const colResult = 28;
  console.log(
    `  ${'Celda'.padEnd(colCell)}${'Resultado'.padEnd(colResult)}Costo`,
  );
  console.log(`  ${'-'.repeat(colCell)}${'-'.repeat(colResult)}${'-'.repeat(10)}`);

  let totalCostUsd = 0;
  for (const r of results) {
    const label = `${r.module} T${r.teil}`;
    const cost = Number(r.cellCostUsd) || 0;
    totalCostUsd += cost;
    let result;
    if (r.dryRun) {
      result = 'dry-run OK';
    } else if (r.skipped) {
      result =
        `SKIP checkpoint ${r.saved}/${r.target} ` +
        `(${r.attempts ?? '?'} heredados)`;
    } else if (r.forcedTopicAborted) {
      result = `${r.saved}/${r.target} ABORT (tema forzado agotado)`;
    } else if (r.saved >= r.target) {
      const ses = r.sessionAttempts ?? r.attempts;
      result = `${r.saved}/${r.target} OK (${ses} intentos)`;
    } else {
      const ses = r.sessionAttempts ?? r.attempts;
      result = `${r.saved}/${r.target} FAIL (${ses} intentos)`;
    }
    console.log(
      `  ${label.padEnd(colCell)}${result.padEnd(colResult)}${formatCostUsd(cost)}`,
    );
  }
  console.log(`  ${'-'.repeat(colCell)}${'-'.repeat(colResult)}${'-'.repeat(10)}`);
  console.log(
    `  ${'TOTAL'.padEnd(colCell)}${''.padEnd(colResult)}${formatCostUsd(totalCostUsd)}`,
  );

  const sessionEntries = filterGenerationCostSince(
    readGenerationCostLog(),
    sessionStartedAt,
  );
  if (sessionEntries.length) {
    const m = summarizeGenerationCost(sessionEntries);
    console.log(`\n${hrDouble()}`);
    console.log('Métricas sesión (generation-cost.jsonl)');
    console.log(hrDouble());
    console.log(
      `  Llamadas API: ${m.calls} · publicadas (ok): ${m.okCalls} · descartadas (fail): ${m.failCalls} · ` +
        `tasa ok ${Math.round(m.successRate * 100)}%`,
    );
    console.log(
      `  Coste sesión: ${formatCostUsd(m.totalCostUsd)} ` +
        `(ok ${formatCostUsd(m.okCostUsd)} · fail ${formatCostUsd(m.failCostUsd)})`,
    );
    console.log(
      `  Tokens: prompt ${m.promptTokens} · output ${m.candidatesTokens + m.thoughtsTokens}`,
    );
    const byCell = Object.entries(m.byModuleTeil || {}).sort((a, b) => b[1].costUsd - a[1].costUsd);
    if (byCell.length) {
      console.log('  Por celda:');
      for (const [key, b] of byCell.slice(0, 8)) {
        console.log(
          `    ${key.padEnd(12)} ${b.calls} llamadas · ${formatCostUsd(b.costUsd)} · ok ${b.ok}/${b.calls}`,
        );
      }
    }
    const failedFiles = (m.files || []).filter((f) => !f.ok).slice(0, 5);
    if (failedFiles.length) {
      console.log('  Archivos sin publish (muestra):');
      for (const f of failedFiles) {
        console.log(`    ${f.file} · ${f.calls} llamadas · ${formatCostUsd(f.costUsd)}`);
      }
    }
  } else if (!args.dryRun) {
    console.log('\nMétricas sesión: sin entradas nuevas en generation-cost.jsonl (¿solo dry-run o sin API?).');
  }

  printCoverageSummary(args.lang, args.level);

  const skipped = results.filter((r) => r.skipped);
  if (skipped.length) process.exit(3);

  const aborted = results.filter((r) => r.forcedTopicAborted);
  if (aborted.length) process.exit(4);

  const failed = results.filter((r) => !r.dryRun && r.saved < r.target);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  if (err instanceof DailyQuotaError || err?.name === 'DailyQuotaError') {
    console.error(`\n${err.message}`);
    process.exit(2);
  }
  console.error(err.stack || err.message || err);
  process.exit(1);
});
