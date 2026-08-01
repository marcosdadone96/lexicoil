/**
 * Goethe-Zertifikat B2 Modellsatz Erwachsene — official item counts.
 * Lesen: 9 + 6 + 6 + 6 + 3 = 30
 * Hören: 10 + 6 + 6 + 8 = 30 (Teil 1: 5 Segmente × 2 Aufgaben)
 * Modular: 60/100 per module.
 */
export const GOETHE_B2_MODELSATZ = Object.freeze({
  lesen: [9, 6, 6, 6, 3],
  horen: [10, 6, 6, 8],
  lesenTotal: 30,
  horenTotal: 30,
  schreibenTotal: 2,
  sprechenTotal: 2,
});

export const GOETHE_B2_INSTRUCTIONS = Object.freeze({
  lesen: [
    'Lesen Sie in einem Forum, wie Menschen über ein Thema denken.\nAuf welche der vier Personen treffen die einzelnen Aussagen zu? Die Personen können mehrmals gewählt werden.',
    'Lesen Sie in einer Zeitschrift einen Artikel.\nWelche Sätze passen in die Lücken? Zwei Sätze passen nicht.',
    'Lesen Sie in einer Zeitung einen Artikel.\nWählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
    'Lesen Sie in einer Zeitschrift Meinungsäußerungen.\nWelche Äußerung passt zu welcher Überschrift? Eine Äußerung passt nicht.',
    'Lesen Sie die Studienordnung.\nWelche Überschriften aus dem Inhaltsverzeichnis passen zu den Paragrafen? Vier Überschriften werden nicht gebraucht.',
  ],
  horen: [
    'Sie hören fünf Gespräche und Äußerungen. Sie hören jeden Text einmal.\nZu jedem Text lösen Sie zwei Aufgaben: Richtig/Falsch und Multiple Choice.',
    'Sie hören im Radio ein Interview mit einer Persönlichkeit aus der Wissenschaft.\nSie hören den Text zweimal. Wählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
    'Sie hören im Radio ein Gespräch mit mehreren Personen.\nSie hören den Text einmal. Wählen Sie bei jeder Aufgabe: Wer sagt das?',
    'Sie hören einen kurzen Vortrag.\nSie hören den Text zweimal. Wählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.',
  ],
  schreiben: [
    'Schreiben Sie einen Forumsbeitrag zu einem Thema.\nÄußern Sie Ihre Meinung, nennen Sie Gründe, Vorschläge und Vor- und Nachteile.\nSchreiben Sie mindestens 150 Wörter.',
    'Schreiben Sie eine Nachricht an Ihren Vorgesetzten.\nBeschreiben Sie Ihre Situation, bitten Sie um Verständnis, machen Sie einen Vorschlag und zeigen Sie Verständnis.\nSchreiben Sie mindestens 100 Wörter. Vergessen Sie Anrede und Gruß nicht.',
  ],
  sprechen: [
    'Halten Sie einen kurzen Vortrag zu einem Thema Ihrer Wahl und sprechen Sie mit Ihrer Partnerin/Ihrem Partner darüber.',
    'Tauschen Sie in einer Diskussion Standpunkte zu einem kontroversen Thema aus.',
  ],
});

/** Compare blueprint Schreiben instructions to canonical Modellsatz strings. */
export function assertSchreibenInstructionsMatch(blueprint) {
  const issues = [];
  const sch = blueprint?.modules?.find((m) => m.id === 'schreiben');
  if (!sch?.parts?.length) {
    issues.push('schreiben_missing');
    return { ok: false, issues };
  }
  for (let i = 0; i < GOETHE_B2_INSTRUCTIONS.schreiben.length; i++) {
    const expected = GOETHE_B2_INSTRUCTIONS.schreiben[i];
    const got = String(sch.parts[i]?.instruction || '').trim();
    if (got !== expected) {
      issues.push(`schreiben_teil${i + 1}_instruction_mismatch`);
    }
  }
  return { ok: issues.length === 0, issues };
}

export function assertLesenInstructionsMatch(blueprint) {
  const issues = [];
  const les = blueprint?.modules?.find((m) => m.id === 'lesen');
  if (!les?.parts?.length) {
    issues.push('lesen_missing');
    return { ok: false, issues };
  }
  for (let i = 0; i < GOETHE_B2_INSTRUCTIONS.lesen.length; i++) {
    const expected = GOETHE_B2_INSTRUCTIONS.lesen[i];
    const got = String(les.parts[i]?.instruction || '').trim();
    if (got !== expected) {
      issues.push(`lesen_teil${i + 1}_instruction_mismatch`);
    }
  }
  return { ok: issues.length === 0, issues };
}

/** Compare blueprint Hören instructions to canonical Modellsatz strings. */
export function assertHorenInstructionsMatch(blueprint) {
  const issues = [];
  const ho = blueprint?.modules?.find((m) => m.id === 'horen');
  if (!ho?.parts?.length) {
    issues.push('horen_missing');
    return { ok: false, issues };
  }
  for (let i = 0; i < GOETHE_B2_INSTRUCTIONS.horen.length; i++) {
    const expected = GOETHE_B2_INSTRUCTIONS.horen[i];
    const got = String(ho.parts[i]?.instruction || '').trim();
    if (got !== expected) {
      issues.push(`horen_teil${i + 1}_instruction_mismatch`);
    }
  }
  return { ok: issues.length === 0, issues };
}

/** Compare blueprint Sprechen instructions to canonical Modellsatz strings. */
export function assertSprechenInstructionsMatch(blueprint) {
  const issues = [];
  const sp = blueprint?.modules?.find((m) => m.id === 'sprechen');
  if (!sp?.parts?.length) {
    issues.push('sprechen_missing');
    return { ok: false, issues };
  }
  for (let i = 0; i < GOETHE_B2_INSTRUCTIONS.sprechen.length; i++) {
    const expected = GOETHE_B2_INSTRUCTIONS.sprechen[i];
    const got = String(sp.parts[i]?.instruction || '').trim();
    if (got !== expected) {
      issues.push(`sprechen_teil${i + 1}_instruction_mismatch`);
    }
  }
  return { ok: issues.length === 0, issues };
}

export function assertModellsatzCounts(blueprint) {
  const issues = [];
  if (!blueprint || blueprint.id !== 'goethe-b2') {
    issues.push('not_goethe_b2');
    return { ok: false, issues };
  }

  const lesen = blueprint.modules?.find((m) => m.id === 'lesen');
  const horen = blueprint.modules?.find((m) => m.id === 'horen');
  const lesenCounts = (lesen?.parts || []).map((p) => p.itemsTotal ?? p.questionsTotal?.min);
  const horenCounts = (horen?.parts || []).map((p) => p.itemsTotal ?? p.questionsTotal?.min);

  for (let i = 0; i < GOETHE_B2_MODELSATZ.lesen.length; i++) {
    if (lesenCounts[i] !== GOETHE_B2_MODELSATZ.lesen[i]) {
      issues.push(`lesen_teil${i + 1}:${lesenCounts[i] ?? '?'}!=${GOETHE_B2_MODELSATZ.lesen[i]}`);
    }
  }
  for (let i = 0; i < GOETHE_B2_MODELSATZ.horen.length; i++) {
    if (horenCounts[i] !== GOETHE_B2_MODELSATZ.horen[i]) {
      issues.push(`horen_teil${i + 1}:${horenCounts[i] ?? '?'}!=${GOETHE_B2_MODELSATZ.horen[i]}`);
    }
  }

  const lesenSum = lesenCounts.reduce((s, n) => s + (n || 0), 0);
  const horenSum = horenCounts.reduce((s, n) => s + (n || 0), 0);
  if (lesenSum !== GOETHE_B2_MODELSATZ.lesenTotal) issues.push(`lesen_total:${lesenSum}`);
  if (horenSum !== GOETHE_B2_MODELSATZ.horenTotal) issues.push(`horen_total:${horenSum}`);

  return { ok: issues.length === 0, issues, lesenCounts, horenCounts };
}
