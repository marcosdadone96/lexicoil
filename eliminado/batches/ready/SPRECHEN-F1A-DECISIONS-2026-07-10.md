# Sprechen F1a — decisiones de publicación (2026-07-10)

Operador: aceptar recomendaciones del plan maestro (D1 turnos / D2 bloqueantes / D3 freemium).
Criterio: calidad de auditoría + diversidad temática; preferir merged estable sobre Gemini con bugs.

## CSV topicTags

**Validado OK.** `SPRECHEN-TOPICTAGS-BACKFILL-2026-07-10.csv`: `oldTopicTags == newTopicTags` en todas las filas; tags B1 canónicos (`Kultur`, `Freizeit`, `Reisen`, `Sport`, …). Fuentes `keep_b1` / `en_map`. No hace falta reescritura.

## Pares temáticos — superviviente / descartado

| Par | Conservar | Descartar (no publicar) | Motivo |
|-----|-----------|-------------------------|--------|
| Tagesausflug + Feste T2 | `stadtfest-planung-01`, `reise-vorbereitung-01` | `feste-02` | `feste-02` pierde ambos ejes temáticos |
| Abschiedsfeier | `onlineshopping-01` | `sprechen-gemini-003` | SP-AUD bugs (ledig / Verkehrsnetz) |
| Kulturfest / Stadtfest | `stadtfest-planung-01` | `sprechen-gemini-001` | SP-AUD «zu teurer» + solape con stadtfest |
| T1 Tagesausflug idéntico | `reise-vorbereitung-01` | `reise-vorbereitung-02` | misma premisa T1 |
| T2 Reisen und Verkehr | `reise-vorbereitung-03` | `reise-vorbereitung-04`, `05` | mismo tema T2; `05` también en rejected |

## Sets a publicar (supervivientes)

**merged:** ehrenamt-02, ehrenamt-03, gesund-leben-02, onlineshopping-01..04, reise-vorbereitung-01, reise-vorbereitung-03, sport-praesentation-01/03/04/05, stadtfest-planung-01  
(**no:** feste-02, reise-02/04/05, sport-02 — ids `de-a2`)

**generated:** gemini-002, 004, 005, 006, 007, 008  
(**no:** gemini-001, 003)

Total: **18 sets** × 3 Teile = **54** registros pool.

## Destino

`library/reusable-seed/de_B1.json` (módulo `sprechen`, per-Teil) vía
`node scripts/seed-sprechen-survivors.mjs --critical-only --apply`.

**Nota gate:** `--critical-only` soft-permite IMPORTANT (CHK-14 FP «Fragen» nominal; CHK-6 B2 léxico).
CRITICAL sigue bloqueando. Deuda: limpiar CHK-6 en contenido + FP «Fragen» en CHK-14b.

**Resultado 2026-07-10:** 20/20 batches → **60** registros (T1/T2/T3 = 20 cada).
