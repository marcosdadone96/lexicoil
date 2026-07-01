#!/usr/bin/env node
/**
 * Deterministic gap fill from question pool — no AI.
 *
 *   node scripts/fill-gaps-from-pool.mjs --lang de --level B1 [--dry-run] [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { normalizeMcqOptions, normalizeQuestionFields } from './lib/normalizeMcq.mjs';
import {
  loadBlueprint,
  loadJsonFile,
  bankPath,
  passagesPath,
  curatedDir,
  listCuratedFiles,
  residualGapsPath,
} from './lib/examPipeline.mjs';
import { bpPart, assertBlueprintCaps, abortIfOverCaps } from './lib/blueprintCaps.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const {
  validateExamAgainstBlueprint,
  countScorableItems,
  countPassagesInPart,
  normQuestionType,
} = require(path.join(ROOT, 'js/engine/validation/blueprintFidelity.js'));
const ExamRenumber = require(path.join(ROOT, 'js/engine/examRenumber.js'));
const AnswerKeyVerifier = require(path.join(ROOT, 'js/engine/validation/AnswerKeyVerifier.js'));

function parseArgs(argv) {
  const opts = { lang: null, level: null, apply: false, dryRun: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') {
      opts.apply = true;
      opts.dryRun = false;
    } else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--lang') opts.lang = argv[++i];
    else if (a === '--level') opts.level = String(argv[++i] || '').toUpperCase();
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  if (opts.apply) opts.dryRun = false;
  return opts;
}

function textHash(text) {
  return crypto.createHash('sha256').update(String(text || '').trim()).digest('hex').slice(0, 16);
}

function pairPassageId(id) {
  if (!id) return null;
  if (id.endsWith('-a')) return `${id.slice(0, -2)}-b`;
  if (id.endsWith('-b')) return `${id.slice(0, -2)}-a`;
  return null;
}

function examTokenFromFile(file) {
  return file.match(/_([0-9a-f]{8,12})\.json$/i)?.[1]?.slice(0, 8) || 'fill';
}

function bankToExamQuestion(q, token) {
  const base = String(q.id || 'q').replace(/^ql_/, '');
  const type = q.type || q.questionType || 'multiple';
  const normalizedType = type === 'multiple_choice' || type === 'mcq' ? 'multiple' : type;
  const rawOptions = Array.isArray(q.options) ? [...q.options] : [];
  const options =
    normalizedType === 'multiple' && rawOptions.length
      ? normalizeMcqOptions(rawOptions)
      : rawOptions;
  return {
    id: `ql_${base}-${token}`,
    type: normalizedType,
    question: q.question || q.statement || '',
    correct: q.correct ?? q.correctAnswer ?? '',
    correctAnswer: q.correctAnswer ?? q.correct ?? '',
    explanation: q.explanation || '',
    options,
    grammarTags: q.grammarTags || [],
    topicTags: q.topicTags || [],
    vocabularyTags: q.vocabularyTags || [],
    difficulty: q.difficulty ?? 3,
    passageId: q.passageId || '',
  };
}

function bankToExamItem(q, token) {
  const row = bankToExamQuestion(q, token);
  if (q.signText) row.signText = q.signText;
  if (q.text) row.text = q.text;
  if (q.statement && !row.question) row.question = q.statement;
  return row;
}

function loadJson(p) {
  return loadJsonFile(p);
}

class PoolIndex {
  constructor(bank, extraPassages) {
    this.passageMap = new Map();
    for (const p of [...(bank.passages || []), ...(extraPassages?.passages || [])]) {
      if (p?.id) this.passageMap.set(p.id, p);
    }
    this.byPassageId = new Map();
    this.byModuleTeil = new Map();
    for (const q of bank.questions || []) {
      const mod = String(q.module || '').toLowerCase();
      const teil = Number(q.teil);
      if (!mod || !teil) continue;
      const mt = `${mod}:${teil}`;
      if (!this.byModuleTeil.has(mt)) this.byModuleTeil.set(mt, []);
      this.byModuleTeil.get(mt).push(q);
      if (q.passageId) {
        if (!this.byPassageId.has(q.passageId)) this.byPassageId.set(q.passageId, []);
        this.byPassageId.get(q.passageId).push(q);
      }
    }
    this.horenT1Sets = this._buildHorenT1Sets();
  }

  _buildHorenT1Sets() {
    const sets = [];
    const byBase = new Map();
    for (const [passageId, qs] of this.byPassageId) {
      if (qs[0]?.module !== 'horen' || qs[0]?.teil !== 1) continue;
      const m = passageId.match(/^(.*)-s(\d+)$/i);
      if (!m) continue;
      const base = m[1];
      const n = Number(m[2]);
      if (!byBase.has(base)) byBase.set(base, new Map());
      byBase.get(base).set(n, passageId);
    }
    for (const [base, slots] of byBase) {
      if (slots.size < 5) continue;
      const ids = [1, 2, 3, 4, 5].map((n) => slots.get(n)).filter(Boolean);
      if (ids.length !== 5) continue;
      if (ids.every((id) => (this.byPassageId.get(id) || []).length >= 2)) sets.push({ base, passageIds: ids });
    }
    return sets;
  }

  passageBundle(passageId) {
    const questions = [...(this.byPassageId.get(passageId) || [])].sort((a, b) =>
      String(a.id).localeCompare(String(b.id)),
    );
    const passage = this.passageMap.get(passageId) || null;
    const text = passage?.text || passage?.transcript || '';
    return { passageId, passage, questions, text };
  }

  questionsFor(mod, teil, passageId) {
    return (this.byPassageId.get(passageId) || [])
      .filter((q) => String(q.module).toLowerCase() === mod && Number(q.teil) === Number(teil))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }

  findHorenT1Set(tracker, count = 5) {
    for (const set of this.horenT1Sets) {
      if (set.passageIds.every((id) => tracker.canUsePassage(id, this.passageBundle(id).text))) {
        return set;
      }
    }
    const singles = [];
    for (const [passageId, qs] of this.byPassageId) {
      if (qs[0]?.module !== 'horen' || qs[0]?.teil !== 1 || qs.length < 2) continue;
      const text = this.passageBundle(passageId).text;
      if (tracker.canUsePassage(passageId, text)) singles.push(passageId);
    }
    const unique = [...new Set(singles)];
    if (unique.length >= count) return { base: 'pick', passageIds: unique.slice(0, count) };
    return null;
  }

  findUnusedSegmentBundle(mod, teil, expectedItems, allowedTypes, tracker) {
    const candidates = [];
    for (const [passageId, qs] of this.byPassageId) {
      if (qs[0]?.module !== mod || qs[0]?.teil !== teil) continue;
      if (qs.length < expectedItems) continue;
      const bundle = this.passageBundle(passageId);
      if (!tracker.canUsePassage(passageId, bundle.text)) continue;
      const types = [...new Set(qs.map((q) => normQuestionType(q)))];
      if (allowedTypes?.length && !types.every((t) => allowedTypes.some((a) => normQuestionType({ type: a }) === t || a === t))) {
        // soft — at least one allowed type present
        if (!types.some((t) => allowedTypes.map((x) => normQuestionType({ type: x })).includes(t))) continue;
      }
      candidates.push({ passageId, qs, bundle });
    }
    candidates.sort((a, b) => a.passageId.localeCompare(b.passageId));
    return candidates[0] || null;
  }

  findLesenT2Mate(mainPassageId, tracker) {
    const mate = pairPassageId(mainPassageId);
    if (mate) {
      const bundle = this.passageBundle(mate);
      if (bundle.questions.length >= 3 && tracker.canUsePassage(mate, bundle.text)) {
        return { passageId: mate, bundle, source: 'pair' };
      }
    }
    for (const [passageId, qs] of this.byPassageId) {
      if (!passageId.includes('lesen-t2') || qs.length < 3) continue;
      if (passageId === mainPassageId) continue;
      const bundle = this.passageBundle(passageId);
      if (!tracker.canUsePassage(passageId, bundle.text)) continue;
      if (qs.every((q) => normQuestionType(q) === 'multiple_choice' || q.type === 'multiple')) {
        return { passageId, bundle, source: 'pool' };
      }
    }
    return null;
  }

  findLesenPassageQuestions(passageId, needed, tracker, bankIdsUsed) {
    const all = [...(this.byPassageId.get(passageId) || [])].sort((a, b) =>
      String(a.id).localeCompare(String(b.id)),
    );
    const picked = [];
    for (const q of all) {
      if (picked.length >= needed) break;
      if (bankIdsUsed.has(q.id)) continue;
      picked.push(q);
    }
    return picked.length >= needed ? picked.slice(0, needed) : picked;
  }
}

class UsageTracker {
  constructor() {
    this.passageIds = new Set();
    this.textHashes = new Set();
    this.bankQuestionIds = new Set();
  }

  absorbExam(exam) {
    for (const p of exam.lesenParts || []) {
      if (p.passageId) this.passageIds.add(p.passageId);
      if (p.text) this.textHashes.add(textHash(p.text));
      for (const pp of p.passages || []) {
        if (pp.passageId) this.passageIds.add(pp.passageId);
        if (pp.text) this.textHashes.add(textHash(pp.text));
      }
      for (const q of p.questions || []) if (q.passageId) this.passageIds.add(q.passageId);
    }
    for (const p of exam.horenParts || []) {
      if (p.transcript) this.textHashes.add(textHash(p.transcript));
      for (const seg of p.segments || []) {
        if (seg.passageId) this.passageIds.add(seg.passageId);
        if (seg.transcript) this.textHashes.add(textHash(seg.transcript));
      }
    }
  }

  canUsePassage(passageId, text) {
    if (this.passageIds.has(passageId)) return false;
    const h = textHash(text);
    if (h && this.textHashes.has(h)) return false;
    return true;
  }

  claimPassage(passageId, text) {
    if (passageId) this.passageIds.add(passageId);
    const h = textHash(text);
    if (h) this.textHashes.add(h);
  }

  claimBankQuestions(qs) {
    for (const q of qs) if (q.id) this.bankQuestionIds.add(q.id);
  }
}

function structuralErrors(exam) {
  return new AnswerKeyVerifier().collectStructuralKeyErrors(exam);
}

function hasMatchZeroError(exam) {
  return structuralErrors(exam).some((e) => e.includes('match_zero_not_in_options'));
}

function lesenT2PassageIds(part) {
  const ids = new Set();
  if (part.passageId) ids.add(part.passageId);
  for (const pp of part.passages || []) if (pp.passageId) ids.add(pp.passageId);
  for (const q of part.questions || []) if (q.passageId) ids.add(q.passageId);
  return ids;
}

function partAtOrOverBlueprint(part, modId, bp) {
  if (!bp) return false;
  const expItems = bp.itemsTotal;
  const expPassages = bp.passagesPerPart ?? bp.segmentsTotal;
  const haveItems = countScorableItems(part, modId);
  if (expItems != null && haveItems > expItems) return true;
  if (expItems != null && haveItems >= expItems) {
    if (expPassages == null) return true;
    const havePassages = countPassagesInPart(part, bp);
    if (havePassages >= expPassages) return true;
  }
  if (expPassages != null) {
    const havePassages = countPassagesInPart(part, bp);
    if (havePassages > expPassages) return true;
  }
  return false;
}

function topUpLesenT2Items(part, pool, tracker, token, bp) {
  const expItems = bp?.itemsTotal ?? 6;
  const perPassage = 3;
  let added = 0;
  for (const pid of lesenT2PassageIds(part)) {
    const need = expItems - countScorableItems(part, 'lesen');
    if (need <= 0) break;
    const existing = (part.questions || []).filter((q) => q.passageId === pid).length;
    const canAdd = Math.min(need, perPassage - existing);
    if (canAdd <= 0) continue;
    const bankQs = pool
      .questionsFor('lesen', 2, pid)
      .filter((q) => !tracker.bankQuestionIds.has(q.id))
      .slice(0, canAdd);
    if (!bankQs.length) continue;
    added += addQuestionsToPassagePart(part, pid, bankQs, token, tracker);
  }
  return added;
}

function insertLesenT2Passage(part, pick, token, tracker, bp) {
  if (bp && partAtOrOverBlueprint(part, 'lesen', bp)) {
    return { passageId: pick.passageId, questionsAdded: 0, source: pick.source, skipped: 'at_blueprint_cap' };
  }
  const expPassages = bp?.passagesPerPart ?? 2;
  const havePassages = bp ? countPassagesInPart(part, bp) : lesenT2PassageIds(part).size;
  if (havePassages >= expPassages) {
    return { passageId: pick.passageId, questionsAdded: 0, source: pick.source, skipped: 'passages_full' };
  }
  const { passageId, bundle } = pick;
  const isMain = part.passageId === passageId;
  if (!isMain) {
    if (!part.passages) part.passages = [];
    const exists = part.passages.some((p) => p.passageId === passageId);
    if (!exists) {
      part.passages.push({
        passageId,
        textTitle: bundle.passage?.title || bundle.passage?.textTitle || '',
        text: bundle.text || bundle.passage?.text || '',
      });
    }
  }
  const existingForPassage = (part.questions || []).filter((q) => q.passageId === passageId).length;
  const need = Math.max(0, 3 - existingForPassage);
  const bankQs = bundle.questions.slice(0, need > 0 ? need : 3);
  const newQs = bankQs.map((q) => bankToExamQuestion(q, token));
  part.questions = [...(part.questions || []), ...newQs];
  tracker.claimPassage(passageId, bundle.text);
  tracker.claimBankQuestions(bankQs);
  return { passageId, questionsAdded: newQs.length, source: pick.source };
}

function pickHorenT1Questions(questions, maxItems = 2) {
  const norm = (q) => String(q.type || q.questionType || '').toLowerCase();
  const rf = questions.filter((q) => norm(q) === 'richtig_falsch' || norm(q) === 'true_false');
  const mcq = questions.filter(
    (q) => norm(q) === 'mcq' || norm(q) === 'multiple_choice' || norm(q) === 'multiple',
  );
  const picked = [];
  if (rf.length) picked.push(rf[0]);
  if (mcq.length) picked.push(mcq[0]);
  for (const q of questions) {
    if (picked.length >= maxItems) break;
    if (!picked.includes(q)) picked.push(q);
  }
  return picked.slice(0, maxItems);
}

function buildHorenSegment(bundle, token, label, idx, maxQuestions) {
  const qs =
    maxQuestions != null
      ? pickHorenT1Questions(bundle.questions, maxQuestions)
      : bundle.questions.slice(0, bundle.questions.length);
  return {
    id: `seg_fill_${idx}`,
    label: label || bundle.passage?.title || `Aufnahme ${idx + 1}`,
    transcript: bundle.text || bundle.passage?.text || bundle.passage?.transcript || '',
    passageId: bundle.passageId,
    questions: qs.map((q) => bankToExamQuestion(q, token)),
  };
}

function replaceHorenT1Segments(part, set, pool, token, tracker) {
  const segments = set.passageIds.map((pid, i) => {
    const bundle = pool.passageBundle(pid);
    return buildHorenSegment(bundle, token, `Aufnahme ${i + 1}`, i, 2);
  });
  part.segments = segments;
  part.transcript = segments.map((s) => s.transcript).filter(Boolean).join('\n\n');
  for (const pid of set.passageIds) {
    const b = pool.passageBundle(pid);
    tracker.claimPassage(pid, b.text);
    const picked = pickHorenT1Questions(b.questions, 2);
    tracker.claimBankQuestions(picked);
  }
  return { segments: segments.length, items: segments.reduce((n, s) => n + (s.questions?.length || 0), 0) };
}

function replaceHorenSingleSegment(part, pick, token, tracker, itemLimit) {
  const bundle = pick.bundle;
  const limit = itemLimit ?? pick.qs.length;
  const limitedBundle = { ...bundle, questions: pick.qs.slice(0, limit) };
  const seg = buildHorenSegment(limitedBundle, token, part.segments?.[0]?.label || 'Aufnahme 1', 0);
  seg.passageId = bundle.passageId;
  part.segments = [seg];
  part.transcript = seg.transcript;
  tracker.claimPassage(bundle.passageId, bundle.text);
  tracker.claimBankQuestions(limitedBundle.questions);
  return { passageId: bundle.passageId, items: seg.questions.length };
}

function addQuestionsToPassagePart(part, passageId, bankQs, token, tracker) {
  const newQs = bankQs.map((q) => bankToExamQuestion(q, token));
  part.questions = [...(part.questions || []), ...newQs];
  tracker.claimBankQuestions(bankQs);
  return newQs.length;
}

function addSegmentQuestions(seg, bankQs, token, tracker) {
  const newQs = bankQs.map((q) => bankToExamQuestion(q, token));
  seg.questions = [...(seg.questions || []), ...newQs];
  tracker.claimBankQuestions(bankQs);
  return newQs.length;
}

function analyzeGaps(exam, blueprint) {
  const result = validateExamAgainstBlueprint(exam, blueprint);
  const gaps = [];
  for (const d of result.details || []) {
    if (!d.issues?.length) continue;
    const bp = bpPart(blueprint, d.module, d.teil);
    gaps.push({
      module: d.module,
      teil: d.teil,
      slotType: d.slotType || bp?.slotType,
      bpPart: bp,
      itemsTotal: d.itemsTotal || null,
      passagesPerPart: d.passagesPerPart || null,
      issues: [...d.issues],
    });
  }
  for (const err of result.errors) {
    if (err.includes('match_zero_not_in_options')) {
      gaps.push({
        module: 'lesen',
        teil: 3,
        slotType: 'ads_matching',
        bpPart: bpPart(blueprint, 'lesen', 3),
        issues: [err],
        structural: true,
      });
    }
  }
  return gaps;
}

function fillExam(wrapper, blueprint, pool, tracker, opts) {
  const file = wrapper._file;
  const examId = wrapper.id || file;
  const token = examTokenFromFile(file);
  const exam = structuredClone(wrapper.exam);
  const fills = [];
  const residuals = [];

  const pushResidual = (gap, reason, missing) => {
    residuals.push({
      examId,
      module: gap.module,
      teil: gap.teil,
      slotType: gap.slotType,
      missing,
      reason,
    });
  };

  // Lesen T2 — missing second passage (never exceed blueprint caps)
  const lesenT2 = (exam.lesenParts || []).find((p) => Number(p.teil) === 2);
  if (lesenT2) {
    const bp = bpPart(blueprint, 'lesen', 2);
    const expPassages = bp?.passagesPerPart ?? 2;
    const havePassages = countPassagesInPart(lesenT2, bp);
    const haveItems = countScorableItems(lesenT2, 'lesen');
    const expItems = bp?.itemsTotal ?? 6;
    if (partAtOrOverBlueprint(lesenT2, 'lesen', bp)) {
      /* complete or over — do not fill */
    } else if (havePassages < expPassages || haveItems < expItems) {
      const mainId = lesenT2.passageId || [...lesenT2PassageIds(lesenT2)][0];
      const pick = pool.findLesenT2Mate(mainId, tracker);
      if (pick && pick.bundle.questions.length >= 3) {
        const before = countScorableItems(lesenT2, 'lesen');
        const action = insertLesenT2Passage(lesenT2, pick, token, tracker, bp);
        if (action.skipped) {
          /* cap reached */
        } else {
          const after = countScorableItems(lesenT2, 'lesen');
          fills.push({
            examId,
            module: 'lesen',
            teil: 2,
            action: 'insert_mate_passage',
            passageId: action.passageId,
            source: action.source,
            questionsAdded: action.questionsAdded,
            itemsBefore: before,
            itemsAfter: after,
          });
        }
      } else {
        pushResidual(
          { module: 'lesen', teil: 2, slotType: 'press_mcq' },
          pick ? 'mate_passage_insufficient_questions' : 'no_unused_t2_passage_in_pool',
          { passages: expPassages - havePassages, items: expItems - haveItems },
        );
      }
    } else if (havePassages >= expPassages && haveItems < expItems) {
      const before = haveItems;
      const added = topUpLesenT2Items(lesenT2, pool, tracker, token, bp);
      if (added > 0) {
        fills.push({
          examId,
          module: 'lesen',
          teil: 2,
          action: 'top_up_passage_questions',
          questionsAdded: added,
          itemsBefore: before,
          itemsAfter: countScorableItems(lesenT2, 'lesen'),
        });
      } else {
        pushResidual(
          { module: 'lesen', teil: 2, slotType: 'press_mcq' },
          'insufficient_pool_questions_for_existing_passages',
          { items: expItems - haveItems },
        );
      }
    }
  }

  // Lesen T5 — empty questions
  const lesenT5 = (exam.lesenParts || []).find((p) => Number(p.teil) === 5);
  if (lesenT5) {
    const bp = bpPart(blueprint, 'lesen', 5);
    const exp = bp?.itemsTotal ?? 4;
    const have = countScorableItems(lesenT5, 'lesen');
    if (have < exp && lesenT5.passageId) {
      const bankQs = pool.findLesenPassageQuestions(lesenT5.passageId, exp - have, tracker, tracker.bankQuestionIds);
      if (bankQs.length >= exp - have) {
        const added = addQuestionsToPassagePart(lesenT5, lesenT5.passageId, bankQs, token, tracker);
        fills.push({
          examId,
          module: 'lesen',
          teil: 5,
          action: 'add_passage_questions',
          passageId: lesenT5.passageId,
          questionsAdded: added,
        });
      } else {
        pushResidual(
          { module: 'lesen', teil: 5, slotType: 'rules_mcq' },
          'insufficient_pool_questions_for_passage',
          { items: exp - have },
        );
      }
    }
  }

  // Hören T1 — wrong segment count or missing items
  const horenT1 = (exam.horenParts || []).find((p) => Number(p.teil) === 1);
  if (horenT1) {
    const bp = bpPart(blueprint, 'horen', 1);
    const expSeg = bp?.segmentsTotal ?? 5;
    const expItems = bp?.itemsTotal ?? 10;
    const segs = horenT1.segments || [];
    const haveItems = countScorableItems(horenT1, 'horen');
    const havePassages = countPassagesInPart(horenT1, bp);
    const needsRebuild = segs.length !== expSeg || haveItems < expItems || havePassages !== expSeg;
    if (needsRebuild) {
      const set = pool.findHorenT1Set(tracker, expSeg);
      if (set) {
        const action = replaceHorenT1Segments(horenT1, set, pool, token, tracker);
        fills.push({
          examId,
          module: 'horen',
          teil: 1,
          action: 'replace_t1_segment_set',
          passageIds: set.passageIds,
          ...action,
        });
      } else {
        // try adding missing 2nd question per segment
        let addedTotal = 0;
        for (const seg of segs) {
          const qs = seg.questions || [];
          if (qs.length >= 2) continue;
          const pid = seg.passageId;
          if (!pid) continue;
          const bankQs = pool.questionsFor('horen', 1, pid).filter((q) => !tracker.bankQuestionIds.has(q.id));
          const need = 2 - qs.length;
          const pick = bankQs.filter((q) => !qs.some((x) => x.question === q.question)).slice(0, need);
          if (pick.length >= need) {
            addedTotal += addSegmentQuestions(seg, pick, token, tracker);
          }
        }
        if (addedTotal > 0) {
          fills.push({
            examId,
            module: 'horen',
            teil: 1,
            action: 'add_segment_questions',
            questionsAdded: addedTotal,
          });
        } else {
          pushResidual(
            { module: 'horen', teil: 1, slotType: 'short_texts_twice' },
            'no_unused_t1_segment_set_in_pool',
            { segments: expSeg - segs.length, items: expItems - haveItems, passages: expSeg - havePassages },
          );
        }
      }
    }
  }

  // Hören T2/T3/T4 — single-segment parts
  for (const teil of [2, 3, 4]) {
    const part = (exam.horenParts || []).find((p) => Number(p.teil) === teil);
    if (!part) continue;
    const bp = bpPart(blueprint, 'horen', teil);
    const expItems = bp?.itemsTotal ?? 0;
    const have = countScorableItems(part, 'horen');
    if (have >= expItems || partAtOrOverBlueprint(part, 'horen', bp)) continue;

    const allowed = bp?.questionTypes || [];
    const pick = pool.findUnusedSegmentBundle('horen', teil, expItems, allowed, tracker);
    if (pick && pick.qs.length >= expItems) {
      const before = have;
      const action = replaceHorenSingleSegment(part, pick, token, tracker);
      fills.push({
        examId,
        module: 'horen',
        teil,
        action: 'replace_segment_bundle',
        passageId: action.passageId,
        itemsBefore: before,
        itemsAfter: action.items,
      });
    } else {
      const seg = (part.segments || [])[0];
      if (seg?.passageId && have > 0) {
        const bankQs = pool
          .questionsFor('horen', teil, seg.passageId)
          .filter((q) => !tracker.bankQuestionIds.has(q.id));
        const need = expItems - have;
        const pickQ = bankQs.slice(0, need);
        if (pickQ.length >= need) {
          const added = addSegmentQuestions(seg, pickQ, token, tracker);
          fills.push({
            examId,
            module: 'horen',
            teil,
            action: 'add_segment_questions',
            passageId: seg.passageId,
            questionsAdded: added,
          });
          continue;
        }
      }
      pushResidual(
        { module: 'horen', teil, slotType: bp?.slotType },
        pick ? 'pool_bundle_too_small' : 'no_unused_horen_segment_in_pool',
        { items: expItems - have },
      );
    }
  }

  ExamRenumber.renumberExam(exam, blueprint);

  const capViolations = assertBlueprintCaps(exam, blueprint);
  if (capViolations.length) {
    pushResidual(
      { module: '*', teil: 0, slotType: 'cap_guard' },
      `blueprint_cap_violation:${capViolations.join(';')}`,
    );
    const original = structuredClone(wrapper.exam);
    ExamRenumber.renumberExam(original, blueprint);
    const afterValidation = validateExamAgainstBlueprint(original, blueprint);
    return {
      exam: original,
      fills: fills.filter(() => false),
      residuals,
      ok: afterValidation.ok,
      remainingErrors: afterValidation.errors.length,
      capAborted: true,
    };
  }

  // Re-check remaining gaps
  const afterGaps = analyzeGaps(exam, blueprint);
  for (const gap of afterGaps) {
    if (gap.structural || gap.issues.some((i) => i.includes('match_zero'))) {
      const already = residuals.some(
        (r) => r.examId === examId && r.module === gap.module && r.teil === gap.teil && r.reason.includes('match_zero'),
      );
      if (!already) {
        pushResidual(gap, 'match_zero_not_fillable_by_pool', { structural: true });
      }
    } else if (gap.itemsTotal && gap.itemsTotal.received < gap.itemsTotal.expected) {
      const already = residuals.some((r) => r.examId === examId && r.module === gap.module && r.teil === gap.teil);
      if (!already) {
        pushResidual(gap, 'still_short_after_pool_fill', {
          items: gap.itemsTotal.expected - gap.itemsTotal.received,
        });
      }
    } else if (gap.passagesPerPart && gap.passagesPerPart.received < gap.passagesPerPart.expected) {
      const already = residuals.some((r) => r.examId === examId && r.module === gap.module && r.teil === gap.teil);
      if (!already) {
        pushResidual(gap, 'still_short_passages_after_pool_fill', {
          passages: gap.passagesPerPart.expected - gap.passagesPerPart.received,
        });
      }
    }
  }

  if (hasMatchZeroError(exam)) {
    const already = residuals.some((r) => r.examId === examId && r.reason.includes('match_zero'));
    if (!already) {
      pushResidual(
        { module: 'lesen', teil: 3, slotType: 'ads_matching' },
        'match_zero_not_fillable_by_pool',
        { structural: true },
      );
    }
  }

  const afterValidation = validateExamAgainstBlueprint(exam, blueprint);
  return {
    exam,
    fills,
    residuals,
    ok: afterValidation.ok,
    remainingErrors: afterValidation.errors.length,
  };
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    console.log('Usage: node scripts/fill-gaps-from-pool.mjs --lang de --level B1 [--dry-run] [--apply]');
    process.exit(0);
  }
  if (!opts.lang || !opts.level) {
    console.error('Required: --lang (de|en|es) and --level (A1–C2)');
    process.exit(2);
  }

  const lang = opts.lang;
  const level = opts.level;
  let blueprint;
  try {
    blueprint = loadBlueprint(lang, level);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const bankFile = bankPath(lang, level);
  if (!fs.existsSync(bankFile)) {
    console.error(`Missing bank: ${path.relative(ROOT, bankFile)}`);
    process.exit(1);
  }
  const bank = loadJson(bankFile);
  const extraPassages = fs.existsSync(passagesPath(lang, level))
    ? loadJson(passagesPath(lang, level))
    : { passages: [] };
  const pool = new PoolIndex(bank, extraPassages);

  const dir = curatedDir(lang, level);
  if (!fs.existsSync(dir)) {
    console.error(`Missing curated dir: ${path.relative(ROOT, dir)}`);
    process.exit(1);
  }
  const files = listCuratedFiles(lang, level);

  const tracker = new UsageTracker();
  const wrappers = files.map((f) => {
    const w = loadJson(path.join(dir, f));
    w._file = f;
    tracker.absorbExam(w.exam || {});
    return w;
  });

  const report = {
    generatedAt: new Date().toISOString(),
    lang,
    level,
    mode: opts.apply ? 'apply' : 'dry-run',
    exams: files.length,
    fills: [],
    residuals: [],
    summary: { fillActions: 0, examsTouched: 0, examsStillFailing: 0 },
  };

  for (const wrapper of wrappers) {
    const result = fillExam(wrapper, blueprint, pool, tracker, opts);
    report.fills.push(...result.fills);
    report.residuals.push(...result.residuals);
    if (result.fills.length) report.summary.examsTouched += 1;
    if (!result.ok) report.summary.examsStillFailing += 1;
    wrapper._simulatedExam = result.exam;
    wrapper._postOk = result.ok;

    if (opts.apply && result.fills.length) {
      wrapper.exam = result.exam;
      fs.writeFileSync(path.join(dir, wrapper._file), JSON.stringify(wrapper, null, 2) + '\n', 'utf8');
    }
  }

  report.summary.wouldPassFidelity = wrappers.filter((w) => w._postOk).length;

  const auditPath = residualGapsPath(lang, level);
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.writeFileSync(auditPath, JSON.stringify(report.residuals, null, 2) + '\n', 'utf8');

  console.log(`\n══ fill-gaps-from-pool (${report.mode}) ══ ${lang}/${level} ══`);
  console.log(`Exams: ${report.exams} | fill actions: ${report.fills.length} | residual gaps: ${report.residuals.length}`);
  console.log(
    `Exams touched: ${report.summary.examsTouched} | would pass fidelity: ${report.summary.wouldPassFidelity}/${report.exams} | still failing: ${report.summary.examsStillFailing}`,
  );

  if (report.fills.length) {
    console.log('\n── Would fill / filled from pool ──');
    for (const f of report.fills) {
      console.log(
        `  ${f.examId} ${f.module} T${f.teil}: ${f.action}` +
          (f.passageId ? ` passage=${f.passageId}` : '') +
          (f.passageIds ? ` set=[${f.passageIds.map((x) => x.split('-').slice(-2).join('-')).join(', ')}]` : '') +
          (f.questionsAdded != null ? ` +${f.questionsAdded}q` : '') +
          (f.itemsAfter != null ? ` items→${f.itemsAfter}` : '') +
          (f.segments != null ? ` segs=${f.segments}` : ''),
      );
    }
  }

  if (report.residuals.length) {
    console.log('\n── Residual (not fillable by pool) ──');
    for (const r of report.residuals) {
      console.log(
        `  ${r.examId} ${r.module} T${r.teil} (${r.slotType || '?'}) — ${r.reason}` +
          (r.missing ? ` missing=${JSON.stringify(r.missing)}` : ''),
      );
    }
  }

  console.log(`\nAudit: ${path.relative(ROOT, auditPath)}`);
  if (opts.dryRun) console.log('DRY-RUN — no curated files written (use --apply to save).\n');
  else console.log('APPLY — curated files updated.\n');

  const capViolations = [];
  for (const wrapper of wrappers) {
    const exam = wrapper._simulatedExam || wrapper.exam;
    capViolations.push(...assertBlueprintCaps(exam, blueprint, `${wrapper._file}: `));
  }
  if (capViolations.length) {
    console.error('Blueprint cap violations after fill:');
    capViolations.forEach((v) => console.error(`  · ${v}`));
    process.exit(1);
  }
}

export {
  PoolIndex,
  UsageTracker,
  replaceHorenT1Segments,
  replaceHorenSingleSegment,
  examTokenFromFile,
  bankToExamQuestion,
  textHash,
  assertBlueprintCaps,
  abortIfOverCaps,
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
