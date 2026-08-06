# pool-verified caps reprocess — 2026-07-10

## Resultado sobre los 45

| | N |
|--|--:|
| Total `pool-verified/` | 45 |
| **Cambio de contenido real** (antes de estar al día) | **2** |
| Solo stamp `_germanCapsNormalizeVersion=v3.4-stable` | 43 |
| Re-check `poolReadyCheck` post-fix | **45/45 READY** |

### Los 2 con contenido

| Archivo | Fixes |
|---------|--------|
| `horen-t4-gemini-007` | `Autofreie`→`autofreie`; `zu viel Abgase`→`zu viele Abgase` (manual, no caps) |
| `horen-t4-gemini-008` | `Dem Stimme ich`→`Dem stimme ich`; Dana/Florian→**Hannah/Marie** (nameRotation, $0) |

**Nota diagnóstico:** dry-run con v3.3 **antes** de añadir guards → **0/45** cambios. Autofreie/Stimme **no** estaban cubiertos; no era solo “stamp viejo”.

`horen-t2-gemini-001` (Akzent): sin cambio — Q3-B semántico, fuera de esta ronda.

## Guards nuevos (`v3.4-stable`)

- `autofrei*` → `ADJ_NEEDS_ARTICLE_GUARD`
- `stimme/stimmen/…` → `V2_FINITE_VERB_LEMMAS` + bloqueo de re-cap tras Dem+ich
- Tests: **140/140**

## `zu viel Abgase`

Escaneo ready/needs-regen/generated: **único** `zu viel` + plural contable mal formado = Abgase. Resto (`Zeit`, `Zucker`, `Arbeit`, …) son masa/incontable → `viel` correcto. **No** merece guard genérico; fix puntual en 007.

## Proceso: “verified = reglas de HOY”

En `poolReadyCheck.mjs`:

1. Gate 1 siempre ejecuta `applyGermanCapsNormalize` **actual**.
2. Stamp `_germanCapsNormalizeVersion`; si falta o ≠ `GERMAN_CAPS_NORMALIZE_VERSION` → `caps_version_stale` (REPAIRABLE).
3. `applyPoolRepairs` siempre re-aplica + restampa.

**Guard #50 mañana:** bump `GERMAN_CAPS_NORMALIZE_VERSION` → todos los READY quedan stale hasta re-repair. Script: `scripts/reprocess-pool-verified-caps.mjs`.

Datos: `gate-logs/pool-verified-caps-reprocess-2026-07-10.json`
