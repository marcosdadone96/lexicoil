#!/usr/bin/env node
/**
 * PASO 8 — Audit a generated part JSON against known feedback avoid-phrases.
 *
 *   node scripts/audit-generated-with-feedback.mjs --file batches/generated/lesen-t1-….json
 *   node scripts/audit-generated-with-feedback.mjs --pair generation-evaluation/pairs/pair-001
 *
 * Does NOT mutate content. Compares presence of known "avoid" strings and basic B1 signals.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { listFeedback } = require(path.join(ROOT, 'netlify/functions/lib/generationFeedbackStore.js'));

function parseArgs(argv) {
  const out = { file: null, pair: null, feedbackFile: null, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--file' && argv[i + 1]) out.file = argv[++i];
    else if (a === '--pair' && argv[i + 1]) out.pair = argv[++i];
    else if (a === '--feedback-file' && argv[i + 1]) out.feedbackFile = argv[++i];
  }
  return out;
}

function collectText(batch) {
  const chunks = [];
  for (const p of batch.passages || []) {
    if (p?.text) chunks.push(String(p.text));
    if (p?.title) chunks.push(String(p.title));
    if (p?.transcript) chunks.push(String(p.transcript));
  }
  for (const q of batch.questions || []) {
    if (q?.question) chunks.push(String(q.question));
    if (q?.explanation) chunks.push(String(q.explanation));
    if (q?.statement) chunks.push(String(q.statement));
    if (Array.isArray(q?.options)) {
      for (const o of q.options) {
        chunks.push(typeof o === 'string' ? o : String(o?.text || o?.key || ''));
      }
    }
    if (Array.isArray(q?.vocabularyTags)) chunks.push(q.vocabularyTags.join(' '));
    if (Array.isArray(q?.grammarTags)) chunks.push(`grammar:${q.grammarTags.join(',')}`);
  }
  return chunks.join('\n');
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function analyzeBatch(batch, avoidRules) {
  const text = collectText(batch);
  const lower = text.toLowerCase();
  const hits = [];
  for (const rule of avoidRules) {
    const avoid = String(rule.avoid || rule.wrong || '').trim();
    if (!avoid || avoid.length < 4) continue;
    if (lower.includes(avoid.toLowerCase())) {
      hits.push({
        id: rule.id,
        type: rule.type,
        avoid,
        status: rule.status,
      });
    }
  }

  const questions = batch.questions || [];
  const withVocab = questions.filter((q) => Array.isArray(q.vocabularyTags) && q.vocabularyTags.length).length;
  const withGrammar = questions.filter((q) => Array.isArray(q.grammarTags) && q.grammarTags.length).length;
  const difficulties = questions.map((q) => q.difficulty).filter((d) => d != null);
  const avgDifficulty =
    difficulties.length > 0
      ? difficulties.reduce((a, b) => a + Number(b), 0) / difficulties.length
      : null;

  const artificialHits = [
    'ein bericht zeigt',
    'laut einer studie',
    'experts say',
    'in der heutigen zeit',
  ].filter((p) => lower.includes(p));

  return {
    sourceFile: batch._sourceFile || null,
    module: batch.module || questions[0]?.module || null,
    generationMetadata: batch.generationMetadata || null,
    knownAvoidHits: hits,
    knownAvoidHitCount: hits.length,
    artificialPhraseHits: artificialHits,
    questionCount: questions.length,
    passageCount: (batch.passages || []).length,
    vocabTagCoverage: questions.length ? withVocab / questions.length : 0,
    grammarTagCoverage: questions.length ? withGrammar / questions.length : 0,
    avgDifficulty,
    wordCountApprox: text.split(/\s+/).filter(Boolean).length,
  };
}

async function loadAvoidRules(args) {
  if (args.feedbackFile) {
    const data = loadJson(path.resolve(ROOT, args.feedbackFile));
    const list = Array.isArray(data) ? data : data.feedback || data.rules || [];
    return list;
  }
  // Prefer latest audit export if present
  const auditPath = path.join(ROOT, 'generation-evaluation', 'feedback-audit-latest.json');
  if (fs.existsSync(auditPath)) {
    // audit doesn't embed full records — fall back to empty avoid list unless Blobs
  }
  try {
    const { getStore } = await import('@netlify/blobs');
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_BLOBS_TOKEN;
    if (siteID && token) {
      const store = getStore({ name: 'lexicoil-data', siteID, token });
      const listed = await listFeedback(store, { status: 'all', limit: 500 });
      return (listed.feedback || []).filter((f) => f.status === 'active' || f.status === 'approved');
    }
  } catch (_) {
    /* ignore */
  }
  return [];
}

function comparePair(offAnalysis, onAnalysis) {
  return {
    avoidHitsDelta: (offAnalysis.knownAvoidHitCount || 0) - (onAnalysis.knownAvoidHitCount || 0),
    artificialDelta:
      (offAnalysis.artificialPhraseHits?.length || 0) - (onAnalysis.artificialPhraseHits?.length || 0),
    improvedAvoid:
      (onAnalysis.knownAvoidHitCount || 0) < (offAnalysis.knownAvoidHitCount || 0),
    improvedArtificial:
      (onAnalysis.artificialPhraseHits?.length || 0) < (offAnalysis.artificialPhraseHits?.length || 0),
    off: offAnalysis,
    on: onAnalysis,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || (!args.file && !args.pair)) {
    console.log(`Usage:
  node scripts/audit-generated-with-feedback.mjs --file path/to/part.json
  node scripts/audit-generated-with-feedback.mjs --pair generation-evaluation/pairs/pair-001
`);
    process.exit(args.help ? 0 : 1);
  }

  const avoidRules = await loadAvoidRules(args);

  if (args.pair) {
    const dir = path.resolve(ROOT, args.pair);
    const offPath = path.join(dir, 'without-feedback.json');
    const onPath = path.join(dir, 'with-feedback.json');
    if (!fs.existsSync(offPath) || !fs.existsSync(onPath)) {
      console.error('Pair needs without-feedback.json and with-feedback.json');
      process.exit(1);
    }
    const offA = analyzeBatch(loadJson(offPath), avoidRules);
    const onA = analyzeBatch(loadJson(onPath), avoidRules);
    const cmp = comparePair(offA, onA);
    const out = { pair: args.pair, comparedAt: new Date().toISOString(), ...cmp };
    console.log(JSON.stringify(out, null, 2));
    const reportPath = path.join(dir, 'audit-report.json');
    fs.writeFileSync(reportPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
    console.error(`Wrote ${path.relative(ROOT, reportPath)}`);
    return;
  }

  const file = path.resolve(ROOT, args.file);
  const batch = loadJson(file);
  batch._sourceFile = path.relative(ROOT, file).replace(/\\/g, '/');
  const analysis = analyzeBatch(batch, avoidRules);
  console.log(JSON.stringify(analysis, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
