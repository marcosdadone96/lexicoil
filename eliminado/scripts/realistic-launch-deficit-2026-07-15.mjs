#!/usr/bin/env node
/**
 * Realistic early-launch stock target (not 100% quota exhaustion).
 * Cohort: handful of real users, moderate first-month usage.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { loadSeedRecords } = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsLocalSeed.js'));
const { filterRows } = require(path.join(ROOT, 'netlify/functions/lib/poolSearchCache.js'));
const { partPassesPublishGate } = require(path.join(ROOT, 'netlify/functions/lib/partPublishGate.js'));
const { partPassesAssembleMode } = require(path.join(ROOT, 'netlify/functions/lib/officialQuarantine.js'));

const OUT = path.join(ROOT, 'batches/ready/gate-logs/realistic-launch-deficit-2026-07-15.json');
const TRIAGE = path.join(ROOT, 'batches/ready/gate-logs/staging-surgical-triage-2026-07-15.json');

const COST_PER_OK = 0.1508;
const SURGICAL_SUCCESS = 0.75;

const TEILE = { lesen: [1, 2, 3, 4, 5], horen: [1, 2, 3, 4], schreiben: [1, 2, 3], sprechen: [1, 2, 3] };

/** First-month usage — not quota max. Rationale in report. */
const USAGE_PROFILES = {
  free_early: {
    label: 'Free — primer mes típico',
    exams: 3,
    personalLesen: 5,
    personalHoren: 4,
    rationale: 'Usuario nuevo explora: 2-3 simulacros + pocos personalizados por vocabulario',
  },
  pro_early: {
    label: 'Pro — primer mes típico',
    exams: 4,
    personalLesen: 10,
    personalHoren: 8,
    rationale: 'Early adopter más activo: ~1 examen/semana + personal ocasional, no 12+30',
  },
};

const COHORTS = {
  conservative_3: {
    label: '3 usuarios (2 Free + 1 Pro)',
    users: [
      { plan: 'free_early', count: 2 },
      { plan: 'pro_early', count: 1 },
    ],
  },
  base_5: {
    label: '5 usuarios (4 Free + 1 Pro) — base recomendada',
    users: [
      { plan: 'free_early', count: 4 },
      { plan: 'pro_early', count: 1 },
    ],
  },
};

/** Colchón: +3 partes/teil en LH o +25% del mínimo (lo que sea mayor). */
const CUSHION_MIN_ADD = 3;
const CUSHION_PCT = 0.25;

function buildSeedRows(module) {
  return loadSeedRecords('de', 'B1')
    .filter((r) => {
      if (String(r.module).toLowerCase() !== module) return false;
      if (!partPassesPublishGate(r)) return false;
      if (!partPassesAssembleMode(r, 'practice')) return false;
      return r.complete !== false && r.verified !== false;
    })
    .map((rec) => ({
      id: rec.id,
      teil: Number(rec.teil),
      servedCount: rec.servedCount || 0,
    }));
}

function currentStock() {
  const out = {};
  for (const mod of ['lesen', 'horen', 'schreiben', 'sprechen']) {
    const rows = buildSeedRows(mod);
    out[mod] = {};
    for (const t of TEILE[mod]) {
      out[mod][t] = rows.filter((r) => r.teil === t).length;
    }
  }
  return out;
}

function rescueGainByTeil() {
  const triage = JSON.parse(fs.readFileSync(TRIAGE, 'utf8'));
  const gain = { lesen: {}, horen: {}, schreiben: {}, sprechen: {} };
  for (const r of triage.results) {
    const mod = r.module;
    if (!gain[mod]) continue;
    const t = mod === 'schreiben' || mod === 'sprechen' ? 1 : r.teil;
    if (t == null) continue;
    const g =
      r.bucket === 'stamp_only' || r.bucket === 'free_code'
        ? 1
        : r.bucket === 'surgical'
          ? SURGICAL_SUCCESS
          : 0;
    for (const teil of mod === 'schreiben' || mod === 'sprechen' ? TEILE[mod] : [t]) {
      if (mod === 'schreiben' || mod === 'sprechen') {
        gain[mod][teil] = (gain[mod][teil] || 0) + g / 3;
      } else {
        gain[mod][teil] = (gain[mod][teil] || 0) + g;
      }
    }
  }
  return gain;
}

function perUserLhNeed(profile) {
  const exams = profile.exams;
  const pl = profile.personalLesen;
  const ph = profile.personalHoren;
  const lesen = {};
  const horen = {};
  for (const t of TEILE.lesen) lesen[t] = exams + pl;
  for (const t of TEILE.horen) horen[t] = exams + ph;
  return { lesen, horen, ss: { schreiben: exams, sprechen: exams } };
}

function bindingTarget(cohort) {
  let binding = null;
  for (const { plan, count } of cohort.users) {
    const profile = USAGE_PROFILES[plan];
    const need = perUserLhNeed(profile);
    for (let i = 0; i < count; i++) {
      if (!binding || need.lesen[3] > binding.need.lesen[3]) {
        binding = { plan, need, userIndex: i };
      }
    }
  }
  return binding;
}

function withCushion(minVal) {
  return Math.ceil(minVal * (1 + CUSHION_PCT) + CUSHION_MIN_ADD);
}

function simulateUser(profile, rowsByModule) {
  const used = new Set();
  const failures = [];

  for (let e = 0; e < profile.exams; e++) {
    for (const [mod, teile] of Object.entries(TEILE)) {
      for (const t of teile) {
        const pool = filterRows(rowsByModule[mod], { teil: t, excludeIds: [...used], assembleMode: 'practice' });
        if (!pool.length) {
          failures.push({ type: 'exam', exam: e + 1, cell: `${mod}_${t}` });
          return { ok: false, failures, uniqueUsed: used.size };
        }
        const pick = pool.sort((a, b) => (a.servedCount || 0) - (b.servedCount || 0))[0];
        used.add(pick.id);
      }
    }
  }

  const pl = profile.personalLesen;
  const ph = profile.personalHoren;
  for (let i = 0; i < pl; i++) {
    for (const t of TEILE.lesen) {
      const pool = filterRows(rowsByModule.lesen, { teil: t, excludeIds: [...used], assembleMode: 'practice' });
      if (!pool.length) failures.push({ type: 'personal_lesen', n: i + 1, teil: t });
      else used.add(pool[0].id);
    }
  }
  for (let i = 0; i < ph; i++) {
    for (const t of TEILE.horen) {
      const pool = filterRows(rowsByModule.horen, { teil: t, excludeIds: [...used], assembleMode: 'practice' });
      if (!pool.length) failures.push({ type: 'personal_horen', n: i + 1, teil: t });
      else used.add(pool[0].id);
    }
  }

  return { ok: failures.length === 0, failures, uniqueUsed: used.size };
}

function main() {
  const stock = currentStock();
  const rescue = rescueGainByTeil();
  const stockAfterRescue = {};
  for (const mod of ['lesen', 'horen']) {
    stockAfterRescue[mod] = {};
    for (const t of TEILE[mod]) {
      stockAfterRescue[mod][t] = (stock[mod][t] || 0) + (rescue[mod][t] || 0);
    }
  }

  const rowsByModule = {
    lesen: buildSeedRows('lesen'),
    horen: buildSeedRows('horen'),
    schreiben: buildSeedRows('schreiben'),
    sprechen: buildSeedRows('sprechen'),
  };

  const cohortResults = {};

  for (const [key, cohort] of Object.entries(COHORTS)) {
    const binding = bindingTarget(cohort);
    const minLh = binding.need;
    const targetLh = {
      lesen: Object.fromEntries(TEILE.lesen.map((t) => [t, withCushion(minLh.lesen[t])])),
      horen: Object.fromEntries(TEILE.horen.map((t) => [t, withCushion(minLh.horen[t])])),
    };

    const deficitMin = { lesen: {}, horen: {}, total: 0 };
    const deficitCushion = { lesen: {}, horen: {}, total: 0 };

    for (const mod of ['lesen', 'horen']) {
      for (const t of TEILE[mod]) {
        const have = stock[mod][t];
        const haveRescue = stockAfterRescue[mod][t];
        const dMin = Math.max(0, minLh[mod][t] - haveRescue);
        const dCush = Math.max(0, targetLh[mod][t] - haveRescue);
        deficitMin[mod][t] = { have, haveAfterRescue: haveRescue, need: minLh[mod][t], deficit: dMin };
        deficitCushion[mod][t] = {
          have,
          haveAfterRescue: haveRescue,
          need: targetLh[mod][t],
          deficit: dCush,
        };
        deficitMin.total += dMin;
        deficitCushion.total += dCush;
      }
    }

    const sims = {};
    for (const [planKey, profile] of Object.entries(USAGE_PROFILES)) {
      sims[planKey] = simulateUser(profile, rowsByModule);
    }

    cohortResults[key] = {
      cohort,
      bindingUser: binding.plan,
      bindingNeed: minLh,
      targetWithCushion: targetLh,
      cushionRule: `max(min×${1 + CUSHION_PCT}, min+${CUSHION_MIN_ADD})`,
      deficitAfterRescue: {
        minimum: deficitMin,
        withCushion: deficitCushion,
        costMinimumUsd: Number((deficitMin.total * COST_PER_OK).toFixed(2)),
        costWithCushionUsd: Number((deficitCushion.total * COST_PER_OK).toFixed(2)),
      },
      simulationCurrentStock: sims,
    };
  }

  const base = cohortResults.base_5;
  const h3 = {
    current: stock.horen[3],
    afterRescue: stockAfterRescue.horen[3],
    bindingNeed: base.bindingNeed.horen[3],
    targetWithCushion: base.targetWithCushion.horen[3],
    deficitMin: base.deficitAfterRescue.minimum.horen[3],
    deficitCushion: base.deficitAfterRescue.withCushion.horen[3],
  };

  const report = {
    generatedAt: new Date().toISOString(),
    rationale: {
      whyNotFullQuota:
        '0 usuarios hoy; pre-aprovisionar 268 LH (Pro 100%) es sobre-inversión. Stock compartido: el límite es el usuario más exigente (burned per-user), no la suma de todos.',
      usageAssumption:
        'Primer mes: Free 3 exámenes + 5/4 personal LH; Pro 4 + 10/8. Cohorte base 5 usuarios (4F+1P).',
      cushion:
        '+25% y +3 partes/teil sobre el mínimo del usuario binding — cubre variación (un examen extra, personal de más) sin escenario teórico 12+30.',
      backgroundGeneration:
        'Generación de fondo sigue sumando mientras hay uso real; este target es piso de lanzamiento, no techo mensual.',
    },
    costPerOkUsd: COST_PER_OK,
    currentStock: stock,
    stagingRescueExpected: rescue,
    stockAfterStagingRescue: stockAfterRescue,
    usageProfiles: USAGE_PROFILES,
    cohorts: cohortResults,
    horenT3Focus: h3,
    comparisonToFullQuota: {
      proFullQuotaLhParts: 268,
      proFullQuotaCostUsd: 40.41,
      base5WithCushionLhParts: base.deficitAfterRescue.withCushion.total,
      base5WithCushionCostUsd: base.deficitAfterRescue.withCushion.costWithCushionUsd,
      reductionPct: Number(
        ((1 - base.deficitAfterRescue.withCushion.costWithCushionUsd / 40.41) * 100).toFixed(1),
      ),
    },
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
