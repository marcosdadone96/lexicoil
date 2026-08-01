/**
 * explanationRepair.mjs — Reparación localizada CHK-18b (solo explanation, T2/T5).
 */
import { extractJson } from './extractJson.mjs';
import {
  analyzeExplanationMismatch,
  findKeyExplanationMismatches,
  filterForbiddenOverlapTokens,
  applyDeterministicExplanationFixes,
} from './keyExplanationGate.mjs';
import { hasLongLiteralOverlap } from './lesenBatchQuality.mjs';
import { assessGermanExamText } from './qualityGates/germanContentLanguageGate.mjs';
import {
  buildCorrectOptionAnchorBlock,
  germanExplanationLanguageRulesBlock,
} from './germanExplanationPromptRules.mjs';

const EXPLANATION_MISMATCH_RE = /\[CHK-18b\]|CHK-18b|encaja mejor con otra opción/i;

export function hasExplanationMismatchSignal(issues) {
  return (issues || []).some((i) => EXPLANATION_MISMATCH_RE.test(String(i)));
}

/** @returns {Array<{ itemId: string, detail: string }>} */
export function parseExplanationFindingsFromIssues(issues) {
  const out = [];
  for (const issue of issues || []) {
    const s = String(issue);
    if (!EXPLANATION_MISMATCH_RE.test(s)) continue;
    const m = s.match(/(gen-q-[^\s:\]]+)/);
    if (m) out.push({ itemId: m[1], detail: s.replace(/^.*?\]\s*/, '') });
  }
  return out;
}

function passageForQuestion(batch, question) {
  const pid = question.passageId;
  return (batch.passages || []).find((p) => p.id === pid) || batch.passages?.[0] || null;
}

function stripOptionLetter(opt) {
  return String(opt || '').replace(/^[a-d]\)\s*/i, '').trim();
}

function correctOptionText(question) {
  const letter = String(question.correctAnswer || question.correct || '')
    .toLowerCase()
    .replace(/[^a-c]/g, '');
  const correctOpt = (question.options || []).find((o) =>
    String(o).toLowerCase().trim().startsWith(`${letter})`),
  );
  return correctOpt ? stripOptionLetter(correctOpt) : '';
}

function wrongOptionTextFromQuestion(question, wrongLetter) {
  if (!wrongLetter) return '';
  const opt = (question.options || []).find((o) =>
    String(o).toLowerCase().trim().startsWith(`${wrongLetter})`),
  );
  return opt ? stripOptionLetter(opt) : '';
}

/**
 * Enriquece el finding con opción incorrecta y tokens de overlap (desde finding o recálculo).
 */
function resolveMismatchDetail(question, findings, teil) {
  const q = { ...question, module: 'lesen', teil: Number(teil) || question.teil };
  const fromFinding = (findings || []).find((f) => f.wrongOptionText || f.overlapWrong != null);

  let detail = fromFinding?.wrongOptionText
    ? { ...fromFinding }
    : analyzeExplanationMismatch(q, { module: 'lesen', teil: q.teil });

  if (!detail) {
    const hits = findKeyExplanationMismatches({ questions: [q], module: 'lesen', teil: q.teil });
    detail = hits.find((h) => h.itemId === question.id) || hits[0] || null;
  }

  if (!detail) return null;

  const correctBody = correctOptionText(question);
  const wrongLetter =
    detail.wrongOptionLetter ||
    String(detail.message || '').match(/opción incorrecta ([a-c])\)/i)?.[1]?.toLowerCase() ||
    '';
  const wrongBody =
    detail.wrongOptionText || wrongOptionTextFromQuestion(question, wrongLetter) || '';

  let overlapTokens = Array.isArray(detail.overlapTokens) ? [...detail.overlapTokens] : [];
  if (!overlapTokens.length && wrongBody) {
    const recalc = analyzeExplanationMismatch(q, { module: 'lesen', teil: q.teil });
    overlapTokens = recalc?.overlapTokens || [];
  }
  overlapTokens = filterForbiddenOverlapTokens(overlapTokens, correctBody);

  return {
    ...detail,
    correctBody,
    wrongOptionLetter: wrongLetter,
    wrongOptionText: wrongBody,
    overlapTokens: [...new Set(overlapTokens)].filter(Boolean),
  };
}

function buildMismatchGuidanceBlock(detail, letter, correctBody) {
  const langRules = germanExplanationLanguageRulesBlock();
  const anchor = buildCorrectOptionAnchorBlock(letter, correctBody);

  if (!detail?.wrongOptionText) {
    return langRules + anchor;
  }

  const overlapLine =
    detail.overlapCorrect != null && detail.overlapWrong != null
      ? `Overlap: correct=${detail.overlapCorrect}, wrong=${detail.overlapWrong}.\n`
      : '';

  const forbiddenBlock = detail.overlapTokens?.length
    ? `\n## Verbotene Wörter (Overlap mit falscher Option — nicht verwenden)\n` +
      `${detail.overlapTokens.map((t) => `- ${t}`).join('\n')}\n`
    : '';

  return (
    langRules +
    anchor +
    `\n## CHK-18b Diagnose\n` +
    overlapLine +
    `Die alte explanation wirkte zu sehr wie diese FALSCHE Option:\n` +
    `«${detail.wrongOptionText}».\n` +
    `Die neue explanation MUSS den Inhalt der KORREKTEN Option «${correctBody || '?'}» paraphrasieren,\n` +
    `NICHT die falsche Option.` +
    forbiddenBlock
  );
}

export function buildExplanationRepairPrompt(ctx) {
  const passage = ctx.passage || {};
  const q = ctx.question || {};
  const body = String(passage.text || '').trim();
  const teil = Number(ctx.teil) || 2;
  if (!body) throw new Error('explanation repair: pasaje sin texto');

  const opts = (q.options || []).map((o, i) => `${String.fromCharCode(97 + i)}) ${o}`).join('\n');
  const letter = String(q.correct ?? q.correctAnswer ?? '?').toLowerCase().replace(/[^a-c]/g, '');
  const correctBody = correctOptionText(q);
  const detail = resolveMismatchDetail(q, ctx.findings, teil);
  const issues = (ctx.findings || [])
    .map((f) => `- ${f.message || f.detail || 'CHK-18b'}`)
    .join('\n');
  const guidance = buildMismatchGuidanceBlock(detail, letter, correctBody);
  const retryBlock = ctx.priorRejectReasons?.length
    ? `\n## Vorheriger Versuch abgelehnt\n${ctx.priorRejectReasons.map((r) => `- ${r}`).join('\n')}\n`
    : '';

  return (
    `Du bist Goethe B1 Lesen Teil ${teil} Prüfer. Passage, Frage, Optionen und Schlüssel sind freigegeben — nicht ändern.\n` +
    `Schreibe NUR eine neue explanation auf Deutsch B1 für diese MCQ-Frage.\n\n` +
    `## Passage (NICHT ändern)\n` +
    `passageId: "${passage.id || '?'}"\n${body}\n\n` +
    `## Frage [${q.id || '?'}] (Enunciado und Optionen NICHT ändern)\n` +
    `Fragestellung: ${q.question || ''}\n` +
    `Optionen:\n${opts || '(leer)'}\n` +
    `Korrekte Antwort: ${letter})\n` +
    `Text der korrekten Option: ${correctBody || '?'}\n` +
    (detail?.wrongOptionLetter
      ? `Falsche Option (Overlap-Problem): ${detail.wrongOptionLetter})\n` +
        `Text falsche Option: «${detail.wrongOptionText}»\n`
      : '') +
    `Aktuelle explanation (fehlerhaft): ${q.explanation || '(keine)'}\n\n` +
    `## Checker-Fehler\n${issues || detail?.message || '- Die explanation passt nicht zur korrekten Antwort.'}\n\n` +
    retryBlock +
    guidance +
    `\nGib NUR JSON zurück:\n` +
    `{ "explanations": { "${q.id || 'gen-q-repair'}": "… neue explanation auf Deutsch …" } }`
  );
}

/** Questions whose explanation fails the German content gate. */
export function findSpanishExplanationFindings(batch) {
  const out = [];
  for (const q of batch?.questions || []) {
    const expl = String(q.explanation || '').trim();
    if (!expl) continue;
    const check = assessGermanExamText(expl, { minTokens: 6, mode: 'question' });
    if (!check.ok) {
      out.push({
        itemId: q.id,
        detail: `explanation no está en alemán (${check.reason}) — reescribir NUR Deutsch B1`,
      });
    }
  }
  return out;
}

export async function repairSpanishExplanationsInBatch(batch, callLlm, opts = {}) {
  let current = batch;
  const maxRounds = Math.max(1, Number(opts.maxRounds) || 4);
  const perItemAttempts = Math.max(1, Number(opts.maxAttempts) || 5);
  let totalRepairedAny = false;

  for (let round = 1; round <= maxRounds; round++) {
    const findings = findSpanishExplanationFindings(current);
    if (!findings.length) return current;

    if (round > 1) {
      console.log(`  round ${round}/${maxRounds}: ${findings.length} explanation(s) still non-German…`);
    }

    const repaired = await repairExplanationBatch(current, findings, callLlm, {
      ...opts,
      maxAttempts: perItemAttempts,
    });
    if (!repaired) break;
    totalRepairedAny = true;
    current = repaired;
    if (batchSpanishExplanationsClean(current)) return current;
  }

  return batchSpanishExplanationsClean(current) ? current : null;
}

function explanationRejectReasons(question, passage, teil) {
  const reasons = [];
  const expl = String(question.explanation || '').trim();
  const langCheck = assessGermanExamText(expl, { minTokens: 6, mode: 'question' });
  if (!langCheck.ok) reasons.push(`language:${langCheck.reason}`);

  const hits = findKeyExplanationMismatches({
    passages: [passage],
    questions: [{ ...question, module: 'lesen', teil: Number(teil) || question.teil }],
  });
  if (hits.length) reasons.push(`chk18b:${hits[0]?.message || 'mismatch'}`);

  const words = expl.split(/\s+/).filter(Boolean);
  if (words.length < 10) reasons.push('min_words');

  const body = `${passage.title || ''} ${passage.text || ''}`;
  if (hasLongLiteralOverlap(question.explanation, body, 5)) reasons.push('literal_overlap');

  return reasons;
}

function explanationStillBad(question, passage, teil, opts = {}) {
  const reasons = explanationRejectReasons(question, passage, teil);
  if (opts.languageOnly) {
    return reasons.some((r) => r.startsWith('language:') || r === 'min_words' || r === 'literal_overlap');
  }
  return reasons.length > 0;
}

/**
 * Repara solo el campo explanation de ítems señalados por CHK-18b.
 *
 * @param {object} batch
 * @param {Array<{ itemId: string, message?: string, detail?: string }>} findings
 * @param {Function} callLlm - async ({ prompt, maxTokens }) => { text }
 * @param {object} [opts]
 * @returns {Promise<object|null>}
 */
export async function repairExplanationBatch(batch, findings, callLlm, opts = {}) {
  if (!batch?.questions?.length || !findings?.length) return null;

  const det = applyDeterministicExplanationFixes(batch);
  if (det.fixed > 0) {
    const still = findKeyExplanationMismatches(det.batch);
    const targetIds = new Set(
      (findings || []).map((f) => f.itemId).filter(Boolean),
    );
    const remaining = still.filter((h) => !targetIds.size || targetIds.has(h.itemId));
    if (!remaining.length) {
      console.log(`  CHK-18b: ${det.fixed} explanation(s) corregida(s) sin LLM`);
      return det.batch;
    }
    batch = det.batch;
    findings = remaining;
  }

  const byItem = new Map();
  for (const f of findings) {
    if (!f.itemId) continue;
    if (!byItem.has(f.itemId)) byItem.set(f.itemId, []);
    byItem.get(f.itemId).push(f);
  }
  if (!byItem.size) return null;

  const teil = Number(opts.teil ?? batch.questions?.[0]?.teil ?? batch.teil ?? 2);
  const maxAttempts = Math.max(
    1,
    Number(opts.maxAttempts) || (teil === 5 ? 3 : 2),
  );

  let questions = [...batch.questions];
  let repairedAny = false;
  let germanProgressAny = false;

  for (const [itemId, itemFindings] of byItem) {
    const qIdx = questions.findIndex((q) => q.id === itemId);
    if (qIdx < 0) continue;
    const question = questions[qIdx];
    const passage = passageForQuestion(batch, question);
    if (!passage?.text) continue;

    let priorRejectReasons = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const prompt = buildExplanationRepairPrompt({
        passage,
        question: questions[qIdx],
        teil,
        findings: itemFindings,
        priorRejectReasons: attempt > 1 ? priorRejectReasons : [],
      });

      console.log(
        `T${teil}: reparando explanation ${itemId} (CHK-18b, pasaje fijo, intento ${attempt}/${maxAttempts})…`,
      );

      let raw;
      try {
        raw = await callLlm({ prompt, maxTokens: 1024 });
      } catch {
        break;
      }

      let parsed;
      try {
        parsed = extractJson(raw.text ?? raw);
      } catch {
        priorRejectReasons = ['JSON ungültig'];
        continue;
      }

      const newExpl =
        parsed?.explanations?.[itemId] ??
        parsed?.explanations?.[question.id] ??
        parsed?.explanation;
      if (typeof newExpl !== 'string' || !newExpl.trim()) {
        priorRejectReasons = ['leere explanation'];
        continue;
      }

      const patched = { ...questions[qIdx], explanation: newExpl.trim() };
      const langCheck = assessGermanExamText(newExpl.trim(), { minTokens: 6, mode: 'question' });
      if (!langCheck.ok) {
        priorRejectReasons = [`Sprache: ${langCheck.reason}`];
        console.log(
          `  explanation aún inválida en ${itemId} tras intento ${attempt} (language:${langCheck.reason})`,
        );
        continue;
      }

      // Never keep Spanish once we have German — update working copy for further attempts.
      questions[qIdx] = patched;
      germanProgressAny = true;

      const stillBad = explanationStillBad(patched, passage, teil, opts);
      if (!stillBad) {
        repairedAny = true;
        break;
      }
      priorRejectReasons = explanationRejectReasons(patched, passage, teil);
      console.log(
        `  explanation aún inválida en ${itemId} tras intento ${attempt} (${priorRejectReasons.join(', ')})`,
      );
    }
  }

  if (!repairedAny && !germanProgressAny) return null;
  return { ...batch, questions };
}

/** True when every explanation passes the German gate (ignores other CHK-18b if languageOnly batch opts). */
export function batchSpanishExplanationsClean(batch) {
  return findSpanishExplanationFindings(batch).length === 0;
}
