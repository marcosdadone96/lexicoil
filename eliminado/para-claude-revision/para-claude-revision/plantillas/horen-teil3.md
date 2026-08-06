# Plantilla de generación — Hören B1 · Teil 3

Pega TODO este texto en Gemini/ChatGPT. Devuelve **SOLO JSON**.
Formato oficial: **1 diálogo informal entre dos hablantes nativos + 7 ítems Richtig/Falsch**.

---

Eres examinador del Goethe-Zertifikat B1. Genera **UNA** parte de **Hören Teil 3**
(Gespräch entre dos hablantes nativos), alemán hablado informal, nivel B1.

## Reglas estrictas
- **1 passage** (diálogo entre 2 personas), **220–320 palabras** de transcripción.
- Cada turno con formato `Nombre: texto` (SIN comillas tipográficas «»): `Lena: Ich finde das toll.`
- **Mínimo 8 turnos** de diálogo (4 por persona).
- **7 preguntas** `type: "richtig_falsch"` — `correct` = `"Richtig"` o `"Falsch"`.
- `options`: array vacío `[]`.
- Todas las preguntas con el mismo `passageId`.

## ESTILO
- Conversación natural y cotidiana: dos amigos/colegas hablando de un evento, viaje, trabajo, afición, etc.
- Registro coloquial B1: frases cortas, interrupciones, marcadores de habla («Also…», «Weißt du…», «Na ja…»).
- **PROHIBIDO:** narrador en tercera persona (eso es T1); solo voces directas.

## DISTRIBUCIÓN DE RESPUESTAS (OBLIGATORIO)
- Exactamente **3–4 Richtig** y **4–3 Falsch** — cuenta antes de terminar.
- Mezcla: ~4 preguntas sobre información explícita + ~3 sobre inferencia/paráfrasis.

## ANTI WORD-MATCHING — OBLIGATORIO
Las afirmaciones (preguntas) no deben copiar ≥4 palabras seguidas del diálogo. Parafrasea siempre.

Diálogo: *«Lena: Ich finde Fahrrad fahren in der Stadt viel besser als mit dem Bus.»*

❌ **MALO:** «Lena findet Fahrrad fahren in der Stadt besser als mit dem Bus.»
✅ **BUENO:** «Lena bevorzugt das Rad gegenüber öffentlichen Verkehrsmitteln.»

## CAMPO AUDIO (obligatorio para TTS)
Incluye en cada passage un campo `"audio"`: array de turnos en orden de aparición:
```json
"audio": [
  { "speaker": "Lena", "voiceId": "de-DE-KatjaNeural", "text": "Ich finde das wirklich toll." },
  { "speaker": "Markus", "voiceId": "de-DE-ConradNeural", "text": "Ja, ich auch. Wann fahren wir?" }
]
```
- Una `voiceId` **distinta** por hablante (usa `de-DE-KatjaNeural` / `de-DE-ConradNeural`).
- El `text` del turno **no** incluye el prefijo `Nombre:`.

## PALABRAS OBJETIVO
<<< gespräch, erfahrung, treffen, plan, urlaub, arbeit, kollege, freizeit, wochenende, idee >>>

## AUTORREVISIÓN (obligatoria)
- [ ] ¿1 passage de diálogo, 220–320 palabras?
- [ ] ¿≥8 turnos con formato `Nombre: texto` (sin guillemets)?
- [ ] ¿Passage incluye campo `"audio"` con voiceId distinta por hablante?
- [ ] ¿Exactamente 7 preguntas richtig_falsch?
- [ ] ¿3–4 Richtig / 4–3 Falsch?
- [ ] ¿Ninguna afirmación copia ≥4 palabras seguidas del diálogo?
- [ ] ¿`options: []` en todas las preguntas?
- [ ] ¿Solo JSON, sin markdown?

## Formato de salida
Devuelve SOLO `{ "passages": [...], "questions": [...] }` — sin ```, sin texto extra.
- IDs únicos: `gen-h3-XXXX` / `gen-q-h3-XXXX-N` (XXXX = 4 chars aleatorios).
- `module`:"horen", `teil`:3 (número), `lang`:"de", `level`:"B1".
- `correct` = `correctAnswer` = `"Richtig"` o `"Falsch"`.

## EJEMPLO VERIFICADO

```json
{
  "passages": [
    {
      "id": "gen-h3-k4p9",
      "module": "horen",
      "teil": 3,
      "title": "Gespräch: Pläne für das Wochenende",
      "text": "Jonas: Hast du schon Pläne für das Wochenende?\nLena: Ja, ich fahre mit meiner Schwester nach Hamburg. Wir wollen ein Konzert besuchen.\nJonas: Oh, das klingt toll! Welche Band spielt denn?\nLena: Eine Jazzband aus Berlin. Ich finde Jazzmusik einfach wunderschön, weißt du?\nJonas: Ich war noch nie bei einem Jazzkonzert. Kostet das viel?\nLena: Die Karten waren gar nicht so teuer. Wir haben je zwanzig Euro bezahlt.\nJonas: Das ist wirklich günstig. Übernachtet ihr dann auch in Hamburg?\nLena: Nein, wir fahren am gleichen Abend zurück. Der letzte Zug geht um Mitternacht.\nJonas: Und wie lange dauert die Fahrt?\nLena: Ungefähr zwei Stunden. Also kommen wir gegen zwei Uhr nachts zu Hause an.\nJonas: Das ist aber spät! Hast du dann am Sonntag frei?\nLena: Leider nicht. Ich muss am Sonntag früh arbeiten. Aber das ist mir egal, das Konzert ist es wert.\nJonas: Ich bewundere deine Energie. Ich würde am nächsten Tag total müde sein.\nLena: Ach, das schaffe ich schon. Man muss das Leben genießen!\nJonas: Da hast du recht. Viel Spaß beim Konzert!\nLena: Danke! Ich erzähle dir dann alles."
    }
  ],
  "questions": [
    {
      "id": "gen-q-h3-k4p9-1",
      "module": "horen",
      "teil": 3,
      "type": "richtig_falsch",
      "question": "Lena fährt am Wochenende mit ihrer Schwester in eine andere Stadt.",
      "options": [],
      "correct": "Richtig",
      "correctAnswer": "Richtig",
      "explanation": "Lena sagt, sie fährt mit ihrer Schwester nach Hamburg.",
      "passageId": "gen-h3-k4p9",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-h3-k4p9-2",
      "module": "horen",
      "teil": 3,
      "type": "richtig_falsch",
      "question": "Das Konzert findet in Berlin statt.",
      "options": [],
      "correct": "Falsch",
      "correctAnswer": "Falsch",
      "explanation": "Das Konzert ist in Hamburg, nicht in Berlin. Die Band kommt aus Berlin.",
      "passageId": "gen-h3-k4p9",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-h3-k4p9-3",
      "module": "horen",
      "teil": 3,
      "type": "richtig_falsch",
      "question": "Lena findet die Konzertkarten sehr preiswert.",
      "options": [],
      "correct": "Richtig",
      "correctAnswer": "Richtig",
      "explanation": "Sie sagt, die Karten waren nicht teuer — zwanzig Euro pro Person.",
      "passageId": "gen-h3-k4p9",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-h3-k4p9-4",
      "module": "horen",
      "teil": 3,
      "type": "richtig_falsch",
      "question": "Die beiden Frauen schlafen in Hamburg in einem Hotel.",
      "options": [],
      "correct": "Falsch",
      "correctAnswer": "Falsch",
      "explanation": "Lena sagt, sie fahren am gleichen Abend zurück und übernachten nicht.",
      "passageId": "gen-h3-k4p9",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-h3-k4p9-5",
      "module": "horen",
      "teil": 3,
      "type": "richtig_falsch",
      "question": "Nach dem Konzert muss Lena früh aufstehen, um zu arbeiten.",
      "options": [],
      "correct": "Richtig",
      "correctAnswer": "Richtig",
      "explanation": "Lena bestätigt, dass sie am Sonntag früh arbeiten muss.",
      "passageId": "gen-h3-k4p9",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-h3-k4p9-6",
      "module": "horen",
      "teil": 3,
      "type": "richtig_falsch",
      "question": "Jonas findet die Veranstaltung nicht interessant.",
      "options": [],
      "correct": "Falsch",
      "correctAnswer": "Falsch",
      "explanation": "Jonas sagt 'das klingt toll' und bewundert Lenas Energie.",
      "passageId": "gen-h3-k4p9",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-h3-k4p9-7",
      "module": "horen",
      "teil": 3,
      "type": "richtig_falsch",
      "question": "Die Reise nach Hamburg dauert mehr als eine Stunde.",
      "options": [],
      "correct": "Richtig",
      "correctAnswer": "Richtig",
      "explanation": "Lena sagt, die Fahrt dauert ungefähr zwei Stunden.",
      "passageId": "gen-h3-k4p9",
      "lang": "de",
      "level": "B1"
    }
  ]
}
```

Genera UNA parte **NUEVA** (tema distinto al ejemplo), mismas reglas, integrando PALABRAS OBJETIVO. Devuelve solo el JSON.
