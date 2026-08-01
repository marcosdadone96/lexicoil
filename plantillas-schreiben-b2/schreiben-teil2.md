# Plantilla — Schreiben B2 · Teil 2 (Nachricht an Vorgesetzten)

Pega TODO en Gemini. Devuelve **SOLO JSON** con **1 question** (`teil`: 2).

---

Eres examinador Goethe **B2**. Genera **UNA** consigna **Schreiben Teil 2** — formato oficial Modellsatz Erwachsene.

## FORMATO OFICIAL (OBLIGATORIO — texto base de la consigna)

La instrucción debe reflejar **exactamente** estas líneas (situación concreta + estas frases):

1. `Schreiben Sie eine Nachricht an Ihren Vorgesetzten.`
2. `Beschreiben Sie Ihre Situation, bitten Sie um Verständnis, machen Sie einen Vorschlag und zeigen Sie Verständnis.`
3. `Schreiben Sie mindestens 100 Wörter. Vergessen Sie Anrede und Gruß nicht.`

- **100–140 Wörter** para la respuesta del candidato (mindestens 100 explícito).
- Registro: **Sie** semiformal laboral; destinatario **Vorgesetzte/Vorgesetzter** (no «Chef» genérico A2 salvo como sinónimo ocasional).
- Situación concreta (conflicto de horario, proyecto, formación, ausencia, equipo…).

## Reglas JSON
- `"passages": []`
- **1 question** · `"teil": 2` · `"level": "B2"` · `type: "short_answer"` · `correct: "rubric"` · `options: []`
- **PROHIBIDO:** Forum/Forumsbeitrag (T1), SMS 20–30 Wörter A2, invitación a fiesta con Begleitung+Weg (A2 T2), batch B1 de 3 Teile

## PALABRAS OBJETIVO
<<< vorgesetzter, situation, verständnis, vorschlag, termin, projekt, kollege, firma, bitte, team >>>

## JSON ejemplo (estructura — NO copies el texto)
```json
{
  "passages": [],
  "questions": [{
    "id": "gen-q-s-t2-XXXX-q1",
    "module": "schreiben", "teil": 2, "lang": "de", "level": "B2",
    "type": "short_answer",
    "question": "Sie müssen nächste Woche an einem wichtigen Familientermin teilnehmen und können deshalb nicht an der geplanten Teamsitzung teilnehmen.\nSchreiben Sie eine Nachricht an Ihren Vorgesetzten.\nBeschreiben Sie Ihre Situation, bitten Sie um Verständnis, machen Sie einen Vorschlag und zeigen Sie Verständnis.\nSchreiben Sie mindestens 100 Wörter. Vergessen Sie Anrede und Gruß nicht.",
    "correct": "rubric", "correctAnswer": "rubric", "options": [],
    "explanation": "Bewertung B2: Situation, Bitte um Verständnis, Vorschlag, Verständnis für den Vorgesetzten; mindestens 100 Wörter; Anrede/Gruß.",
    "difficulty": 4, "skills": ["writing"]
  }]
}
```
