#!/usr/bin/env node
/**
 * Dimension pool stock for 1 Pro user / month:
 * 12 disjoint full exams + 30 personal Lesen + 30 personal Hören (≥4 vocab hits).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { loadSeedRecords } = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsLocalSeed.js'));
const { lesenBlueprintTeils, horenBlueprintTeils } = require(path.join(
  ROOT,
  'js/engine/personalLesenPoolFallback.js',
));
const { loadBlueprintFileSync } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintResolver.js',
));
const { lemmatizeWords } = require(path.join(ROOT, 'netlify/functions/lib/passageVocab.js'));
const { vocabKeysFromPart, scoreRowsForVocab } = require(path.join(
  ROOT,
  'netlify/functions/lib/poolSearchCache.js'));
const { normalizeB1Topic, B1_TOPICS } = require(path.join(ROOT, 'js/data/b1Topics.js'));

const CASES = [
  { topic: 'Umwelt', words: ['Recycling', 'Klimawandel', 'Müll', 'Energie', 'Umwelt', 'Verschmutzung', 'Naturschutz', 'Abfall', 'Solar', 'Windkraft', 'Nachhaltigkeit', 'Ressource', 'Klima', 'Emission', 'Pflanze'] },
  { topic: 'Arbeit', words: ['Beruf', 'Gehalt', 'Kollege', 'Bewerbung', 'Firma', 'Arbeitsplatz', 'Vertrag', 'Vorgesetzter', 'Teilzeit', 'Überstunden', 'Kündigung', 'Praktikum', 'Qualifikation', 'Team', 'Stress'] },
  { topic: 'Technik', words: ['Smartphone', 'Internet', 'Computer', 'App', 'Digital', 'Software', 'Gerät', 'Online', 'Daten', 'Technik', 'Netzwerk', 'Passwort'] },
  { topic: 'Gesundheit', words: ['Arzt', 'Krankheit', 'Medikament', 'Gesundheit', 'Sport', 'Ernährung', 'Schmerz', 'Therapie', 'Krankenhaus', 'Allergie', 'Impfung', 'Ruhe', 'Stress', 'Vitamine', 'Untersuchung'] },
  { topic: 'Reisen', words: ['Reise', 'Flug', 'Hotel', 'Gepäck', 'Ticket', 'Bahn', 'Urlaub', 'Ausflug', 'Koffer', 'Ankunft'] },
  { topic: 'Bildung', words: ['Schule', 'Lernen', 'Prüfung', 'Kurs', 'Universität', 'Lehrer', 'Schüler', 'Hausaufgabe', 'Note', 'Abschluss', 'Studium', 'Seminar', 'Fach', 'Bibliothek', 'Vorlesung'] },
];

function stockByTeil(records) {
  const counts = {};
  for (const r of records) {
    const k = `${r.module}:T${r.teil}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

function rowsForModule(records, module) {
  return records
    .filter((r) => r.module === module)
    .map((r) => {
      const part = r.part || r;
      const keys = vocabKeysFromPart(part);
      return {
        id: r.id,
        teil: Number(r.teil),
        topicTag: r.topicTag || part.topicTag,
        topicSlug: normalizeB1Topic(r.topicTag || part.topicTag || ''),
        vocabKeys: keys,
        part,
        servedCount: 0,
      };
    });
}

function greedyAssemble(rows, teils, words, topicTag, excludeIds = []) {
  const requested = lemmatizeWords(words, 'de');
  const remaining = new Set(requested);
  const covered = new Set();
  const picks = [];
  const usedTopics = new Set();
  const exclude = new Set(excludeIds);

  for (const teil of teils) {
    const pool = rows.filter((r) => r.teil === teil && !exclude.has(r.id));
    const topicRows = pool.filter((r) => r.topicSlug === normalizeB1Topic(topicTag));
    const candidates = topicRows.length ? topicRows : pool;
    const scored = scoreRowsForVocab(candidates, {
      words: [...remaining],
      excludeTopics: [...usedTopics],
    });
    const best = scored[0];
    if (!best || best.score <= 0) {
      const fallback = scored.find((s) => s.row) || null;
      if (fallback?.row) {
        exclude.add(fallback.row.id);
        picks.push({ teil, score: 0, topicRelaxed: !topicRows.length, covered: [] });
        continue;
      }
      picks.push({ teil, miss: true });
      continue;
    }
    exclude.add(best.row.id);
    for (const w of best.covered) {
      covered.add(w);
      remaining.delete(w);
    }
    if (best.row.topicSlug) usedTopics.add(best.row.topicSlug);
    picks.push({ teil, score: best.score, covered: best.covered });
  }
  return {
    covered: covered.size,
    picks,
    excludeIds: [...exclude],
    maxPerTeil: picks.map((p) => p.score || 0),
  };
}

function simulateSessions(rows, teils, topic, words, nSessions, minCover) {
  const excludeIds = [];
  let ok = 0;
  const coverages = [];
  for (let i = 0; i < nSessions; i++) {
    const r = greedyAssemble(rows, teils, words, topic, excludeIds);
    excludeIds.push(...r.excludeIds.filter((id) => !excludeIds.includes(id)));
    coverages.push(r.covered);
    if (r.covered >= minCover) ok++;
  }
  return { ok, nSessions, rate: ok / nSessions, coverages, avg: coverages.reduce((a, b) => a + b, 0) / nSessions };
}

/** Model densified index: each part keeps 10 topic-aligned lemmas from its passage text overlap. */
function densifyRows(rows, topicLemmaPool) {
  return rows.map((r) => {
    const topic = normalizeB1Topic(r.topicTag || r.topicSlug || '');
    const pool = topicLemmaPool[topic] || [];
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 10);
    const merged = new Set([...shuffled, ...r.vocabKeys.slice(0, 2)]);
    return { ...r, vocabKeys: [...merged], topicSlug: topic };
  });
}

function topicLemmaPools() {
  const pools = {};
  for (const c of CASES) {
    pools[normalizeB1Topic(c.topic)] = lemmatizeWords(c.words, 'de');
  }
  return pools;
}

function partsNeededForCoverage(rows, teils, topic, words, targetSessions, minCover, targetRate) {
  let nParts = rows.filter((r) => teils.includes(r.teil)).length;
  const base = simulateSessions(rows, teils, topic, words, targetSessions, minCover);
  if (base.rate >= targetRate) return { needed: nParts, baseRate: base.rate };

  // Clone parts with synthetic IDs to model linear stock growth (same tag density).
  const topicSlug = normalizeB1Topic(topic);
  const perTeil = {};
  for (const t of teils) perTeil[t] = rows.filter((r) => r.teil === t && r.topicSlug === topicSlug);
  const template = rows.filter((r) => teils.includes(r.teil));

  while (nParts < 500) {
    const t = teils[Math.floor(Math.random() * teils.length)];
    const src = perTeil[t].length ? perTeil[t][Math.floor(Math.random() * perTeil[t].length)] : template.find((r) => r.teil === t);
    if (!src) break;
    const clone = { ...src, id: `synth-${nParts}`, vocabKeys: [...src.vocabKeys] };
    rows.push(clone);
    perTeil[t].push(clone);
    nParts++;
    const sim = simulateSessions(rows, teils, topic, words, targetSessions, minCover);
    if (sim.rate >= targetRate) return { needed: nParts, baseRate: sim.rate };
  }
  return { needed: nParts, baseRate: base.rate };
}

// ─── Main ───────────────────────────────────────────────────────────────────
const records = loadSeedRecords('de', 'B1');
const stock = stockByTeil(records);
const bp = loadBlueprintFileSync('goethe_B1');
const lesenTeils = lesenBlueprintTeils(bp);
const horenTeils = horenBlueprintTeils(bp);

const EXAM_PARTS = {
  lesen: lesenTeils.length,
  horen: horenTeils.length,
  schreiben: 3,
  sprechen: 3,
};
const PARTS_PER_EXAM = Object.values(EXAM_PARTS).reduce((a, b) => a + b, 0);

const need12 = {
  'lesen:T1': 12, 'lesen:T2': 12, 'lesen:T3': 12, 'lesen:T4': 12, 'lesen:T5': 12,
  'horen:T1': 12, 'horen:T2': 12, 'horen:T3': 12, 'horen:T4': 12,
  'schreiben:T1': 12, 'schreiben:T2': 12, 'schreiben:T3': 12,
  'sprechen:T1': 12, 'sprechen:T2': 12, 'sprechen:T3': 12,
};
const need42 = {};
for (const k of Object.keys(stock)) {
  if (k.startsWith('lesen:') || k.startsWith('horen:')) need42[k] = 42;
  else if (k.startsWith('schreiben:') || k.startsWith('sprechen:')) need42[k] = 12;
}

const deficit12 = {};
const deficit42 = {};
const maxDisjointExams = {};
for (const [k, have] of Object.entries(stock)) {
  deficit12[k] = Math.max(0, (need12[k] || 0) - have);
  deficit42[k] = Math.max(0, (need42[k] || 0) - have);
  if (need12[k]) maxDisjointExams[k] = have;
}
const bottleneck12 = Math.min(...Object.keys(need12).map((k) => stock[k] || 0));

// Coverage on real cases
const lesenRows = rowsForModule(records, 'lesen');
const horenRows = rowsForModule(records, 'horen');

const caseStats = [];
for (const c of CASES) {
  const mod = c.topic === 'Reisen' || c.topic === 'Bildung' ? 'lesen' : 'lesen';
  const words = c.words.slice(0, 12);
  const les = greedyAssemble(lesenRows, lesenTeils, words, c.topic, []);
  const hor = greedyAssemble(horenRows, horenTeils, words, c.topic, []);
  caseStats.push({
    topic: c.topic,
    lesenCovered: les.covered,
    horenCovered: hor.covered,
    lesenMaxPerTeil: les.maxPerTeil,
    horenMaxPerTeil: hor.maxPerTeil,
  });
}

const sessions30lesen = simulateSessions(lesenRows, lesenTeils, 'Arbeit', CASES[1].words.slice(0, 15), 30, 4);
const sessions30horen = simulateSessions(horenRows, horenTeils, 'Arbeit', CASES[1].words.slice(0, 15), 30, 4);

// Densify path
const pools = topicLemmaPools();
const lesenDense = densifyRows(lesenRows, pools);
const horenDense = densifyRows(horenRows, pools);
const dense30lesen = simulateSessions(lesenDense, lesenTeils, 'Arbeit', CASES[1].words.slice(0, 15), 30, 4);
const dense30horen = simulateSessions(horenDense, horenTeils, 'Arbeit', CASES[1].words.slice(0, 15), 30, 4);

// All cases ≥4 on single shot (current vs densified model)
let ge4lesenNow = 0;
let ge4horenNow = 0;
let ge4lesenDense = 0;
let ge4horenDense = 0;
for (const c of CASES) {
  const w = c.words.slice(0, Math.min(15, c.words.length));
  if (greedyAssemble(lesenRows, lesenTeils, w, c.topic, []).covered >= 4) ge4lesenNow++;
  if (greedyAssemble(horenRows, horenTeils, w, c.topic, []).covered >= 4) ge4horenNow++;
  if (greedyAssemble(lesenDense, lesenTeils, w, c.topic, []).covered >= 4) ge4lesenDense++;
  if (greedyAssemble(horenDense, horenTeils, w, c.topic, []).covered >= 4) ge4horenDense++;
}

// Cost table from generation-cost.jsonl
const costLines = fs.readFileSync(path.join(ROOT, 'batches/ready/gate-logs/generation-cost.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const costOk = costLines.filter((e) => e.ok);
const costBy = {};
for (const e of costOk) {
  const k = `${e.module}-t${e.teil}`;
  if (!costBy[k]) costBy[k] = { n: 0, c: 0 };
  costBy[k].n++;
  costBy[k].c += e.costUsd;
}
const defaultCost = costOk.reduce((s, e) => s + e.costUsd, 0) / costOk.length;

const out = {
  generatedAt: new Date().toISOString(),
  examStructure: { partsPerExam: PARTS_PER_EXAM, breakdown: EXAM_PARTS },
  stockCurrent: stock,
  maxDisjointFullExamsToday: bottleneck12,
  deficitFor12Exams: deficit12,
  deficitFor42PartsCombined: deficit42,
  coverageCases: caseStats,
  sessions30: { lesen: sessions30lesen, horen: sessions30horen },
  sessions30Densified: { lesen: dense30lesen, horen: dense30horen },
  casesGe4: {
    current: { lesen: ge4lesenNow, horen: ge4horenNow, totalCases: CASES.length },
    densified: { lesen: ge4lesenDense, horen: ge4horenDense, totalCases: CASES.length },
  },
  costPerOkPart: Object.fromEntries(Object.entries(costBy).map(([k, v]) => [k, +(v.c / v.n).toFixed(4)])),
  defaultCostUsd: +defaultCost.toFixed(4),
};

const totalNewParts = Object.values(deficit42).reduce((a, b) => a + b, 0);
let totalCost = 0;
for (const [k, d] of Object.entries(deficit42)) {
  if (!d) continue;
  const [mod, t] = k.split(':');
  const ck = `${mod}-t${t.replace('T', '')}`;
  const unit = costBy[ck] ? costBy[ck].c / costBy[ck].n : defaultCost;
  totalCost += d * unit;
}
out.totalNewPartsCombined = totalNewParts;
out.totalCostUsdCombined = +totalCost.toFixed(2);

fs.mkdirSync(path.join(ROOT, 'batches/ready/gate-logs'), { recursive: true });
const outPath = path.join(ROOT, 'batches/ready/gate-logs/pool-dimension-pro-user-2026-07-13.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

console.log(JSON.stringify(out, null, 2));
console.log('\nWritten:', outPath);
