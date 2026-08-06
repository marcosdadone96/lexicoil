# Plantilla de generación — Hören A2 · Teil 1

Pega TODO este texto en Gemini/ChatGPT. Devuelve **SOLO JSON**.
Formato oficial Goethe A2: **5 textos cortos × 1 MCQ = 5 ítems**, escucha **2×** por texto.

---

Eres examinador del Goethe-Zertifikat **A2**. Genera **UNA** parte de **Hören Teil 1**
(anuncios, Durchsagen, Telefonate, Nachrichten en el contestador, Radio-Tipps — **monólogo**), alemán **hablado**, nivel **A2**.

## Reglas estrictas
- **5 segmentos** de audio (`passages` s1…s5), cada uno **20–70 palabras** (mín. 15, máx. 80).
- **5 preguntas** exactas — **1 MCQ por segmento** (`type: "multiple_choice"`, 3 opciones a/b/c).
- **PROHIBIDO** `richtig_falsch` — en A2 T1 solo hay MCQ (no es formato B1).
- Escucha oficial: **2×** (implícito; no escribas meta-texto sobre ello).
- `segmentLabel`: `"Text 1"` … `"Text 5"` en cada pregunta.
- Cada pregunta con `passageId` del segmento correcto.
- **Monólogo** en cada segmento — **PROHIBIDO** diálogo con turnos `Name:` / `Name:`.

## IDIOMA (obligatorio — rechazo automático)
- **TODO** el contenido del examen (`passages[].text`, `questions[].question`, `questions[].options`, `explanation`) debe estar **100% en alemán**.
- **PROHIBIDO** español, inglés u otro idioma en preguntas, opciones o transcripciones.
- `lang` y `level` siempre `"de"` / `"A2"` en cada ítem.

## ESTILO A2 (obligatorio — suena hablado, no redacción)
- Anuncios cortos: «Guten Tag, …», «Achtung, …», horarios, lugares, precios sencillos.
- Telefonat / Anrufbeantworter: **una sola voz** (mensaje corto), frases simples.
- Durchsage Bahnhof / Geschäft / Arztpraxis: información concreta y breve.
- **PROHIBIDO:** tono de ensayo, listas formales, diálogo entre dos personas, vocabulario B1+ (Präsentation, Feedback, Workshop, Konferenz…).

## VOCABULARIO A2 (OBLIGATORIO)
- Usa léxico cotidiano A2: Termin, Arzt, Zug, Gleis, Öffnungszeiten, Einkaufen, Familie, Wohnung, Freizeit, Kurs, Ticket, Preis, Uhr, Montag…
- Frases cortas (Satzlänge típica A2). Evita Nebensätze largos y Konjunktiv.
- **PROHIBIDO «Workshop»** — usa **Kurs** o **Seminar**.
- Evita anglicismos sin adaptar: shopping→Einkaufen, jogging→Joggen.

## REGLAS DE CALIDAD (rechazo si fallas)
1. Segmentos **temáticamente distintos** (no 5 veces el mismo tipo de anuncio).
2. MCQ: respuesta inferible del audio; **varía** correct entre a, b, c (no siempre b).
3. Anti word-matching: pregunta y opción correcta **no copian ≥4 palabras seguidas** del transcript.
4. **SOLO MONÓLOGO** en los 5 segmentos.
5. `explanation` en alemán, **≥6 palabras** por pregunta MCQ.

## ANTI WORD-MATCHING — OBLIGATORIO
Las preguntas y las opciones correctas **no deben copiar ≥4 palabras seguidas** del transcript. Parafrasea siempre.

**Transcript:** *«Der Zug nach Berlin fährt in fünf Minuten von Gleis 7 ab.»*

❌ **MALO:** opción correcta `"Der Zug fährt von Gleis 7 ab."` → copia el audio.
✅ **BUENO:** `"In fünf Minuten, Gleis 7."` o `"Abfahrt gleich von Gleis 7."` → parafraseado.

## PALABRAS OBJETIVO
<<< termin, bahn, arzt, einkaufen, familie, kurs, preis, uhr, freizeit >>>

## CAMPO AUDIO (obligatorio para TTS)
Incluye en cada passage un campo `"audio"` con un turno monólogo:
```json
"audio": [
  { "speaker": "Ansager", "voiceId": "de-DE-ConradNeural", "text": "Achtung! Der Zug …" }
]
```

## AUTORREVISIÓN
- ¿5 passages + 5 questions MCQ (sin Richtig/Falsch)?
- ¿Cada transcript 20–70 palabras?
- ¿segmentLabel «Text 1»…«Text 5» en cada question?
- ¿Ninguna pregunta ni opción correcta copia ≥4 palabras seguidas del transcript?
- ¿Todos los segmentos son monólogo (sin diálogo)?
- ¿Cada explanation tiene ≥6 palabras?
- ¿module:"horen", teil:1, level:"A2"? ¿Solo JSON?

## Formato de salida
Devuelve SOLO `{ "passages": [...], "questions": [...] }`.
- Passage IDs: `gen-p-h1-XXXX-s1` … `s5`
- Question IDs: `gen-q-h1-XXXX-q1` … `q5`
- Campos: `passageVocab` (2–4 lemas A2), `explanation` en alemán, `skills:["listening"]`

## EJEMPLO VERIFICADO (100% checker A2 — imita estructura, NO copies contenido)

```json
{
  "passages": [
    {
      "id": "gen-p-h1-a2ex01-s1",
      "module": "horen", "teil": 1, "lang": "de", "level": "A2",
      "title": "Text 1",
      "text": "Guten Tag! Das Rathaus ist ab Montag wieder geöffnet. Sie können Montag bis Freitag von neun bis sechzehn Uhr vorbeikommen. Am Samstag bleibt das Rathaus geschlossen.",
      "passageVocab": ["rathaus", "öffnungszeiten", "montag"],
      "audio": [
        { "speaker": "Ansager", "voiceId": "de-DE-KatjaNeural", "text": "Guten Tag! Das Rathaus ist ab Montag wieder geöffnet. Sie können Montag bis Freitag von neun bis sechzehn Uhr vorbeikommen." }
      ]
    },
    {
      "id": "gen-p-h1-a2ex01-s2",
      "module": "horen", "teil": 1, "lang": "de", "level": "A2",
      "title": "Text 2",
      "text": "Achtung, liebe Fahrgäste! Der Regionalzug nach München fährt heute von Gleis vier ab, nicht von Gleis sieben. Abfahrt ist um vierzehn Uhr zweiunddreißig.",
      "passageVocab": ["zug", "gleis", "abfahrt"],
      "audio": [
        { "speaker": "Ansager", "voiceId": "de-DE-ConradNeural", "text": "Achtung, liebe Fahrgäste! Der Regionalzug nach München fährt heute von Gleis vier ab, nicht von Gleis sieben." }
      ]
    }
  ],
  "questions": [
    {
      "id": "gen-q-h1-a2ex01-q1",
      "module": "horen", "teil": 1, "lang": "de", "level": "A2",
      "type": "multiple_choice",
      "question": "Wann kann man das Rathaus besuchen?",
      "options": ["a) Montag bis Freitag 8–15 Uhr", "b) Montag bis Freitag 9–16 Uhr", "c) Nur am Samstag"],
      "correct": "b",
      "correctAnswer": "b",
      "explanation": "Die Ansage nennt Montag bis Freitag von neun bis sechzehn Uhr als Öffnungszeiten.",
      "segmentLabel": "Text 1",
      "passageId": "gen-p-h1-a2ex01-s1",
      "skills": ["listening"]
    },
    {
      "id": "gen-q-h1-a2ex01-q2",
      "module": "horen", "teil": 1, "lang": "de", "level": "A2",
      "type": "multiple_choice",
      "question": "Von welchem Gleis fährt der Zug nach München?",
      "options": ["a) Gleis 7", "b) Gleis 4", "c) Gleis 2"],
      "correct": "b",
      "correctAnswer": "b",
      "explanation": "Der Sprecher korrigiert das Gleis: Der Zug fährt von Gleis vier ab.",
      "segmentLabel": "Text 2",
      "passageId": "gen-p-h1-a2ex01-s2",
      "skills": ["listening"]
    }
  ]
}
```

Genera **5 segmentos completos** (s1–s5) y **5 preguntas MCQ**. Integra el vocabulario sugerido **solo si encaja**; omite el resto. Devuelve solo el JSON.
