#!/usr/bin/env node
/**
 * Smoke batch post-fix: 12 generaciones reales con logs completos por intento.
 * Run: node scripts/run-post-fix-smoke-batch.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { HOREN_T2_BANNED_OPENING_RES } from './lib/horenOpeningsBank.mjs';
import { topicKeywordPool } from './lib/coverageRegistry.mjs';
import { createRequire } from 'node:module';

loadEnvFile();

const require = createRequire(import.meta.url);
const { TOPIC_KEYWORDS } = require(path.join(ROOT, 'js/engine/partTopicDetect.js'));

const LOG_DIR = path.join(ROOT, 'batches', 'ready', 'gate-logs', 'smoke-post-fix-2026-07-22');
const SUMMARY_PATH = path.join(LOG_DIR, 'smoke-summary.json');

/** @type {Array<{id:string, label:string, argv:string[], sharedKey?:string}>} */
const JOBS = [
  { id: '01-lesen-t1', label: 'Lesen T1 · tema libre', argv: ['scripts/generate-lesen-part-gemini.mjs', '--teil', '1', '--from-coverage', '--count', '1', '--max-api-calls', '45'] },
  { id: '02-lesen-t2', label: 'Lesen T2 · tema libre', argv: ['scripts/generate-lesen-part-gemini.mjs', '--teil', '2', '--from-coverage', '--count', '1', '--max-api-calls', '45'] },
  { id: '03-lesen-t4-umwelt', label: 'Lesen T4 · Umwelt (control)', argv: ['scripts/generate-lesen-part-gemini.mjs', '--teil', '4', '--topic', 'Umwelt', '--from-coverage', '--count', '1', '--max-api-calls', '45'] },
  { id: '04-lesen-t5-umwelt', label: 'Lesen T5 · Umwelt (control)', argv: ['scripts/generate-lesen-part-gemini.mjs', '--teil', '5', '--topic', 'Umwelt', '--from-coverage', '--count', '1', '--max-api-calls', '45'] },
  { id: '05-lesen-t5-technik', label: 'Lesen T5 · Technik (estrés from-coverage)', argv: ['scripts/generate-lesen-part-gemini.mjs', '--teil', '5', '--topic', 'Technik', '--from-coverage', '--count', '1', '--max-api-calls', '45'] },
  { id: '06-horen-t1', label: 'Hören T1 · tema libre', argv: ['scripts/generate-part-gemini.mjs', '--module', 'horen', '--teil', '1', '--from-coverage', '--count', '1', '--max-api-calls', '45'] },
  { id: '07-horen-t2-freizeit', label: 'Hören T2 · Freizeit', argv: ['scripts/generate-part-gemini.mjs', '--module', 'horen', '--teil', '2', '--topic', 'Freizeit', '--from-coverage', '--count', '1', '--max-api-calls', '45', '--fix-retries', '2'] },
  { id: '08-horen-t2-sport', label: 'Hören T2 · Sport', argv: ['scripts/generate-part-gemini.mjs', '--module', 'horen', '--teil', '2', '--topic', 'Sport', '--from-coverage', '--count', '1', '--max-api-calls', '45', '--fix-retries', '2'] },
  { id: '09-horen-t3', label: 'Hören T3 · tema libre', argv: ['scripts/generate-part-gemini.mjs', '--module', 'horen', '--teil', '3', '--from-coverage', '--count', '1', '--max-api-calls', '45'] },
  { id: '10-horen-t4', label: 'Hören T4 · tema libre', argv: ['scripts/generate-part-gemini.mjs', '--module', 'horen', '--teil', '4', '--from-coverage', '--count', '1', '--max-api-calls', '45'] },
  { id: '11-schreiben-set', label: 'Schreiben T1–T3 · tema libre', argv: ['scripts/generate-part-gemini.mjs', '--module', 'schreiben', '--from-coverage', '--count', '1', '--max-api-calls', '60', '--fix-retries', '3'] },
  { id: '12-sprechen-set', label: 'Sprechen T1–T3 · tema libre', argv: ['scripts/generate-part-gemini.mjs', '--module', 'sprechen', '--from-coverage', '--count', '1', '--max-api-calls', '60', '--fix-retries', '3'] },
];

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function extractFromLog(text) {
  const out = {
    exitHint: null,
    wordsLine: text.match(/Palabras(?: \(objetivo\))?(?: por parte)?:?\s*(?:\(\d+\):\s*)?([^\n]+)/i)?.[1]?.trim() || null,
    vocabRatioLine: text.match(/Vocabulario:\s*(\d+)\s*de\s*(\d+)[^\n]*/i)?.[0] || null,
    vocabRatio: null,
    topicLine: text.match(/Tema:\s*([^\n(]+)/i)?.[1]?.trim() || null,
    subtypeLine: text.match(/T5 subtipo:[^\n]+/i)?.[0] || text.match(/subtipo[^\n]+/i)?.[0] || null,
    savedFile: text.match(/Guardado:\s*([^\n]+)/i)?.[1]?.trim() || text.match(/pool-verified[^\s]+\.json/i)?.[0] || null,
    discarded: /DESCARTADO|descartadas: 1|Partes descartadas: 1/i.test(text) && !/Partes descartadas: 0/.test(text),
    ok: /· OK ·|Partes guardadas \(formato \+ calidad OK\): 1|poolReady\] READY/i.test(text),
    apiCalls: text.match(/Llamadas API Gemini:\s*(\d+)/i)?.[1] || null,
    cost: text.match(/\$([0-9.]+)\s*total/i)?.[1] || null,
    retries: [...text.matchAll(/Reintento \d+\/\d+ · ([^\n]+)/gi)].map((m) => m[1].trim()),
    gateFails: [...text.matchAll(/Calidad pedagógica FAIL[^\n]*\n([\s\S]*?)(?=\n(?:Avisos|Triaje|Reintento|Validando|Guardado|──|══|$))/gi)].map((m) => m[0].trim()),
    auditBlocked: text.match(/Audit-pass-2 BLOQUEADO:[^\n]+/i)?.[0] || null,
    circuitBreaker: text.match(/circuit.?breaker[^\n]+/i)?.[0] || null,
    horenOpening: text.match(/APERTURA OBLIGATORIA[^\n«]*«([^»]+)/i)?.[1] || null,
  };
  const vr = text.match(/Vocabulario:\s*(\d+)\s*de\s*(\d+)/i);
  if (vr) out.vocabRatio = { used: Number(vr[1]), total: Number(vr[2]), ratio: Number(vr[1]) / Number(vr[2]) };
  const ratioMeta = text.match(/"ratio":\s*([0-9.]+)/);
  if (ratioMeta) out.ratioFromJson = Number(ratioMeta[1]);
  return out;
}

function topicAlignment(wordsStr, topic) {
  if (!wordsStr || !topic) return null;
  const words = wordsStr.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
  const pool = new Set(topicKeywordPool(topic, 'de', 'B1'));
  const strictKw = new Set((TOPIC_KEYWORDS[topic] || []).map((w) => w.toLowerCase()));
  let bankHits = 0;
  let kwHits = 0;
  for (const w of words) {
    if (pool.has(w)) bankHits++;
    if ([...strictKw].some((k) => w.includes(k) || k.includes(w))) kwHits++;
  }
  return { words, bankHits, kwHits, total: words.length };
}

function checkHorenOpening(batchPath) {
  if (!batchPath || !fs.existsSync(batchPath)) return null;
  try {
    const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
    const text = (batch.passages || batch.segments || [])
      .map((p) => p.text || p.transcript || p.script || '')
      .join(' ');
    const opening = text.slice(0, 120);
    const banned = HOREN_T2_BANNED_OPENING_RES.filter((re) => re.test(text)).map(String);
    return { opening, bannedHit: banned.length > 0, banned };
  } catch {
    return null;
  }
}

function findLatestOutput(module, teil, sinceMs) {
  const dirs = [
    path.join(ROOT, 'batches', 'ready', 'pool-verified', 'B1'),
    path.join(ROOT, 'batches', 'generated', 'B1'),
  ];
  const patterns = [];
  if (module === 'lesen') patterns.push(`lesen-t${teil}-gemini-`);
  else patterns.push(`${module}-`);

  let best = null;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      if (module === 'lesen' && !f.startsWith(`lesen-t${teil}-`)) continue;
      if (module !== 'lesen' && !f.startsWith(`${module}-`)) continue;
      const full = path.join(dir, f);
      const st = fs.statSync(full);
      if (sinceMs && st.mtimeMs < sinceMs) continue;
      if (!best || st.mtimeMs > best.mtimeMs) best = { path: full, mtimeMs: st.mtimeMs };
    }
  }
  return best?.path || null;
}

function readBatchMeta(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const b = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      path: filePath,
      topicTag: b.topicTag || b._requestedTopic || b.passages?.[0]?.topicTag,
      userVocabFeedback: b.userVocabFeedback,
      _textSubtype: b._textSubtype,
      title: b.passages?.[0]?.title,
    };
  } catch {
    return null;
  }
}

function runJob(job) {
  ensureDir(LOG_DIR);
  const logPath = path.join(LOG_DIR, `${job.id}.log`);
  const started = Date.now();
  console.log(`\n${'═'.repeat(72)}\n▶ ${job.id} · ${job.label}\n${'═'.repeat(72)}`);

  const res = spawnSync(process.execPath, job.argv, {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 50 * 1024 * 1024,
  });

  const combined = [res.stdout || '', res.stderr || ''].filter(Boolean).join('\n');
  fs.writeFileSync(logPath, combined, 'utf8');
  process.stdout.write(combined);

  const parsed = extractFromLog(combined);
  const topicArg = job.argv.includes('--topic') ? job.argv[job.argv.indexOf('--topic') + 1] : parsed.topicLine;
  const alignment = topicAlignment(parsed.wordsLine, topicArg);

  let batchPath = parsed.savedFile;
  if (batchPath && !path.isAbsolute(batchPath)) batchPath = path.join(ROOT, batchPath);
  if (!batchPath || !fs.existsSync(batchPath)) {
    batchPath = findLatestOutput(
      job.id.includes('lesen') ? 'lesen' : job.argv.includes('schreiben') ? 'schreiben' : job.argv.includes('sprechen') ? 'sprechen' : 'horen',
      job.id.match(/t(\d)/)?.[1] ? Number(job.id.match(/t(\d)/)[1]) : null,
      started - 5000,
    );
  }

  const batchMeta = readBatchMeta(batchPath);
  const horenOpening = job.id.includes('horen-t2') ? checkHorenOpening(batchPath) : null;

  return {
    id: job.id,
    label: job.label,
    logPath,
    exitCode: res.status ?? 1,
    durationSec: Math.round((Date.now() - started) / 1000),
    ...parsed,
    requestedTopic: topicArg || null,
    vocabAlignment: alignment,
    batchPath,
    batchMeta,
    horenOpening,
  };
}

function main() {
  ensureDir(LOG_DIR);
  const results = [];
  for (const job of JOBS) {
    results.push(runJob(job));
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  }

  console.log(`\n${'═'.repeat(72)}`);
  console.log('SMOKE BATCH COMPLETE');
  console.log(`Logs: ${LOG_DIR}`);
  console.log(`Summary: ${SUMMARY_PATH}`);
  for (const r of results) {
    const ratio = r.batchMeta?.userVocabFeedback?.ratio ?? r.vocabRatio?.ratio ?? r.ratioFromJson;
    const status = r.exitCode === 0 && r.ok ? 'OK' : 'FAIL';
    console.log(`  [${status}] ${r.id}: exit=${r.exitCode} ratio=${ratio ?? '—'} file=${r.batchPath ?? '—'}`);
  }
}

main();
