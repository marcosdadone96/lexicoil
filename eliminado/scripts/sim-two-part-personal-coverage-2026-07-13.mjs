#!/usr/bin/env node
/**
 * Personal vocab coverage: 1 vs 2 parts per Teil (production scorer).
 * 30 mixed-topic sessions + per-part hit distribution.
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
  { topic: 'Umwelt', words: ['Recycling', 'Klimawandel', 'Müll', 'Energie', 'Umwelt', 'Verschmutzung', 'Naturschutz', 'Abfall', 'Solar', 'Windkraft', 'Nachhaltigkeit', 'Ressource', 'Klima', 'Emission', 'Pflanze'] },
  { topic: 'Arbeit', words: ['Beruf', 'Gehalt', 'Kollege', 'Bewerbung', 'Firma', 'Arbeitsplatz', 'Vertrag', 'Vorgesetzter', 'Teilzeit', 'Überstunden', 'Kündigung', 'Praktikum', 'Qualifikation', 'Team', 'Stress'] },
  { topic: 'Technik', words: ['Smartphone', 'Internet', 'Computer', 'App', 'Digital', 'Software', 'Gerät', 'Online', 'Daten', 'Technik', 'Netzwerk', 'Passwort'] },
  { topic: 'Gesundheit', words: ['Arzt', 'Krankheit', 'Medikament', 'Gesundheit', 'Sport', 'Ernährung', 'Schmerz', 'Therapie', 'Krankenhaus', 'Allergie', 'Impfung', 'Ruhe', 'Stress', 'Vitamine', 'Untersuchung'] },
  { topic: 'Reisen', words: ['Reise', 'Flug', 'Hotel', 'Gepäck', 'Ticket', 'Bahn', 'Urlaub', 'Ausflug', 'Koffer', 'Ankunft'] },
  { topic: 'Bildung', words: ['Schule', 'Lernen', 'Prüfung', 'Kurs', 'Universität', 'Lehrer', 'Schüler', 'Hausaufgabe', 'Note', 'Abschluss', 'Studium', 'Seminar', 'Fach', 'Bibliothek', 'Vorlesung'] },
];

function teilsFor(module) {
  const bp = loadBlueprintFileSync('goethe_B1');
  return module === 'lesen' ? lesenBlueprintTeils(bp) : horenBlueprintTeils(bp);
}

async function assembleSession(module, topic, words, partsPerTeil, excludeIds = []) {
  const teils = teilsFor(module);
  const requested = lemmatizeWords(words, 'de');
  const remaining = new Set(requested);
  const covered = new Set();
  const exclude = [...excludeIds];
  const usedTopics = new Set();
  const perPickHits = [];
  const perTeilDetail = [];

  for (const teil of teils) {
    const teilPicks = [];
    let picks = 0;
    while (picks < partsPerTeil) {
      const hit = await pickReusablePartByVocab(store, 'de', 'B1', module, {
        teil,
        topicTag: topic,
        words: [...remaining],
        excludeIds: exclude,
        excludeTopics: [...usedTopics],
      });
      if (!hit?.part) break;
      exclude.push(hit.id);
      const cov = (hit.coveredWords || []).map((w) => String(w).toLowerCase());
      perPickHits.push(cov.length);
      teilPicks.push({ id: hit.id, hits: cov.length, words: cov });
      cov.forEach((w) => {
        covered.add(w);
        remaining.delete(w);
      });
      if (hit.topic) usedTopics.add(String(hit.topic).toLowerCase());
      picks++;
    }
    perTeilDetail.push({ teil, picks: teilPicks, unionHits: teilPicks.reduce((s, p) => {
      const u = new Set();
      teilPicks.forEach((x) => x.words.forEach((w) => u.add(w)));
      return u.size;
    }, 0) });
  }

  return {
    requested: requested.length,
    covered: covered.size,
    perPickHits,
    perTeilDetail,
    excludeIds: exclude,
    coverages: [...covered],
  };
}

async function sim30Sessions(module, partsPerTeil) {
  const results = [];
  let excludeIds = [];
  for (let i = 0; i < 30; i++) {
    const c = CASES[i % CASES.length];
    const words = c.words.slice(0, 15);
    const r = await assembleSession(module, c.topic, words, partsPerTeil, excludeIds);
    excludeIds = [...new Set([...excludeIds, ...r.excludeIds])];
    results.push({
      session: i + 1,
      topic: c.topic,
      wordsSelected: words.length,
      covered: r.covered,
      ge3: r.covered >= 3,
      ge4: r.covered >= 4,
      perPickHits: r.perPickHits,
      avgHitsPerPick: r.perPickHits.length
        ? Math.round((r.perPickHits.reduce((a, b) => a + b, 0) / r.perPickHits.length) * 100) / 100
        : 0,
    });
  }
  return results;
}

function summarizeSessions(results) {
  const n = results.length;
  const ge3 = results.filter((r) => r.ge3).length;
  const ge4 = results.filter((r) => r.ge4).length;
  const allHits = results.flatMap((r) => r.perPickHits);
  const hitDist = { 0: 0, 1: 0, 2: 0, '3+': 0 };
  for (const h of allHits) {
    if (h >= 3) hitDist['3+']++;
    else hitDist[String(h)] = (hitDist[String(h)] || 0) + 1;
  }
  const teilUnion = [];
  return {
    nSessions: n,
    ge3: { count: ge3, ratePct: Math.round((ge3 / n) * 1000) / 10 },
    ge4: { count: ge4, ratePct: Math.round((ge4 / n) * 1000) / 10 },
    avgCovered: Math.round((results.reduce((s, r) => s + r.covered, 0) / n) * 100) / 100,
    avgHitsPerPick: allHits.length
      ? Math.round((allHits.reduce((a, b) => a + b, 0) / allHits.length) * 100) / 100
      : 0,
    totalPicks: allHits.length,
    hitDistPerPick: hitDist,
    pctPicksGe2: allHits.length
      ? Math.round((allHits.filter((h) => h >= 2).length / allHits.length) * 1000) / 10
      : 0,
  };
}

// Also run all 15 official cases (full sim-personal set) for 1 vs 2
const FULL_CASES = [
  { id: 1, module: 'lesen', topic: 'Umwelt', words: ['Recycling', 'Klimawandel', 'Müll', 'Energie', 'Umwelt'] },
  { id: 2, module: 'lesen', topic: 'Umwelt', words: ['Recycling', 'Klimawandel', 'Müll', 'Energie', 'Umwelt', 'Verschmutzung', 'Naturschutz', 'Abfall', 'Solar', 'Windkraft', 'Nachhaltigkeit', 'Ressource', 'Klima', 'Emission', 'Pflanze'] },
  { id: 3, module: 'lesen', topic: 'Arbeit', words: ['Beruf', 'Gehalt', 'Kollege', 'Bewerbung', 'Firma'] },
  { id: 4, module: 'lesen', topic: 'Arbeit', words: ['Beruf', 'Gehalt', 'Kollege', 'Bewerbung', 'Firma', 'Arbeitsplatz', 'Vertrag', 'Vorgesetzter', 'Teilzeit', 'Überstunden', 'Kündigung', 'Praktikum', 'Qualifikation', 'Team', 'Stress', 'Pause', 'Lohn', 'Stelle', 'Karriere', 'Arbeitszeit'] },
  { id: 5, module: 'lesen', topic: 'Technik', words: ['Smartphone', 'Internet', 'Computer', 'App', 'Digital', 'Software', 'Gerät', 'Online', 'Daten', 'Technik', 'Netzwerk', 'Passwort'] },
  { id: 6, module: 'lesen', topic: 'Gesundheit', words: ['Arzt', 'Krankheit', 'Medikament', 'Gesundheit', 'Sport', 'Ernährung', 'Schmerz', 'Therapie'] },
  { id: 7, module: 'horen', topic: 'Arbeit', words: ['Beruf', 'Gehalt', 'Kollege', 'Bewerbung', 'Firma'] },
  { id: 8, module: 'horen', topic: 'Arbeit', words: ['Beruf', 'Gehalt', 'Kollege', 'Bewerbung', 'Firma', 'Arbeitsplatz', 'Vertrag', 'Vorgesetzter', 'Teilzeit', 'Überstunden', 'Kündigung', 'Praktikum', 'Qualifikation', 'Team', 'Stress'] },
  { id: 9, module: 'horen', topic: 'Reisen', words: ['Reise', 'Flug', 'Hotel', 'Gepäck', 'Ticket', 'Bahn', 'Urlaub', 'Ausflug', 'Koffer', 'Ankunft'] },
  { id: 10, module: 'horen', topic: 'Bildung', words: ['Schule', 'Lernen', 'Prüfung', 'Kurs', 'Universität'] },
  { id: 11, module: 'lesen', topic: 'Bildung', words: ['Schule', 'Lernen', 'Prüfung', 'Kurs', 'Universität', 'Lehrer', 'Schüler', 'Hausaufgabe', 'Note', 'Abschluss', 'Studium', 'Seminar', 'Fach', 'Bibliothek', 'Vorlesung', 'Ausbildung', 'Dozent', 'Campus', 'Zeugnis', 'Stipendium', 'Praktikum', 'Wissen', 'Unterricht', 'Prüfer', 'Bildung'] },
  { id: 12, module: 'horen', topic: 'Umwelt', words: ['Recycling', 'Klimawandel', 'Müll', 'Energie', 'Umwelt', 'Verschmutzung', 'Naturschutz', 'Abfall', 'Solar', 'Windkraft', 'Nachhaltigkeit', 'Ressource', 'Klima', 'Emission', 'Pflanze', 'Wald', 'Wasser', 'Luft'] },
  { id: 13, module: 'lesen', topic: 'Reisen', words: ['Reise', 'Flug', 'Hotel', 'Gepäck', 'Ticket', 'Bahn'] },
  { id: 14, module: 'horen', topic: 'Technik', words: ['Smartphone', 'Internet', 'Computer', 'App', 'Digital', 'Software', 'Gerät', 'Online', 'Daten', 'Technik', 'Netzwerk', 'Passwort', 'Laptop', 'Tablet', 'Update', 'Download', 'Server', 'Cloud', 'Sicherheit', 'Programm', 'Tastatur', 'Bildschirm'] },
  { id: 15, module: 'lesen', topic: 'Gesundheit', words: ['Arzt', 'Krankheit', 'Medikament', 'Gesundheit', 'Sport', 'Ernährung', 'Schmerz', 'Therapie', 'Krankenhaus', 'Allergie', 'Impfung', 'Ruhe', 'Stress', 'Vitamine', 'Untersuchung'] },
];

async function runFullCases(partsPerTeil) {
  const out = [];
  for (const c of FULL_CASES) {
    const r = await assembleSession(c.module, c.topic, c.words, partsPerTeil);
    out.push({
      id: c.id,
      module: c.module,
      topic: c.topic,
      requested: r.requested,
      covered: r.covered,
      pct: r.requested ? Math.round((r.covered / r.requested) * 1000) / 10 : 0,
      ge4: r.covered >= 4,
      perPickHits: r.perPickHits,
      maxPerTeilUnion: r.perTeilDetail.map((t) => t.unionHits),
    });
  }
  return out;
}

const lesen30_1 = await sim30Sessions('lesen', 1);
const lesen30_2 = await sim30Sessions('lesen', 2);
const horen30_1 = await sim30Sessions('horen', 1);
const horen30_2 = await sim30Sessions('horen', 2);

const full1 = await runFullCases(1);
const full2 = await runFullCases(2);

const report = {
  generatedAt: new Date().toISOString(),
  method: 'pickReusablePartByVocab (production), greedy union, excludeIds carry across 30 sessions',
  partsPerTeilComparison: {
    lesen: {
      onePart: summarizeSessions(lesen30_1),
      twoParts: summarizeSessions(lesen30_2),
    },
    horen: {
      onePart: summarizeSessions(horen30_1),
      twoParts: summarizeSessions(horen30_2),
    },
  },
  full15Cases: {
    onePart: {
      avgPct: Math.round((full1.reduce((s, c) => s + c.pct, 0) / full1.length) * 10) / 10,
      ge4count: full1.filter((c) => c.ge4).length,
      cases: full1,
    },
    twoParts: {
      avgPct: Math.round((full2.reduce((s, c) => s + c.pct, 0) / full2.length) * 10) / 10,
      ge4count: full2.filter((c) => c.ge4).length,
      cases: full2,
    },
  },
  designTarget: {
    onePartTargetHitsPerPart: 2,
    twoPartsTargetCombined: 4,
    note: 'Measured whether individual picks reach ~2 hits and 2-part union reaches ~4',
  },
};

const OUT = path.join(ROOT, 'batches/ready/gate-logs/two-part-personal-coverage-2026-07-13.json');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 10));

console.log('=== 30 sessions (mixed topics, 15 words) ===');
for (const mod of ['lesen', 'horen']) {
  const a = report.partsPerTeilComparison[mod].onePart;
  const b = report.partsPerTeilComparison[mod].twoParts;
  console.log(`\n${mod.toUpperCase()} 1 part/Teil: ≥3 ${a.ge3.ratePct}% · ≥4 ${a.ge4.ratePct}% · avg covered ${a.avgCovered} · avg hits/pick ${a.avgHitsPerPick}`);
  console.log(`${mod.toUpperCase()} 2 parts/Teil: ≥3 ${b.ge3.ratePct}% · ≥4 ${b.ge4.ratePct}% · avg covered ${b.avgCovered} · avg hits/pick ${b.avgHitsPerPick}`);
  console.log(`  picks with ≥2 hits: 1p=${a.pctPicksGe2}% · 2p=${b.pctPicksGe2}%`);
  console.log(`  hit dist/pick 1p:`, a.hitDistPerPick, '2p:', b.hitDistPerPick);
}
console.log('\n=== 15 official cases ===');
console.log('1 part avg', report.full15Cases.onePart.avgPct + '%', 'ge4', report.full15Cases.onePart.ge4count + '/15');
console.log('2 parts avg', report.full15Cases.twoParts.avgPct + '%', 'ge4', report.full15Cases.twoParts.ge4count + '/15');
console.log('\nLog:', OUT);
