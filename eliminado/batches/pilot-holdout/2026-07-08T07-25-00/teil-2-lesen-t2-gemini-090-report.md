# Pilot holdout — Lesen T2

**Archivo:** `lesen-t2-gemini-090.json`
**Gate:** v6.1-B-G2 (frozen)
**Campos de texto:** 32

## Caps gate

| Métrica | Pilot | Calibración (pool G2, este Teil) |
|---|---:|---:|
| Findings bloqueantes | 1 | ~3.3/archivo (36 total) |
| Observations | 0 | 103 global (relajadas) |
| TELEGRAPHIC findings | 0 | esperado ≤ 0 |

### Por reason code
- `verb_census_no_finite`: 1

### Por régimen
- PROSE: 1

### Findings
- `Experten` (verb_census_no_finite) [PROSE] questions.options — …b) Nur Experten, die Pflanzen studieren…

## Comportamiento esperado

- Régimen dominante: PROSE
- Dos textos largos; homógrafos verbales frecuentes en generación IA.
- Telegráfico OK: ✓

## Revisión cualitativa

**Nivel B1:** Longitud media coherente con B1

**Posibles errores de mayúsculas en el texto (heurística):**
- [passage] Immer mehr Firmen erkennen, wie wichtig die Gesundheit ihrer Mitarbeiter ist. Eine neue Umfrage zeigt, dass gesunde Ernä…

**Muestra passage:**

> Ein Spaziergang im Park oder ein Ausflug in den Wald kann Wunder wirken. Viele Menschen entdecken neu, wie wichtig die Natur für ihre Gesundheit ist. Eine aktuelle Studie zeigt, dass regelmäßige Zeit im Grünen Stress reduziert und die Stimmung verbessert. Besonders Bewohner großer Städte suchen oft nach Möglichkeiten, dem Alltag zu entfliehen und frische Luft zu atmen. Ein Programm der Stadt biete

