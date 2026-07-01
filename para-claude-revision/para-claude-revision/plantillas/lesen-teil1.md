# Plantilla de generación — Lesen B1 · Teil 1

Pega TODO este texto en Gemini/ChatGPT/Claude. Sustituye **PALABRAS OBJETIVO** (8–12 palabras).
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
2. Pasaje en **ich** (ich/mir/meine/mich).
3. **Anti word-matching:** en cada afirmación, **máximo 2 palabras de contenido (≥4 letras) iguales al pasaje**. Parafrasea con sinónimos que NO estén en el texto.
4. Al menos **2 Richtig** y **2 Falsch**.
5. **Los ítems Falsch lo son por CONTRADICCIÓN DE CONTENIDO** (el pasaje dice X, la afirmación dice lo contrario o algo no implicado), NUNCA por una palabra-señal. **Máximo 1** ítem en todo el examen puede contener un cuantificador absoluto (alle/jede/immer/nie/nur/komplett) y, si lo usas, debe ser pedagógicamente justificado. **PROHIBIDO** el constructo "ausschließlich täglich" y combinaciones forzadas de cuantificadores. "täglich" NO es un cuantificador de alcance: no lo uses como truco.
6. **Pronombres coherentes:** todas las afirmaciones sobre la autora/el autor con solo **sie/ihre** O solo **er/seine** — nunca mezclar.

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
- **8–12 palabras** (no 15). Intégralas sobre todo en el **pasaje**, no en las preguntas.
- Pool **solo Lesen**; Hören es otro módulo.

## PALABRAS OBJETIVO
<<< gemeinschaft, nachbar, freizeit, programm, organisation, erfahrung, stadt, kurs, familie, bewohner >>>

## AUTORREVISIÓN (obligatoria)
- ¿Pasaje ≥165 palabras?
- ¿Cada afirmación comparte ≤2 palabras de contenido con el pasaje?
- ¿Los ítems Falsch se sostienen por contradicción de contenido (no por palabra absoluta)?
- ¿≤1 ítem con cuantificador absoluto y NINGUNO con "ausschließlich täglich"?
- ¿Misma referencia sie O er en todas las preguntas?
- ¿Sin tono moralizante?
- ¿Solo JSON, sin markdown?

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
      "question": "Die Autorin nutzt das Hochbeet, um ihre Freizeit aktiver zu gestalten.",
      "options": [],
      "correct": "Richtig",
      "correctAnswer": "Richtig",
      "explanation": "Sie vergisst ihren Job dabei und ist aktiv.",
      "passageId": "gen-l1-8842",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-1-8842-2",
      "module": "lesen",
      "teil": 1,
      "type": "richtig_falsch",
      "question": "Sie ist immer ungeduldig, wenn sie auf die Ernte wartet.",
      "options": [],
      "correct": "Falsch",
      "correctAnswer": "Falsch",
      "explanation": "Sie hat gelernt, abzuwarten.",
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
      "explanation": "Sie findet, es schmeckt besser.",
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
      "explanation": "Sie genießt die körperliche Arbeit.",
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
      "explanation": "Sie tauscht sich mit Nachbarn aus.",
      "passageId": "gen-l1-8842",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-1-8842-6",
      "module": "lesen",
      "teil": 1,
      "type": "richtig_falsch",
      "question": "Nur alte Menschen nutzen diesen Gemeinschaftsgarten.",
      "options": [],
      "correct": "Falsch",
      "correctAnswer": "Falsch",
      "explanation": "Es gibt einen Austausch zwischen den Generationen.",
      "passageId": "gen-l1-8842",
      "lang": "de",
      "level": "B1"
    }
  ]
}
```

Genera UNA parte **NUEVA** (tema distinto al ejemplo), mismas reglas, integrando PALABRAS OBJETIVO. Devuelve solo el JSON.
