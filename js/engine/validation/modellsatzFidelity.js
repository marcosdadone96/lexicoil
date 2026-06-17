/**
 * Goethe B1 Modellsatz fidelity — Sprint 1.
 * Validates library/blueprints/goethe_B1.json item counts vs official Modellsatz.
 */
const GOETHE_B1_MODELSATZ = Object.freeze({
  lesen: [6, 6, 7, 7, 4],
  horen: [6, 6, 7, 8],
  lesenTotal: 30,
  horenTotal: 27,
});

function partItemCount(part) {
  return part?.itemsTotal ?? part?.questionsTotal?.min ?? part?.questionsTotal?.max ?? 0;
}

function checkGoetheB1Modellsatz(blueprint) {
  const issues = [];
  if (!blueprint || blueprint.id !== 'goethe-b1') {
    issues.push('not_goethe_b1');
    return { ok: false, issues };
  }

  const lesen = blueprint.modules?.find((m) => m.id === 'lesen');
  const horen = blueprint.modules?.find((m) => m.id === 'horen');
  const lesenCounts = (lesen?.parts || []).map(partItemCount);
  const horenCounts = (horen?.parts || []).map(partItemCount);

  GOETHE_B1_MODELSATZ.lesen.forEach((expected, i) => {
    if (lesenCounts[i] !== expected) {
      issues.push(`lesen_teil${i + 1}:${lesenCounts[i] ?? '?'}!=${expected}`);
    }
  });
  GOETHE_B1_MODELSATZ.horen.forEach((expected, i) => {
    if (horenCounts[i] !== expected) {
      issues.push(`horen_teil${i + 1}:${horenCounts[i] ?? '?'}!=${expected}`);
    }
  });

  const lesenSum = lesenCounts.reduce((s, n) => s + (n || 0), 0);
  const horenSum = horenCounts.reduce((s, n) => s + (n || 0), 0);
  if (lesenSum !== GOETHE_B1_MODELSATZ.lesenTotal) issues.push(`lesen_total:${lesenSum}`);
  if (horenSum !== GOETHE_B1_MODELSATZ.horenTotal) issues.push(`horen_total:${horenSum}`);

  const lesenSlots = (lesen?.parts || []).map((p) => p.slotType);
  if (lesenSlots[2] !== 'matching' || lesenSlots[4] !== 'mcq_texts') {
    issues.push(`lesen_slot_types:${lesenSlots.join(',')}`);
  }
  if (horenCounts.length !== 4) issues.push(`horen_parts:${horenCounts.length}`);

  return { ok: issues.length === 0, issues, lesenCounts, horenCounts };
}

if (typeof module !== 'undefined') {
  module.exports = { GOETHE_B1_MODELSATZ, checkGoetheB1Modellsatz, partItemCount };
}
if (typeof window !== 'undefined') {
  window.ModellsatzFidelity = { GOETHE_B1_MODELSATZ, checkGoetheB1Modellsatz, partItemCount };
}
