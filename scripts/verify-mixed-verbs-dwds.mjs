#!/usr/bin/env node
/**
 * DWDS verification for mixed/strong German verbs + compounds in LexiCoil.
 * Run: node scripts/verify-mixed-verbs-dwds.mjs
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/mixed-verbs-dwds-verify-2026-07-13.json');

globalThis.Lemmatizer = require(path.join(ROOT, 'js/engine/validation/lemmatizer.js'));
globalThis.SeparableResolve = require(path.join(ROOT, 'js/engine/separableResolve.js'));
const VerbConjugation = require(path.join(ROOT, 'js/data/verbConjugation.js'));

const VERBS = [
  'brennen', 'kennen', 'denken', 'nennen', 'rennen', 'senden', 'wenden',
  'anbrennen', 'auskennen', 'kennenlernen', 'anerkennen', 'antreffen',
  'anwenden', 'abwenden',
];

function normHtml(s) {
  return String(s || '').replace(/ß/g, 'ss').replace(/\s+/g, ' ').toLowerCase();
}

function extractDwdsGrammarLine(html) {
  const raw = String(html || '');
  const patterns = [
    /Grammatik\s*Verb[^·]*·\s*([^<\n]+)/i,
    /GrammatikVerb[^·]*·\s*([^<\n]+)/i,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m && m[1]) return m[1].trim().replace(/\s+/g, ' ');
  }
  return '';
}

function htmlNorm(s) {
  let t = String(s || '')
    .replace(/&auml;/gi, 'ä')
    .replace(/&ouml;/gi, 'ö')
    .replace(/&uuml;/gi, 'ü')
    .replace(/&szlig;/gi, 'ß');
  return normHtml(t);
}

function formOnPage(h, form) {
  const n = htmlNorm(form);
  if (h.includes(n)) return true;
  const ae = n.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
  if (h.includes(ae)) return true;
  const parts = n.split(' ');
  if (parts.length === 2) {
    const [root, prefix] = parts;
    const rootPat = root.replace(/[aeiouäöü]/g, '.');
    return new RegExp(`${rootPat}\\s+${prefix}\\b`).test(h);
  }
  return false;
}

async function fetchDwds(lemma) {
  const url = `https://www.dwds.de/wb/${encodeURIComponent(lemma)}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'LexiCoil-mixed-verify/1.0' } });
    return { statusCode: res.status, html: await res.text(), url };
  } catch (_) {
    const ps = execFileSync(
      'powershell',
      ['-NoProfile', '-Command', `(Invoke-WebRequest -Uri '${url.replace(/'/g, "''")}' -UseBasicParsing).Content`],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    );
    return { statusCode: 200, html: ps, url, via: 'powershell' };
  }
}

function sampleForms(verb) {
  const out = {};
  for (const tense of ['present', 'praeteritum', 'perfekt']) {
    const c = VerbConjugation.getConjugation(verb, 'de', tense);
    if (!c?.forms) continue;
    const pick = { er: c.forms.er };
    if (tense === 'perfekt' && c.partizip) pick.partizip = c.partizip;
    out[tense] = pick;
  }
  return out;
}

const report = { generatedAt: new Date().toISOString(), results: [], summary: { pass: 0, fail: 0 } };

for (const verb of VERBS) {
  const generated = sampleForms(verb);
  const entry = { verb, generated, checks: {} };
  const { html } = await fetchDwds(verb);
  const h = htmlNorm(html);
  const line = extractDwdsGrammarLine(html);
  entry.dwdsGrammarLine = line;
  entry.checks.praeteritum = { form: generated.praeteritum?.er, ok: formOnPage(h, generated.praeteritum?.er) || formOnPage(htmlNorm(line), generated.praeteritum?.er) };
  entry.checks.partizip = { form: generated.perfekt?.partizip, ok: formOnPage(h, generated.perfekt?.partizip) || formOnPage(htmlNorm(line), generated.perfekt?.partizip) };
  entry.checks._allOk = entry.checks.praeteritum.ok && entry.checks.partizip.ok;
  if (entry.checks._allOk) report.summary.pass++;
  else report.summary.fail++;
  report.results.push(entry);
  await new Promise((r) => setTimeout(r, 350));
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log('Mixed verbs DWDS:', report.summary);
for (const r of report.results) {
  const mark = r.checks._allOk ? 'PASS' : 'FAIL';
  console.log(`  ${mark} ${r.verb}: Prät=${r.checks.praeteritum.form} Part=${r.checks.partizip.form}`);
  if (!r.checks._allOk) console.log(`       DWDS: ${r.dwdsGrammarLine}`);
}
console.log(`Log: ${OUT}`);
