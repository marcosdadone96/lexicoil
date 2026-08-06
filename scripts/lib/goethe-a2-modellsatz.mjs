/**
 * Goethe-Zertifikat A2 Modellsatz Erwachsene — official item counts.
 * Lesen: 5 + 5 + 5 + 5 = 20
 * Hören: 5 + 5 + 5 + 5 = 20
 * Non-modular: pass via combined written (45/75) + speaking (15/25).
 */
export const GOETHE_A2_MODELSATZ = Object.freeze({
  lesen: [5, 5, 5, 5],
  horen: [5, 5, 5, 5],
  lesenTotal: 20,
  horenTotal: 20,
  schreibenTotal: 2,
  sprechenTotal: 3,
});

export const GOETHE_A2_AD_KEYS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F']);

export const GOETHE_A2_PASS_RULE = Object.freeze({
  scope: 'whole-exam',
  writtenMin: { points: 45, of: 75 },
  speakingMin: { points: 15, of: 25 },
});

export const GOETHE_A2_INSTRUCTIONS = Object.freeze({
  lesen: [
    'Lesen Sie in einer Zeitung diesen Text.\nWählen Sie für die Aufgaben 1 bis 5 die richtige Lösung a, b oder c.',
    'Lesen Sie die Informationstafel und die Aufgaben 6 bis 10.\nIn welchem Stock gehen Sie? Wählen Sie die richtige Lösung a, b oder c.',
    'Lesen Sie die E-Mail und die Aufgaben 11 bis 15.\nWählen Sie für jede Aufgabe die richtige Lösung a, b oder c.',
    'Lesen Sie die Aufgaben 16 bis 20 und die Anzeigen a bis f.\nWelche Anzeige passt zu welcher Person? Für eine Aufgabe gibt es keine Lösung. Markieren Sie X.',
  ],
  horen: [
    'Sie hören fünf kurze Texte. Sie hören jeden Text zweimal.\nWählen Sie für die Aufgaben 1 bis 5 die richtige Lösung a, b oder c.',
    'Sie hören ein Gespräch. Sie hören den Text einmal.\nWählen Sie für die Aufgaben 6 bis 10 ein passendes Bild aus a bis i.',
    'Sie hören fünf kurze Gespräche. Sie hören jeden Text einmal.\nWählen Sie für die Aufgaben 11 bis 15 die richtige Lösung a, b oder c.',
    'Sie hören ein Interview. Sie hören den Text zweimal.\nWählen Sie für die Aufgaben 16 bis 20 Ja oder Nein.',
  ],
});

export function assertModellsatzCounts(blueprint) {
  const issues = [];
  if (!blueprint || blueprint.id !== 'goethe-a2') {
    issues.push('not_goethe_a2');
    return { ok: false, issues };
  }

  const lesen = blueprint.modules?.find((m) => m.id === 'lesen');
  const horen = blueprint.modules?.find((m) => m.id === 'horen');
  const lesenCounts = (lesen?.parts || []).map((p) => p.itemsTotal ?? p.questionsTotal?.min);
  const horenCounts = (horen?.parts || []).map((p) => p.itemsTotal ?? p.questionsTotal?.min);

  for (let i = 0; i < GOETHE_A2_MODELSATZ.lesen.length; i++) {
    if (lesenCounts[i] !== GOETHE_A2_MODELSATZ.lesen[i]) {
      issues.push(`lesen_teil${i + 1}:${lesenCounts[i] ?? '?'}!=${GOETHE_A2_MODELSATZ.lesen[i]}`);
    }
  }
  for (let i = 0; i < GOETHE_A2_MODELSATZ.horen.length; i++) {
    if (horenCounts[i] !== GOETHE_A2_MODELSATZ.horen[i]) {
      issues.push(`horen_teil${i + 1}:${horenCounts[i] ?? '?'}!=${GOETHE_A2_MODELSATZ.horen[i]}`);
    }
  }

  const lesenSum = lesenCounts.reduce((s, n) => s + (n || 0), 0);
  const horenSum = horenCounts.reduce((s, n) => s + (n || 0), 0);
  if (lesenSum !== GOETHE_A2_MODELSATZ.lesenTotal) issues.push(`lesen_total:${lesenSum}`);
  if (horenSum !== GOETHE_A2_MODELSATZ.horenTotal) issues.push(`horen_total:${horenSum}`);

  return { ok: issues.length === 0, issues, lesenCounts, horenCounts };
}
