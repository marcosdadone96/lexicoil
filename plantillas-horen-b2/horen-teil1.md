# Plantilla — Hören B2 · Teil 1 (5 Gespräche/Äußerungen, RF + MCQ)

Pega TODO en Gemini. Devuelve **SOLO JSON** (5 segmentos + 10 preguntas en una pasada).

---

## FORMATO OFICIAL (Modellsatz Erwachsene)

Instrucción (debe figurar en la **primera** pregunta, al inicio del campo `question`):

`Sie hören fünf Gespräche und Äußerungen. Sie hören jeden Text einmal.
Zu jedem Text lösen Sie zwei Aufgaben: Richtig/Falsch und Multiple Choice.`

- **5 segmentos** (`passages` s1…s5), cada uno **35–85 Wörter** (Modellsatz 30–90; **nunca >85** — el gate rechaza >90).
- Escucha oficial: **1×** por segmento (no meta-texto sobre repeticiones).
- **10 preguntas** — por segmento, en este orden:
  1. `type: "richtig_falsch"` · `options: []` · `correct` / `correctAnswer`: `"Richtig"` o `"Falsch"`
  2. `type: "multiple_choice"` · 3 opciones `"a) …"`, `"b) …"`, `"c) …"` · `correct`: `"a"`|`"b"`|`"c"`
- `segmentLabel`: `"Aufnahme 1"` … `"Aufnahme 5"` en cada pregunta.
- `module`: `"horen"` · `teil`: `1` · `level`: `"B2"` · `lang`: `"de"`.
- `grammarTags`: **omitir** o `[]`.

## IDIOMA Y REGISTRO

- **100 % alemán** en `passages[].text`, preguntas, opciones y `explanation`.
- Mezcla natural: cola en mostrador, entrevista radio breve, comentario en reunión, mensaje de voz corto, intercambio entre dos personas (2–4 turnos `Name:`).
- **PROHIBIDO** copiar el pool B1 (5 anuncios/Durchsagen monólogo 50–85 W, Kurs/Gebühr/Öffnungszeiten como único registro).

## CALIDAD (rechazo si fallas)

1. **5 temas distintos**; al menos **2 segmentos con diálogo** (2 hablantes) y al menos **1 Äußerung** en sola voz.
2. RF y MCQ del **mismo segmento** evalúan **datos distintos** (no la misma idea parafraseada).
3. Mezcla RF (~5 Richtig / ~5 Falsch); al menos **2 Falsch** con trampa (nur/alle/immer/nie).
4. MCQ: varía la letra correcta; distractores plausibles y longitud comparable.
5. **Anti word-matching:** ninguna pregunta ni opción correcta con **≥4 palabras seguidas** del transcript.

## EXPLICACIONES (CHK-34)

- Redacta en alemán (≥10 Wörter); explica **por qué** la respuesta encaja con el audio.
- **PROHIBIDO** citar entre comillas el texto literal de la opción correcta MCQ ni escribir «Option a/b/c)» — el orden puede reordenarse.
- Para RF: parafrasea la idea del audio, no copies la afirmación ni la opción.

## CAMPO `audio` (TTS)

Por segmento, incluye `"audio"`: array de turnos `{ "speaker", "voiceId", "text" }` sin prefijo `Name:` en `text`.
- Monólogo: una voz; diálogo: **voiceId distinta** por hablante.

## PALABRAS OBJETIVO
<<< gespräch, meinung, erfahrung, vereinbarung, forschung, medien, arbeit, umwelt, diskussion, vorschlag >>>

## AUTORREVISIÓN

- ¿Instrucción oficial solo en **Q1** (`gen-q-h1-XXXX-s1-q1`)?
- ¿5 passages + 10 questions con segmentLabel y orden RF→MCQ?
- ¿Cada transcript 35–85 Wörter (contá antes de enviar)?
- ¿level B2, grammarTags omitidos?
- ¿Explicaciones sin citas literales de opciones (CHK-34)?

## Formato de salida

Devuelve SOLO `{ "passages": [...], "questions": [...] }`.

- Passage IDs: `gen-p-h1-XXXX-s1` … `s5`
- Question IDs: `gen-q-h1-XXXX-s1-q1`, `s1-q2`, … `s5-q2`
- `passageVocab` (3–5 lemas) · `skills`: `["listening"]`

```json
{
  "passages": [
    {
      "id": "gen-p-h1-XXXX-s1",
      "module": "horen",
      "teil": 1,
      "level": "B2",
      "title": "Kurzes Gespräch …",
      "text": "Sabine: …\nThomas: …",
      "passageVocab": ["vereinbarung", "termin", "büro"],
      "audio": [
        { "speaker": "Sabine", "voiceId": "de-DE-KatjaNeural", "text": "…" },
        { "speaker": "Thomas", "voiceId": "de-DE-ConradNeural", "text": "…" }
      ]
    }
  ],
  "questions": [
    {
      "id": "gen-q-h1-XXXX-s1-q1",
      "module": "horen",
      "teil": 1,
      "level": "B2",
      "type": "richtig_falsch",
      "question": "Sie hören fünf Gespräche und Äußerungen. Sie hören jeden Text einmal.\nZu jedem Text lösen Sie zwei Aufgaben: Richtig/Falsch und Multiple Choice.\n\nAufnahme 1: Thomas stimmt dem Vorschlag sofort zu.",
      "options": [],
      "correct": "Falsch",
      "correctAnswer": "Falsch",
      "explanation": "Im Gespräch zögert Thomas und nennt Bedenken — er stimmt nicht sofort zu.",
      "segmentLabel": "Aufnahme 1",
      "passageId": "gen-p-h1-XXXX-s1",
      "lang": "de",
      "skills": ["listening"]
    },
    {
      "id": "gen-q-h1-XXXX-s1-q2",
      "module": "horen",
      "teil": 1,
      "level": "B2",
      "type": "multiple_choice",
      "question": "Aufnahme 1: Was vereinbaren die Gesprächspartner schließlich?",
      "options": ["a) …", "b) …", "c) …"],
      "correct": "b",
      "correctAnswer": "b",
      "explanation": "Am Ende legen sie einen späteren Termin fest, nicht die sofortige Entscheidung.",
      "segmentLabel": "Aufnahme 1",
      "passageId": "gen-p-h1-XXXX-s1",
      "lang": "de",
      "skills": ["listening"]
    }
  ]
}
```

Genera **5 segmentos completos** (s1–s5) y **10 preguntas**. Devuelve solo el JSON.
