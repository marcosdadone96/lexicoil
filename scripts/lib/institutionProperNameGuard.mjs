/**
 * Restore institution / document proper-name casing after decap heuristics.
 */
function escapeRe(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @param {object} batch */
export function collectDocumentProperNames(batch) {
  const names = new Set();
  const add = (s) => {
    const t = String(s || '').trim();
    if (t.length >= 4) names.add(t);
  };
  add(batch._t5InstitutionSeed);
  add(batch._mandatedTitle);
  add(batch.passages?.[0]?.title);
  const seed = batch._t5InstitutionSeed;
  if (seed) {
    for (const w of seed.split(/\s+/)) {
      if (/^[A-ZÄÖÜ]/.test(w) && w.length >= 2) names.add(w);
    }
  }
  return [...names].sort((a, b) => b.length - a.length);
}

/** Case-insensitive replace with canonical form from document. */
export function restoreProperNamesInText(text, names) {
  if (!text || !names?.length) return text;
  let out = text;
  for (const name of names) {
    const re = new RegExp(name.split(/\s+/).map(escapeRe).join('\\s+'), 'gi');
    out = out.replace(re, name);
  }
  return out;
}

export function restoreProperNamesInBatch(batch, names) {
  if (!names?.length) return batch;
  const fix = (s) => (typeof s === 'string' ? restoreProperNamesInText(s, names) : s);
  const out = { ...batch };
  if (out.passages) {
    out.passages = out.passages.map((p) => ({
      ...p,
      title: fix(p.title),
      text: fix(p.text),
    }));
  }
  if (out.questions) {
    out.questions = out.questions.map((q) => ({
      ...q,
      question: fix(q.question),
      explanation: fix(q.explanation),
      signText: fix(q.signText),
      options: Array.isArray(q.options) ? q.options.map(fix) : q.options,
    }));
  }
  return out;
}
