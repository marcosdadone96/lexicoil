# Plantilla — Schreiben A2 · Teil 1 (SMS)

Pega TODO en Gemini. Devuelve **SOLO JSON** con **1 question** (`teil`: 1).

---

Eres examinador Goethe **A2**. Genera **UNA** consigna **Schreiben Teil 1** (SMS informal).

## Reglas
- `"passages": []`
- **1 question** · `"teil": 1` · `type: "short_answer"` · `correct: "rubric"` · `options: []`
- **20–30 Wörter** explícito en la consigna
- **3 bullet points** concretos (•)
- Destinatario: **Freund/in** (du permitido en SMS)
- **PROHIBIDO** Forum, Chef, E-Mail formal, Präsentation

## PALABRAS OBJETIVO
<<< wohnung, nachbar, termin, freund, arbeit, hobby, familie, stadt >>>

## JSON ejemplo (estructura)
```json
{
  "passages": [],
  "questions": [{
    "id": "gen-q-s-t1-XXXX-q1",
    "module": "schreiben", "teil": 1, "lang": "de", "level": "A2",
    "type": "short_answer",
    "question": "Sie haben neue Nachbarn. Schreiben Sie eine SMS (20–30 Wörter) an Ihren Freund / Ihre Freundin. Schreiben Sie zu drei Punkten:\n• Wer sind die neuen Nachbarn?\n• Wie sind sie?\n• Was machen Sie mit ihnen?",
    "correct": "rubric", "correctAnswer": "rubric", "options": [],
    "explanation": "Bewertung A2: alle 3 Punkte, kurze Sätze, 20–30 Wörter.",
    "difficulty": 2, "skills": ["writing"]
  }]
}
```
