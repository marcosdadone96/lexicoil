# Prompt para Claude — Hören T4 · Lote de 5 unidades

**Copia TODO lo que hay debajo de la línea de guiones y pégalo en Claude.**
**Guarda la respuesta en:** `batches/inbox/todo-horen-teil4.txt`
**Importa con:** `npm run horen:upload:t4`

---

Eres examinador certificado del **Goethe-Zertifikat B1**. Genera exactamente **5 partes independientes** de **Hören Teil 4** (Diskussion — "Wer sagt was?"), alemán B1.

## REGLAS ESTRICTAS (aplican a las 5 unidades)

- **1 passage** por unidad: discusión radiofónica con **3 hablantes fijos** (Moderator + 2 invitados).
- **300–450 palabras** de transcripción por passage.
- Los 2 invitados deben tener **posturas claramente opuestas** sobre el tema.
- Cada turno: `Nombre: texto` (SIN comillas «»). Salto de línea entre turnos.
- **Mínimo 12 turnos** en total por unidad.
- **8 preguntas** `type: "matching"` por unidad — cada una es una afirmación que corresponde a UN hablante.
- `options` de CADA pregunta = exactamente: `["a) Moderator", "b) [NombreInv1]", "c) [NombreInv2]"]`
- `correct` / `correctAnswer`: solo `"a"`, `"b"` o `"c"` (letra minúscula, sin paréntesis).

## DISTRIBUCIÓN DE RESPUESTAS — OBLIGATORIO

Por unidad:
- Moderator (a): **1–2 respuestas**
- Invitado 1 (b): **3–4 respuestas**
- Invitado 2 (c): **3–4 respuestas**
- **Las 3 letras deben aparecer al menos 1 vez. Ninguna >4/8.**

Antes de terminar cada unidad, cuenta: a=?, b=?, c=?

## ANTI WORD-MATCHING — CRÍTICO

Las afirmaciones NO deben copiar ≥4 palabras seguidas de la transcripción. Parafrasea siempre:

❌ MALO: «Homeoffice ist produktiv und spart Zeit.»
✅ BUENO: «Das Arbeiten zu Hause steigert die Effizienz.»

## CAMPO AUDIO (obligatorio en cada passage)

```json
"audio": [
  { "speaker": "Moderator", "voiceId": "de-DE-ConradNeural", "text": "Herzlich willkommen zu unserer Sendung." },
  { "speaker": "Dana", "voiceId": "de-DE-KatjaNeural", "text": "Ich denke, dass Homeoffice sehr produktiv ist." },
  { "speaker": "Felix", "voiceId": "de-DE-BerndNeural", "text": "Da bin ich anderer Meinung." }
]
```
- **3 voiceId distintas**: Moderator = `de-DE-ConradNeural`, Invitada femenina = `de-DE-KatjaNeural`, Invitado masculino = `de-DE-BerndNeural`.
- Si ambos invitados son del mismo sexo, usa `de-DE-KatjaNeural` y `de-DE-AmalaNeural`.
- El `text` no incluye el prefijo `Nombre:`.

## TEMAS ASIGNADOS (uno por unidad)

Elige libremente los nombres de los invitados (distintos en cada unidad). El Moderator se llama siempre "Moderator".

- **Unidad 1:** ¿Debería el transporte público ser gratuito en las ciudades? (a favor vs. en contra)
- **Unidad 2:** ¿Es mejor vivir en el campo o en la ciudad? (campo vs. ciudad)
- **Unidad 3:** ¿Deben los colegios prohibir los smartphones en clase? (prohibición vs. uso controlado)
- **Unidad 4:** ¿Trabajar cuatro días a la semana es una buena idea? (a favor vs. en contra)
- **Unidad 5:** ¿Es el turismo masivo un problema para las ciudades históricas? (a favor de limitarlo vs. en contra)

## FORMATO DE SALIDA

Devuelve **5 objetos JSON independientes**, uno tras otro (sin array externo, sin markdown).
Cada objeto sigue exactamente esta estructura:

```
{ "passages": [ { ...passage con audio... } ], "questions": [ ...8 items... ] }
{ "passages": [ { ...passage con audio... } ], "questions": [ ...8 items... ] }
...
```

- IDs únicos: passage = `gen-h4-XXXX`, preguntas = `gen-q-h4-XXXX-N` (XXXX = 4 chars hex distintos por unidad).
- `module`: "horen", `teil`: 4 (número), `lang`: "de", `level`: "B1".
- `correct` = `correctAnswer` = `"a"`, `"b"` o `"c"`.
- Cada pregunta lleva `passageId` con el id del passage de su unidad.
- Incluye `explanation` en cada pregunta (1 frase que cita el fragmento justificante).

## AUTORREVISIÓN ANTES DE ENVIAR

Para cada una de las 5 unidades comprueba:
- [ ] ¿1 passage, 300–450 palabras?
- [ ] ¿3 hablantes con nombre fijo (Moderator + 2 invitados con posturas opuestas)?
- [ ] ¿≥12 turnos `Nombre: texto` sin «»?
- [ ] ¿Campo `audio` con 3 voiceId distintas?
- [ ] ¿Exactamente 8 preguntas matching?
- [ ] ¿Cada pregunta tiene exactamente 3 `options` ["a) Moderator", "b) X", "c) Y"]?
- [ ] ¿Distribución a=1–2, b=3–4, c=3–4? ¿Ninguna >4/8?
- [ ] ¿Ninguna afirmación copia ≥4 palabras seguidas?
- [ ] ¿`correct` = letra minúscula ("a"/"b"/"c")?
- [ ] ¿IDs únicos y sin repetir entre unidades?

## EJEMPLO VERIFICADO (no lo copies — es solo referencia de formato)

```json
{
  "passages": [
    {
      "id": "gen-h4-m2r7",
      "module": "horen",
      "teil": 4,
      "title": "Diskussion: Homeoffice — Vor- und Nachteile",
      "text": "Moderator: Willkommen zu unserer Sendung. Heute sprechen wir über Homeoffice. Ist das die Zukunft der Arbeit? Ich begrüße Dana Keller und Florian Berg.\nDana: Danke für die Einladung. Ich bin große Befürworterin von Homeoffice. Man spart jeden Tag viel Zeit, weil man nicht pendeln muss.\nFlorian: Das sehe ich ganz anders. Homeoffice macht es schwieriger, als Team zusammenzuarbeiten. Persönliche Kontakte sind für die Kreativität sehr wichtig.\nModerator: Interessante Perspektiven. Dana, was sagen Sie zu den sozialen Aspekten?\nDana: Natürlich vermisst man manchmal die Kollegen. Aber mit guten digitalen Tools kann man auch online gut kommunizieren und Projekte gemeinsam bearbeiten.\nFlorian: Digitale Kommunikation ist kein vollständiger Ersatz. Viele Mitarbeiter berichten von Einsamkeit und Motivationsproblemen im Homeoffice.\nModerator: Und wie ist das mit der Work-Life-Balance? Florian?\nFlorian: Paradoxerweise arbeiten viele im Homeoffice länger als im Büro. Die Grenzen zwischen Beruf und Privatleben verschwimmen, das ist ein echtes Problem.\nDana: Das stimmt, aber das ist eine Frage der persönlichen Disziplin. Ich zum Beispiel halte feste Arbeitszeiten ein und das funktioniert für mich gut.\nModerator: Gibt es auch Vorteile für Unternehmen?\nDana: Absolut. Firmen können Büroflächen reduzieren und Kosten sparen. Außerdem können sie weltweit Talente einstellen.\nFlorian: Kurzfristig ja, aber langfristig leidet die Unternehmenskultur. Neue Mitarbeiter lernen die Firmenkultur viel schwieriger kennen, wenn sie nur online dabei sind.\nModerator: Wir nähern uns dem Ende. Welche Lösung schlagen Sie vor?\nDana: Ein hybrides Modell wäre ideal — einige Tage zu Hause, einige im Büro.\nFlorian: Da stimme ich zu. Flexibilität ist wichtig, aber Büropräsenz bleibt notwendig.",
      "audio": [
        { "speaker": "Moderator", "voiceId": "de-DE-ConradNeural", "text": "Willkommen zu unserer Sendung. Heute sprechen wir über Homeoffice." },
        { "speaker": "Dana", "voiceId": "de-DE-KatjaNeural", "text": "Danke für die Einladung. Ich bin große Befürworterin von Homeoffice." },
        { "speaker": "Florian", "voiceId": "de-DE-BerndNeural", "text": "Das sehe ich ganz anders. Homeoffice macht es schwieriger, als Team zusammenzuarbeiten." }
      ]
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

Genera ahora las **5 unidades** con los temas asignados. Devuelve solo los 5 objetos JSON, sin texto adicional.
