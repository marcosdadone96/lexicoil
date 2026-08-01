/**
 * Goethe B2 Hören T1–T4 — calidad pedagógica (formato Modellsatz Erwachsene).
 */
import {
  hasLongLiteralOverlap,
  sharedContentTokens,
  passageById,
} from './lesenBatchQuality.mjs';
import { collectMcqLengthBiasIssues } from './mcqLengthBias.mjs';

function wordCount(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function countDialogueTurns(text) {
  return (String(text).match(/\b[A-ZÄÖÜ][a-zäöüß]{1,24}:/g) || []).length;
}

function optionLetterFromString(opt) {
  const m = String(opt || '').trim().match(/^([A-Da-d])[).:\s]/);
  return m ? m[1].toUpperCase() : '';
}

function optionBody(opt) {
  return String(opt || '')
    .trim()
    .replace(/^[A-Da-d][).:\s]+/, '')
    .trim();
}

function speakerContextsFromTranscript(text, speakerLabels) {
  const ctx = new Map();
  for (const lab of speakerLabels) {
    ctx.set(lab, '');
  }
  const parts = String(text || '').split(/\n(?=[A-ZÄÖÜ][a-zäöüß]{1,24}:)/);
  for (const block of parts) {
    const m = block.match(/^([A-ZÄÖÜ][a-zäöüß]{1,24}):\s*([\s\S]*)/);
    if (!m) continue;
    const name = m[1];
    const body = m[2] || '';
    for (const lab of speakerLabels) {
      if (optionBody(lab).includes(name) || lab.includes(name)) {
        ctx.set(lab, `${ctx.get(lab) || ''} ${body}`.trim());
      }
    }
  }
  return ctx;
}

function tokenOverlapScore(a, b) {
  const ta = new Set(
    String(a || '')
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3),
  );
  const tb = new Set(
    String(b || '')
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3),
  );
  if (!ta.size || !tb.size) return 0;
  let n = 0;
  for (const t of ta) if (tb.has(t)) n++;
  return n / Math.max(ta.size, tb.size);
}

export function checkHorenB2Teil1(batch, issues, warnings) {
  const passages = batch.passages || [];
  if (passages.length !== 5) {
    issues.push(`Hören B2 T1: se esperan 5 segmentos (tiene ${passages.length})`);
  }
  for (const p of passages) {
    const wc = wordCount(p.text || p.transcript || '');
    if (wc < 30 || wc > 90) {
      issues.push(`Hören B2 T1 ${p.id || '?'}: ${wc} Wörter (30–90)`);
    }
  }
  const qs = batch.questions || [];
  if (qs.length !== 10) {
    issues.push(`Hören B2 T1: se esperan 10 preguntas (tiene ${qs.length})`);
  }
  const bySeg = new Map();
  for (const q of qs) {
    const seg = q.segmentLabel || q.passageId || '?';
    if (!bySeg.has(seg)) bySeg.set(seg, []);
    bySeg.get(seg).push(q);
  }
  if (passages.length === 5 && bySeg.size !== 5) {
    issues.push(`Hören B2 T1: se esperan 5 segmentLabel/passageId distintos (tiene ${bySeg.size})`);
  }
  for (const [, group] of bySeg) {
    if (group.length !== 2) {
      issues.push(`Hören B2 T1: cada segmento debe tener 2 preguntas RF+MCQ (tiene ${group.length})`);
      continue;
    }
    const types = group.map((q) => String(q.type || '').toLowerCase());
    if (!types.includes('richtig_falsch') || !types.includes('multiple_choice')) {
      issues.push(`Hören B2 T1: segmento sin par RF+MCQ (${types.join(', ')})`);
    }
  }
  const q0 = qs[0]?.question || '';
  if (!q0.includes('Gespräche') && !q0.includes('Richtig/Falsch')) {
    warnings.push('Hören B2 T1: consigna oficial no visible en Q1');
  }
  issues.push(...collectMcqLengthBiasIssues(batch, { level: 'B2' }));
}

export function checkHorenB2Teil2(batch, issues, warnings) {
  const p0 = batch.passages?.[0];
  if (!p0) {
    issues.push('Hören B2 T2: falta transcripción (passages[0])');
    return;
  }
  const text = p0.text || p0.transcript || '';
  const wc = wordCount(text);
  if (wc < 280 || wc > 400) {
    issues.push(`Hören B2 T2: entrevista ${wc} Wörter (280–400)`);
  }
  const turns = countDialogueTurns(text);
  if (turns < 6) {
    issues.push(`Hören B2 T2: se espera entrevista con ≥6 turnos (tiene ${turns})`);
  }
  const qs = batch.questions || [];
  if (qs.length !== 6) {
    issues.push(`Hören B2 T2: se esperan 6 MCQ (tiene ${qs.length})`);
  }
  for (const q of qs) {
    if (String(q.type || '').toLowerCase() !== 'multiple_choice') {
      issues.push(`${q.id}: Hören B2 T2 debe ser multiple_choice`);
    }
    const body = text;
    const literal = hasLongLiteralOverlap(q.question, body, 4);
    if (literal) issues.push(`${q.id}: pregunta copia ≥4 palabras del audio («${literal}»)`);
  }
  issues.push(...collectMcqLengthBiasIssues(batch, { level: 'B2' }));
}

export function checkHorenB2Teil3(batch, issues, warnings) {
  const p0 = batch.passages?.[0];
  if (!p0) {
    issues.push('Hören B2 T3: falta transcripción panel (passages[0])');
    return;
  }
  const text = p0.text || p0.transcript || '';
  const wc = wordCount(text);
  if (wc < 250 || wc > 380) {
    issues.push(`Hören B2 T3: panel ${wc} Wörter (250–380)`);
  }
  const turns = countDialogueTurns(text);
  if (turns < 14) {
    warnings.push(`Hören B2 T3: panel con ${turns} turnos (objetivo ≥14)`);
  }
  const qs = batch.questions || [];
  if (qs.length !== 6) {
    issues.push(`Hören B2 T3: se esperan 6 matching (tiene ${qs.length})`);
  }
  const opts0 = qs[0]?.options || [];
  if (opts0.length !== 4) {
    issues.push(`Hören B2 T3: se esperan 4 options A–D (tiene ${opts0.length})`);
  } else {
    for (let i = 0; i < 4; i++) {
      const want = String.fromCharCode(65 + i);
      if (optionLetterFromString(opts0[i]) !== want) {
        issues.push(`Hören B2 T3: option[${i}] debe empezar por ${want})`);
      }
    }
  }
  const optionSets = qs.map((q) => JSON.stringify((q.options || []).map(String)));
  if (new Set(optionSets).size > 1) {
    issues.push('Hören B2 T3: las 6 preguntas deben compartir la misma lista A–D');
  }
  const q0 = qs[0]?.question || '';
  if (!q0.includes('Wer sagt') && !q0.includes('Personen')) {
    warnings.push('Hören B2 T3: consigna oficial no visible en Q1');
  }
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  for (const q of qs) {
    if (String(q.type || '').toLowerCase() !== 'matching') {
      issues.push(`${q.id}: Hören B2 T3 type debe ser matching`);
    }
    const L = String(q.correctAnswer ?? q.correct ?? '')
      .trim()
      .replace(/^([A-D]).*/, '$1')
      .toUpperCase();
    if (!/^[A-D]$/.test(L)) issues.push(`${q.id}: correct debe ser A–D`);
    else counts[L] = (counts[L] || 0) + 1;
    const literal = hasLongLiteralOverlap(q.question, text, 4);
    if (literal) issues.push(`${q.id}: afirmación copia ≥4 palabras del panel («${literal}»)`);
  }
  for (const [L, n] of Object.entries(counts)) {
    if (n === 0) issues.push(`Hören B2 T3: ninguna respuesta correcta usa ${L}`);
    if (n > 3) issues.push(`Hören B2 T3: ${L} concentra ${n}/6 respuestas (máx 3)`);
  }
  if (opts0.length === 4 && text) {
    const labels = opts0.map((o) => optionBody(o));
    const ctxMap = speakerContextsFromTranscript(text, labels);
    for (const q of qs) {
      const L = String(q.correctAnswer ?? q.correct ?? '').toUpperCase();
      const idx = L.charCodeAt(0) - 65;
      const stmt = q.question || '';
      const ownCtx = ctxMap.get(labels[idx]) || text;
      const scoreOwn = tokenOverlapScore(stmt, ownCtx);
      for (let j = 0; j < 4; j++) {
        if (j === idx) continue;
        const other = ctxMap.get(labels[j]) || '';
        const scoreOther = tokenOverlapScore(stmt, other);
        if (scoreOther >= 0.38 && scoreOther >= scoreOwn - 0.05) {
          issues.push(
            `${q.id}: posible ambigüedad — la afirmación encaja también con ${String.fromCharCode(65 + j)} (solapamiento léxico)`,
          );
          break;
        }
      }
    }
  }
}

export function checkHorenB2Teil4(batch, issues, warnings) {
  const p0 = batch.passages?.[0];
  if (!p0) {
    issues.push('Hören B2 T4: falta transcripción Vortrag (passages[0])');
    return;
  }
  const text = p0.text || p0.transcript || '';
  const wc = wordCount(text);
  if (wc < 300 || wc > 450) {
    issues.push(`Hören B2 T4: Vortrag ${wc} Wörter (300–450)`);
  }
  const turns = countDialogueTurns(text);
  if (turns >= 3) {
    warnings.push('Hören B2 T4: Vortrag debería ser monólogo (pocos turnos Name:)');
  }
  const qs = batch.questions || [];
  if (qs.length !== 8) {
    issues.push(`Hören B2 T4: se esperan 8 MCQ (tiene ${qs.length})`);
  }
  for (const q of qs) {
    if (String(q.type || '').toLowerCase() !== 'multiple_choice') {
      issues.push(`${q.id}: Hören B2 T4 PROHIBIDO matching B1 (debe ser MCQ)`);
    }
    if (String(q.type || '').toLowerCase() === 'matching') {
      issues.push(`${q.id}: Hören B2 T4 PROHIBIDO matching debate B1`);
    }
  }
  const q0 = qs[0]?.question || '';
  if (!q0.includes('Vortrag') && !q0.includes('zweimal')) {
    warnings.push('Hören B2 T4: consigna oficial no visible en Q1');
  }
  for (const q of qs) {
    const literal = hasLongLiteralOverlap(q.question, text, 4);
    if (literal) issues.push(`${q.id}: pregunta copia ≥4 palabras del Vortrag («${literal}»)`);
  }
  issues.push(...collectMcqLengthBiasIssues(batch, { level: 'B2' }));
}
