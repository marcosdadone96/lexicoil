/**
 * Cross-exam passage deduplication for a served level.
 * Fails when two exams share passageId or passage text is > threshold similar.
 */

const DEFAULT_THRESHOLD = 0.85;

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(text) {
  const t = normalizeText(text);
  if (t.length < 2) return new Set(t ? [t] : []);
  const set = new Set();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}

/** Jaccard similarity on character bigrams (0–1). */
export function textSimilarity(a, b) {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ba = bigrams(na);
  const bb = bigrams(nb);
  if (!ba.size || !bb.size) return na === nb ? 1 : 0;
  let inter = 0;
  for (const g of ba) if (bb.has(g)) inter += 1;
  return inter / (ba.size + bb.size - inter);
}

function pushPassage(out, seen, examId, examLabel, module, teil, passageId, text, kind) {
  const t = String(text || '').trim();
  const pid = passageId ? String(passageId).trim() : '';
  if (!t && !pid) return;
  const key = `${examId}::${module}::${teil}::${kind}::${pid || t.slice(0, 40)}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({
    examId,
    examLabel,
    module,
    teil,
    passageId: pid || null,
    text: t,
    kind,
  });
}

/** Collect reading/listening passages from one exam. */
export function collectPassagesFromExam(exam, examId, examLabel = examId) {
  const passages = [];
  const seen = new Set();

  for (const p of exam.lesenParts || []) {
    const teil = p.teil ?? '?';
    if (p.text) pushPassage(passages, seen, examId, examLabel, 'lesen', teil, p.passageId, p.text, 'text');
    for (const pp of p.passages || []) {
      pushPassage(
        passages,
        seen,
        examId,
        examLabel,
        'lesen',
        teil,
        pp.passageId || pp.id,
        pp.text,
        'passages[]',
      );
    }
    for (const ad of p.ads || []) {
      const txt = typeof ad === 'string' ? ad : ad?.text || ad?.title || '';
      if (txt) pushPassage(passages, seen, examId, examLabel, 'lesen', teil, null, txt, 'ad');
    }
  }

  for (const p of exam.horenParts || []) {
    const teil = p.teil ?? '?';
    if (p.transcript) {
      pushPassage(passages, seen, examId, examLabel, 'horen', teil, p.passageId, p.transcript, 'transcript');
    }
    for (const seg of p.segments || []) {
      pushPassage(
        passages,
        seen,
        examId,
        examLabel,
        'horen',
        teil,
        seg.passageId,
        seg.transcript,
        'segment',
      );
    }
  }

  return passages;
}

/**
 * @param {Array<{ id: string, exam: object, label?: string }>} exams
 * @param {{ threshold?: number }} opts
 */
export function validateCrossExamPassageUniqueness(exams, opts = {}) {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const violations = [];
  const all = [];

  for (const { id, exam, label } of exams) {
    const examLabel = label || id;
    for (const p of collectPassagesFromExam(exam, id, examLabel)) {
      all.push(p);
    }
  }

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      if (a.examId === b.examId) continue;

      if (a.passageId && b.passageId && a.passageId === b.passageId) {
        violations.push({
          type: 'duplicate_passageId',
          passageId: a.passageId,
          examA: a.examLabel,
          examB: b.examLabel,
          moduleA: `${a.module} T${a.teil}`,
          moduleB: `${b.module} T${b.teil}`,
          message: `duplicate passageId "${a.passageId}" between ${a.examLabel} and ${b.examLabel}`,
        });
        continue;
      }

      if (!a.text || !b.text) continue;
      const sim = textSimilarity(a.text, b.text);
      if (sim > threshold) {
        violations.push({
          type: 'similar_passage_text',
          similarity: Math.round(sim * 1000) / 1000,
          examA: a.examLabel,
          examB: b.examLabel,
          moduleA: `${a.module} T${a.teil}`,
          moduleB: `${b.module} T${b.teil}`,
          passageIdA: a.passageId,
          passageIdB: b.passageId,
          message: `passage text ${Math.round(sim * 100)}% similar between ${a.examLabel} (${a.module} T${a.teil}) and ${b.examLabel} (${b.module} T${b.teil})`,
        });
      }
    }
  }

  return {
    ok: violations.length === 0,
    threshold,
    passageCount: all.length,
    violations,
  };
}

export function formatPassageDedupeReport(result) {
  const lines = [];
  if (result.ok) {
    lines.push(`   OK — ${result.passageCount} passage(s), no cross-exam duplicates (>${Math.round(result.threshold * 100)}% text)`);
    return lines;
  }
  lines.push(`   FAIL — ${result.violations.length} cross-exam passage duplicate(s)`);
  for (const v of result.violations.slice(0, 12)) {
    lines.push(`       - ${v.message}`);
  }
  if (result.violations.length > 12) {
    lines.push(`       … +${result.violations.length - 12} more`);
  }
  return lines;
}
