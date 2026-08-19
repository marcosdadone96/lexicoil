'use strict';

/**
 * Textos — passage-only payload from a Lesen pool part (no questions/answers).
 */

function wordCount(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function isExamInstruction(text) {
  const s = String(text || '').trim();
  if (!s) return true;
  return /Lesen Sie|Beantworten Sie|Markieren Sie|richtig oder falsch|Wählen Sie|Ordne zu|Zuordnen/i.test(s);
}

function pickMultiBlockPassage(part) {
  const blocks = [];
  const p = part?.passage;

  if (Array.isArray(p?.passages)) {
    for (const pp of p.passages) {
      const text = String(pp?.text || '').trim();
      if (text) {
        blocks.push({
          title: String(pp.textTitle || pp.title || '').trim(),
          text,
        });
      }
    }
  }
  if (Array.isArray(part?.passages)) {
    for (const pp of part.passages) {
      const text = String(pp?.text || '').trim();
      if (text) {
        blocks.push({
          title: String(pp.title || pp.textTitle || '').trim(),
          text,
        });
      }
    }
  }

  if (!blocks.length) return null;
  const overMin = blocks.find((b) => wordCount(b.text) > 80);
  if (overMin) return overMin;
  return blocks.reduce(
    (best, b) => (wordCount(b.text) > wordCount(best.text) ? b : best),
    blocks[0],
  );
}

/**
 * Extract primary reading passage text without question stems or options.
 */
function extractTextosPassageBlock(part) {
  const p = part?.passage;
  const multi = pickMultiBlockPassage(part);
  if (multi) {
    const mainTitle = String(p?.title || '').trim();
    return {
      title: mainTitle || multi.title,
      subtitle: mainTitle && multi.title && multi.title !== mainTitle ? multi.title : '',
      passageText: multi.text,
      instruction: isExamInstruction(part?.instruction) ? '' : String(part?.instruction || '').trim(),
    };
  }

  const passageText = String(p?.text || part?.text || '').trim();
  return {
    title: String(p?.title || '').trim(),
    subtitle: '',
    passageText,
    instruction: isExamInstruction(part?.instruction) ? '' : String(part?.instruction || '').trim(),
  };
}

function toTextosReadingPayload(part) {
  const block = extractTextosPassageBlock(part);
  const passageText = block.passageText;
  const reading = {
    title: block.title,
    passageText,
    wordCount: wordCount(passageText),
    sourcePartId: part?.id || null,
  };
  if (block.subtitle) reading.subtitle = block.subtitle;
  if (block.instruction) reading.instruction = block.instruction;
  return reading;
}

module.exports = {
  wordCount,
  extractTextosPassageBlock,
  toTextosReadingPayload,
};
