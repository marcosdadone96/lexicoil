# Plantilla — Lesen B2 · Teil 3 (Zeitungsartikel MCQ, integrado)

Pega TODO en Gemini. Devuelve **SOLO JSON** (1 Artikel + 6 MCQ en **una** pasada).

---

## FORMATO OFICIAL (Modellsatz Erwachsene)

Instrucción (debe figurar en la **primera** pregunta, al inicio del campo `question`):

`Lesen Sie in einer Zeitung einen Artikel.
Wählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.`

- **1 Zeitungsartikel** (`passages[0]`, **350–500 Wörter**), registro informativo B2 (reportaje, datos, citas breves).
- **6× multiple_choice** a/b/c; cada pregunta evalúa **un dato distinto** del artículo (no la misma idea parafraseada).
- `passageId` en cada pregunta → `passages[0].id`.
- `level`: `"B2"` · `grammarTags`: **omitir** o `[]`.
- **PROHIBIDO** formato B1 Teil 3 (10 anuncios A–J, matching clasificados, «Herr Ott»).

## Reglas estrictas

1. **Anti word-matching:** ninguna pregunta ni opción correcta con **≥4 palabras seguidas** del artículo; parafrasea.
2. **MCQ:** tres opciones `"a) …"`, `"b) …"`, `"c) …"`; varía la letra correcta; distractores plausibles y **longitud comparable** (sin pista por tamaño).
3. **Explicaciones (CHK-34):** alemán ≥10 Wörter; explica por qué encaja con el texto; **sin** citar literal la opción correcta ni «Option a/b/c)».
4. **Preguntas:** vocabulario claro B2 en enunciados (evita jerga C1 en preguntas/opciones).
5. **PROHIBIDO** negrita `**`; sustantivos alemanes en mayúscula.

## PALABRAS OBJETIVO
<<< Digitalisierung, Gesellschaft, Nachhaltigkeit, Politik, Verantwortung, Entwicklung >>>

## AUTORREVISIÓN

- ¿350–500 Wörter en el artículo?
- ¿6 MCQ + instrucción oficial en Q1?
- ¿Opción correcta no copia ≥4 palabras del artículo?
- ¿Explicaciones CHK-34 friendly?

## Formato de salida

Devuelve SOLO `{ "passages": [...], "questions": [...] }`.

```json
{
  "passages": [
    {
      "id": "gen-l3-XXXX",
      "module": "lesen",
      "teil": 3,
      "level": "B2",
      "title": "Zeitungsüberschrift …",
      "text": "Artikeltext …",
      "topicTag": "Thema"
    }
  ],
  "questions": [
    {
      "id": "gen-q-3-XXXX-1",
      "module": "lesen",
      "teil": 3,
      "level": "B2",
      "type": "multiple_choice",
      "question": "Lesen Sie in einer Zeitung einen Artikel.\nWählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.\n\nWas ist laut Artikel …?",
      "options": ["a) …", "b) …", "c) …"],
      "correct": "b",
      "correctAnswer": "b",
      "explanation": "…",
      "passageId": "gen-l3-XXXX"
    }
  ]
}
```
