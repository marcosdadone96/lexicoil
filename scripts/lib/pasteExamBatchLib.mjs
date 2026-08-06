import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './loadEnv.mjs';
import {
  GENERATED_DIR,
  generatedDir,
  nextNumberedBatchBasename,
  listJsonInStagingRoot,
  normalizeLevel,
} from './batchPaths.mjs';
import { normalizeBatch } from './normalizeBatch.mjs';
import { tagBatchWithTopic } from './topicRotation.mjs';
import { finalizePoolReady } from './finalizePoolReady.mjs';
import { isSprechenA2PerTeil } from './examTemplatePrompt.mjs';
import { inferTeilFromBatch } from './extractJson.mjs';
import {
  parseValidateBatchErrors,
  parseSweepBlacklistErrors,
  parseAuditPass2Errors,
} from './gateReportFormat.mjs';

const GENERATED = GENERATED_DIR;

function generatedOutDir(level = 'B1') {
  const dir = generatedDir(level);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const MODULE_LIMITS = {
  horen: { minTeil: 1, maxTeil: 4 },
  schreiben: { minTeil: 1, maxTeil: 3, multiTeilBatch: true },
  sprechen: { minTeil: 1, maxTeil: 3, multiTeilBatch: true },
};

export function parsePasteArgs(argv) {
  const out = {
    lang: 'de',
    level: 'B1',
    module: null,
    teil: null,
    file: null,
    tag: 'gemini',
    outName: null,
    merge: false,
    ingest: false,
    publish: false,
    syncPool: false,
    continueOnError: false,
    defaultTeil: null,
    allowBankDup: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = argv[++i];
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--module') out.module = String(argv[++i]).toLowerCase();
    else if (a === '--teil') out.teil = Number(argv[++i]);
    else if (a === '--default-teil') out.defaultTeil = Number(argv[++i]);
    else if (a === '--file') out.file = argv[++i];
    else if (a === '--tag') out.tag = argv[++i];
    else if (a === '--out') out.outName = argv[++i];
    else if (a === '--merge') out.merge = true;
    else if (a === '--ingest') out.ingest = true;
    else if (a === '--publish') out.publish = true;
    else if (a === '--sync-pool') out.syncPool = true;
    else if (a === '--save-only') out.publish = false;
    else if (a === '--continue') out.continueOnError = true;
    else if (a === '--allow-bank-dup') out.allowBankDup = true;
  }
  if (out.publish) out.ingest = true;
  return out;
}

function validateBatchFile(lang, level, relFile, { allowBankDup = false } = {}) {
  const args = ['scripts/validate-batch.mjs', '--lang', lang, '--level', level, '--file', relFile];
  if (allowBankDup) args.push('--allow-dup');
  const res = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  return { ok: res.status === 0, output: `${res.stdout || ''}${res.stderr || ''}`.trim() };
}

function runNode(script, scriptArgs, { inherit = false } = {}) {
  const res = spawnSync(process.execPath, [script, ...scriptArgs], {
    cwd: ROOT,
    stdio: inherit ? 'inherit' : 'pipe',
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    const msg = `${res.stdout || ''}${res.stderr || ''}`.trim();
    throw new Error(msg || `Falló: node ${script}`);
  }
  return res;
}

export function inferModuleFromBatch(batch) {
  const mods = (batch?.questions || [])
    .map((q) => String(q?.module || '').toLowerCase())
    .filter(Boolean);
  if (!mods.length && batch?.passages?.length) {
    return String(batch.passages[0]?.module || '').toLowerCase() || null;
  }
  const counts = new Map();
  for (const m of mods) counts.set(m, (counts.get(m) || 0) + 1);
  let best = null;
  let bestN = 0;
  for (const [m, n] of counts) {
    if (n > bestN) {
      best = m;
      bestN = n;
    }
  }
  return best;
}

export function resolveExamContext(args, batch, teilHint) {
  const module = args.module || inferModuleFromBatch(batch);
  const limits = MODULE_LIMITS[module];
  if (!limits) {
    return { ok: false, errors: [`Módulo inválido o no detectado: ${module || '?'}`] };
  }

  const level = normalizeLevel(args.level || batch?.level || 'B1');
  const wantsMultiTeilBatch =
    limits.multiTeilBatch && !isSprechenA2PerTeil(module, level);

  let teil = args.teil ?? teilHint ?? args.defaultTeil ?? inferTeilFromBatch(batch);
  if (wantsMultiTeilBatch) {
    const teils = [...new Set((batch?.questions || []).map((q) => Number(q?.teil)).filter(Number.isFinite))];
    if (teils.length !== 3 || !teils.includes(1) || !teils.includes(2) || !teils.includes(3)) {
      return { ok: false, module, errors: [`${module}: se esperan 3 questions (teil 1, 2, 3)`] };
    }
    teil = null;
  } else if (!Number.isFinite(teil) || teil < limits.minTeil || teil > limits.maxTeil) {
    return { ok: false, module, errors: [`No se pudo determinar Teil (usa === TEIL N === o teil en JSON)`] };
  }

  const modInBatch = inferModuleFromBatch(batch);
  if (modInBatch && modInBatch !== module) {
    return { ok: false, module, teil, errors: [`module en JSON (${modInBatch}) ≠ --module ${module}`] };
  }

  return { ok: true, module, teil, errors: [] };
}

export function nextExamOutputBasename(module, teil, tag = 'gemini', level = 'B1') {
  fs.mkdirSync(GENERATED, { recursive: true });
  const lv = String(level || 'B1').trim().toUpperCase();
  const base =
    module === 'schreiben'
      ? `${module}-${tag}`
      : module === 'sprechen' && (lv === 'A2' || teil != null)
        ? `${module}-t${teil ?? 1}-${tag}`
        : module === 'sprechen'
          ? `${module}-${tag}`
          : `${module}-t${teil}-${tag}`;
  // Scans generated + pool-verified + ready staging/siblings (not only generated/).
  return nextNumberedBatchBasename(base);
}

export function validateExamBatch(batch, args, { teil: teilHint, label } = {}) {
  const ctx = resolveExamContext(args, batch, teilHint);
  const enrichCtx = ctx.ok
    ? {
        module: ctx.module,
        teil: ctx.teil ?? teilHint ?? args.teil,
        lang: args.lang,
        level: args.level,
      }
    : {
        module: args.module,
        teil: args.teil ?? teilHint,
        lang: args.lang,
        level: args.level,
      };
  const normalized = tagBatchWithTopic(normalizeBatch(batch, enrichCtx), null);
  const resolved = resolveExamContext(args, normalized, teilHint);
  if (!resolved.ok) {
    return { ok: false, label, module: resolved.module, teil: resolved.teil, errors: resolved.errors };
  }
  if (!normalized?.questions?.length) {
    return { ok: false, label, module: resolved.module, teil: resolved.teil, errors: ['JSON sin array questions'] };
  }

  fs.mkdirSync(GENERATED, { recursive: true });
  const tmpPath = path.join(GENERATED, `.tmp-validate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
  fs.writeFileSync(tmpPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  const relTmp = path.relative(ROOT, tmpPath).replace(/\\/g, '/');
  const header = label ? `[${label}] ` : '';

  try {
    console.log(`${header}── Validación técnica (validate-batch) ──`);
    const v = validateBatchFile(args.lang, args.level, relTmp, { allowBankDup: args.allowBankDup });
    console.log(v.output || (v.ok ? 'OK' : 'FAIL'));
    if (!v.ok) {
      return {
        ok: false,
        label,
        module: resolved.module,
        teil: resolved.teil,
        errors: parseValidateBatchErrors(v.output),
      };
    }

    console.log(`${header}── Léxico C1/C2 (sweep-blacklist) ──`);
    const blResult = spawnSync(
      process.execPath,
      [path.join(ROOT, 'scripts', 'sweep-blacklist.mjs'), relTmp],
      { cwd: ROOT, encoding: 'utf8' },
    );
    const blOut = `${blResult.stdout || ''}${blResult.stderr || ''}`.trim();
    if (blResult.status !== 0) {
      console.log(blOut || 'FAIL léxico');
      return {
        ok: false,
        label,
        module: resolved.module,
        teil: resolved.teil,
        errors: parseSweepBlacklistErrors(blOut),
      };
    }

    console.log(`${header}── Auditoría pedagógica (audit-pass-2 --fail-on=IMPORTANT) ──`);
    const auditResult = spawnSync(
      process.execPath,
      [path.join(ROOT, 'scripts', 'audit-pass-2.mjs'), relTmp, '--fail-on=IMPORTANT', '--json'],
      { cwd: ROOT, encoding: 'utf8' },
    );
    const auditOut = `${auditResult.stdout || ''}${auditResult.stderr || ''}`.trim();
    if (auditOut && auditResult.status === 0) {
      try {
        const summary = JSON.parse(auditOut);
        if (summary.summary?.important || summary.summary?.critical) {
          console.log(`  CRÍTICOS: ${summary.summary.critical} · IMPORTANTES: ${summary.summary.important}`);
        }
      } catch (_) {
        console.log(auditOut.slice(0, 500));
      }
    } else if (auditOut) {
      console.log(auditOut.slice(0, 800));
    }
    if (auditResult.status !== 0) {
      return {
        ok: false,
        label,
        module: resolved.module,
        teil: resolved.teil,
        errors: parseAuditPass2Errors(auditOut, 'IMPORTANT'),
      };
    }

    return { ok: true, label, module: resolved.module, teil: resolved.teil, batch: normalized, errors: [] };
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch (_) {
      /* ignore */
    }
  }
}

function saveBatch(batch, args, { module, teil, tag, outName } = {}) {
  const basename = outName
    ? `${outName.replace(/\.json$/i, '')}.json`
    : nextExamOutputBasename(module, teil, tag || args.tag, args.level);
  const outPath = path.join(generatedOutDir(args.level), basename);
  fs.writeFileSync(outPath, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  return {
    basename,
    outPath,
    relFile: path.relative(ROOT, outPath).replace(/\\/g, '/'),
  };
}

function ingestBatch(args, relFile) {
  console.log('── Ingest + auto-approve ──');
  runNode('scripts/ingest-to-staging.mjs', [
    '--lang', args.lang,
    '--level', args.level,
    '--file', relFile,
    '--auto-approve',
  ], { inherit: true });
}

function promoteApproved(args) {
  console.log('── Promote approved → banco ──');
  runNode('scripts/promote-approved.mjs', [
    '--lang', args.lang,
    '--level', args.level,
  ], { inherit: true });
}

export function syncExamPool(args) {
  console.log('\n══ Sync pool Netlify (seed + vocab) ══\n');
  runNode('scripts/seed-reusable-from-bank.mjs', [
    '--lang', args.lang,
    '--level', args.level,
    '--apply',
  ], { inherit: true });
  runNode('scripts/enrich-reusable-vocab.mjs', [
    '--lang', args.lang,
    '--level', args.level,
    '--apply',
  ], { inherit: true });
}

export async function processExamBatch(batch, args, { teil: teilHint, tag, outName, label } = {}) {
  const check = validateExamBatch(batch, args, { teil: teilHint, label });
  if (!check.ok) {
    console.log(`${label ? `[${label}] ` : ''}❌ No guardado (falló validación)`);
    return { ok: false, label: check.label, module: check.module, teil: check.teil, errors: check.errors };
  }

  const toSave = check.batch || normalizeBatch(batch);
  const { relFile } = saveBatch(toSave, args, {
    module: check.module,
    teil: check.teil,
    tag,
    outName,
  });
  const header = label ? `[${label}] ` : '';
  const teilLabel = check.teil != null ? `Teil ${check.teil}` : 'Teile 1–3';
  console.log(`${header}✅ Guardado: ${relFile} (${check.module} ${teilLabel})`);

  if (!args.skipPoolReady) {
    try {
      const abs = path.join(ROOT, relFile);
      await finalizePoolReady(abs, toSave);
    } catch (err) {
      console.warn(`${header}[poolReady] aviso: ${err.message}`);
    }
  }

  if (args.merge) {
    runNode('scripts/merge-bank-batch.mjs', [
      '--lang', args.lang,
      '--level', args.level,
      '--file', relFile,
    ], { inherit: true });
  } else if (args.ingest) {
    ingestBatch(args, relFile);
    if (args.publish) promoteApproved(args);
  }

  return { ok: true, label, module: check.module, teil: check.teil, relFile, errors: [] };
}

export function publishExamBatchFile(relFile, args, { label } = {}) {
  const abs = path.isAbsolute(relFile) ? relFile : path.join(ROOT, relFile);
  if (!fs.existsSync(abs)) {
    return { ok: false, label, relFile, errors: [`No existe: ${relFile}`] };
  }
  const norm = path.relative(ROOT, abs).replace(/\\/g, '/');
  let batch;
  try {
    batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (err) {
    return { ok: false, label, relFile: norm, errors: [`JSON inválido: ${err.message}`] };
  }

  const check = validateExamBatch(batch, args, {
    teil: args.teil ?? inferTeilFromBatch(batch),
    label,
  });
  if (!check.ok) {
    console.log(`${label ? `[${label}] ` : ''}❌ No publicado (falló validación)`);
    return { ok: false, label, module: check.module, teil: check.teil, relFile: norm, errors: check.errors };
  }

  const header = label ? `[${label}] ` : '';
  const teilLabel = check.teil != null ? `Teil ${check.teil}` : 'Teile 1–3';
  console.log(`${header}✅ Válido: ${norm} (${check.module} ${teilLabel})`);

  if (args.publish || args.ingest) {
    ingestBatch(args, norm);
    if (args.publish) promoteApproved(args);
  }

  return {
    ok: true,
    label,
    module: check.module,
    teil: check.teil,
    relFile: norm,
    errors: [],
  };
}

export function listGeneratedExamFiles({ module, teil, tag = 'gemini', level = 'B1' } = {}) {
  const lv = normalizeLevel(level);
  const base =
    module === 'schreiben' || module === 'sprechen'
      ? `${module}-${tag}`
      : `${module}-t${teil}-${tag}`;
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+\\.json$`, 'i');
  const dirs = [generatedDir(lv), GENERATED_DIR];
  const names = new Set();
  for (const dir of dirs) {
    for (const abs of listJsonInStagingRoot(dir)) {
      const name = path.basename(abs);
      if (re.test(name)) names.add(name);
    }
  }
  return [...names]
    .sort((a, b) => {
      const na = Number(a.match(/-(\d+)\.json$/i)?.[1] || 0);
      const nb = Number(b.match(/-(\d+)\.json$/i)?.[1] || 0);
      return na - nb;
    })
    .map((name) => path.join('batches', 'generated', lv, name).replace(/\\/g, '/'));
}
