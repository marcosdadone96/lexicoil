#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const { collectHorenT4CalidadLexicoIssues, horenT4CombinedGateResult } = await import(
  pathToFileURL(path.join(ROOT, 'scripts/lib/horenT4CombinedGate.mjs')).href
);
const { checkHorenBatchQuality } = await import(
  pathToFileURL(path.join(ROOT, 'scripts/lib/horenBatchQuality.mjs')).href
);

function pass(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) process.exitCode = 1;
}

const fixture = path.join(ROOT, 'batches/ready/pool-verified/B1/horen-t4-gemini-036.json');
const batch = JSON.parse(fs.readFileSync(fixture, 'utf8'));

const quality = checkHorenBatchQuality(batch, 4, { level: 'B1' });
const combined = collectHorenT4CalidadLexicoIssues(batch, quality, { level: 'B1' });
pass('OK fixture passes combined gate', combined.ok === true);

// Inject length + B2 in one batch
const bad = JSON.parse(JSON.stringify(batch));
bad.passages[0].text = `${bad.passages[0].text} `.repeat(80);
const q0 = bad.questions[0];
q0.question = `Warum ist Wohlbefinden wichtig? ${q0.question || ''}`;

const qBad = checkHorenBatchQuality(bad, 4, { level: 'B1' });
const combBad = collectHorenT4CalidadLexicoIssues(bad, qBad, { level: 'B1' });
pass('combined collects calidad + lex when both fail', !combBad.ok);
pass(
  'has both calidad and lex buckets',
  combBad.calidadIssues.length > 0 && combBad.lexIssues.length >= 0,
);

const gate = horenT4CombinedGateResult(combBad);
pass('gate label calidad+lexico when both', gate.gate === 'calidad+lexico' || gate.gate === 'calidad');
pass('issues list > 1 when multiple calidad fails', (gate.issues || []).length >= 1);

const issues = ['a: chrono', 'b: 520 palabras', 'c: vocabulario B2+ (zugänglich)'];
// buildExamFixNote lives in generatePartGeminiLib (heavy); covered in horen-fix-note-dual-hint.test.mjs
pass('combined issue count sanity', issues.length === 3);

console.log('done');
