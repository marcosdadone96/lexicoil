#!/usr/bin/env node
/**
 * Trade-off: 1 vs 2 vs 3 pool parts per Teil (union coverage, no production change).
 * Uses same pickReusablePartByVocab scoring as production.
 * Run: node scripts/sim-multi-part-coverage-tradeoff.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { pickReusablePartByVocab } = require(path.join(
  ROOT,
  'netlify/functions/lib/reusablePartsStore.js',
));
const { lesenBlueprintTeils, horenBlueprintTeils } = require(path.join(
  ROOT,
  'js/engine/personalLesenPoolFallback.js',
));
const { loadBlueprintFileSync } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintResolver.js',
));
const { lemmatizeWords } = require(path.join(
  ROOT,
  'netlify/functions/lib/passageVocab.js',
));

const store = {
  async setJSON() { return { modified: true }; },
  async get() { return null; },
  async delete() {},
  async list() { return { blobs: [] }; },
};

const CASES = [
  { id: 1, module: 'lesen', topic: 'Umwelt', n: 5, words: ['Recycling', 'Klimawandel', 'Müll', 'Energie', 'Umwelt'] },
  { id: 2, module: 'lesen', topic: 'Umwelt', n: 15, words: ['Recycling', 'Klimawandel', 'Müll', 'Energie', 'Umwelt', 'Verschmutzung', 'Naturschutz', 'Abfall', 'Solar', 'Windkraft', 'Nachhaltigkeit', 'Ressource', 'Klima', 'Emission', 'Pflanze'] },
  { id: 4, module: 'lesen', topic: 'Arbeit', n: 20, words: ['Beruf', 'Gehalt', 'Kollege', 'Bewerbung', 'Firma', 'Arbeitsplatz', 'Vertrag', 'Vorgesetzter', 'Teilzeit', 'Überstunden', 'Kündigung', 'Praktikum', 'Qualifikation', 'Team', 'Stress', 'Pause', 'Lohn', 'Stelle', 'Karriere', 'Arbeitszeit'] },
  { id: 8, module: 'horen', topic: 'Arbeit', n: 15, words: ['Beruf', 'Gehalt', 'Kollege', 'Bewerbung', 'Firma', 'Arbeitsplatz', 'Vertrag', 'Vorgesetzter', 'Teilzeit', 'Überstunden', 'Kündigung', 'Praktikum', 'Qualifikation', 'Team', 'Stress'] },
  { id: 11, module: 'lesen', topic: 'Bildung', n: 25, words: ['Schule', 'Lernen', 'Prüfung', 'Kurs', 'Universität', 'Lehrer', 'Schüler', 'Hausaufgabe', 'Note', 'Abschluss', 'Studium', 'Seminar', 'Fach', 'Bibliothek', 'Vorlesung', 'Ausbildung', 'Dozent', 'Campus', 'Zeugnis', 'Stipendium', 'Praktikum', 'Wissen', 'Unterricht', 'Prüfer', 'Bildung'] },
  { id: 12, module: 'horen', topic: 'Umwelt', n: 18, words: ['Recycling', 'Klimawandel', 'Müll', 'Energie', 'Umwelt', 'Verschmutzung', 'Naturschutz', 'Abfall', 'Solar', 'Windkraft', 'Nachhaltigkeit', 'Ressource', 'Klima', 'Emission', 'Pflanze', 'Wald', 'Wasser', 'Luft'] },
  { id: 14, module: 'horen', topic: 'Technik', n: 22, words: ['Smartphone', 'Internet', 'Computer', 'App', 'Digital', 'Software', 'Gerät', 'Online', 'Daten', 'Technik', 'Netzwerk', 'Passwort', 'Laptop', 'Tablet', 'Update', 'Download', 'Server', 'Cloud', 'Sicherheit', 'Programm', 'Tastatur', 'Bildschirm'] },
  { id: 15, module: 'lesen', topic: 'Gesundheit', n: 15, words: ['Arzt', 'Krankheit', 'Medikament', 'Gesundheit', 'Sport', 'Ernährung', 'Schmerz', 'Therapie', 'Krankenhaus', 'Allergie', 'Impfung', 'Ruhe', 'Stress', 'Vitamine', 'Untersuchung'] },
];

function teilsFor(module) {
  const bp = loadBlueprintFileSync('goethe_B1');
  return module === 'lesen' ? lesenBlueprintTeils(bp) : horenBlueprintTeils(bp);
}

async function simulateCase(caseDef, partsPerTeil) {
  const { module, topic, words } = caseDef;
  const teils = teilsFor(module);
  const requested = lemmatizeWords(words, 'de');
  const remaining = new Set(requested);
  const covered = new Set();
  const excludeIds = [];
  const usedTopics = new Set();

  for (const teil of teils) {
    let picks = 0;
    while (picks < partsPerTeil && remaining.size > 0) {
      const hit = await pickReusablePartByVocab(store, 'de', 'B1', module, {
        teil,
        topicTag: topic,
        words: [...remaining],
        excludeIds,
        excludeTopics: [...usedTopics],
      });
      if (!hit?.part) break;
      excludeIds.push(hit.id);
      (hit.coveredWords || []).forEach((w) => {
        const lw = String(w).toLowerCase();
        covered.add(lw);
        remaining.delete(lw);
      });
      if (hit.topic) usedTopics.add(String(hit.topic).toLowerCase());
      picks++;
    }
  }

  return {
    requested: requested.length,
    covered: covered.size,
    pct: requested.length ? Math.round((covered.size / requested.length) * 1000) / 10 : 0,
  };
}

const strategies = [1, 2, 3];
const byStrategy = Object.fromEntries(strategies.map((n) => [n, []]));

for (const c of CASES) {
  for (const n of strategies) {
    byStrategy[n].push({ caseId: c.id, module: c.module, topic: c.topic, ...await simulateCase(c, n) });
  }
}

function avg(arr) {
  return arr.length ? Math.round((arr.reduce((s, x) => s + x.pct, 0) / arr.length) * 10) / 10 : 0;
}
function max(arr) {
  return arr.length ? Math.max(...arr.map((x) => x.pct)) : 0;
}

const report = {
  generatedAt: new Date().toISOString(),
  note: 'Greedy union of top-N scored parts per Teil via pickReusablePartByVocab (production scorer).',
  strategies: strategies.map((n) => ({
    partsPerTeil: n,
    avgCoveragePct: avg(byStrategy[n]),
    maxCoveragePct: max(byStrategy[n]),
    cases: byStrategy[n],
  })),
  designContext: {
    currentProduction: '1 part per Teil, greedy on remaining lemmas (assembleModuleFromPool, examGeneration.js)',
    consciousDesign: true,
    rationale: [
      'Matches Goethe B1 blueprint: one passage block per Teil slot',
      'Simple assembly, predictable exam length, single topic per Teil',
      'O(parts) pick cost; multi-part multiplies passages or requires composite UI',
    ],
    implementationIfMultiPart: {
      algorithmEffort: 'Low — loop pickReusablePartByVocab N times per Teil with excludeIds',
      productEffort: 'Medium–High — PDF/UI must render N passages per Teil; renumbering; user expects 1 text per Teil',
      blueprintConflict: 'Official format has fixed Teil structure; extra parts = non-standard exam unless merged into one composite passage',
    },
  },
};

const OUT = path.join(ROOT, 'batches/ready/gate-logs/multi-part-coverage-tradeoff-2026-07-13.json');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

console.log('Multi-part coverage trade-off (8 cases, production scorer):');
for (const s of report.strategies) {
  console.log(`  ${s.partsPerTeil} part(s)/Teil → avg ${s.avgCoveragePct}% · max ${s.maxCoveragePct}%`);
}
const gain = report.strategies[2].avgCoveragePct - report.strategies[0].avgCoveragePct;
console.log(`  Δ avg (3 vs 1): +${gain} pp`);
console.log(`Log: ${OUT}`);
