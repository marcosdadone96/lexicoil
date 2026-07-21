# diagnostico-t4-t5.md

Generado: 2026-07-06T17:48:44.446Z

## 1. Plantillas completas

### plantillas-lesen-b1/lesen-teil4.md

﻿# Plantilla de generación — Lesen B1 · Teil 4

Pega TODO este texto en Gemini/ChatGPT/Claude. Sustituye **PALABRAS OBJETIVO** (5–8 palabras).
Devuelve **SOLO JSON**. El ejemplo de abajo pasa validación técnica + calidad + CEFR al 100%.

---

Eres examinador del Goethe-Zertifikat B1. Genera **UNA** parte de **Lesen Teil 4**
(foro con opiniones, Ja/Nein), alemán estándar, nivel B1.

## Reglas estrictas
- Formato: **forum_opinions** — 1 intro breve + **7 opiniones** en `signText`.
- **7 preguntas** exactas, tipo **ja_nein** con opciones **a) Ja** / **b) Nein**.
- **LAS 7 PREGUNTAS DEBEN TENER EL MISMO ENUNCIADO AFIRMATIVO**, por ejemplo:
  `"Ist [Vorname] für den Vorschlag?"` — solo varía el nombre.
- **PROHIBIDO en el enunciado de pregunta:** nicht, kein, lehnt, gegen, ablehnen, widerspricht.
  ❌ "Lehnt Thomas den Vorschlag ab?" → ✅ "Ist Thomas für den Vorschlag?"

## LONGITUD CEFR (OBLIGATORIO)
- `passages[0].text`: intro al debate, **50–70 palabras**.
- Cada pregunta lleva **`signText`** con la opinión (~**25–35 palabras**).
- **Suma total** (intro + 7 × signText): **150–380 palabras**, máximo **400**.
- No repitas el mismo texto en `text` y `signText`.

## VOCABULARIO B1 (cobertura ≥75% — OBLIGATORIO)
Usa léxico **simple y frecuente**:

> Stadt, Transport, Auto, Nachhaltigkeit, Kinder, Besucher, Organisation, Nachbar, Familie, Erfahrung, Meinung, Problem, Vorteil, Plan, Regel

**PROHIBIDO:** empfand, faszinierend, jurídico-raro, tono moralizante («Abschließend…», «man sollte wissen»).

**Usa:** finden, denken, meinen, wichtig, weil, dass — frases claras B1.

## REGLAS DE CALIDAD (rechazo automático si fallas)
1. **Enunciado igual para todos:** las 7 preguntas = "Ist [Nombre] für den Vorschlag?" (solo cambia el nombre). **PROHIBIDA cualquier negación en el enunciado.**
2. Opciones siempre exactamente **a) Ja** y **b) Nein**.
3. **Distribución OBLIGATORIA:** exactamente **3 Ja y 4 Nein** (o 4 Ja y 3 Nein) — NUNCA ≥5 del mismo.
4. **≥2 opiniones con matices:** crítica parcial pero a favor en general (→ Ja) o escepticismo parcial pero en contra (→ Nein). El alumno debe leer con atención.
5. **Anti word-matching:** pregunta ↔ `signText` — el nombre está permitido; el resto ≤2 palabras de contenido comunes.
6. **Coherencia clave ↔ signText (OBLIGATORIO):**
   - `signText` con «nicht gut», «bin dagegen», «sage ich Nein», «lehne ab» → `correct` = **Nein**
   - `signText` con «bin dafür», «finde ich gut», «unterstütze», «stimme zu» → `correct` = **Ja**
   - Verifica cada ítem antes de emitir. Una clave invertida provoca rechazo automático.

## ANTI WORD-MATCHING — MALO vs BUENO (léelo antes de escribir)

Opinión: *«Ich finde **Fahrrad**fahren gut…»*

❌ **MALO:** «Findet die Person **Fahrrad**fahren gut?»
✅ **BUENO:** «Hält die Person Radfahren für eine gute Alternative zum Auto?» (≤2 palabras del signText).

**Proceso obligatorio:** escribe cada `signText`; luego redacta la pregunta **sin** repetir sustantivos/verbos clave.

## PALABRAS OBJETIVO — límites
- **5–8 palabras** (no más). Intégralas en intro y opiniones, no en las preguntas. Si una no encaja con el tema, omítela.
- Pool **solo Lesen**; Hören es otro módulo.

## PALABRAS OBJETIVO
<<< stadt, transport, auto, nachhaltigkeit, kinder, besucher, organisation, nachbar, familie, erfahrung >>>

## AUTORREVISIÓN (obligatoria)
- ¿Intro 50–70 palabras + 7 signText (~25–35 c/u), suma 150–380?
- ¿Las **7 preguntas tienen el mismo enunciado** "Ist [Name] für den Vorschlag?" (solo varía el nombre)?
- ¿Ningún enunciado de pregunta contiene nicht/kein/lehnt/gegen/ablehnen?
- ¿Cada pregunta tiene `signText` y `passageId`?
- ¿Opciones exactamente a) Ja / b) Nein?
- ¿3–4 Ja y 4–3 Nein?
- ¿`correct` coincide con la postura real del `signText`? (una clave invertida = rechazo)
- ¿Sin tono moralizante?
- ¿Solo JSON, sin markdown?

## Formato de salida
Devuelve SOLO `{ "passages": [...], "questions": [...] }` — sin ```, sin texto extra.
- IDs únicos: `gen-l4-XXXX` / `gen-q-4-XXXX-N` (XXXX aleatorio, no reutilizar ejemplo).
- `module`:"lesen", `teil`:4 (número), `lang`:"de", `level`:"B1".
- `correct` = `correctAnswer` (**Ja** o **Nein**). Cada pregunta con **`signText`** + `passageId`.

## EJEMPLO VERIFICADO (100% checker — imita estructura, matices y parafraseo)

```json
{
  "passages": [
    {
      "id": "gen-l4-8842",
      "module": "lesen",
      "teil": 4,
      "title": "Forum: Autofreie Innenstadt — ja oder nein?",
      "text": "Die Organisation in der Stadt plant neue Regeln für Autos im Zentrum an normalen Tagen. Viele Besucher wünschen weniger Verkehr und bessere Luft, weil Transport und Nachhaltigkeit wichtige Themen bleiben. Viele Nachbarn beschreiben Erfahrungen in lokalen Programmen und in Zeitungen. Lesen Sie die Meinungen — stimmt die Person dem Vorschlag insgesamt zu?"
    }
  ],
  "questions": [
    {
      "id": "gen-q-4-8842-1",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Sabine für den Vorschlag?",
      "options": ["a) Ja", "b) Nein"],
      "correct": "Ja",
      "correctAnswer": "Ja",
      "explanation": "Sabine befürwortet die autofreie Mitte, verlangt aber, dass die Organisation Lieferzeiten für Läden einplant.",
      "signText": "Weniger Autos in der Mitte finde ich gut, weil Besucher dort in Ruhe gehen können und Kinder mehr Platz auf den Straßen haben. Läden brauchen Zeiten für Lieferungen, aber die Organisation kann das planen. Ich unterstütze den Vorschlag insgesamt.",
      "passageId": "gen-l4-8842",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-4-8842-2",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Thomas für den Vorschlag?",
      "options": ["a) Ja", "b) Nein"],
      "correct": "Nein",
      "correctAnswer": "Nein",
      "explanation": "Er sagt explizit 'nicht gut' — er ist gegen den Vorschlag (Nein).",
      "signText": "Ich wohne am Stadtrand und die Busse fahren selten zu meinen Zeiten, obwohl ich den Plan verstehe. Ohne Auto komme ich nicht zum Arzt oder zum Einkauf in der Stadt. Für mich ist der Vorschlag deshalb nicht gut.",
      "passageId": "gen-l4-8842",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-4-8842-3",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Mira für den Vorschlag?",
      "options": ["a) Ja", "b) Nein"],
      "correct": "Ja",
      "correctAnswer": "Ja",
      "explanation": "Sie will weniger Autos, findet aber den Zeitplan zu schnell.",
      "signText": "Weniger Autos sind richtig für Kinder und Besucher in der Stadt, weil die Straßen dann sicherer werden. Alles schon nächsten Monat zu ändern ist aus meiner Sicht zu schnell. Das Ziel finde ich trotzdem gut.",
      "passageId": "gen-l4-8842",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-4-8842-4",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Oskar für den Vorschlag?",
      "options": ["a) Ja", "b) Nein"],
      "correct": "Nein",
      "correctAnswer": "Nein",
      "explanation": "Er sagt 'sage ich Nein' — er ist gegen den Vorschlag (Nein).",
      "signText": "Als Ladenbesitzer in der Stadt sage ich Nein, weil viele Kundinnen mit dem Auto kommen und schwere Sachen kaufen. Ohne Parkplätze vor der Tür gehen sie woanders hin, und das sehe ich schon jetzt in meinem Geschäft.",
      "passageId": "gen-l4-8842",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-4-8842-5",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Jana für den Vorschlag?",
      "options": ["a) Ja", "b) Nein"],
      "correct": "Nein",
      "correctAnswer": "Nein",
      "explanation": "Sie nennt die saubere Luft einen Vorteil und plädiert für einen Test.",
      "signText": "Die Luft wäre sicher besser, da gebe ich zu, weil weniger Autos oft helfen. Trotzdem will ich erst ein halbes Jahr testen, statt gleich alles zu verbieten. Ich bin nicht grundsätzlich dagegen, nur gegen den starren Plan.",
      "passageId": "gen-l4-8842",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-4-8842-6",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Felix für den Vorschlag?",
      "options": ["a) Ja", "b) Nein"],
      "correct": "Ja",
      "correctAnswer": "Ja",
      "explanation": "Er pendelt mit ÖPNV und sieht keinen Bedarf für private Autos im Zentrum.",
      "signText": "Ich fahre mit der Straßenbahn ins Büro, weil das für mich schneller ist als im Stau mit dem Auto. Autos in der Mitte brauchen wir nicht, solange Bus und Bahn im Takt laufen. Deshalb bin ich dafür.",
      "passageId": "gen-l4-8842",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-4-8842-7",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Helena für den Vorschlag?",
      "options": ["a) Ja", "b) Nein"],
      "correct": "Nein",
      "correctAnswer": "Nein",
      "explanation": "Sie warnt vor teureren Lieferungen, lehnt das Konzept aber nicht pauschal ab.",
      "signText": "Lieferwagen brauchen Zufahrt in die Stadt, sonst werden Produkte teurer und Nachbarn zahlen mehr. Ich bin skeptisch, ob das alles klappt, aber grundsätzlich verboten finde ich es nicht, wenn es Ausnahmen gibt.",
      "passageId": "gen-l4-8842",
      "lang": "de",
      "level": "B1"
    }
  ]
}
```

Genera UNA parte **NUEVA** (tema distinto al ejemplo), mismas reglas, integrando PALABRAS OBJETIVO. Devuelve solo el JSON.


### plantillas-lesen-b1/lesen-teil5.md

﻿# Plantilla de generación — Lesen B1 · Teil 5

Pega TODO este texto en Gemini/ChatGPT/Claude. Sustituye **PALABRAS OBJETIVO** (5–8 palabras).
Devuelve **SOLO JSON**. El ejemplo de abajo pasa validación técnica + calidad + CEFR al 100%.

---

Eres examinador del Goethe-Zertifikat B1. Genera **UNA** parte de **Lesen Teil 5**
(Hausordnung / reglas, Multiple Choice a/b/c), alemán estándar, nivel B1.

## Reglas estrictas
- Formato: **rules_mcq** — **1 texto normativo** (Hausordnung, Bibliotheksordnung, Sportverein…).
- **4 preguntas** exactas, tipo **multiple_choice** con opciones **a/b/c**.
- Pasaje: **185–230 palabras** (mínimo ingest **180** — cuenta antes de responder).

## LONGITUD CEFR (OBLIGATORIO)
Si el texto tiene menos de 185 palabras, **añade reglas concretas** (horarios, precios, excepciones, plazos).
Incluye **≥5 reglas distintas** con cifras o condiciones claras.

## VOCABULARIO B1 (cobertura ≥75% — OBLIGATORIO)
Usa formulaciones **normativas simples**:

> Bewohner, Ruhe, Termin, Organisation, Parkplatz, Müll, Raum, Gebühr, Nachbar, Familie, Öffnungszeiten, Regel, Kosten, Waschen, Fahrrad

**PROHIBIDO:** jerga jurídica densa, empfand, faszinierend, tono moralizante, anglicismos raros.

## REGLAS DE CALIDAD (rechazo automático si fallas)
1. **Sin tono moralizante** (mismas frases prohibidas que en T1).
2. Cada pregunta exige **combinar ≥2 datos** del texto (plazo + condición, horario + excepción…).
3. **Anti word-matching:** pregunta y opción correcta — **máximo 2 palabras de contenido (≥4 letras) iguales al pasaje** cada una.
4. La opción correcta **NO copia 4+ palabras seguidas** del pasaje.
5. **Distractores:** cifras/horarios/reglas **cercanos pero incorrectos** (no absurdos).

## ANTI WORD-MATCHING — MALO vs BUENO (léelo antes de escribir)

Regla: *«**Ruhe** abends spät bis morgens früh…»*

❌ **MALO:** «Gilt **Ruhe** abends?» + opción «Ja, **Ruhe** abends spät».
✅ **BUENO:** «Wann müssen die Nachbarn still sein?» + «In der Nacht und am Sonntag durchgehend.» (parafraseo, cifra correcta).

**Proceso obligatorio:** lista las 5+ reglas con cifras; redacta preguntas que **crucen** dos datos sin copiar la frase literal.

## PALABRAS OBJETIVO — límites
- **5–8 palabras** (no más). Intégralas en el **texto normativo**, no en las preguntas. Si una no encaja, omítela.
- Pool **solo Lesen**; Hören es otro módulo.

## PALABRAS OBJETIVO
<<< bewohner, ruhe, termin, organisation, parkplatz, müll, raum, gebühr, nachbar, familie >>>

## AUTORREVISIÓN (obligatoria)
- ¿Pasaje ≥185 palabras (mín. 180) con ≥5 reglas concretas?
- ¿4 preguntas a/b/c que combinan ≥2 datos del texto?
- ¿Pregunta + opción correcta comparten ≤2 palabras de contenido con el pasaje?
- ¿Distractores plausibles con cifras/horarios cercanos?
- ¿Sin tono moralizante?
- ¿Cada explanation tiene ≥10 palabras? Cuenta: si tiene 9 o menos, añade una frase explicativa. (CHK-18 rechaza automáticamente)
- ¿Solo JSON, sin markdown?

## Formato de salida
Devuelve SOLO `{ "passages": [...], "questions": [...] }` — sin ```, sin texto extra.
- IDs únicos: `gen-l5-XXXX` / `gen-q-5-XXXX-N` (XXXX aleatorio, no reutilizar ejemplo).
- `module`:"lesen", `teil`:5 (número), `lang`:"de", `level`:"B1".
- `correct` = `correctAnswer`. Cada pregunta con `passageId` válido.

## EJEMPLO VERIFICADO (100% checker — imita estructura, reglas y parafraseo)

```json
{
  "passages": [
    {
      "id": "gen-l5-8842",
      "module": "lesen",
      "teil": 5,
      "title": "Regeln in der Wohnanlage Parkblick",
      "text": "Regeln in der Wohnanlage Parkblick:\n- Ruhe abends spät bis morgens früh, sonntags den ganzen Tag.\n- Papier und Müll in Behälter; große Sachen nur mit Termin bei der Organisation (Montag bis Donnerstag, neun bis zwölf Uhr).\n- Raum zum Waschen über Liste buchen, zwei Termine pro Woche.\n- Fahrräder im Raum neben dem Waschen, nicht im Flur.\n- Parkplätze für Bewohner fünfundzwanzig Euro im Monat; Gästeparkplätze bis zwanzig Uhr ohne Kosten, danach zwei Euro pro Stunde.\n\nViele Bewohner entscheiden sich für diese Regeln, weil Ruhe nach der Arbeit wichtig ist. Nachbarn lernen sich kennen und beschreiben Erfahrungen in lokalen Programmen. Experten erklären, dass Nachhaltigkeit, Technologie und Gesundheit zentrale Themen sind. Viele Programme empfehlen, den Verbrauch zu reduzieren und Produkte lokal zu nutzen. Wenn Nachbarn zusammenarbeiten, entstehen positive Erfahrungen für Familien und Kinder. Artikel in Zeitungen beschreiben Wünsche und Pläne vieler Stadtbewohner. Obwohl nicht jede Regel einfach ist, bleibt Ordnung wichtig für alle. Der Bericht zeigt, dass Klima und Energie im Alltag wichtige Themen bleiben. Schule und Beruf profitieren, weil Kinder Natur und Ernährung praktisch erfahren."
    }
  ],
  "questions": [
    {
      "id": "gen-q-5-8842-1",
      "module": "lesen",
      "teil": 5,
      "type": "multiple_choice",
      "question": "Wann müssen laut Regeln die Nachbarn Ruhe halten?",
      "options": [
        "a) In der Nacht und am Sonntag durchgehend.",
        "b) Nur werktags von achtzehn bis zwanzig Uhr.",
        "c) Nur in der Nacht am Wochenende."
      ],
      "correct": "a",
      "correctAnswer": "a",
      "explanation": "Ruhe gilt abends spät bis morgens früh, sonntags den ganzen Tag.",
      "passageId": "gen-l5-8842",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-5-8842-2",
      "module": "lesen",
      "teil": 5,
      "type": "multiple_choice",
      "question": "Was müssen Bewohner mit großen Sachen tun?",
      "options": [
        "a) Sie in Behälter im Hof legen.",
        "b) Sie müssen vorher einen Zeitpunkt mit der Verwaltung klären.",
        "c) Sie in die Papiertonne werfen."
      ],
      "correct": "b",
      "correctAnswer": "b",
      "explanation": "Für die Entsorgung großer Gegenstände müssen Bewohner vorab einen Termin mit der Verwaltung vereinbaren.",
      "passageId": "gen-l5-8842",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-5-8842-3",
      "module": "lesen",
      "teil": 5,
      "type": "multiple_choice",
      "question": "Wo sollen Fahrräder abgestellt werden?",
      "options": [
        "a) Im Flur des Hauses.",
        "b) Auf den Gästeparkplätzen.",
        "c) In dem dafür vorgesehenen Nebenraum neben dem Waschraum."
      ],
      "correct": "c",
      "correctAnswer": "c",
      "explanation": "Laut Regeln gehören Fahrräder in den Raum neben dem Waschen, nicht in den Flur.",
      "passageId": "gen-l5-8842",
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-5-8842-4",
      "module": "lesen",
      "teil": 5,
      "type": "multiple_choice",
      "question": "Was gilt für Gästeparkplätze an Werktagen nach 20:00 Uhr?",
      "options": [
        "a) Sie bleiben kostenlos.",
        "b) Es fallen 2 € pro angefangener Stunde an.",
        "c) Sie sind nur mit Anwohnerausweis nutzbar."
      ],
      "correct": "b",
      "correctAnswer": "b",
      "explanation": "Gästeparkplätze sind bis zwanzig Uhr ohne Kosten, danach zwei Euro pro Stunde.",
      "passageId": "gen-l5-8842",
      "lang": "de",
      "level": "B1"
    }
  ]
}
```

Genera UNA parte **NUEVA** (tema distinto al ejemplo), mismas reglas, integrando PALABRAS OBJETIVO. Devuelve solo el JSON.


## 2. Prompt y bucle de generación

### Nota sobre `buildLesenPrompt`

`scripts/generate-lesen-part-gemini.mjs` **importa** `buildLesenPrompt` desde `scripts/lib/lesenTemplatePrompt.mjs` (línea 25). No está definida en el generador.

### ¿El prompt de reintento incluye el motivo de fallo?

**Sí**, en la mayoría de reintentos por fallo de checker:
- `resetPromptWithFix(issues, gate)` concatena `baseUserPrompt + buildFixNote(issues, gate)`.
- `buildFixNote` añade un bloque `--- CORRECCIÓN REQUERIDA ---` con hasta 5 mensajes del checker y pide JSON corregido.
- Excepción CHK-29: `resetPromptFresh(hint)` **reconstruye el prompt desde cero** (nuevo molde) y solo añade: `intento anterior rechazado por calidad (hint)` — no el detalle completo del CHK-29.
- Reparaciones localizadas (word_match, mcq_distinct) usan prompts separados con el error explícito.

### `buildLesenPrompt` — scripts/lib/lesenTemplatePrompt.mjs

```javascript
export function buildLesenPrompt(teil, words, options = {}) {
  const {
    idSuffix, textSubtype, subtypeDef, excludeMolds, debateTopic, debateDef, topicTag,
    fewShotExamples, minimalRules,
  } = options;
  const raw = loadLesenTemplate(teil);
  let prompt = injectTargetWords(stripHumanHeader(raw), words);
  if (idSuffix) {
    prompt +=
      `\n\nIMPORTANTE — IDs de esta generación:\n` +
      `- Prefijo de passages: gen-l${teil}-${idSuffix}\n` +
      `- Prefijo de preguntas: gen-q-${teil}-${idSuffix}-\n` +
      `No reutilices IDs del ejemplo ni del banco existente.`;
  }
  if (Number(teil) === 5 && subtypeDef) {
    prompt = injectT5PromptVariants(prompt, { textSubtype, subtypeDef, excludeMolds });
  }
  if (Number(teil) === 4 && debateDef) {
    prompt = injectT4PromptVariants(prompt, { debateTopic, debateDef, excludeMolds, topicTag });
  }
  if (fewShotExamples?.length) {
    prompt = prompt.replace(/\n## AUTORREVISIÓN[\s\S]*?(?=\n## PALABRAS OBJETIVO|\n## LONGITUD|$)/, '\n');
    prompt += buildFewShotLesenBlock(Number(teil), fewShotExamples);
  }
  prompt += teilLengthBlock(Number(teil));
  if (minimalRules) {
    prompt +=
      `\n\nCHECKLIST FINAL (mínima — calidad vía ejemplos verificados arriba):\n` +
      `- JSON válido único; IDs con el prefijo de esta generación.\n` +
      `- Tema B1 pedido; parafraseo B1 (máx. 2 palabras de contenido iguales al pasaje por afirmación).\n` +
      `- Vocabulario preguntas/explications ≤ B1; sin jerga B2/C1.\n` +
      (Number(teil) === 1 ? `- (T1) Blog en ich; 6 RF; misma persona (sie O er) en todas las afirmaciones.\n` : '') +
      `- Imita **estilo y dificultad** de los ejemplos verificados; contenido **nuevo**.\n` +
      `- Responde SOLO con el objeto JSON.\n`;
  } else {
    prompt +=
    `\n\nCHECKLIST FINAL (Goethe Hard Mode + CEFR):\n` +
    `- Cumple la sección «Goethe Hard Mode» de esta plantilla.\n` +
    `- Anti–word-matching: parafraseo, no emparejar palabras sueltas.\n` +
    `- Longitud: cumple el mínimo CEFR de arriba (cuenta palabras).\n` +
    `- El batch debe pasar check-lesen-batch-quality.mjs y check-lesen-batch-ingest.mjs sin errores.\n` +
    `- VOCABULARIO SUGERIDO: integra palabras solo si encajan; omite las que no encajen.\n` +
    `- Anti word-matching: máx. 2 palabras de contenido iguales al pasaje por afirmación/pregunta.\n` +
    `- Parafraseo B1 (T1/T2): vocabulario de preguntas/opciones/explanations ≤ B1 — sinónimo NO más difícil que el pasaje. ` +
    `PROHIBIDO modifizieren, Gelassenheit, Angehörige, elektronische Mitteilungen, sich austauschen, jerga B2.\n` +
    `- CEFR: evita Eigenregie, empfand, faszinierend, gebucht, Smartphone — usa léxico simple.\n` +
    (Number(teil) === 1
      ? `- (T1) Misma referencia sie/ihre O er/seine en todas las afirmaciones — nunca mezclar.\n`
      : '') +
    (Number(teil) === 2
      ? `- (T2) Los DOS textos deben tratar el TEMA OBLIGATORIO; topicTag idéntico en ambos passages.\n` +
        `- (T2) Textos de prensa B1: PROHIBIDO lenguaje corporativo/marketing/negocios ` +
        `(«Marke stärken», «die eigene Marke», «Branding», «Image pflegen», «Reichweite», ` +
        `«Zielgruppe», «Marketing», «Corporate»). Usa lenguaje cotidiano de periódico local.\n` +
        `- (T2) MCQ: las 3 opciones a/b/c deben ser **mutuamente excluyentes**. PROHIBIDO que dos ` +
        `opciones parafraseen el mismo hecho con sinónimos (p. ej. verbessern / besser machen, ` +
        `Unterstützung / Betreuung). Los distractores incorrectos deben usar **otro dato del pasaje ` +
        `mal aplicado o incompleto**, no otra formulación de la respuesta correcta.\n` +
        `- (T2) Opción correcta: PROHIBIDO copiar ≥4 palabras seguidas del pasaje; máx. 3 palabras ` +
        `de contenido (≥4 letras) iguales al pasaje — parafrasea con sinónimos B1.\n`
      : '') +
    (Number(teil) === 5
      ? `- (T5) Texto normativo B1 (Hausordnung/Regeln): opción correcta MCQ NO puede copiar ≥5 palabras ` +
        `seguidas del pasaje; máx. 3 palabras de contenido iguales — parafrasea la regla con otras palabras B1.\n`
      : '') +
    (Number(teil) === 4 && debateDef
      ? `- (T4) El foro debate el Vorschlag rotado y debe tratar del **tema B1 pedido** (topicTag); ` +
        `no debates genéricos de otro ámbito (p. ej. Homeoffice si el tema es Technik).\n`
      : '') +
    `- explanation: ≥10 palabras para multiple_choice (CHK-18 rechaza si es más corta). Usa frases completas que justifiquen la respuesta.\n` +
    `- Responde SOLO con el objeto JSON (sin markdown, sin \`\`\`, sin texto antes ni después).`;
  }
  return prompt;
}
```

### `buildLesenPromptBundle` — scripts/generate-lesen-part-gemini.mjs

```javascript
function buildLesenPromptBundle(teil, words, session, moldCtx = null, args = null) {
  const idSuffix = randomBytes(4).toString('hex');
  const promptOpts = {
    idSuffix,
    ...(moldCtx?.promptOpts || {}),
    fewShotExamples: args?.fewShotExamples || null,
    minimalRules: args?.minimalPromptRules === true,
  };
  const fullPrompt = buildLesenPrompt(teil, words, promptOpts);
  return { idSuffix, fullPrompt, systemPrompt: null, userPrompt: fullPrompt, moldCtx };
}
```

### `buildFixNote` — scripts/generate-lesen-part-gemini.mjs

```javascript
function buildFixNote(issues, gate = 'checker') {
  const list = (Array.isArray(issues) ? issues : [issues]).filter(Boolean).slice(0, 5);
  let extra = '';
  if (list.some((i) => /slot_not_in_blueprint/i.test(String(i)))) {
    extra =
      '\nCada pregunta y pasaje DEBE incluir `"module":"lesen"` y `"teil":N (número).';
  }
  if (list.some((i) => /type_not_allowed/i.test(String(i)))) {
    extra +=
      '\nT1→type "richtig_falsch" · T2/T5→"multiple_choice" con options a/b/c · T4→"ja_nein".';
  }
  if (list.some((i) => /palabras idénticas|copia literal|word-matching/i.test(String(i)))) {
    extra +=
      '\nANTI WORD-MATCHING: reescribe cada afirmación/pregunta SIN repetir palabras del pasaje ' +
      '(máx. 2 palabras de contenido iguales). Usa sinónimos.';
  }
  // Scope-trap hint eliminado: CHK-10 del auditor gestiona la correlación; no forzamos
  // ningún requisito de absolute-word aquí para evitar el patrón "absoluta→Falsch".
  return (
    `\n\n--- CORRECCIÓN REQUERIDA ---\n` +
    `El checker de ${gate} detectó:\n${list.map((i) => `- ${i}`).join('\n')}${extra}\n` +
    `Corrige SOLO esos problemas. Devuelve el JSON completo corregido, sin markdown ni comentarios.`
  );
}
```

### `generateLlmPart` (bucle fixRetries completo) — scripts/generate-lesen-part-gemini.mjs

```javascript
async function generateLlmPart(args, teil, session) {
  args.teil = teil;
  const words = resolveTargetWords(args);
  const tag = 'gemini';

  const chosenTopic = args._resolvedTopic || pickNextTopic(GENERATED_DIR, { module: 'lesen', teil });
  console.log(`Tema: ${chosenTopic}${args.topic ? ' (elegido)' : ' (rotación)'}`);

  let moldCtx = resolveMoldContext(args, teil, chosenTopic);
  let promptBundle = buildLesenPromptBundle(teil, words, session, moldCtx, args);
  // Inyectar tema en el prompt
  promptBundle = {
    ...promptBundle,
    userPrompt: injectTopicIntoPrompt(promptBundle.userPrompt, chosenTopic),
    fullPrompt: promptBundle.fullPrompt
      ? injectTopicIntoPrompt(promptBundle.fullPrompt, chosenTopic)
      : promptBundle.fullPrompt,
  };
  let prompt = promptBundle.userPrompt;
  let baseUserPrompt = prompt;

  const resetPromptWithFix = (issues, gate) => {
    const note = buildFixNote(issues, gate);
    prompt = baseUserPrompt + note;
  };

  const resetPromptFresh = (hint) => {
    moldCtx = resolveMoldContext(args, teil, chosenTopic);
    promptBundle = buildLesenPromptBundle(teil, words, session, moldCtx, args);
    const base = injectTopicIntoPrompt(promptBundle.userPrompt, chosenTopic);
    prompt = hint
      ? `${base}\n\nNota: intento anterior rechazado por calidad (${hint}). Genera contenido NUEVO desde cero con el subtipo obligatorio.`
      : base;
    promptBundle = { ...promptBundle, userPrompt: prompt, fullPrompt: prompt };
    baseUserPrompt = prompt;
  };

  const resolveMaxTokens = () => resolveMaxOutputTokens(session.provider, 'lesen', teil);

  const basename = nextOutputBasename(teil, tag);
  const outFile = path.join(GENERATED_DIR, basename);
  const relFile = path.relative(ROOT, outFile).replace(/\\/g, '/');
  let maxTokens = resolveMaxTokens();

  console.log(`\n── Lesen T${teil} · ${basename} ──`);
  console.log(`Proveedor: ${session.provider} · Palabras (${words.length}): ${words.join(', ')}`);
  console.log(`Modelo: ${session.model} · max_output_tokens=${maxTokens}`);

  if (args.dryRun) {
    console.log('\n[dry-run] Prompt (primeras 1200 chars):\n');
    console.log(prompt.slice(0, 1200) + (prompt.length > 1200 ? '…' : ''));
    console.log(`\n[dry-run] Se guardaría en: ${relFile}`);
    return { ok: true, dryRun: true, file: relFile, teil, words };
  }

  if (usesApiBudget(session.provider) && budgetRemaining(session) <= 0) {
    session.stopped = true;
    session.stopReason = 'max-api-calls';
    throw new ApiBudgetStopError();
  }

  let partAttempts = 0;
  let lastIssue = null;
  let lastBatch = null;

  for (let fix = 0; fix <= args.fixRetries; fix++) {
    partAttempts += 1;
    maxTokens = resolveMaxTokens();
    if (fix > 0) {
      console.log(`\nReintento ${fix}/${args.fixRetries} · ${lastIssue || 'checker'}…`);
    }

    let text;
    let usage;
    let stopReason;
    let lastApiError = null;

    for (let attempt = 1; attempt <= args.apiRetries; attempt++) {
      try {
        if (attempt > 1) console.log(`Reintento API ${attempt}/${args.apiRetries}…`);
        const result = await callLlm(session, args, { prompt, maxTokens });
        text = result.text;
        usage = result.usage;
        stopReason = result.stopReason;
        lastApiError = null;
        break;
      } catch (err) {
        if (
          err instanceof ApiBudgetStopError ||
          err instanceof RateLimitStopError ||
          err instanceof DailyQuotaError
        ) {
          throw err;
        }
        lastApiError = err;
        console.error(`Error ${session.provider}: ${err.message}`);
        if (attempt >= args.apiRetries) {
          if (fix >= args.fixRetries) {
            return {
              ok: false,
              discarded: true,
              teil,
              reason: err.message,
              attempts: partAttempts,
            };
          }
          lastIssue = err.message;
          break;
        }
      }
    }

    if (!text) {
      if (fix < args.fixRetries) {
        resetPromptWithFix(lastApiError?.message || 'sin respuesta del modelo', 'generación');
        continue;
      }
      return {
        ok: false,
        discarded: true,
        teil,
        reason: lastApiError?.message || 'sin respuesta del modelo',
        attempts: partAttempts,
      };
    }

    if (isLikelyTruncated(session.provider, usage, maxTokens, stopReason)) {
      const msg = `JSON truncado (max_output_tokens=${maxTokens})`;
      lastIssue = msg;
      if (fix < args.fixRetries) {
        resetPromptWithFix(msg, 'formato');
        continue;
      }
      return { ok: false, discarded: true, teil, reason: msg, attempts: partAttempts };
    }

    let batch;
    try {
      batch = extractJson(text);
    } catch (err) {
      lastIssue = err.message;
      if (fix < args.fixRetries) {
        resetPromptWithFix(err.message, 'formato');
        continue;
      }
      return { ok: false, discarded: true, teil, reason: err.message, attempts: partAttempts };
    }

    if (!batch || typeof batch !== 'object' || !Array.isArray(batch.questions)) {
      const msg = 'JSON raíz inválido (falta array questions)';
      lastIssue = msg;
      if (fix < args.fixRetries) {
        resetPromptWithFix(msg, 'formato');
        continue;
      }
      return { ok: false, discarded: true, teil, reason: msg, attempts: partAttempts };
    }

    batch = coerceGeneratedLesenPart(batch, {
      module: 'lesen',
      teil,
      lang: args.lang,
      level: args.level,
    });
    batch = tagBatchWithTopic(batch, chosenTopic);
    if (args._resolvedTopic || args.topic) {
      batch._requestedTopic = args._resolvedTopic || args.topic;
    }
    if (moldCtx?.textSubtype) {
      batch._textSubtype = moldCtx.textSubtype;
    }
    if (moldCtx?.debateTopic || moldCtx?.molds?.debateTopic) {
      batch._debateTopic = moldCtx.debateTopic || moldCtx.molds.debateTopic;
    }
    if (args._userVocab?.requested?.length) {
      batch = attachVocabFeedback(batch, args._userVocab.requested, {
        topic: chosenTopic,
        prompted: args._userVocab.prompted,
        excluded: args._userVocab.excluded,
      });
      console.log(formatVocabFeedbackSummary(batch.userVocabFeedback));
    }
    lastBatch = batch;

    if (!args.skipValidate) console.log('Validando formato…');
    if (!args.skipQuality && fix === 0) console.log('Comprobando calidad pedagógica…');

    let result = await finalizeBatch(args, teil, batch, basename, relFile);
    if (result.ok) {
      return { ...result, words, attempts: partAttempts, batch: result.batch || batch };
    }

    lastIssue = result.issue || result.reason || 'checker';

    // ── P2d: triaje de reparación (gratis, sin LLM) ──────────────────────────
    // Intentar antes de gastar un fixRetry pagado.
    {
      const triage = classifyAndRepair(batch, result);

      if (triage.discard) {
        const discardReason = triage.reason || lastIssue || 'triaje: descartar';
        console.log(`  Triaje CUBO D → DESCARTAR: ${discardReason}`);
        if (args.keepFailed && lastBatch) saveRejectedBatch(lastBatch, basename, discardReason);
        return { ok: false, discarded: true, teil, reason: discardReason, attempts: partAttempts };
      }

      if (triage.repaired === true) {
        const cubeLabel = triage.cube || '?';
        const fixedLabel = (triage.fixed || []).join(', ') || 'campos';
        console.log(`  Triaje CUBO ${cubeLabel}: reparado (${fixedLabel}) — re-validando sin LLM…`);
        batch = triage.batch;
        lastBatch = batch;

        const reResult = await finalizeBatch(args, teil, batch, basename, relFile);
        if (reResult.ok) {
          console.log(`  Triaje exitoso → guardado sin reintento LLM`);
          return { ...reResult, words, attempts: partAttempts, batch: reResult.batch || batch };
        }
        result = reResult;
        lastIssue = result.issue || result.reason || 'checker post-triage';
      } else if (triage.repaired === 'targeted' && triage.repairKind === 'word_match' && [1, 2, 5].includes(Number(teil))) {
        console.log(`  word-matching → reparación localizada T${teil} (pasaje fijo)…`);
        const repaired = await repairWordMatchBatch(
          batch,
          teil,
          result.issues || [result.issue || result.reason].filter(Boolean),
          (opts) => callLlm(session, args, opts),
          { maxTokens, lang: args.lang, level: args.level },
        );
        if (repaired) {
          batch = repaired;
          lastBatch = batch;
          const reResult = await finalizeBatch(args, teil, batch, basename, relFile);
          if (reResult.ok) {
            console.log(`  Reparación word-matching OK → guardado sin regenerar parte`);
            return {
              ...reResult,
              words,
              attempts: partAttempts,
              batch: reResult.batch || batch,
              localizedRepair: 'word_match',
            };
          }
          result = reResult;
          lastIssue = result.issue || result.reason || 'checker post-word-match-repair';
        }
      } else if (
        triage.repaired === 'targeted' &&
        triage.repairKind === 'mcq_distinct' &&
        [2, 5].includes(Number(teil))
      ) {
        console.log(`  mcq_distinct (determinista) → reparación localizada T${teil} (opciones, sin regenerar pasaje)…`);
        const findings = triage.sem2Findings?.length
          ? triage.sem2Findings
          : (result.sem2Findings || []).map((f) => ({ itemId: f.itemId || f.scope, detail: f.detail || f.message }));
        const repaired = await repairL2McqDistinctBatch(batch, findings, (opts) =>
          callLlm(session, args, opts),
        );
        if (repaired) {
          batch = repaired;
          lastBatch = batch;
          const reResult = await finalizeBatch(args, teil, batch, basename, relFile);
          if (reResult.ok) {
            console.log(`  Reparación mcq_distinct OK → guardado sin regenerar parte`);
            return { ...reResult, words, attempts: partAttempts, batch: reResult.batch || batch };
          }
          result = reResult;
          lastIssue = result.issue || result.reason || 'checker post-mcq-repair';
        }
      }
    }

    if (isChk29Failure(result) && [4, 5].includes(Number(teil)) && batch) {
      console.log(`  CHK-29 → excluir molde duplicado y regenerar T${teil} con subtipo/debate distinto…`);
      pushSessionMoldExclude(args, batch);
      resetPromptFresh('CHK-29 molde estructural duplicado');
      lastIssue = result.issue || 'CHK-29';
      fix -= 1;
      continue;
    }

    if (fix >= args.fixRetries) {
      console.error(result.detail || result.reason || 'Puertas FAIL');
      if (args.keepFailed && lastBatch) {
        saveRejectedBatch(lastBatch, basename, lastIssue);
      }
      return { ...result, words, attempts: partAttempts };
    }

    resetPromptWithFix(result.issues || result.issue || result.reason, result.gate || 'checker');
  }

  return {
    ok: false,
    discarded: true,
    teil,
    reason: lastIssue || 'Generación fallida',
    attempts: partAttempts,
  };
}
```

## 3. Checks audit-pass-2.mjs

### CHK-7 / chk7

```javascript
function chk7(batch, file) {
  const findings = [];
  const t4qs = (batch.questions || []).filter(q =>
    q.type === 'ja_nein' || (q.module === 'lesen' && Number(q.teil) === 4)
  );
  if (!t4qs.length) return findings;

  // Negation in question text (CRITICAL)
  for (const q of t4qs) {
    const m = (q.question || '').match(T4_NEGATION_RE);
    if (m) {
      findings.push(finding('CHK-7', 'CRITICAL', file, q.id,
        `Lesen T4: enunciado contiene negación "${m[0]}". Debe ser afirmativo: "Ist <Name> für den Vorschlag?"`));
    }
  }

  // Homogeneous pattern: accept "Ist <Name> für …?" OR "Sagt die Person: …" (IMPORTANT if neither)
  const isValidT4Question = (q) => {
    const question = q.question || '';
    return (/^Ist\s/i.test(question) && /\?$/.test(question)) ||
           /^Sagt die Person:/i.test(question);
  };
  const nonAffirmative = t4qs.filter(q => !isValidT4Question(q));
  if (nonAffirmative.length > 0) {
    findings.push(finding('CHK-7', 'IMPORTANT', file, nonAffirmative[0].id,
      `Lesen T4: ${nonAffirmative.length} pregunta(s) no siguen el patrón "Ist <Name> für …?" ni "Sagt die Person: …"`));
  }

  // Coherence: signText stance vs correct (IMPORTANT, heuristic)
  for (const q of t4qs) {
    const st = (q.signText || '').toLowerCase();
    const correct = String(q.correct || '').trim();
    const hasNein = T4_NEIN_MARKERS.some(m => st.includes(m));
    const hasJa   = T4_JA_MARKERS.some(m => st.includes(m));
    const hasTrotzdem = /trotzdem|obwohl|dennoch|zwar/.test(st);

    if (hasNein && !hasTrotzdem && correct === 'Ja') {
      findings.push(finding('CHK-7', 'IMPORTANT', file, q.id,
        `Lesen T4: signText sugiere NEIN ("${T4_NEIN_MARKERS.find(m=>st.includes(m))}") pero correct="${correct}". Revisar manualmente.`));
    }
    if (hasJa && !hasNein && correct === 'Nein') {
      findings.push(finding('CHK-7', 'IMPORTANT', file, q.id,
        `Lesen T4: signText sugiere JA ("${T4_JA_MARKERS.find(m=>st.includes(m))}") pero correct="${correct}". Revisar manualmente.`));
    }

    // Meta-tag antinatural (MINOR)
    if (/\bimplizit\b|\bexplizit\b/i.test(q.signText || '')) {
      findings.push(finding('CHK-7', 'MINOR', file, q.id,
        `Lesen T4: signText contiene meta-etiqueta antinatural ("implizit"/"explizit"). Reformula de forma natural.`));
    }
  }

  // Balance Ja/Nein per file (IMPORTANT)
  const jaCount  = t4qs.filter(q => String(q.correct).toLowerCase() === 'ja').length;
  const neinCount = t4qs.length - jaCount;
  if (t4qs.length === 7 && (jaCount < 3 || jaCount > 4)) {
    findings.push(finding('CHK-7', 'IMPORTANT', file, 'T4-balance',
      `Lesen T4: balance Ja/Nein = ${jaCount}/${neinCount}. Se esperan 3–4 Ja y 3–4 Nein.`));
  }

  return findings;
}
```

### CHK-18b / chk18b

```javascript
function chk18b(batch, file) {
  const findings = [];
  for (const hit of findKeyExplanationMismatches(batch)) {
    findings.push(finding('CHK-18b', 'IMPORTANT', file, hit.itemId, hit.message));
  }
  return findings;
}
```

### CHK-21 / chk21

```javascript
function chk21(batch, file) {
  const findings = [];
  const t4qs = (batch.questions || []).filter(q =>
    String(q.module||'').toLowerCase() === 'lesen' && Number(q.teil) === 4 &&
    (q.type === 'ja_nein' || q.type === 'richtig_falsch' || q.type === 'true_false')
  );
  if (!t4qs.length) return findings;

  // ── signText vacío o muy corto (<15 palabras) ──
  const short = t4qs.filter(q => {
    const words = String(q.signText || '').trim().split(/\s+/).filter(Boolean).length;
    return words < 15;
  });
  if (short.length) {
    findings.push(finding('CHK-21', 'IMPORTANT', file, 'lesen-4',
      `L4: ${short.length} ítem(s) con signText < 15 palabras (${short.map(q=>q.id).join(', ')}). ` +
      `Cada opinión debe ser un texto individual, no el intro del foro.`));
  }

  // ── signTexts no son todos distintos ──
  const texts = t4qs.map(q => String(q.signText || '').trim());
  const uniqueTexts = new Set(texts);
  if (uniqueTexts.size < texts.length) {
    const dups = texts.filter((t, i) => texts.indexOf(t) !== i);
    findings.push(finding('CHK-21', 'IMPORTANT', file, 'lesen-4',
      `L4: ${texts.length - uniqueTexts.size} signText(s) duplicado(s) — ` +
      `posible intro de foro copiado en cada ítem. Los 7 ítems deben tener opiniones distintas.`));
    void dups;
  }

  // ── Autores no únicos ──
  // Pronouns are capitalized in German but are NOT author names.
  const GERMAN_PRONOUNS = new Set(['Ich', 'Er', 'Sie', 'Es', 'Wir', 'Ihr', 'Du', 'Man']);
  function extractAuthor(signText) {
    const t = String(signText || '');
    const m = t.match(/^(?:Meinung von|Sagt)\s+([A-ZÄÖÜ][a-zäöüß]+)/);
    if (m) return m[1];
    const first = t.match(/^([A-ZÄÖÜ][a-zäöüß]+)/)?.[1] || '';
    return GERMAN_PRONOUNS.has(first) ? '' : first;
  }
  const authors = t4qs.map(q => extractAuthor(q.signText));
  const namedAuthors = authors.filter(Boolean);
  if (namedAuthors.length >= 2 && new Set(namedAuthors).size < namedAuthors.length) {
    const counts = {};
    for (const a of namedAuthors) counts[a] = (counts[a] || 0) + 1;
    const dups = Object.entries(counts).filter(([,n]) => n > 1).map(([a,n]) => `${a}×${n}`);
    findings.push(finding('CHK-21', 'IMPORTANT', file, 'lesen-4',
      `L4: autores repetidos en signText: ${dups.join(', ')}. Cada ítem debe ser de un autor distinto.`));
  }

  return findings;
}
```

### CHK-27 / chk27

```javascript
function chk27(batch, file) {
  const findings = [];
  const assessment = assessT4TopicAlignment(batch);
  if (assessment.skip || assessment.ok) return findings;
  const msg = formatT4TopicAlignmentFailure(assessment);
  if (msg) {
    findings.push(finding('CHK-27', 'IMPORTANT', file, 'lesen-4', msg));
  }
  return findings;
}
```

## 4. checkLesenBatchQuality T4 y T5 — scripts/lib/lesenBatchQuality.mjs

### checkTeil4

```javascript
function checkTeil4(batch, issues, warnings) {
  const qs = batch.questions || [];
  for (const q of qs) {
    const passage = passageById(batch, q.passageId);
    if (!passage) continue;
    const literal = hasLongLiteralOverlap(q.question, passage.text || '', 4);
    if (literal) {
      issues.push(`${q.id}: pregunta copia literal del foro («${literal}»)`);
    }

    // [C2] Question text must NOT contain negation — the official format uses
    // one affirmative proposition ("Ist die Person FÜR den Vorschlag?")
    if (NEGATION_IN_QUESTION.test(q.question || '')) {
      issues.push(
        `${q.id}: T4 — pregunta contiene negación ("${q.question.match(NEGATION_IN_QUESTION)?.[0]}"). ` +
        'Las preguntas T4 deben ser afirmativas: "Ist [Person] FÜR den Vorschlag?"',
      );
    }

    // [C1] Coherence check: signText stance must match `correct`
    const stance = signTextStance(q.signText || '');
    const declared = String(q.correct || q.correctAnswer || '').trim();
    if (stance && declared && stance !== declared) {
      issues.push(
        `${q.id}: T4 — clave invertida. signText indica «${stance}» pero correct="${declared}". ` +
        'Ajusta correct/correctAnswer para que coincida con la postura del signText.',
      );
    }
  }

  // Sesgo Ja/Nein — máximo 60% de una respuesta (≤4 de 7 = 57%).
  // Umbral previo (74%) permitía 68% Ja en el corpus → bajamos a 62%.
  const total = qs.length;
  if (total >= 5) {
    const jaCount = qs.filter(
      (q) => String(q.correctAnswer || q.correct || '').toLowerCase() === 'ja',
    ).length;
    const jaPct = Math.round((jaCount / total) * 100);
    const neinPct = 100 - jaPct;
    if (jaPct > 62) {
      issues.push(
        `Teil 4: sesgo grave — Ja=${jaPct}% (máx 62%). ` +
        `Cambia ${jaCount - Math.round(total * 0.57)} Ja→Nein reescribiendo el signText correspondiente.`,
      );
    } else if (neinPct > 62) {
      issues.push(
        `Teil 4: sesgo grave — Nein=${neinPct}% (máx 62%). ` +
        `Cambia ${(total - jaCount) - Math.round(total * 0.57)} Nein→Ja reescribiendo el signText correspondiente.`,
      );
    }
  }
}
```

### checkMcq (usado para T5 en checkLesenBatchQuality)

```javascript
function checkMcq(batch, teil, issues) {
  const literalMinWords = Number(teil) === 5 ? 5 : 4;
  for (const q of batch.questions || []) {
    const passage = passageById(batch, q.passageId);
    if (!passage) continue;
    const body = `${passage.title || ''} ${passage.text || ''}`;
    const correctOpt = (q.options || []).find((o) => {
      const letter = String(q.correctAnswer || q.correct || '').toLowerCase().replace(/[^a-d]/g, '');
      return String(o).toLowerCase().trim().startsWith(`${letter})`);
    });
    if (!correctOpt) continue;
    const optText = String(correctOpt).replace(/^[a-d]\)\s*/i, '');
    const literal = hasLongLiteralOverlap(optText, body, literalMinWords);
    if (literal) {
      issues.push(`${q.id}: opción correcta copia ≥${literalMinWords} palabras del pasaje («${literal}»)`);
    }
    const qShared = sharedContentTokens(q.question, optText);
    if (qShared.length >= 3) {
      issues.push(`${q.id}: pregunta y opción correcta comparten demasiadas palabras (${qShared.join(', ')})`);
    }
  }
  if (batch.passages?.[0] && hasEducationalTone(batch.passages[0].text)) {
    issues.push(`Teil ${teil}: tono demasiado educativo en el pasaje`);
  }

  if (Number(teil) === 2) {
    const distinct = checkMcqDistinctIssues(batch, 2);
    issues.push(...distinct.issues);
  }

  // Sesgo de respuesta — ninguna letra debe superar el 60% en un mismo batch
  const total = (batch.questions || []).length;
  if (total >= 5) {
    const letterCounts = {};
    for (const q of batch.questions || []) {
      const letter = String(q.correctAnswer || q.correct || '')
        .toLowerCase()
        .replace(/[^a-c]/g, '');
      if (letter) letterCounts[letter] = (letterCounts[letter] || 0) + 1;
    }
    for (const [letter, count] of Object.entries(letterCounts)) {
      const pct = Math.round((count / total) * 100);
      if (pct > 60) {
        issues.push(
          `Teil ${teil}: sesgo de respuesta — opción «${letter}» es correcta en ${pct}% de las preguntas (máx 60%)`,
        );
      }
    }
  }
}
```

### Fragmento checkLesenBatchQuality (ramas T4/T5)

```javascript
export function checkLesenBatchQuality(batch, teil) {
  const issues = [];
  const warnings = [];
  const t = Number(teil);

  if (!batch?.questions?.length) {
    return { ok: false, issues: ['Batch sin preguntas'], warnings: [], scoreEstimate: 0 };
  }

  if (t === 1) checkTeil1(batch, issues, warnings);
  else if (t === 2) {
    // T2 structural check: exactly 2 passages, exactly 6 questions (3 per passage)
    const pc = (batch.passages || []).length;
    const qc = (batch.questions || []).length;
    if (pc !== 2) issues.push(`Teil 2: debe tener exactamente 2 pasajes (tiene ${pc})`);
    if (qc !== 6) issues.push(`Teil 2: debe tener exactamente 6 preguntas (tiene ${qc})`);
    checkMcq(batch, t, issues);
  } else if (t === 5) checkMcq(batch, t, issues);
  else if (t === 3) checkTeil3(batch, issues, warnings);
  else if (t === 4) checkTeil4(batch, issues, warnings);

  const penalty = issues.length * 8 + warnings.length * 2;
  const scoreEstimate = Math.max(0, Math.min(100, 100 - penalty));
  const ok = issues.length === 0;
  return { ok, issues, warnings, scoreEstimate };
}
```

## 5. fixT4InvertedKeys y CHK-18b

### Código completo (repairTriage.mjs)

```javascript
// import { signTextStance } from './lesenBatchQuality.mjs';

const T4_INVERTED_KEY_RE = /clave invertida|signText indica/i;

function hasT4InvertedKeySignal(issues) {
  return (issues || []).some((i) => T4_INVERTED_KEY_RE.test(String(i)));
}

/** Sync correct/correctAnswer with signText stance (T4 Ja/Nein). */
function fixT4InvertedKeys(batch) {
  const questions = (batch.questions || []).map((q) => {
    const stance = signTextStance(q.signText || '');
    if (!stance) return q;
    const declared = String(q.correct || q.correctAnswer || '').trim();
    if (stance && declared && stance !== declared) {
      return { ...q, correct: stance, correctAnswer: stance };
    }
    return q;
  });
  return { ...batch, questions };
}

// Uso en classifyAndRepair (Cubo A — gate calidad):
  // ── Cubo A: T4 clave Ja/Nein invertida (determinista) ────────────────────
  if (gate === 'calidad' && hasT4InvertedKeySignal(issues)) {
    return {
      repaired: true,
      batch: fixT4InvertedKeys(batch),
      calledLlm: false,
      cube: 'A',
      fixed: ['T4-inverted-key'],
    };
  }
```

### ¿Existe reparación determinista equivalente para CHK-18b (T5)?

**No.** Búsqueda `grep` en `scripts/` por `fixT5`, `fixKeyExplanation`, `18b.*repair`, `repair.*18b`: **0 coincidencias**.

En `repairTriage.mjs`:
- CHK-18b no está en `CUBE_A_CODES`.
- Fallos CHK-18b llegan como gate `audit2` → cubo C (reintento LLM vía `resetPromptWithFix`) o `mcq_distinct` solo para CHK-28/word-copy, no CHK-18b.
- No hay función `fixT5InvertedKey` ni sync clave/explanation determinista.

## 6. Archivos .rejected/ lesen-t4 y lesen-t5

### Últimos 6 lesen-t4 (por mtime)

- `lesen-t4-gemini-005.json` — 2026-06-29T18:03:12.774Z
- `lesen-t4-gemini-003.json` — 2026-06-29T18:00:40.587Z
- `lesen-t4-auto-blenib-2026-06-29T14-32-10-225Z.json` — 2026-06-29T14:32:10.240Z
- `lesen-t4-auto-enseqn-2026-06-29T14-32-10-229Z.json` — 2026-06-29T14:32:10.240Z
- `lesen-t4-auto-i2aoc5-2026-06-29T14-32-10-231Z.json` — 2026-06-29T14:32:10.240Z
- `lesen-t4-auto-4h0o2b-2026-06-29T14-32-10-221Z.json` — 2026-06-29T14:32:10.236Z

### Últimos 6 lesen-t5 (por mtime)

- `lesen-t5-gemini-010.json` — 2026-06-29T16:57:53.729Z
- `lesen-t5-gemini-008.json` — 2026-06-29T14:10:53.877Z
- `lesen-t5-gemini-007.json` — 2026-06-29T14:07:34.715Z
- `lesen-t5-gemini-006.json` — 2026-06-29T13:52:26.023Z
- `lesen-t5-gemini-005.json` — 2026-06-29T13:49:19.397Z
- `lesen-t5-gemini-004.json` — 2026-06-29T13:46:12.952Z

### Contenido completo — 3 T4 más recientes


#### lesen-t4-gemini-005.json

Motivo rechazo: *(sin campo `_rejectedReason` en el JSON)*

```json
{
  "passages": [
    {
      "id": "gen-l4-576237bb",
      "module": "lesen",
      "teil": 4,
      "title": "Forum: Neues Stadtprojekt für mehr Grünflächen?",
      "text": "Die Stadtverwaltung plant ein neues Projekt, um mehr Grünflächen und kleine Gärten in unserer Stadt zu schaffen. Ziel ist es, die Lebensqualität für Bewohner und Familien zu verbessern. Viele Nachbarn haben bereits ihre Meinungen geäußert und Erfahrungen aus anderen Städten geteilt. Lesen Sie die Beiträge im Forum – ist die Person für den neuen Vorschlag der Stadt?",
      "lang": "de",
      "level": "B1"
    }
  ],
  "questions": [
    {
      "id": "gen-q-4-576237bb-1",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Lena für den Vorschlag?",
      "options": [
        "a) Ja",
        "b) Nein"
      ],
      "correct": "Ja",
      "correctAnswer": "Ja",
      "explanation": "Lena findet die Idee gut, obwohl sie eine bessere Pflege der Pflanzen fordert.",
      "signText": "Ich finde die Idee von mehr Grün in der Stadt sehr gut, weil es die Luft verbessert und Kinder draußen spielen können. Die Organisation muss aber sicherstellen, dass die neuen Pflanzen auch gepflegt werden. Trotzdem bin ich dafür.",
      "passageId": "gen-l4-576237bb",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    },
    {
      "id": "gen-q-4-576237bb-2",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Max für den Vorschlag?",
      "options": [
        "a) Ja",
        "b) Nein"
      ],
      "correct": "Nein",
      "correctAnswer": "Nein",
      "explanation": "Max ist gegen den Plan, da er Probleme für den Transport befürchtet.",
      "signText": "Viele freie Plätze sind wichtig für Parkplätze und Lieferwagen. Wenn wir alles zu Gärten machen, gibt es nur noch Probleme für den Transport. Ich bin gegen diesen Plan, weil er die Familie und den Alltag erschwert.",
      "passageId": "gen-l4-576237bb",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    },
    {
      "id": "gen-q-4-576237bb-3",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Sofia für den Vorschlag?",
      "options": [
        "a) Ja",
        "b) Nein"
      ],
      "correct": "Ja",
      "correctAnswer": "Ja",
      "explanation": "Sofia sieht viele Vorteile und unterstützt das Projekt voll und ganz.",
      "signText": "Grün in der Stadt ist ein großer Vorteil für alle. Es hilft gegen Lärm und Hitze und macht unsere Nachbarschaft schöner. Ich habe gute Erfahrungen mit solchen Projekten gemacht und unterstütze den Vorschlag voll und ganz.",
      "passageId": "gen-l4-576237bb",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    },
    {
      "id": "gen-q-4-576237bb-4",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Ben für den Vorschlag?",
      "options": [
        "a) Ja",
        "b) Nein"
      ],
      "correct": "Nein",
      "correctAnswer": "Nein",
      "explanation": "Ben ist skeptisch, da er andere Probleme für wichtiger hält.",
      "signText": "Ich verstehe den Wunsch nach mehr Grün, aber unsere Stadt hat andere Probleme, die wichtiger sind. Zum Beispiel brauchen wir bessere Schulen und Sportplätze für Kinder. Ich bin skeptisch, ob dieser Plan wirklich das Beste ist.",
      "passageId": "gen-l4-576237bb",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    },
    {
      "id": "gen-q-4-576237bb-5",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Clara für den Vorschlag?",
      "options": [
        "a) Ja",
        "b) Nein"
      ],
      "correct": "Ja",
      "correctAnswer": "Ja",
      "explanation": "Clara ist für den Plan, weil er zur Nachhaltigkeit beiträgt und zum Respekt vor der Natur erzieht.",
      "signText": "Ich finde es wichtig, dass wir mehr für die Nachhaltigkeit tun. Kleine Gärten sind eine gute Übung für uns alle, um die Natur zu respektieren und zu lernen. Ich bin absolut für diesen Plan und freue mich darauf.",
      "passageId": "gen-l4-576237bb",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    },
    {
      "id": "gen-q-4-576237bb-6",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist David für den Vorschlag?",
      "options": [
        "a) Ja",
        "b) Nein"
      ],
      "correct": "Nein",
      "correctAnswer": "Nein",
      "explanation": "David lehnt den Vorschlag wegen der hohen Kosten ab.",
      "signText": "Wer soll das alles bezahlen? Die Kosten für solche Projekte sind immer hoch, und am Ende zahlen wir alle mehr Steuern. Ich denke, das ist keine gute Idee für die Stadt. Deshalb lehne ich den Vorschlag ab.",
      "passageId": "gen-l4-576237bb",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    },
    {
      "id": "gen-q-4-576237bb-7",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Eva für den Vorschlag?",
      "options": [
        "a) Ja",
        "b) Nein"
      ],
      "correct": "Nein",
      "correctAnswer": "Nein",
      "explanation": "Eva findet die Idee zwar gut, kann aber wegen mangelnder Transparenz und Legitimation nicht zustimmen.",
      "signText": "Ich finde die Idee an sich gut, aber die aktuelle Werbekampagne wirkt nicht ehrlich. Es fehlt eine klare Legitimation für die Kosten. Ohne mehr Informationen kann ich nicht zustimmen. Ich bin implizit dagegen.",
      "passageId": "gen-l4-576237bb",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    }
  ]
}
```

#### lesen-t4-gemini-003.json

Motivo rechazo: *(sin campo `_rejectedReason` en el JSON)*

```json
{
  "passages": [
    {
      "id": "gen-l4-707d1b14",
      "module": "lesen",
      "teil": 4,
      "title": "Forum: Neues Jugendzentrum in der Stadt?",
      "text": "Die Stadt plant ein neues Jugendzentrum. Viele Bewohner sind überzeugt, dass so ein Ort wichtig ist, um Jugendlichen mehr Freizeitangebote zu bieten. Der Vorschlag soll helfen, dass junge Leute sich treffen und neue Erfahrungen sammeln können. Es gibt aber auch Skepsis, ob das Projekt wirklich gut implementiert werden kann.",
      "lang": "de",
      "level": "B1"
    }
  ],
  "questions": [
    {
      "id": "gen-q-4-707d1b14-1",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Petra für den Vorschlag?",
      "options": [
        "a) Ja",
        "b) Nein"
      ],
      "correct": "Ja",
      "correctAnswer": "Ja",
      "explanation": "Sie ist überzeugt, dass ein Zentrum gut ist, obwohl einige Aktivitäten fehlen.",
      "signText": "Ich bin überzeugt, dass ein neues Zentrum gut für die Jugend ist. Sie brauchen einen Ort für Treffen. Manche Aktivitäten, die jetzt in Mode sind, fehlen noch. Trotzdem finde ich das Projekt sehr wichtig.",
      "passageId": "gen-l4-707d1b14",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    },
    {
      "id": "gen-q-4-707d1b14-2",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Markus für den Vorschlag?",
      "options": [
        "a) Ja",
        "b) Nein"
      ],
      "correct": "Nein",
      "correctAnswer": "Nein",
      "explanation": "Er findet das Geld nicht gut investiert und schlägt vor, bestehende Angebote zu verbessern.",
      "signText": "Das Geld für so ein großes Projekt ist nicht gut investiert. Es gibt schon andere Angebote. Die Stadt sollte lieber bestehende Einrichtungen besser machen, statt Neues zu implementieren. Ich bin dagegen.",
      "passageId": "gen-l4-707d1b14",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    },
    {
      "id": "gen-q-4-707d1b14-3",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Laura für den Vorschlag?",
      "options": [
        "a) Ja",
        "b) Nein"
      ],
      "correct": "Ja",
      "correctAnswer": "Ja",
      "explanation": "Sie ist begeistert und sieht viele Möglichkeiten für Jugendliche und Familien.",
      "signText": "Endlich! Viele Jugendliche haben in der Stadt kaum Orte für ihre Freizeit. Ein neues Zentrum bietet mehr Möglichkeiten, auch für Hobbys, die gerade Mode sind. Das bringt Familien zusammen. Ich bin dafür.",
      "passageId": "gen-l4-707d1b14",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    },
    {
      "id": "gen-q-4-707d1b14-4",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Tim für den Vorschlag?",
      "options": [
        "a) Ja",
        "b) Nein"
      ],
      "correct": "Nein",
      "correctAnswer": "Nein",
      "explanation": "Er ist skeptisch wegen vergangener Probleme und strenger Regeln.",
      "signText": "Ich habe alte Protokolle gelesen. Ähnliche Projekte hatten früher Probleme. Die Paragraphen für Sicherheit sind oft zu streng. Ich bin skeptisch, ob das Zentrum wirklich funktioniert, wie geplant.",
      "passageId": "gen-l4-707d1b14",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    },
    {
      "id": "gen-q-4-707d1b14-5",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Julia für den Vorschlag?",
      "options": [
        "a) Ja",
        "b) Nein"
      ],
      "correct": "Ja",
      "correctAnswer": "Ja",
      "explanation": "Sie ist überzeugt, dass es ein wichtiger Schritt für die Gemeinschaft ist und viele Vorteile hat.",
      "signText": "Das Zentrum wird helfen, dass Jugendliche ihre Nachbarn kennenlernen und neue Erfahrungen sammeln. Ich bin überzeugt, es ist ein wichtiger Schritt für die Gemeinschaft. Ich bin dafür, weil es viele Vorteile hat.",
      "passageId": "gen-l4-707d1b14",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    },
    {
      "id": "gen-q-4-707d1b14-6",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Michael für den Vorschlag?",
      "options": [
        "a) Ja",
        "b) Nein"
      ],
      "correct": "Nein",
      "correctAnswer": "Nein",
      "explanation": "Er ist wegen Lärm und Verkehr dagegen, da die Lärmschutz-Paragraphen nicht ausreichen.",
      "signText": "Ich wohne direkt neben dem geplanten Ort. Das bringt viel Lärm und Verkehr, besonders am Abend. Die Paragraphen zum Lärmschutz reichen nicht. Meine Familie braucht Ruhe. Das ist ein Problem. Ich bin dagegen.",
      "passageId": "gen-l4-707d1b14",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    },
    {
      "id": "gen-q-4-707d1b14-7",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Ist Lena für den Vorschlag?",
      "options": [
        "a) Ja",
        "b) Nein"
      ],
      "correct": "Nein",
      "correctAnswer": "Nein",
      "explanation": "Sie ist der Meinung, dass Schulen wichtiger sind und das Geld anders investiert werden sollte.",
      "signText": "Ich denke, die Stadt sollte zuerst die Schulen besser ausstatten. Mehr Bildung ist wichtiger als ein neues Freizeitzentrum, auch wenn die Idee gut klingt. Ich würde das Geld anders implementieren.",
      "passageId": "gen-l4-707d1b14",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    }
  ]
}
```

#### lesen-t4-auto-blenib-2026-06-29T14-32-10-225Z.json

Motivo rechazo: `Teil 4: sesgo grave — Ja=86% (máx 74%). Invierte al menos 1 afirmaciones a Nein.` · `_scoreEstimate`: 92

```json
{
  "_rejectedReason": "Teil 4: sesgo grave — Ja=86% (máx 74%). Invierte al menos 1 afirmaciones a Nein.",
  "_scoreEstimate": 92,
  "passages": [
    {
      "id": "bp-t4-soziale-medien-jugend",
      "module": "lesen",
      "title": "Diskussion über soziale Medien für Jugendliche",
      "text": "In diesem Forum geht es um die Frage, ob soziale Medien für Jugendliche eher nützlich oder schädlich sind.",
      "passageVocab": []
    }
  ],
  "questions": [
    {
      "id": "gen-q-4-jo4n40-1",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Sagt die Person: Jugendliche verbringen zu viel Zeit am Handy.",
      "signText": "Meinung von Rosa: Mein Sohn schaut ständig auf den Bildschirm, sogar beim Essen. Diese vielen Stunden am Tag sind eindeutig zu viel. Thema: Meinung.",
      "correct": "Ja",
      "correctAnswer": "Ja",
      "explanation": "Ben bestätigt die Aussage sinngemäß.",
      "options": [],
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-4-jo4n40-2",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Sagt die Person: Soziale Medien bieten auch Chancen für die Zukunft.",
      "signText": "Meinung von Quentin: Manche Jugendliche bauen sich online schon eine kleine Reichweite auf. Das kann später beim Beruf sogar helfen. Thema: Vorteil.",
      "correct": "Ja",
      "correctAnswer": "Ja",
      "explanation": "Felix bestätigt die Aussage sinngemäß.",
      "options": [],
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-4-jo4n40-3",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Sagt die Person: Falsche Informationen verbreiten sich dort zu leicht.",
      "signText": "Meinung von Andreas: Jugendliche glauben oft, was sie online lesen. Gerüchte und falsche Nachrichten sind ein echtes Problem. Thema: Nachteil.",
      "correct": "Ja",
      "correctAnswer": "Ja",
      "explanation": "Greta bestätigt die Aussage sinngemäß.",
      "options": [],
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-4-jo4n40-4",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Sagt die Person: Eltern können die Nutzung gut begrenzen.",
      "signText": "Meinung von Felix: Mit klaren Regeln und Zeitlimits klappt es bei uns problemlos. Man muss sich als Eltern nur kümmern. Thema: Erfahrung.",
      "correct": "Nein",
      "correctAnswer": "Nein",
      "explanation": "Eva widerspricht die Aussage sinngemäß.",
      "options": [],
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-4-jo4n40-5",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Sagt die Person: Über soziale Medien halten Jugendliche Kontakt zu Freunden.",
      "signText": "Meinung von Xenia: Meine Tochter schreibt täglich mit Freunden aus anderen Städten. Ohne diese Apps hätten sie längst den Kontakt verloren. Thema: Umwelt.",
      "correct": "Ja",
      "correctAnswer": "Ja",
      "explanation": "Anna bestätigt die Aussage sinngemäß.",
      "options": [],
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-4-jo4n40-6",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Sagt die Person: Der Vergleich mit anderen macht Jugendliche unzufrieden.",
      "signText": "Meinung von David: Ständig perfekte Bilder zu sehen, drückt aufs Selbstbewusstsein. Viele Jugendliche fühlen sich dadurch schlechter. Thema: Kosten.",
      "correct": "Ja",
      "correctAnswer": "Ja",
      "explanation": "David bestätigt die Aussage sinngemäß.",
      "options": [],
      "lang": "de",
      "level": "B1"
    },
    {
      "id": "gen-q-4-jo4n40-7",
      "module": "lesen",
      "teil": 4,
      "type": "ja_nein",
      "question": "Sagt die Person: In sozialen Netzwerken lernt man auch Nützliches.",
      "signText": "Meinung von Anna: Über kurze Videos lernt mein Sohn Kochen und sogar etwas Mathe. Nicht alles dort ist sinnlos, im Gegenteil. Thema: Meinung.",
      "correct": "Ja",
      "correctAnswer": "Ja",
      "explanation": "Clara bestätigt die Aussage sinngemäß.",
      "options": [],
      "lang": "de",
      "level": "B1"
    }
  ]
}
```

### Contenido completo — 3 T5 más recientes


#### lesen-t5-gemini-010.json

Motivo rechazo: *(sin campo `_rejectedReason` en el JSON)*

```json
{
  "passages": [
    {
      "id": "gen-l5-272d4ea6",
      "module": "lesen",
      "teil": 5,
      "title": "Hausordnung des Stadtteilzentrums 'Miteinander'",
      "text": "Die Räume des Stadtteilzentrums stehen allen Bürgern zur Verfügung. Für die Nutzung der großen Säle ist eine Anmeldung mindestens 14 Tage im Voraus erforderlich. Eine Gebühr von 15 Euro pro Stunde wird für private Veranstaltungen erhoben, während Kurse und offene Treffen kostenlos sind.\nDie Öffnungszeiten sind Montag bis Freitag von 9:00 bis 21:00 Uhr, samstags von 10:00 bis 18:00 Uhr. Sonntags bleibt das Zentrum geschlossen, außer für besondere, vorher genehmigte Veranstaltungen.\nJeder Nutzer ist für die Sauberkeit des genutzten Raumes verantwortlich. Der Müll ist in die dafür vorgesehenen Behälter zu entsorgen. Beschädigungen müssen sofort der Organisation gemeldet werden.\nDer Lagerbestand an Sportgeräten und Bastelmaterialien muss nach jeder Nutzung auf Vollständigkeit geprüft werden. Fehlende Teile sind zu melden.\nFür die Übung in den Gymnastikräumen ist das Tragen von Sportschuhen Pflicht. Gruppen, die regelmäßig trainieren möchten, müssen dies alle sechs Monate neu anmelden.\nAnliegen und Verbesserungsvorschläge können jederzeit bei der Zentrumsleitung eingereicht werden. Wir werden alle Rückmeldungen evaluieren, um unser Angebot ständig zu verbessern. Es gibt spezielle Programme für Familien und Kinder. Nachbarn können sich hier treffen.\nIm Hof gibt es einen kleinen Parkplatz für Besucher mit Behinderung. Andere Besucher nutzen bitte die öffentlichen Parkplätze in der Nähe.\nEinmal im Quartal findet eine Versammlung statt, um die Erfahrungen der Bewohner zu diskutieren und die Regeln bei Bedarf anzupassen. Wir fördern auch den Austausch über globale Themen in unseren Diskussionsrunden.",
      "lang": "de",
      "level": "B1"
    }
  ],
  "questions": [
    {
      "id": "gen-q-5-272d4ea6-1",
      "module": "lesen",
      "teil": 5,
      "type": "multiple_choice",
      "question": "Was ist wichtig, wenn man einen großen Raum für ein privates Fest mieten möchte?",
      "options": [
        "a) Man muss sich mindestens zwei Wochen vorher anmelden und pro Stunde bezahlen.",
        "b) Die Nutzung ist immer kostenfrei, wenn man sich rechtzeitig meldet.",
        "c) Eine Anmeldung ist nicht nötig, aber es kostet 15 Euro pro Stunde."
      ],
      "correct": "a",
      "correctAnswer": "a",
      "explanation": "Für private Veranstaltungen ist eine Anmeldung mindestens 14 Tage (zwei Wochen) im Voraus erforderlich und eine Gebühr von 15 Euro pro Stunde wird erhoben.",
      "passageId": "gen-l5-272d4ea6",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    },
    {
      "id": "gen-q-5-272d4ea6-2",
      "module": "lesen",
      "teil": 5,
      "type": "multiple_choice",
      "question": "Wann hat das Stadtteilzentrum üblicherweise am Wochenende geöffnet?",
      "options": [
        "a) Samstags bis 18 Uhr, sonntags bleibt es immer zu.",
        "b) Am Samstag von 10 bis 18 Uhr und am Sonntag nur für spezielle Anlässe.",
        "c) An beiden Tagen von 9 bis 21 Uhr."
      ],
      "correct": "b",
      "correctAnswer": "b",
      "explanation": "Samstags hat das Zentrum von 10:00 bis 18:00 Uhr geöffnet. Sonntags ist es geschlossen, außer für besondere, vorher genehmigte Veranstaltungen.",
      "passageId": "gen-l5-272d4ea6",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    },
    {
      "id": "gen-q-5-272d4ea6-3",
      "module": "lesen",
      "teil": 5,
      "type": "multiple_choice",
      "question": "Was muss man nach der Verwendung von Materialien im Zentrum tun?",
      "options": [
        "a) Den Lagerraum aufräumen und die Sachen an ihren Platz zurücklegen.",
        "b) Den gesamten Bestand zählen und der Leitung übergeben.",
        "c) Prüfen, ob alles da ist, und eventuelle Mängel mitteilen."
      ],
      "correct": "c",
      "correctAnswer": "c",
      "explanation": "Der Lagerbestand muss nach jeder Nutzung auf Vollständigkeit geprüft werden. Fehlende Teile sind zu melden.",
      "passageId": "gen-l5-272d4ea6",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    },
    {
      "id": "gen-q-5-272d4ea6-4",
      "module": "lesen",
      "teil": 5,
      "type": "multiple_choice",
      "question": "Welche Regel gilt für Gruppen, die regelmäßig Sport im Zentrum machen?",
      "options": [
        "a) Sie müssen sich jedes halbe Jahr wieder neu registrieren.",
        "b) Sie müssen immer spezielle Sportschuhe tragen und dies jährlich neu anmelden.",
        "c) Sie dürfen die Räume nur nach einer einmaligen Registrierung nutzen."
      ],
      "correct": "a",
      "correctAnswer": "a",
      "explanation": "Gruppen, die regelmäßig trainieren möchten, müssen dies alle sechs Monate (jedes halbe Jahr) neu anmelden.",
      "passageId": "gen-l5-272d4ea6",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    }
  ]
}
```

#### lesen-t5-gemini-008.json

Motivo rechazo: *(sin campo `_rejectedReason` en el JSON)*

```json
{
  "passages": [
    {
      "id": "gen-l5-7269de78",
      "module": "lesen",
      "teil": 5,
      "title": "Regeln im Sportzentrum Fit & Gesund",
      "text": "Regeln im Sportzentrum Fit & Gesund:\n1.  **Öffnungszeiten:** Werktags 6:00 bis 22:00 Uhr. Wochenende und Feiertage 8:00 bis 20:00 Uhr. Räume pünktlich verlassen.\n2.  **Mitgliedschaft:** Neue Mitglieder melden sich **persönlich** an der Rezeption an. Ein Einführungsgespräch ist Pflicht. Monatsgebühr 45 Euro. Kündigung nur schriftlich, drei Monate Frist zum Monatsende.\n3.  **Geräte:** Sportgeräte nach Gebrauch reinigen und zurückstellen. Auf **Präzision** bei der Gewichtseinstellung achten.\n4.  **Sauna/Wellness:** Täglich 10:00 bis 21:00 Uhr. Kinder unter 14 Jahren nur mit Erwachsenen. Ohne Wellness-Option kostet der Besuch 5 Euro extra.\n5.  **Parkplätze:** Kostenlos während des Trainings. Nur markierte Flächen nutzen. Falsch geparkte Fahrzeuge werden kostenpflichtig entfernt.\n6.  **Ordnung:** Müll in Behälter. Keine Handtücher oder Flaschen liegen lassen. Das sieht sonst **hässlich** aus.\n7.  **Pflanzen:** Die **Bewässerung** der Pflanzen übernimmt das Personal. Nicht anfassen.\n8.  **Schließfächer:** Für nicht eingeschlossene Wertgegenstände haftet das Sportzentrum nicht. Schließen Sie **ihm** die Spinde nach Gebrauch gut ab.",
      "lang": "de",
      "level": "B1"
    }
  ],
  "questions": [
    {
      "id": "gen-q-5-7269de78-1",
      "module": "lesen",
      "teil": 5,
      "type": "multiple_choice",
      "question": "Wann schließt das Sportzentrum an einem Sonntagabend?",
      "options": [
        "a) Um 22:00 Uhr.",
        "b) Um 20:00 Uhr.",
        "c) Um 18:00 Uhr."
      ],
      "correct": "b",
      "correctAnswer": "b",
      "explanation": "Am Wochenende und an Feiertagen ist das Zentrum von 8:00 bis 20:00 Uhr geöffnet.",
      "passageId": "gen-l5-7269de78",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    },
    {
      "id": "gen-q-5-7269de78-2",
      "module": "lesen",
      "teil": 5,
      "type": "multiple_choice",
      "question": "Was ist richtig bezüglich der Mitgliedschaftsbedingungen?",
      "options": [
        "a) Man kann monatlich für 45 Euro kündigen.",
        "b) Die Kündigung muss drei Monate vor Monatsende schriftlich erfolgen.",
        "c) Eine Kündigung ist nur persönlich möglich."
      ],
      "correct": "b",
      "correctAnswer": "b",
      "explanation": "Die monatliche Gebühr beträgt 45 Euro. Eine Kündigung ist nur schriftlich und mit drei Monaten Frist zum Monatsende möglich.",
      "passageId": "gen-l5-7269de78",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    },
    {
      "id": "gen-q-5-7269de78-3",
      "module": "lesen",
      "teil": 5,
      "type": "multiple_choice",
      "question": "Was gilt für den Saunabereich für Familien?",
      "options": [
        "a) Kinder unter 14 Jahren zahlen 5 Euro extra für den Eintritt.",
        "b) Erwachsene können ihre Kinder unter 14 Jahren mit in den Bereich nehmen.",
        "c) Der Bereich ist für alle Mitglieder kostenlos zugänglich."
      ],
      "correct": "b",
      "correctAnswer": "b",
      "explanation": "Kinder unter 14 Jahren dürfen den Sauna-/Wellnessbereich nur mit Erwachsenen nutzen. Der extra Preis gilt, wenn die Wellness-Option nicht Teil der Mitgliedschaft ist.",
      "passageId": "gen-l5-7269de78",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    },
    {
      "id": "gen-q-5-7269de78-4",
      "module": "lesen",
      "teil": 5,
      "type": "multiple_choice",
      "question": "Was passiert, wenn man sein Auto nicht korrekt abstellt?",
      "options": [
        "a) Das Fahrzeug kann auf Kosten des Halters weggeschleppt werden.",
        "b) Man muss eine zusätzliche Gebühr für das Training zahlen.",
        "c) Das Sportzentrum ist nicht verantwortlich für den Schaden."
      ],
      "correct": "a",
      "correctAnswer": "a",
      "explanation": "Falsch geparkte Fahrzeuge werden kostenpflichtig entfernt.",
      "passageId": "gen-l5-7269de78",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    }
  ]
}
```

#### lesen-t5-gemini-007.json

Motivo rechazo: *(sin campo `_rejectedReason` en el JSON)*

```json
{
  "passages": [
    {
      "id": "gen-l5-47fa4ea8",
      "module": "lesen",
      "teil": 5,
      "title": "Regeln für den Gemeinschaftsgarten \"Grüne Oase\"",
      "text": "Regeln für den Gemeinschaftsgarten \"Grüne Oase\"\n\nDer Gemeinschaftsgarten \"Grüne Oase\" ist ein Ort für alle Bewohner, die Freude am Gärtnern haben und die Natur in der Stadt genießen möchten. Um ein harmonisches Miteinander zu gewährleisten, gelten folgende Regeln:\n\n1.  **Parzellen und Anmeldung:** Jede Familie kann eine Parzelle von maximal 15 Quadratmetern nutzen. Für die Zuteilung einer Parzelle ist eine Anmeldung bei der Gartenorganisation erforderlich. Es gibt eine Warteliste, und neue Gärtner erhalten ihren Platz in der Reihenfolge der Anmeldung. Die jährliche Gebühr beträgt 30 Euro und muss bis zum 1. März bezahlt werden.\n2.  **Pflege und Sauberkeit:** Alle Gärtner sind für die Pflege ihrer eigenen Parzelle verantwortlich. Dazu gehört auch das regelmäßige Entfernen von Unkraut. Wege und Gemeinschaftsflächen müssen von allen sauber gehalten werden. Müll gehört in die dafür vorgesehenen Behälter.\n3.  **Ruhezeiten:** Laute Arbeiten mit Maschinen sind nur werktags von 9:00 bis 12:00 Uhr und von 14:00 bis 18:00 Uhr erlaubt. Sonntags und an Feiertagen ist Ruhe einzuhalten.\n4.  **Bewässerung:** Die Bewässerung der Pflanzen ist nur mit Regenwasser aus den Sammelbehältern oder mit Wasser aus den Gemeinschaftshähnen gestattet. Bitte achten Sie auf sparsamen Umgang mit dem Wasser. Das Wühlen in fremden Beeten ohne Erlaubnis ist nicht gestattet.\n5.  **Pflanzenauswahl:** Es dürfen nur Pflanzen angebaut werden, die keine anderen Gärtner stören oder Schatten werfen. Hohe Bäume oder Sträucher sind nur nach Absprache mit der Organisation erlaubt.\n6.  **Gemeinschaftliche Ideen:** Wir freuen uns über neue Ideen für die Gestaltung der Gemeinschaftsflächen oder für gemeinsame Projekte. Vorschläge können jederzeit bei der Gartenorganisation eingereicht werden.\n7.  **Zielgruppe:** Unser Garten richtet sich hauptsächlich an Familien mit Kindern sowie an Senioren, die aktiv sein möchten. Kurse für Kinder finden jeden Samstag um 10 Uhr statt.",
      "lang": "de",
      "level": "B1"
    }
  ],
  "questions": [
    {
      "id": "gen-q-5-47fa4ea8-1",
      "module": "lesen",
      "teil": 5,
      "type": "multiple_choice",
      "question": "Wie hoch ist der jährliche Beitrag und wann muss er gezahlt werden?",
      "options": [
        "a) Dreißig Euro, bis zum ersten März.",
        "b) Fünfzehn Euro, bis zum ersten April.",
        "c) Dreißig Euro, monatlich."
      ],
      "correct": "a",
      "correctAnswer": "a",
      "explanation": "Die jährliche Gebühr beträgt 30 Euro und muss bis zum 1. März bezahlt werden.",
      "passageId": "gen-l5-47fa4ea8",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    },
    {
      "id": "gen-q-5-47fa4ea8-2",
      "module": "lesen",
      "teil": 5,
      "type": "multiple_choice",
      "question": "Wann ist es erlaubt, mit lauten Geräten im Garten zu arbeiten?",
      "options": [
        "a) An Wochentagen, außer am Wochenende und an Feiertagen, zu bestimmten Zeiten.",
        "b) Täglich von neun bis achtzehn Uhr, außer sonntags.",
        "c) Nur am Wochenende, zwischen neun und zwölf Uhr."
      ],
      "correct": "a",
      "correctAnswer": "a",
      "explanation": "Laute Arbeiten mit Maschinen sind nur werktags von 9:00 bis 12:00 Uhr und von 14:00 bis 18:00 Uhr erlaubt. Sonntags und an Feiertagen ist Ruhe einzuhalten.",
      "passageId": "gen-l5-47fa4ea8",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    },
    {
      "id": "gen-q-5-47fa4ea8-3",
      "module": "lesen",
      "teil": 5,
      "type": "multiple_choice",
      "question": "Was muss man bezüglich der Pflanzenpflege und des Arbeitens in fremden Parzellen wissen?",
      "options": [
        "a) Nur gesammeltes Wasser oder Hahnwasser zum Gießen verwenden; fremde Pflanzbereiche nicht bearbeiten.",
        "b) Beliebiges Wasser zum Gießen nutzen; bei Nachbarn ohne Fragen mithelfen.",
        "c) Wenig Wasser nutzen und nur im eigenen Bereich umgraben."
      ],
      "correct": "a",
      "correctAnswer": "a",
      "explanation": "Die Bewässerung der Pflanzen ist nur mit Regenwasser aus den Sammelbehältern oder mit Wasser aus den Gemeinschaftshähnen gestattet. Das Wühlen in fremden Beeten ohne Erlaubnis ist nicht gestattet.",
      "passageId": "gen-l5-47fa4ea8",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    },
    {
      "id": "gen-q-5-47fa4ea8-4",
      "module": "lesen",
      "teil": 5,
      "type": "multiple_choice",
      "question": "Wer bekommt einen Gartenplatz und für wen ist der Garten besonders gedacht?",
      "options": [
        "a) Nach der Anmeldung auf einer Liste, vor allem für Familien und ältere Menschen.",
        "b) Jeder sofort, der eine Familie hat und aktiv ist.",
        "c) Nur Senioren und Kinder, nach einer kurzen Wartezeit."
      ],
      "correct": "a",
      "correctAnswer": "a",
      "explanation": "Es gibt eine Warteliste, und neue Gärtner erhalten ihren Platz in der Reihenfolge der Anmeldung. Unser Garten richtet sich hauptsächlich an Familien mit Kindern sowie an Senioren, die aktiv sein möchten.",
      "passageId": "gen-l5-47fa4ea8",
      "lang": "de",
      "level": "B1",
      "language": "de",
      "examType": "goethe",
      "difficulty": 4,
      "skills": [
        "reading"
      ],
      "topicTags": [
        "daily_life"
      ]
    }
  ]
}
```

## 7. Parámetros de sesión T4/T5 en el generador

Valores cuando ejecutas `node scripts/generate-lesen-part-gemini.mjs --teil 4` o `--teil 5`:

| Parámetro | Valor T4/T5 | Dónde se define |
|-----------|-------------|-----------------|
| **fix-retries** | **2** (default si teil incluye 4 o 5) | `runLesenGenerator` |
| **api-retries** | **1** (default) | `parseArgs`: `apiRetries: 1` |
| **max-api-calls** | **200** (default sesión CLI) | `parseArgs`: `maxApiCalls: 200` |
| **pause-ms** | **≥6000** (`MIN_PAUSE_MS`) | `parseArgs` + `MIN_PAUSE_MS = 6000` |
| **CHK-29 retry** | No consume fix-retry (`fix -= 1`) | `generateLlmPart` |
| **keepFailed** | **false** — no guarda en `.rejected/` salvo `--keep-failed` | `parseArgs` |
| **Factory in-memory** | `fixRetries: 2`, `apiRetries: 1`, `maxApiCalls: 50` | `createLesenFactorySession` |

Intentos máximos por parte (CLI): `(fixRetries + 1)` = **3** con fix-retries=2.
Bucle API por fix-retry: **1** llamada (`apiRetries=1`).
Cuota sesión CLI: **200** llamadas Gemini/día.
Pausa mínima entre llamadas: **6000 ms**.

No hay límites adicionales solo para T4/T5 más allá de fix-retries=2 y rotación CHK-29.
