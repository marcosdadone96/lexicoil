#!/usr/bin/env node
/**
 * Run generate-batch-gemini jobs in waves (serial by default for free tier).
 *
 * Usage:
 *   node scripts/generate-parallel.mjs --mode gaps --target 10
 *   npm run generate:b1:10
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { getGenerationJobs } from './lib/coverageJobs.mjs';
import { LOG_DIR } from './lib/batchPaths.mjs';

loadEnvFile();

const LOCK_FILE = path.join(ROOT, 'batches', '.generate.lock');
const CHECKPOINT_FILE = path.join(ROOT, 'batches', '.generate-checkpoint.json');
const EXIT_DAILY_QUOTA = 2;

function readCheckpointReason() {
  try {
    if (!fs.existsSync(CHECKPOINT_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    return data?.reason || null;
  } catch (_) {
    return null;
  }
}

function acquireLock() {
  if (fs.existsSync(LOCK_FILE)) {
    const ageMin = Math.round((Date.now() - fs.statSync(LOCK_FILE).mtimeMs) / 60000);
    if (ageMin < 120) {
      console.error(`\n⚠ Otra generación parece activa (lock ${ageMin} min).`);
      console.error('  Cierra la otra ventana CMD o borra batches\\.generate.lock\n');
      process.exit(1);
    }
    console.warn(`\nLock antiguo (${ageMin} min) — se reemplaza.\n`);
  }
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  fs.writeFileSync(LOCK_FILE, `${process.pid}\n${Date.now()}\n`, 'utf8');
  const release = () => {
    try {
      fs.unlinkSync(LOCK_FILE);
    } catch (_) {
      /* ignore */
    }
  };
  process.on('exit', release);
  process.on('SIGINT', () => {
    release();
    process.exit(130);
  });
}

function teeStream(chunk, logStream, prefix) {
  const text = chunk.toString();
  for (const line of text.split(/\n/)) {
    if (line) process.stdout.write(`${prefix}${line}\n`);
  }
  logStream.write(chunk);
}

function parseArgs(argv) {
  const out = {
    lang: 'de',
    level: 'B1',
    mode: 'gaps',
    target: 5,
    waveSize: 1,
    pauseMs: 1000,
    mergeAtEnd: true,
    dryRun: false,
    retries: 1,
    provider: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = argv[++i]?.toLowerCase();
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--mode') out.mode = argv[++i];
    else if (a === '--target') out.target = Math.max(1, Number(argv[++i]) || 5);
    else if (a === '--wave-size') out.waveSize = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--pause-ms') out.pauseMs = Math.max(0, Number(argv[++i]) || 0);
    else if (a === '--no-merge') out.mergeAtEnd = false;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--retries') out.retries = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--provider') out.provider = argv[++i]?.toLowerCase();
  }
  if (!out.provider) {
    out.provider = (process.env.GEN_PROVIDER || 'claude').trim().toLowerCase();
  }
  return out;
}

function jobLabel(job) {
  return job.teil != null ? `${job.module} T${job.teil}` : job.module;
}

function jobKey(job) {
  return job.teil != null ? `${job.module}:${job.teil}` : job.module;
}

function runNode(script, args, logFile) {
  return new Promise((resolve) => {
    if (!logFile) {
      const child = spawn(process.execPath, [script, ...args], {
        cwd: ROOT,
        env: process.env,
        stdio: 'inherit',
      });
      child.on('close', (code) => resolve(code ?? 1));
      return;
    }

    const logStream = fs.createWriteStream(logFile, { flags: 'w' });
    const prefix = `[${path.basename(logFile, '.log')}] `;
    const child = spawn(process.execPath, [script, ...args], {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => teeStream(chunk, logStream, prefix));
    child.stderr.on('data', (chunk) => teeStream(chunk, logStream, prefix));
    child.on('close', (code) => {
      logStream.end();
      resolve(code ?? 1);
    });
  });
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function writeCheckpoint(args, pending, completed) {
  fs.mkdirSync(path.dirname(CHECKPOINT_FILE), { recursive: true });
  fs.writeFileSync(
    CHECKPOINT_FILE,
    `${JSON.stringify(
      {
        lang: args.lang,
        level: args.level,
        target: args.target,
        mode: args.mode,
        pendingJobs: pending,
        completedJobs: completed,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

async function runJob(job, args, logSuffix = '') {
  const label = jobLabel(job).replace(/\s+/g, '-');
  const logFile = path.join(LOG_DIR, `${Date.now()}-${label}${logSuffix}.log`);
  const genArgs = [
    '--lang',
    args.lang,
    '--level',
    args.level,
    '--module',
    job.module,
    '--retries',
    String(args.retries),
  ];
  if (job.teil != null) genArgs.push('--teil', String(job.teil));
  if (args.provider) genArgs.push('--provider', args.provider);
  const t0 = Date.now();
  console.log(`\n  ▶ ${jobLabel(job)} — inicio`);
  const code = await runNode(path.join(ROOT, 'scripts', 'generate-batch-gemini.mjs'), genArgs, logFile);
  const sec = Math.round((Date.now() - t0) / 1000);
  console.log(`  ${code === 0 ? '✓' : code === EXIT_DAILY_QUOTA ? '⏸' : '✗'} ${jobLabel(job)} — ${sec}s\n`);
  return { job, code, logFile };
}

const args = parseArgs(process.argv.slice(2));
const jobs = getGenerationJobs(args.lang, args.level, { mode: args.mode, targetExams: args.target });

console.log(`\n=== Generación ${args.lang}/${args.level} · modo: ${args.mode} · target ${args.target} ===`);
if (!jobs.length) {
  console.log('Nada que generar — cobertura OK para el target.');
  console.log('Reanudación: vuelve a ejecutar el mismo comando; el modo gaps continúa donde lo dejaste.');
  process.exit(0);
}
console.log(`Jobs: ${jobs.length} | Oleadas: ${Math.ceil(jobs.length / args.waveSize)} | Reintentos/job: ${args.retries} | Proveedor: ${args.provider}`);
jobs.forEach((j) => console.log(`  · ${jobLabel(j)}${j.gap ? ` (gap ${j.gap})` : ''}`));
console.log(`Merge al final: ${args.mergeAtEnd ? 'sí' : 'no'}`);
console.log('Reanudación: vuelve a ejecutar el mismo comando; el modo gaps continúa donde lo dejaste.\n');

if (args.dryRun) {
  chunk(jobs, args.waveSize).forEach((wave, i) => {
    console.log(`Oleada ${i + 1}: ${wave.map(jobLabel).join(', ')}`);
  });
  process.exit(0);
}

fs.mkdirSync(LOG_DIR, { recursive: true });
acquireLock();

console.log('Una sola ventana CMD. Si la barra dice "Select", pulsa Esc.\n');

const results = { ok: 0, fail: 0 };
const failedJobs = [];
const completedJobs = [];
let dailyQuotaHit = false;
let budgetHit = false;
const waves = chunk(jobs, args.waveSize);
let globalIdx = 0;

for (let w = 0; w < waves.length && !dailyQuotaHit && !budgetHit; w++) {
  const wave = waves[w];
  console.log(`\n── Oleada ${w + 1}/${waves.length}: ${wave.map(jobLabel).join(' | ')} ──`);
  for (let i = 0; i < wave.length; i++) {
    if (i > 0) await sleep(args.pauseMs);
    const { job, code } = await runJob(wave[i], args);
    if (code === 0) {
      if (readCheckpointReason() === 'budget_exceeded') {
        budgetHit = true;
        writeCheckpoint(args, jobs.slice(globalIdx), completedJobs);
        console.log('\n⏸ Tope de gasto Claude alcanzado. Sube CLAUDE_BUDGET_USD y reanuda con:');
        console.log(`   npm run generate:b1:claude -- --target ${args.target}`);
        console.log(`   Checkpoint: batches/.generate-checkpoint.json\n`);
        break;
      }
      results.ok++;
      completedJobs.push(job);
    } else if (code === EXIT_DAILY_QUOTA) {
      dailyQuotaHit = true;
      writeCheckpoint(args, jobs.slice(globalIdx), completedJobs);
      console.log('\n⏸ Presupuesto diario de Gemini agotado. Reanuda mañana con:');
      console.log(`   npm run generate:b1:10 -- --target ${args.target}`);
      console.log(`   Checkpoint: batches/.generate-checkpoint.json (${jobs.length - globalIdx} jobs pendientes)\n`);
      break;
    } else {
      results.fail++;
      failedJobs.push(job);
      console.warn(`  ✗ ${jobLabel(job)} falló — ver batches/logs/`);
    }
    globalIdx++;
  }
  if (w < waves.length - 1 && args.pauseMs > 0 && !dailyQuotaHit && !budgetHit) {
    await sleep(args.pauseMs);
  }
}

if (!dailyQuotaHit && !budgetHit && failedJobs.length) {
  console.log(`\n── Reintento serial de ${failedJobs.length} job(s) (no cuota) ──`);
  const retryFailed = [];
  for (const job of failedJobs) {
    const { code } = await runJob(job, args, '-retry');
    if (code === 0) {
      results.ok++;
      results.fail--;
      completedJobs.push(job);
    } else if (code === EXIT_DAILY_QUOTA) {
      dailyQuotaHit = true;
      writeCheckpoint(args, retryFailed.concat(job, failedJobs.slice(failedJobs.indexOf(job) + 1)), completedJobs);
      console.log('\n⏸ Presupuesto diario agotado en reintento. Reanuda mañana con:');
      console.log(`   npm run generate:b1:10 -- --target ${args.target}\n`);
      break;
    } else if (code === 0 && readCheckpointReason() === 'budget_exceeded') {
      budgetHit = true;
      writeCheckpoint(args, retryFailed.concat(job, failedJobs.slice(failedJobs.indexOf(job) + 1)), completedJobs);
      console.log('\n⏸ Tope de gasto Claude en reintento. Sube CLAUDE_BUDGET_USD para continuar.\n');
      break;
    } else {
      retryFailed.push(job);
    }
  }
  failedJobs.length = 0;
  failedJobs.push(...retryFailed);
}

if (!dailyQuotaHit && !budgetHit) {
  console.log(`\nGeneración: ${results.ok} OK, ${results.fail} fallidos`);
}

if (args.mergeAtEnd && !dailyQuotaHit && !budgetHit && results.ok > 0) {
  console.log('\n── Montar banco + exámenes ──');
  const assembleCode = await runNode(
    path.join(ROOT, 'scripts', 'assemble-bank-pipeline.mjs'),
    ['--lang', args.lang, '--level', args.level, '--target', String(args.target), '--max', String(args.target)],
    null,
  );
  if (assembleCode !== 0) console.warn('Montaje terminó con errores — revisa batches/rejected/');
}

console.log('\nListo.');
process.exit(dailyQuotaHit || budgetHit ? 0 : results.fail ? 1 : 0);
