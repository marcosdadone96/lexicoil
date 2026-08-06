# Plantilla de generación — Lesen B1 · Teil 1

Pega TODO este texto en Gemini/ChatGPT/Claude. Sustituye **PALABRAS OBJETIVO** (5–8 palabras).
Devuelve **SOLO JSON**. El ejemplo de abajo pasa validación técnica + calidad + CEFR al 100%.

---

Eres examinador del Goethe-Zertifikat B1. Genera **UNA** parte de **Lesen Teil 1**
(blog/e-mail, Richtig/Falsch), alemán estándar, nivel B1.

## Reglas estrictas
- Formato: **blog_richtig_falsch** — 1 pasaje en **1ª persona (ich)**, 6 afirmaciones Richtig/Falsch.
- **6 preguntas** exactas, tipo **richtig_falsch**.
- Pasaje: **165–200 palabras** (mínimo ingest **150** — cuenta antes de responder).

## LONGITUD CEFR (OBLIGATORIO)
Si el pasaje tiene menos de 165 palabras, **añade 2–4 frases** con detalles concretos (ich/mir/meine).
El ejemplo JSON es estructural; **tu pasaje debe ser más largo que el ejemplo**.

## VOCABULARIO B1 (cobertura ≥75% — OBLIGATORIO)
Usa léxico **simple y frecuente** (están en el wordlist B1):

> Bewohner, Nachbar, Stadt, Programm, Organisation, Erfahrungen, Familie, Kinder, Schule, Arbeit, Transport, Kurs, Freizeit, Wochenende, Verein, Garten, Hobby, Entscheidung, Unterstützung, Gemeinschaft

**PROHIBIDO en el pasaje** (bajan cobertura CEFR): Eigenregie, empfand, faszinierend, authentisch, Verfasser, gebucht, Smartphone, nachhaltiger, inhabergeführt, herkömmlich, pauschal, Therapie literaria.

**Sustituye por:** reserviert/planen, fand, toll/interessant, Handy, umweltfreundlich, normal/früher, selbst/allein.

## REGLAS DE CALIDAD (rechazo automático si fallas)
1. **Sin tono moralizante:** NO «Abschließend lässt sich sagen», «Experten raten», «Es ist wichtig zu», «man sollte wissen».
2. **Sin tono emocional/IA:** NO «könnte/wäre ein kleines Wunder…», «verändert mein Leben für immer», hipérboles sentimentales — preferir hechos y opiniones mesuradas (Goethe B1).
3. **Sin muletilla de fuente ficticia:** evita anclar el blog en «Eine Studie zeigt…» / «Ein Bericht zeigt…» salvo que sea un dato concreto y único.
4. Pasaje en **ich** (ich/mir/meine/mich).
5. **Anti word-matching:** en cada afirmación, **máximo 2 palabras de contenido (≥4 letras) iguales al pasaje**. Parafrasea con vocabulario **≤ B1** — el sinónimo **NO puede ser más difícil** que la palabra del pasaje.
6. **Parafraseo B1 en preguntas (OBLIGATORIO):** las 6 afirmaciones y sus `explanation` deben usar solo vocabulario B1 frecuente. **PROHIBIDO** subir el registro léxico al parafrasear:
   - ❌ *modifizieren* (usa **ändern** / **anpassen**)
   - ❌ *Gelassenheit* (usa **Ruhe** / **Entspannung** / **entspannt**)
   - ❌ *Angehörige* (usa **Familie** / **Verwandte**)
   - ❌ *elektronische Mitteilungen* (usa **Nachrichten** / **SMS**)
   - ❌ *sich austauschen*, *Umstellung*, jerga B2/C1 en preguntas
7. Al menos **2 Richtig** y **2 Falsch**.
8. **Los ítems Falsch lo son por CONTRADICCIÓN DE CONTENIDO** (el pasaje dice X, la afirmación dice lo contrario o algo no implicado), NUNCA por una palabra-señal.
7. **REGLA ANTI-CORRELACIÓN (la más importante):** una palabra de alcance (alle/jede/jeder/immer/nie/nur/ausschließlich/komplett/stets) NO puede predecir la respuesta. Por tanto:
   - **Máximo 2 de los 6 enunciados** pueden contener una palabra de alcance.
   - Si usas alguna, **NO pueden estar todas en ítems Falsch**: reparte (p. ej. 1 en un enunciado Richtig auténtico y 1 en un Falsch), de modo que ver "immer/alle/nur" NO diga si es Richtig o Falsch.
   - Igualmente, **al menos 1 ítem Falsch debe NO contener** ninguna palabra de alcance (Falsch por contenido).
   - **PROHIBIDO** "ausschließlich täglich" y cualquier combinación forzada. "täglich" no es cuantificador de alcance.
   - Antes de terminar, **autocomprueba:** ¿podría un alumno acertar los Falsch marcando "tiene palabra absoluta → Falsch"? Si la respuesta es sí, REESCRIBE.
8. **Pronombres coherentes:** todas las afirmaciones sobre la autora/el autor con solo **sie/ihre** O solo **er/seine** — nunca mezclar.

## ANTI WORD-MATCHING — MALO vs BUENO (léelo antes de escribir preguntas)

Pasaje contiene: *«…Die Stille der **Natur** ist ein Kontrast… Die Zeit in der **Natur** **unterstützt** mich…»*

❌ **MALO (rechazado):** «Die Zeit in der **Natur** **unterstützt** sie bei der mentalen Erholung.»
→ Repite Natur, Zeit, unterstützt → el alumno acierta emparejando, no leyendo.

✅ **BUENO:** «Der Aufenthalt im Wald hilft ihr, beruflich abzuschalten.»
→ Misma idea, **cero** palabras clave del pasaje.

❌ **MALO:** «Sie kauft **ausschließlich** fertige **Möbel**.» (si el pasaje dice Möbel selbst planen)
✅ **BUENO:** «Sie bezieht ihre Einrichtung nur aus dem Handel.» (sin repetir Möbel/planen)

**Proceso obligatorio:** tras escribir el pasaje, lista mentalmente sus 15 sustantivos/verbos clave y **NO los uses** en las 6 afirmaciones.

## PALABRAS OBJETIVO — límites
- **5–8 palabras** (no más). Intégralas sobre todo en el **pasaje**, no en las preguntas.
- Si una palabra no encaja naturalmente en el tema elegido, **omítela** — mejor 5 palabras fluidas que 8 forzadas.
- Pool **solo Lesen**; Hören es otro módulo.

## PALABRAS OBJETIVO
<<< gemeinschaft, nachbar, freizeit, programm, organisation, erfahrung, stadt, kurs, familie, bewohner >>>

## AUTORREVISIÓN (obligatoria)
- ¿Pasaje ≥165 palabras?
- ¿Cada afirmación comparte ≤2 palabras de contenido con el pasaje?
- ¿Los ítems Falsch se sostienen por contradicción de contenido (no por palabra absoluta)?
- ¿≤2 enunciados con palabra de alcance, repartidos entre Richtig y Falsch (no todos en Falsch)?
- ¿≥1 ítem Falsch SIN palabra de alcance? ¿El atajo "absoluta→Falsch" ya NO funciona?
- ¿NINGUNO con "ausschließlich täglich"?
- ¿Misma referencia sie O er en todas las preguntas?
- ¿Sin tono moralizante?
- PROHIBIDO usar **negrita** (asteriscos dobles) en el campo `text` del pasaje. Ejemplo INCORRECTO: '**Öffnungszeiten:** Das Zentrum öffnet...'. Ejemplo CORRECTO: 'Öffnungszeiten: Das Zentrum öffnet...' (dos puntos, sin asteriscos).

## Formato de salida
Devuelve SOLO `{ "passages": [...], "questions": [...] }` — sin ```, sin texto extra.
- IDs únicos: `gen-l1-XXXX` / `gen-q-1-XXXX-N` (XXXX aleatorio, no reutilizar ejemplo).
- `module`:"lesen", `teil`:1 (número), `lang`:"de", `level`:"B1".
- `correct` = `correctAnswer`. Cada pregunta con `passageId` válido.

## EJEMPLO VERIFICADO (100% checker — imita estructura, estilo y parafraseo)

```json
{
  "passages": [
    {
      "id": "gen-l1-8842",
      "module": "lesen",
      "teil": 1,
      "title": "Mein neues Hobby im Gemeinschaftsgarten",
      "text": "Ich habe keinen eigenen Garten, deshalb habe ich mir vor einiger Zeit ein Hochbeet in einem Gemeinschaftsgarten in der Stadt gemietet. Das war eine der besten Entscheidungen meines Lebens. Wenn ich am Wochenende in der Erde arbeite, vergesse ich völlig meinen Job. Früher hatte ich immer das Gefühl, dass ich in der Freizeit produktiv sein muss, aber das Gärtnern hat meinen Blick darauf verändert. Man muss manchmal einfach abwarten, bis etwas wächst. Ich baue hauptsächlich Gemüse an. Es schmeckt einfach viel besser, wenn man es selbst gepflanzt hat. Die Arbeit im Garten ist körperlich fordernd, aber genau das genieße ich nach einer Woche vor dem Bildschirm. Meine Nachbarn besuchen mich oft und wir tauschen Tipps über Bewässerung oder Dünger aus. Es ist ein toller Austausch zwischen den Generationen. Manchmal sitzen wir abends zusammen und essen die ersten Tomaten der Saison. Ich bin viel ruhiger geworden und genieße die kleinen Dinge des Lebens jetzt mehr. Der Gemeinschaftsgarten ist für mich ein Ort des Friedens und eine wichtige Erfahrung in meinem Alltag."
    }
  ],
  "questions": [
    {
      "id": "gen-q-1-8842-1",
      "module": "lesen",
      "teil": 1,
      "type": "richtig_falsch",
      "question": "Die Autorin begann das Gärtnern, um in der Freizeit produktiver zu sein.",
      "options": [],
      "correct": "Falsch",
      "correctAnswer": "Falsch",
      "explanation": "Das Gegenteil stimmt: Das Gärtnern hat ihr geholfen, den Druck zur Produktivität in der Freizeit loszulassen.",
      "passageId": "gen-l1-8842",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-1-8842-2",
      "module": "lesen",
      "teil": 1,
      "type": "richtig_falsch",
      "question": "Beim Gärtnern hat sie gelernt, auf Ergebnisse zu warten.",
      "options": [],
      "correct": "Richtig",
      "correctAnswer": "Richtig",
      "explanation": "Sie beschreibt im Text, dass man beim Gärtnern einfach abwarten muss, bis etwas wächst.",
      "passageId": "gen-l1-8842",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-1-8842-3",
      "module": "lesen",
      "teil": 1,
      "type": "richtig_falsch",
      "question": "Das selbst angebaute Gemüse schätzt sie geschmacklich sehr.",
      "options": [],
      "correct": "Richtig",
      "correctAnswer": "Richtig",
      "explanation": "Sie schreibt, selbst gepflanztes Gemüse schmecke viel besser als fertig gekauftes aus dem Handel.",
      "passageId": "gen-l1-8842",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-1-8842-4",
      "module": "lesen",
      "teil": 1,
      "type": "richtig_falsch",
      "question": "Die Arbeit im Freien ist körperlich zu anstrengend für die Autorin.",
      "options": [],
      "correct": "Falsch",
      "correctAnswer": "Falsch",
      "explanation": "Das Gegenteil: Sie genießt die körperliche Arbeit im Garten besonders nach einem langen Bürotag.",
      "passageId": "gen-l1-8842",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-1-8842-5",
      "module": "lesen",
      "teil": 1,
      "type": "richtig_falsch",
      "question": "Der Garten bietet eine gute Gelegenheit für den sozialen Kontakt.",
      "options": [],
      "correct": "Richtig",
      "correctAnswer": "Richtig",
      "explanation": "Nachbarn besuchen sie regelmäßig im Garten und sie tauschen Tipps aus — auch abends gemeinsam.",
      "passageId": "gen-l1-8842",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-1-8842-6",
      "module": "lesen",
      "teil": 1,
      "type": "richtig_falsch",
      "question": "Die meisten Nutzer des Gemeinschaftsgartens gehören derselben Generation an.",
      "options": [],
      "correct": "Falsch",
      "correctAnswer": "Falsch",
      "explanation": "Der Text erwähnt einen Austausch zwischen den Generationen — verschiedene Altersgruppen kommen dort zusammen.",
      "passageId": "gen-l1-8842",
      "lang": "de",
      "level": "B1"
    }
  ]
}
```

Genera UNA parte **NUEVA** (tema distinto al ejemplo), mismas reglas, integrando PALABRAS OBJETIVO. Devuelve solo el JSON.
