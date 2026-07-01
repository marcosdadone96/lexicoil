/**
 * partPostprocess — post-proceso DETERMINISTA para secciones generadas por IA,
 * para que salgan con la misma calidad que los exámenes completos.
 *
 *  - balanceAnswerPositions(questions): reparte la opción correcta entre A/B/C…
 *    (evita el "todo B"). Determinista: posición objetivo = i % nº de opciones.
 *  - validateAdsUnique(items): en Teil 3 (matching de anuncios) cada anuncio (clave
 *    distinta de "0") debe usarse como máximo una vez; devuelve los conflictos.
 *
 * Funciona con el formato de la app: options=[{key,text}], correct="B".
 */

function balanceAnswerPositions(questions) {
  if (!Array.isArray(questions)) return { changed: 0 };
  let changed = 0;
  let mcqIndex = 0;
  for (const q of questions) {
    const type = String(q.type || '').toLowerCase();
    if (type !== 'multiple_choice' && type !== 'multiple') continue;
    const opts = Array.isArray(q.options) ? q.options : null;
    if (!opts || opts.length < 2) continue;
    // Solo opciones tipo {key,text}
    if (typeof opts[0] !== 'object' || opts[0] == null) continue;

    const correctKey = Array.isArray(q.correct) ? q.correct[0] : q.correct;
    const correctIdx = opts.findIndex((o) => String(o.key) === String(correctKey));
    if (correctIdx < 0) continue;

    const targetIdx = mcqIndex % opts.length;
    mcqIndex++;
    if (targetIdx === correctIdx) continue; // ya está donde toca

    // Reordena: mueve el texto correcto a targetIdx, el resto conserva su orden relativo.
    const texts = opts.map((o) => o.text);
    const correctText = texts[correctIdx];
    const rest = texts.filter((_, i) => i !== correctIdx);
    const newTexts = [];
    let r = 0;
    for (let i = 0; i < opts.length; i++) {
      newTexts[i] = i === targetIdx ? correctText : rest[r++];
    }
    // Reasigna las mismas claves (A,B,C…) en orden a los textos reordenados.
    opts.forEach((o, i) => { o.text = newTexts[i]; });
    q.correct = String(opts[targetIdx].key);
    if (q.correctAnswer !== undefined) q.correctAnswer = q.correct;
    changed++;
  }
  return { changed };
}

function validateAdsUnique(items) {
  // items: array de matching (Teil 3). Cada item tiene correct = clave de anuncio.
  const used = new Map();
  const conflicts = [];
  (items || []).forEach((it) => {
    const k = String(Array.isArray(it.correct) ? it.correct[0] : it.correct);
    if (k === '0' || k === '' || k === 'undefined') return; // "0" (sin anuncio) puede repetirse
    if (used.has(k)) conflicts.push({ key: k, items: [used.get(k), it.itemNumber || it.id] });
    else used.set(k, it.itemNumber || it.id);
  });
  return { ok: conflicts.length === 0, conflicts };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { balanceAnswerPositions, validateAdsUnique };
}
if (typeof window !== 'undefined') {
  window.PartPostprocess = { balanceAnswerPositions, validateAdsUnique };
}
