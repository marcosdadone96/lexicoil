# Plantilla — Lesen B2 · Teil 5 (Studienordnung ↔ Überschriften, integrado)

Pega TODO en Gemini. Devuelve **SOLO JSON** (1 Studienordnung + 7 Überschriften + 3 Aufgaben en **una** pasada).

---

## FORMATO OFICIAL (Modellsatz Erwachsene)

Instrucción (debe figurar en la **primera** pregunta, al inicio del campo `question`):

`Lesen Sie die Studienordnung.
Welche Überschriften aus dem Inhaltsverzeichnis passen zu den Paragrafen? Vier Überschriften werden nicht gebraucht.`

- **1 Studienordnung** (`passages[0].text`, **200–350 Wörter**), registro normativo B2 (Prüfungen, ECTS, Fristen, Pflichten).
- **3 Paragrafen** marcados en el texto con **(31)**, **(32)**, **(33)** (exactamente 3 marcadores; cada § trata un tema distinto).
- **7 Überschriften** opción **A–G** (misma lista en las 3 preguntas), estilo Inhaltsverzeichnis (sin punto final).
- **3 matching**: cada Paragraf tiene **exactamente una** Überschrift correcta; **3 letras distintas** usadas; **4 Überschriften** nunca son correctas.
- `type`: `"matching"` · `level`: `"B2"`.
- `grammarTags`: **omitir** o `[]`.

## Reglas estrictas

1. **Univocidad:** cada Überschrift encaja **solo** en su Paragraf (31)/(32)/(33); ningún otro titular debe ser igualmente plausible.
2. **Los 4 titulares sobrantes** deben sonar creíbles en una Studienordnung pero **no** resumir mejor ningún Paragraf que la clave designada.
3. **Opciones:** en cada pregunta, `options` = 7 strings `"A) …"` … `"G) …"` (idénticos en las 3 preguntas).
4. **Preguntas:** `Paragraf (31): Welche Überschrift passt?` etc.; Q1 lleva la **instrucción oficial** arriba (`\n\n`).
5. **`passageId`:** las 3 preguntas apuntan al mismo `passages[0].id`.
6. **PROHIBIDO** formato B1 T5 MCQ a/b/c con 4 preguntas; **PROHIBIDO** Hausordnung B1 corta (185–230 W).
7. Sustantivos en mayúscula; sin `**`; registro administrativo-académico B2.

## PALABRAS OBJETIVO
<<< Prüfung, Studium, Modul, Frist, ECTS, Nachweis, Zulassung, Bachelor >>>

## AUTORREVISIÓN

- ¿200–350 Wörter en passages[0].text?
- ¿Marcadores (31), (32), (33)?
- ¿7 Überschriften A–G + 3 correctas distintas + 4 sobrantes?
- ¿Probaste cada titular contra los otros dos Paragrafen?
- ¿Instrucción oficial en Q1?

## Formato de salida

Devuelve SOLO `{ "passages": [...], "questions": [...] }`.

```json
{
  "passages": [
    {
      "id": "gen-l5-XXXX",
      "module": "lesen",
      "teil": 5,
      "level": "B2",
      "title": "Studienordnung …",
      "text": "Präambel … (31) … weiter … (32) … (33) … Schluss.",
      "topicTag": "Bildung"
    }
  ],
  "questions": [
    {
      "id": "gen-q-5-XXXX-1",
      "module": "lesen",
      "teil": 5,
      "level": "B2",
      "type": "matching",
      "question": "Lesen Sie die Studienordnung.\nWelche Überschriften aus dem Inhaltsverzeichnis passen zu den Paragrafen? Vier Überschriften werden nicht gebraucht.\n\nParagraf (31): Welche Überschrift passt zu diesem Paragrafen?",
      "options": [
        "A) Erste Überschrift …",
        "B) …",
        "C) …",
        "D) …",
        "E) …",
        "F) …",
        "G) Siebte Überschrift …"
      ],
      "correct": "C",
      "correctAnswer": "C",
      "passageId": "gen-l5-XXXX",
      "explanation": "…",
      "lang": "de"
    }
  ]
}
```
