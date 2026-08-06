#!/usr/bin/env node
/**
 * Real personalized-exam vocab coverage simulation (Vía A pool-first).
 * Measures: of N user-selected words, how many appear in served pool parts?
 *
 * Run: node scripts/sim-personal-vocab-coverage-cases.mjs
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
const { loadSeedRecords } = require(path.join(
  ROOT,
  'netlify/functions/lib/reusablePartsLocalSeed.js',
));

const store = {
  async setJSON() {
    return { modified: true };
  },
  async get() {
    return null;
  },
  async delete() {},
  async list() {
    return { blobs: [] };
  },
};

/** Realistic user decks: topic-aligned B1 lemmas users save in vocab hub. */
const CASES = [
  { id: 1, module: 'lesen', topic: 'Umwelt', n: 5, words: ['Recycling', 'Klimawandel', 'Müll', 'Energie', 'Umwelt'] },
  { id: 2, module: 'lesen', topic: 'Umwelt', n: 15, words: ['Recycling', 'Klimawandel', 'Müll', 'Energie', 'Umwelt', 'Verschmutzung', 'Naturschutz', 'Abfall', 'Solar', 'Windkraft', 'Nachhaltigkeit', 'Ressource', 'Klima', 'Emission', 'Pflanze'] },
  { id: 3, module: 'lesen', topic: 'Arbeit', n: 5, words: ['Beruf', 'Gehalt', 'Kollege', 'Bewerbung', 'Firma'] },
  { id: 4, module: 'lesen', topic: 'Arbeit', n: 20, words: ['Beruf', 'Gehalt', 'Kollege', 'Bewerbung', 'Firma', 'Arbeitsplatz', 'Vertrag', 'Vorgesetzter', 'Teilzeit', 'Überstunden', 'Kündigung', 'Praktikum', 'Qualifikation', 'Team', 'Stress', 'Pause', 'Lohn', 'Stelle', 'Karriere', 'Arbeitszeit'] },
  { id: 5, module: 'lesen', topic: 'Technik', n: 12, words: ['Smartphone', 'Internet', 'Computer', 'App', 'Digital', 'Software', 'Gerät', 'Online', 'Daten', 'Technik', 'Netzwerk', 'Passwort'] },
  { id: 6, module: 'lesen', topic: 'Gesundheit', n: 8, words: ['Arzt', 'Krankheit', 'Medikament', 'Gesundheit', 'Sport', 'Ernährung', 'Schmerz', 'Therapie'] },
  { id: 7, module: 'horen', topic: 'Arbeit', n: 5, words: ['Beruf', 'Gehalt', 'Kollege', 'Bewerbung', 'Firma'] },
  { id: 8, module: 'horen', topic: 'Arbeit', n: 15, words: ['Beruf', 'Gehalt', 'Kollege', 'Bewerbung', 'Firma', 'Arbeitsplatz', 'Vertrag', 'Vorgesetzter', 'Teilzeit', 'Überstunden', 'Kündigung', 'Praktikum', 'Qualifikation', 'Team', 'Stress'] },
  { id: 9, module: 'horen', topic: 'Reisen', n: 10, words: ['Reise', 'Flug', 'Hotel', 'Gepäck', 'Ticket', 'Bahn', 'Urlaub', 'Ausflug', 'Koffer', 'Ankunft'] },
  { id: 10, module: 'horen', topic: 'Bildung', n: 5, words: ['Schule', 'Lernen', 'Prüfung', 'Kurs', 'Universität'] },
  { id: 11, module: 'lesen', topic: 'Bildung', n: 25, words: ['Schule', 'Lernen', 'Prüfung', 'Kurs', 'Universität', 'Lehrer', 'Schüler', 'Hausaufgabe', 'Note', 'Abschluss', 'Studium', 'Seminar', 'Fach', 'Bibliothek', 'Vorlesung', 'Ausbildung', 'Dozent', 'Campus', 'Zeugnis', 'Stipendium', 'Praktikum', 'Wissen', 'Unterricht', 'Prüfer', 'Bildung'] },
  { id: 12, module: 'horen', topic: 'Umwelt', n: 18, words: ['Recycling', 'Klimawandel', 'Müll', 'Energie', 'Umwelt', 'Verschmutzung', 'Naturschutz', 'Abfall', 'Solar', 'Windkraft', 'Nachhaltigkeit', 'Ressource', 'Klima', 'Emission', 'Pflanze', 'Wald', 'Wasser', 'Luft'] },
  { id: 13, module: 'lesen', topic: 'Reisen', n: 6, words: ['Reise', 'Flug', 'Hotel', 'Gepäck', 'Ticket', 'Bahn'] },
  { id: 14, module: 'horen', topic: 'Technik', n: 22, words: ['Smartphone', 'Internet', 'Computer', 'App', 'Digital', 'Software', 'Gerät', 'Online', 'Daten', 'Technik', 'Netzwerk', 'Passwort', 'Laptop', 'Tablet', 'Update', 'Download', 'Server', 'Cloud', 'Sicherheit', 'Programm', 'Tastatur', 'Bildschirm'] },
  { id: 15, module: 'lesen', topic: 'Gesundheit', n: 15, words: ['Arzt', 'Krankheit', 'Medikament', 'Gesundheit', 'Sport', 'Ernährung', 'Schmerz', 'Therapie', 'Krankenhaus', 'Allergie', 'Impfung', 'Ruhe', 'Stress', 'Vitamine', 'Untersuchung'] },
];

async function assembleModule(module, words, topicTag) {
  const bp = loadBlueprintFileSync('goethe_B1');
  const teils = module === 'lesen' ? lesenBlueprintTeils(bp) : horenBlueprintTeils(bp);
  const requested = lemmatizeWords(words, 'de');
  const remaining = new Set(requested);
  const covered = new Set();
  const picks = [];
  const excludeIds = [];
  const usedTopics = new Set();

  for (const teil of teils) {
    const hit = await pickReusablePartByVocab(store, 'de', 'B1', module, {
      teil,
      topicTag,
      words: [...remaining],
      excludeIds,
      excludeTopics: [...usedTopics],
    });
    if (!hit?.part) {
      picks.push({ teil, miss: true });
      continue;
    }
    excludeIds.push(hit.id);
    const cov = hit.coveredWords || [];
    cov.forEach((w) => {
      const lw = String(w).toLowerCase();
      covered.add(lw);
      remaining.delete(lw);
    });
    if (hit.topic) usedTopics.add(String(hit.topic).toLowerCase());
    picks.push({
      teil,
      id: hit.id,
      score: cov.length,
      covered: cov,
      topicRelaxed: !!hit.topicRelaxed,
      topicTag: hit.topicTag,
    });
  }

  return {
    requested: requested.length,
    covered: covered.size,
    pct: requested.length ? Math.round((covered.size / requested.length) * 1000) / 10 : 0,
    remaining: [...remaining],
    picks,
    teilsTotal: teils.length,
    teilsServed: picks.filter((p) => !p.miss).length,
  };
}

function poolStockByTeil() {
  const records = loadSeedRecords('de', 'B1');
  const counts = {};
  for (const r of records) {
    const k = `${r.module}:T${r.teil}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

const results = [];
for (const c of CASES) {
  const r = await assembleModule(c.module, c.words, c.topic);
  results.push({
    id: c.id,
    module: c.module,
    topic: c.topic,
    nSelected: c.n,
    nLemmas: r.requested,
    nCovered: r.covered,
    coveragePct: r.pct,
    teilsServed: r.teilsServed,
    teilsTotal: r.teilsTotal,
    uncovered: r.remaining,
    picks: r.picks.map((p) =>
      p.miss
        ? { teil: p.teil, miss: true }
        : { teil: p.teil, score: p.score, topicRelaxed: p.topicRelaxed, covered: p.covered },
    ),
  });
}

const stock = poolStockByTeil();
const out = path.join(ROOT, 'batches/ready/gate-logs/personal-vocab-coverage-cases-2026-07-13.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      algorithm: 'one part per Teil, greedy max overlap; remaining lemmas shrink after each pick',
      poolStock: stock,
      cases: results,
    },
    null,
    2,
  ),
);

console.log('| # | Module | Topic | N sel | Covered | % | Teile |');
console.log('|---|--------|-------|-------|---------|---|-------|');
for (const r of results) {
  console.log(
    `| ${r.id} | ${r.module} | ${r.topic} | ${r.nSelected} | ${r.nCovered}/${r.nLemmas} | ${r.coveragePct}% | ${r.teilsServed}/${r.teilsTotal} |`,
  );
}
console.log('\nPool stock (de_B1 seed):');
for (const [k, v] of Object.entries(stock).sort()) console.log(`  ${k}: ${v}`);
console.log('\nReport:', out);
