# Pilot holdout — Lesen T1

**Archivo:** `lesen-t1-gemini-175.json`
**Gate:** v6.1-B-G2 (frozen)
**Campos de texto:** 13

## Caps gate

| Métrica | Pilot | Calibración (pool G2, este Teil) |
|---|---:|---:|
| Findings bloqueantes | 1 | ~1.8/archivo (9 total) |
| Observations | 0 | 103 global (relajadas) |
| TELEGRAPHIC findings | 0 | esperado ≤ 0 |

### Por reason code
- `lexicon_override_tag`: 1

### Por régimen
- PROSE: 1

### Findings
- `mitmachen` (lexicon_override_tag) [PROSE] questions.explanation — …, dass sie gerne mitmachen.…

## Comportamiento esperado

- Régimen dominante: PROSE
- Textos continuos + preguntas MCQ; caps gate activo en prosa.
- Telegráfico OK: ✓

## Revisión cualitativa

**Nivel B1:** Longitud media coherente con B1

**Posibles errores de mayúsculas en el texto (heurística):**
- [passage] Ich bin Anna und lebe mit meiner Familie in einer kleinen Stadt. Mein Mann und ich haben zwei Kinder, einen Jungen und e…
- [explanation] Die Kinder gießen die Pflanzen und ernten die Erdbeeren, was zeigt, dass sie gerne mitmachen.…
- [explanation] Ihre Eltern unterstützen sie viel, besonders bei Terminen, und wohnen nicht weit weg.…

**Muestra passage:**

> Ich bin Anna und lebe mit meiner Familie in einer kleinen Stadt. Mein Mann und ich haben zwei Kinder, einen Jungen und ein Mädchen. Sie gehen noch zur Schule. Mein Alltag ist oft sehr voll. Ich arbeite Teilzeit in einem Büro und nachmittags kümmere ich mich um die Kinder und den Haushalt. Am Wochenende versuchen wir immer, etwas Besonderes zusammen zu machen. Letzten Monat haben wir uns entschiede

