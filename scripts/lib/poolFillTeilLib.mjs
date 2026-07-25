/**
 * poolFillTeilLib.mjs — generar + validar + publicar una parte pool (sin mezclar rechazos).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { ROOT } from './loadEnv.mjs';
import { REJECTED_DIR } from './batchPaths.mjs';
import { generateLesenPart, createLesenFactorySession } from '../generate-lesen-part-gemini.mjs';
import {
  createExamFactorySession,
  generateExamPartSingle,
} from './generatePartGeminiLib.mjs';
import {
  pickScarcestTopic,
  pickRotatingWords,
  loadPoolRecords,
  rankTopicGaps,
} from './poolGapPlanner.mjs';

const require = createRequire(import.meta.url);
const { normalizeB1Topic } = require(path.join(ROOT, 'js/data/b1Topics.js'));

const GENERATED_DIR = path.join(ROOT, 'batches', 'generated');

export function refreshVocabCoverage(lang, level) {
  console.log('\n🔄 Actualizando cobertura de vocabulario…');
  const res = spawnSync(
    process.execPath,
    ['scripts/vocab-coverage-report.mjs', '--lang', lang, '--level', level],
    { cwd: ROOT, stdio: 'inherit' },
  );
  if (res.status !== 0) console.warn('vocab-coverage-report terminó con código', res.status);
}

export function rebuildPoolManifest() {
  const res = spawnSync(process.execPath, ['scripts/build-pool-stock-manifest.mjs'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  return res.status === 0;
}

export function planRotation(ctx) {
  const records = loadPoolRecords(ctx.lang, ctx.level);
  const recent = ctx.recentTopics || [];
  const topic = pickScarcestTopic(records, ctx.module, ctx.teil, {
    targetPerCell: ctx.targetPerCell,
    excludeTopics: recent.slice(-Math.max(1, ctx.rotateEvery - 1)),
  });
  const { words, nextCursor } = pickRotatingWords(ctx.lang, ctx.level, {
    count: ctx.wordCount,
    cursor: ctx.vocabCursor,
  });
  const gaps = rankTopicGaps(records, ctx.module, ctx.teil, ctx.targetPerCell);
  const row = gaps.find((g) => g.topic === topic);
  console.log(
    `\n📌 Celda ${ctx.module} T${ctx.teil} · tema «${topic}» (stock ${row?.count ?? 0}, objetivo ${ctx.targetPerCell})`,
  );
  console.log(`   Palabras (${words.length}): ${words.join(', ')}`);
  return { topic, words, nextCursor, recentTopics: [...recent, topic].slice(-8) };
}

function moveToRejected(relFile, reason) {
  const abs = path.isAbsolute(relFile) ? relFile : path.join(ROOT, relFile);
  if (!fs.existsSync(abs)) return null;
  fs.mkdirSync(REJECTED_DIR, { recursive: true });
  const base = path.basename(abs);
  let dest = path.join(REJECTED_DIR, base);
  if (fs.existsSync(dest)) dest = path.join(REJECTED_DIR, `${Date.now()}-${base}`);
  try {
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
    fs.writeFileSync(dest, `${JSON.stringify({ _rejectedReason: reason, ...raw }, null, 2)}\n`, 'utf8');
    fs.unlinkSync(abs);
  } catch {
    fs.renameSync(abs, dest);
  }
  return path.relative(ROOT, dest).replace(/\\/g, '/');
}

export async function generatePoolPart(ctx) {
  const { module, teil, topic, words, lang, level, sessionLesen, sessionExam } = ctx;

  if (module === 'lesen') {
    let session = sessionLesen;
    if (!session) {
      session = createLesenFactorySession({
        lang,
        level,
        writeFile: true,
        maxApiCalls: ctx.maxApiCalls,
      });
    }
    const result = await generateLesenPart({
      teil,
      topic,
      words,
      writeFile: true,
      session,
      fixRetries: ctx.fixRetries ?? 2,
    });
    return { ...result, sessionLesen: session };
  }

  let session = sessionExam;
  if (!session) {
    session = createExamFactorySession({
      module,
      teil,
      lang,
      level,
      maxApiCalls: ctx.maxApiCalls,
    });
  }
  const result = await generateExamPartSingle({
    module,
    teil,
    topic,
    words,
    session,
    fixRetries: ctx.fixRetries ?? 2,
  });
  return { ...result, sessionExam: session };
}

export function publishPoolPart(ctx) {
  const { module, teil, relFile, lang, level, tag, syncPool } = ctx;
  const script =
    module === 'lesen'
      ? 'scripts/publish-lesen-generated.mjs'
      : 'scripts/publish-exam-generated.mjs';

  const args = [
    script,
    '--file',
    relFile,
    '--continue',
    '--publish',
    '--allow-bank-dup',
    '--lang',
    lang,
    '--level',
    level,
    '--tag',
    tag || 'gemini',
  ];
  if (module === 'lesen' && teil != null) args.push('--teil', String(teil));
  if (module !== 'lesen') {
    args.push('--module', module);
    if (teil != null) args.push('--teil', String(teil));
  }
  if (syncPool) args.push('--sync-pool');

  console.log(`\n══ Publicando ${relFile} (POOL-2 + banco) ══`);
  const res = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' });
  return { ok: res.status === 0, status: res.status ?? 1 };
}

export async function runPoolFillCycle(ctx) {
  const gen = await generatePoolPart(ctx);
  if (!gen.ok) {
    if (gen.file) moveToRejected(gen.file, gen.reason || 'generation_failed');
    return {
      ok: false,
      stage: 'generate',
      reason: gen.reason,
      sessionLesen: gen.sessionLesen,
      sessionExam: gen.sessionExam,
    };
  }

  const relFile = gen.file;
  if (!relFile) {
    return { ok: false, stage: 'generate', reason: 'no_file', sessionLesen: gen.sessionLesen, sessionExam: gen.sessionExam };
  }

  if (!ctx.publish) {
    console.log(`✅ Validada en ${relFile} (sin --publish)`);
    return { ok: true, file: relFile, published: false, sessionLesen: gen.sessionLesen, sessionExam: gen.sessionExam };
  }

  const pub = publishPoolPart({ ...ctx, relFile });
  if (!pub.ok) {
    moveToRejected(relFile, 'publish_or_pool2_failed');
    return {
      ok: false,
      stage: 'publish',
      reason: 'publish_failed',
      file: relFile,
      sessionLesen: gen.sessionLesen,
      sessionExam: gen.sessionExam,
    };
  }

  console.log(`✅ Publicada: ${relFile}`);
  return {
    ok: true,
    file: relFile,
    published: true,
    sessionLesen: gen.sessionLesen,
    sessionExam: gen.sessionExam,
  };
}

export function printGapStatus(lang, level, module, teil, targetPerCell) {
  const records = loadPoolRecords(lang, level);
  const { untagged, total } = (() => {
    const mod = String(module).toLowerCase();
    let u = 0;
    let t = 0;
    for (const r of records) {
      if (String(r.module).toLowerCase() !== mod) continue;
      if (Number(r.teil) !== Number(teil)) continue;
      t++;
      if (!normalizeB1Topic(r.topicTag)) u++;
    }
    return { untagged: u, total: t };
  })();
  const ranked = rankTopicGaps(records, module, teil, targetPerCell);
  console.log(`\nCelda ${module} T${teil} · ${total} partes verificadas (${untagged} sin topicTag B1)`);
  console.log(`Objetivo por tema: ${targetPerCell} partes limpias\n`);
  console.log(`${'Tema'.padEnd(14)} ${'Stock'.padStart(5)} ${'Faltan'.padStart(6)}`);
  for (const row of ranked.slice(0, 10)) {
    if (row.deficit <= 0 && row.count >= targetPerCell) continue;
    console.log(`${row.topic.padEnd(14)} ${String(row.count).padStart(5)} ${String(row.deficit).padStart(6)}`);
  }
  const next = pickScarcestTopic(records, module, teil, { targetPerCell });
  console.log(`\nSiguiente tema sugerido: ${next}`);
}
