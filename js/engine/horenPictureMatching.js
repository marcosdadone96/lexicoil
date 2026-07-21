/**
 * Hören A2 Teil 2 — picture_matching (emoji + label, shared bank a–i).
 * Browser: window.HorenPictureMatching · Node: module.exports
 */
const HorenPictureMatching = (() => {
  const PICTURE_KEYS_A2 = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
  const WEEKDAY_LABELS_DE = Object.freeze([
    'Montag',
    'Dienstag',
    'Mittwoch',
    'Donnerstag',
    'Freitag',
  ]);

  function normLevel(level) {
    return String(level || 'B1').trim().toUpperCase();
  }

  function isPictureMatchingCtx(ctx = {}) {
    const mod = String(ctx.module || '').toLowerCase();
    const teil = Number(ctx.teil);
    return mod === 'horen' && teil === 2 && normLevel(ctx.level) === 'A2';
  }

  function isPictureMatchingPart(part) {
    if (!part) return false;
    const slot = String(part.blueprintSlot || part.slotType || '').toLowerCase();
    if (slot.includes('picture_matching') || slot.includes('picture_schedule')) return true;
    const segs = part.segments || [];
    return segs.some((s) => Array.isArray(s.pictures) && s.pictures.length >= 9);
  }

  function normalizePictureEntry(raw, index = 0) {
    if (!raw) return null;
    if (typeof raw === 'string') {
      const m = String(raw).match(/^([a-i])\)\s*(.+)$/i);
      if (m) {
        const body = m[2].trim();
        const iconMatch = body.match(/^(\p{Extended_Pictographic})\s*(.*)$/u);
        if (iconMatch) {
          return { key: m[1].toLowerCase(), icon: iconMatch[1], label: iconMatch[2].trim() || body };
        }
        return { key: m[1].toLowerCase(), icon: '', label: body };
      }
      return { key: PICTURE_KEYS_A2[index] || 'a', icon: '', label: String(raw).trim() };
    }
    if (typeof raw === 'object') {
      const key = String(raw.key ?? raw.letter ?? PICTURE_KEYS_A2[index] ?? 'a')
        .trim()
        .toLowerCase();
      return {
        key,
        icon: String(raw.icon ?? raw.emoji ?? '').trim(),
        label: String(raw.label ?? raw.text ?? raw.title ?? '').trim(),
      };
    }
    return null;
  }

  function normalizePicturesBank(raw) {
    const src = Array.isArray(raw) ? raw : [];
    const out = [];
    const seen = new Set();
    for (let i = 0; i < src.length; i++) {
      const entry = normalizePictureEntry(src[i], i);
      if (!entry || !entry.key) continue;
      if (seen.has(entry.key)) continue;
      seen.add(entry.key);
      out.push(entry);
    }
    out.sort((a, b) => PICTURE_KEYS_A2.indexOf(a.key) - PICTURE_KEYS_A2.indexOf(b.key));
    return out;
  }

  function extractCorrectKey(q) {
    const raw = q?.correctAnswer ?? q?.correct;
    if (raw == null || raw === '') return null;
    return String(raw).trim().toLowerCase();
  }

  function validateUniquePictureKeys(questions, { allowKeys = PICTURE_KEYS_A2 } = {}) {
    const issues = [];
    const used = new Map();
    const allowed = new Set(allowKeys);
    for (const q of questions || []) {
      const k = extractCorrectKey(q);
      if (!k) {
        issues.push(`${q?.id || '?'}: falta correct (letra a–i)`);
        continue;
      }
      if (!allowed.has(k)) {
        issues.push(`${q?.id || '?'}: correct "${k}" no es letra a–i`);
      }
      if (used.has(k)) {
        issues.push(`letra duplicada: "${k}" en ${q?.id || '?'} y ${used.get(k)}`);
      } else {
        used.set(k, q?.id || '?');
      }
    }
    return issues;
  }

  function validatePicturesBank(pictures) {
    const issues = [];
    const bank = normalizePicturesBank(pictures);
    if (bank.length !== 9) {
      issues.push(`se esperan 9 actividades (a–i), hay ${bank.length}`);
    }
    for (let i = 0; i < PICTURE_KEYS_A2.length; i++) {
      const exp = PICTURE_KEYS_A2[i];
      const found = bank.find((p) => p.key === exp);
      if (!found) issues.push(`falta actividad "${exp}"`);
      else if (!found.label) issues.push(`actividad "${exp}" sin label`);
    }
    return issues;
  }

  function normalizePictureMatchingQuestion(q) {
    if (!q || typeof q !== 'object') return q;
    const out = { ...q };
    out.type = 'matching';
    const key = extractCorrectKey(out);
    if (key) {
      out.correct = key;
      out.correctAnswer = key;
    }
    delete out.options;
    delete out.choices;
    out._keyOnlyMatch = true;
    return out;
  }

  function hoistPicturesToPassage(batch) {
    const passages = [...(batch.passages || [])];
    if (!passages.length) return batch;
    const rootPics = batch.pictures;
    const p0 = { ...passages[0] };
    if (!p0.pictures?.length && rootPics?.length) p0.pictures = rootPics;
    passages[0] = p0;
    const next = { ...batch, passages };
    delete next.pictures;
    return next;
  }

  function normalizePictureMatchingBatch(batch, ctx = {}) {
    if (!isPictureMatchingCtx(ctx) || !batch) return batch;
    let out = hoistPicturesToPassage(batch);
    const passage = out.passages?.[0];
    if (passage) {
      const pics = normalizePicturesBank(passage.pictures || out.pictures);
      out.passages = [{ ...passage, pictures: pics }];
    }
    out.questions = (out.questions || []).map((q) => normalizePictureMatchingQuestion(q));
    return out;
  }

  function validatePictureMatchingBatch(batch, ctx = {}) {
    if (!isPictureMatchingCtx(ctx)) return [];
    const issues = [];
    const passages = batch?.passages || [];
    if (passages.length !== 1) {
      issues.push(`Hören A2 T2: se espera 1 passage, hay ${passages.length}`);
    }
    const passage = passages[0];
    if (!passage?.text && !passage?.transcript) {
      issues.push('Hören A2 T2: falta transcripción (passage.text)');
    }
    issues.push(...validatePicturesBank(passage?.pictures));
    const qs = batch?.questions || [];
    if (qs.length !== 5) {
      issues.push(`Hören A2 T2: se requieren 5 preguntas (días), hay ${qs.length}`);
    }
    for (const q of qs) {
      if (String(q.type || '').toLowerCase() !== 'matching') {
        issues.push(`${q.id}: type debe ser matching`);
      }
      if ((q.options || []).length) {
        issues.push(`${q.id}: no debe tener options (banco compartido en pictures[])`);
      }
    }
    issues.push(...validateUniquePictureKeys(qs));
    const weekdays = qs.map((q) => String(q.question || '').trim());
    const missingDay = WEEKDAY_LABELS_DE.filter((d) => !weekdays.includes(d));
    if (missingDay.length) {
      issues.push(`preguntas deben ser días: faltan ${missingDay.join(', ')}`);
    }
    return issues;
  }

  function applyPicturesToHorenSegment(seg, pictures) {
    if (!seg) return seg;
    const pics = normalizePicturesBank(pictures || seg.pictures);
    const questions = (seg.questions || []).map((q) => normalizePictureMatchingQuestion(q));
    return { ...seg, pictures: pics, questions };
  }

  return {
    PICTURE_KEYS_A2,
    WEEKDAY_LABELS_DE,
    normLevel,
    isPictureMatchingCtx,
    isPictureMatchingPart,
    normalizePictureEntry,
    normalizePicturesBank,
    extractCorrectKey,
    validateUniquePictureKeys,
    validatePicturesBank,
    normalizePictureMatchingQuestion,
    normalizePictureMatchingBatch,
    validatePictureMatchingBatch,
    applyPicturesToHorenSegment,
  };
})();

if (typeof window !== 'undefined') window.HorenPictureMatching = HorenPictureMatching;
if (typeof module !== 'undefined') module.exports = HorenPictureMatching;
