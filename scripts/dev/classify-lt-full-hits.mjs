#!/usr/bin/env node
/**
 * Classify LT hits from full-scope analysis (A/B/C/D).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRealLanguageToolMatch, LT_NOISE_RULE_IDS } from '../lib/qualityGates/languageToolGate.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const stamp = process.argv[2] || '2026-08-05';
const analysisPath = path.join(ROOT, `batches/ready/gate-logs/preventive-lt-full-analysis-${stamp}.json`);

if (!fs.existsSync(analysisPath)) {
  console.error('Missing', analysisPath);
  process.exit(1);
}

const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));

function classify(hit) {
  const { ruleId, field, word, context } = hit;
  if (!isRealLanguageToolMatch({ ruleId })) return 'noise';

  // Question/passage bundle — real caps in German content
  if (ruleId === 'GERMAN_SPELLER_RULE') {
    if (/^[a-zäöüß]/.test(word || '') && word && word.length > 3) {
      const cap = word.charAt(0).toUpperCase() + word.slice(1);
      if (cap !== word) return 'A';
    }
    if (word === 'dAmit' || /^d[A-Z]/.test(word || '')) return 'A';
    return 'D';
  }

  if (ruleId === 'DE_AGREEMENT' || ruleId === 'DE_AGREEMENT2' || ruleId === 'DE_SUBJECT_VERB_AGREEMENT') {
    return 'A'; // candidate — manual review
  }

  if (ruleId === 'DE_CASE' || ruleId === 'NOMEN_KLEIN') {
    if (field?.startsWith('questions')) {
      // Speaker lines in hören options often flagged
      if (/:\s*[A-Z]/.test(context || '')) return 'D';
    }
    return 'D';
  }

  if (ruleId === 'FEHLERHAFTES_KOMMA_ALLG') return 'D';
  if (ruleId === 'DE_DATE_WEEKDAY_CURRENTYEAR') return 'D';
  if (ruleId === 'EIN_BISSCHEN' || ruleId === 'ETWAS_GUTES') return 'noise';
  if (LT_NOISE_RULE_IDS.has(ruleId)) return 'noise';

  return 'D';
}

const report = { stamp, levels: {} };

for (const [level, data] of Object.entries(analysis.levels)) {
  if (data.error) continue;
  const questionHits = (data.questionHits || []).map((h) => ({
    ...h,
    category: classify(h),
  }));
  const passageOnly = [];
  for (const levelKey of [level]) {
    const fullPath = path.join(ROOT, `batches/ready/gate-logs/preventive-lt-full-${levelKey}-${stamp}.json`);
    if (!fs.existsSync(fullPath)) continue;
    const full = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    for (const f of full.files || []) {
      for (const seg of f.segments || []) {
        if (seg.field?.startsWith('questions')) continue;
        for (const m of seg.matches || []) {
          if (!isRealLanguageToolMatch(m)) continue;
          passageOnly.push({
            file: f.file,
            field: seg.field,
            ruleId: m.ruleId,
            context: m.context,
            word: (m.context || '').slice(m.contextOffset || 0, (m.contextOffset || 0) + (m.length || 0)),
            category: classify({ ...m, field: seg.field }),
          });
        }
      }
    }
  }

  const all = [...questionHits, ...passageOnly.filter((p) => p.category !== 'noise')];
  const counts = { A: 0, B: 0, C: 0, D: 0, noise: 0 };
  for (const h of [...questionHits, ...passageOnly]) counts[h.category] = (counts[h.category] || 0) + 1;

  report.levels[level] = {
    fullSummary: data.fullSummary,
    questionFieldHits: questionHits.length,
    counts,
    questionHitsA: questionHits.filter((h) => h.category === 'A'),
    questionHitsD: questionHits.filter((h) => h.category === 'D').slice(0, 30),
    allRealHits: all.length,
  };
}

const out = path.join(ROOT, `batches/ready/gate-logs/preventive-lt-full-classified-${stamp}.json`);
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log('Wrote', path.relative(ROOT, out));
for (const [level, d] of Object.entries(report.levels)) {
  console.log(`${level}: question-hits=${d.questionFieldHits} A=${d.counts.A} D=${d.counts.D}`);
}
