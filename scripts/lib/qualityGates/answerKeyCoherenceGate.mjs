/**
 * answerKeyCoherenceGate.mjs — Q2 (LLM)
 * Verifica que `correct` esté justificado por `explanation`.
 *
 * Modos:
 *   audit / dry-run — solo log (wouldBlock / wouldWarn)
 *   block — confidence=high + mismatch → severity block (futuro)
 *
 * Modelo por defecto: gemini-2.5-flash (pipeline; override Q2_ANSWER_KEY_MODEL).
 */
import { inferJsonResponse, DEFAULT_HAIKU_MODEL } from '../llmJsonClient.mjs';
import { findKeyExplanationMismatches } from '../keyExplanationGate.mjs';
import { buildVerdict, inferTeil } from './qualityGateCommon.mjs';

export const GATE_NAME = 'Q2-answerKeyCoherence';

/** Modelo LLM — override con Q2_ANSWER_KEY_MODEL (default gemini-2.5-flash vía loadEnv). */
export const Q2_DEFAULT_MODEL = () =>
  (process.env.Q2_ANSWER_KEY_MODEL || DEFAULT_HAIKU_MODEL).trim();

/**
 * Prompt exacto enviado al LLM (cabecera fija; los items se añaden como JSON al final).
 * Ver también buildAnswerKeyCoherencePrompt().
 */
export const ANSWER_KEY_COHERENCE_PROMPT_HEADER = `Du bist Auditor für Goethe-Zertifikat B1 Lesen (Deutsch).

Aufgabe: Prüfe für JEDES Item, ob die Erklärung (explanation) die deklarierte Antwort (declaredKey) wirklich rechtfertigt.

Regeln:
1. Lies passageText (falls vorhanden), question, options (falls vorhanden), signText (falls vorhanden), explanation und declaredKey.
2. Leite aus der explanation ab, welche Antwort begründet wird — als inferredKey. Bei Teil 2/5: nutze passageText als maßgebliche Quelle, wenn die explanation nur paraphrasiert.
3. inferredKey muss exakt dem Antwortformat entsprechen:
   - MCQ Teil 2/5: Kleinbuchstabe a, b oder c (nur der Buchstabe)
   - Matching Teil 3: Großbuchstabe A–J (nur der Buchstabe)
   - Teil 4 ja_nein: "Ja" oder "Nein" (nicht a)/b))
   - Teil 1 richtig_falsch: "Richtig" oder "Falsch"
4. confidence:
   - "high": die explanation begründet eindeutig genau eine Antwort
   - "medium": die explanation deutet auf eine Antwort, aber nicht völlig eindeutig
   - "low": die explanation ist zu vage; keine klare Zuordnung möglich
5. motivo: ein kurzer deutscher Satz (max 25 Wörter), warum inferredKey gewählt wurde. Keine Anführungszeichen und keine direkten Zitate — nur Paraphrase.
6. justified: true wenn inferredKey dieselbe Antwort wie declaredKey ist (semantisch).
7. Berechnungs-/Tariffragen (Zeiten, Euro, Stunden): wende NICHT eigene Arithmetik an. Prüfe, welche Option die in der explanation beschriebene Regel anwendet. justified=true, wenn declaredKey diese Regel trifft — auch wenn die explanation keine Endsumme nennt.

Hinweis chk18bHint: Ein vorläufiger lexikalischer Overlap mit einer falschen Option ist KEIN Beweis für einen Mismatch. Entscheide semantisch anhand von explanation und passageText.

Antworte NUR mit einem JSON-Array zwischen den Delimitern <<<Q2_JSON>>> und <<<END_Q2>>> (kein Markdown, kein Text davor/danach). Ein Objekt pro itemId:
[
  {
    "itemId": "...",
    "declaredKey": "...",
    "inferredKey": "...",
    "justified": true,
    "confidence": "high",
    "motivo": "..."
  }
]

<<<Q2_JSON>>
[ ... dein JSON-Array hier ... ]
<<<END_Q2>>>`;

export function isQ2ApplicableQuestion(q, teil) {
  const type = String(q.type || '').toLowerCase();
  if (teil === 3 || type === 'matching') return true;
  if (teil === 4 || type === 'ja_nein') return true;
  if (teil === 1 || type === 'richtig_falsch') return true;
  if ([2, 5].includes(teil) || type === 'multiple_choice') return true;
  return false;
}

/** @param {string} raw */
export function normalizeAnswerKey(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^richtig$/i.test(s)) return 'Richtig';
  if (/^falsch$/i.test(s)) return 'Falsch';
  if (/^ja$/i.test(s)) return 'Ja';
  if (/^nein$/i.test(s)) return 'Nein';
  const letter = s.replace(/[^a-zA-Z]/g, '');
  if (/^[a-c]$/i.test(letter)) return letter.toLowerCase();
  if (/^[A-J]$/.test(letter)) return letter.toUpperCase();
  return s;
}

/**
 * @param {string} declared
 * @param {string} inferred
 */
export function answerKeysEquivalent(declared, inferred) {
  const d = normalizeAnswerKey(declared);
  const i = normalizeAnswerKey(inferred);
  if (!d || !i) return false;
  if (d === i) return true;
  if (/^[a-c]$/.test(d) && d === i.toLowerCase()) return true;
  if (/^[A-J]$/.test(d) && d === i.toUpperCase()) return true;
  return false;
}

function optionStr(o) {
  if (typeof o === 'string') return o.trim();
  if (typeof o === 'object' && o) return String(o.text ?? o.label ?? o.value ?? '').trim();
  return String(o ?? '').trim();
}

/** @param {object} batch @param {object} q */
function resolvePassageText(batch, q) {
  const pid = q.passageId;
  if (!pid || !Array.isArray(batch.passages)) return null;
  const p = batch.passages.find((x) => x.id === pid);
  const text = p?.text ? String(p.text).trim() : '';
  return text || null;
}

/**
 * @param {object} batch
 * @returns {Array<object>}
 */
export function collectAnswerKeyItems(batch) {
  const teil = inferTeil(batch);
  const items = [];
  for (let i = 0; i < (batch.questions || []).length; i++) {
    const q = batch.questions[i];
    const qt = Number(q.teil ?? teil);
    if (!isQ2ApplicableQuestion(q, qt)) continue;
    const explanation = String(q.explanation || '').trim();
    if (!explanation) continue;
    const declaredKey = normalizeAnswerKey(q.correct ?? q.correctAnswer);
    if (!declaredKey) continue;
    items.push({
      index: i,
      itemId: q.id || `questions[${i}]`,
      field: `questions[${i}]`,
      teil: qt,
      type: q.type || 'unknown',
      question: String(q.question || '').trim(),
      options: (q.options || []).map(optionStr).filter(Boolean),
      explanation,
      declaredKey,
      signText: q.signText ? String(q.signText).trim() : null,
      passageText: resolvePassageText(batch, q),
    });
  }
  return items;
}

function itemToPromptShape(item) {
  const out = {
    itemId: item.itemId,
    declaredKey: item.declaredKey,
    question: item.question,
    explanation: item.explanation,
  };
  if (item.options.length) out.options = item.options;
  if (item.signText) out.signText = item.signText;
  if (item.passageText) out.passageText = truncatePassageText(item.passageText, 1500);
  if (item.chk18bHint) {
    out.chk18bHint = {
      overlapCorrect: item.chk18bHint.overlapCorrect,
      overlapWrong: item.chk18bHint.overlapWrong,
      suspectOption: item.chk18bHint.wrongOptionLetter,
      note: 'Lexikalischer Vorfilter — bitte semantisch prüfen, nicht nur nach Wortüberlappung entscheiden.',
    };
  }
  return out;
}

/**
 * @param {object[]} items
 * @returns {string}
 */
export function buildAnswerKeyCoherencePrompt(items) {
  const payload = items.map(itemToPromptShape);
  return `${ANSWER_KEY_COHERENCE_PROMPT_HEADER}\n\nItems:\n${JSON.stringify(payload, null, 2)}`;
}

/**
 * Trunca en límite de frase/párrafo, no a mitad de palabra.
 * @param {string} text
 * @param {number} maxLen
 */
export function truncatePassageText(text, maxLen = 1500) {
  const s = String(text || '').trim();
  if (s.length <= maxLen) return s;
  const slice = s.slice(0, maxLen);
  const breakAt = Math.max(
    slice.lastIndexOf('\n\n'),
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
    slice.lastIndexOf('\n'),
  );
  if (breakAt > maxLen * 0.5) return `${slice.slice(0, breakAt + 1).trim()}…`;
  const sp = slice.lastIndexOf(' ');
  if (sp > maxLen * 0.7) return `${slice.slice(0, sp).trim()}…`;
  return `${slice.trim()}…`;
}

/** @param {string} text */
function stripResponseWrappers(text) {
  let raw = String(text || '').trim();
  const delimStart = raw.indexOf('<<<Q2_JSON>>>');
  const delimEnd = raw.indexOf('<<<END_Q2>>>');
  if (delimStart >= 0 && delimEnd > delimStart) {
    raw = raw.slice(delimStart + '<<<Q2_JSON>>>'.length, delimEnd).trim();
  }
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  return raw;
}

/**
 * Repara comillas alemanas „..." sin escapar dentro de valores motivo.
 * Escanea cada campo motivo y convierte comillas ASCII internas en apostrofes.
 * @param {string} jsonSlice
 */
export function repairMotivoQuoteBreaks(jsonSlice) {
  const marker = '"motivo": "';
  let out = '';
  let i = 0;
  const s = String(jsonSlice || '');
  while (i < s.length) {
    const idx = s.indexOf(marker, i);
    if (idx < 0) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, idx + marker.length);
    i = idx + marker.length;
    let val = '';
    while (i < s.length) {
      const ch = s[i];
      if (ch === '"') {
        const rest = s.slice(i + 1);
        if (/^\s*[,}\]]/.test(rest)) {
          i++;
          break;
        }
        val += "'";
        i++;
        continue;
      }
      if (ch === '„') {
        val += '«';
        i++;
        continue;
      }
      if (ch === '"' || ch === '"') {
        val += "'";
        i++;
        continue;
      }
      val += ch;
      i++;
    }
    out += `${val}"`;
  }
  return out;
}

/**
 * @param {string} text
 * @returns {object[]}
 */
export function parseAnswerKeyCoherenceResponse(text) {
  const raw = stripResponseWrappers(text);
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) {
    throw new Error(`Q2: respuesta LLM sin JSON array (${raw.slice(0, 120)}…)`);
  }
  const slice = raw.slice(start, end + 1);
  const attempts = [
    slice,
    repairMotivoQuoteBreaks(slice),
  ];
  let lastErr;
  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (!Array.isArray(parsed)) throw new Error('Q2: JSON no es array');
      return parsed;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Q2: JSON parse failed');
}

/**
 * @param {object} row
 * @param {object} item
 */
function findingFromLlmRow(row, item) {
  const declared = normalizeAnswerKey(row.declaredKey ?? item.declaredKey);
  const inferred = normalizeAnswerKey(row.inferredKey ?? '');
  const confidence = String(row.confidence || 'low').toLowerCase();
  const justified = row.justified === true || answerKeysEquivalent(declared, inferred);
  const mismatch = !justified && inferred && !answerKeysEquivalent(declared, inferred);

  let severity = null;
  if (mismatch) {
    if (confidence === 'high') severity = 'block';
    else if (confidence === 'medium') severity = 'warn';
  }

  if (!severity) return null;

  const escalated = Boolean(item.chk18bHint);
  return {
    rule: 'answer_key_mismatch',
    severity,
    detail: escalated
      ? `CHK-18b escalado → LLM: correct=${declared} pero explanation justifica ${inferred} (confidence=${confidence})`
      : `correct=${declared} pero explanation justifica ${inferred} (confidence=${confidence})`,
    itemId: item.itemId,
    field: item.field,
    letraDeclarada: declared,
    letraInferida: inferred,
    confidence,
    motivo: String(row.motivo || row.reason || '').trim(),
    span: item.explanation.slice(0, 160),
    source: escalated ? 'CHK-18b+LLM' : 'LLM',
  };
}

/**
 * @param {object} batch
 * @param {object} [opts]
 * @param {string} [opts.file]
 * @param {'audit'|'block'} [opts.mode]
 * @param {boolean} [opts.skipLlm]
 * @param {function} [opts.infer] — inyección para tests: (items) => Promise<rows[]>
 * @param {string} [opts.model]
 */
export async function runAnswerKeyCoherenceGate(batch, opts = {}) {
  const file = opts.file || '';
  const mode = opts.mode || 'audit';
  const findings = [];
  const items = collectAnswerKeyItems(batch);
  const stats = {
    itemsChecked: items.length,
    llmCalls: 0,
    chk18bHits: 0,
    mode,
    model: opts.model || Q2_DEFAULT_MODEL(),
  };

  if (!items.length) {
    return { ...buildVerdict(GATE_NAME, file, findings), stats };
  }

  const chk18bHits = findKeyExplanationMismatches(batch);
  const chk18bById = new Map(chk18bHits.map((h) => [h.itemId, h]));
  const llmItems = items.map((item) => {
    const hit = chk18bById.get(item.itemId);
    if (!hit) return item;
    stats.chk18bHits++;
    return {
      ...item,
      chk18bHint: {
        overlapCorrect: hit.overlapCorrect,
        overlapWrong: hit.overlapWrong,
        wrongOptionLetter: hit.wrongOptionLetter,
        message: hit.message,
      },
    };
  });

  if (llmItems.length && !opts.skipLlm) {
    const infer = opts.infer || defaultInfer;
    const chunks = chunkItems(llmItems, opts.llmChunkSize ?? 5);
    const rowById = new Map();

    for (const chunk of chunks) {
      let rows;
      try {
        rows = await infer(chunk, { model: stats.model, batch });
        stats.llmCalls++;
      } catch (err) {
        findings.push({
          rule: 'answer_key_llm_error',
          severity: 'warn',
          detail: `LLM error: ${err.message}`,
          confidence: 'low',
          motivo: err.message,
        });
        return { ...buildVerdict(GATE_NAME, file, findings), stats };
      }
      for (const row of rows) rowById.set(String(row.itemId), row);
    }

    for (const item of llmItems) {
      const row = rowById.get(item.itemId);
      if (!row) {
        findings.push({
          rule: 'answer_key_llm_missing',
          severity: 'warn',
          detail: `LLM no devolvió itemId ${item.itemId}`,
          itemId: item.itemId,
          field: item.field,
          letraDeclarada: item.declaredKey,
          confidence: 'low',
          motivo: 'Antwort fehlt in LLM-JSON',
        });
        continue;
      }
      const f = findingFromLlmRow(row, item);
      if (f) findings.push(f);
    }
  }

  const verdict = buildVerdict(GATE_NAME, file, findings);
  const wouldBlock = findings.some((f) => f.rule === 'answer_key_mismatch' && f.severity === 'block');
  const wouldWarn = findings.some((f) => f.severity === 'warn');

  return {
    ...verdict,
    stats,
    wouldBlock: mode === 'audit' ? wouldBlock : verdict.verdict === 'block',
    wouldWarn,
  };
}

async function defaultInfer(items, { model }) {
  const prompt = buildAnswerKeyCoherencePrompt(items);
  const maxTokens = Math.min(8192, 500 + items.length * 180);
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { text } = await inferJsonResponse({
      prompt,
      model,
      temperature: attempt === 0 ? 0.1 : 0,
      maxTokens,
    });
    try {
      return parseAnswerKeyCoherenceResponse(text);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Q2: parse failed after retries');
}

/** @param {object[]} items @param {number} size */
function chunkItems(items, size) {
  if (items.length <= size) return [items];
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
