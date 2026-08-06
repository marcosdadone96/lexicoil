# Q3-B re-piloto v1.1 — 2026-07-10

**Prompt:** `v1.1-t3zero-quote-lex-2026-07-10`

## Ajustes aplicados

1. Regla T3 `correct="0"` + ejemplo negativo ma7vt8 (Ott/Portugal) + filtro safety-net
2. `quote_fidelity`: cita literal inventada vs parafraseo legítimo (ejemplos ±)
3. Lexicon: Reserven→Ressourcen / Akzent / Protokoll como ejemplos de casi-sinónimos

## Coste

| | USD |
|---|----:|
| Estimado | $0.0443 |
| **Real** | **$0.032** |
| Tokens | in=24159 / out=1576 |

## Resultados

| Archivo | Rol | Check | Pass | Detalle |
|---------|-----|-------|:----:|---------|
| `lesen-t3-auto-ma7vt8.json` | prior_fp | no_t3_zero_non_sequitur | ✅ | no naturalness/non_sequitur on correct=0 |
| `horen-t4-gemini-003.json` | prior_miss | detect_reserven | ✅ | Reserven/Ressourcen flagged |
| `horen-t3-gemini-003.json` | prior_tp | detect_fabricated_quote | ✅ | fabricated quote still detected |
| `horen-t2-gemini-001.json` | prior_tp | detect_akzent_or_protokoll | ✅ | Akzent/Protokoll-class issue still detected |
| `lesen-t1-gemini-075.json` | prior_clean | no_block | ✅ | no blocks |
| `horen-t2-gemini-013.json` | prior_clean | no_findings | ✅ | still clean |
| `schreiben-gemini-006.json` | prior_clean | no_findings | ✅ | still clean |
| `lesen-t3-auto-we7l2c.json` | new_t3_zero | no_t3_zero_non_sequitur | ✅ | no naturalness/non_sequitur on correct=0 |

**Score:** 8/8

## Veredicto: **SÍ — listo para warn-first sobre ~289**

- Los 3 ajustes se confirman en re-piloto; escalar solo en modo warn/detección.

Datos: `Q3B-REPILOT-V1.1-2026-07-10.json`
