# Plantilla — Hören B2 · Teil 4 (Kurzer Vortrag, 8 MCQ)

Pega TODO en Gemini. Devuelve **SOLO JSON** (1 Vortrag + 8 preguntas).

---

## FORMATO OFICIAL (Modellsatz Erwachsene)

Instrucción (debe figurar en la **primera** pregunta, al inicio del campo `question`):

`Sie hören einen kurzen Vortrag.
Sie hören den Text zweimal. Wählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.`

- **1 passage** — **monólogo** (Vortrag / Referat B2), **300–450 Wörter**, **1 Sprecher/in**.
- Escucha oficial: **2×**.
- **8 preguntas** `type: "multiple_choice"` · opciones `"a) …"`, `"b) …"`, `"c) …"`.
- `correct` / `correctAnswer`: solo `"a"`, `"b"` o `"c"`.
- Todas las preguntas con el mismo `passageId`.
- `module`: `"horen"` · `teil`: `4` · `level`: `"B2"` · `lang`: `"de"`.
- `grammarTags`: **omitir** o `[]`.

## ESTILO B2

- Estructura oral clara (Einleitung — Hauptteil — Schluss); argumentación B2 (Ursache/Wirkung, Beispiele, Einordnung).
- Marcadores: «Das bedeutet …», «Zusammenfassend …», «Aus meiner Sicht …»
- **PROHIBIDO** formato B1 T4: debate radio **3 voces**, **8× matching** «Wer sagt was?», 300–450 W con Moderator + Gäste.

## CALIDAD

1. Varía la letra correcta; ninguna letra >50 % (máx. 4/8).
2. Mezcla detalle explícito e inferencia.
3. **Anti word-matching** y distractores de longitud comparable.
4. **PROHIBIDO** diálogo con turnos de varios hablantes (solo Vortrag).

## EXPLICACIONES (CHK-34)

- Alemán, ≥10 Wörter; fundamenta con ideas del Vortrag parafraseadas.
- **PROHIBIDO** «Option a/b/c)» o citas literales de la opción correcta entre comillas.

## CAMPO `audio` (TTS)

`"audio"`: **1 turno** (o bloques del mismo `speaker`) · una `voiceId` · texto sin prefijo de rol.

## PALABRAS OBJETIVO
<<< vortrag, these, beispiel, folge, gesellschaft, bildung, wirtschaft, entwicklung, argument, zusammenfassung >>>

## AUTORREVISIÓN

- ¿Instrucción oficial en **Q1**?
- ¿1 monólogo 300–450 W (no debate/matching)?
- ¿8 MCQ?
- ¿level B2 · grammarTags omitidos?
- ¿Explicaciones CHK-34?

## Formato de salida

Devuelve SOLO `{ "passages": [...], "questions": [...] }`.

- Passage: `gen-p-h4-XXXX`
- Questions: `gen-q-h4-XXXX-q1` … `q8`

```json
{
  "passages": [
    {
      "id": "gen-p-h4-XXXX",
      "module": "horen",
      "teil": 4,
      "level": "B2",
      "title": "Vortrag: …",
      "text": "Sehr geehrte Damen und Herren, …",
      "passageVocab": ["vortrag", "these", "entwicklung"],
      "audio": [
        { "speaker": "Referentin", "voiceId": "de-DE-KatjaNeural", "text": "…" }
      ]
    }
  ],
  "questions": [
    {
      "id": "gen-q-h4-XXXX-q1",
      "module": "horen",
      "teil": 4,
      "level": "B2",
      "type": "multiple_choice",
      "question": "Sie hören einen kurzen Vortrag.\nSie hören den Text zweimal. Wählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.\n\nWas nennt die Referentin als Hauptursache des Problems?",
      "options": ["a) …", "b) …", "c) …"],
      "correct": "a",
      "correctAnswer": "a",
      "explanation": "Sie führt die Entwicklung auf fehlende langfristige Planung zurück, nicht auf Einzelfehler.",
      "passageId": "gen-p-h4-XXXX",
      "lang": "de",
      "skills": ["listening"]
    }
  ]
}
```

Genera el **Vortrag completo** y **8 preguntas** (q1–q8). Devuelve solo el JSON.
