/**
 * Official Goethe exam cell layout per CEFR level (assemble + publish).
 */
import { normalizeLevel } from './batchPaths.mjs';

export const ASSEMBLE_LAYOUT = Object.freeze({
  B1: Object.freeze({
    lesen: [1, 2, 3, 4, 5],
    horen: [1, 2, 3, 4],
    schreibenTeils: [1, 2, 3],
    sprechenTeils: [1, 2, 3],
  }),
  A2: Object.freeze({
    lesen: [1, 2, 3, 4],
    horen: [1, 2, 3, 4],
    schreibenTeils: [1, 2],
    sprechenTeils: [1, 2, 3],
  }),
  B2: Object.freeze({
    lesen: [1, 2, 3, 4, 5],
    horen: [1, 2, 3, 4],
    schreibenTeils: [1, 2],
    sprechenTeils: [1, 2],
  }),
  C1: Object.freeze({
    lesen: [1, 2, 3, 4],
    horen: [1, 2, 3, 4],
    schreibenTeils: [1, 2],
    sprechenTeils: [1, 2],
  }),
});

/** True when level has its own entry (not the B1 fallback in layoutForLevel). */
export function hasExplicitAssembleLayout(level = 'B1') {
  const lv = normalizeLevel(level);
  return Object.prototype.hasOwnProperty.call(ASSEMBLE_LAYOUT, lv);
}

export function layoutForLevel(level = 'B1') {
  const lv = normalizeLevel(level);
  return ASSEMBLE_LAYOUT[lv] || ASSEMBLE_LAYOUT.B1;
}

export function lesenCellKeys(level = 'B1') {
  return layoutForLevel(level).lesen.map((t) => `lesen_${t}`);
}

export function horenCellKeys(level = 'B1') {
  return layoutForLevel(level).horen.map((t) => `horen_${t}`);
}

export function mcqCellKeys(level = 'B1') {
  return [...lesenCellKeys(level), ...horenCellKeys(level)];
}

export function oralCellKeys(module, level = 'B1') {
  const layout = layoutForLevel(level);
  const teils = module === 'schreiben' ? layout.schreibenTeils : layout.sprechenTeils;
  return teils.map((t) => `${module}_${t}`);
}

export function allAssembleCellKeys(level = 'B1') {
  const layout = layoutForLevel(level);
  return [
    ...layout.lesen.map((t) => `lesen_${t}`),
    ...layout.horen.map((t) => `horen_${t}`),
    ...layout.schreibenTeils.map((t) => `schreiben_${t}`),
    ...layout.sprechenTeils.map((t) => `sprechen_${t}`),
  ];
}

export function fileResForLevel(level = 'B1') {
  const layout = layoutForLevel(level);
  const re = {};
  for (const t of layout.lesen) re[`lesen_${t}`] = new RegExp(`^lesen-t${t}-.*\\.json$`, 'i');
  for (const t of layout.horen) re[`horen_${t}`] = new RegExp(`^horen-t${t}-.*\\.json$`, 'i');
  return re;
}

export function buildExamPartsFromPicked(picked, level = 'B1') {
  const layout = layoutForLevel(level);
  return {
    lesenParts: layout.lesen.map((t) => picked[`lesen_${t}`].part),
    horenParts: layout.horen.map((t) => picked[`horen_${t}`].part),
    schreibenParts: layout.schreibenTeils.map((t) => picked[`schreiben_${t}`].part),
    sprechenParts: layout.sprechenTeils.map((t) => picked[`sprechen_${t}`].part),
  };
}

export function expectedOralPartCount(module, level = 'B1') {
  const layout = layoutForLevel(level);
  return module === 'schreiben' ? layout.schreibenTeils.length : layout.sprechenTeils.length;
}

export function oralTeilsForLevel(module, level = 'B1') {
  const layout = layoutForLevel(level);
  return module === 'schreiben' ? [...layout.schreibenTeils] : [...layout.sprechenTeils];
}

export function isAutoPublishLevelSupported(lang, level) {
  const l = String(lang || 'de').toLowerCase();
  const lv = normalizeLevel(level);
  return l === 'de' && (lv === 'B1' || lv === 'A2');
}
