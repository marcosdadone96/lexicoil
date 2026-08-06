# germanCapsNormalize v3.1 → v3.2 — holdout regression

**Fecha:** 2026-07-10T12:45:05.998Z
**Corpus:** 193 archivos (193 holdout + 15 validación + 25 pilot tanda)
**v3.1 baseline:** `PHASE1-G2-DRYRUN.json` (193 ready; validation sin baseline Phase1)
**v3.2:** `scripts/lib/germanCapsNormalize.mjs` (v3.5-stable)

## Resumen global

| Métrica | v3.1 | v3.2 | Δ |
|---|---:|---:|---:|
| decapFixed (total) | 65 | 63 | -2 |
| capFixed (total) | 41 | 1 | -40 |
| markdownFixed (v3.2 only) | — | 0 | +0 |
| Archivos con Δ decap/cap/markdown | 51 | 51 | — |
| Archivos con cambio inesperado | 10 | — | — |

## Por Teil (archivos con al menos un fix distinto v3.1→v3.2)

| Teil | archivos | Δ decap | Δ cap | markdown v3.2 | archivos tocados |
|---:|---:|---:|---:|---:|---:|
| T1 | 17 | -6 | -6 | 0 | 10 |
| T2 | 15 | -11 | -14 | 0 | 15 |
| T3 | 125 | +0 | +0 | 0 | 0 |
| T4 | 17 | +8 | -5 | 0 | 11 |
| T5 | 19 | +7 | -15 | 0 | 15 |

## Cambios inesperados (revisión manual)

### lesen-t2-gemini-060.json (token change fuera de patrones AUD)

- `passages[0].text`: "frischen→Frischen" → "Frischen→frischen"
- `questions[0].explanation`: "frischen→Frischen" → "Frischen→frischen"

### lesen-t2-gemini-062.json (token change fuera de patrones AUD)

- `passages[0].text`: "frischen→Frischen" → "Frischen→frischen"

### lesen-t2-gemini-086.json (token change fuera de patrones AUD)

- `questions[1].explanation`: "(none)" → "Erfolgreich→erfolgreich"

### lesen-t4-gemini-020.json (token change fuera de patrones AUD)

- `questions[6].signText`: "(none)" → "Stimme→stimme"

### lesen-t4-gemini-021.json (token change fuera de patrones AUD)

- `questions[3].signText`: "(none)" → "Stimme→stimme"

### lesen-t4-gemini-023.json (token change fuera de patrones AUD)

- `questions[0].signText`: "(none)" → "Stimme→stimme"

### lesen-t4-gemini-025.json (token change fuera de patrones AUD)

- `questions[6].signText`: "(none)" → "Stimme→stimme"

### lesen-t4-gemini-028.json (token change fuera de patrones AUD)

- `questions[6].signText`: "frischen→Frischen" → "Frischen→frischen"

### lesen-t4-gemini-031.json (token change fuera de patrones AUD)

- `questions[1].signText`: "(none)" → "Stimme→stimme"

### lesen-t4-gemini-034.json (token change fuera de patrones AUD)

- `questions[2].signText`: "(none)" → "Stimme→stimme"

## Archivos con Δ (detalle)

| Archivo | Teil | Δdecap | Δcap | md | Cambios token |
|---|---:|---:|---:|---:|---|
| lesen-t1-gemini-147.json | T1 | -3 | -1 | 0 | undefined→undefined, undefined→undefined |
| lesen-t1-gemini-154.json | T1 | +3 | +0 | 0 | undefined→undefined, undefined→undefined |
| lesen-t1-gemini-161.json | T1 | +0 | -1 | 0 | undefined→undefined |
| lesen-t1-gemini-162.json | T1 | -2 | +0 | 0 | undefined→undefined, undefined→undefined |
| lesen-t1-gemini-163.json | T1 | +0 | -3 | 0 | undefined→undefined, undefined→undefined |
| lesen-t1-gemini-167.json | T1 | -1 | +0 | 0 | undefined→undefined |
| lesen-t1-gemini-170.json | T1 | +1 | +1 | 0 | — |
| lesen-t1-gemini-171.json | T1 | +0 | -1 | 0 | undefined→undefined |
| lesen-t1-gemini-173.json | T1 | -3 | +0 | 0 | undefined→undefined, undefined→undefined |
| lesen-t1-gemini-174.json | T1 | -1 | -1 | 0 | undefined→undefined, undefined→undefined |
| lesen-t2-gemini-060.json | T2 | +1 | -3 | 0 | undefined→undefined, undefined→undefined |
| lesen-t2-gemini-061.json | T2 | -5 | +0 | 0 | undefined→undefined, undefined→undefined |
| lesen-t2-gemini-062.json | T2 | +2 | -1 | 0 | undefined→undefined, undefined→undefined |
| lesen-t2-gemini-066.json | T2 | -2 | +0 | 0 | undefined→undefined, undefined→undefined |
| lesen-t2-gemini-067.json | T2 | -1 | -1 | 0 | undefined→undefined, undefined→undefined |
| lesen-t2-gemini-072.json | T2 | -3 | -2 | 0 | undefined→undefined, undefined→undefined |
| lesen-t2-gemini-076.json | T2 | +0 | -1 | 0 | undefined→undefined |
| lesen-t2-gemini-077.json | T2 | -2 | +0 | 0 | undefined→undefined, undefined→undefined |
| lesen-t2-gemini-079.json | T2 | -5 | +0 | 0 | undefined→undefined, undefined→undefined |
| lesen-t2-gemini-083.json | T2 | -1 | +0 | 0 | undefined→undefined |
| lesen-t2-gemini-085.json | T2 | +0 | -1 | 0 | undefined→undefined |
| lesen-t2-gemini-086.json | T2 | +1 | -3 | 0 | undefined→undefined, undefined→undefined |
| lesen-t2-gemini-087.json | T2 | -1 | +0 | 0 | undefined→undefined |
| lesen-t2-gemini-088.json | T2 | -2 | -1 | 0 | undefined→undefined, undefined→undefined |
| lesen-t2-gemini-089.json | T2 | +7 | -1 | 0 | undefined→undefined, undefined→undefined |
| lesen-t4-gemini-020.json | T4 | +2 | -1 | 0 | undefined→undefined, undefined→undefined |
| lesen-t4-gemini-021.json | T4 | +1 | +0 | 0 | undefined→undefined |
| lesen-t4-gemini-023.json | T4 | +1 | +0 | 0 | undefined→undefined, undefined→undefined |
| lesen-t4-gemini-024.json | T4 | +1 | +0 | 0 | undefined→undefined |
| lesen-t4-gemini-025.json | T4 | +2 | +0 | 0 | undefined→undefined, undefined→undefined |
| lesen-t4-gemini-028.json | T4 | +1 | -1 | 0 | undefined→undefined |
| lesen-t4-gemini-029.json | T4 | +3 | -1 | 0 | undefined→undefined, undefined→undefined |
| lesen-t4-gemini-031.json | T4 | +1 | +0 | 0 | undefined→undefined |
| lesen-t4-gemini-032.json | T4 | -1 | +0 | 0 | undefined→undefined |
| lesen-t4-gemini-034.json | T4 | -1 | -2 | 0 | undefined→undefined, undefined→undefined |
| lesen-t4-gemini-035.json | T4 | -2 | +0 | 0 | undefined→undefined, undefined→undefined |
| lesen-t5-gemini-016.json | T5 | +1 | -2 | 0 | undefined→undefined, undefined→undefined |
| lesen-t5-gemini-018.json | T5 | +7 | +0 | 0 | undefined→undefined, undefined→undefined |
| lesen-t5-gemini-020.json | T5 | +0 | -1 | 0 | undefined→undefined, undefined→undefined |
| lesen-t5-gemini-021.json | T5 | +0 | -4 | 0 | undefined→undefined, undefined→undefined |
| lesen-t5-gemini-025.json | T5 | -1 | -3 | 0 | undefined→undefined, undefined→undefined |
| lesen-t5-gemini-031.json | T5 | +0 | -1 | 0 | undefined→undefined |
| lesen-t5-gemini-038.json | T5 | +0 | -1 | 0 | undefined→undefined |
| lesen-t5-gemini-045.json | T5 | -2 | +0 | 0 | undefined→undefined, undefined→undefined |
| lesen-t5-gemini-046.json | T5 | +5 | +0 | 0 | undefined→undefined, undefined→undefined |
| lesen-t5-gemini-049.json | T5 | +1 | +0 | 0 | undefined→undefined, undefined→undefined |
| lesen-t5-gemini-052.json | T5 | -1 | +0 | 0 | undefined→undefined |
| lesen-t5-gemini-054.json | T5 | -2 | -1 | 0 | undefined→undefined, undefined→undefined |
| lesen-t5-gemini-055.json | T5 | +0 | -1 | 0 | undefined→undefined |
| lesen-t5-gemini-056.json | T5 | +1 | -1 | 0 | undefined→undefined |
| lesen-t5-gemini-061.json | T5 | -2 | +0 | 0 | undefined→undefined, undefined→undefined |

JSON completo: `V32-HOLDOUT-REGRESSION.json`
