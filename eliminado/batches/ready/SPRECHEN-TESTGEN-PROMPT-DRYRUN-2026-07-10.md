# Sprechen testgen dry-run (SP-2) — verificación puntos 1–3

Live API: **fetch failed** en este entorno (2026-07-10). Verificación por dry-run de prompt + wiring.

Intento live previo: `node scripts/generate-part-gemini.mjs --module sprechen --from-coverage --count 1` → `Error gemini: fetch failed`.

## Vocab resuelto (post blacklist/sanitize)

`überzeugt, besonderheiten, gesellschaftskritik, ver, veraenderung, stil, morphologie, gerade`

Tema rotación: `Umwelt`

## Checks

| Check | Presente |
|-------|----------|
| OPCIONALES oral | YES |
| frase forzada = rechazo | YES |
| Perspectiva PROHIBIDO stelle ich | YES |
| type planungsaufgabe | YES |
| type feedback_diskussion | YES |
| Sie obligatorio | YES |
| tema concreto T2 | YES |
| puntos sin * ni • | YES |
| Beispielfragen etiqueta | YES |
| Premisas usadas | YES |
| difficulty 5 | YES |

## Prompt completo

~~~
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


## VOCABULARIO SUGERIDO (preferencia — no obligación)
- Usa de forma NATURAL estas palabras si encajan: überzeugt, besonderheiten, gesellschaftskritik, ver, veraenderung, stil, morphologie, gerade. Prioriza naturalidad y nivel B1 — si una palabra no encaja, OMÍTELA, no la fuerces. Mejor un texto natural con algunas de estas palabras que uno forzado con todas.
- **Estas palabras son OPCIONALES.** Intégralas solo si suenan 100% naturales en una consigna de examen oral B1. Una frase forzada es motivo de rechazo.
- Intégralas solo en las **consignas** si encajan; nunca inventes viñetas rotas solo para meter una palabra.
- Si una palabra no encaja en el tema elegido, **omítela** sin forzar.



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
- PROHIBIDO como tema central: Huertos/jardines comunitarios (sobrerrepresentado en el banco).


## PREMISAS YA USADAS (PROHIBIDO repetir el mismo set)
Fingerprint = premisa T1 + tema T2. Elige situación y tema distintos.
- NO repetir: T1≈«sie mochten zusammen mit ihrem partner ihrer partnerin ein kleines kul…» + T2≈«die bedeutung von kulturfesten in meiner heimatsta»
- NO repetir: T1≈«sie arbeiten zusammen in einer firma ein kollege oder eine kollegin de…» + T2≈«die bedeutung von grunflachen in der stadt»
- NO repetir: T1≈«sie und ihr partner ihre partnerin mochten fur eine gemeinsame freundi…» + T2≈«leben in der stadt oder auf dem land halten»
- NO repetir: T1≈«sie und ihr partner ihre partnerin mochten ein nachbarschaftsfest in e…» + T2≈«die bedeutung von grunflachen und parks in stadten»
- NO repetir: T1≈«sie haben gehort dass das jugendzentrum in ihrer stadt dringend neue s…» + T2≈«die rolle von sozialen medien im alltag»
- NO repetir: T1≈«sie mochten zusammen mit ihrer partnerin ihrem partner einen regionale…» + T2≈«die bedeutung regionaler produkte»
- NO repetir: T1≈«sie und ihr partner mochten ein kleines gemeinschaftsgartenprojekt in …» + T2≈«die bedeutung von weiterbildung im berufsleben»
- NO repetir: T1≈«sie und ihr partner mochten fur die nachste woche einen gemeinsamen ko…» + T2≈«ein beliebter freizeitkurs in meinem heimatland z»
- NO repetir: T1≈«sie mochten zusammen mit einer anderen person ein ehrenamtliches proje…» + T2≈«ehrenamt in der eigenen kultur halten»
- NO repetir: T1≈«sie mochten ein ehrenamtliches projekt in ihrer gemeinde planen um alt…» + T2≈«halten sie eine prasentation uber ehrenamt in ihre»
- NO repetir: T1≈«gemeinsam etwas planen sie mochten mit ihrem deutschkurs einen tagesau…» + T2≈«ein wichtiges fest in ihrem heimatland vergleich m»
- NO repetir: T1≈«sie planen mit ihrer klasse ein gesundes fruhstuck besprechen sie folg…» + T2≈«halten sie eine prasentation uber essgewohnheiten »
- NO repetir: T1≈«gemeinsam etwas planen eine gemeinsame kollegin verlasst die firma pla…» + T2≈«die situation in ihrem heimatland vor und nachteil»
- NO repetir: T1≈«sie mochten eine online shopping party mit freunden und familie planen…» + T2≈«einkaufsgewohnheiten im heimatland halten»
- NO repetir: T1≈«sie mochten mit freunden eine online shopping party planen sprechen si…» + T2≈«sie sollen eine kurze prasentation uber ihre einka»
- NO repetir: T1≈«sie planen mit freunden eine online shopping party besprechen sie folg…» + T2≈«halten sie eine prasentation zu den einkaufsgewohn»
- NO repetir: T1≈«sie mochten mit freunden einen tagesausflug planen besprechen sie folg…» + T2≈«2»
- NO repetir: T1≈«sie mochten mit freunden einen tagesausflug planen besprechen sie folg…» + T2≈«halten sie eine prasentation zu reisen und verkehr»
- NO repetir: T1≈«sie mochten mit freunden einen tagesausflug planen besprechen sie mit …» + T2≈«reisen und verkehr in meinem heimatland»
- NO repetir: T1≈«sie mochten mit freunden einen tagesausflug planen besprechen sie mit …» + T2≈«reisen und verkehr in meinem heimatland»
- NO repetir: T1≈«planen sie mit einem freund einer freundin einen tagesausflug diskutie…» + T2≈«reisen und verkehr in meinem heimatland»
- NO repetir: T1≈«sie mochten mit ihrer partnerin ihrem partner einen sportkurs fur anfa…» + T2≈«beliebtester sport in meinem heimatland halten»
- NO repetir: T1≈«sie mochten einen sportkurs fur anfanger planen hier sind vier karten …» + T2≈«stellen sie den beliebtesten sport in ihrem heimat»
- NO repetir: T1≈«sie mochten zusammen mit einem freund einen sportkurs fur anfanger pla…» + T2≈«halten sie eine prasentation uber den beliebtesten»
- NO repetir: T1≈«sie mochten einen sportkurs fur anfanger planen diskutieren sie mit ih…» + T2≈«halten sie eine kurze prasentation uber den belieb»
- NO repetir: T1≈«planen sie einen sportkurs fur anfanger besprechen sie mit ihrem partn…» + T2≈«halten sie eine prasentation uber den beliebtesten»
- NO repetir: T1≈«sie mochten gemeinsam mit einem partner ein stadtfest organisieren dis…» + T2≈«feste und feiern im heimatland vs»


IMPORTANTE — IDs de esta generación:
- Preguntas: gen-q-sp-t{1,2,3}-testsp1-q1
No reutilices IDs del ejemplo ni del banco existente.

## LONGITUD / FORMATO OFICIAL (OBLIGATORIO)
- 1 batch = 3 tareas (planung + präsentation + feedback). passages: []. correct: "rubric".
- Ámbito: **question de cada teil**
- Objetivo: **consignas claras con tiempos oficiales**
- Prefiere léxico B1 frecuente (≤B1 CEFR). Evita meta-texto («Dieser Text hat 280 Wörter…») y términos C1/académicos (kontextualisieren, Polyphonie, Paradigma, Manifestation…). REGLA ANTI-ANGLICISMOS: NUNCA escribas verbos/sustantivos ingleses sin traducir — gardening→Gartenarbeit/Gärtnern, jogging→Joggen, hiking→Wandern, cycling→Radfahren, shopping→Einkaufen, cooking→Kochen, Workshop→Kurs/Seminar/Werkstatt. Préstamos aceptados en alemán moderno (Deadline, Meeting, Team, Job, Computer, Internet, E-Mail, Video, Blog, Podcast, App, Design, Event, Check-in, Feedback) son válidos SOLO si van capitalizados como sustantivos: «die Deadline», «das Meeting», «das Team». REGLA ORTOGRÁFICA OBLIGATORIA: en alemán TODOS los sustantivos van en MAYÚSCULA — también en enumeraciones y después de «kein/keine» («Blumen und Pflanzen», «keine Hypothese», no «blumen», no «keine hypothese»). Repasa cada sustantivo antes de enviar. LÍMITE INVERSO — NUNCA capitalices a mitad de frase palabras que NO sean sustantivos ni nombres propios: adjetivos (schwierig, persönlich, zugänglich, einfach, möglich), cuantificadores (viele, wenige, einige), adverbios (lange, eher, leider, trotzdem, natürlich) y verbos conjugados (ich glaube, ich stimme, ich denke) van en MINÚSCULA a mitad de frase. Solo SUSTANTIVOS y nombres propios llevan mayúscula. Ejemplos correctos: «viele Menschen» (NO «Viele»), «in der Praxis schwierig» (NO «Schwierig»), «ich glaube» (NO «Glaube»), «ich stimme zu» (NO «Stimme»), «leicht zugänglich» (NO «Zugänglich»).
- VOCABULARIO SUGERIDO: OPCIONAL — solo si suena 100% natural en una consigna oral B1; frase forzada = rechazo.

CHECKLIST FINAL (Goethe B1 — debe pasar validate-batch.mjs):
- Responde SOLO JSON: { "passages": [...], "questions": [...] } — sin markdown, sin ```.
- correct === correctAnswer en todas las preguntas.
- module correcto en cada question; lang:"de", level:"B1".
- IDs únicos con el prefijo indicado arriba (no reutilizar el ejemplo).
- explanation en alemán en cada pregunta (nunca vacía; ≥10 palabras para multiple_choice — CHK-18 rechaza si es más corta).
- VOCABULARIO SUGERIDO: integra palabras solo si encajan; omite las que no encajen.
- MAYÚSCULAS: TODO sustantivo alemán en mayúscula — también tras kein/keine/mit/für/von/ohne, en enumeraciones y listas. ¡Compruébalo antes de enviar!
- ANTI-ANGLICISMOS: CERO palabras inglesas sin traducir (gardening, jogging, hiking, cycling, Workshop…). Préstamos aceptados (Deadline, Meeting, Team, Computer, E-Mail, App, Blog, Podcast, Event) SOLO capitalizados. Workshop SIEMPRE → Kurs/Seminar/Werkstatt.
- passages: [] · exactamente 3 questions (teil 1,2,3).
- type canónico: T1 planungsaufgabe · T2 praesentation · T3 feedback_diskussion · difficulty:5.
- Sie obligatorio; T2 tema CONCRETO; puntos sin * / •; T3 etiqueta exacta «Beispielfragen:».
- PROHIBIDO 1ª persona del examinador / «für den Prüfer» / «die Kandidaten».
- correct:"rubric" · T3 referencia el tema concreto de T2.

~~~

