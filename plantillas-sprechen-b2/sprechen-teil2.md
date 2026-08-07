# Plantilla — Sprechen B2 · Teil 2 (Diskussion führen)

Pega TODO en Gemini. Devuelve **SOLO JSON** con **1 question** (`teil`: 2).

---

Eres examinador Goethe **B2**. Genera **UNA** consigna **Sprechen Teil 2** — Diskussion zu einem kontroversen Thema (Modellsatz Erwachsene).

## FORMATO OFICIAL (OBLIGATORIO)

La consigna debe incluir **esta frase oficial** (exacta; contexto/tema antes o después):

`Tauschen Sie in einer Diskussion Standpunkte zu einem kontroversen Thema aus.`

Además:
- **Thema kontrovers** B2 (z. B. Homeoffice-Pflicht, Werbung an Schulen, Tempolimit, KI am Arbeitsplatz, Veganismus als Norm…).
- Instrucción de **Argumente**, **zustimmen/widersprechen**, **Beispiele**, **gemeinsame Linie** optional.
- Dos roles simétricos (Sie und Partner/in) — no monólogo.
- `type: "short_answer"` · `correct: "rubric"` · registro **Sie** (taskFormat discussion en blueprint).

## PROHIBIDO
- B1 Feedback/Rückmeldung nach Präsentation · A2 Planung · Präsentation solo Teil 2 B1 · 3 Teile en un batch.

## Reglas JSON
- `"passages": []`
- **1 question** · `"teil": 2` · `"level": "B2"` · `options: []`
- `grammarTags`: **omitir** o `[]` (post-proceso; solo las 6 categorías B2 oficiales, ver arriba).

## PALABRAS OBJETIVO
<<< diskussion, standpunkt, argument, meinung, zustimmen, vorschlag, gesellschaft, kontrovers, partner, beispiel >>>

## JSON ejemplo (estructura)
```json
{
  "passages": [],
  "questions": [{
    "id": "gen-q-sp-t2-XXXX-q1",
    "module": "sprechen", "teil": 2, "lang": "de", "level": "B2",
    "type": "short_answer",
    "question": "Thema: Sollten Unternehmen Homeoffice für alle Mitarbeitenden dauerhaft anbieten?\nTauschen Sie in einer Diskussion Standpunkte zu einem kontroversen Thema aus.\nBringen Sie Argumente, reagieren Sie auf Ihre Partnerin/Ihren Partner und versuchen Sie, gemeinsam eine pragmatische Lösung zu finden.",
    "correct": "rubric", "correctAnswer": "rubric", "options": [],
    "explanation": "Bewertung B2: Argumentation, Reaktion, Register; kontroverses Thema klar erkennbar.",
    "difficulty": 5, "skills": ["speaking"]
  }]
}
```
