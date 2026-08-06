/**
 * sprechenPremiseDedup.mjs — fingerprint (T1 premise + T2 topic) for Sprechen sets (SP-2.4).
 *
 * Existing duplicates are reported, not deleted. Generation excludes known fingerprints
 * via prompt block; promote-to-ready can call assertSprechenPremiseUnique.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

const POOL_DIRS = [
  path.join(ROOT, 'batches/generated'),
  path.join(ROOT, 'batches/merged'),
  path.join(ROOT, 'batches/ready'),
];

function fold(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[„“”"']/g, '')
    .replace(/[^a-z0-9äöüß\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** First ~120 chars of T1 situation (before bullet list). */
export function extractT1Premise(question) {
  const q = String(question || '');
  const cut = q.split(/\n\n|\n(?=Datum|Wann|Welchen|Was |Wer |Wo |Wie |•|\*|- |\d\.)/)[0] || q;
  const folded = fold(cut);
  // Keep distinctive nouns/verbs — truncate for fingerprint stability
  return folded.slice(0, 160);
}

/** Presentation topic from T2 consigna. */
export function extractT2Topic(question) {
  const q = String(question || '');
  const m =
    q.match(/[Tt]hema[:\s]+[„"«]?([^„"»\n.]+)[„"»]?/) ||
    q.match(/[Pp]räsentation zum Thema\s+[„"«]?([^„"»\n.]+)/) ||
    q.match(/[Hh]alten Sie[^.]*?[„«"]([^„"»]+)[„"»]/);
  if (m) return fold(m[1]).slice(0, 100);
  return fold(q).slice(0, 100);
}

/**
 * @param {object} batch — { questions: [...] }
 * @returns {{ t1: string, t2: string, key: string }|null}
 */
export function sprechenSetFingerprint(batch) {
  const qs = batch?.questions || [];
  const t1 = qs.find((q) => Number(q.teil) === 1);
  const t2 = qs.find((q) => Number(q.teil) === 2);
  if (!t1 || !t2) return null;
  const premise = extractT1Premise(t1.question);
  const topic = extractT2Topic(t2.question);
  if (!premise || !topic) return null;
  return { t1: premise, t2: topic, key: `${premise}||${topic}` };
}

function listSprechenFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^sprechen/i.test(f) && f.endsWith('.json') && !f.startsWith('.'))
    .map((f) => path.join(dir, f));
}

/**
 * Scan pool and return fingerprint → files map.
 */
export function collectSprechenFingerprints(dirs = POOL_DIRS) {
  /** @type {Map<string, { key: string, t1: string, t2: string, files: string[] }>} */
  const map = new Map();
  for (const dir of dirs) {
    for (const abs of listSprechenFiles(dir)) {
      let batch;
      try {
        batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
      } catch {
        continue;
      }
      const fp = sprechenSetFingerprint(batch);
      if (!fp) continue;
      const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
      if (!map.has(fp.key)) map.set(fp.key, { key: fp.key, t1: fp.t1, t2: fp.t2, files: [] });
      map.get(fp.key).files.push(rel);
    }
  }
  return map;
}

/** Duplicate groups only (files.length >= 2). */
export function findSprechenPremiseDuplicates(dirs = POOL_DIRS) {
  return [...collectSprechenFingerprints(dirs).values()].filter((g) => g.files.length >= 2);
}

/** Soft near-dup: same T1 premise OR same T2 topic across different keys. */
export function findSprechenPremiseOverlaps(dirs = POOL_DIRS) {
  const all = [...collectSprechenFingerprints(dirs).values()];
  const byT1 = new Map();
  const byT2 = new Map();
  for (const g of all) {
    if (!byT1.has(g.t1)) byT1.set(g.t1, []);
    byT1.get(g.t1).push(g);
    if (!byT2.has(g.t2)) byT2.set(g.t2, []);
    byT2.get(g.t2).push(g);
  }
  const overlaps = [];
  for (const [t1, groups] of byT1) {
    const files = [...new Set(groups.flatMap((g) => g.files))];
    if (files.length >= 2) overlaps.push({ kind: 't1_premise', value: t1, files });
  }
  for (const [t2, groups] of byT2) {
    const files = [...new Set(groups.flatMap((g) => g.files))];
    if (files.length >= 2) overlaps.push({ kind: 't2_topic', value: t2, files });
  }
  return overlaps;
}

/**
 * Prompt block: list used premises/topics to avoid.
 */
export function buildSprechenPremiseExcludePromptBlock(dirs = POOL_DIRS) {
  const fps = [...collectSprechenFingerprints(dirs).values()];
  if (!fps.length) return '';
  const lines = fps
    .slice(0, 40)
    .map((g) => `- NO repetir: T1≈«${g.t1.slice(0, 70)}…» + T2≈«${g.t2.slice(0, 50)}»`)
    .join('\n');
  return (
    `\n\n## PREMISAS YA USADAS (PROHIBIDO repetir el mismo set)\n` +
    `Fingerprint = premisa T1 + tema T2. Elige situación y tema distintos.\n` +
    `${lines}\n`
  );
}

/**
 * Gate for promote-to-ready: block if exact fingerprint already in pool
 * (excluding selfSource).
 * @returns {{ ok: boolean, issue?: string, match?: string }}
 */
export function assertSprechenPremiseUnique(batch, opts = {}) {
  const fp = sprechenSetFingerprint(batch);
  if (!fp) return { ok: true };
  const self = (opts.selfSource || '').replace(/\\/g, '/');
  const map = collectSprechenFingerprints(opts.dirs || POOL_DIRS);
  const hit = map.get(fp.key);
  if (!hit) return { ok: true };
  const others = hit.files.filter((f) => f !== self);
  if (!others.length) return { ok: true };
  return {
    ok: false,
    issue: `Sprechen premise duplicate: same T1+T2 fingerprint as ${others.join(', ')}`,
    match: others[0],
  };
}
