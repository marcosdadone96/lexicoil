# pool-verified reject-meta scrub (2026-07-10)

**Dry-run:** false

## Causa

Escrituras READY a `pool-verified/` no eliminaban `_poolReject*` heredados de
`needs-regeneration` / `pool-content-ok-lesen`. El archivo parecía verified pero
llevaba su propio rechazo.

## Alcance

| Métrica | N |
|--------|--:|
| Total en pool-verified (antes) | 134 |
| Con `_poolRejectReason` | **89** |
| Ya limpios | 45 |
| Kept + strip (gates READY) | 74 |
| Kept T3 fingerprint reps + strip | 15 |
| → pool-content-ok-lesen | 0 |
| → needs-regeneration | 0 |
| Verified después | 134 |

Datos: `POOL-VERIFIED-REJECT-SCRUB-2026-07-10.json`
