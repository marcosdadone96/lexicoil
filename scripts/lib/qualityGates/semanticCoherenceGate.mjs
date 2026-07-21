/**
 * Q3-B semantic coherence gate (LLM) — pilot / dry-run helper.
 * Axes: naturalness, lexicon, quote_fidelity.
 */
import { inferJsonResponse, DEFAULT_HAIKU_MODEL } from '../llmJsonClient.mjs';

export const Q3B_GATE_NAME = 'Q3-B-semanticCoherence';
export const Q3B_PROMPT_VERSION = 'v1.2-grammar-collocation-2026-07-10';

const PROMPT_PREAMBLE = `Eres revisor de calidad para materiales Goethe B1 (Hören/Lesen/Schreiben/Sprechen).
Revisa SOLO el JSON de entrada (passages + questions).

Marca problemas en estos ejes (puede haber 0..n findings):

A) naturalness — ¿hay términos que no encajan en el registro/tema del segmento
   (p.ej. jerga filosófica en un anuncio de radio de salud), saltos temáticos
   sin transición, comentarios meta-lingüísticos sobre la propia gramática,
   O sintaxis rota / orden de palabras que hace la frase incomprensible o
   agramatical en alemán B1?
   Ejemplos de sintaxis/naturalness a marcar:
   - «das Gärtnern im freien Stress reduziert» (sintaxis confusa / orden roto)
   - «der Zugang zu Bildung für alle leicht und indirekte Hürden minimiert werden»
     (oración agramatical / predicado roto)
B) lexicon — ¿hay palabras semánticamente cercanas pero INCORRECTAS en contexto
   (parónimos / casi-sinónimos / colocaciones rotas / verbo incorrecto)?
   Ejemplos de referencia:
   - «natürlichen Reserven» en texto sobre sostenibilidad/empresa → incorrecto;
     lo pretendido es «Ressourcen» (recursos). Reserven = reservas financieras/militares.
   - «Akzent» cuando se habla de claridad de pronunciación → «Aussprache»/«Tonfall»
     (Akzent = acento regional/extranjero, no «claridad»).
   - «Protokoll veröffentlichen» sobre sostenibilidad → «Bericht» (Protokoll = acta).
   - «Ein neues Programm ist … eingetreten» (programa/proyecto) → incorrecto;
     lo pretendido es «eingeführt»/«gestartet» (eintreten ≠ lanzar un programa).
   - «das Auto komplett zu verzichten» → falta la preposición de la colocación
     «verzichten auf» (marcar lexicon/wrong_lexeme).
   - «der Konsum von Mobilität» → colocación antinatural (marcar lexicon).
C) quote_fidelity — SOLO si una explanation (u opción) presenta una CITA LITERAL
   (entre comillas, «…», o formulada como palabras textuales de alguien) que esa
   persona NUNCA dijo en passage/transcript.
   - SÍ marcar: explanation dice «Ich werde es mal probieren.» pero en el diálogo
     solo existe «Vielleicht mache ich das nächstes Wochenende…» (cita inventada).
   - NO marcar: explanation resume o parafrasea fielmente («Lisa menciona que el
     Fahrrad es saludable» cuando Lisa dijo «ist zudem gesund») — eso es parafraseo
     legítimo, no cita fabricada.
   - NO marcar: la explanation usa sinónimos razonables del pasaje sin pretender
     comillas literales.

REGLA OBLIGATORIA — Lesen Teil 3 (matching):
En Goethe B1 Lesen Teil 3 hay exactamente una situación cuya respuesta correcta
es "0" (ningún anuncio A–J encaja). Eso es DISEÑO DEL EXAMEN, no un error.
- Si una pregunta tiene correct="0" (o correctAnswer="0"), NUNCA la marques como
  non_sequitur, register_break, forced_vocab ni ningún otro finding por el hecho
  de que su tema no aparezca en las opciones.
- Ejemplo NEGATIVO (NO marcar): «Herr Ott sucht einen günstigen Flug nach Portugal
  für den Sommer.» con correct="0" mientras los anuncios son reparaciones/cursos/
  mudanzas locales — es el ítem sin pareja intencional.
- Ejemplo POSITIVO (sí puedes marcar otras cosas en T3): un anuncio o situación
  con jerga absurda (Ontologie) o léxico incorrecto (Reserven) en el texto mismo.

NO marques: B1 simple pero correcto; metáforas B1 aceptables; topicTag discutible
si el contenido es coherente; mayúsculas (otro gate); solapamiento literal
pregunta↔pasaje (otro gate); vocabularyTags/grammarTags metadata (otro gate);
distractores T3 con correct="0".

Responde SOLO JSON válido (sin markdown):
{
  "ok": true|false,
  "findings": [
    {
      "axis": "naturalness"|"lexicon"|"quote_fidelity",
      "reason": "forced_vocab"|"non_sequitur"|"register_break"|"wrong_lexeme"|"fabricated_quote",
      "severity": "block"|"warn",
      "passageId": "..."|"null",
      "questionId": "..."|"null",
      "field": "passage.text"|"question"|"explanation"|"option"|...,
      "quote": "fragmento ≤120 chars",
      "detail": "1 frase en español"
    }
  ]
}`;

function slimBatch(batch) {
  return {
    topicTag: batch.topicTag || null,
    module: batch.module || null,
    passages: (batch.passages || []).map((p) => ({
      id: p.id,
      title: p.title,
      text: p.text,
      transcript: p.transcript,
      topicTag: p.topicTag,
    })),
    questions: (batch.questions || []).map((q) => ({
      id: q.id,
      teil: q.teil,
      type: q.type,
      question: q.question,
      options: q.options,
      correct: q.correct ?? q.correctAnswer,
      explanation: q.explanation,
      passageId: q.passageId,
      signText: q.signText,
      statement: q.statement,
    })),
  };
}

export function buildQ3bPrompt(batch, file) {
  const payload = slimBatch(batch);
  return `${PROMPT_PREAMBLE}\n\nArchivo: ${file}\nPromptVersion: ${Q3B_PROMPT_VERSION}\n\nINPUT_JSON:\n${JSON.stringify(payload)}`;
}

/** Drop findings that violate the T3 correct=0 exam-design rule (safety net). */
export function filterT3ZeroFalsePositives(batch, findings) {
  const zeroIds = new Set();
  for (const q of batch.questions || []) {
    const key = String(q.correctAnswer ?? q.correct ?? '').trim();
    const isT3 =
      Number(q.teil) === 3 ||
      String(q.type || '').toLowerCase() === 'matching' ||
      (Array.isArray(q.options) && q.options.length >= 8);
    if (isT3 && key === '0') zeroIds.add(q.id);
  }
  if (!zeroIds.size) return findings;
  return (findings || []).filter((f) => {
    if (!f.questionId || !zeroIds.has(f.questionId)) return true;
    // Never keep naturalness findings on intentional unmatched T3 items
    if (f.axis === 'naturalness' || f.reason === 'non_sequitur' || f.reason === 'register_break') {
      return false;
    }
    return true;
  });
}

export function parseQ3bResponse(text) {
  let raw = String(text || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
  const parsed = JSON.parse(raw);
  const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
  return {
    ok: parsed.ok !== false && findings.filter((f) => f.severity === 'block').length === 0,
    findings: findings.map((f) => ({
      axis: f.axis || null,
      reason: f.reason || null,
      severity: f.severity === 'block' ? 'block' : 'warn',
      passageId: f.passageId === 'null' ? null : f.passageId || null,
      questionId: f.questionId === 'null' ? null : f.questionId || null,
      field: f.field || null,
      quote: String(f.quote || '').slice(0, 120),
      detail: String(f.detail || '').slice(0, 240),
    })),
  };
}

/**
 * @returns {Promise<{ ok: boolean, findings: object[], model: string, provider: string, usage?: object }>}
 */
export async function runQ3bSemanticCoherence(batch, opts = {}) {
  const file = opts.file || 'unknown.json';
  const prompt = buildQ3bPrompt(batch, file);
  const maxTokens = opts.maxTokens ?? 2048;
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { text, model, provider, usage } = await inferJsonResponse({
      prompt,
      model: opts.model,
      temperature: attempt === 0 ? 0.1 : 0,
      maxTokens,
    });
    try {
      const parsed = parseQ3bResponse(text);
      const findings = filterT3ZeroFalsePositives(batch, parsed.findings);
      const ok = findings.filter((f) => f.severity === 'block').length === 0;
      return {
        ok,
        findings,
        model,
        provider,
        usage,
        rawText: text,
        promptVersion: Q3B_PROMPT_VERSION,
        filteredT3Zero: (parsed.findings || []).length - findings.length,
      };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Q3-B parse failed');
}

export { DEFAULT_HAIKU_MODEL };
