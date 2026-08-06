# Audit lesen-t1-gemini-075 + pool-verified reject visibility (2026-07-10)

## Tarea 1 — Visibilidad

**Ubicación de 075:** `batches/ready/pool-verified/lesen-t1-gemini-075.json` (única copia).

**Alcance:** **89 / 134** archivos en `pool-verified/` tenían `_poolRejectReason` (todos Lesen; 0 Hören/Schreiben/Sprechen).

**Causa:** escrituras READY (`recheck-lesen-q1-mirror-fix`, `finalizePoolReady`, `run-pool-ready-check`, `promote-t3-fingerprint-reps`) persistían el batch con stamps de rechazo previos (`needs-regeneration` / `pool-content-ok-lesen`) sin limpiarlos.

**Fix:**
- `stripPoolRejectMeta` + `writePoolVerified()` en `finalizePoolReady.mjs` (única vía segura a verified).
- Cableado en recheck / run-pool-ready-check / promote-ok-lesen / promote-t3.
- Scrub: `scripts/scrub-pool-verified-reject-meta.mjs` → **89 strip**; 74 gates READY (meta stale), 15 T3 reps intencionales; **0** movidos. Tras scrub: **0** con `_poolRejectReason` en verified.

## Tarea 2 — topic_mismatch

Re-check con `topicTag: Verkehr` → **mismatch = false** (obsoleto).

Detalle del rechazo citaba `«Freizeit»` porque el check usaba `p.topicTag || batch.topicTag` (passage stale) aunque el root ya era Verkehr tras enrich. Fix: preferir `batch.topicTag || p.topicTag` en `poolReadyCheck`.

## Tarea 3 — Verkehrsnetz

Corregido en q3: `eine bessere Verkehrsnetz` → `ein besseres Verkehrsnetz`.

Scan ampliado (artículo femenino + sustantivo neutro sospechoso en ready/generated): **0** repeticiones del mismo error. Hits de `Lebensqualität` / `Geldreserve` son femeninos correctos.

## Tarea 4 — vocabularyTags (muestra n=10)

| Métrica | Valor |
|--------|------:|
| Archivos con ≥1 problema claro | **6 / 10 (60%)** |
| Problemas típicos | verbos conjugados (`findet`, `braucht`, `hilft`), sustantivos en minúscula (`alltag`, `urlaub`), adjetivos flexionados (`entspannter`) |

**Recomendación:** mejorar `extractVocabularyFromText` (lematizar a infinitivo, capitalizar sustantivos B1, filtrar formas finitas / adj. flexionados). No bloquear pool por esto aún — es metadata de retrieval, no contenido del examen. Prioridad media tras estabilizar Q1.

Informes: `POOL-VERIFIED-REJECT-SCRUB-2026-07-10.md`
