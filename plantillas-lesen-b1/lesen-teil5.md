# Plantilla de generación — Lesen B1 · Teil 5

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
