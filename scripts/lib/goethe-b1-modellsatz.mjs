/**
 * Goethe-Zertifikat B1 Modellsatz — official item counts (Sprint 1).
 * Lesen: 6 + 6 + 7 + 7 + 4 = 30
 * Hören: 6 + 6 + 7 + 8 = 27 (scorable listening items; Schreiben/Sprechen separate)
 */
export const GOETHE_B1_MODELSATZ = Object.freeze({
  lesen: [6, 6, 7, 7, 4],
  horen: [6, 6, 7, 8],
  lesenTotal: 30,
  horenTotal: 27,
});

export const GOETHE_B1_INSTRUCTIONS = Object.freeze({
  lesen: [
    'Lesen Sie den Text und die Aufgaben 1 bis 6 dazu.\nSchreiben Sie: Richtig oder Falsch.',
    'Lesen Sie den Text aus der Presse und die Aufgaben 7 bis 12 dazu.\nWählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
    'Lesen Sie die Situationen 13 bis 19 und die Anzeigen a bis f.\nWelche Anzeige passt?\nSie können jede Anzeige nur einmal verwenden.\nEine Anzeige passt nicht.',
    'Lesen Sie die Meinungen 20 bis 26 und die Überschriften a bis g.\nWelche Überschrift passt zu welcher Meinung?\nOrdnen Sie zu.',
    'Lesen Sie den Text und die Aufgaben 27 bis 30 dazu.\nWählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
  ],
  horen: [
    'Hören Sie zwei kurze Texte.\nSie hören jeden Text zweimal.\nEntscheiden Sie beim Hören: Richtig oder Falsch.',
    'Hören Sie einen Text.\nSie hören den Text einmal.\nWählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
    'Hören Sie ein Gespräch.\nSie hören das Gespräch einmal.\nEntscheiden Sie beim Hören: Richtig oder Falsch.',
    'Hören Sie eine Diskussion.\nSie hören die Diskussion zweimal.\nOrdnen Sie die Aussagen zu: Wer sagt was?',
  ],
});

export function assertModellsatzCounts(blueprint) {
  const issues = [];
  if (!blueprint || blueprint.id !== 'goethe-b1') {
    issues.push('not_goethe_b1');
    return { ok: false, issues };
  }

  const lesen = blueprint.modules?.find((m) => m.id === 'lesen');
  const horen = blueprint.modules?.find((m) => m.id === 'horen');
  const lesenCounts = (lesen?.parts || []).map((p) => p.itemsTotal ?? p.questionsTotal?.min);
  const horenCounts = (horen?.parts || []).map((p) => p.itemsTotal ?? p.questionsTotal?.min);

  for (let i = 0; i < GOETHE_B1_MODELSATZ.lesen.length; i++) {
    if (lesenCounts[i] !== GOETHE_B1_MODELSATZ.lesen[i]) {
      issues.push(`lesen_teil${i + 1}:${lesenCounts[i] ?? '?'}!=${GOETHE_B1_MODELSATZ.lesen[i]}`);
    }
  }
  for (let i = 0; i < GOETHE_B1_MODELSATZ.horen.length; i++) {
    if (horenCounts[i] !== GOETHE_B1_MODELSATZ.horen[i]) {
      issues.push(`horen_teil${i + 1}:${horenCounts[i] ?? '?'}!=${GOETHE_B1_MODELSATZ.horen[i]}`);
    }
  }

  const lesenSum = lesenCounts.reduce((s, n) => s + (n || 0), 0);
  const horenSum = horenCounts.reduce((s, n) => s + (n || 0), 0);
  if (lesenSum !== GOETHE_B1_MODELSATZ.lesenTotal) issues.push(`lesen_total:${lesenSum}`);
  if (horenSum !== GOETHE_B1_MODELSATZ.horenTotal) issues.push(`horen_total:${horenSum}`);

  return { ok: issues.length === 0, issues, lesenCounts, horenCounts };
}
