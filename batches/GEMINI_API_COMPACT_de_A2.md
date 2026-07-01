# Gemini/Claude API — Goethe A2 (de) · prompt compacto

> Usado por `generate-batch-gemini.mjs` cuando LEVEL=A2.

---INICIO---

## PARÁMETROS DE ESTA GENERACIÓN

Usa **exactamente** MODULE, TEIL, TOPIC, SLUG, ID_PREFIX del bloque insertado arriba. No cambies tema ni slug.

---

## ROL

Generas **un batch JSON** para **Goethe-Zertifikat A2** (Erwachsene). Material original, formato oficial Modellsatz A2, nivel A2 (más simple que B1).

**Salida:** SOLO JSON `{ "passages": [...], "questions": [...] }` — sin markdown, sin comentarios.

---

## REGLAS GLOBALES

| MODULE | passages | questions | module en Q |
|--------|----------|-----------|-------------|
| lesen | según Teil | según Teil | `"lesen"` |
| horen | 1–5 segmentos | según Teil | `"horen"` |
| schreiben | **`[]`** | **2** (T1+T2) | `"schreiben"` |
| sprechen | **`[]`** | **3** (T1+T2+T3) | `"sprechen"` |

**IDs:** usa ID_PREFIX y SLUG dados (ej. `de-a2`).
- Lesen T1: `de-a2-p-lesen-t1-{SLUG}`, `de-a2-l-t1-{SLUG}-q1`…`q5`
- Lesen T2: `de-a2-p-lesen-t2-{SLUG}`, `de-a2-l-t2-{SLUG}-q1`…`q5`
- Lesen T3: `de-a2-p-lesen-t3-{SLUG}`, `de-a2-l-t3-{SLUG}-q1`…`q5`
- Lesen T4: 6 passages `de-a2-p-lesen-t4-{SLUG}-a`…`-f` (Anzeigen), `de-a2-l-t4-{SLUG}-q1`…`q5` matching
- Hören T1: 5 passages `-s1`…`-s5`, 5 MCQ con `segmentLabel`
- Hören T2: 1 passage diálogo, 5 matching (opciones a–i como texto descriptivo de imagen)
- Hören T3: 5 passages `-s1`…`-s5`, 5 MCQ con `segmentLabel`
- Hören T4: 1 passage entrevista, 5 ja_nein
- Schreiben: `de-a2-s-t1-{SLUG}-q1`, `de-a2-s-t2-{SLUG}-q1`
- Sprechen: `de-a2-sp-t1-{SLUG}-q1`, `de-a2-sp-t2-{SLUG}-q1`, `de-a2-sp-t3-{SLUG}-q1`

**correct === correctAnswer** siempre.
- MCQ: solo `"a"`/`"b"`/`"c"` · **`type: "multiple_choice"`** (nunca `"MCQ"`/`"mcq"`)
- ja_nein: `"Ja"`/`"Nein"` · `options: []`
- matching Lesen T4 / Hören T2: letra `"a"`–`"f"` o `"i"`; **exactamente 1 pregunta con `"X"`** (sin anuncio/bild) en Lesen T4
- schreiben/sprechen: `"rubric"`

**Campos obligatorios por question:**
`id, module, teil (entero), type, question, correct, correctAnswer, explanation, options, grammarTags, topicTags (1 solo), vocabularyTags, difficulty (entero 2-4, NUNCA "A2"), skills (array), language:"de", level:"A2", examType:"goethe"`
+ `passageId` si aplica · `segmentLabel` en Hören T1/T3

**Passage:** `id, module, teil, title, text, passageVocab` (3–5 lemas)

**Palabras (objetivo):**
- Lesen T1: 120–200 · T2: 80–150 · T3 (E-Mail): 100–180 · T4 Anzeige: 20–60 c/u
- Hören T1/seg: 20–70 · T2 diálogo: 80–150 · T3/seg: 15–50 · T4 entrevista: 150–250

**grammarTags A2:** `g-de-a2-praesens` `g-de-a2-perfekt` `g-de-a2-modal` `g-de-a2-trennbar` `g-de-a2-dat-akk` `g-de-a2-nebensatz` `g-de-a2-komparativ`

**topicTags:** daily_life work health travel education culture society family food housing sport media shopping

---

## POR TEIL (solo genera el TEIL indicado)

### LESEN T1 — 1 texto periodístico + 5 MCQ (a/b/c)

### LESEN T2 — 1 Informationstafel (Stockwerk/Plan) + 5 MCQ

### LESEN T3 — 1 E-Mail + 5 MCQ

### LESEN T4 — 6 Anzeigen (passages a–f) + 5 matching; 4 con letra a–f, **1 con `"X"`**; mismas 7 opciones en cada Q: `["a","b","c","d","e","f","X"]`; **sin passageId en questions**

### HÖREN T1 — 5 segmentos cortos, 1 MCQ/segmento, `segmentLabel` "Text 1"…"Text 5", lenguaje hablado

### HÖREN T2 — 1 Gespräch + 5 matching; `options`: 9 descripciones `"a) …"`…`"i) …"` (Bilder); correct letra minúscula a–i

### HÖREN T3 — 5 diálogos cortos, 1 MCQ/segmento, `segmentLabel`

### HÖREN T4 — 1 Radiointerview + 5 ja_nein

### SCHREIBEN — 2 consignas, passages `[]`, type **`short_answer`** (no `"schreiben"`):
- T1: SMS 20–30 Wörter, 3 bullet points (TOPIC_T1)
- T2: E-Mail semiformal 30–40 Wörter, 3 bullet points (TOPIC_T2)

### SPRECHEN — 3 consignas, passages `[]`, type **`short_answer`**:
- T1: 4 Karten — Fragen zur Person (TOPIC_T1)
- T2: 1 Karte — Von sich erzählen (TOPIC_T2)
- T3: Gemeinsam planen mit Partner (TOPIC_T3)

---

## PROHIBIDO

- Grammatik-Modul, Lesen T5, Schreiben T3, tipos B1 (richtig_falsch en Lesen, 7 matching Lesen T3, etc.)
- IDs con `de-b1` o level distinto de A2
- Objetos en `options` — solo strings
