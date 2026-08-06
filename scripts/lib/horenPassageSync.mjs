/**
 * horenPassageSync.mjs — writer contract for Hören passage edits.
 *
 * Invariant (same spirit as assertBalanceMcqWriterContract §8.3):
 *  (a) If passages[].audio[] exists, every audio[i].text must appear as a
 *      contiguous substring of passages[].text (dialogue / TTS sync).
 *  (b) If a question explanation quotes a passage phrase (ASCII/curly quotes
 *      or high contiguous overlap ≥ MIN_QUOTE_LEN), that quote must still
 *      occur in passages[].text — else mark for resync.
 *
 * Call assertHorenPassageSyncContract(before, after) BEFORE persisting edits
 * that touch passages[].text / audio[] / explanations.
 */

export const HOREN_PASSAGE_SYNC_VERSION = 'v1.0-text-audio-expl-2026-07-12';

const MIN_QUOTE_LEN = 12;
const QUOTE_RE = /["„«»""]([^"„«»""]{12,160})["„«»""]/g;

function passageBlob(passage) {
  return String(passage?.text || '');
}

function collectQuotedPhrases(text) {
  const out = [];
  const s = String(text || '');
  let m;
  const re = new RegExp(QUOTE_RE.source, 'g');
  while ((m = re.exec(s))) out.push(m[1].trim());
  return out;
}

/**
 * @returns {{ ok: boolean, violations: Array<{ code: string, detail: string }> }}
 */
export function checkHorenPassageSync(batch) {
  const violations = [];
  if (!batch || typeof batch !== 'object') {
    return { ok: true, violations };
  }

  for (let pi = 0; pi < (batch.passages || []).length; pi++) {
    const p = batch.passages[pi];
    const text = passageBlob(p);
    const textNorm = text.replace(/\s+/g, ' ');

    if (Array.isArray(p.audio) && p.audio.length) {
      p.audio.forEach((turn, ti) => {
        const at = String(turn?.text || '').trim();
        if (!at) return;
        const atNorm = at.replace(/\s+/g, ' ');
        if (!textNorm.includes(atNorm) && !text.includes(at)) {
          violations.push({
            code: 'audio_text_desync',
            detail: `passages[${pi}].audio[${ti}] not found in passages[${pi}].text: ${at.slice(0, 80)}`,
          });
        }
      });
    }
  }

  const allPassageText = (batch.passages || []).map(passageBlob).join('\n');
  for (const q of batch.questions || []) {
    const expl = String(q.explanation || '');
    for (const quote of collectQuotedPhrases(expl)) {
      if (quote.length < MIN_QUOTE_LEN) continue;
      if (!allPassageText.includes(quote)) {
        // High-overlap fallback: first 40 chars
        const head = quote.slice(0, 40);
        if (!allPassageText.includes(head)) {
          violations.push({
            code: 'explanation_quote_desync',
            detail: `q[${q.id}] quotes missing from passage: «${quote.slice(0, 80)}»`,
          });
        }
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * @throws {Error} on violation
 */
export function assertHorenPassageSyncContract(beforeBatch, afterBatch, opts = {}) {
  const label = opts.label || 'horenPassageSync';

  // Absolute: audio segments must remain substrings of passage text
  const afterAbs = checkHorenPassageSync(afterBatch);
  const audioViolations = afterAbs.violations.filter((v) => v.code === 'audio_text_desync');
  if (audioViolations.length) {
    throw new Error(
      `[${label}:contract] ${audioViolations.length} audio violation(s):\n` +
        audioViolations.map((v) => `  - ${v.code}: ${v.detail}`).join('\n'),
    );
  }

  // Explanation quotes: only flag regressions — quote was in before.text but missing after
  const beforeText = (beforeBatch?.passages || []).map((p) => String(p?.text || '')).join('\n');
  const afterText = (afterBatch?.passages || []).map((p) => String(p?.text || '')).join('\n');
  for (const q of afterBatch?.questions || []) {
    for (const quote of collectQuotedPhrases(String(q.explanation || ''))) {
      if (quote.length < MIN_QUOTE_LEN) continue;
      if (beforeText.includes(quote) && !afterText.includes(quote)) {
        throw new Error(
          `[${label}:contract:b] q[${q.id}] quote was in passage before edit but missing after: «${quote.slice(0, 80)}»`,
        );
      }
    }
  }

  // If text changed but audio did not while audio existed → likely forgot audio sync
  const beforePassages = beforeBatch?.passages || [];
  const afterPassages = afterBatch?.passages || [];
  for (let i = 0; i < Math.min(beforePassages.length, afterPassages.length); i++) {
    const bp = beforePassages[i];
    const ap = afterPassages[i];
    if (!Array.isArray(bp?.audio) || !bp.audio.length) continue;
    if (String(bp.text || '') === String(ap.text || '')) continue;
    const beforeAudio = JSON.stringify(bp.audio.map((t) => t?.text));
    const afterAudio = JSON.stringify((ap.audio || []).map((t) => t?.text));
    if (beforeAudio === afterAudio) {
      throw new Error(
        `[${label}:contract:a] passages[${i}].text changed but audio[] texts unchanged — resync TTS segments`,
      );
    }
  }
}

/**
 * Apply a string replace across passage text + matching audio turns + explanations.
 * Returns { batch, hits } — caller should assertHorenPassageSyncContract before write.
 */
export function replaceAcrossHorenPassageSync(batch, from, to) {
  const hits = [];
  const out = structuredClone(batch);
  for (const p of out.passages || []) {
    if (typeof p.text === 'string' && p.text.includes(from)) {
      p.text = p.text.split(from).join(to);
      hits.push({ field: 'passages.text', from, to });
    }
    if (Array.isArray(p.audio)) {
      for (const turn of p.audio) {
        if (typeof turn.text === 'string' && turn.text.includes(from)) {
          turn.text = turn.text.split(from).join(to);
          hits.push({ field: 'passages.audio.text', from, to });
        }
      }
    }
  }
  for (const q of out.questions || []) {
    if (typeof q.explanation === 'string' && q.explanation.includes(from)) {
      q.explanation = q.explanation.split(from).join(to);
      hits.push({ field: `questions[${q.id}].explanation`, from, to });
    }
    if (typeof q.question === 'string' && q.question.includes(from)) {
      q.question = q.question.split(from).join(to);
      hits.push({ field: `questions[${q.id}].question`, from, to });
    }
  }
  out._horenPassageSyncVersion = HOREN_PASSAGE_SYNC_VERSION;
  out._horenPassageSyncAt = new Date().toISOString();
  return { batch: out, hits };
}
