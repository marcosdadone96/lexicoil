# Plantilla de generación — Sprechen B1 · Teile 1–3

Pega TODO este texto en Gemini/ChatGPT. Devuelve **SOLO JSON**.
**Un batch = las 3 Aufgaben** del examen oral oficial (15 min + 15 min Vorbereitung).

---

Eres examinador del Goethe-Zertifikat B1. Genera **UN conjunto completo Sprechen**
(3 tareas orales), alemán estándar, nivel B1.

## Reglas estrictas
- `"passages": []` **siempre vacío**.
- **Exactamente 3 preguntas** — cada una con `"teil": 1`, `"teil": 2` o `"teil": 3` (no repetir).
- `correct: "rubric"` · `correctAnswer: "rubric"` · `options: []`.
- `question`: consigna completa en alemán **dirigida al candidato**.
- `type` canónico: T1 `"planungsaufgabe"` · T2 `"praesentation"` · T3 `"feedback_diskussion"`.
- `difficulty`: **5** en las tres preguntas.
- Registro: **Sie** obligatorio en los 3 Teile (PROHIBIDO ihr/du).

## PERSPECTIVA (OBLIGATORIO — T3 y todo el set)
La consigna se dirige SIEMPRE al candidato en Sie.
**PROHIBIDO:**
- primera persona del examinador («stelle ich Ihnen Fragen», «Danach frage ich…»)
- mencionar al Prüfer / Prüferin como destinatario de la consigna
- referirse al candidato en tercera persona («der Kandidat», «die Kandidaten»)
Las Beispielfragen se listan bajo la etiqueta exacta `Beispielfragen:` sin destinatario.
❌ MALO: `Im Anschluss stelle ich Ihnen noch 2-3 Fragen.` / `Beispielfragen für den Prüfer:`
✅ BUENO: `Beantworten Sie anschließend 2-3 Fragen zum Thema.` / `Beispielfragen:`

## TEIL 1 — Planungsaufgabe (paired, ~2 min)
- `type: "planungsaufgabe"`.
- Situación concreta para **planificar juntos** (Ausflug, Fest, Kurs, Projekt…).
- **Exactamente 5 puntos** a discutir, cada uno en su propia línea.
- Formato de puntos: salto de línea simple, **sin** `*`, `-` ni `•` al inicio.
- Instrucción: Vorschläge machen, reagieren, sich einigen (en Sie).

## TEIL 2 — Präsentation (~2–3 min)
- `type: "praesentation"`.
- Tema **CONCRETO** fijado en la consigna (no «ein Thema aus dem Bereich X»).
  ❌ MALO: `Präsentieren Sie ein Thema aus dem Bereich Freizeit und Sport.`
  ✅ BUENO: `Halten Sie eine kurze Präsentation zum Thema „Ein beliebter Freizeitkurs in meinem Heimatland“.`
- Estructura **obligatoria** en `question` con 5 puntos numerados:
  1. Einleitung: Thema nennen
  2. Situation/Erfahrung im Heimatland
  3. Details / Beispiele
  4. Vor- und Nachteile
  5. Persönliche Meinung + Schluss

## TEIL 3 — Feedback + Rückfragen (~1–1,5 min)
- `type: "feedback_diskussion"`.
- Referencia explícita a la **Präsentation in Teil 2** (mismo tema concreto).
- Pedir: konstruktives Feedback an den Partner + **2–3 Beispielfragen**.
- Beispielfragen: B1 llano y directas (¿qué / cómo / por qué?), sin léxico forzado.
- Etiqueta: `Beispielfragen:` (nada más).

## REGLAS DE CALIDAD
1. **Tema coherente** entre Teil 2 y Teil 3 (mismo campo semántico).
2. Teil 1 = interacción; Teil 2 = monólogo estructurado; Teil 3 = interacción.
3. Puntos concretos, no vagos («Sprechen Sie über das Thema»).
4. **PROHIBIDO:** passages, MCQ, transcripciones de diálogo modelo.
5. **PROHIBIDO** marcar tipográficamente palabras objetivo (`**…**`, `_…_`).
6. **PROHIBIDO** forzar palabras del vocabulario sugerido con frases rotas
   (p. ej. ledig, Reputation, Entwurf, entgangen, abgewickelt en contextos absurdos).

## PALABRAS OBJETIVO
<<< vorbereitung, erfahrung, organisation, familie, stadt, kurs, freizeit, meinung, termin, transport >>>

## AUTORREVISIÓN
- ¿passages: [] y 3 questions con types canónicos?
- ¿T1: 5 puntos (sin * / •) · T2: tema concreto + 5 slides · T3: feedback + Beispielfragen:?
- ¿T3 menciona Teil 2 / Präsentation y usa solo Sie al candidato?
- ¿Ninguna 1ª persona del examinador ni «für den Prüfer»?
- ¿correct:"rubric" · module:"sprechen" · difficulty:5?
- ¿Solo JSON?

## Formato de salida
- IDs: `gen-q-sp-t1-XXXX-q1`, `gen-q-sp-t2-XXXX-q1`, `gen-q-sp-t3-XXXX-q1`
- `explanation`: Kriterien (Flüssigkeit, Struktur, Grammatik, Wortschatz, Aufgabenbewältigung) — **sin** Hörverstehen
- `skills: ["speaking"]`

## EJEMPLO ESTRUCTURAL (referencia sprechen-reise-vorbereitung-01)

Teil 1 = 5 Punkte Planung · Teil 2 = Präsentation mit 5 Abschnitten · Teil 3 = Rückmeldung + Beispielfragen zum Teil-2-Thema.

Genera **3 tareas nuevas** con tema distinto al ejemplo. Devuelve solo JSON.
