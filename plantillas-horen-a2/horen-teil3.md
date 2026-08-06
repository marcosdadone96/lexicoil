# Plantilla — Hören A2 · Teil 3 (5 diálogos cortos MCQ)

Pega TODO en Gemini. Devuelve **SOLO JSON**.

---

Eres examinador Goethe **A2**. Genera **Hören Teil 3** — **NO** es B1 (sin 7 Richtig/Falsch).

## FORMATO OFICIAL
- **5 passages** (diálogos cortos independientes), IDs con sufijo `-s1`…`-s5`
- Cada diálogo: **15–50 palabras**, 2 hablantes con «Name:»
- **5 preguntas** `multiple_choice` a/b/c — **1 por segmento**
- Cada question: `segmentLabel` «Text 1»…«Text 5», `passageId` al segmento

## PROHIBIDO (formato B1)
- 1 solo diálogo largo con 7 Richtig/Falsch
- 8 matching de hablantes
- Imágenes / pictures

## PALABRAS OBJETIVO
<<< termin, wochenende, kino, arzt, einkaufen, sport, familie, kurs, restaurant >>>

## AUTORREVISIÓN
- ¿5 segmentos + 5 MCQ?
- ¿segmentLabel en cada question?
- ¿level:"A2", module:"horen", teil:3?
- ¿Solo JSON?

## EJEMPLO VERIFICADO (100% checker A2 — imita estructura y registro, NO copies contenido)

```json
{
  "passages": [
    {
      "id": "gen-p-h3-a2ex01-s1",
      "module": "horen", "teil": 3, "lang": "de", "level": "A2",
      "text": "Anna: Hast du heute Zeit für einen Kaffee?\nTom: Ja, Anna. Ich treffe dich um drei Uhr im Café.",
      "audio": [
        { "speaker": "Anna", "voiceId": "de-DE-KatjaNeural", "text": "Hast du heute Zeit für einen Kaffee?" },
        { "speaker": "Tom", "voiceId": "de-DE-ConradNeural", "text": "Ja, Anna. Ich treffe dich um drei Uhr im Café." }
      ]
    },
    {
      "id": "gen-p-h3-a2ex01-s2",
      "module": "horen", "teil": 3, "lang": "de", "level": "A2",
      "text": "Lisa: Wann beginnt der Deutschkurs?\nPaul: Er beginnt am Montag um neun Uhr im Kulturzentrum.",
      "audio": [
        { "speaker": "Lisa", "voiceId": "de-DE-KatjaNeural", "text": "Wann beginnt der Deutschkurs?" },
        { "speaker": "Paul", "voiceId": "de-DE-ConradNeural", "text": "Er beginnt am Montag um neun Uhr im Kulturzentrum." }
      ]
    }
  ],
  "questions": [
    {
      "id": "gen-q-h3-a2ex01-q1",
      "module": "horen", "teil": 3, "lang": "de", "level": "A2",
      "type": "multiple_choice",
      "passageId": "gen-p-h3-a2ex01-s1",
      "segmentLabel": "Text 1",
      "question": "Wann treffen sich Anna und Tom?",
      "options": [
        "a) Um drei Uhr.",
        "b) Am Morgen.",
        "c) Am Abend."
      ],
      "correct": "a",
      "correctAnswer": "a",
      "explanation": "Tom sagt, er trifft Anna um drei Uhr im Café."
    },
    {
      "id": "gen-q-h3-a2ex01-q2",
      "module": "horen", "teil": 3, "lang": "de", "level": "A2",
      "type": "multiple_choice",
      "passageId": "gen-p-h3-a2ex01-s2",
      "segmentLabel": "Text 2",
      "question": "Wo findet der Deutschkurs statt?",
      "options": [
        "a) Im Kulturzentrum.",
        "b) In der Schule.",
        "c) Zu Hause."
      ],
      "correct": "a",
      "correctAnswer": "a",
      "explanation": "Paul erklärt, der Kurs beginnt im Kulturzentrum."
    }
  ]
}
```
