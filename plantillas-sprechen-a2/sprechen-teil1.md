# Plantilla de generación — Sprechen A2 · Teil 1

Pega TODO este texto en Gemini/ChatGPT. Devuelve **SOLO JSON**.
Formato oficial Goethe A2: **4 Karten (Fragen zur Person) + Interaktion paarweise**, sin Vorbereitung.

---

Eres examinador del Goethe-Zertifikat **A2**. Genera **UNA** tarea de **Sprechen Teil 1**
(Fragen zur Person mit vier Karten), alemán estándar, nivel **A2**.

## Reglas estrictas
- `"passages": []` **siempre vacío**.
- **Exactamente 1 pregunta** con `"teil": 1`.
- `correct: "rubric"` · `correctAnswer: "rubric"` · `options: []`.
- `type: "personal_questions"` · `difficulty: **3**`.
- Registro: **Sie** obligatorio (PROHIBIDO du/ihr).
- `question`: consigna completa en alemán dirigida al candidato.

## FORMATO OFICIAL A2 — Teil 1
La consigna debe describir el procedimiento oficial:
1. El candidato recibe **4 Karten** con temas personales A2.
2. Con esas tarjetas hace **4 preguntas** a su Partner/Partnerin; el partner responde.
3. Luego el partner hace **4 preguntas** con las mismas tarjetas y el candidato responde.
4. **Sin tiempo de preparación.**

### Las 4 Karten (OBLIGATORIO — exactamente estas categorías)
Lista las cuatro tarjetas en la consigna, cada una en su línea, numeradas 1.–4.:
1. **Geburtstag** — cuándo, cómo celebrar, con quién
2. **Wohnort** — ciudad/barrio, vivienda, vecinos
3. **Beruf** — trabajo actual o deseo profesional sencillo A2
4. **Hobby** — tiempo libre, actividad favorita

Puedes concretar cada tarjeta con una pregunta-guía corta A2 (ej. «Wann haben Sie Geburtstag?»), pero **las cuatro categorías deben aparecer explícitamente**.

### PROHIBIDO (eso es B1, no A2)
- Planungsaufgabe, gemeinsam planen, Vorschläge machen, sich einigen
- Präsentation, 5 Punkte, Feedback, Rückmeldung
- Proyectos complejos (Ehrenamt, Konferenz, Workshop…)

## ESTILO
- Léxico **A2** (vida cotidiana: Familie, Wohnung, Arbeit, Freizeit).
- Instrucción clara: «Sie bekommen vier Karten…» / «Stellen Sie vier Fragen…» / «Ihr Partner/Ihre Partnerin antwortet…».
- **PROHIBIDO** primera persona del examinador («ich stelle Fragen»).

## REGLAS DE CALIDAD
1. Exactamente **4 tarjetas** con las categorías Geburtstag, Wohnort, Beruf, Hobby.
2. Menciona el intercambio paarweise (4+4 preguntas).
3. Tema coherente con el **TEMA OBLIGATORIO** del bloque variable (vocabulario A2).
4. **PROHIBIDO** passages, MCQ, diálogo modelo transcrito.

## PALABRAS OBJETIVO
<<< geburtstag, wohnung, stadt, beruf, hobby, familie, frage, antwort, partner, freizeit >>>

## AUTORREVISIÓN
- ¿passages: [] y 1 question con teil:1?
- ¿4 Karten Geburtstag/Wohnort/Beruf/Hobby numeradas?
- ¿Instrucción paarweise 4+4 Fragen, sin Vorbereitung?
- ¿type:"personal_questions", level:"A2", difficulty:3?
- ¿Sin Planung/Präsentation/Feedback (formato B1)?
- ¿Solo JSON?

## Formato de salida
- ID: `gen-q-sp-t1-XXXX-q1`
- `explanation`: criterios A2 breves (Verständlichkeit, passende Fragen, einfache Struktur, Wortschatz A2)
- `skills: ["speaking"]`

## EJEMPLO ESTRUCTURAL (imita formato, NO el contenido)
```json
{
  "passages": [],
  "questions": [{
    "id": "gen-q-sp-t1-a2ex-q1",
    "module": "sprechen", "teil": 1, "lang": "de", "level": "A2",
    "type": "personal_questions",
    "question": "Sie bekommen vier Karten und stellen mit diesen Karten vier Fragen. Ihr Partner/Ihre Partnerin antwortet. Dann stellt Ihr Partner/Ihre Partnerin vier Fragen und Sie antworten.\n\nIhre Karten:\n1. Geburtstag — Wann haben Sie Geburtstag? Wie feiern Sie?\n2. Wohnort — Wo wohnen Sie? Wie ist Ihre Wohnung?\n3. Beruf — Was arbeiten Sie? Oder: Was möchten Sie arbeiten?\n4. Hobby — Was machen Sie gern in der Freizeit?\n\nStellen Sie zu jeder Karte eine Frage. Antworten Sie dann auf die Fragen Ihres Partners/Ihrer Partnerin.",
    "correct": "rubric",
    "correctAnswer": "rubric",
    "options": [],
    "explanation": "Bewertung: vier passende Fragen zu den Karten; verständliche Antworten; einfacher Wortschatz und Struktur auf A2-Niveau.",
    "difficulty": 3,
    "skills": ["speaking"]
  }]
}
```

Genera **una tarea nueva** con tema distinto al ejemplo. Devuelve solo JSON.
