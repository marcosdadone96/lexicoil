/**
 * Calidad pedagógica Hören B1 — reutiliza reglas de lesenBatchQuality.mjs.
 */
import {
  checkLesenBatchQuality,
  formatQualityReport,
  hasLongLiteralOverlap,
  sharedContentTokens,
  passageById,
} from './lesenBatchQuality.mjs';

function wordCount(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function countDialogueTurns(text) {
  return (String(text).match(/\b[A-ZÄÖÜ][a-zäöüß]{1,20}:/g) || []).length;
}

function getCorrectOptionText(q) {
  const letter = String(q.correctAnswer || q.correct || '')
    .toLowerCase()
    .replace(/[^a-d]/g, '');
  const opt = (q.options || []).find((o) =>
    String(o).toLowerCase().trim().startsWith(`${letter})`),
  );
  return opt ? String(opt).replace(/^[a-d]\)\s*/i, '') : '';
}

function checkHorenMcqTeil(batch, teil, issues, { monologue = false } = {}, warnings = []) {
  for (const q of batch.questions || []) {
    const passage = passageById(batch, q.passageId);
    if (!passage) {
      issues.push(`${q.id}: falta transcripción (passageId)`);
      continue;
    }
    const body = passage.text || '';

    const literal = hasLongLiteralOverlap(q.question, body, 4);
    if (literal) {
      issues.push(`${q.id}: pregunta copia ≥4 palabras seguidas de la transcripción («${literal}»)`);
    }

    const correctOpt = getCorrectOptionText(q);
    if (correctOpt) {
      const optLiteral = hasLongLiteralOverlap(correctOpt, body, 4);
      if (optLiteral) {
        issues.push(`${q.id}: opción correcta copia ≥4 palabras del audio («${optLiteral}»)`);
      }
      const shared = sharedContentTokens(q.question, correctOpt);
      if (shared.length >= 3) {
        issues.push(
          `${q.id}: enunciado y opción correcta comparten ≥3 palabras (${shared.slice(0, 5).join(', ')})`,
        );
      }
    }

    if (monologue && (q.options || []).length >= 3) {
      const letter = String(q.correctAnswer || q.correct || '')
        .toLowerCase()
        .replace(/[^a-d]/g, '');
      let plausibleDistractors = 0;
      for (const opt of q.options || []) {
        const ol = String(opt).toLowerCase().trim().charAt(0);
        if (ol === letter) continue;
        const optBody = String(opt).replace(/^[a-d]\)\s*/i, '');
        if (sharedContentTokens(optBody, body).length >= 1) plausibleDistractors++;
      }
      if (plausibleDistractors < 1) {
        // Downgraded to warning: Gemini paraphrases distractors (good anti-word-matching)
        // which means they often share no literal tokens with the monologue even when topically valid.
        warnings.push(`${q.id}: distractores poco plausibles respecto al monólogo (revisar manualmente)`);
      }
    }
  }

  if (monologue) {
    const main = batch.passages?.[0];
    const wc = wordCount(main?.text);
    if (wc < 150 || wc > 350) {
      issues.push(`Hören T${teil}: monólogo fuera de rango (~200–300 palabras, tiene ${wc})`);
    }
  }
}

function checkHorenTeil1(batch, issues, warnings) {
  const passages = batch.passages || [];
  if (passages.length < 2) {
    issues.push('Hören T1: se esperan varios textos cortos (≥2 passages)');
  }
  for (const p of passages) {
    const wc = wordCount(p.text);
    if (wc > 120) {
      warnings.push(`Hören T1: texto «${p.id || p.title}» largo (${wc} palabras) — T1 suele ser corto`);
    }
  }

  const rf = (batch.questions || []).every((q) => q.type === 'richtig_falsch');
  if (rf) {
    const lesen = checkLesenBatchQuality(batch, 1);
    issues.push(...lesen.issues);
    warnings.push(...(lesen.warnings || []));
  } else {
    checkHorenMcqTeil(batch, 1, issues);
  }
}

function checkHorenTeil2(batch, issues, warnings = []) {
  checkHorenMcqTeil(batch, 2, issues, { monologue: true }, warnings);
}

/**
 * Hören T3 — Gespräch (diálogo entre dos hablantes nativos)
 * Formato oficial: 1 transcripción (diálogo) + 7 ítems Richtig/Falsch
 */
function checkHorenTeil3(batch, issues, warnings) {
  const passage = batch.passages?.[0];
  if (!passage) {
    issues.push('Hören T3: falta transcripción de conversación (passages[0])');
    return;
  }
  const turns = countDialogueTurns(passage.text);
  if (turns < 4) {
    issues.push('Hören T3: la conversación necesita ≥4 turnos de diálogo marcados con «Nombre:»');
  }
  const wc = wordCount(passage.text);
  if (wc < 200 || wc > 380) {
    issues.push(`Hören T3: longitud fuera de rango (200–380 palabras, tiene ${wc})`);
  }

  const qs = batch.questions || [];
  if (qs.length !== 7) {
    issues.push(`Hören T3: se requieren exactamente 7 preguntas Richtig/Falsch (tiene ${qs.length})`);
  }

  let richtigCount = 0;
  let falschCount = 0;
  for (const q of qs) {
    const ans = String(q.correct || q.correctAnswer || '').trim();
    if (/^richtig$/i.test(ans)) richtigCount++;
    else if (/^falsch$/i.test(ans)) falschCount++;
    else issues.push(`${q.id}: T3 — correct debe ser "Richtig" o "Falsch", tiene "${ans}"`);

    const literal = hasLongLiteralOverlap(q.question, passage.text || '', 4);
    if (literal) {
      issues.push(`${q.id}: pregunta copia ≥4 palabras de la transcripción («${literal}»)`);
    }
  }
  // Balance: 3–4 Richtig / 3–4 Falsch
  if (qs.length === 7) {
    if (richtigCount < 3 || richtigCount > 4) {
      issues.push(
        `Hören T3: distribución desequilibrada — ${richtigCount} Richtig / ${falschCount} Falsch (espera 3–4 / 3–4)`,
      );
    }
  }
}

/**
 * Hören T4 — Diskussion / "Wer sagt was?" (Zuordnung)
 * Formato oficial: 1 transcripción (3 hablantes) + 8 ítems matching con opciones a/b/c
 */
function checkHorenTeil4(batch, issues, warnings) {
  const passage = batch.passages?.[0];
  if (!passage) {
    issues.push('Hören T4: falta transcripción de discusión (passages[0])');
    return;
  }
  const turns = countDialogueTurns(passage.text);
  if (turns < 4) {
    issues.push('Hören T4: la discusión necesita ≥4 turnos de hablantes marcados con «Nombre:»');
  }
  const wc = wordCount(passage.text);
  if (wc < 280 || wc > 500) {
    issues.push(`Hören T4: longitud fuera de rango (280–500 palabras, tiene ${wc})`);
  }

  const qs = batch.questions || [];
  if (qs.length !== 8) {
    issues.push(`Hören T4: se requieren exactamente 8 preguntas Zuordnung (tiene ${qs.length})`);
  }

  const answerCounts = {};
  for (const q of qs) {
    const opts = q.options || [];
    if (opts.length !== 3) {
      issues.push(`${q.id}: T4 — cada pregunta debe tener exactamente 3 opciones (a/b/c), tiene ${opts.length}`);
    }
    const ans = String(q.correct || q.correctAnswer || '').trim().toLowerCase().replace(/[^a-c]/g, '');
    if (!ans) {
      issues.push(`${q.id}: T4 — correct debe ser "a", "b" o "c"`);
    } else {
      answerCounts[ans] = (answerCounts[ans] || 0) + 1;
    }

    const literal = hasLongLiteralOverlap(q.question, passage.text || '', 4);
    if (literal) {
      issues.push(`${q.id}: afirmación copia ≥4 palabras de la transcripción («${literal}»)`);
    }
  }
  // All 3 letters must appear at least once
  for (const letter of ['a', 'b', 'c']) {
    if (!answerCounts[letter]) {
      issues.push(`Hören T4: la opción "${letter}" no aparece ninguna vez (los 3 hablantes deben tener ≥1 respuesta)`);
    }
  }
  // No single speaker >50% of answers
  for (const [letter, count] of Object.entries(answerCounts)) {
    if (count > 4) {
      issues.push(`Hören T4: el hablante "${letter}" concentra ${count}/8 respuestas (máx 4 = 50%)`);
    }
  }
}

/**
 * @returns {{ ok: boolean, issues: string[], warnings: string[], scoreEstimate: number }}
 */
export function checkHorenBatchQuality(batch, teil) {
  const issues = [];
  const warnings = [];
  const t = Number(teil);

  if (!batch?.questions?.length) {
    return { ok: false, issues: ['Batch sin preguntas'], warnings: [], scoreEstimate: 0 };
  }

  if (t === 1) checkHorenTeil1(batch, issues, warnings);
  else if (t === 2) checkHorenTeil2(batch, issues, warnings);
  else if (t === 3) checkHorenTeil3(batch, issues, warnings);
  else if (t === 4) checkHorenTeil4(batch, issues, warnings);
  else issues.push(`Hören: Teil ${t} no soportado (usa 1–4)`);

  const penalty = issues.length * 8 + warnings.length * 2;
  const scoreEstimate = Math.max(0, Math.min(100, 100 - penalty));
  return { ok: issues.length === 0, issues, warnings, scoreEstimate };
}

export function formatHorenQualityReport(result, teil) {
  const t = Number(teil);
  const lines = [];
  if (result.ok) {
    lines.push(`Calidad Hören T${t}: OK ✅ (estimación ~${result.scoreEstimate}%)`);
  } else {
    lines.push(
      `Calidad Hören T${t}: FAIL (${result.issues.length} problemas, estimación ~${result.scoreEstimate}%)`,
    );
    lines.push(...result.issues.map((i) => `  - ${i}`));
  }
  if (result.warnings?.length) {
    lines.push(`Avisos (${result.warnings.length}):`);
    lines.push(...result.warnings.map((w) => `  · ${w}`));
  }
  return lines.join('\n');
}

export { formatQualityReport };
