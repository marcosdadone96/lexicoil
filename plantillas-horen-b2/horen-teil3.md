# Plantilla — Hören B2 · Teil 3 (Radiogespräch Panel, Wer sagt das?)

Pega TODO en Gemini. Devuelve **SOLO JSON** (1 Panel + 6 matching).

---

## FORMATO OFICIAL (Modellsatz Erwachsene)

Instrucción (debe figurar en la **primera** pregunta, al inicio del campo `question`):

`Sie hören im Radio ein Gespräch mit mehreren Personen.
Sie hören den Text einmal. Wählen Sie bei jeder Aufgabe: Wer sagt das?`

- **1 passage** — **Radiogespräch / Panel** con **4 hablantes** (p. ej. Moderator + 3 Gäste o 4 expertos con roles claros), **250–380 Wörter**.
- Escucha oficial: **1×**.
- **6 preguntas** `type: "matching"` — cada `question` es una **Aussage parafraseada** (¿quién lo dijo?).
- `options` **idénticas en las 6 preguntas** — exactamente **4 strings**:
  `"A) Name oder Rolle …"`, `"B) …"`, `"C) …"`, `"D) …"`
- `correct` / `correctAnswer`: `"A"`, `"B"`, `"C"` o `"D"` (mayúscula, sin paréntesis en el valor).
- Todas las preguntas con el mismo `passageId`.
- `module`: `"horen"` · `teil`: `3` · `level`: `"B2"` · `lang`: `"de"`.
- `grammarTags`: **omitir** o `[]`.

## ESTILO B2

- Turnos `Name:` o `Rolle:`; mínimo **14 turnos**; posturas diferenciadas (acuerdo/desacuerdo/matices).
- **PROHIBIDO** formato B1: diálogo **2 personas**, **7× richtig_falsch**, 220–320 W.

## DISTRIBUCIÓN

- Cada letra A–D debe ser `correct` **al menos 1 vez**; ninguna letra >50 % (máx. 3/6).
- Las 6 afirmaciones deben ser **parafraseadas** (anti word-matching: no ≥4 palabras seguidas del transcript).

## EXPLICACIONES (CHK-34)

- Alemán, ≥10 Wörter; indica **qué idea** del panel respalda la atribución.
- **PROHIBIDO** citar entre comillas el texto de `"A) …"`/`"B) …"` ni la opción correcta literal.
- No escribas «Person B sagt …» copiando el string de `options`; usa el **nombre/rol** en prosa sin comillas de la opción.

## CAMPO `audio` (TTS)

`"audio"`: **4 voiceId distintas** (una por hablante panel); orden de aparición; `text` sin prefijo `Name:`.

## PALABRAS OBJETIVO
<<< diskussion, meinung, argument, gesellschaft, medien, politik, lösung, konsequenz, erfahrung, vorschlag >>>

## AUTORREVISIÓN

- ¿Instrucción oficial en **Q1**?
- ¿1 passage 250–380 W, **4** hablantes?
- ¿6 matching con mismas 4 options A–D?
- ¿PROHIBIDO 7 RF / 2 hablantes B1?
- ¿Explicaciones CHK-34?

## Formato de salida

Devuelve SOLO `{ "passages": [...], "questions": [...] }`.

- Passage: `gen-p-h3-XXXX`
- Questions: `gen-q-h3-XXXX-q1` … `q6`

```json
{
  "passages": [
    {
      "id": "gen-p-h3-XXXX",
      "module": "horen",
      "teil": 3,
      "level": "B2",
      "title": "Radiogespräch: …",
      "text": "Moderator: …\nDr. Braun: …\nJulia Meier: …\nJonas Richter: …",
      "passageVocab": ["diskussion", "meinung", "konsequenz"],
      "audio": [
        { "speaker": "Moderator", "voiceId": "de-DE-ConradNeural", "text": "…" }
      ]
    }
  ],
  "questions": [
    {
      "id": "gen-q-h3-XXXX-q1",
      "module": "horen",
      "teil": 3,
      "level": "B2",
      "type": "matching",
      "question": "Sie hören im Radio ein Gespräch mit mehreren Personen.\nSie hören den Text einmal. Wählen Sie bei jeder Aufgabe: Wer sagt das?\n\nEs brauche stärkere gesetzliche Mindeststandards statt freiwilliger Initiativen der Branche.",
      "options": [
        "A) Moderator",
        "B) Dr. Braun",
        "C) Julia Meier",
        "D) Jonas Richter"
      ],
      "correct": "C",
      "correctAnswer": "C",
      "explanation": "Diese Forderung nach verbindlichen Regeln äußert die Juristin Meier, nicht die anderen Teilnehmer.",
      "passageId": "gen-p-h3-XXXX",
      "lang": "de",
      "skills": ["listening"]
    }
  ]
}
```

Genera el **panel completo** y **6 preguntas** (q1–q6) con las **mismas** cuatro opciones. Devuelve solo el JSON.
