#!/usr/bin/env node
/**
 * Pool content: split separable verbs in text vs vocabularyTags (real engine).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { findSplitSeparablesInText } from '../lib/enrichBatchMetadata.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SeparableResolve = require(path.join(ROOT, 'js/engine/separableResolve.js'));
const allow = SeparableResolve.SEPARABLE_INFINITIVES;

function collectVocabTags(batch) {
  const tags = new Set();
  for (const q of batch.questions || []) {
    for (const t of q.vocabularyTags || []) tags.add(String(t).toLowerCase());
  }
  return tags;
}

function collectText(batch) {
  const parts = [];
  for (const p of batch.passages || []) parts.push(p.text, p.transcript, p.title);
  for (const q of batch.questions || []) {
    parts.push(q.question, q.explanation, ...(q.options || []));
  }
  return parts.filter(Boolean).join('\n');
}

function tagCoversInfinitive(tags, inf) {
  const low = inf.toLowerCase();
  if (tags.has(low)) return true;
  for (const t of tags) {
    if (t === low || t.endsWith(low) || low.includes(t)) return true;
  }
  return false;
}

const SAMPLE = {
  B1: [
    'horen-t2-gemini-033.json',
    'horen-t4-gemini-034.json',
    'lesen-t2-gemini-113.json',
    'lesen-t2-gemini-165.json',
    'lesen-t4-gemini-097.json',
    'lesen-t5-gemini-115.json',
  ],
  B2: [
    'horen-t2-gemini-113.json',
    'lesen-t2-gemini-167.json',
    'lesen-t4-gemini-086.json',
    'lesen-t5-gemini-109.json',
  ],
};

const report = { at: new Date().toISOString(), engine: 'findSplitSeparablesInText', levels: {} };

for (const [level, files] of Object.entries(SAMPLE)) {
  const rows = [];
  for (const file of files) {
    const abs = path.join(ROOT, 'batches/ready/pool-verified', level, file);
    if (!fs.existsSync(abs)) continue;
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const text = collectText(batch);
    const tags = collectVocabTags(batch);
    const found = findSplitSeparablesInText(text);
    for (const inf of found) {
      const inAllow = allow.has(inf);
      const inTags = tagCoversInfinitive(tags, inf);
      rows.push({
        file,
        infinitive: inf,
        inAllowlist: inAllow,
        inVocabularyTags: inTags,
        status: inAllow && inTags ? 'ok' : inAllow && !inTags ? 'tag_gap' : !inAllow && inTags ? 'allowlist_gap' : 'both_gap',
      });
    }
  }
  report.levels[level] = {
    sampled: files.length,
    splitSeparablesFound: rows.length,
    ok: rows.filter((r) => r.status === 'ok').length,
    tag_gap: rows.filter((r) => r.status === 'tag_gap').length,
    rows,
  };
}

const out = path.join(ROOT, 'batches/ready/gate-logs/preventive-separable-content-2026-08-05.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
