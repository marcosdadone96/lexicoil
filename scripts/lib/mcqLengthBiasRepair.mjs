/**

 * mcqLengthBiasRepair.mjs — Localized repair: MCQ length bias (batch repair + regen fallback).

 */

import {

  buildMcqLengthBiasBatchRepairPrompt,

  buildMcqLengthBiasRegenPrompt,

} from './lesenTemplatePrompt.mjs';

import { extractJson } from './extractJson.mjs';

import {

  measureMcqQuestionLengthBias,

  mcqCorrectLetter,

  mcqOptionBody,

  isContentMcqQuestion,

  isSignificantMcqLengthBias,

  isSevereMcqLengthBias,

} from './mcqLengthBias.mjs';



const LENGTH_BIAS_RE = /sesgo de longitud MCQ/i;



export function hasMcqLengthBiasSignal(issues) {

  return (issues || []).some((i) => LENGTH_BIAS_RE.test(String(i)));

}



export function parseMcqLengthBiasItemIds(issues) {

  const out = [];

  for (const issue of issues || []) {

    if (!LENGTH_BIAS_RE.test(String(issue))) continue;

    const m = String(issue).match(/^(gen-q-[^\s:]+):/);

    if (m) out.push(m[1]);

  }

  return [...new Set(out)];

}



function passageForQuestion(batch, question) {

  const pid = question.passageId;

  return (batch.passages || []).find((p) => p.id === pid) || batch.passages?.[0] || null;

}



function normalizeOptionList(options) {

  return options.slice(0, 3).map((o, i) => {

    const letter = String.fromCharCode(97 + i);

    return `${letter}) ${mcqOptionBody(o)}`;

  });

}



function resolveMcqPatch(parsed) {

  if (!parsed || typeof parsed !== 'object') return null;

  if (parsed.options?.length >= 3) return parsed;

  if (parsed.question && typeof parsed.question === 'object' && parsed.question.options?.length >= 3) {

    return parsed.question;

  }

  return null;

}



/** Same threshold as generate gate (per-question). */

export function failsLengthBiasGate(q) {

  if (!isContentMcqQuestion(q)) return false;

  return isSignificantMcqLengthBias(q) || isSevereMcqLengthBias(q);

}



/** Score used for anti-worsening guard (0 if correct is not longest). */

export function lengthBiasScore(q) {

  const m = measureMcqQuestionLengthBias(q);

  if (!m.isLongest) return 0;

  return m.diffPct ?? 0;

}



/** True when patched is strictly better than original for length bias. */

export function lengthBiasPatchImproved(original, patched) {

  const before = lengthBiasScore(original);

  const after = lengthBiasScore(patched);

  if (after < before) return true;

  if (after === 0 && before > 0) return true;

  return false;

}



function mergeMcqPatch(question, patch) {

  const out = { ...question };

  if (Array.isArray(patch.options) && patch.options.length >= 3) {

    out.options = normalizeOptionList(patch.options);

  }

  if (typeof patch.explanation === 'string' && patch.explanation.trim()) {

    out.explanation = patch.explanation.trim();

  }

  if (patch.correct != null) out.correct = patch.correct;

  if (patch.correctAnswer != null) out.correctAnswer = patch.correctAnswer;

  if (typeof patch.question === 'string' && patch.question.trim()) {

    out.question = patch.question.trim();

  }

  return out;

}



function optionsEqual(a, b) {

  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;

  return a.every((opt, i) => mcqOptionBody(opt) === mcqOptionBody(b[i]));

}



function buildRepairItems(batch, itemIds) {

  const items = [];

  for (const id of itemIds) {

    const question = batch.questions?.find((q) => q.id === id);

    if (!question || !isContentMcqQuestion(question)) continue;

    const passage = passageForQuestion(batch, question);

    const sourceText = passage?.text || passage?.transcript || '';

    if (!sourceText) continue;

    const letter = mcqCorrectLetter(question);

    const correctBody = letter

      ? mcqOptionBody(question.options[{ a: 0, b: 1, c: 2 }[letter]])

      : '';

    items.push({ question, passage, sourceText, letter, correctBody });

  }

  return items;

}



/**

 * Regenerate one MCQ question (passage fixed) when batch repair patch worsens or stalls.

 */

export async function regenerateMcqLengthBiasQuestion(batch, itemCtx, callLlm, opts = {}) {

  const { question, passage, sourceText } = itemCtx;

  const module = opts.module || batch.questions?.[0]?.module || 'lesen';

  const teil = opts.teil ?? question.teil ?? batch.teil ?? 2;

  const level = opts.level || question.level || batch.level || 'B1';

  const beforePct = lengthBiasScore(question);



  const prompt = buildMcqLengthBiasRegenPrompt({

    passage,

    question,

    sourceText,

    teil,

    module,

    level,

    sourceLabel: module === 'horen' ? 'transcripción/audio' : 'pasaje',

  });



  console.log(

    `  length-bias: regenerando pregunta completa ${question.id} (+${beforePct}% → regen, pasaje fijo)…`,

  );



  let raw;

  try {

    raw = await callLlm({ prompt, maxTokens: Math.min(opts.maxTokens ?? 4096, 4096) });

  } catch {

    return null;

  }



  let parsed;

  try {

    parsed = extractJson(raw.text ?? raw);

  } catch {

    return null;

  }



  const patch = resolveMcqPatch(parsed);

  if (!patch) return null;



  const patched = mergeMcqPatch(question, patch);

  if (optionsEqual(patched.options, question.options)) {

    console.log(`  length-bias: regen ${question.id} — LLM no modificó opciones`);

    return null;

  }



  const afterPct = lengthBiasScore(patched);

  if (!lengthBiasPatchImproved(question, patched)) {

    console.log(

      `  length-bias: regen ${question.id} rechazada (+${beforePct}%→+${afterPct}%) — no mejor que original`,

    );

    return null;

  }



  if (failsLengthBiasGate(patched)) {

    console.log(

      `  length-bias: regen ${question.id} parcial (+${beforePct}%→+${afterPct}%) — aplicada, re-validar`,

    );

  } else {

    console.log(`  length-bias: regen ${question.id} OK (+${beforePct}%→+${afterPct}%)`);

  }

  return patched;

}



/**

 * @param {object} batch

 * @param {number} teil

 * @param {string[]} issues

 * @param {Function} callLlm

 */

export async function repairMcqLengthBiasBatch(batch, teil, issues, callLlm, opts = {}) {

  const itemIds = parseMcqLengthBiasItemIds(issues);

  if (!itemIds.length) return null;



  const items = buildRepairItems(batch, itemIds);

  if (!items.length) return null;



  const module = opts.module || batch.questions?.[0]?.module || 'lesen';

  const level = opts.level || batch.level || batch.questions?.[0]?.level || 'B1';

  const repairOpts = { ...opts, module, teil, level };



  const prompt = buildMcqLengthBiasBatchRepairPrompt({

    items,

    teil,

    module,

    level,

    sourceLabel: module === 'horen' ? 'transcripción/audio' : 'pasaje',

  });



  console.log(

    `${module} T${teil}: reparando sesgo longitud MCQ en ${items.length} pregunta(s) (1 llamada LLM, fuente fija)…`,

  );



  let raw;

  try {

    raw = await callLlm({ prompt, maxTokens: Math.min(opts.maxTokens ?? 8192, 8192) });

  } catch {

    raw = null;

  }



  let patchById = new Map();

  if (raw) {

    try {

      const parsed = extractJson(raw.text ?? raw);

      const patches = Array.isArray(parsed?.questions) ? parsed.questions : null;

      if (patches?.length) patchById = new Map(patches.map((p) => [p.id, p]));

    } catch {

      /* batch repair parse fail → regen per item */

    }

  }



  let questions = [...batch.questions];

  let repairedAny = false;



  for (const itemCtx of items) {

    const { question } = itemCtx;

    const idx = questions.findIndex((q) => q.id === question.id);

    if (idx < 0) continue;



    const current = questions[idx];

    const beforePct = lengthBiasScore(current);

    const patch = patchById.get(question.id);

    let applied = null;



    if (patch?.options?.length) {

      const patched = mergeMcqPatch(current, patch);

      if (optionsEqual(patched.options, current.options)) {

        console.log(`  length-bias: patch idéntico en ${question.id} — escala a regen`);

      } else if (lengthBiasPatchImproved(current, patched)) {

        applied = patched;

        const afterPct = lengthBiasScore(patched);

        if (failsLengthBiasGate(patched)) {

          console.log(

            `  length-bias: ${question.id} mejoró (+${beforePct}%→+${afterPct}%) — patch aplicado, re-validar`,

          );

        } else {

          console.log(`  length-bias: ${question.id} OK (+${beforePct}%→+${afterPct}%)`);

        }

      } else {

        const afterPct = lengthBiasScore(patched);

        console.log(

          `  length-bias: patch RECHAZADO en ${question.id} (+${beforePct}%→+${afterPct}%) — escala a regen`,

        );

      }

    } else {

      console.log(`  length-bias: sin patch LLM para ${question.id} — escala a regen`);

    }



    if (!applied) {

      applied = await regenerateMcqLengthBiasQuestion(
        { ...batch, questions },
        { ...itemCtx, question: current },
        callLlm,
        repairOpts,
      );

    }



    if (applied) {

      questions[idx] = applied;

      repairedAny = true;

    }

  }



  return repairedAny ? { ...batch, questions } : null;

}

