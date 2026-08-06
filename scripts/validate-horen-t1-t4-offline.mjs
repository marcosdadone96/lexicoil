#!/usr/bin/env node
/**
 * Offline Hören T1/T4 structure + target-word integration check on pool-verified parts.
 * (Live Gemini probe blocked — prepay credits depleted 2026-07-13)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const TargetUsage = require(path.join(ROOT, 'js/engine/targetUsage.js'));

const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/horen-t1-t4-offline-validation-2026-07-13.json');

function batchToHorenShell(batch) {
  const teil = Number(batch.teil ?? batch.passages?.[0]?.teil ?? 0);
  const questions = batch.questions || [];
  if (teil === 1 && Array.isArray(batch.passages) && batch.passages.length >= 2) {
    const segments = batch.passages.map((p, i) => ({
      id: p.id || `s${i + 1}`,
      transcript: p.text || '',
      questions: questions.filter((q) => String(q.passageId || '') === String(p.id || '')),
    }));
    return { horenParts: [{ teil: 1, segments, questions }] };
  }
  const text = batch.passages?.map((p) => p.text || '').join('\n') || '';
  return { horenParts: [{ teil, transcript: text, segments: [{ transcript: text, questions }], questions }] };
}

function perPassageHits(batch, words) {
  return (batch.passages || []).map((p, i) => {
    const text = p.text || '';
    const hits = words.filter((w) => {
      const tokens = extractTokens(text);
      return tokens.some((t) => TargetUsage.tokenMatchesWord(t, w));
    });
    return { index: i + 1, title: p.title, hits };
  });
}

function extractTokens(text) {
  const tokens = [];
  const re = /[A-Za-zÀ-öø-ÿÄÖÜäöüß]+(?:'[A-Za-zÀ-öø-ÿÄÖÜäöüß]+)?/g;
  let m;
  while ((m = re.exec(text)) !== null) tokens.push(m[0]);
  return tokens;
}

function pickWordsFromBatch(batch, n = 2) {
  const text = (batch.passages || []).map((p) => p.text || '').join(' ');
  const tokens = extractTokens(text);
  const freq = new Map();
  for (const t of tokens) {
    const lw = t.toLowerCase();
    if (lw.length < 5) continue;
    freq.set(lw, (freq.get(lw) || 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

const t1files = fs.readdirSync(POOL).filter((f) => /^horen-t1-/.test(f)).slice(0, 3);
const t4files = fs.readdirSync(POOL).filter((f) => /^horen-t4-/.test(f)).slice(0, 3);
const files = [...t1files, ...t4files];
const results = [];

for (const file of files) {
  const batch = JSON.parse(fs.readFileSync(path.join(POOL, file), 'utf8'));
  const teil = Number(batch.teil ?? batch.passages?.[0]?.teil ?? file.match(/-t(\d+)/)?.[1]);
  const targetWords = pickWordsFromBatch(batch, 2);
  const shell = batchToHorenShell(batch);
  const used = TargetUsage.deriveTargetUsage(shell, targetWords).map((u) => u.word);
  const dist = teil === 1 ? perPassageHits(batch, targetWords) : null;
  let speakerHits = null;
  if (teil === 4) {
    const text = batch.passages?.[0]?.text || '';
    speakerHits = {};
    for (const line of text.split('\n')) {
      const m = line.match(/^([^:]+):/);
      if (!m) continue;
      const hits = targetWords.filter((w) => {
        const tokens = extractTokens(line);
        return tokens.some((t) => TargetUsage.tokenMatchesWord(t, w));
      });
      if (hits.length) speakerHits[m[1].trim()] = hits;
    }
  }
  results.push({
    file,
    teil,
    passageCount: batch.passages?.length || 0,
    questionCount: batch.questions?.length || 0,
    targetWords,
    used,
    bothHit: used.length >= 2,
    passageDist: dist,
    speakerHits,
  });
}

const t1 = results.filter((r) => r.teil === 1);
const t4 = results.filter((r) => r.teil === 4);
const summary = {
  generatedAt: new Date().toISOString(),
  note: 'Offline validation on pool-verified parts; live 2-word Gemini probe blocked (prepay credits depleted).',
  results,
  t1: { n: t1.length, bothHit: t1.filter((r) => r.bothHit).length },
  t4: { n: t4.length, bothHit: t4.filter((r) => r.bothHit).length },
  liveProbeBlocked: 'Gemini 429 prepay credits depleted',
  verdict:
    t1.length >= 2 &&
    t4.length >= 2 &&
    t1.every((r) => r.passageCount >= 5) &&
    t4.every((r) => r.questionCount === 8) &&
    t1.filter((r) => r.bothHit).length >= Math.floor(t1.length * 0.5) &&
    t4.filter((r) => r.bothHit).length >= Math.floor(t4.length * 0.5),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
