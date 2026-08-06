#!/usr/bin/env node
/**
 * Real probe: Hören T1 + T4 with exactly 2 explicit target words each.
 * Measures integration via TargetUsage (runtime shell) + per-passage distribution for T1.
 *
 * Run: NODE_OPTIONS=--use-system-ca node scripts/probe-horen-t1-t4-two-word-2026-07-13.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadEnvFile } from './lib/loadEnv.mjs';
import { generateExamPartSingle } from './lib/generatePartGeminiLib.mjs';
import { computeVocabFeedback } from './lib/generationFeedback.mjs';

loadEnvFile();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const TargetUsage = require(path.join(ROOT, 'js/engine/targetUsage.js'));
const OUT = path.join(ROOT, 'batches/ready/gate-logs/horen-t1-t4-two-word-probe-2026-07-13.json');

/** Build runtime-like hören shell so TargetUsage scans all T1 audios / T4 debate text. */
function batchToHorenShell(batch) {
  const teil = Number(batch.teil ?? batch.passages?.[0]?.teil ?? 0);
  const questions = batch.questions || [];

  if (teil === 1 && Array.isArray(batch.passages) && batch.passages.length >= 2) {
    const byPassage = new Map();
    for (const q of questions) {
      const pid = String(q.passageId || q.passage_id || '').trim();
      if (!byPassage.has(pid)) byPassage.set(pid, []);
      byPassage.get(pid).push(q);
    }
    const segments = batch.passages.map((p, i) => {
      const pid = String(p.id || p.passageId || `s${i + 1}`);
      return {
        id: pid,
        label: p.title || `Aufnahme ${i + 1}`,
        transcript: p.text || p.transcript || '',
        questions: byPassage.get(pid) || byPassage.get(p.id) || [],
      };
    });
    return { horenParts: [{ teil: 1, segments, questions }] };
  }

  const text =
    batch.passages?.map((p) => p.text || p.transcript || '').join('\n') ||
    batch.passages?.[0]?.text ||
    '';
  return {
    horenParts: [
      {
        teil,
        transcript: text,
        segments: [{ transcript: text, questions }],
        questions,
      },
    ],
  };
}

function perPassageHits(batch, words) {
  const passages = batch.passages || [];
  return passages.map((p, i) => {
    const text = p.text || p.transcript || '';
    const hits = (words || []).filter((w) => {
      const tokens = TargetUsage.extractTokens(text);
      return tokens.some((t) => TargetUsage.tokenMatchesWord(t, w));
    });
    return { index: i + 1, title: p.title || null, hits, hitCount: hits.length };
  });
}

const PROBES = [
  { module: 'horen', teil: 1, topic: 'Reisen', words: ['urlaub', 'hotel'] },
  { module: 'horen', teil: 1, topic: 'Gesundheit', words: ['fitness', 'therapie'] },
  { module: 'horen', teil: 4, topic: 'Wohnen', words: ['nachbar', 'miete'] },
  { module: 'horen', teil: 4, topic: 'Freizeit', words: ['sport', 'hobby'] },
];

async function runProbe(probe, index) {
  const t0 = Date.now();
  const common = {
    topic: probe.topic,
    words: probe.words,
    fixRetries: 2,
    maxApiCalls: 25,
    keepFailed: true,
    pauseMs: 4000,
  };

  const result = await generateExamPartSingle({
    module: probe.module,
    teil: probe.teil,
    ...common,
  });

  let feedback = null;
  let runtimeUsage = null;
  let passageDist = null;
  let legacyFeedback = null;

  if (result.ok && result.file) {
    const abs = path.isAbsolute(result.file) ? result.file : path.join(ROOT, result.file);
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const requested = probe.words;

    legacyFeedback = computeVocabFeedback(batch, requested, {
      topic: probe.topic,
      prompted: requested,
    });

    const shell = batchToHorenShell(batch);
    runtimeUsage = TargetUsage.deriveTargetUsage(shell, requested);
    const used = runtimeUsage.map((u) => u.word);
    const usedSet = new Set(used.map((w) => w.toLowerCase()));
    feedback = {
      used,
      notUsed: requested.filter((w) => !usedSet.has(w.toLowerCase())),
      ratio: requested.length ? used.length / requested.length : 0,
      targetUsage: runtimeUsage,
    };

    if (probe.teil === 1) {
      passageDist = perPassageHits(batch, requested);
    }
    if (probe.teil === 4) {
      const text = batch.passages?.[0]?.text || '';
      const speakerHits = {};
      for (const line of text.split('\n')) {
        const m = line.match(/^([^:]+):/);
        if (!m) continue;
        const speaker = m[1].trim();
        const hits = requested.filter((w) => {
          const tokens = TargetUsage.extractTokens(line);
          return tokens.some((t) => TargetUsage.tokenMatchesWord(t, w));
        });
        if (hits.length) speakerHits[speaker] = hits;
      }
      passageDist = { speakerHits, lineCount: text.split('\n').filter(Boolean).length };
    }
  }

  return {
    index,
    ...probe,
    ok: !!result.ok,
    file: result.file || null,
    reason: result.reason || null,
    apiCalls: result.apiCalls,
    ms: Date.now() - t0,
    requested: probe.words.length,
    used: feedback?.used?.length ?? null,
    usedWords: feedback?.used ?? null,
    notUsed: feedback?.notUsed ?? null,
    bothHit: feedback ? feedback.used.length >= 2 : false,
    ratio: feedback?.ratio ?? null,
    legacyUsed: legacyFeedback?.used?.length ?? null,
    legacyBothHit: legacyFeedback ? legacyFeedback.used.length >= 2 : false,
    passageDist,
    targetUsage: feedback?.targetUsage ?? null,
  };
}

console.log('Probe: Hören T1/T4 — 2-word explicit target integration (6 parts)\n');

const results = [];
for (let i = 0; i < PROBES.length; i++) {
  const p = PROBES[i];
  console.log(`[${i + 1}/${PROBES.length}] horen T${p.teil} ${p.topic}: ${p.words.join(', ')}`);
  const row = await runProbe(p, i);
  results.push(row);
  const mark = row.bothHit ? 'OK 2/2' : row.ok ? `PARTIAL ${row.used}/2` : 'FAIL';
  const legacy = row.legacyBothHit ? 'legacy-2/2' : row.ok ? `legacy-${row.legacyUsed}/2` : 'legacy-fail';
  console.log(`   → ${mark} (${legacy}) · apiCalls=${row.apiCalls} · ${(row.ms / 1000).toFixed(0)}s`);
  if (row.passageDist) {
    if (Array.isArray(row.passageDist)) {
      const withHits = row.passageDist.filter((x) => x.hitCount > 0);
      console.log(`   → T1 passage hits: ${withHits.length}/5 audios (${withHits.map((x) => `#${x.index}:${x.hits.join('+')}`).join(', ') || 'none'})`);
    } else if (row.passageDist.speakerHits) {
      const sp = Object.entries(row.passageDist.speakerHits)
        .map(([k, v]) => `${k}:${v.join('+')}`)
        .join(', ');
      console.log(`   → T4 speaker hits: ${sp || 'none'}`);
    }
  }
  console.log('');
}

const okRows = results.filter((r) => r.ok);
const both = okRows.filter((r) => r.bothHit);
const t1 = results.filter((r) => r.teil === 1);
const t4 = results.filter((r) => r.teil === 4);

const summary = {
  generatedAt: new Date().toISOString(),
  probes: results,
  okCount: okRows.length,
  bothHitCount: both.length,
  bothHitRateOnOk: okRows.length ? both.length / okRows.length : null,
  t1: {
    ok: t1.filter((r) => r.ok).length,
    bothHit: t1.filter((r) => r.bothHit).length,
    avgPassagesWithHits:
      t1.filter((r) => Array.isArray(r.passageDist)).length
        ? t1
            .filter((r) => Array.isArray(r.passageDist))
            .reduce((s, r) => s + r.passageDist.filter((x) => x.hitCount > 0).length, 0) /
          t1.filter((r) => Array.isArray(r.passageDist)).length
        : null,
  },
  t4: {
    ok: t4.filter((r) => r.ok).length,
    bothHit: t4.filter((r) => r.bothHit).length,
  },
  totalApiCalls: results.reduce((s, r) => s + (r.apiCalls || 0), 0),
  verdict:
    both.length === okRows.length && okRows.length === PROBES.length
      ? 'integrate_without_changes'
      : okRows.length === PROBES.length && both.length >= okRows.length * 0.67
        ? 'integrate_with_monitoring'
        : 'needs_prompt_adjustment',
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log('Summary:', JSON.stringify(summary, null, 2));
console.log('Written:', OUT);
