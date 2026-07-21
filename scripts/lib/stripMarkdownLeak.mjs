/**
 * stripMarkdownLeak.mjs — deterministic removal of leaked markdown from batch text fields.
 * Frontend does not render markdown; leaked asterisks/glyphs reach the user literally.
 *
 * AUD-4:  **bold** → plain inner text
 * AUD-4b: line-start list bullets (* / -) → plain text (Hausordnung uses "Label: …" lines)
 * AUD-4c: same strip on questions[].question (Sprechen/Schreiben: passages always empty)
 */

const BOLD_MARKDOWN_RE = /\*\*([^*\n]+?)\*\*/g;

/** First non-space char on a line is * or - followed by spaces (not German compounds like 9-11). */
const LIST_BULLET_RE = /(^|\n)(\s*)[*-]\s+(?=\S)/g;

export function stripMarkdownLeakInText(text) {
  if (typeof text !== 'string' || !text) {
    return { result: text, boldFixed: 0, bulletFixed: 0, count: 0 };
  }

  let boldFixed = 0;
  const afterBold = text.replace(BOLD_MARKDOWN_RE, (_, inner) => {
    boldFixed++;
    return inner;
  });

  let bulletFixed = 0;
  const result = afterBold.replace(LIST_BULLET_RE, (m, lineStart, indent) => {
    bulletFixed++;
    return `${lineStart}${indent}`;
  });

  return { result, boldFixed, bulletFixed, count: boldFixed + bulletFixed };
}

/** @deprecated alias — prefer stripMarkdownLeakInText */
export function stripBoldMarkdownInText(text) {
  const { result, count } = stripMarkdownLeakInText(text);
  return { result, count };
}

/**
 * Strip markdown leaks from passage fields and questions[].question.
 * Passages: text/title/transcript + audio[].text
 * Questions: question (Sprechen/Schreiben consignas; Lesen prompts if any)
 */
export function stripMarkdownLeakInBatch(batch) {
  if (!batch || typeof batch !== 'object') return { batch, totalFixed: 0 };

  let totalFixed = 0;

  const passages = (batch.passages || []).map((p) => {
    const out = { ...p };
    for (const key of ['text', 'title', 'transcript']) {
      if (typeof out[key] === 'string') {
        const { result, count } = stripMarkdownLeakInText(out[key]);
        totalFixed += count;
        out[key] = result;
      }
    }
    if (Array.isArray(out.audio)) {
      out.audio = out.audio.map((turn) => {
        if (!turn || typeof turn !== 'object' || typeof turn.text !== 'string') return turn;
        const { result, count } = stripMarkdownLeakInText(turn.text);
        totalFixed += count;
        return { ...turn, text: result };
      });
    }
    return out;
  });

  const questions = (batch.questions || []).map((q) => {
    if (!q || typeof q !== 'object' || typeof q.question !== 'string') return q;
    const { result, count } = stripMarkdownLeakInText(q.question);
    if (!count) return q;
    totalFixed += count;
    return { ...q, question: result };
  });

  return { batch: { ...batch, passages, questions }, totalFixed };
}

/** @deprecated alias — prefer stripMarkdownLeakInBatch (now also strips questions[].question) */
export function stripBoldMarkdownInPassages(batch) {
  return stripMarkdownLeakInBatch(batch);
}
