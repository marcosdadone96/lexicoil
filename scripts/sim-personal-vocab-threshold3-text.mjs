#!/usr/bin/env node
/**
 * Personal pool — success rate for ≥3 user lemmas verified in full part text (not vocabIndex alone).
 *
 * Run: node scripts/sim-personal-vocab-threshold3-text.mjs
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { loadBlueprintFileSync } = require(path.join(ROOT, 'js/engine/validation/blueprintResolver.js'));
const { lesenBlueprintTeils, horenBlueprintTeils } = require(path.join(
  ROOT,
  'js/engine/personalLesenPoolFallback.js',
));
const { pickReusablePartByVocab } = require(path.join(
  ROOT,
  'netlify/functions/lib/reusablePartsStore.js',
));
const { planPersonalModuleAssembly } = require(path.join(
  ROOT,
  'netlify/functions/lib/personalModuleVocabPlan.js',
));
const { lemmatizeWords } = require(path.join(ROOT, 'netlify/functions/lib/passageVocab.js'));
const { partText } = require(path.join(ROOT, 'netlify/functions/lib/partIndex.js'));
const {
  buildVocabIndex,
  vocabEntryKeys,
  canonicalizeVocabQuery,
} = require(path.join(ROOT, 'netlify/functions/lib/vocabIndexQuality.js'));
const { findLemmaPair } = require(path.join(ROOT, 'netlify/functions/lib/vocabPhrasesUtils.js'));
const { partPassesPublishGate } = require(path.join(ROOT, 'netlify/functions/lib/partPublishGate.js'));

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

const args = process.argv.slice(2);
const LEVEL = String(args.find((a) => a.startsWith('--level='))?.split('=')[1] || 'B1').toUpperCase();
const blueprintId = `goethe_${LEVEL}`;

function loadSeedRecords(level = LEVEL) {
  const p = path.join(ROOT, 'library/reusable-seed', `de_${level}.json`);
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  return (data.records || []).filter(
    (r) =>
      r.verified &&
      r.complete !== false &&
      (r.sem1VerifiedAt || r.sem1Skipped) &&
      !r.disabled &&
      partPassesPublishGate(r),
  );
}

function buildPartTextCache(records, lang = 'de', level = LEVEL) {
  const byId = new Map();
  for (const r of records) {
    const part = r.part || r;
    const text = partText(part);
    const index = buildVocabIndex(part, { lang, level, text });
    const keys = new Set();
    for (const entry of index) {
      for (const k of vocabEntryKeys(entry)) keys.add(k);
    }
    byId.set(r.id, { keys, text, module: String(r.module).toLowerCase(), teil: Number(r.teil) });
  }
  return byId;
}

function queryKeysForUserWords(userWords, lang = 'de') {
  return userWords.map((w) => {
    const { words: qkeys } = canonicalizeVocabQuery([w], { lang });
    return { surface: String(w), qkeys };
  });
}

function countUserWordsInCachedPart(cached, userQueryKeys) {
  if (!cached?.text) return { count: 0, words: [] };
  const matched = [];
  for (const { surface, qkeys } of userQueryKeys) {
    if (qkeys.some((k) => cached.keys.has(String(k).toLowerCase()))) {
      matched.push(surface);
      continue;
    }
    if (findLemmaPair(cached.text, surface)) matched.push(surface);
  }
  return { count: matched.length, words: matched };
}

/** Mixed-topic realistic decks (user saves words across themes). */
const CASES = [
  { id: 'M01', module: 'lesen', topic: 'Umwelt', words: ['Recycling', 'Klimawandel', 'Beruf', 'Gehalt', 'Smartphone', 'Arzt'] },
  { id: 'M02', module: 'lesen', topic: 'Arbeit', words: ['Bewerbung', 'Kollege', 'Reise', 'Flug', 'Ernährung', 'Sport', 'Internet'] },
  { id: 'M03', module: 'lesen', topic: 'Gesundheit', words: ['Medikament', 'Therapie', 'Firma', 'Vertrag', 'App', 'Daten', 'Passwort'] },
  { id: 'M04', module: 'lesen', topic: 'Technik', words: ['Computer', 'Digital', 'Schule', 'Prüfung', 'Müll', 'Energie', 'Team'] },
  { id: 'M05', module: 'lesen', topic: 'Bildung', words: ['Universität', 'Seminar', 'Hotel', 'Gepäck', 'Krankheit', 'Schmerz', 'Kündigung'] },
  { id: 'M06', module: 'lesen', topic: 'Reisen', words: ['Urlaub', 'Bahn', 'Überstunden', 'Teilzeit', 'Naturschutz', 'Solar', 'Software'] },
  { id: 'M07', module: 'lesen', topic: 'Freizeit', words: ['Ausflug', 'Koffer', 'Lernen', 'Hausaufgabe', 'Netzwerk', 'Online', 'Stress'] },
  { id: 'M08', module: 'lesen', topic: 'Umwelt', words: ['Windkraft', 'Nachhaltigkeit', 'Praktikum', 'Karriere', 'Allergie', 'Impfung', 'Tablet'] },
  { id: 'M09', module: 'lesen', topic: 'Arbeit', words: ['Arbeitsplatz', 'Vorgesetzter', 'Ticket', 'Ankunft', 'Verschmutzung', 'Abfall', 'Download'] },
  { id: 'M10', module: 'lesen', topic: 'Gesundheit', words: ['Krankenhaus', 'Untersuchung', 'Qualifikation', 'Lohn', 'Klima', 'Emission', 'Laptop'] },
  { id: 'M11', module: 'horen', topic: 'Arbeit', words: ['Beruf', 'Gehalt', 'Recycling', 'Umwelt', 'Arzt', 'Sport', 'Computer'] },
  { id: 'M12', module: 'horen', topic: 'Umwelt', words: ['Klimawandel', 'Müll', 'Bewerbung', 'Kollege', 'Reise', 'Flug', 'App'] },
  { id: 'M13', module: 'horen', topic: 'Reisen', words: ['Hotel', 'Gepäck', 'Firma', 'Vertrag', 'Medikament', 'Gesundheit', 'Internet'] },
  { id: 'M14', module: 'horen', topic: 'Technik', words: ['Smartphone', 'Daten', 'Schule', 'Kurs', 'Ernährung', 'Therapie', 'Team'] },
  { id: 'M15', module: 'horen', topic: 'Bildung', words: ['Prüfung', 'Lernen', 'Urlaub', 'Bahn', 'Digital', 'Passwort', 'Stress'] },
  { id: 'M16', module: 'horen', topic: 'Gesundheit', words: ['Krankheit', 'Schmerz', 'Überstunden', 'Teilzeit', 'Naturschutz', 'Energie', 'Software'] },
  { id: 'M17', module: 'horen', topic: 'Freizeit', words: ['Ausflug', 'Seminar', 'Universität', 'Solar', 'Windkraft', 'Netzwerk', 'Online'] },
  { id: 'M18', module: 'horen', topic: 'Arbeit', words: ['Arbeitszeit', 'Stelle', 'Ticket', 'Ankunft', 'Allergie', 'Impfung', 'Update'] },
  { id: 'M19', module: 'lesen', topic: 'Technik', words: ['Gerät', 'Technik', 'Campus', 'Zeugnis', 'Wald', 'Wasser', 'Programm'] },
  { id: 'M20', module: 'lesen', topic: 'Bildung', words: ['Dozent', 'Bibliothek', 'Kündigung', 'Praktikum', 'Ressource', 'Pflanze', 'Sicherheit'] },
  { id: 'M21', module: 'horen', topic: 'Umwelt', words: ['Luft', 'Klima', 'Karriere', 'Qualifikation', 'Vitamine', 'Ruhe', 'Cloud'] },
  { id: 'M22', module: 'lesen', topic: 'Reisen', words: ['Reise', 'Flug', 'Bildschirm', 'Tastatur', 'Pause', 'Arbeitsplatz', 'Nachhaltigkeit'] },
  { id: 'M23', module: 'horen', topic: 'Technik', words: ['Server', 'Programm', 'Lehrer', 'Schüler', 'Verschmutzung', 'Abfall', 'Vorgesetzter'] },
  { id: 'M24', module: 'lesen', topic: 'Gesundheit', words: ['Sport', 'Ernährung', 'Stipendium', 'Abschluss', 'Emission', 'Recyceln', 'Bewerbung'] },
  { id: 'M25', module: 'horen', topic: 'Bildung', words: ['Hausaufgabe', 'Note', 'Ausbildung', 'Wissen', 'Gepäck', 'Koffer', 'Smartphone'] },
  { id: 'M26', module: 'lesen', topic: 'Arbeit', words: ['Gehalt', 'Beruf', 'Naturschutz', 'Solar', 'Untersuchung', 'Krankenhaus', 'Digital'] },
  { id: 'M27', module: 'horen', topic: 'Gesundheit', words: ['Arzt', 'Medikament', 'Prüfer', 'Unterricht', 'Windkraft', 'Müll', 'Datenschutz'] },
  { id: 'M28', module: 'lesen', topic: 'Umwelt', words: ['Umwelt', 'Recycling', 'Stelle', 'Lohn', 'Seminar', 'Fach', 'Gerät'] },
];

function bestTextScoreForTeil(partCache, records, module, teil, userQueryKeys) {
  const rows = records.filter(
    (r) => String(r.module).toLowerCase() === module && Number(r.teil) === Number(teil),
  );
  let best = { count: 0, id: null, words: [] };
  for (const r of rows) {
    const cached = partCache.get(r.id);
    const { count, words } = countUserWordsInCachedPart(cached, userQueryKeys);
    if (count > best.count) best = { count, id: r.id, words };
  }
  return { ...best, poolSize: rows.length };
}

async function greedyModuleAssemblyText(module, userWords, userQueryKeys, topicTag, partCache, level = LEVEL) {
  const bp = loadBlueprintFileSync(blueprintId);
  const teils = module === 'lesen' ? lesenBlueprintTeils(bp) : horenBlueprintTeils(bp);
  const lemmas = lemmatizeWords(userWords, 'de');
  const remaining = new Set(lemmas.map((w) => w.toLowerCase()));
  const coveredText = new Set();
  const picks = [];
  const excludeIds = [];
  const usedTopics = new Set();

  for (const teil of teils) {
    const hit = await pickReusablePartByVocab(store, 'de', LEVEL, module, {
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
    const textHit = countUserWordsInCachedPart(partCache.get(hit.id), userQueryKeys);
    for (const w of textHit.words) coveredText.add(String(w).toLowerCase());
    for (const w of textHit.words) {
      const lw = lemmatizeWords([w], 'de')[0];
      if (lw) remaining.delete(lw.toLowerCase());
    }
    if (hit.topic) usedTopics.add(String(hit.topic).toLowerCase());
    picks.push({
      teil,
      id: hit.id,
      indexScore: hit.coverage?.covered ?? (hit.coveredWords || []).length,
      textCount: textHit.count,
      textWords: textHit.words,
    });
  }

  return {
    teils,
    picks,
    moduleTextUnion: coveredText.size,
    moduleTextWords: [...coveredText],
  };
}

async function main() {
  const records = loadSeedRecords(LEVEL);
  const byMod = { lesen: 0, horen: 0 };
  for (const r of records) {
    const m = String(r.module).toLowerCase();
    if (byMod[m] != null) byMod[m]++;
  }

  console.log('Building part text index cache…');
  const partCache = buildPartTextCache(records);
  console.log('Cached', partCache.size, 'parts');

  const teilPairResults = [];
  const caseResults = [];

  for (const c of CASES) {
    const userQueryKeys = queryKeysForUserWords(c.words, 'de');
    const bp = loadBlueprintFileSync(blueprintId);
    const teils =
      c.module === 'lesen' ? lesenBlueprintTeils(bp) : horenBlueprintTeils(bp);
    const perTeil = [];
    for (const teil of teils) {
      const best = bestTextScoreForTeil(partCache, records, c.module, teil, userQueryKeys);
      perTeil.push({ teil, ...best, gte3: best.count >= 3 });
      teilPairResults.push({
        caseId: c.id,
        module: c.module,
        teil,
        gte3: best.count >= 3,
        bestTextCount: best.count,
      });
    }
    const maxBest = perTeil.reduce((m, p) => Math.max(m, p.count), 0);
    const anyTeilGte3 = perTeil.some((p) => p.gte3);

    const lemmas = lemmatizeWords(c.words, 'de');
    const plan = await planPersonalModuleAssembly(store, 'de', LEVEL, c.module, {
      words: lemmas,
      topicTag: c.topic,
      excludeIds: [],
    });
    const assembly = await greedyModuleAssemblyText(
      c.module,
      c.words,
      userQueryKeys,
      c.topic,
      partCache,
      LEVEL,
    );

    const planIndexOk = plan?.ok && (plan.coveredCount ?? 0) >= 3;
    const planTextWouldFail = planIndexOk && assembly.moduleTextUnion < 3;

    caseResults.push({
      id: c.id,
      module: c.module,
      topic: c.topic,
      nWords: c.words.length,
      anyTeilBestGte3: anyTeilGte3,
      maxBestSingleTeil: maxBest,
      perTeilBest: perTeil.map((p) => ({
        teil: p.teil,
        bestText: p.count,
        poolSize: p.poolSize,
        gte3: p.gte3,
      })),
      planIndexOk,
      planCoveredCount: plan?.coveredCount ?? null,
      assemblyTextUnion: assembly.moduleTextUnion,
      assemblyTextGte3: assembly.moduleTextUnion >= 3,
      planTextWouldFail,
      picks: assembly.picks,
    });
  }

  const nCases = caseResults.length;
  const nTeilPairs = teilPairResults.length;
  const teilPairsGte3 = teilPairResults.filter((x) => x.gte3).length;
  const casesAnyTeilGte3 = caseResults.filter((x) => x.anyTeilBestGte3).length;
  const casesAssemblyGte3 = caseResults.filter((x) => x.assemblyTextGte3).length;
  const casesPlanOk = caseResults.filter((x) => x.planIndexOk).length;
  const casesPlanOkTextFail = caseResults.filter((x) => x.planTextWouldFail).length;

  const summary = {
    generatedAt: new Date().toISOString(),
    seedPath: `library/reusable-seed/de_${LEVEL}.json`,
    level: LEVEL,
    poolRecordsTotal: records.length,
    poolRecordsByModule: byMod,
    textVerification:
      'buildVocabIndex(partText) + canonicalizeVocabQuery per user word + findLemmaPair separables',
    cases: nCases,
    metrics: {
      pctTeilPairsBestCandidateGte3: Math.round((teilPairsGte3 / nTeilPairs) * 1000) / 10,
      pctCasesAnyTeilHasBestGte3: Math.round((casesAnyTeilGte3 / nCases) * 1000) / 10,
      pctCasesGreedyAssemblyTextUnionGte3: Math.round((casesAssemblyGte3 / nCases) * 1000) / 10,
      pctCasesPlanIndexGte3: Math.round((casesPlanOk / nCases) * 1000) / 10,
      pctCasesPlanIndexOkButTextUnionLt3: Math.round((casesPlanOkTextFail / nCases) * 1000) / 10,
    },
    teilPairsGte3,
    nTeilPairs,
    casesAnyTeilGte3,
    casesAssemblyGte3,
    casesPlanOk,
    casesPlanOkTextFail,
    caseResults,
  };

  const out = path.join(
    ROOT,
    `batches/ready/gate-logs/personal-vocab-threshold3-text-${LEVEL}-2026-07-28.json`,
  );
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(summary, null, 2));

  console.log('Pool records (publish gate):', records.length, byMod);
  console.log('\n=== Métricas (umbral ≥3 en texto completo) ===');
  console.log(
    `Teil×caso — mejor candidato del pool ≥3: ${summary.metrics.pctTeilPairsBestCandidateGte3}% (${teilPairsGte3}/${nTeilPairs})`,
  );
  console.log(
    `Casos — algún Teil con mejor candidato ≥3: ${summary.metrics.pctCasesAnyTeilHasBestGte3}% (${casesAnyTeilGte3}/${nCases})`,
  );
  console.log(
    `Casos — ensamblado greedy (Vía A) unión texto ≥3: ${summary.metrics.pctCasesGreedyAssemblyTextUnionGte3}% (${casesAssemblyGte3}/${nCases})`,
  );
  console.log(
    `Casos — planificador índice ≥3: ${summary.metrics.pctCasesPlanIndexGte3}% (${casesPlanOk}/${nCases})`,
  );
  console.log(
    `Casos — plan índice OK pero texto unión <3: ${summary.metrics.pctCasesPlanIndexOkButTextUnionLt3}% (${casesPlanOkTextFail}/${nCases})`,
  );
  console.log('\nReport:', out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
