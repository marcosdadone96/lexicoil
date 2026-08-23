/**
 * Shared answer-key renderability checks — used by examRunner, results, AnswerKeyVerifier.
 */
function optKey(opt) {
  if (opt && typeof opt === 'object') {
    const raw = opt.key != null ? opt.key : opt.id;
    if (raw != null) {
      const k = String(raw).trim().replace(/^\s*([a-zA-Z0-9]+)\)\s*/, '$1');
      return k.length === 1 ? k.toUpperCase() : k.toLowerCase();
    }
    return String(opt.text ?? opt.label ?? '').slice(0, 1).toUpperCase();
  }
  if (typeof opt !== 'string') return String(opt ?? '');
  if (opt.length === 1) return opt.toUpperCase();
  const m = opt.match(/^([A-Za-z0-9])\)?\s*/);
  if (m && (opt.includes(')') || opt.includes('=') || /^[A-Da-d]\)/.test(opt))) return m[1].toUpperCase();
  return opt;
}

function normalizeGradingToken(val) {
  if (val == null || val === '') return '';
  const s = String(val).trim();
  const u = s.toLowerCase();
  if (u === 'ja' || u === 'j' || u === 'yes') return 'J';
  if (u === 'nein' || u === 'n' || u === 'no') return 'N';
  if (u === 'richtig' || u === 'r' || u === 'true' || u === 't') return 'R';
  if (u === 'falsch' || u === 'f' || u === 'false') return 'F';
  return s.toLowerCase();
}

function pictureBankKeys(part) {
  const segs = part?.segments || [];
  const pics = segs[0]?.pictures || part?.pictures || [];
  if (!Array.isArray(pics) || !pics.length) return [];
  return pics.map((p, i) => {
    if (p && typeof p === 'object' && p.key != null) {
      return String(p.key).trim().toLowerCase();
    }
    if (typeof p === 'string') {
      const m = p.match(/^([a-i])\)/i);
      if (m) return m[1].toLowerCase();
    }
    return String.fromCharCode(97 + i);
  });
}

function getRenderableAnswerKeys(q, part) {
  const type = String(q?.type || q?.questionType || '').toLowerCase();
  if (type === 'yn' || type === 'ja_nein') return ['J', 'N'];
  if (type === 'rfn' || type === 'r_f_n') return ['R', 'F', 'N'];
  if (type === 'rf' || type === 'tf' || type === 'richtig_falsch' || type === 'true_false') return ['R', 'F'];
  if (type === 'gap_fill' || type === 'gap') {
    return (part?.options || []).map((o) => normalizeGradingToken(o.key)).filter(Boolean);
  }
  if (type === 'person_multi') return (q.options || []).map((o) => String(o));
  if (type === 'matching' || type === 'match') {
    let opts = q.options || [];
    const picKeys = pictureBankKeys(part);
    if (q._keyOnlyMatch || (!opts.length && picKeys.length >= 2)) {
      if (opts.length) return opts.map((o) => optKey(o)).filter(Boolean);
      return picKeys;
    }
    if (part?.ads?.length >= 2 && !opts.length) {
      opts = part.ads.map((a, i) => ({
        key: String(a.key || String.fromCharCode(65 + i)).toUpperCase(),
      }));
      if (!opts.some((o) => String(optKey(o)) === '0')) opts.push({ key: '0' });
    }
    const keys = (q._keyOnlyMatch || (type === 'matching' && opts.length)
      ? opts.map((o) => optKey(o)).filter((k) => k != null && k !== '')
      : opts.map((o) => optKey(o)).filter(Boolean));
    if (
      !q._keyOnlyMatch &&
      (part?.ads?.length >= 2 || opts.length >= 8) &&
      !keys.some((k) => String(k).toUpperCase() === '0')
    ) {
      keys.push('0');
    }
    return keys;
  }
  const opts = q.options || [];
  if (!opts.length) return [];
  return opts.map((o) => optKey(o)).filter(Boolean);
}

function isAnswerKeyRenderable(q, part) {
  const correct = q?.correct ?? q?.correctAnswer;
  if (correct == null || correct === '') return false;
  if (Array.isArray(correct)) {
    if (correct.length !== 1) return false;
    return isAnswerKeyRenderable({ ...q, correct: correct[0] }, part);
  }
  const keys = getRenderableAnswerKeys(q, part);
  if (!keys.length) {
    const type = String(q?.type || '').toLowerCase();
    // A gap_fill with no option pool is free text by design — Cambridge Reading Part 6 is
    // open cloze and Listening Part 3 is sentence completion, and in both the candidate
    // writes the word instead of picking one. The key IS that word, so it is perfectly
    // renderable. Reading "no pool" as "unscorable" silently dropped those 12 items from
    // every English exam: a fully correct paper came back as 45 of 45 with a data-error
    // notice, and the two open parts never counted.
    if (type === 'gap_fill' || type === 'gap') return String(correct).trim() !== '';
    return ['yn', 'ja_nein', 'rfn', 'r_f_n', 'rf', 'tf', 'richtig_falsch', 'true_false'].includes(type);
  }
  const ck = normalizeGradingToken(correct);
  return keys.some((k) => normalizeGradingToken(k) === ck);
}

const isAnswerKeyRenderableExports = {
  optKey,
  normalizeGradingToken,
  getRenderableAnswerKeys,
  isAnswerKeyRenderable,
};

if (typeof module !== 'undefined') module.exports = isAnswerKeyRenderableExports;
if (typeof window !== 'undefined') window.IsAnswerKeyRenderable = isAnswerKeyRenderableExports;
if (typeof globalThis !== 'undefined') globalThis.IsAnswerKeyRenderable = isAnswerKeyRenderableExports;
