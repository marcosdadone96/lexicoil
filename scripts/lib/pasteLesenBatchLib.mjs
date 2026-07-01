import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './loadEnv.mjs';
import { inferTeilFromBatch } from './extractJson.mjs';
import { nextOutputBasename } from './lesenTemplatePrompt.mjs';
import { checkLesenBatchQuality, formatQualityReport } from './lesenBatchQuality.mjs';
import { checkHorenBatchQuality, formatHorenQualityReport } from './horenBatchQuality.mjs';
import {
  checkPromptBatchQuality,
  formatPromptQualityReport,
} from './promptBatchQuality.mjs';
import { checkLesenBatchIngest, formatIngestReport } from './lesenBatchIngestCheck.mjs';

const GENERATED = path.join(ROOT, 'batches', 'generated');

export function parsePasteArgs(argv) {
  const out = {
    lang: 'de',
    level: 'B1',
    teil: null,
    file: null,
    tag: 'pasted',
    outName: null,
    merge: false,
    ingest: false,
    publish: false,
    syncPool: false,
    skipQuality: false,
    skipIngest: false,
    continueOnError: false,
    defaultTeil: null,
    allowBankDup: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = argv[++i];
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
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
    else if (a === '--skip-quality') out.skipQuality = true;
    else if (a === '--skip-ingest') out.skipIngest = true;
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

export function resolveTeil(explicitTeil, batchTeil, defaultTeil) {
  const t = explicitTeil ?? batchTeil ?? defaultTeil;
  if (!Number.isFinite(t) || t < 1 || t > 5) return null;
  return t;
}

function inferModuleFromBatch(batch) {
  const fromQ = batch?.questions?.find((q) => q.module)?.module;
  if (fromQ) return String(fromQ).toLowerCase();
  const fromP = batch?.passages?.find((p) => p.module)?.module;
  if (fromP) return String(fromP).toLowerCase();
  return 'lesen';
}

function runModuleQualityCheck(batch, module, teil, args) {
  const mod = String(module || 'lesen').toLowerCase();
  if (mod === 'lesen') {
    const quality = checkLesenBatchQuality(batch, teil);
    return { quality, report: formatQualityReport(quality), label: `Lesen T${teil}` };
  }
  if (mod === 'horen') {
    const quality = checkHorenBatchQuality(batch, teil);
    return { quality, report: formatHorenQualityReport(quality, teil), label: `Hören T${teil}` };
  }
  if (mod === 'schreiben' || mod === 'sprechen') {
    const quality = checkPromptBatchQuality(batch, mod, teil, {
      lang: args.lang,
      level: args.level,
    });
    return {
      quality,
      report: formatPromptQualityReport(quality, mod, teil),
      label: `${mod} T${teil}`,
    };
  }
  return {
    quality: { ok: true, issues: [], warnings: [] },
    report: `Calidad ${mod}: sin checker — omitido`,
    label: mod,
  };
}

/**
 * Valida las 3 puertas SIN guardar en generated/. Usa archivo temporal que se borra siempre.
 */
export function validateLesenBatch(batch, args, { teil: teilHint, label } = {}) {
  const errors = [];
  const teil = resolveTeil(args.teil, teilHint, args.defaultTeil);
  if (!teil) {
    return {
      ok: false,
      label,
      errors: ['No se pudo determinar el Teil (usa === TEIL N ===, teil en JSON o --teil)'],
    };
  }
  if (!batch?.questions?.length) {
    return { ok: false, label, teil, errors: ['JSON sin array questions'] };
  }

  const module = inferModuleFromBatch(batch);

  fs.mkdirSync(GENERATED, { recursive: true });
  const tmpPath = path.join(GENERATED, `.tmp-validate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
  fs.writeFileSync(tmpPath, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  const relTmp = path.relative(ROOT, tmpPath).replace(/\\/g, '/');

  const header = label ? `[${label}] ` : '';
  try {
    console.log(`${header}── Validación técnica ──`);
    const v = validateBatchFile(args.lang, args.level, relTmp, {
      allowBankDup: args.allowBankDup,
    });
    console.log(v.output || (v.ok ? 'OK' : 'FAIL'));
    if (!v.ok) {
      errors.push('Validación técnica falló');
      return { ok: false, label, teil, errors };
    }

    if (!args.skipQuality) {
      console.log(`${header}── Calidad pedagógica (${module}) ──`);
      const { quality, report } = runModuleQualityCheck(batch, module, teil, args);
      console.log(report);
      if (!quality.ok) {
        errors.push('Calidad pedagógica falló');
        return { ok: false, label, teil, module, errors };
      }
    }

    if (!args.skipIngest && module === 'lesen') {
      console.log(`${header}── Pre-ingest CEFR ──`);
      const ingest = checkLesenBatchIngest(batch, {
        lang: args.lang,
        level: args.level,
        batchId: 'validate-tmp',
      });
      console.log(formatIngestReport(ingest));
      if (!ingest.ok) {
        errors.push('Pre-ingest CEFR falló');
        return { ok: false, label, teil, errors };
      }
    }

    return { ok: true, label, teil, module, errors: [] };
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch (_) {
      /* ignore */
    }
  }
}

function saveBatch(batch, args, { teil, tag, outName } = {}) {
  const fileTag = tag || args.tag;
  const basename = outName
    ? `${outName.replace(/\.json$/i, '')}.json`
    : nextOutputBasename(teil, fileTag);
  const outPath = path.join(GENERATED, basename);
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

export function syncLesenPool(args) {
  console.log('\n══ Sync pool Netlify (seed + vocab) ══\n');
  runNode('scripts/seed-reusable-from-bank.mjs', [
    '--lang', args.lang,
    '--level', args.level,
    '--apply',
    '--quality-gate',
  ], { inherit: true });
  runNode('scripts/enrich-reusable-vocab.mjs', [
    '--lang', args.lang,
    '--level', args.level,
    '--apply',
  ], { inherit: true });
}

/**
 * Valida → guarda solo si OK → opcional ingest/publish.
 */
export function processLesenBatch(batch, args, { teil: teilHint, tag, outName, label } = {}) {
  const check = validateLesenBatch(batch, args, { teil: teilHint, label });
  if (!check.ok) {
    console.log(`${label ? `[${label}] ` : ''}❌ No guardado (falló validación)`);
    return { ok: false, label: check.label, teil: check.teil, errors: check.errors };
  }

  const { basename, outPath, relFile } = saveBatch(batch, args, {
    teil: check.teil,
    tag,
    outName,
  });
  const header = label ? `[${label}] ` : '';
  console.log(`${header}✅ Guardado: ${relFile} (Teil ${check.teil})`);

  if (args.merge) {
    console.log('── Fusionando al banco (merge directo) ──');
    runNode('scripts/merge-bank-batch.mjs', [
      '--lang', args.lang,
      '--level', args.level,
      '--file', relFile,
    ], { inherit: true });
  } else if (args.ingest) {
    ingestBatch(args, relFile);
    if (args.publish) {
      promoteApproved(args);
    }
  }

  return {
    ok: true,
    label,
    teil: check.teil,
    relFile,
    basename,
    errors: [],
  };
}

function ingestAndPromote(args, relFile) {
  ingestBatch(args, relFile);
  if (args.publish) promoteApproved(args);
}

/**
 * Valida un archivo ya guardado en batches/generated/ e ingiere al banco (sin copiar de nuevo).
 */
export function publishLesenBatchFile(relFile, args, { label } = {}) {
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

  const check = validateLesenBatch(batch, args, {
    teil: args.teil ?? inferTeilFromBatch(batch),
    label,
  });
  if (!check.ok) {
    console.log(`${label ? `[${label}] ` : ''}❌ No publicado (falló validación)`);
    return { ok: false, label, teil: check.teil, relFile: norm, errors: check.errors };
  }

  const header = label ? `[${label}] ` : '';
  console.log(`${header}✅ Válido: ${norm} (Teil ${check.teil})`);

  if (args.publish || args.ingest) {
    ingestAndPromote(args, norm);
  }

  return {
    ok: true,
    label,
    teil: check.teil,
    relFile: norm,
    errors: [],
  };
}

export function listGeneratedLesenFiles({ teil, tag = null } = {}) {
  fs.mkdirSync(GENERATED, { recursive: true });
  const re = tag
    ? new RegExp(`^lesen-t${teil}-${tag}-\\d+\\.json$`, 'i')
    : new RegExp(`^lesen-t${teil}-.+\\.json$`, 'i');
  return fs
    .readdirSync(GENERATED)
    .filter((name) => re.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/-(\d+)\.json$/i)?.[1] || 0);
      const nb = Number(b.match(/-(\d+)\.json$/i)?.[1] || 0);
      return na - nb;
    })
    .map((name) => path.join('batches', 'generated', name).replace(/\\/g, '/'));
}
