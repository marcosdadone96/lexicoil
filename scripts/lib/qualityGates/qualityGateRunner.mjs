/**
 * qualityGateRunner.mjs — PASO 9 unified pre–pool-verified evaluation (audit mode).
 *
 * Does NOT mutate parts, does NOT block production, does NOT auto-promote.
 * Orchestrates objective checks → PASS | WARNING | FAIL + staging hint status.
 *
 *   import { runQualityGates } from './qualityGates/qualityGateRunner.mjs';
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { inferTeil } from './qualityGateCommon.mjs';
import { loadQualityGatePolicy, buildQualityMetadata } from './qualityGatePolicy.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Expected Goethe B1 item counts (from audit-pass-2 BLUEPRINT_COUNTS). */
export const EXPECTED_COUNTS = Object.freeze({
  'lesen-1': { count: 6, types: ['richtig_falsch'] },
  'lesen-2': { count: 6, types: ['multiple_choice'] },
  'lesen-3': { count: 7, types: ['matching'] },
  'lesen-4': { count: 7, types: ['ja_nein'] },
  'lesen-5': { count: 4, types: ['multiple_choice'] },
  'horen-1': { count: 10, types: ['richtig_falsch', 'multiple_choice'] },
  'horen-2': { count: 5, types: ['multiple_choice'] },
  'horen-3': { count: 7, types: ['richtig_falsch'] },
  'horen-4': { count: 8, types: ['matching'] },
  schreiben: { count: 3, types: ['short_answer'] },
  sprechen: { count: 3, types: ['planungsaufgabe', 'praesentation', 'feedback_diskussion'] },
});

const STOPWORDS_DE = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'einem', 'einen',
  'und', 'oder', 'aber', 'mit', 'von', 'zu', 'auf', 'in', 'an', 'für', 'ist', 'sind',
  'hat', 'haben', 'wird', 'werden', 'nicht', 'auch', 'noch', 'nur', 'sehr', 'sich',
]);

const ARTIFICIAL_PATTERNS = [
  { re: /\bein bericht zeigt\b/i, label: 'Ein Bericht zeigt…', severity: 'FAIL' },
  { re: /\blaut (einer|einer neuen) studie\b/i, label: 'laut einer Studie…', severity: 'FAIL' },
  { re: /\bin der heutigen zeit\b/i, label: 'in der heutigen Zeit', severity: 'WARNING' },
  { re: /\bit is (widely )?known that\b/i, label: 'English meta-phrase', severity: 'WARNING' },
];

const VALID_GRAMMAR_HINTS = [
  'nebensatz', 'relativ', 'passiv', 'konjunktiv', 'modal', 'perfekt', 'präteritum',
  'akkusativ', 'dativ', 'genitiv', 'präposition', 'reflexiv', 'komparativ', 'superlativ',
  'infinitiv', 'zu-infinitiv', 'wortstellung', 'artikel', 'adjektiv',
];

export const STAGING_STATUS = Object.freeze({
  PASS: 'candidate_ready',
  WARNING: 'needs_review',
  FAIL: 'rejected',
});

function gateResult(name, status, errors = [], details = []) {
  return {
    name,
    status, // PASS | WARNING | FAIL
    errors: errors.map(String),
    details: details.map(String),
  };
}

function inferModule(part, source = '') {
  const m = String(part?.module || part?.questions?.[0]?.module || '').toLowerCase();
  if (m) return m;
  const base = path.basename(String(source || ''), '.json').toLowerCase();
  if (base.startsWith('lesen')) return 'lesen';
  if (base.startsWith('horen') || base.startsWith('hören')) return 'horen';
  if (base.startsWith('schreiben')) return 'schreiben';
  if (base.startsWith('sprechen')) return 'sprechen';
  return '';
}

function collectProse(part) {
  const chunks = [];
  for (const p of part.passages || []) {
    if (p?.text) chunks.push(String(p.text));
    if (p?.title) chunks.push(String(p.title));
    if (p?.transcript) chunks.push(String(p.transcript));
  }
  for (const q of part.questions || []) {
    if (q?.question) chunks.push(String(q.question));
    if (q?.explanation) chunks.push(String(q.explanation));
    if (q?.statement) chunks.push(String(q.statement));
    if (Array.isArray(q?.options)) {
      for (const o of q.options) {
        chunks.push(typeof o === 'string' ? o : String(o?.text || ''));
      }
    }
  }
  return chunks.join('\n');
}

/** 1. JSON integrity */
export function gateJsonIntegrity(part) {
  const errors = [];
  const details = [];
  if (!part || typeof part !== 'object') {
    return gateResult('json_integrity', 'FAIL', ['not_an_object']);
  }
  try {
    JSON.stringify(part);
  } catch (err) {
    return gateResult('json_integrity', 'FAIL', [`json_stringify:${err.message}`]);
  }

  const questions = Array.isArray(part.questions) ? part.questions : null;
  if (!questions) {
    return gateResult('json_integrity', 'FAIL', ['questions_missing_or_not_array']);
  }

  const qIds = new Set();
  const pIds = new Set();
  for (const p of part.passages || []) {
    if (!p || p.id == null) {
      errors.push('passage_missing_id');
      continue;
    }
    const id = String(p.id);
    if (pIds.has(id)) errors.push(`duplicate_passage_id:${id}`);
    pIds.add(id);
  }

  for (const q of questions) {
    if (!q || q.id == null) {
      errors.push('question_missing_id');
      continue;
    }
    const id = String(q.id);
    if (qIds.has(id)) errors.push(`duplicate_question_id:${id}`);
    qIds.add(id);

    const correct = q.correct != null ? q.correct : q.correctAnswer;
    if (correct == null || correct === '') {
      errors.push(`missing_correctAnswer:${id}`);
    }

    if (Array.isArray(q.options) && q.options.length >= 2) {
      const keys = q.options.map((o) =>
        typeof o === 'string' ? o.trim() : String(o.key != null ? o.key : o).trim(),
      );
      if (keys.some((k) => !k)) errors.push(`empty_option:${id}`);
      const c = Array.isArray(correct) ? correct.map(String) : [String(correct)];
      const ok = c.every(
        (x) =>
          x === 'rubric' ||
          keys.includes(x) ||
          keys.includes(x.toUpperCase()) ||
          keys.includes(x.toLowerCase()) ||
          /^(J|N|R|F|Ja|Nein|true|false)$/i.test(x),
      );
      if (!ok && correct !== 'rubric' && correct !== true) {
        errors.push(`correct_not_in_options:${id}`);
      }
    }

    if (q.passageId != null && pIds.size > 0) {
      if (!pIds.has(String(q.passageId))) {
        errors.push(`orphan_passageId:${id}->${q.passageId}`);
      }
    }
  }

  if (errors.length) return gateResult('json_integrity', 'FAIL', errors, details);
  return gateResult('json_integrity', 'PASS', [], [`questions:${questions.length}`]);
}

/** 2. Goethe structure */
export function gateGoetheStructure(part, ctx = {}) {
  const errors = [];
  const details = [];
  const module = inferModule(part, ctx.source);
  const teil = inferTeil(part) || Number(ctx.teil) || 0;
  const questions = Array.isArray(part.questions) ? part.questions : [];

  if (!module) {
    errors.push('module_unknown');
    return gateResult('goethe_structure', 'FAIL', errors);
  }
  details.push(`module:${module}`, `teil:${teil || 'n/a'}`);

  let expectedKey = module;
  if (module === 'lesen' || module === 'horen') {
    if (!teil) {
      errors.push('teil_missing');
      return gateResult('goethe_structure', 'FAIL', errors, details);
    }
    expectedKey = `${module}-${teil}`;
  }

  const expected = EXPECTED_COUNTS[expectedKey];
  if (!expected) {
    return gateResult('goethe_structure', 'WARNING', [], [`no_blueprint_for:${expectedKey}`]);
  }

  if (questions.length !== expected.count) {
    errors.push(`question_count:${questions.length}!=${expected.count}`);
  }

  const allowed = new Set(expected.types.map((t) => t.toLowerCase()));
  for (const q of questions) {
    const t = String(q.type || '').toLowerCase();
    if (t && !allowed.has(t)) {
      // soft: some aliases
      const aliases = {
        rf: 'richtig_falsch',
        mcq: 'multiple_choice',
        multiple: 'multiple_choice',
      };
      const mapped = aliases[t];
      if (!mapped || !allowed.has(mapped)) {
        errors.push(`invalid_type:${q.id}:${t}`);
      }
    }
  }

  if (errors.length) return gateResult('goethe_structure', 'FAIL', errors, details);
  return gateResult('goethe_structure', 'PASS', [], details);
}

/** 3. Language quality — known feedback avoids + artificial patterns */
export function gateLanguageQuality(part, ctx = {}) {
  const errors = [];
  const warnings = [];
  const details = [];
  const prose = collectProse(part);
  const lower = prose.toLowerCase();

  for (const pat of ARTIFICIAL_PATTERNS) {
    if (pat.re.test(prose)) {
      const msg = `artificial_pattern:${pat.label}`;
      if (pat.severity === 'FAIL') errors.push(msg);
      else warnings.push(msg);
    }
  }

  const feedbackRules = Array.isArray(ctx.feedbackRules) ? ctx.feedbackRules : [];
  for (const rule of feedbackRules) {
    const avoid = String(rule.avoid || rule.wrong || '').trim();
    if (avoid.length < 5) continue;
    if (lower.includes(avoid.toLowerCase())) {
      const sev = rule.priority === 'high' || rule.status === 'active' ? 'WARNING' : 'WARNING';
      warnings.push(`feedback_avoid_hit:${rule.id || 'rule'}:${avoid.slice(0, 60)}`);
      details.push(sev);
    }
  }

  if (errors.length) return gateResult('language_quality', 'FAIL', errors, warnings);
  if (warnings.length) return gateResult('language_quality', 'WARNING', warnings, details);
  return gateResult('language_quality', 'PASS', [], details);
}

/**
 * 4. CEFR — wrap CefrGate when available; heuristic fallback otherwise.
 * Hard FAIL only on clearly excessive B2+ density; else WARNING.
 */
export async function gateCefr(part, ctx = {}) {
  const errors = [];
  const warnings = [];
  const details = [];
  const level = String(ctx.level || part.level || 'B1').toUpperCase();

  // Heuristic B2+ markers (deterministic, no LLM)
  const B2_MARKERS = [
    'faszinierend', 'eigenregie', 'gelassenheit', 'modifizieren', 'implizieren',
    'differenzieren', 'konzeptionell', 'paradigma', 'ambivalent', 'kohärent',
  ];
  const prose = collectProse(part).toLowerCase();
  const hits = B2_MARKERS.filter((w) => prose.includes(w));
  if (hits.length >= 3) {
    errors.push(`excessive_b2_vocab:${hits.slice(0, 5).join(',')}`);
  } else if (hits.length > 0) {
    warnings.push(`occasional_b2_vocab:${hits.join(',')}`);
  }

  // Optional CefrGate (browser/Node CJS)
  try {
    const CefrGateMod = require(path.join(ROOT, 'js/engine/validation/CefrGate.js'));
    const CefrGate = CefrGateMod.CefrGate || CefrGateMod.default || CefrGateMod;
    if (CefrGate && typeof CefrGate.validatePassage === 'function') {
      const passages = part.passages || [];
      for (const p of passages.slice(0, 3)) {
        const text = String(p.text || p.transcript || '');
        if (text.split(/\s+/).length < 40) continue;
        const res = CefrGate.validatePassage(text, level, { lang: ctx.lang || 'de' });
        if (res && res.ok === false) {
          const cov = res.metrics?.coverageVsLevel;
          details.push(`cefr_coverage:${p.id}:${cov != null ? cov.toFixed?.(2) ?? cov : '?'}`);
          if (cov != null && cov < 0.4) errors.push(`cefr_coverage_hard_fail:${p.id}`);
          else warnings.push(`cefr_gate_warn:${p.id}:${res.reason || 'fail'}`);
        } else if (res?.metrics?.coverageVsLevel != null) {
          details.push(`cefr_coverage:${p.id}:${Number(res.metrics.coverageVsLevel).toFixed(2)}`);
        }
      }
    }
  } catch (_) {
    details.push('cefr_gate_unavailable_heuristic_only');
  }

  if (errors.length) return gateResult('cefr', 'FAIL', errors, [...warnings, ...details]);
  if (warnings.length) return gateResult('cefr', 'WARNING', warnings, details);
  return gateResult('cefr', 'PASS', [], details);
}

/** 5. Metadata quality */
export function gateMetadataQuality(part) {
  const errors = [];
  const warnings = [];
  const details = [];
  const questions = Array.isArray(part.questions) ? part.questions : [];

  if (!questions.length) {
    return gateResult('metadata_quality', 'FAIL', ['no_questions']);
  }

  let missingVocab = 0;
  let missingGrammar = 0;
  let missingDiff = 0;

  for (const q of questions) {
    const id = q.id || '?';
    const vocab = Array.isArray(q.vocabularyTags) ? q.vocabularyTags : null;
    const grammar = Array.isArray(q.grammarTags) ? q.grammarTags : null;
    const diff = q.difficulty;

    if (!vocab || !vocab.length) {
      missingVocab++;
      warnings.push(`missing_vocabularyTags:${id}`);
    } else {
      const seen = new Set();
      for (const tag of vocab) {
        const t = String(tag).trim().toLowerCase();
        if (!t) {
          errors.push(`empty_vocab_tag:${id}`);
          continue;
        }
        if (STOPWORDS_DE.has(t)) warnings.push(`vocab_stopword:${id}:${t}`);
        if (seen.has(t)) warnings.push(`vocab_duplicate:${id}:${t}`);
        seen.add(t);
        // incomplete verb infinitive stubs like "zu " alone
        if (/^(zu|sich)$/i.test(t)) warnings.push(`vocab_incomplete:${id}:${t}`);
      }
    }

    if (!grammar || !grammar.length) {
      missingGrammar++;
      warnings.push(`missing_grammarTags:${id}`);
    } else {
      const onlyRelNeb =
        grammar.length <= 2 &&
        grammar.every((g) => /relativ|nebensatz/i.test(String(g)));
      if (onlyRelNeb) warnings.push(`grammar_tags_too_narrow:${id}`);
      const validish = grammar.some((g) =>
        VALID_GRAMMAR_HINTS.some((h) => String(g).toLowerCase().includes(h)),
      );
      if (!validish && grammar.length) {
        details.push(`grammar_unrecognized:${id}:${grammar.slice(0, 2).join(',')}`);
      }
    }

    if (diff == null || diff === '') {
      missingDiff++;
      warnings.push(`missing_difficulty:${id}`);
    } else {
      const n = Number(diff);
      if (!Number.isFinite(n) || n < 1 || n > 5) {
        errors.push(`difficulty_out_of_range:${id}:${diff}`);
      }
    }
  }

  // Corrupt metadata = FAIL if majority missing critical fields or hard errors
  if (errors.length) return gateResult('metadata_quality', 'FAIL', errors, warnings);
  if (missingVocab === questions.length && missingGrammar === questions.length) {
    return gateResult('metadata_quality', 'FAIL', ['all_questions_missing_tags'], warnings);
  }
  if (warnings.length) return gateResult('metadata_quality', 'WARNING', warnings, details);
  return gateResult('metadata_quality', 'PASS', [], details);
}

function aggregateStatus(gates) {
  if (gates.some((g) => g.status === 'FAIL')) return 'FAIL';
  if (gates.some((g) => g.status === 'WARNING')) return 'WARNING';
  return 'PASS';
}

function countBySeverity(gates) {
  let errors = 0;
  let warnings = 0;
  for (const g of gates) {
    if (g.status === 'FAIL') errors += Math.max(1, g.errors?.length || 0);
    else if (g.status === 'WARNING') warnings += Math.max(1, g.errors?.length || 0);
  }
  return { errors, warnings };
}

/**
 * @param {{
 *   part: object,
 *   metadata?: object,
 *   source?: string,
 *   level?: string,
 *   lang?: string,
 *   teil?: number,
 *   feedbackRules?: object[],
 *   gates?: string[],
 *   policyMode?: string,
 *   policy?: object,
 *   checkedBy?: string,
 * }} input
 * @returns {Promise<object>} quality report
 */
export async function runQualityGates(input = {}) {
  const part = input.part;
  const source = input.source || '';
  const policy = loadQualityGatePolicy({
    mode: input.policyMode,
    policy: input.policy,
  });
  const ctx = {
    source,
    level: input.level || part?.level || 'B1',
    lang: input.lang || 'de',
    teil: input.teil,
    feedbackRules: input.feedbackRules || [],
  };

  const enabled = new Set(
    (input.gates || [
      'json_integrity',
      'goethe_structure',
      'language_quality',
      'cefr',
      'metadata_quality',
    ]).map(String),
  );

  const gates = [];
  if (enabled.has('json_integrity')) gates.push(gateJsonIntegrity(part));
  if (enabled.has('goethe_structure')) gates.push(gateGoetheStructure(part, ctx));
  if (enabled.has('language_quality')) gates.push(gateLanguageQuality(part, ctx));
  if (enabled.has('cefr')) gates.push(await gateCefr(part, ctx));
  if (enabled.has('metadata_quality')) gates.push(gateMetadataQuality(part));

  const status = aggregateStatus(gates);
  const summary = countBySeverity(gates);
  const partId =
    part?.id ||
    part?.questions?.[0]?.id ||
    path.basename(source || '', '.json') ||
    'unknown';

  const report = {
    partId: String(partId),
    source: source || null,
    status,
    stagingStatus: STAGING_STATUS[status],
    summary,
    gates,
    generationMetadata: input.metadata || part?.generationMetadata || null,
    policyMode: policy.mode,
    mode: policy.mode, // PASO 10 — advisory|review|enforced (not "audit" alone)
    generatedAt: new Date().toISOString(),
  };
  report.qualityMetadata = buildQualityMetadata(report, {
    checkedBy: input.checkedBy || 'system',
    policyMode: policy.mode,
  });
  return report;
}

/**
 * Map runner status → staging candidate hint (no write).
 */
export function toStagingHint(report) {
  return {
    suggestedStatus: report.stagingStatus,
    qualityStatus: report.status,
    partId: report.partId,
    summary: report.summary,
  };
}

export default {
  runQualityGates,
  gateJsonIntegrity,
  gateGoetheStructure,
  gateLanguageQuality,
  gateCefr,
  gateMetadataQuality,
  EXPECTED_COUNTS,
  STAGING_STATUS,
  toStagingHint,
};
