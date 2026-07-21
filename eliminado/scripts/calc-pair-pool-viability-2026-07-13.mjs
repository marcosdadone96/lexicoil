#!/usr/bin/env node
/**
 * Combinatorial viability: pair-targeted pool parts for ≥2 hits per part.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const B1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/vocab/de/B1.json'), 'utf8'));
const N_BANK = B1.lemmas.length;

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

function fold(w) {
  return String(w).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

function comb(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** User selects k words from deck d (all lemmas folded). */
function userSelect(deck, k) {
  const d = deck.map(fold);
  const pick = Math.min(k, d.length);
  return d.slice(0, pick);
}

/** Pool part targets pair [a,b]. User set S. Hit if both in S. */
function pairHitsUser(pair, userSet) {
  const [a, b] = pair.map(fold);
  return userSet.has(a) && userSet.has(b);
}

function pairsFromDeck(deck) {
  const d = [...new Set(deck.map(fold))];
  const out = [];
  for (let i = 0; i < d.length; i++) {
    for (let j = i + 1; j < d.length; j++) out.push([d[i], d[j]]);
  }
  return out;
}

/** P at least one of N random bank-pairs hits user k-subset of bank. */
function bankRandomPairCoverage(nBank, kUser, nParts) {
  const pPair = (kUser * (kUser - 1)) / (nBank * (nBank - 1));
  return 1 - Math.pow(1 - pPair, nParts);
}

function partsNeededForTarget(pPair, target = 0.8) {
  if (pPair <= 0) return Infinity;
  return Math.ceil(Math.log(1 - target) / Math.log(1 - pPair));
}

function simulateCases(poolByCell, kSelect = 12) {
  let hit = 0;
  const detail = [];
  for (const c of CASES) {
    const deck = c.words.map(fold);
    const user = new Set(userSelect(c.words, kSelect));
    const key = `${c.module}`;
    const parts = poolByCell[key] || [];
    const best = parts.reduce((m, p) => Math.max(m, pairHitsUser(p, user) ? 2 : 0), 0);
    const any = parts.some((p) => pairHitsUser(p, user));
    if (any) hit++;
    detail.push({ id: c.id, module: c.module, topic: c.topic, deck: deck.length, user: user.size, hit: any, best });
  }
  return { rate: hit / CASES.length, hit, total: CASES.length, detail };
}

// Topic-scoped pair universe (union of CASE decks per topic+module)
const topicPools = {};
for (const c of CASES) {
  const key = `${c.module}::${c.topic}`;
  if (!topicPools[key]) topicPools[key] = new Set();
  c.words.forEach((w) => topicPools[key].add(fold(w)));
}

const topicPairCounts = Object.fromEntries(
  Object.entries(topicPools).map(([k, s]) => [k, pairsFromDeck([...s]).length]),
);

const totalTopicPairs = Object.values(topicPairCounts).reduce((a, b) => a + b, 0);

// Cost params from today
const COST_PER_OK = 0.1508;
const CALLS_PER_OK = 9.6;
const CALLS_PER_MIN = 0.92;
const TEILS_PER_MODULE = { lesen: 3, horen: 3 };

// Integration rates (will patch from probe; defaults from pool-verified extrapolation)
const RATE_6REQ_GE2 = 27 / 29;
const RATE_2REQ_BOTH_INDEP = Math.pow(3.41 / 6, 2);

const scenarios = [];

// A: Full bank random pairs per Teil
for (const k of [10, 12, 15]) {
  const p = (k * (k - 1)) / (N_BANK * (N_BANK - 1));
  const n = partsNeededForTarget(p, 0.8);
  scenarios.push({
    name: `bank_random_k${k}`,
    pPairPerPart: p,
    partsPerTeil: n,
    partsPerModule: n * 3,
    costUsd: n * 3 * 2 * COST_PER_OK,
    hours: (n * 3 * 2 * CALLS_PER_OK) / CALLS_PER_MIN / 60,
  });
}

// B: All pairs per topic-module cell (ideal 100% integration)
let partsIdeal = 0;
for (const [key, cnt] of Object.entries(topicPairCounts)) {
  partsIdeal += cnt;
}
scenarios.push({
  name: 'topic_all_case_pairs_per_teil',
  topicPairCounts,
  totalUniquePairs: totalTopicPairs,
  partsPerTeil: totalTopicPairs,
  partsPerModuleLesen: Object.entries(topicPairCounts)
    .filter(([k]) => k.startsWith('lesen'))
    .reduce((s, [, c]) => s + c, 0),
  partsPerModuleHoren: Object.entries(topicPairCounts)
    .filter(([k]) => k.startsWith('horen'))
    .reduce((s, [, c]) => s + c, 0),
  costUsdOneModule: partsIdeal * COST_PER_OK,
  costUsdBothModules: partsIdeal * 2 * COST_PER_OK,
  hoursBoth: (partsIdeal * 2 * CALLS_PER_OK) / CALLS_PER_MIN / 60,
});

// C: Top-frequency subset — 30 pairs per topic-module (operator-scoped)
const SCOPED_PAIRS_PER_CELL = 30;
const scopedCells = Object.keys(topicPairCounts).length;
const scopedPartsPerTeil = scopedCells * SCOPED_PAIRS_PER_CELL;
scenarios.push({
  name: 'scoped_30_pairs_per_topic_module_cell',
  cells: scopedCells,
  pairsPerCell: SCOPED_PAIRS_PER_CELL,
  partsPerTeil: scopedPartsPerTeil,
  costUsdPerModule: scopedPartsPerTeil * COST_PER_OK,
  costUsdBoth: scopedPartsPerTeil * 2 * COST_PER_OK,
  hoursBoth: (scopedPartsPerTeil * 2 * CALLS_PER_OK) / CALLS_PER_MIN / 60,
});

// Simulate scoped pool: for each case, parts = all pairs from that case's deck (capped)
function buildTopicPairPool(capPerDeck = Infinity) {
  const lesen = [];
  const horen = [];
  for (const c of CASES) {
    const pairs = pairsFromDeck(c.words).slice(0, capPerDeck);
    const target = c.module === 'lesen' ? lesen : horen;
    for (const p of pairs) target.push(p);
  }
  return { lesen, horen };
}

const simFullDeckPairs = simulateCases(buildTopicPairPool(Infinity));
const simCap15Pairs = simulateCases(buildTopicPairPool(15));
const simCap30Pairs = simulateCases(buildTopicPairPool(30));

const report = {
  generatedAt: new Date().toISOString(),
  bankLemmas: N_BANK,
  bankPairs: (N_BANK * (N_BANK - 1)) / 2,
  integrationRates: {
    poolVerified_req6_ge2: RATE_6REQ_GE2,
    poolVerified_avgUsedWhenReq6: 3.41,
    independentEstimate_req2_both: RATE_2REQ_BOTH_INDEP,
    coverageLog_actualTags_avg: 0.222,
    note: 'Probe 2-word rate merged when available',
  },
  costParams: { COST_PER_OK, CALLS_PER_OK, CALLS_PER_MIN },
  topicPairCounts,
  totalTopicPairs,
  scenarios,
  simulation: {
    allPairsFromEachCaseDeck: simFullDeckPairs,
    cap15PairsPerCase: simCap15Pairs,
    cap30PairsPerCase: simCap30Pairs,
  },
  bankCoverage80: {
    k10: { pPair: bankRandomPairCoverage(N_BANK, 10, partsNeededForTarget((10 * 9) / (N_BANK * (N_BANK - 1)), 0.8)), parts: partsNeededForTarget((10 * 9) / (N_BANK * (N_BANK - 1)), 0.8) },
    k12: { pPair: (12 * 11) / (N_BANK * (N_BANK - 1)), parts: partsNeededForTarget((12 * 11) / (N_BANK * (N_BANK - 1)), 0.8) },
    k15: { pPair: (15 * 14) / (N_BANK * (N_BANK - 1)), parts: partsNeededForTarget((15 * 14) / (N_BANK * (N_BANK - 1)), 0.8) },
  },
};

const OUT = path.join(ROOT, 'batches/ready/gate-logs/pair-pool-viability-2026-07-13.json');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
