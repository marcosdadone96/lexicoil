# Pilot holdout 2 — informe comparativo

**Run:** 2026-07-08T07-33-45
**Gate:** v6.1-B-G2 (frozen) (congelado, sin repair ni cambios de reglas)
**Objetivo:** 5 exámenes/Teil · medir generalización caps gate vs generador/auditor

## Resumen global

| Corpus | Archivos | Findings caps | Promedio/archivo |
|---|---:|---:|---:|
| Calibración G2 (pool `batches/ready/lesen`) | 193 | 88 | 0.46 |
| Pilot 1 (`2026-07-08T07-25-00`) | 5 | 2 | 0.4 |
| **Pilot 2 (este run)** | **18** | **12** | **0.67** |

## Por Teil

| Teil | P2 archivos | P2 passed | P2 audit↓ | P2 findings | P2 avg | Cal avg | Pilot1 avg |
|---:|---:|---:|---:|---:|---:|---:|---:|
| T1 | 2 | 2 | 0 | 0 | 0 | 1.8 | 1 |
| T2 | 3 | 3 | 0 | 2 | 0.67 | 3.3 | 1 |
| T3 | 3 | 3 | 0 | 0 | 0 | 1 | 0 |
| T4 | 5 | 2 | 3 | 9 | 1.8 | 1.4 | 0 |
| T5 | 5 | 5 | 0 | 1 | 0.2 | 3 | 0 |

## Separación generador/auditor vs caps gate

| Teil | Audit rechazados | Errores quality | Warnings quality | Warnings caps en gen (warn) | Findings caps gate (frozen) |
|---:|---:|---:|---:|---:|---:|
| T1 | 0 | 0 | 0 | 0 | 0 |
| T2 | 0 | 0 | 2 | 2 | 2 |
| T3 | 0 | 0 | 7 | 7 | 0 |
| T4 | 3 | 0 | 9 | 9 | 9 |
| T5 | 0 | 0 | 1 | 1 | 1 |

## Reason codes (caps gate, pilot 2)

- `adj_before_noun`: 6
- `lexicon_override_tag`: 3
- `verb_census_no_finite`: 1
- `lexicon_after_adj`: 1 ⚠ nuevo
- `lexicon_nn`: 1

## Patrones nuevos vs calibración

Reason codes no presentes en calibración: `lexicon_after_adj`

## Interpretación

- **Findings caps gate** = salida del gate v6.1-B-G2 congelado (pos-check Python).
- **Audit rechazados** = audit-pass-2 / calidad pedagógica del generador (no modifica el gate).
- **Warnings caps en gen** = `GERMAN_CAPS_GATE=warn` durante generación; puede solaparse con el gate frozen.

Detalle por archivo: `manifest.json`, agregados por Teil: `teil-N-aggregate.json`.
