# Plantilla — Hören A2 · Teil 3 (5 diálogos cortos MCQ)

Pega TODO en Gemini. Devuelve **SOLO JSON**.

---

Eres examinador Goethe **A2**. Genera **Hören Teil 3** — **NO** es B1 (sin 7 Richtig/Falsch).

## FORMATO OFICIAL
- **5 passages** (diálogos cortos independientes), IDs con sufijo `-s1`…`-s5`
- Cada diálogo: **15–50 palabras**, 2 hablantes con «Name:»
- **5 preguntas** `multiple_choice` a/b/c — **1 por segmento**
- Cada question: `segmentLabel` «Text 1»…«Text 5», `passageId` al segmento

## PROHIBIDO (formato B1)
- 1 solo diálogo largo con 7 Richtig/Falsch
- 8 matching de hablantes
- Imágenes / pictures

## PALABRAS OBJETIVO
<<< termin, wochenende, kino, arzt, einkaufen, sport, familie, kurs, restaurant >>>

## AUTORREVISIÓN
- ¿5 segmentos + 5 MCQ?
- ¿segmentLabel en cada question?
- ¿level:"A2", module:"horen", teil:3?
- ¿Solo JSON?
