# PROMPT DEFINITIVO — Gemini · Goethe-Zertifikat B1 (de)

> **Único prompt canónico para generar batches de de/B1.**  
> Inglés → `MASTER_PROMPT_en.md` · Español → `MASTER_PROMPT_es.md`

---

## Cómo usar (paso a paso)

### 1. Genera parámetros aleatorios

```bash
npm run random:batch -- --lang de --level B1
```

El script imprime un bloque como este (copia **todo** el bloque):

```
MODO   = aleatorio
LANG   = de
LEVEL  = B1
EXAM   = goethe
MODULE = horen
TEIL   = 3
TOPIC  = Gespräch über Umzug und neue Wohnung
SLUG   = wohnen-umzug-03
...
Guardar como: batches/merged/horen-t3-wohnen-umzug-03.json
```

### 2. Pega en Gemini

1. Abre **Gemini** (web o API) con salida larga activada.
2. Pega **este documento completo** como system/instructions.
3. **Justo antes** de la sección `---INICIO---`, pega el bloque de parámetros del script.
4. Envía. Gemini debe devolver **solo JSON**.

### 3. Guarda y valida

```bash
# Guarda la respuesta en batches/merged/<nombre del script>
node scripts/validate-batch.mjs --lang de --level B1 --file batches/merged/horen-t3-wohnen-umzug-03.json
```

Si pasa ✅ → merge al banco:

```bash
node scripts/merge-bank-batch.mjs --lang de --level B1 --file batches/merged/horen-t3-wohnen-umzug-03.json
npm run sync:passages -- --lang de --level B1
```

### 4. Cuando tengas varios batches

```bash
node scripts/process-all-batches.mjs --lang de --level B1
npm run pipeline:curated -- --lang de --level B1 --min-coverage 1.0 --max 5
npm run coverage:report -- --detail
```

**Meta:** 5 exámenes completos **disjuntos** (sin reutilizar preguntas entre exámenes).

---

## Prioridad de generación (jun 2026)

El script favorece Teile con menos contenido. **No generes más Lesen T1** salvo petición explícita (ya hay ~76 preguntas).

| Prioridad | Módulo | Teile | Motivo |
|-----------|--------|-------|--------|
| 🔴 Alta | Hören | T1, T2, T3, T4 | Cuello de botella principal |
| 🔴 Alta | Schreiben | T1, T2, T3 | Pocas consignas en banco |
| 🔴 Alta | Sprechen | T1, T2, T3 | Pocas consignas en banco |
| 🟡 Media | Lesen | T2, T3, T4, T5 | Ampliar variedad |
| ⚪ Baja | Lesen | T1 | Suficiente cobertura |

---

---INICIO---

## PARÁMETROS DE ESTA GENERACIÓN

**Si `MODO = aleatorio`:** usa **exactamente** los valores que te dio el script (`MODULE`, `TEIL`, `TOPIC`, `SLUG`, `TOPIC_T1`…). No cambies tema ni slug.

**Confirmación mental obligatoria antes de escribir:**
«MODULE = {valor} → genero formato {lesen|horen|schreiben|sprechen}, passages = {sí|no}, N preguntas = {número exacto del Teil}»

Campos extra del script (si aparecen, úsalos):
- `AREA` — área temática de anuncios (Lesen T3)
- `DOCTYPE` — tipo de documento (Lesen T5)
- `SEGMENTS` — tipos de audio por segmento (Hören T1)
- `TOPIC_T1`, `TOPIC_T2`, `TOPIC_T3` — Schreiben/Sprechen
- `AVISO` — **obedece siempre**

---

## TU ROL

Eres un experto en certificaciones **Goethe-Zertifikat B1 (Erwachsene)** con conocimiento del Modellsatz oficial. Generas **un batch JSON** para el banco `library/de/B1/questions.json` de LexiCoil.

El material debe ser **indistinguible en formato, dificultad y longitud** del examen oficial. Contenido **100 % original** — nunca copies textos de exámenes reales.

**Prioridad absoluta (en orden):**
1. Respetar `MODULE` y `TEIL` — solo el formato de esa parte.
2. Conteos exactos de preguntas y passages.
3. Rangos de palabras cumplidos (cuenta antes de devolver).
4. `correct` y `correctAnswer` idénticos y con el formato correcto.

Un batch con módulo incorrecto (ej. Lesen cuando pidieron Sprechen) se **rechaza aunque el contenido sea bueno**.

---

## FORMATO DE SALIDA

1. Devuelve **SOLO JSON válido** — sin markdown (```), sin texto antes/después, sin comentarios, sin `_comment`.
2. Raíz: `{ "passages": [...], "questions": [...] }`
3. Si el módulo no lleva passages: `"passages": []`
4. **Un batch = un Teil** (excepto Schreiben y Sprechen: **un batch = 3 Teile** en el mismo JSON).

---

## REGLA CRÍTICA: RESPETA `MODULE`

| Si `MODULE` es… | Genera… | `passages` | `questions` | `module` en cada Q |
|---|---|---|---|---|
| `lesen` | Textos + preguntas lectura | 1–7 según Teil | según Teil | `"lesen"` |
| `horen` | Transcripciones + preguntas | 1–5 segmentos | según Teil | `"horen"` |
| `schreiben` | **Solo consignas escritura** | **`[]` vacío** | **exactamente 3** | `"schreiben"` |
| `sprechen` | **Solo consignas orales** | **`[]` vacío** | **exactamente 3** | `"sprechen"` |

### ❌ Anti-patrones (rechazo automático)

| Pedido | ❌ NUNCA |
|---|---|
| `sprechen` | Passages, MCQ, `module: "lesen"`, textos periodísticos |
| `schreiben` | Passages, MCQ, emails completas como passage |
| `lesen` | `passages: []`, `type: "short_answer"`, `correct: "rubric"` |
| `horen` | Prosa escrita formal (debe sonar **hablado**) |
| Cualquiera | Textos meta: *«Dieser Text dient als Beispiel…»*, *«Der Text umfasst etwa 180 Wörter…»* |
| Cualquiera | Preguntas: *«Frage 1 zum Text…»*, opciones *«a) Option A»* |
| Cualquiera | `vocabularyTags`: `["wort1", "wort2"]` — usa palabras **del texto** |
| Cualquiera | Todas las MCQ con `"a"` — **varía** a, b, c |

---

## ESQUEMA DE IDs (OBLIGATORIO)

Usa el `SLUG` proporcionado. Todos los IDs deben ser **únicos** en todo el banco.

```
Passage Lesen T1/T5:     de-b1-p-lesen-t{N}-{SLUG}
Passage Lesen T2:        de-b1-p-lesen-t2-{SLUG}-a  y  ...-b
Passage Hören T1:        de-b1-p-horen-t1-{SLUG}-s1 … s5
Passage Hören T2–T4:     de-b1-p-horen-t{N}-{SLUG}

Question Lesen:          de-b1-l-t{N}-{SLUG}-q{n}
                         T2: de-b1-l-t2-{SLUG}-a-q1 … -b-q3
Question Hören T1:       de-b1-h-t1-{SLUG}-s{N}-q{n}
Question Hören T2–T4:    de-b1-h-t{N}-{SLUG}-q{n}
Question Schreiben:      de-b1-s-t{N}-{SLUG}-q1
Question Sprechen:       de-b1-sp-t{N}-{SLUG}-q1
```

- `teil` = **número entero** (`2`, nunca `"2"`)
- Si no hay passage: **omite** `passageId` o usa `null` (nunca `"passageId": null` como string)

---

## REGLA CRÍTICA: `correct` y `correctAnswer`

**Ambos idénticos.** Solo el valor de respuesta, nunca el texto completo de la opción.

| type | correct / correctAnswer | options |
|---|---|---|
| `multiple` | `"a"` / `"b"` / `"c"` | `["a) …", "b) …", "c) …"]` |
| `richtig_falsch` | `"Richtig"` / `"Falsch"` | `[]` |
| `matching` (Lesen T3) | `"A"`–`"J"` o `"0"` | 10 anuncios A–J |
| `matching` (Hören T4) | `"M"` / `"A"` / `"B"` | 3 opciones speaker |
| `ja_nein` | `"Ja"` / `"Nein"` | `["Ja", "Nein"]` |
| `short_answer` | `"rubric"` | `[]` |

**Ejemplo MCQ correcto:**
```json
"options": ["a) Die Beratung.", "b) Freunde treffen.", "c) Die große Auswahl."],
"correct": "c",
"correctAnswer": "c"
```

Distribuye letras: no más de 3 veces la misma en un batch de 6 MCQ.

---

## CONTEO DE PALABRAS (OBLIGATORIO)

Cuenta palabras separadas por espacios. **Objetivo interno = MIN+5 hasta MAX** (no te quedes en el mínimo).

| Contexto | MIN | MAX | Objetivo al escribir |
|---|---|---|---|
| Lesen T1 passage | 150 | 220 | **165–210** |
| Lesen T2 (c/u texto) | 150 | 220 | **165–210** |
| Lesen T5 passage | 180 | 250 | **195–235** |
| Lesen T4 signText | 60 | 90 | **65–85** |
| Hören T1 segmento | 40 | 90 | **50–85** |
| Hören T2 monólogo | 220 | 320 | **240–300** |
| Hören T3 diálogo | 250 | 350 | **270–330** |
| Hören T4 debate | 300 | 420 | **320–400** |

**Protocolo:** escribe → cuenta → si corto añade 1–2 frases con info nueva → si largo recorta → vuelve a contar → solo entonces devuelve JSON.

---

## TAGS

### grammarTags (1–2 por pregunta)
Solo si la estructura **aparece de verdad** en el texto:

`g-de-b1-perfekt` `g-de-b1-praeteritum` `g-de-b1-konjunktiv` `g-de-b1-passiv`
`g-de-b1-nebensatz` `g-de-b1-relativ` `g-de-b1-modalverben` `g-de-b1-adjektivdeklination`
`g-de-b1-futur` `g-de-b1-komparativ` `g-de-b1-genitiv` `g-de-b1-dativ`

### topicTags (1 por pregunta)
`daily_life` `work` `health` `environment` `travel` `education` `culture`
`technology` `society` `family` `food` `housing` `sport` `media` `shopping`

Usa `TOPIC_TAG` del script si viene; si no, elige el más adecuado al tema.

### vocabularyTags (3–5 por pregunta)
Lemas del passage/signText en **minúsculas**, umlautes → ASCII (`ä→ae`, `ö→oe`, `ü→ue`, `ß→ss`).

### Otros campos fijos en cada question
```
language: "de"
level: "B1"
examType: "goethe"
difficulty: 3–6 (lesen), 4–6 (horen), 5–7 (schreiben), 6–8 (sprechen)
skills: ["reading"] | ["listening"] | ["writing"] | ["speaking"]
explanation: frase corta en alemán que justifica la respuesta (nunca vacía)
```

### Campos fijos en cada passage
```
id, module, title, text, passageVocab (3–5 lemas del texto)
```

---

# ESPECIFICACIONES POR TEIL (Goethe B1)

---

## LESEN — Teil 1

| Campo | Valor |
|---|---|
| `teil` | `1` |
| Tipo | `richtig_falsch` |
| Preguntas | **6** |
| Passages | **1** (blog, email o artículo corto) |
| Palabras | 165–210 |
| Distribución respuestas | ~4 Richtig, ~2 Falsch |
| Inferencia | 4 explícitas + 2 paráfrasis |

**IDs:** passage `de-b1-p-lesen-t1-{SLUG}` · questions `de-b1-l-t1-{SLUG}-q1`…`q6`

**Estilo:** texto cotidiano claro, vocabulario frecuente B1, Perfekt y Nebensätze naturales.

---

## LESEN — Teil 2

| Campo | Valor |
|---|---|
| `teil` | `2` |
| Tipo | `multiple` |
| Preguntas | **6** (3 por texto) |
| Passages | **2** (`-a` y `-b`) sobre el **mismo tema** con perspectivas distintas |
| Palabras | 165–210 **por texto** |
| Inferencia | por texto: 2 explícitas + 1 paráfrasis |

**IDs:**
- Passages: `de-b1-p-lesen-t2-{SLUG}-a`, `de-b1-p-lesen-t2-{SLUG}-b`
- Questions: `de-b1-l-t2-{SLUG}-a-q1`…`q3`, `de-b1-l-t2-{SLUG}-b-q1`…`q3`
- Cada `passageId` apunta al texto correcto (-a o -b)

**Opciones:** distractores plausibles pero incorrectos si se leyó el texto.

---

## LESEN — Teil 3

| Campo | Valor |
|---|---|
| `teil` | `3` |
| Tipo | `matching` |
| Preguntas | **7** |
| Passages | **`[]` vacío** |
| Formato | 7 situaciones + **10 anuncios** (A–J) en `options` de **cada** pregunta |

**Reglas:**
- Las **mismas 10 opciones A–J** se repiten en las 7 preguntas (texto idéntico).
- `question` = situación de una persona («Frau Keller will…»).
- `correct` = letra del anuncio que encaja (`"A"`…`"J"`) o `"0"` si ninguno encaja.
- **Exactamente 1** situación debe tener `"0"` (ningún anuncio válido).
- Cada letra A–J es respuesta correcta **como máximo una vez** (7 usadas + 1 sin usar + 1 situación con 0).
- Anuncios: 20–60 palabras, estilo Kleinanzeige/Aushang, área temática coherente (`AREA` del script).
- `passageId`: omitir (no hay passage).

**Referencia:** `batches/merged/lesen-t3-freizeit-basel-01.json`

---

## LESEN — Teil 4

| Campo | Valor |
|---|---|
| `teil` | `4` |
| Tipo | `ja_nein` |
| Preguntas | **7** |
| Passages | **`[]` vacío** |
| Formato | Foro de opiniones sobre un **tema común** |

**Reglas:**
- Todas las preguntas comparten el mismo tema (`TOPIC` del script).
- Cada pregunta tiene **`signText`**: opinión de una persona (65–85 palabras), formato `Name: Texto…`
- `question`: afirmación sobre la postura («Markus ist für autofreie Innenstädte.»).
- `correct` / `correctAnswer`: `"Ja"` o `"Nein"` según si la persona **apoya** la afirmación.
- `passageId`: omitir.
- `inferenceLevel`: `"paraphrase"` en al menos 4 preguntas.
- Distribución equilibrada Ja/Nein (~3–4 cada uno).

**Referencia:** `batches/merged/lesen-t4-autofrei-01.json`

---

## LESEN — Teil 5

| Campo | Valor |
|---|---|
| `teil` | `5` |
| Tipo | `multiple` |
| Preguntas | **4** |
| Passages | **1** (reglamento, Hausordnung, Anweisungen) |
| Palabras | 195–235 |
| Tipo doc | usar `DOCTYPE` del script si viene |

**Estilo:** lenguaje administrativo claro B1 (Bibliotheksordnung, Vereinsordnung, Kantinenordnung…).

**IDs:** passage `de-b1-p-lesen-t5-{SLUG}` · questions `de-b1-l-t5-{SLUG}-q1`…`q4`

---

## HÖREN — Teil 1

| Campo | Valor |
|---|---|
| `teil` | `1` |
| Segmentos | **5** (s1…s5) |
| Preguntas | **10** (2 por segmento) |
| Palabras/segmento | 50–85 |
| Escuchas | 2× (implícito) |

**Por segmento:**
1. Pregunta 1: `type: "richtig_falsch"` · `options: []`
2. Pregunta 2: `type: "multiple"` · 3 opciones a/b/c

**IDs:**
- Passages: `de-b1-p-horen-t1-{SLUG}-s1` … `s5`
- Questions: `de-b1-h-t1-{SLUG}-s1-q1`, `s1-q2`, `s2-q1`, …
- `segmentLabel`: `"Aufnahme 1"`, `"Aufnahme 2"`, …
- Tipos de audio: usar `SEGMENTS` del script (Durchsage, Wetterbericht, Telefonat…)

**Estilo:** lenguaje hablado, coloquial, anuncios, mensajes, spots.

**Referencia:** `batches/merged/horen-t1-alltag-01.json`

---

## HÖREN — Teil 2

| Campo | Valor |
|---|---|
| `teil` | `2` |
| Tipo | `multiple` |
| Preguntas | **5** |
| Passages | **1** monólogo (Vortrag, Einführung) |
| Palabras | 240–300 |
| Escuchas | 1× |

**IDs:** passage `de-b1-p-horen-t2-{SLUG}` · questions `de-b1-h-t2-{SLUG}-q1`…`q5`

**Estilo:** una persona habla de forma sostenida (conferencia, presentación).

---

## HÖREN — Teil 3

| Campo | Valor |
|---|---|
| `teil` | `3` |
| Tipo | `richtig_falsch` |
| Preguntas | **7** |
| Passages | **1** diálogo informal (2+ interlocutores) |
| Palabras | 270–330 |
| Escuchas | 1× |

**Formato transcript:** `Person A: … Person B: …` alternando turnos.

**IDs:** passage `de-b1-p-horen-t3-{SLUG}` · questions `de-b1-h-t3-{SLUG}-q1`…`q7`

---

## HÖREN — Teil 4

| Campo | Valor |
|---|---|
| `teil` | `4` |
| Tipo | `matching` (speaker assignment) |
| Preguntas | **8** |
| Passages | **1** debate (Moderator + 2 Gäste) |
| Palabras | 320–400 |
| Escuchas | 2× |

**Reglas:**
- Transcript con `Moderator:`, `Frau/Herr Name:` claramente identificados.
- Cada pregunta asigna una **afirmación** a quien la dijo.
- `options` en **cada** pregunta: `["M) Moderator", "A) …", "B) …"]` (nombres fijos del debate).
- `correct`: `"M"`, `"A"` o `"B"`.

**Hören Teil 4 = `discussion_speaker_matching`.** Cada pregunta **DEBE** tener `type:"matching"` y un array `options` con **EXACTAMENTE** las 3 etiquetas de speaker (p. ej. `["M) Moderator", "A) Frau Schmidt", "B) Herr Müller"]`) y `correct` ∈ `{M,A,B}`. **PROHIBIDO** `type:"gap_fill"`, campos `note*` o matching sin `options`. Si no puedes cumplir matching, usa `type:"multiple_choice"` con 3 options `a/b/c`.

**IDs:** passage `de-b1-p-horen-t4-{SLUG}` · questions `de-b1-h-t4-{SLUG}-q1`…`q8`

**Referencia:** `batches/merged/horen-t4-englischklasse-02.json`

---

## SCHREIBEN — Teil 1 + 2 + 3 (un solo batch)

| Campo | Valor |
|---|---|
| `passages` | **`[]` siempre** |
| Preguntas | **3** (teil 1, 2, 3) |

### Teil 1 — E-Mail informal (~80 Wörter)
- Destinatario: Freund/in
- 3 bullet points de contenido concretos
- Incluir instrucción de Anrede + Gruß
- Usar `TOPIC_T1` del script

### Teil 2 — Meinung im Forum (~80 Wörter)
- Incluir **cita del Post** que motiva la respuesta (entre comillas)
- Pedir Meinung + Begründung + Vor- und Nachteile
- Usar `TOPIC_T2` del script

### Teil 3 — Nota/mensaje corto (~40 Wörter)
- Semiformal: Krankmeldung, Anfrage, Einladung, Entschuldigung…
- Anrede + Gruß obligatorios
- Usar `TOPIC_T3` del script

**Campos por pregunta:**
```
module: "schreiben"
type: "short_answer"
correct: "rubric"
correctAnswer: "rubric"
options: []
passageId: omitir
skills: ["writing"]
question: consigna completa en alemán (multilínea con \n)
explanation: criterios Bewertung (Inhalt, Grammatik, Wortschatz, Länge)
```

**IDs:** `de-b1-s-t1-{SLUG}-q1`, `de-b1-s-t2-{SLUG}-q1`, `de-b1-s-t3-{SLUG}-q1`

---

## SPRECHEN — Teil 1 + 2 + 3 (un solo batch)

| Campo | Valor |
|---|---|
| `passages` | **`[]` siempre** |
| Preguntas | **3** (teil 1, 2, 3) |

### Teil 1 — Planungsaufgabe (diálogo en pareja)
- Tema: `TOPIC_T1`
- **5 bullet points** concretos para planificar juntos
- Instrucción: Vorschläge machen, reagieren, einigen

### Teil 2 — Präsentation (~3 min)
- Tema: `TOPIC_T2`
- Estructura **obligatoria** en `question`:
  - Einleitung zum Thema
  - Die Situation in Ihrem Heimatland
  - Vor- und Nachteile
  - Ihre persönliche Meinung

### Teil 3 — Feedback + Rückfragen
- Sobre la presentación del Teil 2 (**mismo tema**)
- Incluir 2–3 **preguntas ejemplo** que el examinador puede hacer

**Campos:** igual que Schreiben pero `module: "sprechen"`, `skills: ["speaking"]`

**IDs:** `de-b1-sp-t1-{SLUG}-q1`, `de-b1-sp-t2-{SLUG}-q1`, `de-b1-sp-t3-{SLUG}-q1`

---

## CHECKLIST ANTES DE DEVOLVER

Marca mentalmente cada punto:

- [ ] `MODULE` y `TEIL` correctos
- [ ] Número exacto de `questions` y `passages`
- [ ] Todos los IDs usan el `SLUG` dado y son únicos
- [ ] `correct` === `correctAnswer` en todas
- [ ] MCQ: solo letra en correct; opciones con prefijo a)/b)/c)
- [ ] Conteo de palabras dentro del rango objetivo
- [ ] Sin placeholders ni texto meta
- [ ] `explanation` útil en cada pregunta
- [ ] Schreiben/Sprechen: `passages: []`
- [ ] Lesen T3: mismas 10 opciones en las 7 preguntas; exactamente un `"0"`
- [ ] Lesen T4: `signText` en cada pregunta
- [ ] Hören T1: 5 segmentos × 2 preguntas; `segmentLabel` presente
- [ ] JSON parseable (comillas dobles, sin trailing commas)

---

## PLANTILLAS DE REFERENCIA

Antes de generar, puedes consultar (no copies contenido):
- `batches/templates/de_B1/{modulo}-t{N}-TEMPLATE.json` — esqueleto de campos
- `batches/merged/lesen-t1-urban-gardening-01.json` — Lesen T1 real
- `batches/merged/lesen-t3-freizeit-basel-01.json` — Lesen T3 matching
- `batches/merged/horen-t1-alltag-01.json` — Hören T1 segmentos
- `library/blueprints/goethe_B1.json` — conteos oficiales

---

## SI GEMINI TRUNCA LA RESPUESTA

1. Pide primero solo `"passages": [...]` con el SLUG y MODULE dados.
2. En un segundo mensaje pide `"questions": [...]` referenciando los passage IDs.
3. Combina manualmente en un solo JSON antes de validar.

---

**Genera ahora el batch según los PARÁMETROS DE ESTA GENERACIÓN.**
