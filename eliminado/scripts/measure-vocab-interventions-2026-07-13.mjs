#!/usr/bin/env node
/**
 * Real coverage measurement: baseline vs reindexVocabV3 vs targetUsage vs fake densify.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { reindexPartVocab } = await import('./lib/reindexVocabV3.mjs');
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
  'netlify/functions/lib/poolSearchCache.js',
));
const { normalizeB1Topic } = require(path.join(ROOT, 'js/data/b1Topics.js'));

const CASES = [
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

function clonePart(part) {
  return JSON.parse(JSON.stringify(part));
}

function targetUsageToIndex(tu) {
  if (!Array.isArray(tu)) return [];
  return tu.map((e) => ({
    word: e.word,
    lemma: String(e.word || '').toLowerCase(),
    concept: String(e.word || '').toLowerCase(),
    aliases: (e.surfaces || []).map((s) => String(s).toLowerCase()),
    sources: ['targetUsage'],
    quality: 'validated',
  }));
}

function applyTargetUsage(part) {
  const tu = part.targetUsage || part.userVocabFeedback?.targetUsage;
  if (!Array.isArray(tu) || !tu.length) return part;
  const extra = targetUsageToIndex(tu);
  const existing = Array.isArray(part.vocabIndex) ? part.vocabIndex : [];
  const byLemma = new Map(existing.map((e) => [String(e.lemma || e.word || e.concept || '').toLowerCase(), e]));
  for (const e of extra) byLemma.set(e.lemma, e);
  part.vocabIndex = [...byLemma.values()].slice(0, 45);
  part.vocabIndexVersion = 'targetUsage-overlay';
  return part;
}

function buildRowsFromSeed(records, transform) {
  return records.map((rec) => {
    let part = clonePart(rec.part || rec);
    part.id = rec.id;
    part.module = rec.module;
    part.teil = rec.teil;
    part.topicTag = rec.topicTag || part.topicTag;
    part = transform(part);
    return {
      id: rec.id,
      teil: Number(rec.teil),
      topicTag: rec.topicTag || part.topicTag,
      topicSlug: normalizeB1Topic(rec.topicTag || part.topicTag || ''),
      vocabKeys: vocabKeysFromPart(part),
      part,
      servedCount: 0,
    };
  });
}

function greedyAssemble(rows, teils, words, topicTag, excludeIds = []) {
  const requested = lemmatizeWords(words, 'de');
  const remaining = new Set(requested);
  const covered = new Set();
  const exclude = new Set(excludeIds);
  const usedTopics = new Set();
  for (const teil of teils) {
    const pool = rows.filter((r) => r.teil === teil && !exclude.has(r.id));
    const topicRows = pool.filter((r) => r.topicSlug === normalizeB1Topic(topicTag));
    const candidates = topicRows.length ? topicRows : pool;
    const scored = scoreRowsForVocab(candidates, { words: [...remaining], excludeTopics: [...usedTopics] });
    const best = scored[0];
    if (!best?.row || best.score <= 0) {
      const fallback = scored.find((s) => s.row) || null;
      if (fallback?.row) exclude.add(fallback.row.id);
      continue;
    }
    exclude.add(best.row.id);
    for (const w of best.covered) {
      covered.add(w);
      remaining.delete(w);
    }
    if (best.row.topicSlug) usedTopics.add(best.row.topicSlug);
  }
  return {
    requested: requested.length,
    covered: covered.size,
    pct: requested.length ? Math.round((covered.size / requested.length) * 1000) / 10 : 0,
  };
}

function runCases(rows, module) {
  const bp = loadBlueprintFileSync('goethe_B1');
  const teils = module === 'lesen' ? lesenBlueprintTeils(bp) : horenBlueprintTeils(bp);
  const subset = CASES.filter((c) => c.module === module);
  const results = subset.map((c) => {
    const r = greedyAssemble(rows, teils, c.words, c.topic);
    return { id: c.id, topic: c.topic, covered: r.covered, pct: r.pct };
  });
  const avg = results.reduce((s, r) => s + r.pct, 0) / results.length;
  const ge4 = results.filter((r) => r.covered >= 4).length;
  return { avgPct: Math.round(avg * 10) / 10, ge4, total: results.length, cases: results };
}

function sim30Sessions(rows, module) {
  const bp = loadBlueprintFileSync('goethe_B1');
  const teils = module === 'lesen' ? lesenBlueprintTeils(bp) : horenBlueprintTeils(bp);
  let exclude = [];
  let ok = 0;
  const topics = [...new Set(CASES.map((c) => c.topic))];
  for (let i = 0; i < 30; i++) {
    const topic = topics[i % topics.length];
    const words = CASES.find((c) => c.topic === topic && c.module === module)?.words
      || CASES.find((c) => c.topic === topic)?.words
      || CASES[1].words;
    const r = greedyAssemble(rows, teils, words.slice(0, 15), topic, exclude);
    exclude = [...new Set([...exclude, ...rows.map((x) => x.id)])];
    if (r.covered >= 4) ok++;
  }
  return { ok, n: 30, ratePct: Math.round((ok / 30) * 1000) / 10 };
}

const seed = loadSeedRecords('de', 'B1');
const lesenHoren = seed.filter((r) => r.module === 'lesen' || r.module === 'horen');

const baselineRows = buildRowsFromSeed(lesenHoren, (p) => p);
const reindexRows = buildRowsFromSeed(lesenHoren, (p) => reindexPartVocab(p, { force: true }).part);

const poolDir = path.join(ROOT, 'batches/ready/pool-verified');
let poolTU = 0;
let poolFiles = 0;
const poolParts = [];
for (const f of fs.readdirSync(poolDir).filter((x) => x.endsWith('.json'))) {
  poolFiles++;
  const raw = JSON.parse(fs.readFileSync(path.join(poolDir, f), 'utf8'));
  const tu = raw.targetUsage || raw.userVocabFeedback?.targetUsage;
  if (Array.isArray(tu) && tu.length) poolTU++;
  const parts = raw.parts || [raw];
  for (const p of parts) {
    const part = clonePart(p);
    part.targetUsage = part.targetUsage || tu;
    if (!part.targetUsage?.length) continue;
    applyTargetUsage(part);
    part.module = part.module || raw.module || f.split('-')[0];
    part.teil = Number(part.teil || part.questions?.[0]?.teil || f.match(/-t(\d+)/)?.[1] || 0);
    part.topicTag = part.topicTag || raw.topicTag || part.passages?.[0]?.topicTag;
    poolParts.push({
      id: part.id || f,
      teil: part.teil,
      topicTag: part.topicTag,
      topicSlug: normalizeB1Topic(part.topicTag || ''),
      vocabKeys: vocabKeysFromPart(part),
      part,
      servedCount: 0,
    });
  }
}

const targetUsageRows = [
  ...baselineRows,
  ...poolParts.filter((p) => p.part.module === 'lesen' || p.part.module === 'horen'),
];

const topicDeckMap = Object.fromEntries(
  [...new Set(CASES.map((c) => c.topic))].map((t) => [normalizeB1Topic(t), lemmatizeWords(
    CASES.find((c) => c.topic === t)?.words || [],
    'de',
  )]),
);
const densifyRows = baselineRows.map((r) => {
  const deck = topicDeckMap[r.topicSlug] || [];
  const shuffled = [...deck].sort(() => Math.random() - 0.5).slice(0, 10);
  const merged = new Set([...shuffled, ...r.vocabKeys.slice(0, 2)]);
  return { ...r, vocabKeys: [...merged] };
});

function summarize(label, lesenRows, horenRows) {
  const lesen = runCases(lesenRows, 'lesen');
  const horen = runCases(horenRows, 'horen');
  const combinedAvg = Math.round(((lesen.avgPct + horen.avgPct) / 2) * 10) / 10;
  return {
    label,
    lesen,
    horen,
    combinedAvg,
    sessions30ge4: { lesen: sim30Sessions(lesenRows, 'lesen'), horen: sim30Sessions(horenRows, 'horen') },
  };
}

const split = (rows) => ({
  lesen: rows.filter((r) => r.part.module === 'lesen'),
  horen: rows.filter((r) => r.part.module === 'horen'),
});

const report = {
  generatedAt: new Date().toISOString(),
  note: 'Production pool = library/reusable-seed/de_B1.json. pool-verified has 0 ID overlap with seed.',
  seedStats: {
    total: seed.length,
    lesenHoren: lesenHoren.length,
    seedWithTargetUsage: lesenHoren.filter((r) => (r.part || r).targetUsage?.length).length,
    poolVerifiedFiles: poolFiles,
    poolFilesWithTargetUsage: poolTU,
    poolPartsWithTargetUsageOverlay: poolParts.length,
  },
  interventions: [
    summarize('baseline_vocabIndex_from_seed', split(baselineRows).lesen, split(baselineRows).horen),
    summarize('reindexVocabV3_on_seed_force', split(reindexRows).lesen, split(reindexRows).horen),
    summarize('targetUsage_overlay_seed_plus_pool_verified', split(targetUsageRows).lesen, split(targetUsageRows).horen),
    summarize('caminoB_fake_densify_topic_deck_injection', split(densifyRows).lesen, split(densifyRows).horen),
  ],
};

let changed = 0;
let deltaEntries = 0;
for (const rec of lesenHoren) {
  const before = vocabKeysFromPart(rec.part || rec).length;
  const after = vocabKeysFromPart(reindexPartVocab(clonePart(rec.part || rec), { force: true }).part).length;
  if (before !== after) changed++;
  deltaEntries += after - before;
}
report.reindexOnSeed = {
  partsChangedKeyCount: changed,
  total: lesenHoren.length,
  avgDeltaEntries: Math.round((deltaEntries / lesenHoren.length) * 100) / 100,
};

const out = path.join(ROOT, 'batches/ready/gate-logs/vocab-intervention-measurement-2026-07-13.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log('\nWrote', out);
