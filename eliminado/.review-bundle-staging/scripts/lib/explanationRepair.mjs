/**
 * explanationRepair.mjs — Reparación localizada CHK-18b (solo explanation, T2/T5).
 */
import { extractJson } from './extractJson.mjs';
import {
  analyzeExplanationMismatch,
  findKeyExplanationMismatches,
  filterForbiddenOverlapTokens,
} from './keyExplanationGate.mjs';
import { hasLongLiteralOverlap } from './lesenBatchQuality.mjs';

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
  if (!detail?.wrongOptionText) {
    return (
      `## Reglas para la nueva explanation\n` +
      `- Mínimo 10 palabras en alemán B1.\n` +
      `- Debe justificar por SIGNIFICADO por qué la opción ${letter}) es correcta según el pasaje.\n` +
      `- Parafrasea la opción correcta; NO la copies literalmente.\n` +
      `- PROHIBIDO copiar ≥5 palabras seguidas del pasaje.\n` +
      `- NO justifiques ninguna opción incorrecta.\n`
    );
  }

  const overlapLine =
    detail.overlapCorrect != null && detail.overlapWrong != null
      ? `Overlap detectado: correct=${detail.overlapCorrect}, wrong=${detail.overlapWrong}.\n`
      : '';

  const forbiddenBlock = detail.overlapTokens?.length
    ? `\nPalabras de contenido PROHIBIDAS (overlap con la opción incorrecta — NO las uses):\n` +
      `${detail.overlapTokens.map((t) => `- ${t}`).join('\n')}\n`
    : '';

  return (
    `## Diagnóstico CHK-18b\n` +
    overlapLine +
    `La explanation anterior se parecía demasiado a esta opción INCORRECTA:\n` +
    `«${detail.wrongOptionText}».\n` +
    `La nueva explanation debe:\n` +
    `(a) parafrasear el contenido de la opción CORRECTA «${correctBody || '?'}» usando sinónimos B1,\n` +
    `(b) NO usar las palabras de contenido de la opción incorrecta citada arriba` +
    (detail.overlapTokens?.length ? ' ni las palabras prohibidas listadas abajo' : '') +
    `,\n` +
    `(c) no copiar ≥5 palabras seguidas del pasaje.\n` +
    forbiddenBlock +
    `\n## Reglas adicionales\n` +
    `- Mínimo 10 palabras en alemán B1.\n` +
    `- Justifica por SIGNIFICADO por qué ${letter}) es correcta según el pasaje.\n` +
    `- NO justifiques ninguna opción incorrecta.\n`
  );
}

function buildExplanationRepairPrompt(ctx) {
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

  return (
    `Eres examinador Goethe B1 Lesen Teil ${teil}. El PASAJE, la pregunta, las opciones y la clave correcta están aprobados — NO los modifiques.\n` +
    `Escribe SOLO una nueva explanation en alemán B1 para esta pregunta MCQ.\n\n` +
    `## Pasaje (NO cambiar)\n` +
    `passageId: "${passage.id || '?'}"\n${body}\n\n` +
    `## Pregunta [${q.id || '?'}] (NO cambiar enunciado ni opciones)\n` +
    `Enunciado: ${q.question || ''}\n` +
    `Opciones:\n${opts || '(vacías)'}\n` +
    `Clave correcta: ${letter})\n` +
    `Texto de la opción correcta: ${correctBody || '?'}\n` +
    (detail?.wrongOptionLetter
      ? `Opción incorrecta con la que se confundió la explanation: ${detail.wrongOptionLetter})\n` +
        `Texto opción incorrecta: «${detail.wrongOptionText}»\n`
      : '') +
    `Explanation actual (incorrecta): ${q.explanation || '(ninguna)'}\n\n` +
    `## Error del checker\n${issues || detail?.message || '- La explicación justifica otra opción, no la clave correcta.'}\n\n` +
    guidance +
    `\nDevuelve SOLO JSON:\n` +
    `{ "explanations": { "${q.id || 'gen-q-repair'}": "… nueva explanation en alemán …" } }`
  );
}

function explanationStillBad(question, passage, teil) {
  const hits = findKeyExplanationMismatches({
    passages: [passage],
    questions: [{ ...question, module: 'lesen', teil: Number(teil) || question.teil }],
  });
  if (hits.length) return true;
  const words = String(question.explanation || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 10) return true;
  const body = `${passage.title || ''} ${passage.text || ''}`;
  if (hasLongLiteralOverlap(question.explanation, body, 5)) return true;
  return false;
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

  const byItem = new Map();
  for (const f of findings) {
    if (!f.itemId) continue;
    if (!byItem.has(f.itemId)) byItem.set(f.itemId, []);
    byItem.get(f.itemId).push(f);
  }
  if (!byItem.size) return null;

  const teil = Number(opts.teil ?? batch.questions?.[0]?.teil ?? batch.teil ?? 2);
  const maxAttempts = Math.max(1, Number(opts.maxAttempts) || 2);

  let questions = [...batch.questions];
  let repairedAny = false;

  for (const [itemId, itemFindings] of byItem) {
    const qIdx = questions.findIndex((q) => q.id === itemId);
    if (qIdx < 0) continue;
    const question = questions[qIdx];
    const passage = passageForQuestion(batch, question);
    if (!passage?.text) continue;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const prompt = buildExplanationRepairPrompt({
        passage,
        question,
        teil,
        findings: itemFindings,
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
        continue;
      }

      const newExpl =
        parsed?.explanations?.[itemId] ??
        parsed?.explanations?.[question.id] ??
        parsed?.explanation;
      if (typeof newExpl !== 'string' || !newExpl.trim()) continue;

      const patched = { ...question, explanation: newExpl.trim() };
      if (!explanationStillBad(patched, passage, teil)) {
        questions[qIdx] = patched;
        repairedAny = true;
        break;
      }
      console.log(`  explanation aún inválida en ${itemId} tras intento ${attempt}`);
    }
  }

  return repairedAny ? { ...batch, questions } : null;
}
