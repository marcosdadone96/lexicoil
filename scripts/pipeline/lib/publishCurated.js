/**
 * Write curated exams to library/curated/ + pool-seed mirror for offline serving.
 * Gate de publicación: isExamPublishable() corre ANTES de cualquier escritura.
 * Si el gate falla → nada se escribe (atomicidad implícita).
 * Cada escritura usa temp+rename para evitar JSON corrupto ante crash.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildProvenance } from './provenance.js';
import { isExamPublishable } from '../../audit-pass-2.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export function curatedDir(lang, level) {
  return path.join(ROOT, 'library', 'curated', lang, level);
}

export function curatedPoolFile(lang, level) {
  return path.join(ROOT, 'library', 'curated', `${lang}_${level}.json`);
}

export function stableCuratedId(lang, level, signature) {
  return `curated_${lang}_${level}_${signature}`;
}

export function examSignature(exam) {
  const blob = JSON.stringify({
    topic: exam.topic,
    lesen: exam.lesenParts?.length,
    horen: exam.horenParts?.length,
  });
  return crypto.createHash('sha256').update(blob).digest('hex').slice(0, 12);
}

export function loadCuratedIndex(lang, level) {
  const file = curatedPoolFile(lang, level);
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Escribe JSON a un archivo temp y luego lo renombra (atomicidad por escritura). */
function atomicWriteJson(filePath, data) {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

export function publishCuratedExam({
  lang,
  level,
  topic,
  exam,
  generatedBy,
  blueprintId,
  cefrGate,
  sourceBankIds = [],
  validationResult,
  validatedBy = 'ExamValidator(strict)+CefrGate',
  id: explicitId = null,
  allowAuditFailures = false,
}) {
  // ── GATE: corre ANTES de tocar el disco ──────────────────────────────────
  const gate = isExamPublishable(exam, { allowFailures: allowAuditFailures });
  if (!gate.ok) {
    const ids = [...new Set(gate.blocking.map((f) => f.id))].join(',');
    const msgs = gate.blocking.map((f) => `  [${f.severity}][${f.id}] ${f.message}`).join('\n');
    process.stderr.write(
      `[publishCuratedExam] BLOQUEADO (${gate.blocking.length} finding(s): ${ids})\n${msgs}\n` +
      `  → No se ha escrito nada. Usa --allow-audit-failures para forzar (solo desarrollo).\n`,
    );
    return { blocked: true, blocking: gate.blocking };
  }

  // Registrar en provenance si --allow-audit-failures saltó findings bloqueantes
  const bypassedChecks = (allowAuditFailures && gate.blocking.length > 0)
    ? [...new Set(gate.blocking.map((f) => f.id))]
    : undefined;
  if (bypassedChecks) {
    process.stderr.write(
      `\x1b[31m⚠  [publishCuratedExam] AUDIT BYPASSED: ${gate.blocking.length} finding(s) ignorado(s) [${bypassedChecks.join(',')}]. Se registra en provenance.\x1b[0m\n`,
    );
  }

  if (gate.advisory.length > 0) {
    const ids = [...new Set(gate.advisory.map((f) => f.id))].join(',');
    console.log(`[publishCuratedExam] advisory (no bloqueante): ${gate.advisory.length} finding(s) [${ids}]`);
  }

  const signature = examSignature(exam);
  const id = explicitId || stableCuratedId(lang, level, signature);
  const entry = {
    id,
    lang,
    level,
    topic: topic || exam.topic || `${lang}_${level} curated`,
    curated: true,
    exam: { ...exam, curated: true },
    provenance: buildProvenance({
      generatedBy,
      validatedBy,
      blueprintId,
      cefrGate,
      sourceBankIds,
      validationErrors: validationResult?.errors || [],
      auditBypassed: bypassedChecks,
    }),
  };

  const dir = curatedDir(lang, level);
  fs.mkdirSync(dir, { recursive: true });
  atomicWriteJson(path.join(dir, `${id}.json`), entry);

  const poolFile = curatedPoolFile(lang, level);
  const index = loadCuratedIndex(lang, level);
  const seen = new Set(index.map((e) => e.id));
  if (!seen.has(id)) index.push({ id, topic: entry.topic, file: `${id}.json` });
  atomicWriteJson(poolFile, index);

  const poolSeedDir = path.join(ROOT, 'library', 'pool-seed');
  fs.mkdirSync(poolSeedDir, { recursive: true });
  const seedFile = path.join(poolSeedDir, `${lang}_${level}.json`);
  let seeds = [];
  if (fs.existsSync(seedFile)) {
    try {
      seeds = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
      if (!Array.isArray(seeds)) seeds = [];
    } catch {
      seeds = [];
    }
  }
  seeds = seeds.filter((s) => s.id !== id);
  seeds.unshift({
    id,
    topic: entry.topic,
    exam: entry.exam,
    contributor: 'curated-pipeline',
    curated: true,
    provenance: entry.provenance,
  });
  atomicWriteJson(seedFile, seeds);

  return { id, path: path.join(dir, `${id}.json`), poolFile: seedFile };
}
