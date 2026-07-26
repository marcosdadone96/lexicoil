/**
 * analyzeInboxLib.mjs — validación read-only de batches (mismas puertas que paste-*-inbox).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { ROOT } from './loadEnv.mjs';
import { inferTeilFromBatch } from './extractJson.mjs';
import { normalizeBatch } from './normalizeBatch.mjs';
import { tagBatchWithTopic } from './topicRotation.mjs';
import { generatedDir } from './batchPaths.mjs';
import {
  inferModuleFromBatch,
} from './pasteExamBatchLib.mjs';
import {
  resolveTeil,
} from './pasteLesenBatchLib.mjs';
import { checkLesenBatchQuality, formatQualityReport } from './lesenBatchQuality.mjs';
import { checkHorenBatchQuality, formatHorenQualityReport } from './horenBatchQuality.mjs';
import {
  checkPromptBatchQuality,
  formatPromptQualityReport,
} from './promptBatchQuality.mjs';
import {
  maybeNormalizeManualLesenBatch,
  assertManualPublishPositionGates,
} from './manualPublishNormalize.mjs';
import {
  checkLesenBatchIngest,
  ingestErrorsForSummary,
  formatCefrMetricsSummary,
} from './lesenBatchIngestCheck.mjs';
import {
  parseValidateBatchErrors,
  parseSweepBlacklistErrors,
  parseAuditPass2Errors,
} from './gateReportFormat.mjs';
import { BLACKLIST, B2_QUESTION_BLACKLIST, B1_QUESTION_BLACKLIST } from '../blacklist.mjs';

const require = createRequire(import.meta.url);
const { normalizeB1Topic } = require(path.join(ROOT, 'js/data/b1Topics.js'));

const EXAM_MODULES = new Set(['horen', 'schreiben', 'sprechen']);
const READING_MODULES = new Set(['lesen']);

/** Patrones conocidos → sugerencia manual (--fix-suggestions). */
const FIX_PATTERNS = [
  ...B2_QUESTION_BLACKLIST.map((e) => ({ ...e, reason: 'Vocabulario B2+ (CHK-6)' })),
  ...BLACKLIST.map((e) => ({ ...e, reason: 'Léxico C1/C2 (sweep-blacklist)' })),
  ...B1_QUESTION_BLACKLIST.map((e) => ({ ...e, reason: 'Vocabulario B1+ en A2 (CHK-6c)' })),
  { term: /\[Name\]/gi, suggestion: 'Herr/Frau + Apellido concreto (ej. Herr Müller)', reason: 'Placeholder prohibido' },
  { term: /\[NAME\]/gi, suggestion: 'Herr/Frau + Apellido concreto', reason: 'Placeholder prohibido' },
  {
    term: /\bcirca\s*80\b|\bca\.?\s*80\s*w[öo]rter/i,
    suggestion: 'A2: «20–30 Wörter» (SMS) o «30–40 Wörter» (E-Mail) — no «circa 80»',
    reason: 'Longitud A2 mal indicada',
    levelHint: 'A2',
  },
];

function spawnNode(scriptArgs) {
  const res = spawnSync(process.execPath, scriptArgs, { cwd: ROOT, encoding: 'utf8' });
  return {
    ok: res.status === 0,
    status: res.status ?? 1,
    output: `${res.stdout || ''}${res.stderr || ''}`.trim(),
  };
}

function writeTempBatch(batch, level) {
  const dir = generatedDir(level);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `.tmp-analyze-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
  fs.writeFileSync(tmpPath, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  return {
    abs: tmpPath,
    rel: path.relative(ROOT, tmpPath).replace(/\\/g, '/'),
    cleanup: () => {
      try { fs.unlinkSync(tmpPath); } catch (_) { /* ignore */ }
    },
  };
}

function runValidateBatch(lang, level, relFile, allowBankDup) {
  const args = ['scripts/validate-batch.mjs', '--lang', lang, '--level', level, '--file', relFile];
  if (allowBankDup) args.push('--allow-dup');
  const res = spawnNode(args);
  return {
    gate: 'validate-batch',
    ok: res.ok,
    errors: res.ok ? [] : parseValidateBatchErrors(res.output),
    output: res.output,
  };
}

function runSweepBlacklist(relFile) {
  const res = spawnNode(['scripts/sweep-blacklist.mjs', relFile]);
  const hits = parseSweepBlacklistErrors(res.output);
  return {
    gate: 'sweep-blacklist',
    ok: res.ok,
    errors: res.ok ? [] : hits,
    output: res.output,
  };
}

function runAuditPass2(relFile, failOn = 'IMPORTANT') {
  const res = spawnNode([
    'scripts/audit-pass-2.mjs', relFile, '--json', `--fail-on=${failOn}`,
  ]);
  const errors = parseAuditPass2Errors(res.output, failOn);
  return {
    gate: 'audit-pass-2',
    ok: res.ok,
    errors: res.ok ? [] : errors,
    output: res.output,
  };
}

export function inferLevelFromBatch(batch, fallback = 'B1') {
  const fromRoot = String(batch?.level || '').toUpperCase();
  if (fromRoot) return fromRoot;
  const fromQ = batch?.questions?.find((q) => q.level)?.level;
  if (fromQ) return String(fromQ).toUpperCase();
  return String(fallback).toUpperCase();
}

export function inferTopicFromBatch(batch, filename = '') {
  const fromTag = normalizeB1Topic(batch?.topicTag);
  if (fromTag) return fromTag;
  for (const q of batch?.questions || []) {
    const t = normalizeB1Topic(q.topicTag || q.topicTags?.[0]);
    if (t) return t;
  }
  const fn = path.basename(filename).toLowerCase();
  for (const topic of [
    'umwelt', 'gesundheit', 'reisen', 'arbeit', 'wohnen', 'medien', 'verkehr',
    'stadtleben', 'ernährung', 'ernaehrung', 'freizeit', 'sport', 'kultur',
    'familie', 'konsum', 'technik', 'bildung',
  ]) {
    if (fn.includes(topic)) {
      return normalizeB1Topic(topic) || topic;
    }
  }
  return batch?.topicTag || '—';
}

export function detectModule(batch) {
  const mod = inferModuleFromBatch(batch);
  if (mod) return mod;
  return 'desconocido';
}

const MODULE_LIMITS = {
  horen: { minTeil: 1, maxTeil: 4 },
  schreiben: { minTeil: 1, maxTeil: 3, multiTeilBatch: true, a2Teils: [1, 2] },
  sprechen: { minTeil: 1, maxTeil: 3, multiTeilBatch: true, a2Teils: [1, 2, 3] },
};

function resolveExamContextLocal(args, batch, teilHint) {
  const level = inferLevelFromBatch(batch, args.level);
  const module = args.module || inferModuleFromBatch(batch);
  const limits = MODULE_LIMITS[module];
  if (!limits) {
    return { ok: false, errors: [`Módulo inválido o no detectado: ${module || '?'}`], module, level };
  }

  if (limits.multiTeilBatch) {
    const expected = level === 'A2' && limits.a2Teils ? limits.a2Teils : [1, 2, 3];
    const teils = [...new Set((batch?.questions || []).map((q) => Number(q?.teil)).filter(Number.isFinite))];
    const missing = expected.filter((t) => !teils.includes(t));
    if (missing.length) {
      return {
        ok: false,
        module,
        level,
        errors: [`${module} ${level}: faltan teil ${missing.join(', ')} (tiene: ${teils.join(', ') || 'ninguno'})`],
      };
    }
    return { ok: true, module, level, teil: null, errors: [] };
  }

  let teil = args.teil ?? teilHint ?? args.defaultTeil ?? inferTeilFromBatch(batch);
  if (!Number.isFinite(teil) || teil < limits.minTeil || teil > limits.maxTeil) {
    return { ok: false, module, level, errors: ['No se pudo determinar Teil (usa teil en JSON o --teil)'] };
  }

  const modInBatch = inferModuleFromBatch(batch);
  if (modInBatch && modInBatch !== module) {
    return { ok: false, module, level, teil, errors: [`module en JSON (${modInBatch}) ≠ esperado ${module}`] };
  }

  return { ok: true, module, level, teil, errors: [] };
}

function prepareBatch(batch, args, ctx) {
  const enrichCtx = {
    module: ctx.module,
    teil: ctx.teil ?? inferTeilFromBatch(batch),
    lang: args.lang,
    level: ctx.level || args.level,
  };
  return tagBatchWithTopic(normalizeBatch(batch, enrichCtx), null);
}

export function collectFixSuggestions(batch, level) {
  const texts = [];
  for (const p of batch?.passages || []) {
    for (const field of ['text', 'title', 'signText', 'transcript']) {
      if (p[field]) texts.push({ field: `passage:${p.id}:${field}`, text: String(p[field]) });
    }
  }
  for (const q of batch?.questions || []) {
    for (const field of ['question', 'signText', 'explanation', 'instruction', 'situation', 'task']) {
      if (q[field]) texts.push({ field: `q:${q.id}:${field}`, text: String(q[field]) });
    }
    for (const o of q.options || []) {
      texts.push({ field: `q:${q.id}:option`, text: typeof o === 'string' ? o : String(o?.text || '') });
    }
  }

  const suggestions = [];
  const seen = new Set();
  for (const { field, text } of texts) {
    for (const pat of FIX_PATTERNS) {
      if (pat.levelHint && pat.levelHint !== level) continue;
      const re = pat.term.global ? pat.term : new RegExp(pat.term.source, pat.term.flags);
      re.lastIndex = 0;
      const m = text.match(re);
      if (!m) continue;
      const key = `${field}|${m[0]}|${pat.suggestion}`;
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push({
        field,
        match: m[0],
        replaceWith: pat.suggestion,
        reason: pat.reason,
      });
    }
  }
  return suggestions;
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

function analyzeLesenLikeBatch(batch, args, { teilHint, label, verbose }) {
  const errors = [];
  const gates = [];
  const level = inferLevelFromBatch(batch, args.level);
  const teil = resolveTeil(args.teil, teilHint ?? inferTeilFromBatch(batch), args.defaultTeil);
  const module = detectModule(batch);

  if (!teil) {
    return {
      ok: false, module, level, topic: inferTopicFromBatch(batch), teil: null,
      gate: 'context', errors: ['No se pudo determinar Teil (usa teil en JSON o --teil)'], gates,
    };
  }
  if (!batch?.questions?.length) {
    return {
      ok: false, module, level, topic: inferTopicFromBatch(batch), teil,
      gate: 'context', errors: ['JSON sin array questions'], gates,
    };
  }

  let normalized = maybeNormalizeManualLesenBatch(batch, {
    teil, lang: args.lang, level, module,
  });
  if (module === 'lesen' && [2, 5].includes(teil)) {
    const pos = assertManualPublishPositionGates(normalized, { teil, lang: args.lang, level });
    if (!pos.ok) {
      return {
        ok: false, module, level, topic: inferTopicFromBatch(batch), teil,
        gate: 'position-gate', errors: pos.issues.map((i) => `Position gate: ${i}`), gates,
      };
    }
    normalized = pos.batch;
  }

  const tmp = writeTempBatch(normalized, level);
  try {
    const v = runValidateBatch(args.lang, level, tmp.rel, args.allowBankDup);
    gates.push(v);
    if (verbose) console.log(v.output);
    if (!v.ok) {
      return {
        ok: false, module, level, topic: inferTopicFromBatch(normalized), teil,
        gate: v.gate, errors: v.errors, gates,
      };
    }

    const { quality, report } = runModuleQualityCheck(normalized, module, teil, { lang: args.lang, level });
    gates.push({ gate: 'calidad-pedagogica', ok: quality.ok, errors: quality.issues || [], output: report });
    if (verbose) console.log(report);
    if (!quality.ok) {
      const qErrors = quality.issues || [];
      return {
        ok: false, module, level, topic: inferTopicFromBatch(normalized), teil,
        gate: 'calidad-pedagogica', errors: qErrors.length ? qErrors : ['Calidad pedagógica falló'], gates,
      };
    }

    if (module === 'lesen') {
      const ingest = checkLesenBatchIngest(normalized, { lang: args.lang, level, batchId: 'analyze-tmp' });
      const ingestErrors = ingestErrorsForSummary(ingest, level);
      const metricHint = ingest.results?.find((r) => !r.valid)?.cefr;
      gates.push({
        gate: 'pre-ingest-cefr',
        ok: ingest.ok,
        errors: ingestErrors,
        output: ingestErrors.join('; '),
        metrics: metricHint ? formatCefrMetricsSummary(metricHint, level) : [],
      });
      if (!ingest.ok) {
        return {
          ok: false, module, level, topic: inferTopicFromBatch(normalized), teil,
          gate: 'pre-ingest-cefr', errors: ingestErrors, gates,
        };
      }
    }

    return {
      ok: true, module, level, topic: inferTopicFromBatch(normalized), teil, gate: null, errors: [], gates,
    };
  } finally {
    tmp.cleanup();
  }
}

function analyzeExamBatch(batch, args, { teilHint, label, verbose }) {
  const gates = [];
  const ctx = resolveExamContextLocal(args, batch, teilHint);
  if (!ctx.ok) {
    return {
      ok: false,
      module: ctx.module || detectModule(batch),
      level: ctx.level || inferLevelFromBatch(batch, args.level),
      topic: inferTopicFromBatch(batch),
      teil: ctx.teil ?? null,
      gate: 'context',
      errors: ctx.errors,
      gates,
    };
  }

  const normalized = prepareBatch(batch, args, ctx);
  const resolved = resolveExamContextLocal(args, normalized, teilHint);
  if (!resolved.ok) {
    return {
      ok: false, module: resolved.module, level: resolved.level, topic: inferTopicFromBatch(normalized),
      teil: resolved.teil, gate: 'context', errors: resolved.errors, gates,
    };
  }

  const tmp = writeTempBatch(normalized, resolved.level || args.level);
  try {
    const v = runValidateBatch(args.lang, resolved.level || args.level, tmp.rel, args.allowBankDup);
    gates.push(v);
    if (verbose) console.log(v.output);
    if (!v.ok) {
      return {
        ok: false, module: resolved.module, level: resolved.level, topic: inferTopicFromBatch(normalized),
        teil: resolved.teil, gate: v.gate, errors: v.errors, gates,
      };
    }

    const bl = runSweepBlacklist(tmp.rel);
    gates.push(bl);
    if (verbose) console.log(bl.output);
    if (!bl.ok) {
      return {
        ok: false, module: resolved.module, level: resolved.level, topic: inferTopicFromBatch(normalized),
        teil: resolved.teil, gate: bl.gate, errors: bl.errors, gates,
      };
    }

    const audit = runAuditPass2(tmp.rel, 'IMPORTANT');
    gates.push(audit);
    if (!audit.ok) {
      return {
        ok: false, module: resolved.module, level: resolved.level, topic: inferTopicFromBatch(normalized),
        teil: resolved.teil, gate: audit.gate, errors: audit.errors, gates,
      };
    }

    return {
      ok: true, module: resolved.module, level: resolved.level, topic: inferTopicFromBatch(normalized),
      teil: resolved.teil, gate: null, errors: [], gates,
    };
  } finally {
    tmp.cleanup();
  }
}

export function analyzeBatchReadOnly(batch, opts = {}) {
  const args = {
    lang: opts.lang || 'de',
    level: inferLevelFromBatch(batch, opts.level || 'B1'),
    module: opts.module || null,
    teil: opts.teil ?? null,
    defaultTeil: opts.defaultTeil ?? null,
    allowBankDup: !!opts.allowBankDup,
  };
  const module = args.module || detectModule(batch);
  const result = READING_MODULES.has(module)
    ? analyzeLesenLikeBatch(batch, { ...args, module }, opts)
    : EXAM_MODULES.has(module)
      ? analyzeExamBatch(batch, { ...args, module }, opts)
      : {
        ok: false,
        module,
        level: args.level,
        topic: inferTopicFromBatch(batch, opts.filename),
        teil: null,
        gate: 'context',
        errors: [`Módulo no soportado: ${module}`],
        gates: [],
      };

  if (opts.fixSuggestions) {
    result.suggestions = collectFixSuggestions(batch, result.level);
  }
  return result;
}

export function analyzeJsonFile(absPath, opts = {}) {
  const rel = path.relative(ROOT, absPath).replace(/\\/g, '/');
  let batch;
  try {
    batch = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch (err) {
    return {
      file: rel,
      ok: false,
      module: '—',
      level: '—',
      topic: '—',
      teil: null,
      gate: 'parse',
      errors: [`JSON inválido: ${err.message}`],
      suggestions: [],
    };
  }
  const result = analyzeBatchReadOnly(batch, { ...opts, filename: rel });
  return { file: rel, ...result };
}

export function listInboxJsonFiles(dirRel = 'batches/inbox') {
  const abs = path.isAbsolute(dirRel) ? dirRel : path.join(ROOT, dirRel);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const name of fs.readdirSync(abs).sort()) {
    if (!name.endsWith('.json') || name.startsWith('.')) continue;
    out.push(path.join(abs, name));
  }
  return out;
}

export function formatResultsTable(results) {
  const rows = results.map((r) => {
    const teil = r.teil != null ? `T${r.teil}` : (EXAM_MODULES.has(r.module) ? 'T1–3' : '—');
    const status = r.ok ? '✅ listo' : '❌ FAIL';
    const err = r.ok ? '' : (r.errors[0] || 'error desconocido').slice(0, 72);
    const gate = r.ok ? '—' : (r.gate || '?');
    return {
      file: path.basename(r.file),
      module: r.module || '—',
      level: r.level || '—',
      topic: String(r.topic || '—').slice(0, 14),
      teil,
      status,
      gate,
      error: err,
    };
  });

  const col = {
    file: Math.max(8, ...rows.map((r) => r.file.length), 4),
    mod: 9,
    lvl: 4,
    topic: 14,
    teil: 5,
    status: 10,
    gate: 16,
  };

  const header =
    `${'Archivo'.padEnd(col.file)}  ${'Módulo'.padEnd(col.mod)}  ${'Niv'.padEnd(col.lvl)}  ` +
    `${'Tema'.padEnd(col.topic)}  ${'Teil'.padEnd(col.teil)}  ${'Estado'.padEnd(col.status)}  ` +
    `${'Gate'.padEnd(col.gate)}  Error`;
  const sep = '─'.repeat(Math.min(120, header.length + 20));
  const lines = [sep, header, sep];
  for (const r of rows) {
    lines.push(
      `${r.file.padEnd(col.file)}  ${r.module.padEnd(col.mod)}  ${r.level.padEnd(col.lvl)}  ` +
      `${r.topic.padEnd(col.topic)}  ${r.teil.padEnd(col.teil)}  ${r.status.padEnd(col.status)}  ` +
      `${r.gate.padEnd(col.gate)}  ${r.error}`,
    );
  }
  lines.push(sep);
  return lines.join('\n');
}
