/**
 * CHK-18b — clave MCQ vs explicación (determinista, sin LLM).
 */

function stripOptionLetter(opt) {
  return String(opt || '').replace(/^[a-d]\)\s*/i, '').trim();
}

function optionStr(o) {
  if (typeof o === 'string') return o.trim();
  if (typeof o === 'object' && o) return String(o.text ?? o.label ?? o.value ?? '').trim();
  return String(o ?? '').trim();
}

function significantTokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 4),
  );
}

function tokenOverlap(a, b) {
  const ta = significantTokens(a);
  const tb = significantTokens(b);
  if (!ta.size || !tb.size) return 0;
  let n = 0;
  for (const t of ta) {
    for (const u of tb) {
      if (t === u) {
        n++;
        break;
      }
      const stem = Math.min(t.length, u.length, 5);
      if (stem >= 5 && t.slice(0, stem) === u.slice(0, stem)) {
        n++;
        break;
      }
    }
  }
  return n;
}

/** Tokens de contenido (≥5 letras) compartidos entre explanation y otra opción. */
function overlappingContentTokens(expl, otherBody) {
  const ta = [...significantTokens(expl)];
  const tb = significantTokens(otherBody);
  const hits = [];
  for (const t of ta) {
    for (const u of tb) {
      if (t === u) {
        hits.push(t);
        break;
      }
      const stem = Math.min(t.length, u.length, 5);
      if (stem >= 5 && t.slice(0, stem) === u.slice(0, stem)) {
        hits.push(t);
        break;
      }
    }
  }
  return hits;
}

function contentTokens(text, minLen = 4) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= minLen),
  );
}

function tokenAppearsInText(token, text) {
  const tl = String(token || '').toLowerCase();
  if (!tl) return false;
  const tokens = contentTokens(text, 4);
  if (tokens.has(tl)) return true;
  for (const u of tokens) {
    const stem = Math.min(tl.length, u.length, 5);
    if (stem >= 5 && tl.slice(0, stem) === u.slice(0, stem)) return true;
  }
  return false;
}

/**
 * Overlap explanation↔opción incorrecta, excluyendo tokens también presentes en la correcta.
 * @param {string[]} overlapTokens
 * @param {string} correctBody
 */
export function filterForbiddenOverlapTokens(overlapTokens, correctBody) {
  return [...new Set(overlapTokens || [])].filter(
    (t) => t && !tokenAppearsInText(t, correctBody),
  );
}

function exclusiveWrongOverlapTokens(expl, wrongBody, correctBody) {
  return filterForbiddenOverlapTokens(overlappingContentTokens(expl, wrongBody), correctBody);
}

function optionLetter(opt) {
  const m = optionStr(opt).match(/^([a-c])\)/i);
  return m ? m[1].toLowerCase() : '';
}

/**
 * Analiza un ítem MCQ T2/T5. Devuelve null si no hay mismatch CHK-18b.
 * @returns {null | {
 *   itemId: string,
 *   correct: string,
 *   overlapCorrect: number,
 *   overlapWrong: number,
 *   wrongOptionLetter: string,
 *   wrongOptionText: string,
 *   overlapTokens: string[],
 *   message: string,
 * }}
 */
export function analyzeExplanationMismatch(q, batch = {}) {
  const opts = q.options || [];
  if (opts.length < 3) return null;
  const mod = String(q.module || batch.module || '').toLowerCase();
  const teil = Number(q.teil ?? batch.teil);
  if (mod !== 'lesen' || ![2, 5].includes(teil)) return null;
  if (String(q.type || '').toLowerCase() === 'matching') return null;

  const letter = String(q.correct ?? q.correctAnswer ?? '')
    .toLowerCase()
    .replace(/[^a-c]/, '');
  if (!letter) return null;

  const correctOpt = opts.find((o) => optionStr(o).toLowerCase().startsWith(`${letter})`));
  if (!correctOpt) return null;

  const expl = String(q.explanation || '').trim();
  if (!expl) return null;

  const correctBody = stripOptionLetter(correctOpt);
  const overlapCorrect = tokenOverlap(expl, correctBody);

  let bestWrong = { overlap: 0, body: '', letter: '' };
  for (const o of opts) {
    const oStr = optionStr(o);
    if (oStr.toLowerCase().startsWith(`${letter})`)) continue;
    const wb = stripOptionLetter(o);
    const ovl = tokenOverlap(expl, wb);
    if (ovl > bestWrong.overlap) {
      bestWrong = { overlap: ovl, body: wb, letter: optionLetter(o) || bestWrong.letter };
    }
  }

  if (bestWrong.overlap < 2 || bestWrong.overlap <= overlapCorrect) return null;

  const overlapTokens = exclusiveWrongOverlapTokens(expl, bestWrong.body, correctBody);

  return {
    itemId: q.id || q.question,
    correct: letter,
    overlapCorrect,
    overlapWrong: bestWrong.overlap,
    wrongOptionLetter: bestWrong.letter,
    wrongOptionText: bestWrong.body,
    overlapTokens,
    message:
      `${q.id || 'question'}: clave «${letter}» pero la explicación encaja mejor con otra opción ` +
      `(overlap correct=${overlapCorrect}, wrong=${bestWrong.overlap}` +
      (bestWrong.letter ? `, opción incorrecta ${bestWrong.letter})` : '') +
      `).`,
  };
}

/**
 * @returns {Array<ReturnType<typeof analyzeExplanationMismatch>>}
 */
export function findKeyExplanationMismatches(batch) {
  const hits = [];
  for (const q of batch.questions || []) {
    const hit = analyzeExplanationMismatch(q, batch);
    if (hit) hits.push(hit);
  }
  return hits;
}

/** Narrative MCQ (T1–T3, T2) vs Regeltext (T5). */
export function lesenExplanationTextKind(batch = {}) {
  const teil = Number(batch.teil ?? batch.questions?.[0]?.teil);
  if (teil === 5) return 'regeltext';
  const passageBlob = (batch.passages || [])
    .map((p) => `${p.title || ''}\n${p.text || ''}`)
    .join('\n');
  if (/§\s*\d|Hausordnung|Regeltext|Unterrichtsordnung/i.test(passageBlob)) return 'regeltext';
  return 'narrative';
}

/** Move finite «ist/sind/war…» toward clause end for weil-Nebensatz (B1-safe heuristic). */
export function weilClauseBodyFromOption(correctBody) {
  let body = String(correctBody || '').trim().replace(/\.$/, '');
  const m = body.match(/^([Ee]s|[Dd]as|[Dd]er|[Dd]ie)\s+(ist|sind|war|waren|wird|werden)\s+(.+)$/);
  if (m) return `${m[1]} ${m[3]} ${m[2]}`;
  return body.charAt(0).toLowerCase() + body.slice(1);
}

/**
 * B1 explanation anchored to the declared correct option (0 API calls).
 * @returns {string|null}
 */
export function buildDeterministicExplanationForCorrectKey(question, batch = {}) {
  const hit = analyzeExplanationMismatch(question, batch);
  if (!hit) return null;

  const letter = hit.correct;
  const opts = question.options || [];
  const correctOpt = opts.find((o) =>
    optionStr(o).toLowerCase().trim().startsWith(`${letter})`),
  );
  const correctBody = correctOpt ? stripOptionLetter(correctOpt) : '';
  if (!correctBody) return null;

  const forbidden = new Set(
    (hit.overlapTokens || []).map((t) => String(t).toLowerCase()).filter(Boolean),
  );

  const kind = lesenExplanationTextKind(batch);
  const weilBody = weilClauseBodyFromOption(correctBody);
  const candidates =
    kind === 'regeltext'
      ? [
          `Laut dem Text ist Antwort ${letter}) richtig, weil ${weilBody}. Das steht so in den Regeln.`,
          `Die richtige Antwort ist ${letter}), denn im Text heißt es: ${correctBody}.`,
          `Option ${letter}) ist korrekt, weil die Regeln festlegen, dass ${weilBody}.`,
        ]
      : [
          `Die richtige Antwort ist ${letter}), denn im Text heißt es: ${correctBody}.`,
          `Laut dem Text passt Antwort ${letter}), weil ${weilBody}.`,
          `Option ${letter}) ist korrekt, denn der Text sagt: ${correctBody}.`,
        ];

  for (const expl of candidates) {
    const words = expl.split(/\s+/).filter(Boolean);
    if (words.length < 10) continue;
    if (forbidden.size && [...forbidden].some((t) => expl.toLowerCase().includes(t))) continue;
    if (kind === 'narrative' && /steht so in den regeln|die regeln festlegen/i.test(expl)) continue;
    const trial = { ...question, explanation: expl };
    if (!analyzeExplanationMismatch(trial, batch)) return expl;
  }
  return null;
}

/** @returns {{ batch: object, fixed: number }} */
export function applyDeterministicExplanationFixes(batch) {
  if (!batch?.questions?.length) return { batch, fixed: 0 };
  let fixed = 0;
  const questions = batch.questions.map((q) => {
    const expl = buildDeterministicExplanationForCorrectKey(q, batch);
    if (!expl) return q;
    fixed += 1;
    return { ...q, explanation: expl };
  });
  return { batch: fixed ? { ...batch, questions } : batch, fixed };
}
