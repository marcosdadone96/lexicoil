/**
 * Lesen passage integrity — personal/runtime AI generation (Teil 2 dual press texts).
 * Does not alter curated exam pool gates when used only from personal delivery paths.
 */

function normPassageId(id) {
  return String(id || '')
    .trim()
    .toUpperCase()
    .replace(/^TEXT\s*/i, '');
}

function passageTextById(part, passageId) {
  if (!part || passageId == null || passageId === '') return '';
  const want = normPassageId(passageId);
  for (const p of part.passages || []) {
    const pid = normPassageId(typeof p === 'object' ? p.passageId || p.id : null);
    if (pid && pid === want) {
      const t = typeof p === 'string' ? p : p?.text || '';
      if (String(t).trim()) return String(t).trim();
    }
  }
  if (want === 'A' && part.text?.trim()) return part.text.trim();
  if (want === 'B') {
    const alt = part.textB || part.text2 || part.secondText;
    if (String(alt || '').trim()) return String(alt).trim();
  }
  return '';
}

function collectPassageIdsFromQuestions(part) {
  const ids = new Set();
  const walk = (q) => {
    if (!q) return;
    const pid = q.passageId || q.context?.passageId;
    if (pid != null && pid !== '') ids.add(normPassageId(pid));
  };
  (part.questions || []).forEach(walk);
  (part.items || []).forEach(walk);
  return ids;
}

function isLesenT2DualPressPart(part) {
  if (!part || Number(part.teil) !== 2) return false;
  const slot = String(part.blueprintSlot || part.slotType || '').toLowerCase();
  return slot.includes('press') || slot.includes('mcq') || slot === 'press_mcq';
}

/**
 * Normalize Teil 2 from a valid passages[] array — never invent ghost Text B.
 */
function normalizeLesenT2FromPassages(part) {
  if (!isLesenT2DualPressPart(part)) return part;
  const passages = (part.passages || []).filter((p) => {
    const t = typeof p === 'string' ? p : p?.text;
    return String(t || '').trim();
  });
  if (passages.length < 2) return part;
  part.passages = passages.map((p, i) => {
    if (typeof p === 'string') {
      return { passageId: i === 0 ? 'A' : 'B', text: p, textTitle: i === 0 ? 'Text A' : 'Text B' };
    }
    return {
      passageId: normPassageId(p.passageId || p.id) || (i === 0 ? 'A' : 'B'),
      textTitle: p.textTitle || p.title || (i === 0 ? 'Text A' : 'Text B'),
      text: String(p.text || '').trim(),
    };
  });
  const a = part.passages.find((p) => normPassageId(p.passageId) === 'A');
  const b = part.passages.find((p) => normPassageId(p.passageId) === 'B');
  if (a?.text) {
    part.text = a.text;
    part.textTitle = a.textTitle || part.textTitle;
  }
  if (b?.text) {
    part.textB = b.text;
    part.textTitleB = b.textTitle;
  }
  delete part.text2;
  delete part.secondText;
  return part;
}

/**
 * @returns {string[]} hard errors — missing passage text for referenced passageId
 */
function validateLesenT2PassageIntegrity(part, partLabel = 'lesen:teil=2') {
  if (!isLesenT2DualPressPart(part)) return [];
  const errors = [];
  const referenced = collectPassageIdsFromQuestions(part);
  const withText = new Set();
  for (const pid of ['A', 'B', ...(part.passages || []).map((p) => normPassageId(p.passageId || p.id))]) {
    if (!pid) continue;
    if (passageTextById(part, pid)) withText.add(pid);
  }
  for (const pid of referenced) {
    if (!passageTextById(part, pid)) {
      errors.push(`passage_text_missing:${partLabel},passageId=${pid}`);
    }
  }
  if (!withText.has('A') || !withText.has('B')) {
    if (!errors.some((e) => e.includes('passage_text_missing'))) {
      errors.push(`passages_incomplete:${partLabel},expected=2,received=${withText.size}`);
    }
  }
  const qs = part.questions || [];
  if (qs.length >= 6) {
    const aCount = qs.filter((q) => normPassageId(q.passageId || q.context?.passageId) === 'A').length;
    const bCount = qs.filter((q) => normPassageId(q.passageId || q.context?.passageId) === 'B').length;
    if (aCount !== 3 || bCount !== 3) {
      errors.push(`passage_question_split:${partLabel},expected=A3+B3,received=A${aCount}+B${bCount}`);
    }
  }
  return errors;
}

function lesenT2PartIsValid(part) {
  normalizeLesenT2FromPassages(part);
  return validateLesenT2PassageIntegrity(part).length === 0;
}

const LesenPassageIntegrity = Object.freeze({
  normPassageId,
  passageTextById,
  isLesenT2DualPressPart,
  normalizeLesenT2FromPassages,
  validateLesenT2PassageIntegrity,
  lesenT2PartIsValid,
});

if (typeof window !== 'undefined') window.LesenPassageIntegrity = LesenPassageIntegrity;
if (typeof module !== 'undefined') module.exports = LesenPassageIntegrity;
