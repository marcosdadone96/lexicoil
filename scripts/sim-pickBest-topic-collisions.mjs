/**
 * Measure topic-collision rate of real pickBest (assemble-from-pool-verified.mjs)
 * over many independent full-stock assemblies (ids reset per exam).
 *
 * pickBest is copied VERBATIM from assemble-from-pool-verified.mjs.
 * Pool candidates use the same extractTopic / FILE_RE / discard / normalize path.
 *
 *   node scripts/sim-pickBest-topic-collisions.mjs
 *   node scripts/sim-pickBest-topic-collisions.mjs --trials 5000
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { buildLesenSeedRecordFromBatch } from './lib/publishToPool.mjs';
import { isPartPoolReady, partRecordToExamPart } from './audit-pass-2.mjs';
import { normalizeB1Topic } from './lib/b1Topics.mjs';
import {
  loadAssembleDiscardLists,
  isAssembleBlocked,
} from './lib/assembleDiscardLists.mjs';
import { t3SituationFingerprintFromBatch } from './lib/t3GroupFingerprint.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const OUT = path.join(
  ROOT,
  'batches/ready/gate-logs/pickBest-topic-collision-sim-2026-07-11.json',
);

const CELLS = { lesen: [1, 2, 3, 4, 5], horen: [1, 2, 3, 4] };
const CELL_KEYS = Object.entries(CELLS).flatMap(([m, ts]) =>
  ts.map((t) => `${m}_${t}`),
);
const LH_KEYS = CELL_KEYS.slice(); // 9 Lesen+Hören cells

const FILE_RE = {
  lesen_1: /^lesen-t1-.*\.json$/i,
  lesen_2: /^lesen-t2-.*\.json$/i,
  lesen_3: /^lesen-t3-.*\.json$/i,
  lesen_4: /^lesen-t4-.*\.json$/i,
  lesen_5: /^lesen-t5-.*\.json$/i,
  horen_1: /^horen-t1-.*\.json$/i,
  horen_2: /^horen-t2-.*\.json$/i,
  horen_3: /^horen-t3-.*\.json$/i,
  horen_4: /^horen-t4-.*\.json$/i,
};

/** VERBATIM from assemble-from-pool-verified.mjs */
function pickBest(pool, usedTopics, usedIds, usedT3Fp) {
  let best = null;
  let bestScore = -Infinity;
  for (const c of pool) {
    if (usedIds.has(c.id)) continue;
    if (c.t3Fp && usedT3Fp.has(c.t3Fp)) continue;
    let score = 100;
    if (c.topic && usedTopics.has(c.topic)) score -= 40;
    if (c.topic) score += 5;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** Same scoring, but NO topic penalty (baseline for this sim harness). */
function pickBestNoTopicPenalty(pool, _usedTopics, usedIds, usedT3Fp) {
  let best = null;
  let bestScore = -Infinity;
  for (const c of pool) {
    if (usedIds.has(c.id)) continue;
    if (c.t3Fp && usedT3Fp.has(c.t3Fp)) continue;
    let score = 100;
    if (c.topic) score += 5;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function modeTopicFromTags(tags) {
  const counts = new Map();
  for (const t of tags || []) {
    const n = normalizeB1Topic(t) || (typeof t === 'string' && t.trim() ? t.trim() : null);
    if (!n) continue;
    counts.set(n, (counts.get(n) || 0) + 1);
  }
  let best = null;
  let n = 0;
  for (const [k, v] of counts) {
    if (v > n) {
      best = k;
      n = v;
    }
  }
  return best;
}

function extractTopic(rec, batch) {
  const qTags = [
    ...(batch?.questions || []).flatMap((q) => q.topicTags || []),
    ...(rec?.questions || []).flatMap((q) => q.topicTags || []),
  ];
  const fromQuestions = modeTopicFromTags(qTags);
  if (fromQuestions) return fromQuestions;
  const raw = batch?.topicTag || rec?.topicTag || batch?.passages?.[0]?.topicTag || null;
  return normalizeB1Topic(raw) || (raw ? String(raw) : null);
}

function batchToRecord(batch, file, module, teil) {
  const mod = String(module).toLowerCase();
  const t = Number(teil);
  if (mod === 'lesen') {
    const rec = buildLesenSeedRecordFromBatch(batch, {
      lang: 'de',
      level: 'B1',
      teil: t,
      idPrefix: 'pv',
    });
    rec.id = file.replace(/\.json$/i, '');
    return rec;
  }
  const passages = batch.passages || [];
  const rec = {
    id: file.replace(/\.json$/i, ''),
    module: mod,
    teil: t,
    lang: 'de',
    level: 'B1',
    questions: batch.questions || [],
    topicTag: batch.topicTag || passages[0]?.topicTag,
    complete: true,
    verified: true,
  };
  if (mod === 'horen') {
    if (passages.length > 1) {
      rec.segments = passages.map((p, i) => ({
        passageId: p.id,
        label: p.title || `Aufnahme ${i + 1}`,
        text: p.text || p.transcript || '',
        transcript: p.transcript || p.text || '',
        questions: (batch.questions || []).filter((q) => q.passageId === p.id),
      }));
    }
    rec.passage = passages[0]
      ? {
          title: passages[0].title,
          text: passages[0].text,
          transcript: passages[0].transcript || passages[0].text,
          topicTag: passages[0].topicTag,
        }
      : null;
  }
  return rec;
}

function oralBundleToParts(batch, file, module) {
  const base = file.replace(/\.json$/i, '');
  const topic = extractTopic(null, batch);
  const parts = [];
  for (const teil of [1, 2, 3]) {
    const qs = (batch.questions || []).filter((q) => Number(q.teil) === teil);
    if (!qs.length) continue;
    const rec = {
      id: `${base}-t${teil}`,
      module,
      teil,
      lang: 'de',
      level: 'B1',
      questions: qs,
      topicTag: topic || qs[0]?.topicTags?.[0],
      complete: true,
      verified: true,
    };
    parts.push({
      cell: `${module}_${teil}`,
      id: rec.id,
      file,
      topic: extractTopic(rec, batch),
      bundle: base,
    });
  }
  return parts;
}

/**
 * Load cell candidates.
 * @param {'full'|'gated'} mode
 *   full  = all pool-verified files (matches 95.2% topic baseline; user request)
 *   gated = same isPartPoolReady screen as assemble-from-pool-verified
 */
async function screenCell(cell, blockedIds, mode = 'full') {
  const [module, teilStr] = cell.split('_');
  const teil = Number(teilStr);
  const re = FILE_RE[cell];
  const files = fs
    .readdirSync(POOL)
    .filter((f) => re.test(f) && !f.includes('.raw'))
    .sort();
  const out = [];
  for (const file of files) {
    if (isAssembleBlocked(file, blockedIds)) continue;
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(path.join(POOL, file), 'utf8'));
    } catch {
      continue;
    }
    batch = normalizeBatch(batch, { module, teil, lang: 'de', level: 'B1' });
    const record = batchToRecord(batch, file, module, teil);
    if (isAssembleBlocked(record.id, blockedIds)) continue;
    if (mode === 'gated') {
      const gate = await isPartPoolReady(record, { semantic: false, skipSem2: true });
      if (!gate.ok) continue;
    }
    out.push({
      cell,
      id: record.id,
      file,
      topic: extractTopic(record, batch),
      t3Fp: cell === 'lesen_3' ? t3SituationFingerprintFromBatch(batch) : null,
    });
  }
  return out;
}

async function screenOralBundles(module, blockedIds) {
  const re = module === 'schreiben' ? /^schreiben-.*\.json$/i : /^sprechen-.*\.json$/i;
  const files = fs.readdirSync(POOL).filter((f) => re.test(f)).sort();
  const bundles = [];
  for (const file of files) {
    if (isAssembleBlocked(file, blockedIds)) continue;
    const batch = JSON.parse(fs.readFileSync(path.join(POOL, file), 'utf8'));
    const parts = oralBundleToParts(batch, file, module);
    if (parts.length !== 3) continue;
    if (parts.some((p) => isAssembleBlocked(p.id, blockedIds))) continue;
    const gateOk = true; // oral already in pool-verified; skip heavy gate for sim speed
    if (!gateOk) continue;
    bundles.push({ file, topic: parts[0].topic, parts, module });
  }
  return bundles;
}

function shuffleInPlace(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function lhCollisionInfo(topicsByCell) {
  const topics = LH_KEYS.map((k) => topicsByCell[k]).filter(Boolean);
  const counts = {};
  for (const t of topics) counts[t] = (counts[t] || 0) + 1;
  const dups = Object.entries(counts).filter(([, n]) => n >= 2);
  const collision = dups.length > 0;
  const h1Topic = topicsByCell.horen_1 || null;
  const h1Involved = !!(h1Topic && (counts[h1Topic] || 0) >= 2);
  return { collision, h1Involved, h1Topic, dups, topicsByCell };
}

/**
 * One exam assembly — same control flow as assemble-from-pool-verified main loop
 * for Lesen+Hören, with sch/spr seeding usedTopics. usedIds reset (independent exam).
 * @param {'protected'|'unprotected'} mode
 * @param {{ sch, spr, poolsByCell: Record<string, object[]> }} setup pre-shuffled pools + bundles
 */
function assembleOne(setup, mode) {
  const picker = mode === 'protected' ? pickBest : pickBestNoTopicPenalty;
  const usedIds = new Set();
  const usedT3Fp = new Set();
  const usedTopics = new Set();
  const picked = {};
  const { sch, spr, poolsByCell } = setup;

  for (const p of sch.parts) {
    usedIds.add(p.id);
    if (p.topic) usedTopics.add(p.topic);
  }
  for (const p of spr.parts) {
    usedIds.add(p.id);
    if (p.topic) usedTopics.add(p.topic);
  }

  let usedFallback = 0;
  for (const key of CELL_KEYS) {
    const pool = poolsByCell[key];
    let c = picker(pool, usedTopics, usedIds, usedT3Fp);
    let fellBack = false;
    if (!c) {
      c = picker(pool, new Set(), usedIds, usedT3Fp);
      fellBack = true;
    }
    if (!c) throw new Error(`no candidate for ${key}`);
    if (fellBack) usedFallback++;
    picked[key] = c;
    usedIds.add(c.id);
    if (c.topic) usedTopics.add(c.topic);
    if (c.t3Fp) usedT3Fp.add(c.t3Fp);
  }

  const topicsByCell = Object.fromEntries(LH_KEYS.map((k) => [k, picked[k].topic || null]));
  const info = lhCollisionInfo(topicsByCell);
  return { ...info, usedFallback, schTopic: sch.topic, sprTopic: spr.topic };
}

function buildSetup(cleanPool, schBundles, sprBundles, rand) {
  const sch = schBundles[Math.floor(rand() * schBundles.length)];
  const spr = sprBundles[Math.floor(rand() * sprBundles.length)];
  const poolsByCell = {};
  for (const key of CELL_KEYS) {
    poolsByCell[key] = shuffleInPlace([...cleanPool[key]], rand);
  }
  return { sch, spr, poolsByCell };
}

/** Pure uniform random per cell (previous 95.2% baseline, same pool objects). */
function assembleUniformRandom(cleanPool, rand) {
  const topicsByCell = {};
  for (const key of LH_KEYS) {
    const pool = cleanPool[key];
    const c = pool[Math.floor(rand() * pool.length)];
    topicsByCell[key] = c.topic || null;
  }
  return lhCollisionInfo(topicsByCell);
}

const trialsArg = process.argv.includes('--trials')
  ? Number(process.argv[process.argv.indexOf('--trials') + 1])
  : 2000;
const poolMode = process.argv.includes('--gated') ? 'gated' : 'full';

async function main() {
  const discard = loadAssembleDiscardLists();
  const blockedIds = discard.blockedIds;

  console.log(
    poolMode === 'gated'
      ? 'Screening pool cells (gated = assemble-from-pool-verified isPartPoolReady)…'
      : 'Loading FULL pool-verified LH cells (no quality gate; matches 95.2% topic baseline)…',
  );
  const cleanPool = {};
  for (const key of CELL_KEYS) {
    cleanPool[key] = await screenCell(key, blockedIds, poolMode);
    console.log(`  ${key.padEnd(10)} ${cleanPool[key].length}`);
  }
  const schBundles = await screenOralBundles('schreiben', blockedIds);
  const sprBundles = await screenOralBundles('sprechen', blockedIds);
  console.log(`  schreiben sets ${schBundles.length}`);
  console.log(`  sprechen sets  ${sprBundles.length}`);

  // Deterministic single pass (sorted pools, no shuffle) — what --max 1 would tend to do
  const detRand = () => 0; // shuffle no-op if we don't shuffle
  const detPools = Object.fromEntries(
    CELL_KEYS.map((k) => [k, [...cleanPool[k]]]),
  );
  const usedIds = new Set();
  const usedT3Fp = new Set();
  const usedTopics = new Set();
  for (const p of schBundles[0].parts) {
    usedIds.add(p.id);
    if (p.topic) usedTopics.add(p.topic);
  }
  for (const p of sprBundles[0].parts) {
    usedIds.add(p.id);
    if (p.topic) usedTopics.add(p.topic);
  }
  const detPicked = {};
  let detFallback = 0;
  for (const key of CELL_KEYS) {
    let c = pickBest(detPools[key], usedTopics, usedIds, usedT3Fp);
    if (!c) {
      c = pickBest(detPools[key], new Set(), usedIds, usedT3Fp);
      detFallback++;
    }
    detPicked[key] = c;
    usedIds.add(c.id);
    if (c.topic) usedTopics.add(c.topic);
    if (c.t3Fp) usedT3Fp.add(c.t3Fp);
  }
  const detInfo = lhCollisionInfo(
    Object.fromEntries(LH_KEYS.map((k) => [k, detPicked[k].topic || null])),
  );
  console.log('\n=== Deterministic first assembly (sorted pools, sch/spr[0]) ===');
  console.log(JSON.stringify({ topics: detInfo.topicsByCell, ...detInfo, detFallback }, null, 2));

  const N = trialsArg;
  const modes = ['protected', 'unprotected', 'uniform'];
  const stats = Object.fromEntries(
    modes.map((m) => [
      m,
      {
        trials: N,
        collisions: 0,
        h1Involved: 0,
        fallbackExams: 0,
        fallbackCells: 0,
        dupTopicHist: {},
      },
    ]),
  );

  console.log(`\nRunning ${N} trials × 3 modes (paired shuffles for protected vs unprotected)…`);
  for (let i = 0; i < N; i++) {
    const rand = mulberry32(0xc0ffee ^ (i * 0x9e3779b9));
    const setup = buildSetup(cleanPool, schBundles, sprBundles, rand);
    for (const mode of ['protected', 'unprotected']) {
      const r = assembleOne(setup, mode);
      const s = stats[mode];
      if (r.collision) {
        s.collisions++;
        for (const [t] of r.dups) s.dupTopicHist[t] = (s.dupTopicHist[t] || 0) + 1;
      }
      if (r.h1Involved) s.h1Involved++;
      if (r.usedFallback > 0) {
        s.fallbackExams++;
        s.fallbackCells += r.usedFallback;
      }
    }
    const u = assembleUniformRandom(cleanPool, rand);
    const s = stats.uniform;
    if (u.collision) {
      s.collisions++;
      for (const [t] of u.dups) s.dupTopicHist[t] = (s.dupTopicHist[t] || 0) + 1;
    }
    if (u.h1Involved) s.h1Involved++;
  }

  function summarize(s) {
    return {
      trials: s.trials,
      collisionPct: Math.round((1000 * s.collisions) / s.trials) / 10,
      noCollisionPct: Math.round((1000 * (s.trials - s.collisions)) / s.trials) / 10,
      h1InvolvedInCollisionPct: Math.round((1000 * s.h1Involved) / s.trials) / 10,
      h1InvolvedCount: s.h1Involved,
      fallbackExamPct: Math.round((1000 * s.fallbackExams) / s.trials) / 10,
      avgFallbackCellsWhenUsed:
        s.fallbackExams > 0
          ? Math.round((10 * s.fallbackCells) / s.fallbackExams) / 10
          : 0,
      topDupTopics: Object.entries(s.dupTopicHist)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([t, c]) => ({
          topic: t,
          trials: c,
          pct: Math.round((1000 * c) / s.trials) / 10,
        })),
    };
  }

  const report = {
    generatedAt: new Date().toISOString(),
    poolMode,
    note:
      'Independent exams (usedIds reset each trial). Pool shuffled per cell so pickBest ' +
      'first-wins ties are explored. protected = verbatim pickBest; unprotected = same but ' +
      'no -40 topic penalty; uniform = pick random file per cell. ' +
      'Default poolMode=full (all pool-verified LH files) to match prior 95.2% baseline; ' +
      'use --gated for assembler quality-gate screen. Note: pickBest never hard-rejects on ' +
      'topic (−40 soft score only); the empty-usedTopics retry only fires when all ids/fps are exhausted.',
    stock: Object.fromEntries(CELL_KEYS.map((k) => [k, cleanPool[k].length])),
    stockTopics: Object.fromEntries(
      CELL_KEYS.map((k) => {
        const hist = {};
        for (const c of cleanPool[k]) {
          const t = c.topic || '(null)';
          hist[t] = (hist[t] || 0) + 1;
        }
        return [k, hist];
      }),
    ),
    schreibenSets: schBundles.length,
    sprechenSets: sprBundles.length,
    capacityWithoutReplacement: Math.min(...CELL_KEYS.map((k) => cleanPool[k].length)),
    deterministicAssembly: {
      topics: detInfo.topicsByCell,
      collision: detInfo.collision,
      h1Involved: detInfo.h1Involved,
      fallbackCells: detFallback,
    },
    previousUniformBaselinePct: 95.2,
    results: {
      protected: summarize(stats.protected),
      unprotected: summarize(stats.unprotected),
      uniform: summarize(stats.uniform),
    },
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('\n=== RESULTS ===');
  console.log(JSON.stringify(report.results, null, 2));
  console.log(`\nWrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
