#!/usr/bin/env node
/**
 * Pre-launch verification — stock, plan simulation, cross-user bg pick.
 * Run: node scripts/prelaunch-verify-2026-07-15.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { loadSeedRecords } = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsLocalSeed.js'));
const { filterRows, scoreRowsForVocab } = require(path.join(ROOT, 'netlify/functions/lib/poolSearchCache.js'));
const { pickReusablePartByVocab, pickReusablePart } = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsStore.js'));
const { partPassesPublishGate } = require(path.join(ROOT, 'netlify/functions/lib/partPublishGate.js'));
const { partPassesAssembleMode } = require(path.join(ROOT, 'netlify/functions/lib/officialQuarantine.js'));
const PersonalPoolQuota = require(path.join(ROOT, 'js/library/personalPoolQuota.js'));
const { lesenBlueprintTeils, horenBlueprintTeils } = require(path.join(ROOT, 'js/engine/personalLesenPoolFallback.js'));
const { loadBlueprintFileSync } = require(path.join(ROOT, 'js/engine/validation/blueprintResolver.js'));
const { lemmatizeWords } = require(path.join(ROOT, 'netlify/functions/lib/passageVocab.js'));
const { getPartVocabIndex, vocabEntryKey } = require(path.join(ROOT, 'netlify/functions/lib/partIndex.js'));

const POOL_VERIFIED = path.join(ROOT, 'batches/ready/pool-verified');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/prelaunch-verify-2026-07-15.json');

const PLANS = {
  free: { exams: 5, personalLesen: 8, personalHoren: 8 },
  pro: { exams: 12, personalLesen: 30, personalHoren: 30 },
  pro_max: { exams: 12, personalLesen: 60, personalHoren: 60 },
};

const TEILE = {
  lesen: [1, 2, 3, 4, 5],
  horen: [1, 2, 3, 4],
  schreiben: [1, 2, 3],
  sprechen: [1, 2, 3],
};

function countPoolVerifiedRaw() {
  const counts = {};
  for (const f of fs.readdirSync(POOL_VERIFIED).filter((x) => x.endsWith('.json'))) {
    const m = f.match(/^(lesen|horen)-t(\d+)/i);
    if (m) {
      const mod = m[1].toLowerCase();
      const t = Number(m[2]);
      counts[mod] = counts[mod] || {};
      counts[mod][t] = (counts[mod][t] || 0) + 1;
    } else if (f.startsWith('schreiben')) {
      const b = JSON.parse(fs.readFileSync(path.join(POOL_VERIFIED, f), 'utf8'));
      for (const q of b.questions || []) {
        const t = Number(q.teil);
        counts.schreiben = counts.schreiben || {};
        counts.schreiben[t] = (counts.schreiben[t] || 0) + 1;
      }
    } else if (f.startsWith('sprechen')) {
      const b = JSON.parse(fs.readFileSync(path.join(POOL_VERIFIED, f), 'utf8'));
      for (const q of b.questions || []) {
        const t = Number(q.teil);
        counts.sprechen = counts.sprechen || {};
        counts.sprechen[t] = (counts.sprechen[t] || 0) + 1;
      }
    }
  }
  return counts;
}

function buildSeedRows(module, mode = 'practice') {
  const records = loadSeedRecords('de', 'B1').filter((r) => {
    if (String(r.module).toLowerCase() !== module) return false;
    if (!partPassesPublishGate(r)) return false;
    if (!partPassesAssembleMode(r, mode)) return false;
    return r.complete !== false && r.verified !== false;
  });
  return records.map((rec) => ({
    id: rec.id,
    teil: Number(rec.teil),
    topicTag: rec.topicTag || null,
    servedCount: rec.servedCount || 0,
    part: rec,
    disabled: false,
    complete: true,
    verified: true,
    vocabKeys: (() => {
      const keys = new Set();
      for (const e of getPartVocabIndex(rec)) {
        const k = vocabEntryKey(e);
        if (k) keys.add(k);
      }
      return [...keys];
    })(),
  }));
}

function stockByTeil(rows, teile) {
  const out = {};
  for (const t of teile) {
    out[t] = rows.filter((r) => Number(r.teil) === t).length;
  }
  return out;
}

function targetForPlan(plan, module, teil) {
  const p = PLANS[plan];
  if (module === 'lesen' || module === 'horen') {
    return p.exams + p[`personal${module.charAt(0).toUpperCase() + module.slice(1)}`];
  }
  return p.exams;
}

function simulateFullExams(rowsByModule, n, mode = 'practice') {
  const usedIds = new Set();
  const exams = [];
  const failures = [];

  const modules = {
    lesen: TEILE.lesen,
    horen: TEILE.horen,
    schreiben: TEILE.schreiben,
    sprechen: TEILE.sprechen,
  };

  for (let e = 0; e < n; e++) {
    const picked = {};
    let failed = false;
    for (const [mod, teile] of Object.entries(modules)) {
      for (const t of teile) {
        const pool = filterRows(rowsByModule[mod], { teil: t, excludeIds: [...usedIds], assembleMode: mode });
        if (!pool.length) {
          failures.push({ exam: e + 1, cell: `${mod}_${t}`, reason: 'pool_empty' });
          failed = true;
          break;
        }
        const choice = pool.sort((a, b) => (a.servedCount || 0) - (b.servedCount || 0))[0];
        picked[`${mod}_${t}`] = choice.id;
        usedIds.add(choice.id);
      }
      if (failed) break;
    }
    if (failed) break;
    exams.push(picked);
  }
  return { requested: n, assembled: exams.length, failures, uniqueParts: usedIds.size };
}

async function simulatePersonalModule(module, n, rows, teils) {
  const excludeIds = [];
  const picks = [];
  const failures = [];
  const words = ['arbeit', 'stadt', 'gesundheit', 'reisen', 'technik', 'umwelt', 'familie', 'konsum'];
  const store = { async setJSON() { return { modified: true }; }, async get() { return null; }, async delete() {}, async list() { return { blobs: [] }; } };

  for (let i = 0; i < n; i++) {
    const examExclude = [...excludeIds];
    for (const teil of teils) {
      const hit = await pickReusablePartByVocab(store, 'de', 'B1', module, {
        teil,
        words: words.slice(i % 3, (i % 3) + 5),
        excludeIds: examExclude,
        excludeTopics: [],
        assembleMode: 'practice',
      });
      if (!hit?.part?.id) {
        const fallback = await pickReusablePart(store, 'de', 'B1', module, {
          teil,
          excludeIds: examExclude,
          assembleMode: 'practice',
        });
        if (!fallback?.part?.id) {
          failures.push({ personal: i + 1, teil, reason: 'no_pick' });
          continue;
        }
        picks.push({ personal: i + 1, teil, id: fallback.part.id, source: 'generic_fallback' });
        examExclude.push(fallback.part.id);
        excludeIds.push(fallback.part.id);
        continue;
      }
      if (examExclude.includes(hit.part.id)) {
        failures.push({ personal: i + 1, teil, reason: 'repeat_despite_exclude', id: hit.part.id });
      }
      picks.push({ personal: i + 1, teil, id: hit.part.id, source: 'vocab' });
      examExclude.push(hit.part.id);
      excludeIds.push(hit.part.id);
    }
  }
  const repeats = picks.length - new Set(picks.map((p) => p.id)).size;
  return { requested: n, picks: picks.length, failures, repeats, uniqueIds: new Set(excludeIds).size };
}

function simulateCrossUserBg() {
  const lesenRows = buildSeedRows('lesen', 'practice');
  const donor = lesenRows.find((r) => r.vocabKeys?.length >= 4 && Number(r.teil) === 2);
  if (!donor) return { ok: false, reason: 'no_donor_part' };

  const donorWords = donor.vocabKeys.slice(0, 6);
  // User A already consumed this part in their history (simulated exclude for same user)
  const userA_exclude = [donor.id];
  const poolA = filterRows(lesenRows, { teil: donor.teil, excludeIds: userA_exclude, assembleMode: 'practice' });
  const userA_canReplay = poolA.some((r) => r.id === donor.id);

  // User B — separate account, empty exclude — should still receive donor from shared pool
  const poolB = filterRows(lesenRows, { teil: donor.teil, excludeIds: [], assembleMode: 'practice' });
  const scored = scoreRowsForVocab(poolB, { words: donorWords, excludeTopics: [] });
  const winner = scored[0]?.row;
  const userB_getsDonor = winner?.id === donor.id;

  return {
    ok: userB_getsDonor && !userA_canReplay,
    donorId: donor.id,
    donorContributor: donor.part?.contributor || donor.part?.bgGenerated ? 'vocab-bg' : null,
    donorWords,
    userA_excluded: userA_exclude,
    userA_stillSeesDonor: userA_canReplay,
    userB_pick: winner?.id || null,
    userB_vocabOverlap: scored[0]?.covered?.length || 0,
    userB_getsDonor,
    mechanism: 'publishExamBatchToPool/addReusablePart → pickReusablePartByVocab (exam-part.js)',
  };
}

function buildTable(stockSeed, stockPv, mode) {
  const rows = [];
  for (const [mod, teile] of Object.entries(TEILE)) {
    for (const t of teile) {
      const seed = stockSeed[mod]?.[t] ?? 0;
      const pv = stockPv[mod]?.[t] ?? 0;
      rows.push({
        teil: `${mod} T${t}`,
        stockPoolVerified: pv,
        stockSeedPractice: seed,
        targetFree: targetForPlan('free', mod, t),
        targetPro: targetForPlan('pro', mod, t),
        targetProMax: targetForPlan('pro_max', mod, t),
        alcanzaFreeSeed: seed >= targetForPlan('free', mod, t),
        alcanzaProSeed: seed >= targetForPlan('pro', mod, t),
        alcanzaProMaxSeed: seed >= targetForPlan('pro_max', mod, t),
      });
    }
  }
  return rows;
}

async function main() {
  const pvRaw = countPoolVerifiedRaw();
  const lesenRows = buildSeedRows('lesen', 'practice');
  const horenRows = buildSeedRows('horen', 'practice');
  const lesenOfficial = buildSeedRows('lesen', 'official');
  const horenOfficial = buildSeedRows('horen', 'official');

  const stockSeedPractice = {
    lesen: stockByTeil(lesenRows, TEILE.lesen),
    horen: stockByTeil(horenRows, TEILE.horen),
    schreiben: stockByTeil(buildSeedRows('schreiben', 'practice'), TEILE.schreiben),
    sprechen: stockByTeil(buildSeedRows('sprechen', 'practice'), TEILE.sprechen),
  };

  const bp = loadBlueprintFileSync('goethe_B1');
  const lesenTeils = lesenBlueprintTeils(bp);
  const horenTeils = horenBlueprintTeils(bp);

  const planSim = {};
  for (const [plan, q] of Object.entries(PLANS)) {
    const exams = simulateFullExams({
      lesen: lesenRows,
      horen: horenRows,
      schreiben: buildSeedRows('schreiben', 'practice'),
      sprechen: buildSeedRows('sprechen', 'practice'),
    }, q.exams, 'practice');
    const personalLesen = await simulatePersonalModule('lesen', q.personalLesen, lesenRows, lesenTeils);
    const personalHoren = await simulatePersonalModule('horen', q.personalHoren, horenRows, horenTeils);
    planSim[plan] = {
      quotas: q,
      fullExams: exams,
      personalLesen,
      personalHoren,
      ok:
        exams.assembled >= q.exams &&
        personalLesen.failures.length === 0 &&
        personalHoren.failures.length === 0 &&
        personalLesen.repeats === 0 &&
        personalHoren.repeats === 0,
    };
  }

  const officialExams12 = simulateFullExams(
    {
      lesen: lesenOfficial,
      horen: horenOfficial,
      schreiben: buildSeedRows('schreiben', 'official'),
      sprechen: buildSeedRows('sprechen', 'official'),
    },
    12,
    'official',
  );

  const report = {
    generatedAt: new Date().toISOString(),
    sources: {
      poolVerified: POOL_VERIFIED,
      seed: 'library/reusable-seed/de_B1.json',
      capacityReport: 'batches/ready/assembled-from-verified/capacity-report.json',
    },
    stock: {
      poolVerifiedRaw: { totalFiles: fs.readdirSync(POOL_VERIFIED).filter((f) => f.endsWith('.json')).length, byTeil: pvRaw },
      seedPractice: stockSeedPractice,
      seedOfficial: {
        lesen: stockByTeil(lesenOfficial, TEILE.lesen),
        horen: stockByTeil(horenOfficial, TEILE.horen),
      },
    },
    table: buildTable(stockSeedPractice, pvRaw, 'practice'),
    planSimulation: planSim,
    officialMode12ExamsFromSeed: officialExams12,
    crossUserBg: simulateCrossUserBg(),
    assemblyAutomatic: {
      fullExam: 'generateExam() → runExamSourceCascade → exam-pool.js pickPoolExam (no manual step)',
      personal: 'generatePersonalExam() → assembleModuleFromPool → exam-part.js pickReusablePartByVocab',
      exclusion: 'seenPartIds()/seenPoolIds() → excludeIds on server; _recordSeenPart at serve time',
      caveat: 'If pool exhausted, pickReusablePart falls back and MAY repeat (documented in reusablePartsStore)',
    },
  };

  try {
    report.stock.poolVerifiedOfficialCapacity = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'batches/ready/assembled-from-verified/capacity-report.json'), 'utf8'),
    );
  } catch {
    report.stock.poolVerifiedOfficialCapacity = { note: 'run assemble-from-pool-verified --dry-run first' };
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

  console.log('\n=== PRE-LAUNCH VERIFY ===\n');
  console.log('Stock seed (practice) Lesen:', JSON.stringify(stockSeedPractice.lesen));
  console.log('Stock seed (practice) Hören:', JSON.stringify(stockSeedPractice.horen));
  for (const [plan, sim] of Object.entries(planSim)) {
    console.log(
      `\n${plan}: exams ${sim.fullExams.assembled}/${sim.quotas.exams} · ` +
        `lesen ${sim.personalLesen.picks}/${sim.personalLesen.requested * lesenTeils.length} picks · ` +
        `horen ${sim.personalHoren.picks}/${sim.personalHoren.requested * horenTeils.length} picks · ` +
        `OK=${sim.ok}`,
    );
    if (sim.fullExams.failures.length) console.log('  exam failures:', sim.fullExams.failures.slice(0, 3));
    if (sim.personalLesen.failures.length) console.log('  lesen failures:', sim.personalLesen.failures.slice(0, 3));
    if (sim.personalHoren.failures.length) console.log('  horen failures:', sim.personalHoren.failures.slice(0, 3));
  }
  console.log('\nCross-user bg:', JSON.stringify(report.crossUserBg, null, 2));
  console.log(`\nReport: ${path.relative(ROOT, OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
