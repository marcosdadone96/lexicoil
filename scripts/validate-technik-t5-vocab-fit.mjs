#!/usr/bin/env node
/**
 * Valida mejora Technik×Lesen-T5: moldes compatibles y vocab×subtipo.
 *   node scripts/validate-technik-t5-vocab-fit.mjs
 */
import { listCompatibleT5Subtypes } from './lib/topicMoldCompatibility.mjs';
import { adaptT5WordsForSubtype, T5_SUBTYPE_VOCAB_POOL } from './lib/lesenT5SubtypeVocab.mjs';
import { LESEN_T5_SUBTYPES } from './lib/lesenSubtypeRotation.mjs';

const TECHNIK_WORDS = [
  'smartphone',
  'aufgabe',
  'situation',
  'aktuell',
  'direkt',
  'zukunft',
  'hobby',
  'nachhaltigkeit',
  'anmeldung',
  'vorteil',
];

const LEGACY_TECHNIK_SUBTYPES = ['bibliothek', 'schule', 'freizeitzentrum'];

function scoreSubtypeFit(words, subtypeId) {
  const pool = new Set((T5_SUBTYPE_VOCAB_POOL[subtypeId] || []).map((w) => w.toLowerCase()));
  const def = LESEN_T5_SUBTYPES.find((s) => s.id === subtypeId);
  let natural = 0;
  for (const w of words) {
    const lw = w.toLowerCase();
    if (pool.has(lw) || def?.keywords?.test(lw)) natural += 1;
  }
  const adapted = adaptT5WordsForSubtype(words, 'Technik', subtypeId);
  return {
    subtypeId,
    label: def?.label || subtypeId,
    naturalFitPct: Math.round((natural / words.length) * 100),
    adaptedWords: adapted.words,
    swaps: adapted.swapped,
  };
}

const compatible = listCompatibleT5Subtypes('Technik');
console.log('Technik×Lesen-T5 — moldes compatibles:', compatible.length);
console.log('  IDs:', compatible.join(', '));
console.log('  Legacy (pre-fix):', LEGACY_TECHNIK_SUBTYPES.join(', '), `→ ${LEGACY_TECHNIK_SUBTYPES.length} moldes\n`);

console.log('Ajuste vocab estimado por subtipo (palabras objetivo Technik típicas):');
const rows = compatible.map((id) => scoreSubtypeFit(TECHNIK_WORDS, id));
rows.sort((a, b) => b.naturalFitPct - a.naturalFitPct);

for (const r of rows) {
  console.log(
    `  ${r.subtypeId.padEnd(14)} ${String(r.naturalFitPct).padStart(3)}% natural · adaptado: ${r.adaptedWords.slice(0, 6).join(', ')}…`,
  );
}

const bestNew = rows.find((r) => ['coworking', 'leihgeraete', 'computerraum', 'fitness_app'].includes(r.subtypeId));
const legacyAvg =
  LEGACY_TECHNIK_SUBTYPES.map((id) => scoreSubtypeFit(TECHNIK_WORDS, id).naturalFitPct).reduce((a, b) => a + b, 0) /
  LEGACY_TECHNIK_SUBTYPES.length;

console.log(`\nPromedio legacy: ${Math.round(legacyAvg)}%`);
console.log(`Mejor subtipo tech-native: ${bestNew?.subtypeId} → ${bestNew?.naturalFitPct}%`);
console.log(
  bestNew && bestNew.naturalFitPct >= 60
    ? '✅ Método validado: subtipo tech-native supera umbral 60% en ajuste estimado.'
    : '⚠️  Ajuste estimado aún bajo — requiere generación real para confirmar integración en pasaje.',
);
