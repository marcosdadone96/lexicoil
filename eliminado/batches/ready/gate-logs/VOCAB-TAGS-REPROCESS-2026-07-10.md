# vocabularyTags reprocess (2026-07-10)

**Version:** `v2.3.1-stop-leak-2026-07-10`
**Dry-run:** false

## Extractor

- Verbos → infinitivo (`findet` → `finden`)
- Sustantivos → mayúscula (`alltag` → `Alltag`)
- Adjetivos → forma base (`entspannter` → `entspannt`)
- Filtro de partículas / pronombres de bajo valor de búsqueda

## Validación (muestra nueva, n=25, excluye los 10 del audit 60%)

| Métrica | Antes | Después |
|--------|------:|--------:|
| Archivos con ≥1 problema | 0 (0%) | **0 (0%)** |
| Baseline audit previo | 60% | — |

## Reproceso

| Pool | Escaneados | Cambiados |
|------|----------:|----------:|
| pool-verified | 134 | 5 |
| pool-content-ok-lesen | 155 | 2 |

**Total cambiados:** 7 / 289

Datos: `VOCAB-TAGS-REPROCESS-2026-07-10.json`
