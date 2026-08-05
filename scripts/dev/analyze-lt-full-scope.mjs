#!/usr/bin/env node
/**
 * Compare passage-only vs full-scope LT reports; emit question-field-only delta.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRealLanguageToolMatch } from '../lib/qualityGates/languageToolGate.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOG = path.join(ROOT, 'batches/ready/gate-logs');

const levels = ['B2', 'A2', 'B1'];
const stamp = process.argv[2] || '2026-08-05';

function load(name) {
  const p = path.join(LOG, name);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function realMatchesFromFile(fileRow, fieldFilter = null) {
  const hits = [];
  const segments = fileRow.segments || fileRow.passages || [];
  for (const seg of segments) {
    const field = seg.field || 'passages.text';
    if (fieldFilter && !fieldFilter(field)) continue;
    for (const m of seg.matches || []) {
      if (!isRealLanguageToolMatch(m)) continue;
      hits.push({
        file: fileRow.file,
        field,
        questionIndex: seg.questionIndex ?? null,
        passageIndex: seg.passageIndex ?? null,
        ruleId: m.ruleId,
        context: m.context,
        word: (m.context || '').slice(m.contextOffset || 0, (m.contextOffset || 0) + (m.length || 0)),
        replacement: (m.replacements || [])[0],
        message: m.message,
      });
    }
  }
  return hits;
}

const report = { stamp, levels: {} };

for (const level of levels) {
  const passageOnly = load(`preventive-lt-${level}-2026-08-04.json`);
  const full = load(`preventive-lt-full-${level}-${stamp}.json`);
  if (!full) {
    report.levels[level] = { error: 'full report missing' };
    continue;
  }

  const isQuestionField = (f) => f && (f.startsWith('questions.') || f === 'questions.content');

  const fullHits = [];
  const questionHits = [];
  for (const f of full.files || []) {
    fullHits.push(...realMatchesFromFile(f));
    questionHits.push(...realMatchesFromFile(f, isQuestionField));
  }

  let passageOnlyHits = [];
  if (passageOnly) {
    for (const f of passageOnly.files || []) {
      passageOnlyHits.push(...realMatchesFromFile(f));
    }
  }

  const byRule = {};
  for (const h of questionHits) {
    byRule[h.ruleId] = (byRule[h.ruleId] || 0) + 1;
  }

  report.levels[level] = {
    fullSummary: full.summary,
    passageOnlyMatches: passageOnlyHits.length,
    fullRealMatches: fullHits.length,
    questionFieldRealMatches: questionHits.length,
    questionOnlyDelta: questionHits.length,
    byRuleIdQuestionFields: Object.entries(byRule)
      .sort((a, b) => b[1] - a[1])
      .map(([ruleId, count]) => ({ ruleId, count })),
    questionHits,
  };
}

const out = path.join(LOG, `preventive-lt-full-analysis-${stamp}.json`);
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

console.log('Wrote', path.relative(ROOT, out));
for (const [level, data] of Object.entries(report.levels)) {
  if (data.error) {
    console.log(level, data.error);
    continue;
  }
  console.log(
    `${level}: full=${data.fullRealMatches} question-fields=${data.questionFieldRealMatches} (passage-only baseline ${data.passageOnlyMatches})`,
  );
}
