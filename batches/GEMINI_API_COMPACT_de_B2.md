# Gemini/Claude API — Goethe B2 (de) · prompt compacto

> Usado por `generate-batch-gemini.mjs` cuando LEVEL=B2.

---INICIO---

## PARÁMETROS DE ESTA GENERACIÓN

Usa **exactamente** MODULE, TEIL, TOPIC, SLUG, ID_PREFIX del bloque insertado arriba.

---

## ROL

Generas **un batch JSON** para **Goethe-Zertifikat B2**. Material original, Modellsatz B2, nivel B2.

**Salida:** SOLO JSON `{ "passages": [...], "questions": [...] }` — sin markdown.

---

## REGLAS GLOBALES

| MODULE | passages | questions |
|--------|----------|-----------|
| lesen | según Teil | según Teil |
| horen | segmentos | según Teil |
| schreiben | **`[]`** | **2** (T1+T2) |
| sprechen | **`[]`** | **2** (T1+T2) |

**IDs:** prefix `de-b2` + SLUG.
- Lesen T1: 4 passages personas + 9 matching (forum)
- Lesen T2: 1 artículo con huecos + 6 matching (8 frases opciones)
- Lesen T3: 1 artículo + 6 MCQ
- Lesen T4: 6 opiniones + 6 matching headlines (8 titulares)
- Lesen T5: 1 texto reglamento + 3 matching párrafos
- Hören T1: 5 segmentos, **10 Q** (2/seg: 1 R/F + 1 MCQ), `segmentLabel`
- Hören T2: 1 entrevista + 6 MCQ
- Hören T3: 1 panel + 6 matching (4 speakers)
- Hören T4: 1 Vortrag + 8 MCQ
- Schreiben: `de-b2-s-t1-{SLUG}-q1`, `de-b2-s-t2-{SLUG}-q1`
- Sprechen: `de-b2-sp-t1-{SLUG}-q1`, `de-b2-sp-t2-{SLUG}-q1`

**correct === correctAnswer**
- MCQ: `"a"`/`"b"`/`"c"` · options strings `"a) …"`
- richtig_falsch: `"Richtig"`/`"Falsch"` · options `[]`
- matching: letras según slot; T1 forum personas `"A"`–`"D"` (repetibles)
- schreiben/sprechen: `"rubric"`

**Campos:** `id, module, teil, type, question, correct, correctAnswer, explanation, options, grammarTags, topicTags, vocabularyTags, difficulty (4-7), skills, language:"de", level:"B2", examType:"goethe"`
+ `passageId`, `segmentLabel` (Hören T1)

**grammarTags B2:** `g-de-b2-konj1` `g-de-b2-konj2` `g-de-b2-nominal` `g-de-b2-passiv` `g-de-b2-modus` `g-de-b2-relativ`

---

## POR TEIL (solo el TEIL indicado)

### LESEN T1 — 4 Personen (passages) + 9 matching Aussagen→Person A–D

### LESEN T2 — 1 Artikel (~300 W) con 6 Lücken + 6 matching (8 Sätze, 2 sobran)

### LESEN T3 — 1 Zeitungsartikel (~400 W) + 6 MCQ

### LESEN T4 — 6 Meinungen (passages) + 6 matching Überschriften (8 opciones, 1 Meinung ohne Paar → `"0"`)

### LESEN T5 — 1 Studienordnung + 3 matching Überschriften (7 pool)

### HÖREN T1 — 5 Gespräche, 2 Q/seg (R/F + MCQ), 10 questions total

### HÖREN T2 — 1 Interview (2×) + 6 MCQ

### HÖREN T3 — 1 Radiogespräch 4 Personen + 6 matching Wer sagt das?

### HÖREN T4 — 1 Vortrag (2×) + 8 MCQ

### SCHREIBEN T1 — Forumsbeitrag min. 150 Wörter (TOPIC_T1)
### SCHREIBEN T2 — Nachricht an Chef min. 100 Wörter (TOPIC_T2)

### SPRECHEN T1 — Vortrag halten (TOPIC_T1)
### SPRECHEN T2 — Diskussion kontroverses Thema (TOPIC_T2)

---

## PROHIBIDO

- Grammatik, tipos A2/B1, IDs `de-b1`/`de-a2`, level distinto de B2
