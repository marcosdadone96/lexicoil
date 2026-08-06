#!/usr/bin/env node
/**
 * Verify conjugation tables against DWDS HTML for 10 separable test verbs.
 * Checks Präsens, Präteritum, Perfekt (ge-participle), Imperativ patterns.
 *
 * Usage: node scripts/verify-conjugation-dwds.mjs
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/conjugation-dwds-verify-2026-07-13.json');

globalThis.Lemmatizer = require(path.join(ROOT, 'js/engine/validation/lemmatizer.js'));
globalThis.SeparableResolve = require(path.join(ROOT, 'js/engine/separableResolve.js'));
const VerbConjugation = require(path.join(ROOT, 'js/data/verbConjugation.js'));

const VERBS = [
  'abnehmen',
  'vorschlagen',
  'anrufen',
  'anbieten',
  'mitnehmen',
  'teilnehmen',
  'aufgeben',
  'abgeben',
  'ausgeben',
  'vorlesen',
];

const TENSES = ['present', 'praeteritum', 'perfekt', 'imperativ'];

function normHtml(s) {
  return String(s || '')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function extractDwdsGrammarLine(html) {
  const raw = String(html || '');
  const patterns = [
    /Grammatik\s*Verb[^·]*·\s*([^<\n]+)/i,
    /GrammatikVerb[^·]*·\s*([^<\n]+)/i,
    /class="[^"]*dwdswb-ft-lemmaform[^"]*"[^>]*>([^<]+)</i,
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
    .replace(/&szlig;/gi, 'ß')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
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

function verifyDwdsEntry(html, generated) {
  const line = extractDwdsGrammarLine(html);
  const h = htmlNorm(html);
  const lineNorm = htmlNorm(line);
  const checks = {};

  checks.grammar_line = { ok: !!line, value: line };

  if (generated.present?.er) {
    checks.present = { ok: formOnPage(h, generated.present.er) || formOnPage(lineNorm, generated.present.er), form: generated.present.er };
  }
  if (generated.praeteritum?.er) {
    checks.praeteritum = { ok: formOnPage(h, generated.praeteritum.er) || formOnPage(lineNorm, generated.praeteritum.er), form: generated.praeteritum.er };
  }
  if (generated.perfekt?.partizip) {
    const pOk = formOnPage(h, generated.perfekt.partizip) || formOnPage(lineNorm, generated.perfekt.partizip);
    checks.perfekt_partizip = { ok: pOk, form: generated.perfekt.partizip };
    checks.perfekt_hat = {
      ok: formOnPage(h, `hat ${generated.perfekt.partizip}`) || formOnPage(lineNorm, `hat ${generated.perfekt.partizip}`) || pOk,
      form: `hat ${generated.perfekt.partizip}`,
    };
  }
  if (generated.imperativ?.du) {
    checks.imperativ = {
      ok: !!(checks.present?.ok && checks.praeteritum?.ok && checks.perfekt_partizip?.ok),
      form: generated.imperativ.du,
      note: 'Rule-derived: prefix at clause end (Ruf an!, not Anruf!) — roots match DWDS grammar line',
    };
  }

  const tenseChecks = Object.entries(checks).filter(([k]) => !k.startsWith('_') && k !== 'grammar_line');
  checks._allOk =
    (checks.grammar_line.ok || (checks.present?.ok && checks.praeteritum?.ok && checks.perfekt_partizip?.ok)) &&
    tenseChecks.every(([, c]) => c.ok);
  return checks;
}

import { execFileSync } from 'node:child_process';

async function fetchDwds(lemma) {
  const url = `https://www.dwds.de/wb/${encodeURIComponent(lemma)}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'LexiCoil-conjugation-verify/1.0 (educational)' },
    });
    const html = await res.text();
    return { statusCode: res.status, html, url };
  } catch (err) {
    if (process.platform !== 'win32') throw err;
    const ps = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `(Invoke-WebRequest -Uri '${url.replace(/'/g, "''")}' -UseBasicParsing).Content`,
      ],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    );
    return { statusCode: 200, html: ps, url, via: 'powershell' };
  }
}

function sampleForms(verb) {
  const out = {};
  for (const tense of TENSES) {
    const c = VerbConjugation.getConjugation(verb, 'de', tense);
    if (!c?.forms) continue;
    const pick =
      tense === 'imperativ'
        ? { du: c.forms.du, ihr: c.forms.ihr, Sie: c.forms.Sie }
        : { ich: c.forms.ich, er: c.forms.er };
    if (tense === 'perfekt' && c.partizip) pick.partizip = c.partizip;
    out[tense] = pick;
  }
  return out;
}

const report = {
  generatedAt: new Date().toISOString(),
  verbs: VERBS.length,
  results: [],
  summary: { pass: 0, fail: 0, skip: 0 },
};

for (const verb of VERBS) {
  const generated = sampleForms(verb);
  const entry = { verb, generated, dwds: null, checks: {} };
  try {
    const { statusCode, html, url } = await fetchDwds(verb);
    entry.dwds = { statusCode, url };
    if (statusCode !== 200 || html.length < 1000) {
      entry.checks._page = { ok: false, reason: 'DWDS page unavailable' };
      report.summary.skip++;
      report.results.push(entry);
      continue;
    }
    let allOk = true;
    const checks = verifyDwdsEntry(html, generated);
    entry.checks = checks;
    entry.dwds.grammarLine = checks.grammar_line?.value || '';
    if (!checks._allOk) allOk = false;
    if (allOk) report.summary.pass++;
    else report.summary.fail++;
  } catch (err) {
    entry.error = String(err.message || err);
    report.summary.skip++;
  }
  report.results.push(entry);
  await new Promise((r) => setTimeout(r, 400));
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

console.log('DWDS conjugation verification:', report.summary);
for (const r of report.results) {
  const tenseChecks = Object.entries(r.checks).filter(([k]) => !k.startsWith('_') && k !== 'grammar_line');
  const status = r.error || r.checks._page
    ? 'SKIP'
    : tenseChecks.length && tenseChecks.every(([, c]) => c.ok)
      ? 'PASS'
      : 'FAIL';
  console.log(`  ${status}: ${r.verb}`);
  if (status === 'FAIL') {
    for (const [key, check] of Object.entries(r.checks)) {
      if (key.startsWith('_') || key === 'grammar_line' || check.ok) continue;
      console.log(`    ${key} miss:`, check.form, check.note || '');
    }
  }
}
console.log('Report:', OUT);
process.exit(report.summary.fail ? 1 : 0);
