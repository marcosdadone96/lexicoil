# Plantilla de generación — Lesen B1 · Teil 2

Pega TODO este texto en Gemini/ChatGPT/Claude. Sustituye **PALABRAS OBJETIVO** (5–8 palabras).
Devuelve **SOLO JSON**. El ejemplo de abajo pasa validación técnica + calidad + CEFR al 100%.

---

Eres examinador del Goethe-Zertifikat B1. Genera **UNA** parte de **Lesen Teil 2**
(dos textos de prensa, Multiple Choice a/b/c), alemán estándar, nivel B1.

## Reglas estrictas
- Formato: **press_mcq** — **2 textos de prensa** independientes. **6 preguntas** (3 por texto).
- Tipo: **multiple_choice** con opciones **a/b/c** (EXACTAMENTE 3 opciones — el DTZ/telc B1 oficial usa 3).
- Cada pasaje: **165–200 palabras** (mínimo ingest **150** — cuenta **cada texto por separado**).

## LONGITUD CEFR (OBLIGATORIO)
Si un texto tiene menos de 165 palabras, **añade 2–4 frases** con datos concretos (cifras, citas, ejemplos).
Los dos textos deben cumplir el mínimo **por separado**.

## VOCABULARIO B1 (cobertura ≥75% — OBLIGATORIO)
Usa léxico **simple y frecuente** de prensa B1:

> Arbeit, Firma, Kollege, Studie, Umfrage, Bewohner, Stadt, Programm, Organisation, Erfahrungen, Familie, Transport, Bericht, Wochenende, Nachhaltigkeit

**PROHIBIDO en los pasajes** (bajan cobertura CEFR): Eigenregie, empfand, faszinierend, authentisch, gebucht, Smartphone, anglicismos raros, jerga académica densa.

**Sustituye por:** fand, toll/interessant, Handy, normal, Bericht/Umfrage, einfache Verben (sagen, erklären, finden).

## REGLAS DE CALIDAD (rechazo automático si fallas)
1. **Sin tono moralizante:** NO «Abschließend lässt sich sagen», «Experten raten», «Es ist wichtig zu», «man sollte wissen».
2. **Sin muletilla de fuente ficticia:** NO repetir «Ein Bericht zeigt…», «Eine Studie zeigt…», «Eine Umfrage ergab/zeigt…» en ambos textos. Máximo una fuente nombrada por pasaje; varía o di el hecho sin inventar estudio.
3. **Sin tono emocional/IA:** NO «könnte ein kleines Wunder sein», «verändert mein Leben», hipérboles sentimentales — registro de prensa B1 neutro.
4. **3 preguntas por pasaje** — cada `passageId` apunta al texto correcto.
5. **Anti word-matching:** pregunta y opción correcta — **máximo 2 palabras de contenido (≥4 letras) iguales al pasaje** cada una.
6. **Parafraseo B1 en preguntas/opciones/explanations (OBLIGATORIO):** vocabulario **≤ B1** — el sinónimo **NO puede ser más difícil** que el pasaje. **PROHIBIDO** en preguntas: *modifizieren*, *Gelassenheit*, *Angehörige*, *elektronische Mitteilungen*, *sich austauschen*, jerga corporativa (*Marke stärken*, *Priorität*, *Potenzial*…).
7. Las **3 opciones** plausibles; las incorrectas = datos del texto **mal aplicados** o **incompletos**.
8. La opción correcta **NO copia 4+ palabras seguidas** del pasaje.
9. **Distribución equilibrada de claves:** en las 6 preguntas, máximo 2 con la misma letra correcta. Distribuye: 2× a, 2× b, 2× c.
10. **Tema único:** si el prompt fija un tema (p. ej. Technik), **los DOS textos** deben tratar ese tema; `topicTag` de **cada** passage = ese tema.

## ANTI WORD-MATCHING — MALO vs BUENO (léelo antes de escribir preguntas)

Pasaje: *«…gedruckte Seiten bleiben besser im **Gedächtnis**…»*

❌ **MALO:** «Was sagen die Forscher über das **Gedächtnis**?» + opción «Pages bleiben im **Gedächtnis**».
→ Repite palabras clave → el alumno acierta emparejando, no leyendo.

✅ **BUENO:** «Was ergab die Umfrage unter Studierenden?» + «Auf Papier Gelesenes prägt sich häufig besser ein.»
→ Misma idea, **≤2** palabras compartidas con el pasaje.

**Proceso obligatorio:** tras escribir cada pasaje, lista sus 15 sustantivos/verbos clave y **evítalos** en las 3 preguntas de ese texto.

## PALABRAS OBJETIVO — límites
- **5–8 palabras** (no más). Intégralas sobre todo en los **textos**, no en las preguntas. Si una no encaja naturalmente, omítela.
- Pool **solo Lesen**; Hören es otro módulo.

## PALABRAS OBJETIVO
<<< arbeit, firma, kollege, erfahrung, programm, organisation, stadt, nachhaltigkeit, familie, freizeit >>>

## AUTORREVISIÓN (obligatoria)
- ¿Cada pasaje ≥165 palabras (mín. 150)?
- ¿3 preguntas por texto con `passageId` correcto?
- ¿Pregunta + opción correcta comparten ≤2 palabras de contenido con su pasaje?
- ¿Opciones a/b/c (exactamente 3) plausibles y la correcta parafraseada?
- ¿Sin tono moralizante?
- PROHIBIDO usar **negrita** (asteriscos dobles) en el campo `text` del pasaje. Ejemplo INCORRECTO: '**Öffnungszeiten:** Das Zentrum öffnet...'. Ejemplo CORRECTO: 'Öffnungszeiten: Das Zentrum öffnet...' (dos puntos, sin asteriscos).

## Formato de salida
Devuelve SOLO `{ "passages": [...], "questions": [...] }` — sin ```, sin texto extra.
- IDs únicos: `gen-l2-XXXX` / `gen-q-2-XXXX-N` (XXXX aleatorio, no reutilizar ejemplo).
- `module`:"lesen", `teil`:2 (número), `lang`:"de", `level`:"B1".
- `correct` = `correctAnswer`. Cada pregunta con `passageId` válido.

## EJEMPLO VERIFICADO (100% checker — imita estructura, estilo y parafraseo)

```json
{
  "passages": [
    {
      "id": "gen-l2-8842a",
      "module": "lesen",
      "teil": 2,
      "title": "Homeoffice bleibt beliebt",
      "text": "Arbeit in der Wohnung bleibt in deutschen Firmen wichtig. Viele Mitarbeiter arbeiten mehrere Tage pro Woche zu Hause, weil sie Zeit sparen und weniger im Stau stehen. Ein Bericht über Erfahrungen von Kollegen in Büros und in der Produktion steht in lokalen Programmen.\n\nIn der Produktion ist Arbeit zu Hause selten möglich. In Büros mit Computern bieten Firmen oft gemischte Modelle an. Zwei Tage kommen Kollegen ins Büro und drei Tage bleiben sie zu Hause. Manche Arbeitgeber zahlen Geld für Internet, andere nicht.\n\nChefs sagen, dass kurze Gespräche im Team manchmal schwerer sind. Junge Kolleginnen vermissen den Kontakt im Büro. Kritiker erklären, dass Arbeit und Freizeit zusammenkommen, wenn das Büro in der Wohnung steht.\n\nAndere finden, dass flexible Zeiten Familien helfen. Experten glauben, dass sich die Modelle ändern werden und nicht alle wieder jeden Tag ins Büro gehen. Nachbarn beschreiben Erfahrungen in Zeitungen und empfehlen Programme für Nachhaltigkeit."
    },
    {
      "id": "gen-l2-8842b",
      "module": "lesen",
      "teil": 2,
      "title": "Reparieren statt wegwerfen",
      "text": "Programme zum Reparieren boomen in vielen Städten. Freiwillige helfen, kaputte Maschinen wieder zu nutzen, zum Beispiel Kaffeeautomaten oder Fahrräder. Die Termine sind am Wochenende und die Hilfe ist gratis, wenn Besucher eine kleine Spende zahlen.\n\nManche Besucher sparen Geld, andere wollen lernen, wie man selbst repariert. Händler aus dem Handel sagen, dass alte Maschinen manchmal unsicher sind. Organisatoren erklären, dass reparierte Produkte gut für die Umwelt sind und weniger Abfall produzieren.\n\nIn manchen Städten zahlt die Organisation den Raum oder Werkzeug. In anderen Städten bezahlen Vereine alles allein. Beobachter beschreiben Erfahrungen junger Menschen und fragen, ob Reparieren wieder normal wird.\n\nProgramme in Zeitungen empfehlen, Produkte länger zu nutzen und Nachhaltigkeit im Alltag zu stärken. Wenn Nachbarn zusammenarbeiten, entstehen positive Erfahrungen für Familien und Kinder. Experten erklären, dass Umwelt und Bildung wichtige Themen bleiben."
    }
  ],
  "questions": [
    {
      "id": "gen-q-2-8842-1",
      "module": "lesen",
      "teil": 2,
      "type": "multiple_choice",
      "question": "Warum arbeiten laut Text viele Mitarbeiter mehrere Tage pro Woche zu Hause?",
      "options": [
        "a) Weil sie den täglichen Weg sparen und nicht im Stau warten müssen.",
        "b) Weil Homeoffice gesetzlich vorgeschrieben ist.",
        "c) Weil alle Firmen nur noch remote arbeiten."
      ],
      "correct": "a",
      "correctAnswer": "a",
      "explanation": "Laut Text arbeiten viele zu Hause, weil sie täglich Zeit sparen und seltener im Stau stehen.",
      "passageId": "gen-l2-8842a",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-2-8842-2",
      "module": "lesen",
      "teil": 2,
      "type": "multiple_choice",
      "question": "Was zahlen manche Arbeitgeber laut Text zusätzlich?",
      "options": [
        "a) Sie übernehmen alle Kosten für Möbel.",
        "b) Sie erstatten keine Ausgaben.",
        "c) Sie zahlen Geld für den Internetanschluss."
      ],
      "correct": "c",
      "correctAnswer": "c",
      "explanation": "Manche Firmen zahlen Geld für Internet, wenn man zu Hause arbeitet.",
      "passageId": "gen-l2-8842a",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-2-8842-3",
      "module": "lesen",
      "teil": 2,
      "type": "multiple_choice",
      "question": "Was erwarten Fachleute für die Zukunft?",
      "options": [
        "a) Alle Firmen kehren vollständig zum Büro zurück.",
        "b) Flexible Lösungen mit gemischten Modellen bleiben bestehen.",
        "c) Homeoffice wird gesetzlich verboten."
      ],
      "correct": "b",
      "correctAnswer": "b",
      "explanation": "Fachleute glauben, dass nicht alle täglich ins Büro gehen werden.",
      "passageId": "gen-l2-8842a",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-2-8842-4",
      "module": "lesen",
      "teil": 2,
      "type": "multiple_choice",
      "question": "Wofür stehen laut Text Reparatur-Termine in Städten?",
      "options": [
        "a) Für kostenlose Neugeräte aus dem Rathaus.",
        "b) Für den Verkauf gebrauchter Möbel.",
        "c) Für ehrenamtliche Hilfe beim Instandsetzen defekter Geräte."
      ],
      "correct": "c",
      "correctAnswer": "c",
      "explanation": "Ehrenamtliche Helfer setzen defekte Geräte wie Fahrräder oder Kaffeeautomaten wieder instand.",
      "passageId": "gen-l2-8842b",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-2-8842-5",
      "module": "lesen",
      "teil": 2,
      "type": "multiple_choice",
      "question": "Warum kommen manche Besucher laut Text in ein Repair-Café?",
      "options": [
        "a) Um selbst zu lernen, wie man Dinge repariert.",
        "b) Weil dort kostenlose Ersatzteile garantiert sind.",
        "c) Weil Händler dort Pflichtpraktika anbieten."
      ],
      "correct": "a",
      "correctAnswer": "a",
      "explanation": "Manche wollen lernen, selbst zu reparieren — nicht nur Geld sparen.",
      "passageId": "gen-l2-8842b",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-2-8842-6",
      "module": "lesen",
      "teil": 2,
      "type": "multiple_choice",
      "question": "Wer finanziert die Räume und Werkzeuge laut Text in manchen Städten?",
      "options": [
        "a) Die städtische Organisation übernimmt die Kosten.",
        "b) Nur private Spender zahlen alles.",
        "c) Händler aus dem Einzelhandel finanzieren die Reparaturen."
      ],
      "correct": "a",
      "correctAnswer": "a",
      "explanation": "In manchen Städten zahlt die Organisation den Raum oder Werkzeug.",
      "passageId": "gen-l2-8842b",
      "lang": "de",
      "level": "B1"
    }
  ]
}
```

Genera UNA parte **NUEVA** (temas distintos al ejemplo), mismas reglas, integrando PALABRAS OBJETIVO. Devuelve solo el JSON.
