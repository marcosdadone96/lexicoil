# Plantilla — Sprechen B2 · Teil 1 (Vortrag halten)

Pega TODO en Gemini. Devuelve **SOLO JSON** con **1 question** (`teil`: 1).

---

Eres examinador Goethe **B2**. Genera **UNA** consigna **Sprechen Teil 1** — formato oficial Modellsatz Erwachsene (Vortrag + Gespräch mit Partner/in).

## FORMATO OFICIAL (OBLIGATORIO)

La consigna debe incluir **esta frase oficial** (exacta, puede ir precedida de contexto/tema):

`Halten Sie einen kurzen Vortrag zu einem Thema Ihrer Wahl und sprechen Sie mit Ihrer Partnerin/Ihrem Partner darüber.`

Además (sin contradecir el Modellsatz):
- Tema **B2** concreto y debatible (Medien, Arbeit, Umwelt, Bildung, Gesellschaft, Technologie…).
- Indica que el candidato **elige el subtema** dentro del marco («Thema Ihrer Wahl»).
- **3–5 Punkte** de Gliederung sugerida (Einleitung, Hauptteil mit Beispielen, Schluss/Meinung) — no monólogo B1 de 5 slides rígidos, sino guía para Vortrag B2.
- Interacción: después del Vortrag, **preguntas y réplicas** con la pareja (Partner/in).
- Registro **Sie** · rubric speaking task · `type: "short_answer"` (blueprint B2) · `correct: "rubric"`.

## PROHIBIDO
- Formato B1 (Planungsaufgabe Teil 1, 4 Karten A2, Feedback Teil 3).
- `passages` no vacíos · MCQ · 3 Teile en un batch · level distinto de B2.

## Reglas JSON
- `"passages": []`
- **1 question** · `"teil": 1` · `"level": "B2"` · `options: []`
- `grammarTags`: **omitir** en la salida del modelo (se asignan en post-proceso). Si incluyes el campo, déjalo `[]` — solo IDs oficiales: `g-de-b2-konj1`, `konj2`, `nominal`, `passiv`, `modus`, `relativ`.

## PALABRAS OBJETIVO
<<< vortrag, thema, meinung, beispiel, gesellschaft, argument, diskussion, partner, frage, erfahrung >>>

## JSON ejemplo (estructura — NO copies el tema)
```json
{
  "passages": [],
  "questions": [{
    "id": "gen-q-sp-t1-XXXX-q1",
    "module": "sprechen", "teil": 1, "lang": "de", "level": "B2",
    "type": "short_answer",
    "question": "Thema: Digitalisierung im Alltag.\nHalten Sie einen kurzen Vortrag zu einem Thema Ihrer Wahl und sprechen Sie mit Ihrer Partnerin/Ihrem Partner darüber.\nGliedern Sie Ihren Vortrag: Einleitung, zwei Beispiele aus Ihrem Leben, Vor- und Nachteile, Schluss mit Ihrer Meinung.\nBeantworten Sie danach Fragen Ihrer Partnerin/Ihres Partners.",
    "correct": "rubric", "correctAnswer": "rubric", "options": [],
    "explanation": "Bewertung B2: Vortrag strukturiert, verständlich, Interaktion mit Partner/in; Wortschatz und Strukturen B2.",
    "difficulty": 5, "skills": ["speaking"]
  }]
}
```
