# Exámenes ensamblados — revisión de unidad (re-run 2026-07-10)

Lesen 5 + Hören 4 + Schreiben 3 · **sin Sprechen**.  
**Re-ensamblado** tras gate de descarte + PENDING-CONTENT-FIXES + sync de topics.

## Gates de proceso (nuevos)

| Gate | Fuente |
|------|--------|
| Discard formal | `batches/ready/gate-logs/*DISCARD*.json` (p.ej. `Q2-LENA-CLUSTER-DISCARD.json`) |
| Pending manual | `batches/ready/PENDING-CONTENT-FIXES.json` |
| Implementación | `scripts/lib/assembleDiscardLists.mjs` → `assemble-review-unit-exams.mjs` |

**Verificación:** 0 partIds de discard/pending en e2/e3/e4.  
**Ausentes a propósito:** `lesen-t3-auto-toixf8`, `schreiben-gemini-003`.

## Topics

`_meta.topics` ahora prioriza `questions[].topicTags` (contenido).  
Ej.: Hören T3 seed `topicTags:["work"]` → **Arbeit** (antes `record.topicTag=Technik` stale). Alias `work→Arbeit` en `b1Topics.js`.

## Unterkunft

Patrón `einen günstigen Unterkunft` corregido en pool T3 generated/ready + e4 ensamblado → `eine günstige Unterkunft`.  
Candidato a checker determinista o Q3-B (nota en PENDING-CONTENT-FIXES).

## Exámenes

Ver tablas en corrida / `review-unit-exams.json`. Archivos:

- [`assembled-exam-b1-review-e2.json`](assembled-exam-b1-review-e2.json)
- [`assembled-exam-b1-review-e3.json`](assembled-exam-b1-review-e3.json)
- [`assembled-exam-b1-review-e4.json`](assembled-exam-b1-review-e4.json)
