# Auditoría preventiva — Cierre (2026-08-07)

**Ronda:** tandas 1–2 + parte 4 (LT full scope) + fixes A questions  
**Commits:** `9758010` · `1b67960` · `a???????` (fixes questions)

---

## Muestra B1 — revisión clasificación A (18/222 crudos)

Tras filtro conservador (bloqueo rubric `thema-passend`, adjetivos válidos, compuestos, sugerencias LT erróneas, **word-boundary** en replacements), **62 replacements en 19 archivos B1 tracked** — no 222.

| # | Archivo | Antes | Después | Veredicto |
|---|---------|-------|---------|-----------|
| 1 | `B2/horen-t2-gemini-113` | `die technischen Teil` | `die technischen Teile` | ✅ A |
| 2 | `B2/lesen-t1-gemini-208` | `geschütztere digitale Welt` | *(sin cambio)* | ⛔ FP — comparativo fem. correcto |
| 3 | `A2/lesen-t3-cur-society` | `ins Tennisverein` | `in den Tennisverein` | ✅ A (×5 opciones) |
| 4 | `A2/horen-t4-cur-society` | `In der Radiointerview` | `Im Radiointerview` | ✅ A |
| 5 | `B1/horen-t2-gemini-031` | `zu geschäften` | `zu Geschäften` | ✅ A |
| 6 | `B1/horen-t2-gemini-032` | `zu mitmenschen` | `zu Mitmenschen` | ✅ A |
| 7 | `B1/horen-t2-gemini-114` | `eine Probleme` | `ein Problem` | ✅ A (LT sugería `einem Probleme` ❌) |
| 8 | `B1/horen-t4-gemini-039` | `Eine Problem` | `Ein Problem` | ✅ A |
| 9 | `B1/lesen-t1-gemini-193` | `ihren reduzierten Eigentum` | `ihr reduziertes Eigentum` | ✅ A |
| 10 | `B1/lesen-t2-gemini-168` | `Welche positiven Teil` | `Welchen positiven Teil` | ✅ A |
| 11 | `B1/lesen-t3-auto-p8ebr7` | `einen günstigen Unterkunft` | `einer günstigen Unterkunft` | ✅ A |
| 12 | `B1/lesen-t3-gemini-021` | `mit schreibtisch` | `mit Schreibtisch` | ✅ A |
| 13 | `B1/lesen-t3-auto-yu9vyl` | `für einsteiger` | `für Einsteiger` | ✅ A |
| 14 | `B1/lesen-t4-gemini-080` | `wird das Teurer` | `wird das teurer` | ✅ A |
| 15 | `B1/lesen-t4-gemini-076` | `statt zu frieden` | `statt zum Frieden` | ✅ A |
| 16 | `B1/schreiben-b1-batch-*` | `thema-passend` | *(sin cambio)* | ⛔ D — descriptor rubric |
| 17 | `B1/lesen-t3-gemini-002` | `im Laden abholbar` | *(sin cambio)* | ⛔ D — adjetivo |
| 18 | `B1/lesen-t5-gemini-023` | `restentleert` | *(sin cambio)* | ⛔ D — compuesto válido |

**Conclusión muestra:** clasificación A cruda sobreestima (~222); reglas conservadoras + word-boundary reducen a **69 fixes en repo** (B2:1 + A2:6 + B1:62). Sin restamp metadata. Sin regresiones tipo restamp caps ni `ArbeitsAtmosphäre`.

---

## Fixes aplicados

| Nivel | Archivos | Replacements |
|-------|----------|--------------|
| B2 | 1 | 1 |
| A2 | 2 | 6 |
| B1 | 19 | 62 |
| **Total** | **22** | **69** |

*Nota:* 8 batches B1 adicionales en disco (untracked) quedan fuera de este commit.

Script: `scripts/dev/apply-lt-question-fixes.mjs`  
Evidencia: `preventive-lt-question-fixes-applied-2026-08-07.json`

---

## Veredicto cierre ronda preventiva

| Área | Estado |
|------|--------|
| LT passage-only (tanda 1–2) | ✅ B1/A2/B2 |
| LT full scope questions (parte 4) | ✅ |
| Fixes A passage B1 (tanda 2) | ✅ commit `9758010` |
| Fixes A questions B2/A2/B1 | ✅ esta ronda |
| Separables contenido | ✅ sin deuda bloqueante |
| Coherencia muestra B1/B2 | ✅ |
| SEP-VOCAB-TAG-GAP | 📝 deuda B, sin acción |
| LT-DOCKER-LOAD | 📝 operativo, sin acción |

**Ronda preventiva: CERRADA.**
