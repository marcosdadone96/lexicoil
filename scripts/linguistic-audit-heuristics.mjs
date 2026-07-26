#!/usr/bin/env node
/**
 * Heuristic linguistic pre-scan on audit sample (feeds human report; not a gate).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';

const SAMPLE = path.join(ROOT, 'batches/ready/gate-logs/linguistic-audit-sample-2026-07-24.json');
const data = JSON.parse(fs.readFileSync(SAMPLE, 'utf8'));

const HEURISTICS = [
  {
    id: 'case_wegen_dem',
    severity: 'major',
    known: false,
    re: /\bwegen dem\b/i,
    note: 'Colloquial/regional; exam norm often «wegen des/der»',
  },
  {
    id: 'case_trotz_dem',
    severity: 'major',
    known: false,
    re: /\btrotz dem\b/i,
    note: 'Standard: trotz + Genitiv',
  },
  {
    id: 'case_waehrend_dem',
    severity: 'major',
    known: false,
    re: /\bw[äa]hrend dem\b/i,
    note: 'Standard: während + Genitiv/Dativ formal',
  },
  {
    id: 'double_article',
    severity: 'critical',
    known: false,
    re: /\b(der|die|das|den|dem|des|ein|eine|einer|einem|einen)\s+(der|die|das|den|dem|des|ein|eine)\b/i,
    note: 'Double determiner',
  },
  {
    id: 'english_meta_sprechen',
    severity: 'minor',
    known: 'partial',
    re: /\b(feedback|checklist|structure|grammar|vocabulary|prosody|example questions?)\b/i,
    note: 'English/meta in Sprechen prompts (Feedback often accepted loanword)',
  },
  {
    id: 'english_sentence_leak',
    severity: 'critical',
    known: false,
    re: /\b(you should|please note|according to the passage|the correct answer is|click here)\b/i,
    note: 'English exam instruction leak',
  },
  {
    id: 'spanish_residual',
    severity: 'critical',
    known: true,
    re: /\b(prefiere|viajar|motivos?|ecol[oó]gic[oa]s?|¿|¡)\b/i,
    note: 'Known Spanish leak pattern (post-quarantine)',
  },
  {
    id: 'vocab_trunc_artifact',
    severity: 'major',
    known: true,
    re: /\b(direken|interessanen|handelen|weiterhi|sophi|berli|konkren|wanderen|komfortabl)\b/i,
    note: 'Known lemma/tag truncation cluster',
  },
  {
    id: 'unnatural_calque',
    severity: 'minor',
    known: false,
    re: /\b(mache ich mir Sorgen um|es macht Sinn für mich)\b/i,
    note: 'Calque — may still be acceptable B1',
  },
  {
    id: 'wrong_caps_mid',
    severity: 'minor',
    known: true,
    re: /\b(ein Paar [A-Z]|der Vielen [a-z]|die Viele\b)/,
    note: 'Known caps artifact family',
  },
  {
    id: 'missing_comma_infinitive',
    severity: 'minor',
    known: false,
    re: /\b(um zu [a-zäöüß]+ [a-zäöüß]+ zu)\b/i,
    note: 'Possible missing comma in um … zu clause (manual verify)',
  },
];

const findings = [];
for (const item of data.reviewed) {
  const file = `${item.lv}/${item.file}`;
  for (const block of item.allBlocks || []) {
    if (block.kind === 'explanation') continue; // meta German often looser
    const text = block.text || '';
    for (const h of HEURISTICS) {
      if (h.re.test(text)) {
        findings.push({
          file,
          kind: block.kind,
          qid: block.id,
          heuristic: h.id,
          severity: h.severity,
          knownPattern: h.known,
          note: h.note,
          excerpt: text.slice(0, 160).replace(/\s+/g, ' '),
        });
      }
    }
  }
}

const out = path.join(ROOT, 'batches/ready/gate-logs/linguistic-audit-heuristics-2026-07-24.json');
fs.writeFileSync(out, `${JSON.stringify({ findings, count: findings.length }, null, 2)}\n`);
console.log(`Heuristic hits: ${findings.length} → ${path.relative(ROOT, out)}`);
for (const f of findings.slice(0, 30)) {
  console.log(`[${f.severity}] ${f.file} ${f.heuristic}: ${f.excerpt.slice(0, 90)}…`);
}
