# Plantilla de generación — Sprechen A2 · Teil 3

Pega TODO este texto en Gemini/ChatGPT. Devuelve **SOLO JSON**.
Formato oficial Goethe A2: **Gemeinsam planen** — negociar cita/plan con **dos agendas horarias**.

---

Eres examinador del Goethe-Zertifikat **A2**. Genera **UNA** tarea de **Sprechen Teil 3**
(Gemeinsam planen), alemán estándar, nivel **A2**.

## Reglas estrictas
- `"passages": []` **siempre vacío**.
- **Exactamente 1 pregunta** con `"teil": 3`.
- `correct: "rubric"` · `correctAnswer: "rubric"` · `options: []`.
- `type: "plan_together"` · `difficulty: **3**`.
- Registro: **Sie** obligatorio (PROHIBIDO du/ihr).
- `question`: consigna completa en alemán dirigida al candidato.

## FORMATO OFICIAL A2 — Teil 3
Situación concreta para **planificar juntos** con el Partner/Partnerin, p. ej.:
- un regalo comprar **y** un Termin encontrar
- una invitación organizar **y** horarios coordinar
- una compra hacer **y** un Treffen vereinbaren

### OBLIGATORIO: dos agendas horarias
Incluye en la consigna **dos horarios semanales simples** (tablas o listas), uno para «Sie» y otro para «Ihr Partner/Ihre Partnerin», con huecos libres y ocupados. Ejemplo:

```
Ihre Woche:
Montag 14–16 Uhr: Deutschkurs
Dienstag 10–12 Uhr: frei
Mittwoch 15–17 Uhr: Arzt
Donnerstag 9–11 Uhr: frei
Freitag 16–18 Uhr: Sport

Woche Ihres Partners/Ihrer Partnerin:
Montag 10–12 Uhr: Arbeit
Dienstag 14–16 Uhr: frei
Mittwoch 11–13 Uhr: frei
Donnerstag 15–17 Uhr: Meeting
Freitag 10–12 Uhr: frei
```

Los horarios deben permitir negociar **un Termin gemeinsam** (no trivial, pero resoluble en A2).

### Instrucción de interacción
- «Planen Sie gemeinsam…»
- «Finden Sie einen Termin…»
- «Einigen Sie sich…»
- Referencia al Partner/Partnerin (NO Kandidat/Kandidatin, NO Prüfer)

### PROHIBIDO (eso es B1, no A2)
- Feedback / Rückmeldung sobre una Präsentation de Teil 2
- «Beispielfragen:» al examinador
- 5 puntos de Planungsaufgabe B1 sin agendas (Ausflug/Fest/Projekt genérico)
- Primera persona del examinador

## ESTILO
- Léxico **A2**: Termin, Uhr, Montag–Freitag, kaufen, Geschenk, Treffen, Zeit.
- Situación cotidiana coherente con el **TEMA OBLIGATORIO** del bloque variable.

## REGLAS DE CALIDAD
1. Situación concreta (qué planificar: Geschenk + Termin u otro par A2).
2. **Dos agendas** con días y horas legibles.
3. Instrucción de negociación paarweise.
4. **PROHIBIDO** referencia a Präsentation/Teil 2/Feedback B1.

## PALABRAS OBJETIVO
<<< termin, uhr, montag, geschenk, kaufen, planen, frei, treffen, woche, einigen >>>

## AUTORREVISIÓN
- ¿passages: [] y 1 question con teil:3?
- ¿Situación concreta + zwei Wochenpläne/Agenden?
- ¿Planen/Termin finden/gemeinsam (no Feedback)?
- ¿type:"plan_together", level:"A2", difficulty:3?
- ¿Partner/Partnerin, sin Prüfer/Kandidat*?
- ¿Solo JSON?

## Formato de salida
- ID: `gen-q-sp-t3-XXXX-q1`
- `explanation`: criterios A2 breves (Verständlichkeit, Terminfindung, einfache Verhandlung, Wortschatz A2)
- `skills: ["speaking"]`

## EJEMPLO ESTRUCTURAL (imita formato, NO el contenido)
```json
{
  "passages": [],
  "questions": [{
    "id": "gen-q-sp-t3-a2ex-q1",
    "module": "sprechen", "teil": 3, "lang": "de", "level": "A2",
    "type": "plan_together",
    "question": "Sie möchten mit Ihrem Partner/Ihrer Partnerin ein Geburtstagsgeschenk für eine Freundin kaufen und einen Termin dafür finden. Planen Sie gemeinsam, was Sie kaufen und wann Sie einkaufen gehen.\n\nIhre Woche:\nMontag 14–16 Uhr: Deutschkurs\nDienstag 10–12 Uhr: frei\nMittwoch 15–17 Uhr: Arzt\nDonnerstag 9–11 Uhr: frei\nFreitag 16–18 Uhr: Sport\n\nWoche Ihres Partners/Ihrer Partnerin:\nMontag 10–12 Uhr: Arbeit\nDienstag 14–16 Uhr: frei\nMittwoch 11–13 Uhr: frei\nDonnerstag 15–17 Uhr: Meeting\nFreitag 10–12 Uhr: frei\n\nEinigen Sie sich auf ein Geschenk und einen Termin zum Einkaufen.",
    "correct": "rubric",
    "correctAnswer": "rubric",
    "options": [],
    "explanation": "Bewertung: gemeinsame Planung mit passendem Termin; einfache Verhandlung; verständlicher Wortschatz auf A2-Niveau.",
    "difficulty": 3,
    "skills": ["speaking"]
  }]
}
```

Genera **una tarea nueva** con situación distinta al ejemplo. Devuelve solo JSON.
