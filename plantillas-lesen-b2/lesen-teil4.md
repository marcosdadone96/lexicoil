# Plantilla — Lesen B2 · Teil 4 (Meinung ↔ Überschrift, integrado)

Pega TODO en Gemini. Devuelve **SOLO JSON** (6 Meinungsäußerungen + 8 Überschriften + 6 Aufgaben en **una** pasada).

---

## FORMATO OFICIAL (Modellsatz Erwachsene)

Instrucción (debe figurar en la **primera** pregunta, al inicio del campo `question`):

`Lesen Sie in einer Zeitschrift Meinungsäußerungen.
Welche Äußerung passt zu welcher Überschrift? Eine Äußerung passt nicht.`

- **6 Meinungsäußerungen** → `passages[0]` … `passages[5]`, cada una **40–100 Wörter** (`text`), registro Zeitschrift (3ª persona o Zitat-Stil, no foro Ja/Nein B1).
- **8 Überschriften** opción **A–H** (misma lista en las 6 preguntas); estilo titular de revista (conciso, no frase completa de blog).
- **6 matching**: cada Äußerung tiene **exactamente una** Überschrift correcta (letra A–H); **6 letras distintas** usadas como correctas; **2 Überschriften** nunca son la clave correcta (sobrantes en el pool).
- La consigna oficial habla de una Äußerung que «no passt» en sentido global del examen; en el JSON generamos **6 pares claros** opinión↔titular + **2 titulares distractor** que no deben ser la mejor opción para ninguna de las 6 opiniones.
- `type`: `"matching"` · `level`: `"B2"`.
- `grammarTags`: **omitir** o `[]` (post-proceso; 6 categorías B2 oficiales).

## Reglas estrictas

1. **Univocidad:** cada Überschrift correcta encaja **solo** con su Meinung; ningún otro titular debe ser igualmente plausible (misma postura, mismos argumentos clave).
2. **Titulares:** no copies frases literales de la opinión; parafrasea el **ángulo** (pro/con/neutral). Los **2 titulares sobrantes** deben sonar creíbles en el tema pero **no** resumir ninguna de las 6 opiniones mejor que la clave designada.
3. **Opiniones distintas:** 6 posturas o matices **diferentes** sobre el mismo tema de actualidad (topicTag coherente).
4. **Opciones:** en cada pregunta, `options` = 8 strings `"A) …"` … `"H) …"` (mismo texto en las 6 preguntas).
5. **Preguntas:** `question` = `Meinung (1): Welche Überschrift passt?` etc.; la pregunta 1 lleva la **instrucción oficial** arriba separada por `\n\n`.
6. **`passageId`:** cada pregunta apunta al `id` de **su** passage (Meinung 1 → passages[0], …).
7. **PROHIBIDO** formato B1 foro (`ja_nein`, «Ist X für den Vorschlag?», `signText` en lugar de passages).
8. **PROHIBIDO** negrita `**`; sustantivos alemanes en mayúscula; sin anglicismos sin adaptar.

## PALABRAS OBJETIVO
<<< Digitalisierung, Gesellschaft, Nachhaltigkeit, Medien, Verantwortung, Entwicklung >>>

## AUTORREVISIÓN

- ¿6 passages 40–100 Wörter cada uno?
- ¿8 Überschriften A–H + 6 correctas distintas + 2 sobrantes?
- ¿Probaste cada titular contra las **otras** cinco Meinungen (debe fallar)?
- ¿Instrucción oficial en Q1?
- ¿topicTag alineado al tema?

## Formato de salida

Devuelve SOLO `{ "passages": [...], "questions": [...] }`.

```json
{
  "passages": [
    {
      "id": "gen-l4-XXXX-1",
      "module": "lesen",
      "teil": 4,
      "level": "B2",
      "title": "Meinung 1",
      "text": "Kurzer Meinungsäußerungstext …",
      "topicTag": "Thema"
    }
  ],
  "questions": [
    {
      "id": "gen-q-4-XXXX-1",
      "module": "lesen",
      "teil": 4,
      "level": "B2",
      "type": "matching",
      "question": "Lesen Sie in einer Zeitschrift Meinungsäußerungen.\nWelche Äußerung passt zu welcher Überschrift? Eine Äußerung passt nicht.\n\nMeinung (1): Welche Überschrift passt zu dieser Äußerung?",
      "options": [
        "A) Erste Überschrift …",
        "B) Zweite …",
        "C) …",
        "D) …",
        "E) …",
        "F) …",
        "G) …",
        "H) Achte Überschrift …"
      ],
      "correct": "C",
      "correctAnswer": "C",
      "passageId": "gen-l4-XXXX-1",
      "explanation": "…",
      "lang": "de"
    }
  ]
}
```
