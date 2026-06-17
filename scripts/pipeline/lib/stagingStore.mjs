/**
 * Sprint 2 — staging store for human-reviewed library candidates.
 * Layout: staging/{lang}/{level}/index.json + candidates/{id}.json
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export function stagingRoot(lang, level) {
  return path.join(ROOT, 'staging', lang, level);
}

export function candidatesDir(lang, level) {
  return path.join(stagingRoot(lang, level), 'candidates');
}

export function indexPath(lang, level) {
  return path.join(stagingRoot(lang, level), 'index.json');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function loadIndex(lang, level) {
  const file = indexPath(lang, level);
  if (!fs.existsSync(file)) {
    return { lang, level, updatedAt: null, candidates: [] };
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function saveIndex(lang, level, index) {
  ensureDir(stagingRoot(lang, level));
  index.updatedAt = new Date().toISOString();
  fs.writeFileSync(indexPath(lang, level), JSON.stringify(index, null, 2) + '\n', 'utf8');
}

export function candidatePath(lang, level, id) {
  return path.join(candidatesDir(lang, level), `${id}.json`);
}

export function loadCandidate(lang, level, id) {
  const file = candidatePath(lang, level, id);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function saveCandidate(candidate) {
  const { lang, level, id } = candidate;
  ensureDir(candidatesDir(lang, level));
  fs.writeFileSync(candidatePath(lang, level, id), JSON.stringify(candidate, null, 2) + '\n', 'utf8');

  const index = loadIndex(lang, level);
  const row = {
    id,
    status: candidate.status,
    module: candidate.module,
    teil: candidate.teil,
    slotType: candidate.slotType || null,
    label: candidate.label || null,
    questionCount: candidate.questions?.length || 0,
    hasPassage: !!(candidate.passage?.text || candidate.passage?.transcript),
    createdAt: candidate.provenance?.createdAt || null,
    updatedAt: new Date().toISOString(),
  };
  const pos = index.candidates.findIndex((c) => c.id === id);
  if (pos >= 0) index.candidates[pos] = row;
  else index.candidates.push(row);
  saveIndex(lang, level, index);
  return candidate;
}

export function listCandidates(lang, level, { status } = {}) {
  const index = loadIndex(lang, level);
  let rows = index.candidates || [];
  if (status) rows = rows.filter((c) => c.status === status);
  return rows.map((row) => loadCandidate(lang, level, row.id)).filter(Boolean);
}

export function newCandidateId(lang, level, module, teil, suffix = '') {
  const base = `stg-${lang}-${level}-${module}-t${teil}${suffix ? `-${suffix}` : ''}`;
  const hash = crypto.createHash('sha256').update(`${base}-${Date.now()}-${Math.random()}`).digest('hex').slice(0, 8);
  return `${base}-${hash}`;
}

export function countByStatus(lang, level) {
  const index = loadIndex(lang, level);
  const counts = { pending: 0, approved: 0, rejected: 0, promoted: 0 };
  for (const row of index.candidates || []) {
    if (counts[row.status] != null) counts[row.status]++;
  }
  return counts;
}
