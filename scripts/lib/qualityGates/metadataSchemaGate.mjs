/**
 * metadataSchemaGate.mjs — Q4: esquema de campos + topicTag vs _requestedTopic.
 * Determinista, sin LLM. Solo lectura — no modifica el batch.
 *
 * POLÍTICA warn vs block (documentada):
 * - difficulty / skills / examType / topicTags en questions: WARN en perfil `servible`
 *   para todo el corpus actual (ready holdout + generated pre-publish). Se enriquecen
 *   en publish-lesen-generated (+SEM-1); ahí pasarán a block en perfil futuro
 *   `servible_publish` (oleada 2 / integración live).
 * - Teil 3 Lesen: sin passages; questions solo requieren campos base (matching sin metadata
 *   pedagógica por pregunta).
 * - topicTag legacy (daily_life, etc.): WARN `legacy_topic_slug`, no block.
 * - topic_mismatch entre topics B1 canónicos (tag vs _requestedTopic): sigue siendo BLOCK
 *   en Lesen; en Hören el pipeline usa audit-only (ver pipelineIntegration).
 * - Hören: además content_topic_mismatch (topicTag vs contenido del passage) cuando el
 *   perfil tiene contentTopicCheck — usa schema/horen-fields.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVerdict, pushFinding, inferTeil } from './qualityGateCommon.mjs';
import { topicsAreCompatible, LEGACY_TOPIC_SLUGS } from './topicFamilies.mjs';
import { normalizeB1Topic } from '../b1Topics.mjs';
import { checkPassageContentTopic } from './contentTopicCheck.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.join(__dirname, 'schema');

const _schemaCache = new Map();

function inferModule(batch) {
  const m = String(batch?.module || batch?.questions?.[0]?.module || batch?.passages?.[0]?.module || '')
    .toLowerCase();
  return m || 'lesen';
}

function loadSchema(moduleName) {
  const mod = moduleName === 'horen' ? 'horen' : 'lesen';
  if (_schemaCache.has(mod)) return _schemaCache.get(mod);
  const file = mod === 'horen' ? 'horen-fields.json' : 'lesen-fields.json';
  const schema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, file), 'utf8'));
  _schemaCache.set(mod, schema);
  return schema;
}

function isEmpty(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string' && !value.trim()) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function checkObjectFields(obj, fields, label, findings, severity = 'block') {
  for (const field of fields) {
    if (isEmpty(obj?.[field])) {
      pushFinding(findings, {
        rule: 'missing_field',
        severity,
        detail: `${label}: falta o vacío «${field}»`,
        span: field,
      });
    }
  }
}

function questionRulesForTeil(profile, teil) {
  const byTeil = profile.question?.requiredByTeil?.[String(teil)];
  if (byTeil) return byTeil;
  return {
    required: profile.question.required || [],
    warnFields: profile.question.warnFields || [],
  };
}

function collectTopicTags(batch) {
  const tags = new Set();
  if (batch.topicTag) tags.add(String(batch.topicTag));
  if (batch._requestedTopic) tags.add(String(batch._requestedTopic));
  for (const p of batch.passages || []) {
    if (p.topicTag) tags.add(String(p.topicTag));
  }
  for (const q of batch.questions || []) {
    if (q.topicTag) tags.add(String(q.topicTag));
    if (Array.isArray(q.topicTags)) {
      for (const t of q.topicTags) tags.add(String(t));
    }
  }
  return [...tags];
}

/**
 * @param {object} batch
 * @param {object} [opts]
 * @param {string} [opts.file='']
 * @param {string} [opts.profile='generated'] — 'generated' | 'servible'
 * @param {string} [opts.module] — force schema module (lesen|horen)
 * @returns {import('./qualityGateCommon.mjs').QualityGateVerdict}
 */
export function runMetadataSchemaGate(batch, opts = {}) {
  const file = opts.file || '';
  const profileName = opts.profile || 'generated';
  const moduleName = opts.module || inferModule(batch);
  const schema = loadSchema(moduleName);
  const profile = schema.profiles[profileName] || schema.profiles.generated;
  const findings = [];
  const teil = inferTeil(batch);

  if (!teil) {
    pushFinding(findings, {
      rule: 'missing_field',
      detail: 'No se pudo inferir teil del batch',
    });
    return buildVerdict('Q4-metadataSchema', file, findings);
  }

  checkObjectFields(batch, profile.batch.required, 'batch', findings);

  const needsPassages = profile.passages.requiredByTeil[String(teil)];
  if (needsPassages && !(batch.passages || []).length) {
    pushFinding(findings, {
      rule: 'missing_field',
      detail: `Teil ${teil} requiere passages[] no vacío`,
    });
  }

  const passageBlock = profile.passages.fieldsWhenPresent || [];
  const passageWarn = profile.passages.warnWhenPresent || [];
  for (const p of batch.passages || []) {
    checkObjectFields(p, passageBlock, `passage:${p.id || '?'}`, findings);
    checkObjectFields(p, passageWarn, `passage:${p.id || '?'}`, findings, 'warn');
  }

  const qRules = questionRulesForTeil(profile, teil);
  const qAny = profile.question.requiredAny || [];
  for (const q of batch.questions || []) {
    checkObjectFields(q, qRules.required || [], `question:${q.id || '?'}`, findings);
    checkObjectFields(q, qRules.warnFields || [], `question:${q.id || '?'}`, findings, 'warn');
    for (const group of qAny) {
      const ok = group.some((f) => !isEmpty(q?.[f]));
      if (!ok) {
        pushFinding(findings, {
          rule: 'missing_field',
          detail: `question:${q.id || '?'}: falta al menos uno de [${group.join(', ')}]`,
          span: group.join('|'),
        });
      }
    }
  }

  const requested = batch._requestedTopic;
  const explicitTags = collectTopicTags(batch).filter(Boolean);

  if (!requested && !explicitTags.length) {
    pushFinding(findings, {
      rule: 'topic_field_missing',
      severity: 'warn',
      detail: 'Sin _requestedTopic ni topicTag en batch/passages/questions',
    });
  } else if (requested && !explicitTags.length) {
    pushFinding(findings, {
      rule: 'topic_field_missing',
      severity: 'warn',
      detail: `_requestedTopic «${requested}» sin topicTag explícito en contenido`,
    });
  } else if (!requested && explicitTags.length) {
    pushFinding(findings, {
      rule: 'topic_field_missing',
      severity: 'warn',
      detail: `topicTag presente (${explicitTags.join(', ')}) sin _requestedTopic`,
    });
  } else if (requested && explicitTags.length) {
    const normReq = normalizeB1Topic(requested);
    for (const tag of explicitTags) {
      if (LEGACY_TOPIC_SLUGS.has(tag)) {
        pushFinding(findings, {
          rule: 'legacy_topic_slug',
          severity: 'warn',
          detail: `topicTag legacy «${tag}» — slug pre-B1_TOPICS, revisar en publish`,
          span: tag,
        });
        continue;
      }
      const compat = topicsAreCompatible(requested, tag);
      if (!compat.match) {
        const severity = compat.reason === 'unmapped_topic' ? 'warn' : 'block';
        pushFinding(findings, {
          rule: severity === 'warn' ? 'legacy_topic_slug' : 'topic_mismatch',
          severity,
          detail:
            `topicTag «${tag}» (→${compat.canonicalB || '?'}) incompatible con ` +
            `_requestedTopic «${requested}» (→${compat.canonicalA || normReq || '?'})`,
          span: tag,
        });
      }
    }
  }

  // Hören: topicTag vs contenido real (por passage). Severity block en el veredicto
  // interno; el pipeline Hören lo trata como audit-only (no rechaza).
  if (profile.contentTopicCheck) {
    for (const p of batch.passages || []) {
      const result = checkPassageContentTopic(p);
      if (result.mismatch) {
        pushFinding(findings, {
          rule: 'topic_mismatch',
          severity: 'block',
          detail: result.detail,
          span: result.tag,
        });
      }
    }
  }

  return buildVerdict('Q4-metadataSchema', file, findings);
}

export const GATE_NAME = 'Q4-metadataSchema';

/** Test helper — clear schema cache. */
export function resetMetadataSchemaCache() {
  _schemaCache.clear();
}
