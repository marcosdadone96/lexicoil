# Plantilla — Lesen B2 · Teil 2 (Sätze einfügen, integrado)

Pega TODO en Gemini. Devuelve **SOLO JSON** (texto + 8 Sätze + 6 Aufgaben en **una** pasada).

---

## FORMATO OFICIAL (Modellsatz Erwachsene)

Instrucción (debe figurar en la **primera** pregunta, al inicio del campo `question`):

`Lesen Sie in einer Zeitschrift einen Artikel.
Welche Sätze passen in die Lücken? Zwei Sätze passen nicht.`

- **1 Artikel** Zeitschrift (`passages[0]`, **250–400 Wörter**).
- **6 Lücken** numeradas **(21)** … **(26)** en el texto del artículo (exactamente 6 marcadores).
- **8 Sätze** opción **A–H** (misma lista en las 6 preguntas).
- **6 matching**: cada hueco tiene **exactamente una** respuesta correcta (letra A–H); **6 letras distintas** usadas; **2 letras** nunca son correctas (Sätze sobrantes).
- `type`: `"matching"` · `level`: `"B2"`.
- `grammarTags`: **omitir** o `[]` (post-proceso; 6 categorías B2 oficiales).

## Reglas estrictas

1. **Coherencia:** cada Satz encaja **solo** en su Lücke designada (conectores, tiempo verbal, referentes). Los **2 Sätze sobrantes** deben sonar plausible en alemán pero **no** encajar bien en ninguna Lücke.
2. **Sin ambigüedad:** ningún Satz (incluso distractor) debe poder insertarse en **dos** Lücken con la misma naturalidad.
3. **Marcadores:** usa `(21)`, `(22)`, `(23)`, `(24)`, `(25)`, `(26)` en `passages[0].text` — sin otros números de Lücke.
4. **Opciones:** en cada pregunta, `options` = 8 strings `"A) …"` … `"H) …"` (mismo texto en las 6 preguntas).
5. **Preguntas:** `question` = `Lücke (21): …` etc.; la pregunta 1 lleva la **instrucción oficial** arriba separada por `\n\n`.
6. **PROHIBIDO** negrita `**` en el artículo; sustantivos alemanes en mayúscula.
7. **PROHIBIDO** copiar un Satz opción **literalmente** ya presente en el artículo.
8. Registro **B2** (Zeitschrift): informativo-opinativo, no blog ich-B1.

## PALABRAS OBJETIVO
<<< Digitalisierung, Gesellschaft, Nachhaltigkeit, Bildung, Verantwortung, Entwicklung >>>

## AUTORREVISIÓN

- ¿250–400 Wörter en el artículo?
- ¿6 marcadores (21)–(26)?
- ¿8 Sätze A–H + 6 correctas distintas + 2 sobrantes?
- ¿Probaste mentalmente cada Satz en otras Lücken (debe fallar)?
- ¿Instrucción oficial en Q1?

## Formato de salida

Devuelve SOLO `{ "passages": [...], "questions": [...] }`.

```json
{
  "passages": [
    {
      "id": "gen-l2-XXXX",
      "module": "lesen",
      "teil": 2,
      "level": "B2",
      "title": "Titel des Artikels",
      "text": "Einleitung … (21) … Fortsetzung … (22) … (23) … (24) … (25) … (26) … Schluss.",
      "topicTag": "Thema"
    }
  ],
  "questions": [
    {
      "id": "gen-q-2-XXXX-1",
      "module": "lesen",
      "teil": 2,
      "level": "B2",
      "type": "matching",
      "question": "Lesen Sie in einer Zeitschrift einen Artikel.\nWelche Sätze passen in die Lücken? Zwei Sätze passen nicht.\n\nLücke (21): Welcher Satz passt hier?",
      "options": [
        "A) Erster Satz …",
        "B) Zweiter Satz …",
        "C) …",
        "D) …",
        "E) …",
        "F) …",
        "G) …",
        "H) Achter Satz …"
      ],
      "correct": "C",
      "correctAnswer": "C",
      "passageId": "gen-l2-XXXX",
      "explanation": "Sat C schließt thematisch an den Absatz vor (21) an und verweist auf …",
      "lang": "de"
    }
  ]
}
```

- IDs únicos; no copies el ejemplo.
