/**
 * Extract reusable exam Teile from library question bank (not full curated exams).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { normalizeQuestionFields, normalizeMcqOptions } from './normalizeMcq.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));
require(path.join(ROOT, 'js/library/PassageResolver.js'));
require(path.join(ROOT, 'js/library/AdsMatching.js'));
const { validateExamAgainstBlueprint } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintFidelity.js',
));

export function loadBank(lang, level) {
  const bank = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'library', lang, level, 'questions.json'), 'utf8'),
  );
  const pp = path.join(ROOT, 'library', lang, level, 'passages.json');
  if (fs.existsSync(pp)) {
    const pf = JSON.parse(fs.readFileSync(pp, 'utf8'));
    const ids = new Set((bank.passages || []).map((p) => p.id));
    const extra = (pf.passages || []).filter((p) => !ids.has(p.id));
    bank.passages = [...(bank.passages || []), ...extra];
  }
  return bank;
}

export function loadCuratedExams(lang, level) {
  const file = path.join(ROOT, 'data/exams', `${lang}_${level}.json`);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function byQid(a, b) {
  return String(a.id).localeCompare(String(b.id));
}

function pairPassageId(id) {
  if (!id) return null;
  if (id.endsWith('-a')) return `${id.slice(0, -2)}-b`;
  if (id.endsWith('-b')) return `${id.slice(0, -2)}-a`;
  return null;
}

function groupByPassageId(questions) {
  const m = new Map();
  for (const q of questions) {
    const pid = q.passageId || '_none';
    if (!m.has(pid)) m.set(pid, []);
    m.get(pid).push(q);
  }
  for (const qs of m.values()) qs.sort(byQid);
  return m;
}

function partSpec(blueprint, modId, teil) {
  const mod = (blueprint.modules || []).find((m) => String(m.id).toLowerCase() === modId);
  return (mod?.parts || []).find((p) => Number(p.teil) === Number(teil)) || null;
}

function poolQuestions(bank, modId, teil) {
  return (bank.questions || []).filter(
    (q) => String(q.module || '').toLowerCase() === modId && Number(q.teil) === Number(teil),
  );
}

function buildExamPart(modId, partSpecRow, picked, bank, blueprint) {
  const assembled = ExamBlueprint.finalizeAssembly(bank, blueprint, [
    { modId, partSpec: partSpecRow, picked },
  ]);
  if (modId === 'lesen') return assembled.lesenParts?.[0] || null;
  if (modId === 'horen') return assembled.horenParts?.[0] || null;
  return null;
}

export function partContentHash(module, teil, part) {
  const h = crypto.createHash('sha256');
  h.update(`${module}:${teil}:`);
  if (module === 'lesen') {
    const passages = [];
    if (part.text?.trim()) passages.push(String(part.text).trim().slice(0, 400));
    for (const p of part.passages || []) {
      if (p.text?.trim()) passages.push(String(p.text).trim().slice(0, 400));
    }
    h.update(passages.sort().join('\n---\n'));
    const qids = (part.questions || part.items || [])
      .map((q) => q.id)
      .sort()
      .join(',');
    h.update(qids);
  } else if (module === 'horen') {
    for (const seg of part.segments || []) {
      h.update(String(seg.transcript || '').trim().slice(0, 400));
    }
    const qids = [];
    for (const seg of part.segments || []) {
      for (const q of seg.questions || []) qids.push(q.id);
    }
    h.update(qids.sort().join(','));
  }
  return h.digest('hex').slice(0, 16);
}

export function collectCuratedPartHashes(exams, modules = ['lesen', 'horen']) {
  const set = new Set();
  for (const exam of exams) {
    if (modules.includes('lesen')) {
      for (const part of exam.lesenParts || []) {
        set.add(`lesen:${part.teil}:${partContentHash('lesen', part.teil, part)}`);
      }
    }
    if (modules.includes('horen')) {
      for (const part of exam.horenParts || []) {
        set.add(`horen:${part.teil}:${partContentHash('horen', part.teil, part)}`);
      }
    }
  }
  return set;
}

function enumerateLesenT1(pool, target) {
  const out = [];
  for (const [, qs] of groupByPassageId(pool)) {
    if (qs.length >= target) out.push(qs.slice(0, target));
  }
  return out;
}

function enumerateLesenT2(pool, target) {
  const per = target / 2;
  const byPid = groupByPassageId(pool);
  const out = [];
  const seen = new Set();

  for (const [pidA, qsA] of byPid) {
    if (qsA.length < per) continue;
    const mate = pairPassageId(pidA);
    if (!mate || !byPid.has(mate)) continue;
    const qsB = byPid.get(mate);
    if (!qsB || qsB.length < per) continue;
    const key = [pidA, mate].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const first = pidA.endsWith('-a') ? pidA : mate.endsWith('-a') ? mate : pidA;
    const second = first === pidA ? mate : pidA;
    out.push([...byPid.get(first).slice(0, per), ...byPid.get(second).slice(0, per)]);
  }
  return out;
}

function enumerateLesenT3(pool, target) {
  const bySlug = new Map();
  for (const q of pool) {
    const m = String(q.id || '').match(/-l-t3-(.+?)-q\d+$/i);
    if (!m) continue;
    const slug = m[1];
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(q);
  }
  const out = [];
  for (const qs of bySlug.values()) {
    qs.sort(byQid);
    if (qs.length >= target) out.push(qs.slice(0, target));
  }
  return out;
}

function enumerateLesenT4(pool, target) {
  const bySlug = new Map();
  for (const q of pool) {
    const m = String(q.id || '').match(/-l-t4-(.+?)-q\d+$/i);
    const slug = m ? m[1] : q.passageId || q.id;
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(q);
  }
  const out = [];
  for (const qs of bySlug.values()) {
    qs.sort(byQid);
    if (qs.length >= target) out.push(qs.slice(0, target));
  }
  return out;
}

function enumerateLesenT5(pool, target) {
  return enumerateLesenT1(pool, target);
}

function buildHorenT1Sets(pool) {
  const byBase = new Map();
  for (const q of pool) {
    const pid = q.passageId;
    if (!pid) continue;
    const m = pid.match(/^(.*)-s(\d+)$/i);
    if (!m) continue;
    const base = m[1];
    const n = Number(m[2]);
    if (!byBase.has(base)) byBase.set(base, new Map());
    byBase.get(base).set(n, pid);
  }
  const sets = [];
  for (const [, slots] of byBase) {
    const ids = [1, 2, 3, 4, 5].map((n) => slots.get(n)).filter(Boolean);
    if (ids.length !== 5) continue;
    sets.push(ids);
  }
  return sets;
}

function questionsForPassage(pool, passageId) {
  return pool.filter((q) => q.passageId === passageId).sort(byQid);
}

function enumerateHorenT1(pool, target) {
  const perSeg = 2;
  const out = [];
  for (const passageIds of buildHorenT1Sets(pool)) {
    const picked = [];
    for (const pid of passageIds) {
      const qs = questionsForPassage(pool, pid);
      if (qs.length < perSeg) {
        picked.length = 0;
        break;
      }
      picked.push(...qs.slice(0, perSeg));
    }
    if (picked.length === target) out.push(picked);
  }
  return out;
}

function enumerateHorenSingleSegment(pool, target) {
  const out = [];
  for (const [, qs] of groupByPassageId(pool)) {
    if (qs.length >= target) out.push(qs.slice(0, target));
  }
  return out;
}

function enumeratePicks(modId, teil, pool, bpPart) {
  const target = bpPart.itemsTotal ?? bpPart.questionsTotal?.min ?? 1;
  if (modId === 'lesen') {
    if (teil === 1) return enumerateLesenT1(pool, target);
    if (teil === 2) return enumerateLesenT2(pool, target);
    if (teil === 3) return enumerateLesenT3(pool, target);
    if (teil === 4) return enumerateLesenT4(pool, target);
    if (teil === 5) return enumerateLesenT5(pool, target);
  }
  if (modId === 'horen') {
    if (teil === 1) return enumerateHorenT1(pool, target);
    return enumerateHorenSingleSegment(pool, target);
  }
  return [];
}

const OPTION_KEY_TYPES = new Set([
  'multiple',
  'multiple_choice',
  'mcq',
  'matching',
]);

function parseOptionKeyText(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^([a-z])\)\s*(.*)$/i);
  if (m) return { key: m[1].toUpperCase(), text: m[2].trim() };
  return null;
}

function optionsLookLikeKeyed(opts) {
  if (!Array.isArray(opts) || opts.length < 2) return false;
  return opts.some((o) => {
    if (o && typeof o === 'object' && (o.key != null || o.id != null)) return true;
    return !!parseOptionKeyText(o);
  });
}

function normalizeBankQuestion(q) {
  const row = normalizeQuestionFields({ ...q });
  const t = String(row.type || '').toLowerCase();
  const shouldNormalize =
    OPTION_KEY_TYPES.has(t) ||
    t.startsWith('matching') ||
    optionsLookLikeKeyed(row.options);
  if (shouldNormalize && Array.isArray(row.options)) {
    row.options = normalizeMcqOptions(row.options).map((o) => {
      if (o && typeof o === 'object' && (o.key != null || o.id != null)) {
        return { key: String(o.key ?? o.id).toUpperCase(), text: String(o.text ?? o.label ?? '').trim() };
      }
      const parsed = parseOptionKeyText(o);
      if (parsed) return parsed;
      return { key: 'A', text: String(o || '').trim() };
    });
    const rawCorrect = String(row.correct ?? row.correctAnswer ?? '').trim();
    const letter = rawCorrect.replace(/^\s*([a-z])\).*/i, '$1').toUpperCase();
    if (letter) {
      row.correct = letter;
      row.correctAnswer = letter;
    }
  }
  return row;
}

function flattenLesenQuestions(part) {
  const out = [];
  const push = (q) => {
    if (!q?.question && !q?.signText) return;
    out.push(normalizeBankQuestion({
      id: q.id,
      type: q.type || q.questionType || 'multiple',
      question: q.question || q.signText || q.statement,
      options: q.options,
      correct: q.correct ?? q.correctAnswer,
      correctAnswer: q.correctAnswer ?? q.correct,
      explanation: q.explanation || '',
      passageId: q.passageId,
      signText: q.signText,
    }));
  };
  (part.questions || []).forEach(push);
  (part.items || []).forEach((it) =>
    push({
      ...it,
      question: it.question || it.signText || it.statement,
      type: it.type || 'matching',
    }),
  );
  return out;
}

function lesenPassagePayload(part) {
  const teil = Number(part.teil);
  if (teil === 2 && Array.isArray(part.passages) && part.passages.length >= 2) {
    return {
      title: part.textTitle || 'Lesen Teil 2',
      passages: part.passages.map((p) => ({
        passageId: p.id || p.passageId,
        textTitle: p.title || p.textTitle || '',
        text: String(p.text || '').trim(),
      })),
      text: part.text || part.passages[0]?.text || '',
    };
  }
  if (teil === 3 && (part.text || part.ads?.length)) {
    return {
      title: part.textTitle || '',
      text: String(part.text || '').trim(),
      ads: part.ads,
    };
  }
  return {
    title: part.textTitle || part.instruction || '',
    text: String(part.text || '').trim(),
  };
}

function flattenHorenQuestions(part) {
  const out = [];
  for (const seg of part.segments || []) {
    for (const q of seg.questions || []) {
      out.push(normalizeBankQuestion({ ...q }));
    }
  }
  return out;
}

function horenPayload(part) {
  const segments = (part.segments || []).map((seg, i) => ({
    id: seg.id || `seg_${i}`,
    label: seg.label || `Aufnahme ${i + 1}`,
    transcript: String(seg.transcript || seg.text || '').trim(),
    passageId: seg.passageId || seg.id,
    questions: (seg.questions || []).map((q) => ({ ...q })),
  }));
  const text =
    String(part.transcript || '').trim() ||
    segments.map((s) => s.transcript).filter(Boolean).join('\n\n');
  return {
    segments,
    passage: { title: part.context || part.instruction || '', text, transcript: text },
  };
}

export function examPartToReusableRecord(part, module, meta, blueprint, { sourceKey }) {
  const teil = Number(part.teil);
  const target = blueprint
    ? ExamBlueprint.partTarget(partSpec(blueprint, module, teil) || {})
    : null;

  const id = `bank-${meta.lang}-${meta.level}-${module}-t${teil}-${sourceKey}`;

  const payload = {
    id,
    lang: meta.lang,
    level: meta.level,
    module,
    teil,
    instruction: part.instruction || '',
    complete: false,
    verified: false,
    contributor: `bank:${sourceKey}`,
  };

  if (module === 'lesen') {
    payload.passage = lesenPassagePayload(part);
    payload.questions = flattenLesenQuestions(part);
    if (teil === 3 && part.ads?.length) payload.ads = part.ads;
    if (part.example) payload.example = part.example;
  } else if (module === 'horen') {
    const hp = horenPayload(part);
    payload.passage = hp.passage;
    payload.segments = hp.segments;
    payload.questions = flattenHorenQuestions(part);
  } else {
    return null;
  }

  payload.itemCount = payload.questions.length;
  payload.targetCount = target ?? payload.questions.length;
  return payload;
}

function validateBuiltPart(modId, part, blueprint) {
  const exam =
    modId === 'lesen'
      ? { lang: 'de', level: 'B1', lesenParts: [{ ...part, teil: Number(part.teil) }] }
      : { lang: 'de', level: 'B1', horenParts: [{ ...part, teil: Number(part.teil) }] };
  const fid = validateExamAgainstBlueprint(exam, blueprint);
  const errors = [...(fid.errors || [])];
  const warnings = [...(fid.warnings || [])];
  return { ok: errors.length === 0, errors, warnings };
}

export async function extractBankReusableParts({
  lang,
  level,
  blueprint,
  bank,
  curatedExams = [],
  validateRecord = null,
  modules = ['lesen', 'horen'],
  verbose = false,
  maxPerTeil = null,
}) {
  const curatedHashes = collectCuratedPartHashes(curatedExams, modules);
  const records = [];
  const stats = {
    candidates: 0,
    rejectedCurated: 0,
    rejectedGate: 0,
    rejectedFidelity: 0,
    deduped: 0,
    rejectedFormatBySlot: {},
  };
  const bumpFormatSlot = (modId, teil) => {
    const k = `${modId}:t${teil}`;
    stats.rejectedFormatBySlot[k] = (stats.rejectedFormatBySlot[k] || 0) + 1;
  };
  const seen = new Set();

  for (const modId of modules) {
    const mod = (blueprint.modules || []).find((m) => String(m.id).toLowerCase() === modId);
    if (!mod) continue;

    for (const bpPart of mod.parts || []) {
      const teil = Number(bpPart.teil);
      const pool = poolQuestions(bank, modId, teil);
      const pickSets = enumeratePicks(modId, teil, pool, bpPart);

      for (const picked of pickSets) {
        stats.candidates += 1;
        const built = buildExamPart(modId, bpPart, picked, bank, blueprint);
        if (!built) continue;

        const contentKey = partContentHash(modId, teil, built);
        const curatedKey = `${modId}:${teil}:${contentKey}`;
        if (curatedHashes.has(curatedKey)) {
          stats.rejectedCurated += 1;
          continue;
        }
        const dedupeKey = curatedKey;
        if (seen.has(dedupeKey)) {
          stats.deduped += 1;
          continue;
        }

        const fid = validateBuiltPart(modId, built, blueprint);
        if (!fid.ok) {
          stats.rejectedFidelity += 1;
          bumpFormatSlot(modId, teil);
          if (verbose) {
            console.warn(`  skip ${modId} T${teil} ${contentKey}: ${fid.errors.slice(0, 2).join('; ')}`);
          }
          continue;
        }

        const record = examPartToReusableRecord(built, modId, { lang, level }, blueprint, {
          sourceKey: contentKey,
        });
        if (!record) continue;

        if (validateRecord) {
          const gate = await validateRecord(record, { blueprint });
          if (!gate.valid || !gate.complete) {
            stats.rejectedGate += 1;
            bumpFormatSlot(modId, teil);
            if (verbose) {
              console.warn(
                `  gate ${modId} T${teil} ${contentKey}: ${(gate.errors || []).slice(0, 2).join('; ')}`,
              );
            }
            continue;
          }
          record.questions = gate.questions;
          record.itemCount = gate.itemCount;
        }

        record.complete = true;
        record.verified = true;
        seen.add(dedupeKey);
        records.push(record);
      }
    }
  }

  if (maxPerTeil != null && Number.isFinite(maxPerTeil)) {
    const cap = Number(maxPerTeil);
    const bySlot = new Map();
    for (const rec of records) {
      const k = `${rec.module}:t${rec.teil}`;
      if (!bySlot.has(k)) bySlot.set(k, []);
      bySlot.get(k).push(rec);
    }
    records.length = 0;
    for (const [, list] of bySlot) {
      records.push(...list.slice(0, cap));
    }
  }

  return { records, stats, curatedHashes };
}

export function countByTeil(records) {
  const counts = {};
  for (const r of records) {
    const k = `${r.module}:t${r.teil}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}
