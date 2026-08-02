# Plantilla — Lesen A2 · Teil 1 (Medientext)

Pega TODO en Gemini. Devuelve **SOLO JSON**.

---

Eres examinador Goethe **A2**. Genera **Lesen Teil 1**: 1 texto de prensa/medio + 5 MCQ.

## Reglas
- **1 passage** con texto informativo (noticia breve, reportaje sencillo, texto de revista)
- **5 preguntas** `multiple_choice` con opciones **a) b) c)** exactamente
- Longitud pasaje: **120–200 palabras** (mínimo gate **120**)
- Registro **A2**: frases claras, vocabulario cotidiano (Familie, Arbeit, Stadt, Freizeit, Gesundheit, Reisen)

## TIPO DE TEXTO (OBLIGATORIO)
- Texto de **tercera persona** o reportaje neutro (NO blog en «ich» — eso es B1)
- Título informativo en `passages[0].title` (p. ej. «Neues Sportprogramm in der Stadt»)
- Contenido concreto: quién, qué, dónde, cuándo (fechas, lugares, cifras simples)

## PREGUNTAS
- 5 MCQ que comprueben comprensión global y detalles explícitos del texto
- Enunciados cortos en alemán estándar
- **PROHIBIDO** vocabulario B2/C1 en preguntas, opciones y explanations
- `explanation`: ≥6 palabras, en alemán, justifica la respuesta correcta
- **PROHIBIDO** `correct:"true"` / `"false"` / `"Richtig"` / `"Falsch"` — eso es richtig_falsch (B1), no A2 T1
- **OBLIGATORIO** en cada question: `"options": ["a) …", "b) …", "c) …"]` (exactamente 3 strings) y `"correct"`/`"correctAnswer"` = letra `"a"`|`"b"`|`"c"`

## PALABRAS OBJETIVO
<<< zeitung, programm, stadt, familie, kurs, termin, sport, garten, wochenende, arbeit >>>

## AUTORREVISIÓN
- ¿1 pasaje 120–200 palabras?
- ¿5 MCQ a/b/c con `correct` y `correctAnswer`?
- ¿level:"A2" en passage y questions?
- ¿Solo JSON?

## Formato de salida
Devuelve SOLO `{ "passages": [...], "questions": [...] }` — sin ```, sin texto extra.
- IDs únicos: `gen-l1-XXXX` / `gen-q-1-XXXX-N` (XXXX aleatorio, no reutilizar ejemplo).
- `module`:"lesen", `teil`:1 (número), `lang`:"de", `level`:"A2".
- `type`:"multiple_choice" en las 5 preguntas; `options` con a) b) c).

## EJEMPLO VERIFICADO (100% checker A2 — imita estructura y registro, NO copies contenido)

```json
{
  "passages": [
    {
      "id": "gen-l1-a2ex01",
      "module": "lesen",
      "teil": 1,
      "level": "A2",
      "title": "Neues Sportprogramm in der Stadt",
      "text": "Die Stadtverwaltung startet ein neues Sportprogramm für alle Bürger. Ab nächstem Monat gibt es kostenlose Kurse im Stadtpark. Man kann dort joggen, Rad fahren oder an Gruppenübungen teilnehmen. Der Kurs findet jeden Dienstag und Donnerstag von 18 bis 19 Uhr statt. Die Anmeldung ist online möglich oder im Rathaus. Schon über 200 Menschen haben sich angemeldet. Besonders Familien mit Kindern sind willkommen. Es gibt auch einen Kurs für Senioren am Vormittag. Die Stadt hofft, dass mehr Menschen Sport treiben und gesund bleiben. Der Bürgermeister sagt: Das Programm ist gut für die Gesundheit und für die Gemeinschaft in unserer Stadt. Im Winter finden die Kurse in der Sporthalle statt. Die Teilnahme ist kostenlos, aber man braucht bequeme Kleidung und Sportschuhe."
    }
  ],
  "questions": [
    {
      "id": "gen-q-1-a2ex01-1",
      "module": "lesen",
      "teil": 1,
      "type": "multiple_choice",
      "question": "Wann findet der Kurs im Park statt?",
      "options": [
        "a) Montag und Mittwoch",
        "b) Dienstag und Donnerstag",
        "c) Nur am Wochenende"
      ],
      "correct": "b",
      "correctAnswer": "b",
      "explanation": "Im Text steht, dass der Kurs jeden Dienstag und Donnerstag von 18 bis 19 Uhr stattfindet.",
      "passageId": "gen-l1-a2ex01",
      "lang": "de",
      "level": "A2"
    },
    {
      "id": "gen-q-1-a2ex01-2",
      "module": "lesen",
      "teil": 1,
      "type": "multiple_choice",
      "question": "Wo kann man sich anmelden?",
      "options": [
        "a) Nur im Sportgeschäft",
        "b) Online oder im Rathaus",
        "c) Nur per Telefon"
      ],
      "correct": "b",
      "correctAnswer": "b",
      "explanation": "Der Text sagt, die Anmeldung ist online möglich oder im Rathaus.",
      "passageId": "gen-l1-a2ex01",
      "lang": "de",
      "level": "A2"
    },
    {
      "id": "gen-q-1-a2ex01-3",
      "module": "lesen",
      "teil": 1,
      "type": "multiple_choice",
      "question": "Was kostet die Teilnahme?",
      "options": [
        "a) 50 Euro pro Monat",
        "b) Die Teilnahme ist kostenlos",
        "c) Nur für Kinder kostenlos"
      ],
      "correct": "b",
      "correctAnswer": "b",
      "explanation": "Im Text steht klar, dass die Teilnahme kostenlos ist.",
      "passageId": "gen-l1-a2ex01",
      "lang": "de",
      "level": "A2"
    },
    {
      "id": "gen-q-1-a2ex01-4",
      "module": "lesen",
      "teil": 1,
      "type": "multiple_choice",
      "question": "Wo finden die Kurse im Winter statt?",
      "options": [
        "a) Im Stadtpark",
        "b) In der Sporthalle",
        "c) Im Schwimmbad"
      ],
      "correct": "b",
      "correctAnswer": "b",
      "explanation": "Der Text erklärt, dass die Kurse im Winter in der Sporthalle stattfinden.",
      "passageId": "gen-l1-a2ex01",
      "lang": "de",
      "level": "A2"
    },
    {
      "id": "gen-q-1-a2ex01-5",
      "module": "lesen",
      "teil": 1,
      "type": "multiple_choice",
      "question": "Wer ist besonders willkommen?",
      "options": [
        "a) Nur Profisportler",
        "b) Familien mit Kindern",
        "c) Nur Studenten"
      ],
      "correct": "b",
      "correctAnswer": "b",
      "explanation": "Im Text steht, dass besonders Familien mit Kindern willkommen sind.",
      "passageId": "gen-l1-a2ex01",
      "lang": "de",
      "level": "A2"
    }
  ]
}
```
