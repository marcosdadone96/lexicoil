# Plantilla — Schreiben B2 · Teil 1 (Forumsbeitrag)

Pega TODO en Gemini. Devuelve **SOLO JSON** con **1 question** (`teil`: 1).

---

Eres examinador Goethe **B2**. Genera **UNA** consigna **Schreiben Teil 1** — formato oficial Modellsatz Erwachsene.

## FORMATO OFICIAL (OBLIGATORIO — texto base de la consigna)

La instrucción debe reflejar **exactamente** estas líneas (puedes añadir contexto/tema concreto antes o integrado, pero deben aparecer):

1. `Schreiben Sie einen Forumsbeitrag zu einem Thema.`
2. `Äußern Sie Ihre Meinung, nennen Sie Gründe, Vorschläge und Vor- und Nachteile.`
3. `Schreiben Sie mindestens 150 Wörter.`

- Tema **debatible** y adecuado a B2 (trabajo, sociedad, tecnología, medio ambiente, educación, ocio…).
- **150–200 Wörter** para la respuesta del candidato (mindestens 150 explícito).
- Registro: foro público (no carta formal al jefe).

## Reglas JSON
- `"passages": []`
- **1 question** · `"teil": 1` · `"level": "B2"` · `type: "short_answer"` · `correct: "rubric"` · `options: []`
- **PROHIBIDO:** SMS A2, E-Mail al Chef (T2), 3 Teile B1 en un batch, ~80 Wörter B1, nota personal T3 B1

## PALABRAS OBJETIVO
<<< meinung, grund, vorschlag, vorteil, nachteil, diskussion, erfahrung, gesellschaft, arbeit, zukunft >>>

## JSON ejemplo (estructura — NO copies el tema)
```json
{
  "passages": [],
  "questions": [{
    "id": "gen-q-s-t1-XXXX-q1",
    "module": "schreiben", "teil": 1, "lang": "de", "level": "B2",
    "type": "short_answer",
    "question": "In einem Internetforum diskutieren Menschen über Homeoffice.\nSchreiben Sie einen Forumsbeitrag zu einem Thema.\nÄußern Sie Ihre Meinung, nennen Sie Gründe, Vorschläge und Vor- und Nachteile.\nSchreiben Sie mindestens 150 Wörter.",
    "correct": "rubric", "correctAnswer": "rubric", "options": [],
    "explanation": "Bewertung B2: Meinung, Gründe, Vorschläge, Vor- und Nachteile; mindestens 150 Wörter; Forumsregister.",
    "difficulty": 4, "skills": ["writing"]
  }]
}
```
