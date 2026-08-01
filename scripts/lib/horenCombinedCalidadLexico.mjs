/** Hören Teile that run calidad + léxico in one pass (same as B1 T1/T3/T4). */
const HOREN_COMBINED_B1 = new Set([1, 3, 4]);
const HOREN_COMBINED_A2 = new Set([1, 3, 4]);

export function isHorenCombinedCalidadLexicoTeil(teil, level = 'B1') {
  const t = Number(teil);
  const lv = String(level || 'B1').trim().toUpperCase();
  const set = lv === 'A2' ? HOREN_COMBINED_A2 : HOREN_COMBINED_B1;
  return set.has(t);
}
