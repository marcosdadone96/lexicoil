# Prompt para Claude — Hören T3 · Lote de 5 unidades

**Copia TODO lo que hay debajo de la línea de guiones y pégalo en Claude.**
**Guarda la respuesta en:** `batches/inbox/todo-horen-teil3.txt`
**Importa con:** `npm run horen:upload:t3`

---

Eres examinador certificado del **Goethe-Zertifikat B1**. Genera exactamente **5 partes independientes** de **Hören Teil 3** (Gespräch — diálogo informal entre dos hablantes nativos), alemán B1.

## REGLAS ESTRICTAS (aplican a las 5 unidades)

- **1 passage** por unidad: diálogo entre **2 personas**, **220–320 palabras** de transcripción.
- Cada turno: `Nombre: texto` (SIN comillas «»). Salto de línea entre turnos.
- **Mínimo 8 turnos** (4 por persona).
- **7 preguntas** `type: "richtig_falsch"` por unidad.
- `correct` = `"Richtig"` o `"Falsch"`. `options` = array vacío `[]`.
- **Distribución obligatoria:** exactamente **3–4 Richtig** y **4–3 Falsch** por unidad.
- ~4 preguntas sobre información explícita + ~3 sobre inferencia/paráfrasis.

## ANTI WORD-MATCHING — CRÍTICO

Las afirmaciones NO deben copiar ≥4 palabras seguidas del diálogo. Parafrasea siempre:

❌ MALO: «Lena findet Fahrrad fahren in der Stadt besser als mit dem Bus.»
✅ BUENO: «Lena bevorzugt das Rad gegenüber öffentlichen Verkehrsmitteln.»

## CAMPO AUDIO (obligatorio en cada passage)

```json
"audio": [
  { "speaker": "Lena", "voiceId": "de-DE-KatjaNeural", "text": "Ich finde das wirklich toll." },
  { "speaker": "Markus", "voiceId": "de-DE-ConradNeural", "text": "Ja, ich auch. Wann fahren wir?" }
]
```
- **Una `voiceId` distinta por hablante**: voz femenina = `de-DE-KatjaNeural`, voz masculina = `de-DE-ConradNeural`.
- El `text` no incluye el prefijo `Nombre:`.

## TEMAS ASIGNADOS (uno por unidad — usa exactamente este tema)

- **Unidad 1:** Un amigo que acaba de empezar un nuevo trabajo y cuenta su primera semana.
- **Unidad 2:** Dos compañeras de piso discuten cómo organizar una mudanza.
- **Unidad 3:** Un estudiante le cuenta a una amiga que ha suspendido un examen y qué hará ahora.
- **Unidad 4:** Dos conocidos hablan de un viaje de fin de semana que hicieron juntos.
- **Unidad 5:** Una persona cuenta que va a apuntarse a clases de cocina y por qué.

## FORMATO DE SALIDA

Devuelve **5 objetos JSON independientes**, uno tras otro (sin array externo, sin markdown).
Cada objeto sigue exactamente esta estructura:

```
{ "passages": [ { ...passage con audio... } ], "questions": [ ...7 items... ] }
{ "passages": [ { ...passage con audio... } ], "questions": [ ...7 items... ] }
...
```

- IDs únicos: passage = `gen-h3-XXXX`, preguntas = `gen-q-h3-XXXX-N` (XXXX = 4 chars hex aleatorios distintos por unidad).
- `module`: "horen", `teil`: 3 (número), `lang`: "de", `level`: "B1".
- `correct` = `correctAnswer` = `"Richtig"` o `"Falsch"`.
- Cada pregunta lleva `passageId` con el id del passage de su unidad.
- Incluye `explanation` en cada pregunta (1 frase que cita el fragmento del diálogo).

## AUTORREVISIÓN ANTES DE ENVIAR

Para cada una de las 5 unidades comprueba:
- [ ] ¿1 passage, 220–320 palabras?
- [ ] ¿≥8 turnos `Nombre: texto` sin «»?
- [ ] ¿Campo `audio` con voiceId distinta por hablante?
- [ ] ¿Exactamente 7 preguntas richtig_falsch?
- [ ] ¿3–4 Richtig / 4–3 Falsch?
- [ ] ¿Ninguna afirmación copia ≥4 palabras seguidas?
- [ ] ¿`options: []` en todas?
- [ ] ¿IDs únicos y sin repetir entre unidades?

## EJEMPLO VERIFICADO (no lo copies — es solo referencia de formato)

```json
{
  "passages": [
    {
      "id": "gen-h3-k4p9",
      "module": "horen",
      "teil": 3,
      "title": "Gespräch: Pläne für das Wochenende",
      "text": "Jonas: Hast du schon Pläne für das Wochenende?\nLena: Ja, ich fahre mit meiner Schwester nach Hamburg. Wir wollen ein Konzert besuchen.\nJonas: Oh, das klingt toll! Welche Band spielt denn?\nLena: Eine Jazzband aus Berlin. Ich finde Jazzmusik einfach wunderschön, weißt du?\nJonas: Ich war noch nie bei einem Jazzkonzert. Kostet das viel?\nLena: Die Karten waren gar nicht so teuer. Wir haben je zwanzig Euro bezahlt.\nJonas: Das ist wirklich günstig. Übernachtet ihr dann auch in Hamburg?\nLena: Nein, wir fahren am gleichen Abend zurück. Der letzte Zug geht um Mitternacht.\nJonas: Und wie lange dauert die Fahrt?\nLena: Ungefähr zwei Stunden. Also kommen wir gegen zwei Uhr nachts zu Hause an.\nJonas: Das ist aber spät! Hast du dann am Sonntag frei?\nLena: Leider nicht. Ich muss am Sonntag früh arbeiten. Aber das ist mir egal, das Konzert ist es wert.\nJonas: Ich bewundere deine Energie. Ich würde am nächsten Tag total müde sein.\nLena: Ach, das schaffe ich schon. Man muss das Leben genießen!\nJonas: Da hast du recht. Viel Spaß beim Konzert!\nLena: Danke! Ich erzähle dir dann alles.",
      "audio": [
        { "speaker": "Jonas", "voiceId": "de-DE-ConradNeural", "text": "Hast du schon Pläne für das Wochenende?" },
        { "speaker": "Lena", "voiceId": "de-DE-KatjaNeural", "text": "Ja, ich fahre mit meiner Schwester nach Hamburg. Wir wollen ein Konzert besuchen." }
      ]
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

Genera ahora las **5 unidades** con los temas asignados. Devuelve solo los 5 objetos JSON, sin texto adicional.
