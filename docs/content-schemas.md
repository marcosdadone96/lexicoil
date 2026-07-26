# Esquemas de contenido y umbrales de gates — LexiCoil

Referencia para generadores (humanos e IAs) antes de enviar batches al inbox.
Validación real: `node scripts/analyze-inbox.mjs --fix-suggestions`.

---

## Lesen B1 · Teil 3 (matching anuncios)

### Esquema JSON correcto

| Regla | Detalle |
|-------|---------|
| `passages` | `[]` (vacío — **no** hay pasaje prose) |
| Anuncios | **10 líneas A–J** dentro de `questions[].options` |
| Formato línea | `"a) Título neutro — Texto del anuncio (25–45 palabras)."` |
| Repetición | **El mismo array `options` en las 7 preguntas** (copia exacta) |
| Preguntas | **Exactamente 7**, `type: "matching"`, `module: "lesen"`, `teil: 3` |
| `correct` | Letra `A`–`J` (mayúscula/minúscula OK) o `"0"` (ningún anuncio encaja) |
| Respuesta `"0"` | **Al menos 1** de las 7 preguntas debe tener `"correct": "0"` |
| Beispiel | **No** como ítem puntuable — va en la consigna del examen, no como question extra |

### ❌ Schema alternativo NO soportado

```json
{
  "ads": [{ "key": "A", "title": "...", "text": "..." }],
  "questions": [{ "options": ["A", "B", "C", "..."] }]
}
```

El checker (`getOptionByLetter`) busca el patrón **`A)` / `a)` + texto**. Letras sueltas en `options[]` fallan con *«no se encuentra la opción correcta X»*.

### Referencia que pasa el gate

Archivo: `batches/ready/pool-verified/B1/lesen-t3-auto-3258cv.json`

Fragmento mínimo:

```json
{
  "passages": [],
  "questions": [
    {
      "module": "lesen",
      "teil": 3,
      "type": "matching",
      "question": "Bei Lena ist das Display ihres Handys gesprungen…",
      "options": [
        "a) Packprofi — Wir packen bei Ihrem Umzug an…",
        "b) WohnTraum — Wir vermitteln zwei- und Dreizimmerwohnungen…",
        "c) PhoneFix — Wir reparieren Smartphones und Tablets…",
        "…",
        "j) Tierpension — Pflege Ihres Hundes im Urlaub…"
      ],
      "correct": "C",
      "correctAnswer": "C"
    }
  ]
}
```

Plantilla detallada: `plantillas-lesen-b1/lesen-teil3.md`.

### Calidad pedagógica T3 (gate `calidad-pedagogica`)

- **Anti word-matching:** situación ↔ anuncio correcto comparten **< 2** tokens de contenido (≥4 letras).
- **Titular neutro:** el título del anuncio correcto no debe delatar la respuesta (≤1 palabra compartida con la situación).
- **Distractores temáticos:** cada situación con respuesta A–J necesita **≥2 competidores** plausibles de la misma familia temática entre los otros anuncios.
- **≥6 letras distintas** como respuesta correcta entre las 7 preguntas.
- **≥4 anuncios** con restricción temporal (`Mo–Fr`, `Sa 10–14`, `nur mit Termin`, etc.).

---

## CEFR gate (pre-ingest) — Lesen T2/T5 y pasajes

El gate mide el **texto de lectura combinado** del batch (todos los pasajes del Teil).

### Umbrales B1 (Goethe)

| Métrica | Rango / umbral | Notas |
|---------|----------------|-------|
| **subordinatePct** | **[4, 45]%** | ⚠️ **Tiene suelo Y techo.** 0% falla igual que 60%. Cuenta oraciones con: `weil`, `dass`, `wenn`, `ob`, `obwohl`, `während`, `nachdem`, `bevor`, `damit`, `sodass`, `falls`, `sobald`. `denn` **no cuenta**. |
| **avgSentenceLen** | **[10, 22]** palabras/oración | Promedio sobre oraciones del texto |
| **coverageVsLevel** | **≥ 55%** | % de tokens en lista CEFR B1; palabras raras listadas pero no bloquean si cobertura OK |
| **wordCount** | **≥ 150** (combinado) | Mínimo del texto más largo / combinado según blueprint |
| **inferencePct** | **≤ 35%** | % de preguntas marcadas inference/global (T2 suele ser 0%) |

### Otros niveles (COMPLEXITY en `js/engine/validation/CefrGate.js`)

| Nivel | avgSentenceLen | subordinatePct | inferencePct máx |
|-------|----------------|----------------|------------------|
| A1 | [4, 10] | [0, 8] | — |
| A2 | [6, 14] | [0, 12] | — |
| B1 | [10, 22] | **[4, 45]** | 35% |
| B2 | [14, 28] | [8, 45] | — |
| C1 | [18, 35] | [12, 55] | — |
| C2 | [20, 42] | [15, 65] | — |

Cobertura léxica: umbral por defecto **55%** (`CEFR_MIN_COVERAGE` en env para override).

### Auto-verificación local

```powershell
node scripts/check-cefr-lesen.mjs --file batches/inbox/lesen-t2-claude-test.json --teil 2
```

---

## Blacklist léxica C1/C2 (sweep-blacklist + audit CHK-6)

Activa en **todo texto** del batch (passages, questions, options, explanations).

Ejemplos confirmados que bloquean:

| Término | Sugerencia B1 | Gate |
|---------|---------------|------|
| **Workshop** | Kurs / Seminar / Werkstatt | sweep-blacklist |
| **Aspekte** | Teil / Punkt | audit CHK-6 (B2+ en questions) |
| **Klarheit** | deutlich / verständlich | audit CHK-6 |
| **Herausforderung** | Problem / Schwierigkeit | audit CHK-6 |
| gardening, jogging, hiking | equivalentes alemanes | sweep-blacklist |

Lista completa: `scripts/blacklist.mjs` (`BLACKLIST`, `B2_QUESTION_BLACKLIST`).

---

## Flujo recomendado antes del inbox

1. Generar JSON según plantilla del Teil.
2. `node scripts/check-cefr-lesen.mjs --file …` (T2/T5) o `node scripts/analyze-inbox.mjs --fix-suggestions` (cualquier módulo).
3. Corregir errores concretos del resumen (métrica + valor + rango).
4. `node scripts/paste-lesen-inbox.mjs` / `paste-exam-inbox.mjs` solo cuando analyze-inbox marque ✅.
