# Q2 — answerKeyCoherenceGate

**Estado:** dry-run (2026-07-09) — no bloquea pipeline  
**Módulo:** `scripts/lib/qualityGates/answerKeyCoherenceGate.mjs`

---

## Modelo / API

| Parámetro | Valor |
|-----------|-------|
| **API** | Anthropic Messages API (`scripts/lib/llmJsonClient.mjs`) |
| **Modelo por defecto** | `claude-haiku-4-5` |
| **Override** | `Q2_ANSWER_KEY_MODEL` o `CLAUDE_GEN_MODEL` en `.env` |
| **Fallback** | Gemini si `Q2_ANSWER_KEY_MODEL=gemini-…` y API disponible |
| **Llamadas** | **1 por archivo** (batch Lesen = 1 Teil), con todos los ítems MCQ/matching/ja_nein/RF en un solo prompt |
| **Pre-filtro CHK-18b** | `keyExplanationGate.mjs` — overlap léxico sospechoso **escala al LLM** (no auto-block). Incluye `passageText` + `chk18bHint` en el prompt. |

**Recalibración 2026-07-09 (P1):** CHK-18b ya no asigna `confidence=high` sin LLM. Solo marca ítems para arbitraje semántico. Decisión final siempre del LLM.

**Cluster Lena (6 archivos):** ver `gate-logs/Q2-LENA-CLUSTER-DISCARD.json` — `no-promote` hasta regeneración desde blueprint corregido.

Equivalente al Haiku del diseño original: modelo flash barato ya integrado en el stack de generación.

---

## Prompt exacto (cabecera fija)

El cuerpo completo se construye en `buildAnswerKeyCoherencePrompt()` — cabecera + `Items:` + JSON de ítems.

```
Du bist Auditor für Goethe-Zertifikat B1 Lesen (Deutsch).

Aufgabe: Prüfe für JEDES Item, ob die Erklärung (explanation) die deklarierte Antwort (declaredKey) wirklich rechtfertigt.

Regeln:
1. Lies question, options (falls vorhanden), signText (falls vorhanden), explanation und declaredKey.
2. Leite aus der explanation ab, welche Antwort begründet wird — als inferredKey.
3. inferredKey muss exakt dem Antwortformat entsprechen:
   - MCQ Teil 2/5: Kleinbuchstabe a, b oder c (nur der Buchstabe)
   - Matching Teil 3: Großbuchstabe A–J (nur der Buchstabe)
   - Teil 4 ja_nein: "Ja" oder "Nein" (nicht a)/b))
   - Teil 1 richtig_falsch: "Richtig" oder "Falsch"
4. confidence:
   - "high": die explanation begründet eindeutig genau eine Antwort
   - "medium": die explanation deutet auf eine Antwort, aber nicht völlig eindeutig
   - "low": die explanation ist zu vage; keine klare Zuordnung möglich
5. motivo: ein kurzer deutscher Satz (max 25 Wörter), warum inferredKey gewählt wurde.
6. justified: true wenn inferredKey dieselbe Antwort wie declaredKey ist (semantisch).

Antworte NUR mit einem JSON-Array, ein Objekt pro itemId, ohne Markdown:
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

Items:
[ ... JSON de ítems ... ]
```

---

## Umbrales

| Condición | Acción (dry-run) | Acción (futuro block) |
|-----------|------------------|------------------------|
| `confidence=high` + mismatch (LLM) | `wouldBlock` en log | **block** |
| `confidence=medium` + mismatch | `wouldWarn` en log | **warn** |
| `confidence=low` | sin finding | sin acción |
| CHK-18b overlap | escala a LLM con `chk18bHint`; **no** auto-block | LLM decide |

---

## Tests

```bash
node scripts/lib/qualityGates/__tests__/answerKeyCoherenceGate.test.mjs
node scripts/lib/qualityGates/__tests__/answerKeyCoherenceGate.test.mjs --live
```

Fixtures: `scripts/lib/qualityGates/__fixtures__/answerKeyCoherence/`

| Fixture | Esperado |
|---------|----------|
| `mismatch-horen2-lesen.json` | block (caso Hören T2 adaptado; CHK-18b + LLM) |
| `correct-aligned.json` | pass |
| `ambiguous-vague.json` | warn medium (no block) |

---

## Dry-run

```bash
node scripts/run-q2-answer-key-dryrun.mjs
node scripts/run-q2-answer-key-dryrun.mjs --limit 50
```

Corpus: holdout ~230 + backlog ~587 (dedupe por nombre de archivo).

Salida:
- `gate-logs/dryrun-Q2-answerKeyCoherence-*.jsonl`
- `gate-logs/Q2-DRYRUN-REPORT.json`
- `gate-logs/Q2-DRYRUN-REPORT.md`

---

## Estimación coste / latencia (producción)

| Métrica | Estimación |
|---------|------------|
| **Llamadas LLM / archivo** | 1 (todos los ítems del Teil en un prompt) |
| **Ítems / archivo** | ~6–7 (T1 RF×6, T2 MCQ×6, T3 matching×7, T4 ja/nein×6, T5 MCQ×6) |
| **Tokens input / archivo** | ~1.500–3.500 (prompt + ítems) |
| **Tokens output / archivo** | ~200–600 (JSON array) |
| **Coste Haiku 4.5 / archivo** | ~$0.001–0.003 |
| **Coste / 100 archivos generados** | ~$0.10–0.30 |
| **Latencia / archivo** | ~2–6 s (rate limit + red) |
| **Latencia añadida al pipeline** | +2–6 s por pieza Lesen generada |

**Optimización futura:** agrupar 3–5 archivos del mismo Teil en una sola llamada reduciría coste ~60–80 %, a cambio de prompts más largos y parsing más frágil.

**CHK-18b** evita LLM en ítems con overlap léxico obvio (~subset T2/T5 MCQ).

---

## Formato de log

```json
{
  "gate": "Q2-answerKeyCoherence",
  "file": "batches/generated/lesen-t2-gemini-091.json",
  "verdict": "block",
  "findings": [{
    "rule": "answer_key_mismatch",
    "severity": "block",
    "letraDeclarada": "a",
    "letraInferida": "b",
    "confidence": "high",
    "motivo": "…",
    "detail": "…"
  }],
  "stats": { "llmCalls": 1, "itemsChecked": 6, "chk18bHits": 0 },
  "wouldBlock": true,
  "mode": "audit"
}
```
