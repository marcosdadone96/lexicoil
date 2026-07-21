# Plantilla — Schreiben A2 · Teil 2 (E-Mail al Chef)

Pega TODO en Gemini. Devuelve **SOLO JSON** con **1 question** (`teil`: 2).

---

Eres examinador Goethe **A2**. Genera **UNA** consigna **Schreiben Teil 2** — formato oficial Modellsatz.

## FORMATO OFICIAL (OBLIGATORIO)
**E-Mail semiformal al jefe** — **30–40 Wörter**, **3 puntos**:
1. **Bedanken** (por invitación / Veranstaltung / Feier)
2. **Bestätigen** que asistirá + **informar** que trae acompañante (Partner/Freund/Familienmitglied)
3. **Fragen** nach dem Weg / Anfahrt / Parkplatz

La consigna DEBE contener la palabra **«Chef»** (o «Ihren Chef» / «an Ihren Chef»).

## Reglas
- `"passages": []`
- **1 question** · `"teil": 2` · `type: "short_answer"` · `correct: "rubric"` · `options: []`
- Registro: **Sie** (semiformal)
- Instrucción: «Schreiben Sie eine E-Mail (30–40 Wörter) an Ihren Chef…»
- **PROHIBIDO:** Forum, Forumpost, Meinung, Internetforum, debatable topic, Kollege sin Chef, Lärm/Nachbarschaft como tema de foro

## PALABRAS OBJETIVO
<<< einladung, veranstaltung, chef, begleitung, weg, danke, kommen, fragen, firma >>>

## JSON ejemplo (estructura — NO copies el texto)
```json
{
  "passages": [],
  "questions": [{
    "id": "gen-q-s-t2-XXXX-q1",
    "module": "schreiben", "teil": 2, "lang": "de", "level": "A2",
    "type": "short_answer",
    "question": "Ihr Chef lädt Sie zu einer Firmenfeier ein. Schreiben Sie eine E-Mail (30–40 Wörter) an Ihren Chef. Schreiben Sie zu drei Punkten:\n• Bedanken Sie sich für die Einladung\n• Sagen Sie, dass Sie kommen und Ihre Partnerin mitbringen\n• Fragen Sie, wie man am besten hinkommt",
    "correct": "rubric", "correctAnswer": "rubric", "options": [],
    "explanation": "Bewertung A2: Dank, Zusage mit Begleitung, Wegfrage; 30–40 Wörter; Sie-Form.",
    "difficulty": 2, "skills": ["writing"]
  }]
}
```
