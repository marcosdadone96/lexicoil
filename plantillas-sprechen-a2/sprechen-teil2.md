# Plantilla de generación — Sprechen A2 · Teil 2

Pega TODO este texto en Gemini/ChatGPT. Devuelve **SOLO JSON**.
Formato oficial Goethe A2: **1 Karte temática + monólogo corto** («Von sich erzählen»).

---

Eres examinador del Goethe-Zertifikat **A2**. Genera **UNA** tarea de **Sprechen Teil 2**
(Von sich erzählen), alemán estándar, nivel **A2**.

## Reglas estrictas
- `"passages": []` **siempre vacío**.
- **Exactamente 1 pregunta** con `"teil": 2`.
- `correct: "rubric"` · `correctAnswer: "rubric"` · `options: []`.
- `type: "about_self"` · `difficulty: **3**`.
- Registro: **Sie** obligatorio (PROHIBIDO du/ihr).
- `question`: consigna completa en alemán dirigida al candidato.

## FORMATO OFICIAL A2 — Teil 2
- El candidato recibe **1 Karte** con **un tema concreto** sobre su vida.
- Debe **erzählen** (monólogo breve, ~1 Minute), no presentar diapositivas.
- El tema va entre comillas alemanas «…» o en la Karte claramente visible.

### Ejemplos de temas A2 válidos
- «Was machen Sie mit Ihrem Geld?»
- «Was machen Sie am Wochenende?»
- «Was essen Sie gern?»
- «Wie verbringen Sie den Sommer?»

Elige **un** tema concreto relacionado con el **TEMA OBLIGATORIO** del bloque variable.

### PROHIBIDO (eso es B1, no A2)
- «Präsentation» / «Halten Sie eine Präsentation»
- 5 puntos numerados (Einleitung, Vor- und Nachteile, Meinung…)
- «3 Minuten» / estructura de Vortrag académico
- Feedback, Partner-Fragen, Planung

## ESTILO
- Léxico **A2** cotidiano; frases cortas en la consigna.
- Instrucción: «Sie bekommen eine Karte…» / «Erzählen Sie etwas über Ihr Leben…».
- Puedes añadir 2–3 **Stichpunkte** opcionales como guía (ej. «Wann? Wo? Mit wem?»), **sin** lista de 5 slides.

## REGLAS DE CALIDAD
1. **Un solo tema** concreto en la Karte (pregunta clara al candidato).
2. Monólogo / erzählen — NO presentación estructurada B1.
3. Coherente con vocabulario A2 del bloque variable.
4. **PROHIBIDO** passages, MCQ, diálogo modelo.

## PALABRAS OBJETIVO
<<< wochenende, geld, essen, sommer, familie, freizeit, gern, oft, manchmal, leben >>>

## AUTORREVISIÓN
- ¿passages: [] y 1 question con teil:2?
- ¿1 Karte con tema concreto entre comillas?
- ¿Instrucción «erzählen» (no Präsentation)?
- ¿type:"about_self", level:"A2", difficulty:3?
- ¿Sin 5-Punkte-Gliederung B1?
- ¿Solo JSON?

## Formato de salida
- ID: `gen-q-sp-t2-XXXX-q1`
- `explanation`: criterios A2 breves (Verständlichkeit, passende Inhalte, einfache Struktur, Wortschatz A2)
- `skills: ["speaking"]`

## EJEMPLO ESTRUCTURAL (imita formato, NO el contenido)
```json
{
  "passages": [],
  "questions": [{
    "id": "gen-q-sp-t2-a2ex-q1",
    "module": "sprechen", "teil": 2, "lang": "de", "level": "A2",
    "type": "about_self",
    "question": "Sie bekommen eine Karte und erzählen etwas über Ihr Leben.\n\nIhre Karte:\n«Was machen Sie am Wochenende?»\n\nErzählen Sie: Was machen Sie gern? Mit wem? Wo?",
    "correct": "rubric",
    "correctAnswer": "rubric",
    "options": [],
    "explanation": "Bewertung: verständlicher kurzer Bericht zum Kartenthema; einfacher Wortschatz und Satzstruktur auf A2-Niveau.",
    "difficulty": 3,
    "skills": ["speaking"]
  }]
}
```

Genera **una tarea nueva** con tema distinto al ejemplo. Devuelve solo JSON.
