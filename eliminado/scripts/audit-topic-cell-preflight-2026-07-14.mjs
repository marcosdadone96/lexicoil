#!/usr/bin/env node
/**
 * Preventive audit: all B1 topic × Teil structural selection (offline, no API).
 *
 *   node scripts/audit-topic-cell-preflight-2026-07-14.mjs
 *   node scripts/audit-topic-cell-preflight-2026-07-14.mjs --json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { B1_TOPICS } from './lib/b1Topics.mjs';
import {
  TOPIC_BLUEPRINT_HARD_EXCLUDE,
  TOPIC_BLUEPRINT_PREFERENCE,
  filterBlueprintsForTopic,
  detectTopicFromT3Situations,
  isBlueprintHardExcludedForTopic,
  isLesenT3TopicCompatible,
} from './lib/lesenT3TopicFilter.mjs';
import {
  T4_TOPIC_DEBATE_BLOCKED,
  T4_TOPIC_DEBATE_PREFERENCE,
  T4_LAST_RESORT_DEBATES,
  T4_NEUTRAL_DEBATES,
  T5_TOPIC_SUBTYPE_PREFERENCE,
  T5_TOPIC_SUBTYPE_SATURATED_BLOCK,
  T5_GENERIC_LAST_RESORT,
  LESEN_T4_DEBATE_TOPICS,
  LESEN_T5_SUBTYPES,
  pickNextT4DebateTopic,
  pickNextT5Subtype,
  buildT4DebateCandidateOrder,
  buildT5SubtypeCandidateOrder,
  getDebateById,
  getSubtypeById,
} from './lib/lesenSubtypeRotation.mjs';
import { assessT4TopicAlignment, T4_DEBATE_TOPIC_AFFINITY, isT4DebateMoldCompatible } from './lib/t4TopicAlign.mjs';
import { topicsAreCompatible } from './lib/qualityGates/topicFamilies.mjs';
import { buildValidatedT3Part, t3AgeAlignmentError } from './make-t3.mjs';

const T3_LETTERS = 'ABCDEFGHIJ'.split('');

function validateBlueprint(bp) {
  const errors = [];
  const qs = bp.questions || [];
  if (qs.length !== 7) return [`expected 7 questions, got ${qs.length}`];
  if (!qs[0].options || qs[0].options.length !== 10) {
    return [`q[0] must have 10 options, got ${(qs[0].options || []).length}`];
  }
  const canonical = qs[0].options.map((o) => String(o).trim()).join('|');
  for (let i = 1; i < qs.length; i++) {
    const cmp = (qs[i].options || []).map((o) => String(o).trim()).join('|');
    if (cmp !== canonical) return [`q[${i}] has different options list`];
  }
  const corrects = qs.map((q) => String(q.correct || '0').toUpperCase());
  if (corrects.filter((c) => c === '0').length !== 1) errors.push('expected exactly 1 "0"');
  const seen = new Set();
  for (const c of corrects.filter((x) => x !== '0')) {
    if (seen.has(c)) errors.push(`letter "${c}" repeated`);
    if (!T3_LETTERS.includes(c)) errors.push(`invalid correct "${c}"`);
    seen.add(c);
  }
  for (let i = 0; i < qs.length; i++) {
    const ageErr = t3AgeAlignmentError(qs[i], i);
    if (ageErr) errors.push(ageErr);
  }
  return errors;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/topic-cell-preflight-2026-07-14.json');
const jsonOut = process.argv.includes('--json');
const BLUEPRINT_DIR = path.join(ROOT, 'scripts/t3-blueprints');

function loadBlueprints() {
  return fs.readdirSync(BLUEPRINT_DIR).filter((f) => f.endsWith('.json')).map((f) => {
    const bp = JSON.parse(fs.readFileSync(path.join(BLUEPRINT_DIR, f), 'utf8'));
    bp.slug = f.replace(/\.json$/, '');
    return bp;
  });
}

function mkSyntheticT4Batch(topic, debateId) {
  const d = getDebateById(debateId);
  if (!d) return null;
  const intro =
    `In unserer Stadt wird über ${topic} diskutiert. ` +
    `Der Vorschlag: ${d.vorschlag} Lesen Sie die Meinungen im Forum.`;
  return {
    topicTag: topic,
    _debateTopic: debateId,
    passages: [{ id: 'p0', title: d.titleExample, text: intro, topicTag: topic }],
    questions: Array.from({ length: 7 }, (_, i) => ({
      id: `q${i}`,
      module: 'lesen',
      teil: 4,
      signText: `Meinung ${i + 1} zum Thema ${topic}.`,
      question: `Ist Person${i} für den Vorschlag?`,
    })),
  };
}

function debatePassesChk27(topic, debateId) {
  if (!isT4DebateMoldCompatible(topic, debateId)) {
    return { ok: false, reason: 'debate_mold_blocked' };
  }
  const batch = mkSyntheticT4Batch(topic, debateId);
  if (!batch) return { ok: false, reason: 'missing_debate' };
  const a = assessT4TopicAlignment(batch);
  return { ok: a.ok, reason: a.reason || null, affinity: T4_DEBATE_TOPIC_AFFINITY[debateId] || [] };
}

function auditT3Combos(allBps) {
  const passing = allBps.filter((bp) => validateBlueprint(bp).length === 0);
  const combos = [];
  const proposedHardExclude = {};

  for (const topic of B1_TOPICS) {
    for (const bp of allBps) {
      const slug = bp.slug;
      const hard = isBlueprintHardExcludedForTopic(topic, slug);
      const detected = detectTopicFromT3Situations(bp.questions);
      const compat = isLesenT3TopicCompatible(topic, detected);
      const valid = validateBlueprint(bp).length === 0;
      const exactMismatch = detected && !topicsAreCompatible(topic, detected).match;

      let issue = null;
      if (hard) issue = 'hard_excluded';
      else if (!compat) issue = 'incompatible';
      else if (exactMismatch && valid) issue = 'false_positive_compat';
      else if (!valid) issue = 'static_invalid';

      if (issue && issue !== 'hard_excluded' && issue !== 'static_invalid') {
        combos.push({ topic, slug, issue, detected, valid });
        if (issue === 'false_positive_compat') {
          proposedHardExclude[topic] = proposedHardExclude[topic] || [];
          if (!proposedHardExclude[topic].includes(slug)) proposedHardExclude[topic].push(slug);
        }
      }
    }
  }

  const perTopic = [];
  for (const topic of B1_TOPICS) {
    const filtered = filterBlueprintsForTopic(passing, topic);
    const poolSlugs = filtered.map((bp) => bp.slug);
    let status = 'OK';
    let note = `${poolSlugs.length} bp: ${poolSlugs.join(', ') || '—'}`;
    let converge = null;

    if (!poolSlugs.length) {
      status = 'PROBLEM';
      note = 'pool vacío tras filtro';
    } else {
      try {
        const t0 = Date.now();
        buildValidatedT3Part({ requestedTopic: topic, maxAttempts: 6, exclude: new Set() });
        converge = { ok: true, ms: Date.now() - t0 };
      } catch (err) {
        converge = { ok: false, failedSlugs: err.failedSlugs || [], lastSlug: err.lastSlug };
        if (poolSlugs.length === 1) {
          status = 'PROBLEM';
          note = `único ${poolSlugs[0]} no converge offline`;
          proposedHardExclude[topic] = proposedHardExclude[topic] || [];
          if (!proposedHardExclude[topic].includes(poolSlugs[0])) {
            proposedHardExclude[topic].push(poolSlugs[0]);
          }
        } else {
          status = 'WARN';
          note = `multi-bp pero buildValidatedT3Part falló: ${err.message}`;
        }
      }
    }

    perTopic.push({ topic, teil: 3, module: 'lesen', status, note, pool: poolSlugs, converge });
  }

  return { combos, perTopic, proposedHardExclude };
}

function auditT4Combos() {
  const perTopic = [];
  const proposedBlocks = {};
  const failingPreferred = [];

  for (const topic of B1_TOPICS) {
    const pick = pickNextT4DebateTopic([], 0, topic);
    const order = buildT4DebateCandidateOrder(topic);
    const preferred = T4_TOPIC_DEBATE_PREFERENCE[topic] || [];
    const blocked = T4_TOPIC_DEBATE_BLOCKED[topic] || [];

    const chkFirst = debatePassesChk27(topic, pick.id);
    let status = 'OK';
    let note = `pick=${pick.id} tier=${pick.tier} chk27=${chkFirst.ok ? 'OK' : chkFirst.reason}`;

    if (blocked.includes(pick.id)) {
      status = 'PROBLEM';
      note = `BUG: pick bloqueado ${pick.id} aún sale primero`;
    } else if (!chkFirst.ok) {
      status = 'PROBLEM';
      note = `primer pick ${pick.id} falla CHK-27 (${chkFirst.reason})`;
      proposedBlocks[topic] = proposedBlocks[topic] || [];
      if (!proposedBlocks[topic].includes(pick.id)) proposedBlocks[topic].push(pick.id);
    } else if (pick.tier === 'last-resort' && preferred.length) {
      status = 'WARN';
      note += ' (last-resort con preferidos libres)';
    }

    for (const debateId of preferred) {
      if (blocked.includes(debateId)) continue;
      const chk = debatePassesChk27(topic, debateId);
      if (!chk.ok) {
        failingPreferred.push({ topic, debateId, reason: chk.reason });
        proposedBlocks[topic] = proposedBlocks[topic] || [];
        if (!proposedBlocks[topic].includes(debateId)) proposedBlocks[topic].push(debateId);
      }
    }

    const saturatedExclude = [...preferred, ...blocked];
    const satPick = pickNextT4DebateTopic(saturatedExclude, 0, topic);
    const chkSat = debatePassesChk27(topic, satPick.id);
    if (!chkSat.ok && satPick.tier !== 'saturated') {
      status = status === 'OK' ? 'WARN' : status;
      note += `; saturado→${satPick.id} CHK-27 FAIL`;
      proposedBlocks[topic] = proposedBlocks[topic] || [];
      if (!proposedBlocks[topic].includes(satPick.id)) proposedBlocks[topic].push(satPick.id);
    }

    perTopic.push({
      topic,
      teil: 4,
      module: 'lesen',
      status,
      note,
      pick: pick.id,
      tier: pick.tier,
      orderLen: order.length,
      cleanDebates: order.filter((id) => debatePassesChk27(topic, id).ok).length,
    });
  }

  return { perTopic, proposedBlocks, failingPreferred };
}

function auditT5Combos() {
  const perTopic = [];

  for (const topic of B1_TOPICS) {
    const pick = pickNextT5Subtype([], 0, topic);
    const preferred = T5_TOPIC_SUBTYPE_PREFERENCE[topic] || [];
    const satBlock = T5_TOPIC_SUBTYPE_SATURATED_BLOCK[topic] || [];
    const saturatedExclude = [...preferred, ...satBlock];
    const satPick = pickNextT5Subtype(saturatedExclude, 0, topic);

    let status = 'OK';
    let note = `pick=${pick.id} tier=${pick.tier}`;

    if (pick.tier === 'last-resort' && preferred.length) {
      status = 'WARN';
      note += ' (last-resort)';
    }

    if (satBlock.length && satPick.id && satBlock.includes(satPick.id)) {
      status = 'PROBLEM';
      note += `; saturado aún elige bloqueado ${satPick.id}`;
    }

    if (satPick.tier === 'last-resort' || T5_GENERIC_LAST_RESORT.includes(satPick.id)) {
      note += `; celda saturada→${satPick.id}`;
      if (topic === 'Bildung' && satBlock.includes('schule') && satBlock.includes('bibliothek')) {
        status = status === 'PROBLEM' ? status : 'OK';
        note += ' (Bildung: wohnanlage/kantine/… tras schule+bibliothek bloqueados — esperado)';
      }
    }

    perTopic.push({ topic, teil: 5, module: 'lesen', status, note, pick: pick.id, tier: pick.tier });
  }

  return { perTopic, proposedBlocks: {} };
}

function buildFullExamMatrix(t3, t4, t5) {
  const teile = [
    { module: 'lesen', teil: 1, mechanism: 'prompt_only', defaultStatus: 'OK' },
    { module: 'lesen', teil: 2, mechanism: 'prompt_only', defaultStatus: 'OK' },
    { module: 'lesen', teil: 3, mechanism: 'blueprint', defaultStatus: null },
    { module: 'lesen', teil: 4, mechanism: 'debate_mold', defaultStatus: null },
    { module: 'lesen', teil: 5, mechanism: 'subtype_mold', defaultStatus: null },
    { module: 'horen', teil: 1, mechanism: 'premise_dedup_global', defaultStatus: 'OK' },
    { module: 'horen', teil: 2, mechanism: 'premise_dedup_global', defaultStatus: 'OK' },
    { module: 'horen', teil: 3, mechanism: 'prompt_only', defaultStatus: 'OK' },
    { module: 'horen', teil: 4, mechanism: 'prompt_only', defaultStatus: 'OK' },
    { module: 'schreiben', teil: 1, mechanism: 'prompt_only', defaultStatus: 'OK' },
    { module: 'schreiben', teil: 2, mechanism: 'prompt_only', defaultStatus: 'OK' },
    { module: 'schreiben', teil: 3, mechanism: 'premise_dedup_global', defaultStatus: 'OK' },
    { module: 'sprechen', teil: 1, mechanism: 'fingerprint_dedup', defaultStatus: 'OK' },
    { module: 'sprechen', teil: 2, mechanism: 'fingerprint_dedup', defaultStatus: 'OK' },
    { module: 'sprechen', teil: 3, mechanism: 'fingerprint_dedup', defaultStatus: 'OK' },
  ];

  const audited = new Map();
  for (const r of [...t3.perTopic, ...t4.perTopic, ...t5.perTopic]) {
    audited.set(`${r.topic}|${r.module}|${r.teil}`, r);
  }

  const matrix = [];
  for (const topic of B1_TOPICS) {
    for (const cell of teile) {
      const key = `${topic}|${cell.module}|${cell.teil}`;
      const row = audited.get(key);
      matrix.push({
        topic,
        module: cell.module,
        teil: cell.teil,
        status: row?.status || cell.defaultStatus || 'OK',
        note: row?.note || 'sin selector estructural tema×molde',
        mechanism: cell.mechanism,
      });
    }
  }
  return matrix;
}

function mergeProposedExcludes(t3, t4) {
  const t3new = {};
  for (const [topic, slugs] of Object.entries(t3.proposedHardExclude)) {
    const existing = TOPIC_BLUEPRINT_HARD_EXCLUDE[topic] || [];
    const fresh = slugs.filter((s) => !existing.includes(s));
    if (fresh.length) t3new[topic] = fresh;
  }
  const t4new = {};
  for (const [topic, ids] of Object.entries(t4.proposedBlocks)) {
    const existing = T4_TOPIC_DEBATE_BLOCKED[topic] || [];
    const fresh = ids.filter((id) => !existing.includes(id));
    if (fresh.length) t4new[topic] = fresh;
  }
  return { T3: t3new, T4: t4new, T5: {} };
}

function main() {
  const allBps = loadBlueprints();
  const t3 = auditT3Combos(allBps);
  const t4 = auditT4Combos();
  const t5 = auditT5Combos();
  const matrix = buildFullExamMatrix(t3, t4, t5);
  const newExcludes = mergeProposedExcludes(t3, t4);

  const problems = matrix.filter((m) => m.status === 'PROBLEM');
  const warns = matrix.filter((m) => m.status === 'WARN');

  const report = {
    at: new Date().toISOString(),
    topics: B1_TOPICS.length,
    cells: matrix.length,
    existingExcludes: {
      T3: TOPIC_BLUEPRINT_HARD_EXCLUDE,
      T3_PREFERENCE: TOPIC_BLUEPRINT_PREFERENCE,
      T4: T4_TOPIC_DEBATE_BLOCKED,
      T5: T5_TOPIC_SUBTYPE_SATURATED_BLOCK,
    },
    newExcludesProposed: newExcludes,
    t3FalsePositives: t3.combos.filter((c) => c.issue === 'false_positive_compat'),
    t4FailingPreferred: t4.failingPreferred,
    problems,
    warns,
    matrix,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n=== Preflight ${B1_TOPICS.length} temas × 15 Teile (offline) ===\n`);
  console.log('topic          | mod      | T | status   | note');
  console.log('---------------|----------|---|----------|------');
  for (const m of matrix) {
    console.log(
      `${m.topic.padEnd(14)} | ${m.module.padEnd(8)} | ${String(m.teil).padStart(1)} | ${m.status.padEnd(8)} | ${m.note.slice(0, 55)}`,
    );
  }
  console.log(`\nPROBLEM: ${problems.length} · WARN: ${warns.length}`);
  if (Object.keys(newExcludes.T3).length || Object.keys(newExcludes.T4).length) {
    console.log('\nNuevas exclusiones propuestas:', JSON.stringify(newExcludes, null, 2));
  }
  if (problems.length) {
    console.log('\nPENDIENTES:');
    for (const p of problems) console.log(`  ${p.topic} ${p.module} T${p.teil}: ${p.note}`);
  }
  console.log(`\nReport: ${path.relative(ROOT, OUT)}`);
}

main();
