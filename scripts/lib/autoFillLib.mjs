import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { ROOT } from './loadEnv.mjs';
import { generateContent, DailyQuotaError } from './geminiClient.mjs';
import { extractJson } from './extractJson.mjs';
import { resolveMaxOutputTokens, isLikelyTruncated } from './genOutputTokens.mjs';
import { buildExamPrompt } from './examTemplatePrompt.mjs';
import {
  buildLesenPrompt,
  nextOutputBasename,
  pickTargetWords,
} from './lesenTemplatePrompt.mjs';
import { checkLesenBatchQuality, formatQualityReport } from './lesenBatchQuality.mjs';
import { checkLesenBatchIngest, formatIngestReport } from './lesenBatchIngestCheck.mjs';
import {
  nextExamOutputBasename,
  validateExamBatch,
} from './pasteExamBatchLib.mjs';
import { normalizeBatch } from './normalizeBatch.mjs';

export { DailyQuotaError };

export const GENERATED_DIR = path.join(ROOT, 'batches', 'generated');
export const CHECKPOINT_FILE = path.join(ROOT, 'batches', '.auto-fill-checkpoint.json');
export const EXIT_DAILY_QUOTA = 2;

/** Perfiles probados en producción (plantilla + validate-batch). */
export const AUTO_FILL_PROFILES = {
  'horen:t2': {
    module: 'horen',
    teil: 2,
    kind: 'exam',
    defaultTarget: 11,
    rotateEvery: 5,
    label: 'Hören Teil 2',
  },
  'horen:t3': {
    module: 'horen',
    teil: 3,
    kind: 'exam',
    defaultTarget: 10,
    rotateEvery: 5,
    label: 'Hören Teil 3',
  },
  schreiben: {
    module: 'schreiben',
    teil: null,
    kind: 'exam',
    defaultTarget: 5,
    rotateEvery: 3,
    label: 'Schreiben Teile 1–3',
  },
  sprechen: {
    module: 'sprechen',
    teil: null,
    kind: 'exam',
    defaultTarget: 4,
    rotateEvery: 3,
    label: 'Sprechen Teile 1–3',
  },
  'lesen:t5': {
    module: 'lesen',
    teil: 5,
    kind: 'lesen',
    defaultTarget: 4,
    rotateEvery: 5,
    label: 'Lesen Teil 5',
  },
  'lesen:t1': {
    module: 'lesen',
    teil: 1,
    kind: 'lesen',
    defaultTarget: 10,
    rotateEvery: 5,
    label: 'Lesen Teil 1',
  },
};

export function parseAutoFillArgs(argv) {
  const out = {
    profile: null,
    module: null,
    teil: null,
    lang: 'de',
    level: 'B1',
    target: null,
    rotateEvery: null,
    wordCount: 10,
    tag: 'gemini',
    dryRun: false,
    resume: true,
    resetCheckpoint: false,
    verifyExam: false,
    publish: false,
    apiRetries: 3,
    fixRetries: 2,
    pauseMs: Number(process.env.GEMINI_BATCH_PAUSE_MS || 5000),
    maxAttempts: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--profile') out.profile = String(argv[++i] || '').toLowerCase();
    else if (a === '--module') out.module = String(argv[++i] || '').toLowerCase();
    else if (a === '--teil') out.teil = Number(argv[++i]);
    else if (a === '--lang') out.lang = String(argv[++i]).toLowerCase();
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--target') out.target = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--rotate-every') out.rotateEvery = Math.max(1, Number(argv[++i]) || 5);
    else if (a === '--word-count') out.wordCount = Math.max(1, Number(argv[++i]) || 10);
    else if (a === '--tag') out.tag = String(argv[++i] || 'gemini');
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--no-resume') out.resume = false;
    else if (a === '--reset') out.resetCheckpoint = true;
    else if (a === '--verify-exam') out.verifyExam = true;
    else if (a === '--publish') out.publish = true;
    else if (a === '--api-retries') out.apiRetries = Math.max(1, Number(argv[++i]) || 3);
    else if (a === '--fix-retries') out.fixRetries = Math.max(0, Number(argv[++i]) || 2);
    else if (a === '--pause-ms') out.pauseMs = Math.max(0, Number(argv[++i]) || 0);
    else if (a === '--max-attempts') out.maxAttempts = Math.max(1, Number(argv[++i]) || 1);
  }
  return out;
}

export function resolveProfile(args) {
  if (args.profile) {
    const profile = AUTO_FILL_PROFILES[args.profile];
    if (!profile) {
      const keys = Object.keys(AUTO_FILL_PROFILES).join(', ');
      throw new Error(`Perfil desconocido: ${args.profile}. Usa: ${keys}`);
    }
    return {
      key: args.profile,
      ...profile,
      target: args.target ?? profile.defaultTarget,
      rotateEvery: args.rotateEvery ?? profile.rotateEvery,
    };
  }

  if (!args.module) {
    throw new Error('Indica --profile (p. ej. horen:t3) o --module + --teil');
  }

  const mod = args.module;
  if (mod === 'horen') {
    if (!Number.isFinite(args.teil) || args.teil < 1 || args.teil > 4) {
      throw new Error('Hören requiere --teil 1..4');
    }
    if (args.teil !== 2 && args.teil !== 3) {
      throw new Error('Automatización solo para Hören T2/T3 (seguros). Usa upload manual para T1/T4.');
    }
    const key = `horen:t${args.teil}`;
    return {
      key,
      ...AUTO_FILL_PROFILES[key],
      target: args.target ?? AUTO_FILL_PROFILES[key].defaultTarget,
      rotateEvery: args.rotateEvery ?? AUTO_FILL_PROFILES[key].rotateEvery,
    };
  }

  if (mod === 'schreiben' || mod === 'sprechen') {
    const key = mod;
    return {
      key,
      ...AUTO_FILL_PROFILES[key],
      target: args.target ?? AUTO_FILL_PROFILES[key].defaultTarget,
      rotateEvery: args.rotateEvery ?? AUTO_FILL_PROFILES[key].rotateEvery,
    };
  }

  if (mod === 'lesen') {
    if (!Number.isFinite(args.teil) || ![1, 5].includes(args.teil)) {
      throw new Error('Lesen auto solo T1 o T5 (--teil 1 o 5)');
    }
    const key = `lesen:t${args.teil}`;
    return {
      key,
      ...AUTO_FILL_PROFILES[key],
      target: args.target ?? AUTO_FILL_PROFILES[key].defaultTarget,
      rotateEvery: args.rotateEvery ?? AUTO_FILL_PROFILES[key].rotateEvery,
    };
  }

  throw new Error(`Módulo no soportado: ${mod}`);
}

export function profileCheckpointKey(profile, args) {
  return `${args.lang}_${args.level}:${profile.key}:${args.tag}`;
}

export function loadCheckpoint(key) {
  if (!fs.existsSync(CHECKPOINT_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    if (data?.key !== key) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveCheckpoint(data) {
  fs.mkdirSync(path.dirname(CHECKPOINT_FILE), { recursive: true });
  fs.writeFileSync(CHECKPOINT_FILE, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function clearCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
  } catch {
    /* ignore */
  }
}

export function refreshVocabReport(lang, level) {
  console.log('\n🔄 Actualizando cobertura de vocabulario (weak lemas)…');
  execSync(`node scripts/vocab-coverage-report.mjs --lang ${lang} --level ${level}`, {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

export function pickWordsForPart(args) {
  return pickTargetWords({
    lang: args.lang,
    level: args.level,
    count: args.wordCount,
    source: 'auto',
    safe: true,
  });
}

export function buildPromptForPart(profile, words, idSuffix) {
  if (profile.kind === 'lesen') {
    return buildLesenPrompt(profile.teil, words, { idSuffix });
  }
  return buildExamPrompt(profile.module, profile.teil ?? 1, words, { idSuffix });
}

export function nextBasenameForProfile(profile, tag = 'gemini') {
  if (profile.kind === 'lesen') {
    return nextOutputBasename(profile.teil, tag);
  }
  return nextExamOutputBasename(profile.module, profile.teil, tag);
}

function validateBatchFile(lang, level, relFile) {
  const res = spawnSync(
    process.execPath,
    ['scripts/validate-batch.mjs', '--lang', lang, '--level', level, '--file', relFile],
    { cwd: ROOT, encoding: 'utf8' },
  );
  return { ok: res.status === 0, output: `${res.stdout || ''}${res.stderr || ''}`.trim() };
}

function buildFixNote(validationOutput, previousError) {
  const parts = [];
  if (previousError) parts.push(`Error de generación anterior: ${previousError}`);
  if (validationOutput) {
    parts.push('La validación falló con estos problemas:');
    parts.push(validationOutput);
  }
  parts.push(
    'Corrige SOLO esos problemas. Devuelve el JSON completo corregido, sin markdown ni comentarios.',
  );
  return `\n\n--- CORRECCIÓN REQUERIDA ---\n${parts.join('\n')}`;
}

function examPasteArgs(args, profile) {
  return {
    lang: args.lang,
    level: args.level,
    module: profile.module,
    teil: profile.teil ?? undefined,
    tag: args.tag,
    allowBankDup: true,
  };
}

function validateLesenBatch(batch, profile, args, basename) {
  const relFile = path.relative(ROOT, path.join(GENERATED_DIR, basename)).replace(/\\/g, '/');
  const validation = validateBatchFile(args.lang, args.level, relFile);
  if (!validation.ok) {
    return { ok: false, output: validation.output, stage: 'validate-batch' };
  }

  const quality = checkLesenBatchQuality(batch, profile.teil);
  if (!quality.ok) {
    return { ok: false, output: formatQualityReport(quality), stage: 'quality' };
  }

  const ingest = checkLesenBatchIngest(batch, {
    lang: args.lang,
    level: args.level,
    batchId: basename,
  });
  if (!ingest.ok) {
    return { ok: false, output: formatIngestReport(ingest), stage: 'ingest' };
  }

  return { ok: true, batch };
}

function validateExamPartBatch(batch, profile, args) {
  const check = validateExamBatch(batch, examPasteArgs(args, profile), {
    teil: profile.teil ?? undefined,
    label: profile.label,
  });
  if (!check.ok) {
    return {
      ok: false,
      output: (check.errors || []).join('\n'),
      stage: 'validate-batch',
    };
  }
  return { ok: true, batch: check.batch || normalizeBatch(batch) };
}

function removeFileQuietly(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

export async function generateOnePart(ctx) {
  const { args, profile, words, partIndex, savedSoFar } = ctx;
  const idSuffix = randomBytes(4).toString('hex');
  let prompt = buildPromptForPart(profile, words, idSuffix);
  const basename = nextBasenameForProfile(profile, args.tag);
  const outFile = path.join(GENERATED_DIR, basename);
  const relFile = path.relative(ROOT, outFile).replace(/\\/g, '/');

  const moduleForTokens = profile.kind === 'lesen' ? 'lesen' : profile.module;
  const teilForTokens = profile.kind === 'lesen' ? profile.teil : profile.teil ?? 1;
  const maxTokens = resolveMaxOutputTokens('gemini', moduleForTokens, teilForTokens);

  console.log(`\n── ${profile.label} · ${basename} · parte ${partIndex} (${savedSoFar}/${ctx.target} OK) ──`);
  console.log(`Palabras (${words.length}): ${words.join(', ')}`);
  console.log(`max_output_tokens=${maxTokens}`);

  if (args.dryRun) {
    console.log('\n[dry-run] Prompt (1200 chars):\n');
    console.log(prompt.slice(0, 1200) + (prompt.length > 1200 ? '…' : ''));
    console.log(`\n[dry-run] Se guardaría en: ${relFile}`);
    return { ok: true, dryRun: true, file: relFile, basename, words };
  }

  let lastApiError = null;

  for (let fix = 0; fix <= args.fixRetries; fix++) {
    if (fix > 0) {
      console.log(`\nReintento corrección ${fix}/${args.fixRetries}…`);
      removeFileQuietly(outFile);
    }

    let text;
    let usage;
    let stopReason;

    for (let attempt = 1; attempt <= args.apiRetries; attempt++) {
      try {
        if (attempt > 1) console.log(`Reintento API ${attempt}/${args.apiRetries}…`);
        console.log('Llamando Gemini…');
        const result = await generateContent({ prompt, maxTokens, jsonMode: true });
        text = result.text;
        usage = result.usage;
        stopReason = result.stopReason;
        lastApiError = null;
        break;
      } catch (err) {
        if (err instanceof DailyQuotaError || err?.name === 'DailyQuotaError') throw err;
        lastApiError = err;
        console.error(`Error API: ${err.message}`);
        if (attempt >= args.apiRetries) throw err;
      }
    }

    if (isLikelyTruncated('gemini', usage, maxTokens, stopReason)) {
      const msg = `JSON truncado (max_output_tokens=${maxTokens})`;
      if (fix < args.fixRetries) {
        prompt += buildFixNote('', msg);
        continue;
      }
      throw new Error(msg);
    }

    let batch;
    try {
      batch = extractJson(text);
    } catch (err) {
      if (fix < args.fixRetries) {
        prompt += buildFixNote('', err.message);
        continue;
      }
      throw err;
    }

    if (!batch || typeof batch !== 'object' || !Array.isArray(batch.questions)) {
      const msg = 'JSON raíz inválido (falta array questions)';
      if (fix < args.fixRetries) {
        prompt += buildFixNote('', msg);
        continue;
      }
      throw new Error(msg);
    }

    batch = normalizeBatch(batch, {
      module: profile.module,
      teil: profile.teil,
      lang: args.lang,
      level: args.level,
    });
    fs.mkdirSync(GENERATED_DIR, { recursive: true });
    fs.writeFileSync(outFile, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
    console.log(
      `Borrador: ${relFile} (${batch.questions.length} preguntas, ${(batch.passages || []).length} passages)`,
    );

    let validation;
    if (profile.kind === 'lesen') {
      validation = validateLesenBatch(batch, profile, args, basename);
    } else {
      validation = validateExamPartBatch(batch, profile, args);
    }

    if (!validation.ok) {
      console.error(validation.output || `Falló ${validation.stage}`);
      if (fix < args.fixRetries) {
        prompt += buildFixNote(validation.output, lastApiError?.message);
        continue;
      }
      removeFileQuietly(outFile);
      throw new Error(`Validación fallida tras ${args.fixRetries} reintentos (${validation.stage})`);
    }

    console.log(`✅ Guardado y validado: ${relFile}`);
    return { ok: true, file: relFile, basename, words, batch: validation.batch || batch };
  }

  throw lastApiError || new Error('Generación fallida');
}

export function publishGeneratedFiles(args, profile, files) {
  if (!files.length) return { ok: true, published: 0 };
  console.log(`\n══ Publicando ${files.length} lote(s) al banco ══\n`);
  let published = 0;
  const errors = [];

  for (const relFile of files) {
    const script =
      profile.kind === 'lesen'
        ? 'scripts/publish-lesen-generated.mjs'
        : 'scripts/publish-exam-generated.mjs';
    const scriptArgs =
      profile.kind === 'lesen'
        ? [
            '--teil', String(profile.teil),
            '--tag', args.tag,
            '--continue',
            '--publish',
            '--allow-bank-dup',
            '--file', relFile,
          ]
        : [
            '--module', profile.module,
            ...(profile.teil != null ? ['--teil', String(profile.teil)] : []),
            '--tag', args.tag,
            '--continue',
            '--publish',
            '--allow-bank-dup',
            '--file', relFile,
          ];

    const res = spawnSync(process.execPath, [script, ...scriptArgs], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'inherit',
    });
    if (res.status === 0) published++;
    else errors.push(relFile);
  }

  return { ok: errors.length === 0, published, errors };
}

export function runVerifyExam(extraArgs = []) {
  console.log('\n══ Verificación de examen completo B1 ══\n');
  const res = spawnSync(process.execPath, ['scripts/verify-sample-exam.mjs', ...extraArgs], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  return res.status === 0;
}
