#!/usr/bin/env node
/**
 * Scan A2+B1 pool for Lesen T5 root-fix patterns (pre/post repair metrics).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inferLesenT5DominantTopic } from './lib/topicRotation.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const POOLS = [
  path.join(ROOT, 'batches/ready/pool-verified/B1'),
  path.join(ROOT, 'batches/ready/pool-verified/A2'),
];

const FAMILY_RE =
  /\b(Weniger|Langen|Bisschen|Paar|Vielen|Täglichen|Wichtig|Verglichen|Wenige)\b/g;

function familyHitsInText(text) {
  const hits = [];
  for (const m of String(text || '').matchAll(FAMILY_RE)) {
    const word = m[0];
    const idx = m.index ?? 0;
    const after = String(text).slice(idx, idx + 40);
    if (word === 'Vielen' && /^Vielen Dank/i.test(after)) continue;
    hits.push(word);
  }
  return hits;
}

const TITLE_BAD_NEUTER_RE =
  /\b(Regeln|Ordnung|Nutzungsordnung|Hausordnung|Benutzungsordnung|Richtlinien)\s+(der|in der)\s+(Bürgerzentrum|Freizeitzentrum|Fitnessstudio|Stadthalle|Vitalpark|Einkaufszentrum|Computerraum|Schwimmbad)/i;

const WEIL_V2_RE =
  /\bweil\b[^.]{0,80}\b(sind|ist|war|waren|haben|hat)\s+(?:nicht|nur|auch|noch|schon|bereits|weiterhin|generell|grundsätzlich|grundsätzlich|dann|dort|hier|immer|oft|selten)\b/i;
const DOUBLE_DOT_RE = /\.\./;

function listT5Files(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^lesen-t5-.+\.json$/i.test(f))
    .map((f) => path.join(dir, f));
}

function walkStrings(batch, fn) {
  const go = (s) => {
    if (typeof s === 'string') fn(s);
    else if (Array.isArray(s)) s.forEach(go);
    else if (s && typeof s === 'object') Object.values(s).forEach(go);
  };
  go(batch);
}

function institutionCasingHits(batch) {
  const seed = batch._t5InstitutionSeed;
  if (!seed || !/^[A-Z]/.test(seed)) return [];
  const hits = [];
  const wrongParts = seed.split(/\s+/).filter((w) => /^[A-Z]/.test(w));
  walkStrings(batch, (text) => {
    for (const part of wrongParts) {
      const re = new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      if (re.test(text) && !text.includes(part)) {
        const m = text.match(re);
        if (m && m[0] !== part) hits.push({ fragment: m[0], seed });
      }
    }
  });
  return hits;
}

function topicMismatch(batch) {
  const declared = batch.passages?.[0]?.topicTag || batch.topicTag;
  const inferred = inferLesenT5DominantTopic(batch, declared);
  if (!declared || !inferred) return null;
  return declared !== inferred ? { declared, inferred } : null;
}

function scanFile(file) {
  const batch = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const family = [];
  walkStrings(batch, (t) => {
    family.push(...familyHitsInText(t));
  });
  const title = batch.passages?.[0]?.title || '';
  const intro = (batch.passages?.[0]?.text || '').slice(0, 400);
  const titleBad = TITLE_BAD_NEUTER_RE.test(title) || TITLE_BAD_NEUTER_RE.test(intro);
  const weil = [];
  walkStrings(batch, (t) => {
    if (WEIL_V2_RE.test(t)) weil.push(t.slice(0, 160));
    if (DOUBLE_DOT_RE.test(t)) weil.push(`double-dot: ${t.slice(0, 120)}`);
  });
  return {
    file: rel,
    familyHits: [...new Set(family)],
    titleBadNeuter: titleBad,
    titleSnippet: titleBad ? title : null,
    instCasing: institutionCasingHits(batch),
    topic: topicMismatch(batch),
    weilHits: weil,
  };
}

const files = POOLS.flatMap(listT5Files);
const results = files.map(scanFile);

const summary = {
  scanned: results.length,
  familyFiles: results.filter((r) => r.familyHits.length).length,
  titleBadFiles: results.filter((r) => r.titleBadNeuter).length,
  instCasingFiles: results.filter((r) => r.instCasing.length).length,
  topicMismatchFiles: results.filter((r) => r.topic).length,
  weilFiles: results.filter((r) => r.weilHits.length).length,
};

console.log(JSON.stringify({ summary, results }, null, 2));
