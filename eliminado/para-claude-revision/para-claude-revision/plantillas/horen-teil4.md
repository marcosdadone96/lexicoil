# Plantilla de generación — Hören B1 · Teil 4

Pega TODO este texto en Gemini/ChatGPT. Devuelve **SOLO JSON**.
Formato oficial: **1 discusión radiofónica (3 voces) + 8 ítems Zuordnung (¿Quién dice qué?)**.

---

Eres examinador del Goethe-Zertifikat B1. Genera **UNA** parte de **Hören Teil 4**
(Diskussion — "Wer sagt was?"), alemán hablado, nivel B1.

## Reglas estrictas
- **1 passage** (discusión radiofónica entre 3 voces), **300–450 palabras** de transcripción.
- **3 hablantes fijos:** Moderator + 2 invitados con posturas distintas (p. ej. Dana / Florian).
- Cada turno empieza con el nombre del hablante y dos puntos, separado por salto de línea, SIN comillas tipográficas: `Moderator: Herzlich willkommen.\nDana: Ich denke, dass…`
- **Mínimo 12 turnos** de conversación en total.
- **8 preguntas** `type: "matching"` — cada una es una afirmación que corresponde a UN hablante.
- `options` de CADA pregunta = exactamente 3 strings: `["a) Moderator", "b) [Invitado1]", "c) [Invitado2]"]`
- `correct` / `correctAnswer`: solo `"a"`, `"b"` o `"c"` (letra minúscula sin paréntesis).

## DISTRIBUCIÓN DE RESPUESTAS (OBLIGATORIO)
- Moderator (a): 1–2 respuestas
- Invitado 1 (b): 3–4 respuestas
- Invitado 2 (c): 3–4 respuestas
- **Las 3 letras deben aparecer al menos una vez. Ninguna >50% (máx 4/8).**

## ANTI WORD-MATCHING — OBLIGATORIO
Las afirmaciones no deben copiar ≥4 palabras seguidas de la transcripción. Parafrasea siempre.

Transcripción: *Dana: Ich finde, dass Homeoffice sehr produktiv ist und Zeit spart.*

❌ **MALO:** Homeoffice ist produktiv und spart Zeit. [Dana]
✅ **BUENO:** Das Arbeiten zu Hause steigert die Effizienz. (→ b) Dana)

## CAMPO AUDIO (obligatorio para TTS)
Incluye en cada passage un campo `"audio"`: array de turnos en orden de aparición:
```json
"audio": [
  { "speaker": "Moderator", "voiceId": "de-DE-ConradNeural", "text": "Herzlich willkommen zu unserer Sendung." },
  { "speaker": "Dana", "voiceId": "de-DE-KatjaNeural", "text": "Ich denke, dass Homeoffice sehr produktiv ist." },
  { "speaker": "Felix", "voiceId": "de-DE-BerndNeural", "text": "Da bin ich anderer Meinung." }
]
```
- T4 tiene 3 hablantes (Moderador + 2 invitados): **3 `voiceId` distintas**.
- El `text` **no** incluye el prefijo `Nombre:`.

## PALABRAS OBJETIVO
<<< diskussion, meinung, vorteil, nachteil, arbeit, umwelt, gesundheit, gesellschaft, lösung, zukunft >>>

## AUTORREVISIÓN (obligatoria)
- [ ] ¿1 passage de discusión radiofónica, 300–450 palabras?
- [ ] ¿3 hablantes fijos con nombre (Moderator + 2)?
- [ ] ¿≥12 turnos de diálogo con formato `Nombre: texto` (sin guillemets «»)?
- [ ] ¿Passage incluye campo `"audio"` con 3 voiceId distintas (Moderator + 2 invitados)?
- [ ] ¿Exactamente 8 preguntas matching?
- [ ] ¿Cada pregunta tiene exactamente 3 `options` ["a) Moderator", "b) X", "c) Y"]?
- [ ] ¿`correct` = "a", "b" o "c" (minúscula)?
- [ ] ¿Las 3 letras aparecen al menos 1 vez? ¿Ninguna >4/8?
- [ ] ¿Ninguna afirmación copia ≥4 palabras seguidas?
- [ ] ¿Solo JSON, sin markdown?

## Formato de salida
Devuelve SOLO `{ "passages": [...], "questions": [...] }` — sin ```, sin texto extra.
- IDs únicos: `gen-h4-XXXX` / `gen-q-h4-XXXX-N` (XXXX = 4 chars aleatorios).
- `module`:"horen", `teil`:4 (número), `lang`:"de", `level`:"B1".

## EJEMPLO VERIFICADO

```json
{
  "passages": [
    {
      "id": "gen-h4-m2r7",
      "module": "horen",
      "teil": 4,
      "title": "Diskussion: Homeoffice — Vor- und Nachteile",
      "text": "Moderator: Willkommen zu unserer Sendung. Heute sprechen wir über Homeoffice. Ist das die Zukunft der Arbeit? Ich begrüße Dana Keller und Florian Berg.\nDana: Danke für die Einladung. Ich bin große Befürworterin von Homeoffice. Man spart jeden Tag viel Zeit, weil man nicht pendeln muss.\nFlorian: Das sehe ich ganz anders. Homeoffice macht es schwieriger, als Team zusammenzuarbeiten. Persönliche Kontakte sind für die Kreativität sehr wichtig.\nModerator: Interessante Perspektiven. Dana, was sagen Sie zu den sozialen Aspekten?\nDana: Natürlich vermisst man manchmal die Kollegen. Aber mit guten digitalen Tools kann man auch online gut kommunizieren und Projekte gemeinsam bearbeiten.\nFlorian: Digitale Kommunikation ist kein vollständiger Ersatz. Viele Mitarbeiter berichten von Einsamkeit und Motivationsproblemen im Homeoffice.\nModerator: Und wie ist das mit der Work-Life-Balance? Florian?\nFlorian: Paradoxerweise arbeiten viele im Homeoffice länger als im Büro. Die Grenzen zwischen Beruf und Privatleben verschwimmen, das ist ein echtes Problem.\nDana: Das stimmt, aber das ist eine Frage der persönlichen Disziplin. Ich zum Beispiel halte feste Arbeitszeiten ein und das funktioniert für mich gut.\nModerator: Gibt es auch Vorteile für Unternehmen?\nDana: Absolut. Firmen können Büroflächen reduzieren und Kosten sparen. Außerdem können sie weltweit Talente einstellen.\nFlorian: Kurzfristig ja, aber langfristig leidet die Unternehmenskultur. Neue Mitarbeiter lernen die Firmenkultur viel schwieriger kennen, wenn sie nur online dabei sind.\nModerator: Wir nähern uns dem Ende. Welche Lösung schlagen Sie vor?\nDana: Ein hybrides Modell wäre ideal — einige Tage zu Hause, einige im Büro.\nFlorian: Da stimme ich zu. Flexibilität ist wichtig, aber Büropräsenz bleibt notwendig."
    }
  ],
  "questions": [
    {
      "id": "gen-q-h4-m2r7-1",
      "module": "horen",
      "teil": 4,
      "type": "matching",
      "question": "Das Pendeln zur Arbeit fällt beim Arbeiten von zu Hause weg.",
      "options": ["a) Moderator", "b) Dana", "c) Florian"],
      "correct": "b",
      "correctAnswer": "b",
      "explanation": "Dana nennt das gesparte Pendeln als Hauptvorteil des Homeoffice.",
      "passageId": "gen-h4-m2r7",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-h4-m2r7-2",
      "module": "horen",
      "teil": 4,
      "type": "matching",
      "question": "Der direkte Kontakt zwischen Kollegen fördert neue Ideen.",
      "options": ["a) Moderator", "b) Dana", "c) Florian"],
      "correct": "c",
      "correctAnswer": "c",
      "explanation": "Florian betont, dass persönliche Kontakte für Kreativität wichtig sind.",
      "passageId": "gen-h4-m2r7",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-h4-m2r7-3",
      "module": "horen",
      "teil": 4,
      "type": "matching",
      "question": "Moderne digitale Werkzeuge ersetzen die Zusammenarbeit im Büro ausreichend.",
      "options": ["a) Moderator", "b) Dana", "c) Florian"],
      "correct": "b",
      "correctAnswer": "b",
      "explanation": "Dana sagt, mit guten digitalen Tools kann man gut zusammenarbeiten.",
      "passageId": "gen-h4-m2r7",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-h4-m2r7-4",
      "module": "horen",
      "teil": 4,
      "type": "matching",
      "question": "Viele Beschäftigte fühlen sich beim Arbeiten von zu Hause allein.",
      "options": ["a) Moderator", "b) Dana", "c) Florian"],
      "correct": "c",
      "correctAnswer": "c",
      "explanation": "Florian erwähnt Einsamkeit und Motivationsprobleme im Homeoffice.",
      "passageId": "gen-h4-m2r7",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-h4-m2r7-5",
      "module": "horen",
      "teil": 4,
      "type": "matching",
      "question": "Die Grenze zwischen Arbeit und Freizeit ist im Homeoffice oft unklar.",
      "options": ["a) Moderator", "b) Dana", "c) Florian"],
      "correct": "c",
      "correctAnswer": "c",
      "explanation": "Florian sagt, die Grenzen zwischen Beruf und Privatleben verschwimmen.",
      "passageId": "gen-h4-m2r7",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-h4-m2r7-6",
      "module": "horen",
      "teil": 4,
      "type": "matching",
      "question": "Feste Arbeitszeiten helfen dabei, konzentriert zu Hause zu arbeiten.",
      "options": ["a) Moderator", "b) Dana", "c) Florian"],
      "correct": "b",
      "correctAnswer": "b",
      "explanation": "Dana erklärt, dass sie feste Arbeitszeiten einhält und das gut funktioniert.",
      "passageId": "gen-h4-m2r7",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-h4-m2r7-7",
      "module": "horen",
      "teil": 4,
      "type": "matching",
      "question": "Das Kennenlernen der Firmenkultur ist online für neue Beschäftigte schwieriger.",
      "options": ["a) Moderator", "b) Dana", "c) Florian"],
      "correct": "c",
      "correctAnswer": "c",
      "explanation": "Florian sagt, neue Mitarbeiter lernen die Firmenkultur im Homeoffice schwieriger kennen.",
      "passageId": "gen-h4-m2r7",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-h4-m2r7-8",
      "module": "horen",
      "teil": 4,
      "type": "matching",
      "question": "Beide Gesprächsteilnehmer befürworten eine Mischform aus Büro und Homeoffice.",
      "options": ["a) Moderator", "b) Dana", "c) Florian"],
      "correct": "a",
      "correctAnswer": "a",
      "explanation": "Der Moderator fasst am Ende zusammen, dass beide ein hybrides Modell befürworten.",
      "passageId": "gen-h4-m2r7",
      "lang": "de",
      "level": "B1"
    }
  ]
}
```

Genera UNA parte **NUEVA** (tema distinto al ejemplo), mismas reglas, integrando PALABRAS OBJETIVO. Devuelve solo el JSON.
