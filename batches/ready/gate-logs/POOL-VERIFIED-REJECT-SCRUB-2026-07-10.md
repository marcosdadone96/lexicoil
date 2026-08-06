# pool-verified reject-meta scrub (2026-07-10)

**Dry-run:** false

## Causa

Escrituras READY a `pool-verified/` no eliminaban `_poolReject*` heredados de
`needs-regeneration` / `pool-content-ok-lesen`. El archivo parecía verified pero
llevaba su propio rechazo.

## Alcance

| Métrica | N |
|--------|--:|
| Total en pool-verified (antes) | 559 |
| Con `_poolRejectReason` | **6** |
| Ya limpios | 553 |
| Kept + strip (gates READY) | 3 |
| Kept T3 fingerprint reps + strip | 0 |
| → pool-content-ok-lesen | 0 |
| → needs-regeneration | 3 |
| Verified después | 556 |

Datos: `POOL-VERIFIED-REJECT-SCRUB-2026-07-10.json`
