# Plantilla — Hören B2 · Teil 2 (Radiointerview Wissenschaft, 6 MCQ)

Pega TODO en Gemini. Devuelve **SOLO JSON** (1 Interview + 6 preguntas).

---

## FORMATO OFICIAL (Modellsatz Erwachsene)

Instrucción (debe figurar en la **primera** pregunta, al inicio del campo `question`):

`Sie hören im Radio ein Interview mit einer Persönlichkeit aus der Wissenschaft.
Sie hören den Text zweimal. Wählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.`

- **1 passage** — transcripción de **entrevista radiofónica** (Moderator/in + Wissenschaftler/in), **280–400 Wörter**.
- Escucha oficial: **2×** (no meta-texto en el JSON).
- **6 preguntas** `type: "multiple_choice"` · opciones `"a) …"`, `"b) …"`, `"c) …"`.
- `correct` / `correctAnswer`: solo `"a"`, `"b"` o `"c"`.
- Todas las preguntas con el mismo `passageId`.
- `module`: `"horen"` · `teil`: `2` · `level`: `"B2"` · `lang`: `"de"`.
- `grammarTags`: **omitir** o `[]`.

## ESTILO B2

- Tema científico accesible B2 (Klima, Medizin, Psychologie, Digitalisierung, Energie…).
- Turnos `Name:` (Moderator + Experte/Expertin); registro Sie; preguntas del entrevistador + respuestas desarrolladas.
- **PROHIBIDO** formato B1: monólogo único 240–300 W, **5** MCQ, escucha **1×**.

## CALIDAD

1. Varía la letra correcta (no 6× `"b"`).
2. Mezcla hechos explícitos e inferencia/paráfrasis.
3. **Anti word-matching:** preguntas y opciones correctas sin **≥4 palabras seguidas** del transcript.
4. Distractores temáticamente coherentes; longitud comparable (anti-atajo por longitud).

## EXPLICACIONES (CHK-34)

- Alemán, ≥10 Wörter; resume la evidencia del audio.
- **PROHIBIDO** «Option a/b/c)», «die richtige Antwort ist b)» o comillas con el texto literal de la opción marcada como correcta.
- Explica el **contenido** de la solución en prosa parafraseada.

## CAMPO `audio` (TTS)

`"audio"`: turnos alternados Moderator + Gast; **2 voiceId distintas**; `text` sin prefijo `Name:`.

## PALABRAS OBJETIVO
<<< forschung, studie, ergebnis, wissenschaft, interview, gesellschaft, technologie, umwelt, erklärung, zukunft >>>

## AUTORREVISIÓN

- ¿Instrucción oficial en **Q1**?
- ¿1 passage 280–400 Wörter, formato Interview (no monólogo)?
- ¿6 MCQ con `options` como array de strings?
- ¿level B2 · grammarTags omitidos?
- ¿Explicaciones CHK-34 (sin citas de opciones)?

## Formato de salida

Devuelve SOLO `{ "passages": [...], "questions": [...] }`.

- Passage: `gen-p-h2-XXXX`
- Questions: `gen-q-h2-XXXX-q1` … `q6`

```json
{
  "passages": [
    {
      "id": "gen-p-h2-XXXX",
      "module": "horen",
      "teil": 2,
      "level": "B2",
      "title": "Interview: …",
      "text": "Moderator: …\nProf. Keller: …",
      "passageVocab": ["forschung", "studie", "ergebnis"],
      "audio": [
        { "speaker": "Moderator", "voiceId": "de-DE-ConradNeural", "text": "…" },
        { "speaker": "Prof. Keller", "voiceId": "de-DE-KatjaNeural", "text": "…" }
      ]
    }
  ],
  "questions": [
    {
      "id": "gen-q-h2-XXXX-q1",
      "module": "horen",
      "teil": 2,
      "level": "B2",
      "type": "multiple_choice",
      "question": "Sie hören im Radio ein Interview mit einer Persönlichkeit aus der Wissenschaft.\nSie hören den Text zweimal. Wählen Sie bei jeder Aufgabe die richtige Lösung a, b oder c.\n\nWorauf weist die Forscherin im ersten Abschnitt hin?",
      "options": ["a) …", "b) …", "c) …"],
      "correct": "c",
      "correctAnswer": "c",
      "explanation": "Zu Beginn betont sie die Langzeitwirkung der Daten — nicht einen kurzfristigen Trend.",
      "passageId": "gen-p-h2-XXXX",
      "lang": "de",
      "skills": ["listening"]
    }
  ]
}
```

Genera el **interview completo** y **6 preguntas** (q1–q6). Devuelve solo el JSON.
