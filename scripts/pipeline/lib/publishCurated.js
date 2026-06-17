/**
 * Write curated exams to library/curated/ + pool-seed mirror for offline serving.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildProvenance } from './provenance.js';

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
}) {
  const signature = examSignature(exam);
  const id = stableCuratedId(lang, level, signature);
  const entry = {
    id,
    lang,
    level,
    topic: topic || exam.topic || `${lang}_${level} curated`,
    curated: true,
    exam: { ...exam, curated: true },
    provenance: buildProvenance({
      generatedBy,
      validatedBy: 'ExamValidator(strict)+CefrGate',
      blueprintId,
      cefrGate,
      sourceBankIds,
      validationErrors: validationResult?.errors || [],
    }),
  };

  const dir = curatedDir(lang, level);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(entry, null, 2) + '\n', 'utf8');

  const poolFile = curatedPoolFile(lang, level);
  const index = loadCuratedIndex(lang, level);
  const seen = new Set(index.map((e) => e.id));
  if (!seen.has(id)) index.push({ id, topic: entry.topic, file: `${id}.json` });
  fs.writeFileSync(poolFile, JSON.stringify(index, null, 2) + '\n', 'utf8');

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
  fs.writeFileSync(seedFile, JSON.stringify(seeds, null, 2) + '\n', 'utf8');

  return { id, path: path.join(dir, `${id}.json`), poolFile: seedFile };
}
