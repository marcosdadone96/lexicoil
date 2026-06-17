# Gemini API — Goethe B1 (de) · prompt compacto

> Usado automáticamente por `npm run generate:batch`. Menos tokens = menos cuota.

---INICIO---

## PARÁMETROS DE ESTA GENERACIÓN

Usa **exactamente** MODULE, TEIL, TOPIC, SLUG del bloque insertado arriba. No cambies tema ni slug.

---

## ROL

Generas **un batch JSON** para Goethe-Zertifikat B1. Material original, formato oficial, nivel B1.

**Salida:** SOLO JSON `{ "passages": [...], "questions": [...] }` — sin markdown, sin comentarios.

---

## REGLAS GLOBALES

| MODULE | passages | questions | module en Q |
|--------|----------|-----------|-------------|
| lesen | 0–7 según Teil | según Teil | `"lesen"` |
| horen | 1–5 segmentos | según Teil | `"horen"` |
| schreiben | **`[]`** | **3** (T1+T2+T3) | `"schreiben"` |
| sprechen | **`[]`** | **3** (T1+T2+T3) | `"sprechen"` |

**IDs:** usa SLUG dado.
- Lesen T1: `de-b1-p-lesen-t1-{SLUG}`, `de-b1-l-t1-{SLUG}-q1`…`q6`
- Lesen T2: passages `-a`/`-b`, questions `-a-q1`…`-b-q3`
- Lesen T3: `de-b1-l-t3-{SLUG}-q1`…`q7`, passages `[]`, matching A–J + `"0"`
- Lesen T4: `de-b1-l-t4-{SLUG}-q1`…`q7`, `signText` por pregunta, ja_nein, sin passage
- Lesen T5: `de-b1-p-lesen-t5-{SLUG}`, 4 MCQ
- Hören T1: 5 passages `-s1`…`-s5`, 10 Q (R/F + MCQ por segmento), `segmentLabel`
- Hören T2: 1 monólogo, 5 MCQ
- Hören T3: 1 diálogo, 7 R/F
- Hören T4: 1 debate, 8 matching speaker M/A/B
- Schreiben: `de-b1-s-t{N}-{SLUG}-q1` × 3 teile
- Sprechen: `de-b1-sp-t{N}-{SLUG}-q1` × 3 teile

**correct === correctAnswer** siempre.
- MCQ: solo `"a"`/`"b"`/`"c"` · **`options: ["a) …", "b) …", "c) …"]`** (strings, NUNCA objetos)
- richtig_falsch: `"Richtig"`/`"Falsch"` · `options: []` (vacío)
- ja_nein: `"Ja"`/`"Nein"`
- matching Lesen T3: `"A"`–`"J"` o `"0"`
- matching Hören T4: `"M"`/`"A"`/`"B"`
- schreiben/sprechen: `"rubric"`

**Campos obligatorios por question:**
`id, module, teil (número entero), type, question, correct, correctAnswer, explanation, options, grammarTags, topicTags (1 solo), vocabularyTags, difficulty (entero 3-6, NUNCA "B1"), skills (array, ej. ["listening"]), language:"de", level:"B1", examType:"goethe"`
+ `passageId` si aplica · `signText` en Lesen T4 · `segmentLabel` en Hören T1

**Passage:** `id, module, title, text, passageVocab` (3–5 lemas)

**Palabras (objetivo interno):**
- Lesen T1/T2: 165–210 · T5: 195–235 · T4 signText: 65–85
- Hören T1/seg: 50–85 · T2: 240–300 · T3: 270–330 · T4: 320–400

**grammarTags B1:** `g-de-b1-perfekt` `g-de-b1-passiv` `g-de-b1-nebensatz` `g-de-b1-modalverben` `g-de-b1-relativ` `g-de-b1-konjunktiv` `g-de-b1-adjektivdeklination` `g-de-b1-komparativ` `g-de-b1-futur` `g-de-b1-genitiv` `g-de-b1-dativ`

**topicTags:** daily_life work health environment travel education culture technology society family food housing sport media shopping

**vocabularyTags:** lemas del texto, minúsculas, umlaut→ae/oe/ue/ss

---

## POR TEIL

### LESEN T1 — 1 passage + 6 richtig_falsch (~4 R/2 F)

### LESEN T2 — 2 textos (165–210 palabras c/u) + 6 MCQ (3 c/u)

### LESEN T3 — 7 matching, passages `[]`, mismas 10 opciones A–J en cada Q, 1 respuesta `"0"`

### LESEN T4 — 7 ja_nein, `signText` 65–85 palabras por persona, tema común

### LESEN T5 — 1 reglamento 195–235 palabras + 4 MCQ

### HÖREN T1 — 5 segmentos, 2 Q/seg (1 R/F + 1 MCQ), lenguaje hablado

### HÖREN T2 — 1 monólogo 240–300 palabras + 5 MCQ

### HÖREN T3 — 1 diálogo 270–330 palabras + 7 R/F

### HÖREN T4 — 1 debate 320–400 palabras + 8 matching (M/A/B)

### SCHREIBEN — 3 consignas en un JSON, passages `[]`:
- T1: E-Mail informal ~80 Wörter, 3 bullet points (TOPIC_T1)
- T2: Meinung Forum ~80 Wörter + cita del post (TOPIC_T2)
- T3: Nota semiformal ~40 Wörter (TOPIC_T3)

### SPRECHEN — 3 consignas, passages `[]`:
- T1: Planungsaufgabe, 5 bullet points (TOPIC_T1)
- T2: Präsentation con Einleitung/Heimatland/Vor-Nachteile/Meinung (TOPIC_T2)
- T3: Feedback sobre T2 + 2–3 preguntas ejemplo

---

## PROHIBIDO

Textos placeholder, opciones "a) Option A", todas las MCQ con "a", schreiben/sprechen con passages, module incorrecto.

---

**Genera el batch ahora según los PARÁMETROS insertados arriba.**
