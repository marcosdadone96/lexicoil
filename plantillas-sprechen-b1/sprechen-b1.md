# Plantilla de generación — Sprechen B1 · Teile 1–3

Pega TODO este texto en Gemini/ChatGPT. Devuelve **SOLO JSON**.
**Un batch = las 3 Aufgaben** del examen oral oficial (15 min + 15 min Vorbereitung).

---

Eres examinador del Goethe-Zertifikat B1. Genera **UN conjunto completo Sprechen**
(3 tareas orales), alemán estándar, nivel B1.

## Reglas estrictas
- `"passages": []` **siempre vacío**.
- **Exactamente 3 preguntas** (`teil`: 1, 2, 3).
- `correct: "rubric"` · `correctAnswer: "rubric"` · `options: []`.
- `question`: consigna completa en alemán para el examinador/candidato.

## TEIL 1 — Planungsaufgabe (paired, ~2 min)
- `type: "planungsaufgabe"` (o `short_answer` si el schema lo normaliza).
- Situación concreta para **planificar juntos** (Ausflug, Fest, Kurs, Projekt…).
- **Exactamente 5 bullet points** a discutir.
- Instrucción: Vorschläge machen, reagieren, sich einigen.

## TEIL 2 — Präsentation (~2–3 min)
- `type: "praesentationsaufgabe"`.
- Tema B1 (Reisen, Freizeit, Arbeit, Umwelt, Medien, Wohnen…).
- Estructura **obligatoria** en `question` con 5 puntos numerados:
  1. Einleitung: Thema nennen
  2. Situation/Erfahrung im Heimatland
  3. Details / Beispiele
  4. Vor- und Nachteile
  5. Persönliche Meinung + Schluss

## TEIL 3 — Feedback + Rückfragen (~1–1,5 min)
- `type: "feedback_und_fragen"`.
- Referencia explícita a la **Präsentation in Teil 2** (mismo tema).
- Pedir: konstruktives Feedback + **2–3 Beispielfragen** (como examinador).
- Las Fragen deben invitar a Begründung (Warum…?, Wie unterscheidet sich…?).

## REGLAS DE CALIDAD
1. **Tema coherente** entre Teil 2 y Teil 3 (mismo campo semántico).
2. Teil 1 = interacción; Teil 2 = monólogo estructurado; Teil 3 = interacción.
3. Bullets concretos, no vagos («Sprechen Sie über das Thema»).
4. **PROHIBIDO:** passages, MCQ, transcripciones de diálogo modelo.
5. **PROHIBIDO** marcar tipográficamente palabras objetivo dentro del enunciado (negrita `**…**`, cursiva `_…_`, etc.). Las palabras objetivo deben integrarse en la prosa de forma natural — el examinador real nunca resaltaría vocabulario en su propia consigna.
   ❌ MALO: `"Haben Sie Angst, dass die Veranstaltung viel zu **teurer** wird?"`
   ✅ BUENO: `"Haben Sie Angst, dass die Veranstaltung teurer wird als erwartet?"`

## PALABRAS OBJETIVO
<<< vorbereitung, erfahrung, organisation, familie, stadt, kurs, freizeit, meinung, termin, transport >>>

## AUTORREVISIÓN
- ¿passages: [] y 3 questions?
- ¿T1: 5 bullets planificación · T2: 5 slides · T3: feedback + 2–3 Fragen?
- ¿T3 menciona Teil 2 / Präsentation?
- ¿correct:"rubric" · module:"sprechen"?
- ¿Ningún enunciado contiene palabras en negrita `**…**` o cursiva `_…_`?
- ¿Solo JSON?

## Formato de salida
- IDs: `gen-q-sp-t1-XXXX-q1`, `gen-q-sp-t2-XXXX-q1`, `gen-q-sp-t3-XXXX-q1`
- `explanation`: Kriterien (Flüssigkeit, Struktur, Grammatik, Wortschatz, Aufgabenbewältigung)
- `skills: ["speaking"]`

## EJEMPLO ESTRUCTURAL (referencia sprechen-reise-vorbereitung-01)

Teil 1 = 5 Punkte Planung · Teil 2 = Präsentation mit 5 Abschnitten · Teil 3 = Rückmeldung + Beispielfragen zum Teil-2-Thema.

Genera **3 tareas nuevas** con tema distinto al ejemplo, integrando PALABRAS OBJETIVO. Devuelve solo JSON.
