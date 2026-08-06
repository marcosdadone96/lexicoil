#!/usr/bin/env node
/**
 * assemble-review-unit-exams.mjs
 *
 * Ensambla 3 exámenes B1 (Lesen+Hören+Schreiben, sin Sprechen) para revisión
 * de unidad.
 *
 * Fuentes Lesen (prioridad): pool-verified → pool-content-ok-lesen → ready/lesen → generated
 * Hören: batches/generated (+ seed fallback). Schreiben: reusable-seed / generated.
 *
 * Políticas:
 *  - máx. 1 Lesen T3 por examen; fingerprints/blueprints distintos entre exámenes
 *  - evitar repetir topicTag entre celdas del mismo examen cuando hay stock
 *  - no reutilizar partIds de official-de-B1-e1
 *  - sin overlap de partIds entre los 3 exámenes si el stock lo permite
 *  - excluye discard lists + PENDING-CONTENT-FIXES (no Q1 block — shadow hasta 23/07)
 *
 *   node scripts/assemble-review-unit-exams.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { buildLesenSeedRecordFromBatch } from './lib/publishToPool.mjs';
import {
  isExamPublishable,
  isPartPoolReady,
  partRecordToExamPart,
} from './audit-pass-2.mjs';
import {
  t3SituationFingerprintFromBatch,
  t3SituationFingerprintFromPart,
  validateDistinctT3Fingerprints,
} from './lib/t3GroupFingerprint.mjs';
import { normalizeB1Topic } from './lib/b1Topics.mjs';
import {
  loadAssembleDiscardLists,
  isAssembleBlocked,
  formatDiscardSummary,
} from './lib/assembleDiscardLists.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED = path.join(ROOT, 'batches/generated');
const POOL_VERIFIED = path.join(ROOT, 'batches/ready/pool-verified');
const POOL_CONTENT_OK_LESEN = path.join(ROOT, 'batches/ready/pool-content-ok-lesen');
const READY_LESEN = path.join(ROOT, 'batches/ready/lesen');
const SEED = path.join(ROOT, 'library/reusable-seed/de_B1.json');
const PUB_E1 = path.join(ROOT, 'library/published-exams/de/B1/official-de-B1-e1.json');
const OUT_DIR = path.join(ROOT, 'batches/ready/assembled-review');
const NUM_EXAMS = 3;

/** Prefer verified → Q1-interim Lesen → ready/lesen → generated (legacy). */
const LESEN_SOURCE_DIRS = [
  { dir: POOL_VERIFIED, label: 'pool-verified' },
  { dir: POOL_CONTENT_OK_LESEN, label: 'pool-content-ok-lesen' },
  { dir: READY_LESEN, label: 'ready/lesen' },
  { dir: GENERATED, label: 'generated' },
];

const CELLS = {
  lesen: [1, 2, 3, 4, 5],
  horen: [1, 2, 3, 4],
  schreiben: [1, 2, 3],
};
const CELL_KEYS = Object.entries(CELLS).flatMap(([m, ts]) => ts.map((t) => `${m}_${t}`));

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

/** Cap screening cost: newest N files per Lesen/Hören cell. */
const MAX_SCREEN = {
  lesen_1: 35,
  lesen_2: 30,
  lesen_3: 40,
  lesen_4: 25,
  lesen_5: 30,
  horen_1: 20,
  horen_2: 25,
  horen_3: 10,
  horen_4: 10,
};

function loadExcludedPartIds() {
  const ids = new Set();
  if (fs.existsSync(PUB_E1)) {
    const pub = JSON.parse(fs.readFileSync(PUB_E1, 'utf8'));
    for (const p of pub.parts || []) ids.add(p.partId);
  }
  return ids;
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

/**
 * Prefer topicTags on questions/passages (content) over possibly stale record.topicTag.
 * Seed Hören often has topicTag=Technik while questions say ["work"] → Arbeit.
 */
function extractTopic(rec, batch) {
  const qTags = [
    ...(batch?.questions || []).flatMap((q) => q.topicTags || []),
    ...(rec?.questions || []).flatMap((q) => q.topicTags || []),
  ];
  const fromQuestions = modeTopicFromTags(qTags);
  if (fromQuestions) return fromQuestions;

  const passageTags = [
    batch?.passages?.[0]?.topicTag,
    rec?.passage?.topicTag,
    ...(rec?.segments || []).map((s) => s.topicTag),
  ].filter(Boolean);
  const fromPassage = modeTopicFromTags(passageTags);
  if (fromPassage) return fromPassage;

  const raw = batch?.topicTag || batch?._requestedTopic || rec?.topicTag || null;
  return normalizeB1Topic(raw) || (raw ? String(raw) : null);
}

function batchToRecord(batch, file, module, teil) {
  const mod = String(module).toLowerCase();
  const t = Number(teil);
  if (mod === 'lesen') {
    const rec = buildLesenSeedRecordFromBatch(batch, { lang: 'de', level: 'B1', teil: t, idPrefix: 'rev' });
    rec.id = file.replace(/\.json$/i, '');
    if (batch._blueprintSlug || batch.blueprintSlug) {
      rec._blueprintSlug = batch._blueprintSlug || batch.blueprintSlug;
    }
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
    topicTag: batch.topicTag || batch._requestedTopic || passages[0]?.topicTag,
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
      rec.questions = batch.questions || [];
    }
    rec.passage = passages[0]
      ? {
          title: passages[0].title,
          text: passages[0].text,
          transcript: passages[0].transcript || passages[0].text,
          topicTag: passages[0].topicTag,
        }
      : null;
    if (!rec.topicTag && passages[0]?.topicTag) rec.topicTag = passages[0].topicTag;
  }
  return rec;
}

function schreibenBundleToParts(batch, file) {
  const base = file.replace(/\.json$/i, '');
  const topic = extractTopic(null, batch);
  const parts = [];
  for (const teil of [1, 2, 3]) {
    const qs = (batch.questions || []).filter((q) => Number(q.teil) === teil);
    if (!qs.length) continue;
    const rec = {
      id: `${base}-t${teil}`,
      module: 'schreiben',
      teil,
      lang: 'de',
      level: 'B1',
      questions: qs,
      instruction: qs[0]?.question || '',
      task: qs[0]?.question || '',
      topicTag: topic || qs[0]?.topicTags?.[0],
      complete: true,
      verified: true,
      minWords: teil === 3 ? 40 : 80,
      maxWords: teil === 3 ? 60 : 120,
    };
    parts.push({
      cell: `schreiben_${teil}`,
      id: rec.id,
      file,
      record: rec,
      part: partRecordToExamPart(rec),
      topic: extractTopic(rec, batch),
      bundle: base,
    });
  }
  return parts;
}

function listNewest(re, maxN) {
  const seen = new Set();
  const ranked = [];
  for (const { dir, label } of LESEN_SOURCE_DIRS) {
    if (!fs.existsSync(dir)) continue;
    // Hören/Schreiben still use generated-only via callers that pass non-lesen regex —
    // for lesen cells we scan all dirs; for horen, only GENERATED exists in the list last.
    const onlyGenerated = !/lesen/i.test(String(re));
    if (onlyGenerated && label !== 'generated') continue;
    for (const f of fs.readdirSync(dir)) {
      if (!re.test(f) || f.includes('.raw') || seen.has(f)) continue;
      seen.add(f);
      ranked.push({
        f,
        dir,
        label,
        mtime: fs.statSync(path.join(dir, f)).mtimeMs,
      });
    }
  }
  // Prefer higher-trust pools first, then newest within pool
  const labelRank = {
    'pool-verified': 0,
    'pool-content-ok-lesen': 1,
    'ready/lesen': 2,
    generated: 3,
  };
  ranked.sort((a, b) => {
    const d = (labelRank[a.label] ?? 9) - (labelRank[b.label] ?? 9);
    if (d !== 0) return d;
    return b.mtime - a.mtime;
  });
  return ranked.slice(0, maxN);
}

async function screenGeneratedCell(cell, excluded, blockedIds) {
  const [module, teilStr] = cell.split('_');
  const teil = Number(teilStr);
  const files = listNewest(FILE_RE[cell], MAX_SCREEN[cell] || 20);
  const out = [];
  for (const entry of files) {
    const file = typeof entry === 'string' ? entry : entry.f;
    const srcDir = typeof entry === 'string' ? GENERATED : entry.dir;
    const srcLabel = typeof entry === 'string' ? 'generated' : entry.label;
    const id = file.replace(/\.json$/i, '');
    if (excluded.has(id) || isAssembleBlocked(id, blockedIds) || isAssembleBlocked(file, blockedIds)) {
      continue;
    }
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(path.join(srcDir, file), 'utf8'));
    } catch {
      continue;
    }
    batch = normalizeBatch(batch, { module, teil, lang: 'de', level: 'B1' });
    const record = batchToRecord(batch, file, module, teil);
    if (excluded.has(record.id) || isAssembleBlocked(record.id, blockedIds)) continue;
    const gate = await isPartPoolReady(record, { semantic: false, skipSem2: true });
    if (!gate.ok) continue;
    const part = partRecordToExamPart(record);
    out.push({
      cell,
      id: record.id,
      file,
      sourceDir: srcLabel,
      record,
      part,
      topic: extractTopic(record, batch),
      blueprintSlug: batch._blueprintSlug || batch.blueprintSlug || record._blueprintSlug || null,
      t3Fp: cell === 'lesen_3' ? t3SituationFingerprintFromBatch(batch) : null,
    });
  }
  return out;
}

async function screenSeedSchreiben(excluded, blockedIds) {
  const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  const byTeil = { 1: [], 2: [], 3: [] };
  for (const rec of seed.records || []) {
    if (String(rec.module).toLowerCase() !== 'schreiben') continue;
    const teil = Number(rec.teil);
    if (![1, 2, 3].includes(teil)) continue;
    if (excluded.has(rec.id) || isAssembleBlocked(rec.id, blockedIds)) continue;
    const gate = await isPartPoolReady(rec, { semantic: false, skipSem2: true });
    if (!gate.ok) continue;
    byTeil[teil].push({
      cell: `schreiben_${teil}`,
      id: rec.id,
      file: null,
      record: rec,
      part: partRecordToExamPart(rec),
      topic: extractTopic(rec, null),
      bundle: String(rec.id).replace(/-t[123].*$/, '').replace(/schreiben-t\d+-/, ''),
    });
  }
  return byTeil;
}

async function screenGeneratedSchreiben(excluded, blockedIds) {
  const files = fs.readdirSync(GENERATED).filter((f) => /^schreiben-.*\.json$/i.test(f));
  const bundles = [];
  for (const file of files) {
    if (isAssembleBlocked(file, blockedIds)) continue;
    const batch = JSON.parse(fs.readFileSync(path.join(GENERATED, file), 'utf8'));
    const parts = schreibenBundleToParts(batch, file);
    if (parts.length !== 3) continue;
    if (parts.some((p) => excluded.has(p.id) || isAssembleBlocked(p.id, blockedIds))) continue;
    let allOk = true;
    for (const p of parts) {
      const gate = await isPartPoolReady(p.record, { semantic: false, skipSem2: true });
      if (!gate.ok) {
        allOk = false;
        break;
      }
    }
    if (allOk) bundles.push({ file, topic: parts[0].topic, parts });
  }
  return bundles;
}

function scoreCandidate(cand, usedTopics, usedIds, usedT3Fp, usedBlueprints) {
  if (usedIds.has(cand.id)) return -1e9;
  // Hard reject: máx. 1 T3 por fingerprint/blueprint en el set de exámenes
  if (cand.t3Fp && usedT3Fp.has(cand.t3Fp)) return -1e9;
  if (cand.blueprintSlug && usedBlueprints.has(cand.blueprintSlug)) return -1e9;
  let score = 100;
  if (cand.fromE1) score -= 50;
  if (cand.topic && usedTopics.has(cand.topic)) score -= 40;
  if (cand.topic) score += 5;
  const m = String(cand.id).match(/(\d+)$/);
  if (m) score += Math.min(20, Number(m[1]) / 10);
  return score;
}

function pickBest(pool, usedTopics, usedIds, usedT3Fp, usedBlueprints) {
  let best = null;
  let bestScore = -Infinity;
  for (const c of pool) {
    const s = scoreCandidate(c, usedTopics, usedIds, usedT3Fp, usedBlueprints);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return bestScore > -1e8 ? best : null;
}

function collectExamTopics(picked) {
  const tags = new Set();
  for (const c of Object.values(picked)) {
    if (c.topic) tags.add(c.topic);
  }
  return tags;
}

async function screenSeedCell(module, teil, excluded, blockedIds, { allowExcluded = false } = {}) {
  const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  const out = [];
  for (const rec of seed.records || []) {
    if (String(rec.module).toLowerCase() !== module) continue;
    if (Number(rec.teil) !== teil) continue;
    if (isAssembleBlocked(rec.id, blockedIds)) continue;
    const fromE1 = excluded.has(rec.id);
    if (fromE1 && !allowExcluded) continue;
    const gate = await isPartPoolReady(rec, { semantic: false, skipSem2: true });
    if (!gate.ok) continue;
    out.push({
      cell: `${module}_${teil}`,
      id: rec.id,
      file: null,
      record: rec,
      part: partRecordToExamPart(rec),
      topic: extractTopic(rec, null),
      blueprintSlug: rec._blueprintSlug || null,
      t3Fp: module === 'lesen' && teil === 3 ? t3SituationFingerprintFromPart(partRecordToExamPart(rec)) : null,
      fromE1: !!fromE1,
      source: 'seed',
    });
  }
  return out;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const excluded = loadExcludedPartIds();
  const discard = loadAssembleDiscardLists();
  console.log(formatDiscardSummary(discard));
  console.log(`Excluidos (e1) en primera pasada: ${excluded.size} partIds`);
  const blockedIds = discard.blockedIds;

  const cleanPool = {};
  for (const key of CELL_KEYS) cleanPool[key] = [];

  console.log('Screening generated Lesen/Hören (POOL-2, sin SEM)…');
  for (const key of CELL_KEYS.filter((k) => !k.startsWith('schreiben'))) {
    cleanPool[key] = await screenGeneratedCell(key, excluded, blockedIds);
    console.log(`  ${key.padEnd(12)} generated clean: ${cleanPool[key].length}`);
  }

  // Seed fallback for thin cells (esp. Hören T3)
  console.log('Seed fallback for thin cells…');
  for (const key of CELL_KEYS.filter((k) => !k.startsWith('schreiben'))) {
    const [module, teilStr] = key.split('_');
    const need = NUM_EXAMS - cleanPool[key].length;
    if (need <= 0) continue;
    const seedParts = await screenSeedCell(module, Number(teilStr), excluded, blockedIds, {
      allowExcluded: false,
    });
    const have = new Set(cleanPool[key].map((c) => c.id));
    for (const s of seedParts) {
      if (have.has(s.id)) continue;
      cleanPool[key].push(s);
      have.add(s.id);
    }
    if (cleanPool[key].length < NUM_EXAMS) {
      const e1Parts = await screenSeedCell(module, Number(teilStr), excluded, blockedIds, {
        allowExcluded: true,
      });
      for (const s of e1Parts) {
        if (have.has(s.id)) continue;
        cleanPool[key].push(s);
        have.add(s.id);
      }
    }
    if (cleanPool[key].length < NUM_EXAMS) {
      const withE1 = await screenGeneratedCell(key, new Set(), blockedIds);
      for (const c of withE1) {
        if (have.has(c.id)) continue;
        c.fromE1 = excluded.has(c.id);
        cleanPool[key].push(c);
        have.add(c.id);
      }
    }
    console.log(`  ${key.padEnd(12)} after fallback: ${cleanPool[key].length}`);
  }

  console.log('Screening Schreiben (generated bundles, fallback seed)…');
  const schBundles = await screenGeneratedSchreiben(excluded, blockedIds);
  console.log(`  schreiben bundles generated OK: ${schBundles.length}`);
  const seedSch = await screenSeedSchreiben(excluded, blockedIds);
  for (const t of [1, 2, 3]) {
    cleanPool[`schreiben_${t}`] = seedSch[t];
    console.log(`  schreiben_${t} seed clean: ${seedSch[t].length}`);
  }

  for (const key of CELL_KEYS) {
    if (!cleanPool[key].length) {
      console.error(`FATAL: sin stock clean para ${key}`);
      process.exit(1);
    }
  }

  const usedIds = new Set();
  const usedT3Fp = new Set();
  const usedBlueprints = new Set();
  const usedSchreibenBundles = new Set();
  const exams = [];

  for (let e = 0; e < NUM_EXAMS; e++) {
    const picked = {};
    const usedTopics = new Set();

    // Schreiben: prefer a full generated bundle (same topic across T1–T3)
    let schBundle = schBundles.find((b) => !usedSchreibenBundles.has(b.file));
    if (schBundle) {
      usedSchreibenBundles.add(schBundle.file);
      for (const p of schBundle.parts) {
        picked[p.cell] = p;
        usedIds.add(p.id);
        if (p.topic) usedTopics.add(p.topic);
      }
    } else {
      for (const t of [1, 2, 3]) {
        const key = `schreiben_${t}`;
        const c = pickBest(cleanPool[key], usedTopics, usedIds, usedT3Fp, usedBlueprints);
        if (!c) {
          console.error(`FATAL: no schreiben_${t} for exam ${e + 1}`);
          process.exit(1);
        }
        picked[key] = c;
        usedIds.add(c.id);
        if (c.topic) usedTopics.add(c.topic);
      }
    }

    // Lesen + Hören with topic diversity
    for (const key of CELL_KEYS.filter((k) => !k.startsWith('schreiben'))) {
      const c = pickBest(cleanPool[key], usedTopics, usedIds, usedT3Fp, usedBlueprints);
      if (!c) {
        // fallback: allow topic reuse
        const c2 = pickBest(cleanPool[key], new Set(), usedIds, usedT3Fp, usedBlueprints);
        if (!c2) {
          console.error(`FATAL: no candidate for ${key} exam ${e + 1}`);
          process.exit(1);
        }
        picked[key] = c2;
      } else {
        picked[key] = c;
      }
      usedIds.add(picked[key].id);
      if (picked[key].topic) usedTopics.add(picked[key].topic);
      if (picked[key].t3Fp) usedT3Fp.add(picked[key].t3Fp);
      if (picked[key].blueprintSlug) usedBlueprints.add(picked[key].blueprintSlug);
    }

    const exam = {
      lesenParts: [1, 2, 3, 4, 5].map((t) => picked[`lesen_${t}`].part),
      horenParts: [1, 2, 3, 4].map((t) => picked[`horen_${t}`].part),
      schreibenParts: [1, 2, 3].map((t) => picked[`schreiben_${t}`].part),
    };
    const gate = isExamPublishable({ exam });
    const partIds = {};
    for (const key of CELL_KEYS) partIds[key] = picked[key].id;

    const topics = {};
    for (const key of CELL_KEYS) topics[key] = picked[key].topic || null;

    exams.push({
      n: e + 1,
      picked,
      exam,
      gate,
      partIds,
      topics,
      topicSet: [...collectExamTopics(picked)],
      t3Fp: t3SituationFingerprintFromPart(picked.lesen_3.part),
      t3Blueprint: picked.lesen_3.blueprintSlug,
    });
  }

  const t3Val = validateDistinctT3Fingerprints(
    exams.map((x) => ({ examNumber: x.n, t3SituationFp: x.t3Fp, partId: x.partIds.lesen_3 })),
  );
  if (!t3Val.ok) {
    console.error('FATAL T3 fingerprints duplicados:', t3Val.errors);
    process.exit(1);
  }

  // Hard fail if any assembled partId is on discard/pending lists
  const blockedHits = [];
  for (const x of exams) {
    for (const [cell, id] of Object.entries(x.partIds)) {
      if (isAssembleBlocked(id, blockedIds) || isAssembleBlocked(x.picked[cell]?.file, blockedIds)) {
        blockedHits.push({ exam: x.n, cell, id, sources: discard.sources.get(stemId(id)) });
      }
    }
  }
  if (blockedHits.length) {
    console.error('FATAL: assembled exams contain discard/pending partIds:');
    for (const h of blockedHits) console.error(`  e${h.exam + 1} ${h.cell} ${h.id}`);
    process.exit(1);
  }
  console.log('\n✓ Discard gate: 0 blocked partIds in assembled exams');

  const summaryRows = [];
  for (const x of exams) {
    const slot = x.n + 1; // review e2,e3,e4 (e1 = published)
    const examId = `review-de-B1-e${slot}`;
    const outPath = path.join(OUT_DIR, `assembled-exam-b1-review-e${slot}.json`);
    const doc = {
      _meta: {
        examNumber: slot,
        examId,
        generatedAt: new Date().toISOString(),
        purpose: 'unit-review (Lesen+Hören+Schreiben, no Sprechen)',
        gate1: { ok: x.gate.ok, blocking: (x.gate.blocking || []).slice(0, 8) },
        discardGate: { ok: true, blockedIdsChecked: blockedIds.size },
        partIds: x.partIds,
        topics: x.topics,
        t3SituationFp: x.t3Fp,
        t3BlueprintSlug: x.t3Blueprint,
        sources: Object.fromEntries(
          CELL_KEYS.map((k) => [k, x.picked[k].file || 'seed']),
        ),
      },
      exam: x.exam,
    };
    fs.writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
    summaryRows.push({
      examId,
      file: path.relative(ROOT, outPath),
      gate1: x.gate.ok,
      topics: x.topicSet,
      partIds: x.partIds,
      cellTopics: x.topics,
      t3Fp: x.t3Fp,
      t3Blueprint: x.t3Blueprint,
      topicCollisions: CELL_KEYS.map((k) => x.topics[k]).filter(Boolean).length
        - new Set(CELL_KEYS.map((k) => x.topics[k]).filter(Boolean)).size,
    });
    console.log(`\n✓ ${examId} → ${path.relative(ROOT, outPath)} GATE-1=${x.gate.ok ? 'PASS' : 'FAIL'}`);
    if (!x.gate.ok) {
      for (const b of (x.gate.blocking || []).slice(0, 5)) {
        console.log(`  [${b.id}] ${b.message?.slice(0, 100)}`);
      }
    }
    for (const key of CELL_KEYS) {
      console.log(`  ${key.padEnd(12)} ${x.partIds[key].padEnd(42)} topic=${x.topics[key] || '—'}`);
    }
  }

  const md = [
    '# Exámenes ensamblados — revisión de unidad (re-run 2026-07-10)',
    '',
    'Lesen 5 + Hören 4 + Schreiben 3 · **sin Sprechen**.',
    'Pool: `batches/generated` (L/H) + Schreiben bundles / seed.',
    'Excluye: e1 partIds + **discard lists** (`*DISCARD*.json`) + `PENDING-CONTENT-FIXES.json`.',
    '',
    '## Política',
    '',
    '- Gate de descarte obligatorio antes de incluir cualquier partId',
    '- 1× Lesen T3 por examen; fingerprints T3 distintos entre los 3',
    '- Topics desde `questions[].topicTags` (contenido), no `record.topicTag` stale',
    '- Sin Q3-B dry-run',
    '',
    formatDiscardSummary(discard),
    '',
    '## Exámenes',
    '',
  ];
  for (const r of summaryRows) {
    md.push(`### ${r.examId}`);
    md.push('');
    md.push(`- Archivo: \`${r.file}\``);
    md.push(`- GATE-1: ${r.gate1 ? 'PASS' : 'FAIL'}`);
    md.push(`- Topics únicos: ${r.topics.join(', ') || '—'}`);
    md.push(`- T3 fp: \`${r.t3Fp || '—'}\``);
    md.push('');
    md.push('| Celda | partId | topic |');
    md.push('|---|---|---|');
    for (const [k, v] of Object.entries(r.partIds)) {
      md.push(`| ${k} | \`${v}\` | ${r.cellTopics[k] || '—'} |`);
    }
    md.push('');
  }
  const mdPath = path.join(OUT_DIR, 'REVIEW-UNIT-EXAMS-2026-07-10.md');
  fs.writeFileSync(mdPath, `${md.join('\n')}\n`);
  fs.writeFileSync(
    path.join(OUT_DIR, 'review-unit-exams.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), discardLists: discard.lists, exams: summaryRows }, null, 2)}\n`,
  );
  console.log(`\nResumen: ${path.relative(ROOT, mdPath)}`);
}

function stemId(name) {
  return String(name || '')
    .replace(/^.*[/\\]/, '')
    .replace(/\.json$/i, '')
    .trim();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
