#!/usr/bin/env node
/**
 * Classify PROSE verb_census_no_finite findings (95 occurrences, 63 unique).
 * Output: batches/ready/gate-logs/verb-census-prose-classification.json + .md
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';

const REPORT = path.join(ROOT, 'batches/ready/gate-logs/backlog-reprocess-report.json');
const OUT_JSON = path.join(ROOT, 'batches/ready/gate-logs/verb-census-prose-classification.json');
const OUT_MD = path.join(ROOT, 'batches/ready/gate-logs/VERB-CENSUS-PROSE-CLASSIFICATION.md');

const V2_VERBS = new Set([
  'essen', 'kochen', 'wissen', 'besuchen', 'unternehmen', 'spielen', 'berichten',
  'arbeiten', 'glauben', 'folgen', 'stellen', 'raten', 'gärtnern', 'waschen', 'zahlen',
]);

const FP_NOUN_WORDS = new Set([
  'gemüse', 'aufgaben', 'pflanzen', 'musikkonzerte', 'konsumenten', 'vollkornprodukte',
  'erholung', 'zugang', 'interesse', 'sammelboxen', 'spielbereiche', 'kurse',
  'kosten', 'bewerbungsgespräche', 'stärken', 'nachrichten', 'experten', 'wettkämpfe',
  'familien', 'radfahren', 'teamarbeit', 'reparaturen', 'kindern', 'gebühr', 'geräte',
  'grünflächen', 'viertel', 'erwachsene', 'speisen', 'verspätung', 'euro', 'ausflüge',
  'schalten',
]);

const FP_PREV = new Set([
  'nur', 'auch', 'beispiel', 'euro', 'nutzung', 'mitgebrachte', 'täglichen', 'selbst',
  'tagen', 'oft', 'experten', 'grünes', ' ',
]);

function classify(f) {
  const w = (f.word || '').toLowerCase();
  const p = (f.prev || f.prevWord || '').toLowerCase().trim();

  if (FP_NOUN_WORDS.has(w)) return { label: 'FP', reason: 'sustantivo-objeto / nominalización conocida' };
  if (FP_PREV.has(p)) return { label: 'FP', reason: `prev «${p}» señala objeto nominal, no V2` };
  if (p === 'nur' && w === 'wissen') return { label: 'FP', reason: '«nicht nur Wissen sammeln» — sustantivo' };

  if (V2_VERBS.has(w)) {
    if (p === 'man' && w === 'kosten') return { label: 'FP', reason: 'man Kosten für — objeto nominal' };
    if (p === 'wochenende' && w === 'unternehmen') return { label: 'REAL', reason: 'V2 invertido: Unternehmen wir' };
    if (['wir', 'sie', 'er', 'es', 'ihr', 'du', 'ich', 'sie'].includes(p)) return { label: 'REAL', reason: 'V2 tras pronombre' };
    if (['frisch', 'bitte', 'zusammen', 'was'].includes(p)) return { label: 'REAL', reason: 'V2 tras adverbio/trigger' };
    if (['parks', 'familien', 'menschen', 'zeitungen', 'redaktionen', 'experten', 'leute', 'kinder', 'gemüse', 'obst', 'jahre'].includes(p)) {
      return { label: 'REAL', reason: 'V2 tras sujeto plural / sustantivo' };
    }
    if (p === 'sie' || p === 'wir') return { label: 'REAL', reason: 'V2 tras pronombre' };
  }

  if (w === 'schalten') return { label: 'FP', reason: 'imperativo Sie tras encabezado T5 — mayúscula correcta' };

  return { label: 'FP', reason: 'sin patrón V2 — sustantivo u otro régimen' };
}

function main() {
  const r = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
  const raw = (r.g2?.actionable || []).filter(
    (g) => g.reason === 'verb_census_no_finite' && g.regime === 'PROSE' && !g.file.includes('t3-'),
  );

  const seen = new Set();
  const entries = [];
  for (const g of raw) {
    const key = `${g.file}|${g.word}|${g.prevWord}|${g.field}`;
    const { label, reason } = classify({ word: g.word, prev: g.prevWord });
    const row = {
      file: g.file,
      word: g.word,
      prev: g.prevWord,
      field: g.field,
      context: g.context || '',
      label,
      reason,
    };
    entries.push(row);
    if (!seen.has(key)) seen.add(key);
  }

  const REAL = entries.filter((e) => e.label === 'REAL');
  const FP = entries.filter((e) => e.label === 'FP');

  const out = {
    generatedAt: new Date().toISOString(),
    totals: { occurrences: raw.length, unique: seen.size, REAL: REAL.length, FP: FP.length },
    pattern: 'V2 finito capitalizado tras sujeto/pronombre = REAL; sustantivo-objeto = FP',
    REAL,
    FP,
  };

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(out, null, 2)}\n`);

  const md = [
    '# verb_census PROSE — clasificación completa',
    '',
    `**Fecha:** ${out.generatedAt}`,
    `**Fuente:** \`backlog-reprocess-report.json\` (g2.actionable, régimen PROSE, sin T3)`,
    `**Totales:** ${raw.length} ocurrencias, ${seen.size} únicas — **${REAL.length} REAL**, **${FP.length} FP**`,
    '',
    '## Patrón REAL',
    '',
    'Verbo conjugado (V2) capitalizado inmediatamente tras sujeto plural, pronombre o trigger (`frisch`, `bitte`, `zusammen`, `Was`) — o V2 invertido (`Unternehmen wir`).',
    '',
    '## REAL (' + REAL.length + ')',
    '',
    '| # | Palabra | prev | Archivo | Campo |',
    '|---:|---------|------|---------|-------|',
  ];
  REAL.forEach((e, i) => {
    md.push(`| ${i + 1} | ${e.word} | ${e.prev} | ${e.file} | ${e.field} |`);
  });
  md.push('', '## FP (' + FP.length + ')', '', '| # | Palabra | prev | Motivo |', '|---:|---------|------|--------|');
  FP.forEach((e, i) => {
    md.push(`| ${i + 1} | ${e.word} | ${e.prev} | ${e.reason} |`);
  });
  md.push('', 'JSON: `verb-census-prose-classification.json`');
  fs.writeFileSync(OUT_MD, `${md.join('\n')}\n`);

  console.log(`PROSE verb_census: ${raw.length} occ, ${seen.size} unique → REAL ${REAL.length}, FP ${FP.length}`);
  console.log(`Written: ${path.relative(ROOT, OUT_JSON)}`);
  console.log(`Written: ${path.relative(ROOT, OUT_MD)}`);
}

main();
