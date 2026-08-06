/**
 * pipelineIntegration.mjs — Q3/Q4 audit + Q1 shadow en generate-lesen-part-gemini.
 *
 * Modos:
 *   Q4: audit (log todo) + block REAL solo topic_mismatch
 *   Q3-A: audit (log warn/block, nunca rechaza)
 *   Q1: shadow (log wouldReject, nunca afecta flujo)
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../loadEnv.mjs';
import { runMetadataSchemaGate } from './metadataSchemaGate.mjs';
import { runPassageCoherenceGate } from './passageCoherenceGate.mjs';
import { runDateWeekdayGate } from './dateWeekdayGate.mjs';
import { runDuplicateContentGate } from './duplicateContentGate.mjs';
import {
  runLanguageToolAdvisoryGate,
  logLanguageToolAdvisory,
} from './languageToolGate.mjs';
import { runGermanContentLanguageGate } from './germanContentLanguageGate.mjs';
import { buildDedupCorpus, corpusExcludingSource } from './dedupCorpus.mjs';
import { READY_LESEN_DIR } from '../batchPaths.mjs';

const GATE_LOG_DIR = path.join(ROOT, 'batches/ready/gate-logs');
const GENERATED_DIR = path.join(ROOT, 'batches/generated');
const BANK_PATH = path.join(ROOT, 'library/de/B1/questions.json');

/** Fecha inicio modos observación (Wave 1c integración). */
export const QUALITY_GATE_OBSERVATION_START = '2026-07-09';

let _auditStamp = null;
let _shadowStamp = null;
let _dedupCorpus = null;

function ensureLogDir() {
  fs.mkdirSync(GATE_LOG_DIR, { recursive: true });
}

function auditStamp() {
  if (!_auditStamp) {
    _auditStamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }
  return _auditStamp;
}

function shadowStamp() {
  if (!_shadowStamp) {
    _shadowStamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }
  return _shadowStamp;
}

function appendJsonl(filePath, obj) {
  ensureLogDir();
  fs.appendFileSync(filePath, `${JSON.stringify(obj)}\n`, 'utf8');
}

function getDedupCorpus() {
  if (!_dedupCorpus) {
    _dedupCorpus = buildDedupCorpus({
      dirs: [GENERATED_DIR, READY_LESEN_DIR],
      bankPath: BANK_PATH,
    });
  }
  return _dedupCorpus;
}

/**
 * Q4 — audit + block real solo topic_mismatch (Lesen).
 * Hören: pasar opts.hardBlock=false → solo log (dry-run / observación).
 * @param {object} batch
 * @param {object} opts
 * @param {string} [opts.file] — ruta relativa batches/generated/…
 * @param {string} [opts.module] — 'lesen' | 'horen'
 * @param {boolean} [opts.hardBlock=true] — false = audit-only (Hören)
 * @returns {{ blocked: boolean, verdict: object, issue?: string }}
 */
export function runQ4PipelineGate(batch, opts = {}) {
  const file = opts.file || '';
  const hardBlock = opts.hardBlock !== false;
  const verdict = runMetadataSchemaGate(batch, {
    file,
    profile: opts.profile || 'generated',
    module: opts.module,
  });

  const logEntry = {
    ...verdict,
    mode: hardBlock ? 'audit' : 'audit-only',
    module: opts.module || null,
    hardBlockRules: hardBlock ? ['topic_mismatch'] : [],
    observationStart: QUALITY_GATE_OBSERVATION_START,
  };
  appendJsonl(
    path.join(GATE_LOG_DIR, `audit-Q4-metadataSchema-${auditStamp()}.jsonl`),
    logEntry,
  );

  if (!hardBlock) {
    return { blocked: false, verdict };
  }

  const hardBlocks = verdict.findings.filter(
    (f) => f.rule === 'topic_mismatch' && (f.severity || 'block') === 'block',
  );
  if (hardBlocks.length) {
    return {
      blocked: true,
      verdict,
      issue: hardBlocks.map((f) => f.detail).join('; '),
    };
  }
  return { blocked: false, verdict };
}

/**
 * Q1 — shadow logging puro.
 * @returns {{ wouldReject: boolean, verdict: object }}
 */
export function runQ1ShadowGate(batch, opts = {}) {
  const file = opts.file || '';
  const source = file || `batches/generated/${opts.basename || 'unknown.json'}`;
  const fullCorpus = getDedupCorpus();
  const corpusExcl = corpusExcludingSource(fullCorpus, source);

  const verdict = runDuplicateContentGate(batch, {
    file: source,
    selfSource: source,
    corpus: corpusExcl,
    index: corpusExcl.index,
  });

  const wouldReject = verdict.verdict === 'block';
  appendJsonl(
    path.join(GATE_LOG_DIR, `shadow-q1-${shadowStamp()}.jsonl`),
    {
      ...verdict,
      mode: 'shadow',
      wouldReject,
      observationStart: QUALITY_GATE_OBSERVATION_START,
    },
  );

  return { wouldReject, verdict };
}

/**
 * Q3-A — audit (log only, never blocks pipeline).
 * Incluye passageCoherence + dateWeekday (Hören y Lesen).
 * LanguageTool se cablea aparte vía runLanguageToolPipelineAdvisory (async).
 */
export function runQ3PipelineGate(batch, opts = {}) {
  const file = opts.file || '';
  const coherence = runPassageCoherenceGate(batch, { file });
  const dateWeekday = runDateWeekdayGate(batch, {
    file,
    year: opts.year,
    severity: opts.dateWeekdaySeverity || 'block',
  });

  const findings = [...(coherence.findings || []), ...(dateWeekday.findings || [])];
  const hasBlock = findings.some((f) => (f.severity || 'block') === 'block');
  const hasWarn = findings.some((f) => f.severity === 'warn');
  const verdict = {
    gate: 'Q3-textDeterministic',
    file,
    verdict: hasBlock ? 'block' : hasWarn ? 'warn' : 'pass',
    findings,
    parts: {
      passageCoherence: coherence,
      dateWeekday,
    },
  };

  appendJsonl(
    path.join(GATE_LOG_DIR, `audit-Q3-passageCoherence-${auditStamp()}.jsonl`),
    {
      ...verdict,
      mode: 'audit',
      hardBlockRules: [],
      observationStart: QUALITY_GATE_OBSERVATION_START,
    },
  );

  return { verdict, wouldReject: verdict.verdict === 'block' };
}

/**
 * LanguageTool advisory after Q3 — never blocks generation.
 * Soft-skips (verdict=skip) when Docker LT is unreachable.
 */
export async function runLanguageToolPipelineAdvisory(batch, opts = {}) {
  const file = opts.file || '';
  if (opts.skipLanguageTool) {
    return {
      verdict: {
        gate: 'languageToolAdvisory',
        skipped: true,
        skipReason: 'opts.skipLanguageTool',
        verdict: 'skip',
        findings: [],
      },
    };
  }
  const verdict = await runLanguageToolAdvisoryGate(batch, {
    file,
    base: opts.ltBase,
    delayMs: opts.ltDelayMs,
  });
  logLanguageToolAdvisory(verdict, { file });
  if (verdict.skipped) {
    console.log(`  [LT advisory] skipped (LT down: ${verdict.skipReason})`);
  } else if (verdict.findings.length) {
    console.log(`  [LT advisory] ${verdict.findings.length} real finding(s) (non-blocking):`);
    for (const f of verdict.findings.slice(0, 5)) {
      console.log(`    · ${f.ruleId}: ${f.span || f.detail}`);
    }
  } else {
    console.log('  [LT advisory] pass (0 real findings)');
  }
  return { verdict };
}

/**
 * Q5 — hard block: exam text must be German when lang=de.
 */
export function runQ5PipelineGate(batch, opts = {}) {
  const file = opts.file || '';
  const verdict = runGermanContentLanguageGate(batch, { file, lang: opts.lang || 'de' });
  appendJsonl(path.join(GATE_LOG_DIR, `audit-q5-${auditStamp()}.jsonl`), {
    ...verdict,
    mode: 'enforced',
    hardBlock: true,
    observationStart: QUALITY_GATE_OBSERVATION_START,
  });
  return {
    blocked: verdict.verdict === 'block',
    verdict,
    issue: verdict.findings?.[0]?.detail,
  };
}

/** Reset corpus cache (tests). */
export function resetPipelineGateCache() {
  _dedupCorpus = null;
  _auditStamp = null;
  _shadowStamp = null;
}
