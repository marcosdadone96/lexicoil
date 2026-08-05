# Auditoría preventiva — Tanda 2 Parte 4 (2026-08-05)

**Alcance:** LanguageTool `--scope full` — passages + questions (bundle por pregunta)  
**Niveles:** B1 (542) · A2 (124) · B2 (13)  
**Infra:** Docker `lexicoil-lt` · delay 80ms · concurrency 1 (estable; >2 tumba el contenedor)

Evidencia JSON:
- `preventive-lt-full-{B1,A2,B2}-2026-08-05.json`
- `preventive-lt-full-analysis-2026-08-05.json`
- `preventive-lt-full-classified-2026-08-05.json`

---

## Cambio técnico (C → resuelto)

| Antes | Después |
|-------|---------|
| Solo `passage.text` | `passages.content` (text+transcript) + `questions.content` (question+options+explanation+statement) |
| CLI | `node scripts/audit-languagetool-de.mjs --scope full --dir …` |
| Default legacy | `--scope passages` sin cambios para scripts existentes |

Script: `scripts/audit-languagetool-de.mjs` · helpers: `extractAuditableSegments`, `analyze-lt-full-scope.mjs`

---

## Resumen escaneo full

| Nivel | Segmentos | Matches brutos | Real (post-ruido) | En questions | En passages | Baseline passage-only |
|-------|-----------|----------------|-------------------|--------------|-------------|---------------------|
| **B2** | 106 | 32 | **25** | **16** | 9 | 7 |
| **A2** | 940 | 145 | **138** | **76** | 62 | 63 |
| **B1** | 4020 | 5560 | **5322** | **5164** | 158 | 161 |

**Conclusión:** la limitación era real. En B2 el 64% de hallazgos reales estaba solo en preguntas/explicaciones/opciones; en A2 el 55%. Sin `--scope full` no se detectaban.

Top campos B1 (matches brutos):
- `questions.content`: 5271
- `passages.content`: 273

---

## Clasificación A/B/C/D — question fields (post-filtro MCQ `a/b/c)`)

| Nivel | Hits questions | Tras filtro opción | **A** candidatos | **D** | Archivos afectados |
|-------|----------------|--------------------|------------------|-------|-------------------|
| B2 | 16 | 16 | **2** | 14 | 4 |
| A2 | 76 | 73 | **6** | 67 | 26 |
| B1 | 5164 | 4965 | **222** | 4743 | 219 |

### B2 — A candidatos (questions)

| Archivo | Q | Issue | Cat. |
|---------|---|-------|------|
| `horen-t2-gemini-113.json` | 1 | `die technischen Teil` → concordancia plural | **A** |
| `lesen-t1-gemini-208.json` | 3 | `geschütztere` → `geschützter` | **A** |

### A2 — A candidatos (muestra)

| Archivo | Issue | Cat. |
|---------|-------|------|
| `horen-t4-cur-society.json` Q2 | `der Radiointerview` → `dem Radiointerview` | **A** |
| `lesen-t3-cur-society.json` Q0–4 | `ins Tennisverein` (×5, mismo batch) | **A** — Kasus/Präposition |

Resto A2 questions: mayoría **D** (`DE_CASE` en explicaciones con citas, comillas Hören, `EIN_BISSCHEN`).

### B1 — patrón A en questions (222 candidatos, no aplicados en parte 4)

Patrones repetidos:
- Capitalización sustantivo en explanation: `geschäften`→`Geschäften`, `konflikten`→`Konflikten`
- Concordancia: `eine Probleme`→`einem Problem`, `Eine Problem`→`Ein Problem`
- Kasus: `einen günstigen Unterkunft`→`einer günstigen Unterkunft`

**Veredicto B1 questions:** volumen alto (~219 archivos) — triage masivo pendiente tanda 3; no bloqueante para exámenes ya publicados (errores en explicaciones, no en claves).

---

## Ruido / D dominante

| Regla | B1 questions | Notas |
|-------|--------------|-------|
| `GERMAN_SPELLER_RULE` | ~3800+ brutos | Muchos nombres propios/marcas en opciones MCQ |
| `DE_CASE` | ~1100+ | FP en `Name:` diálogos dentro de options Hören T3 |
| `FEHLERHAFTES_KOMMA_ALLG` | 12 | transcripciones — **D** |
| `EIN_BISSCHEN` / `ETWAS_GUTES` | estilo | ignorar |

---

## Deuda técnica anotada (sin acción)

| ID | Item |
|----|------|
| **SEP-VOCAB-TAG-GAP** | Enrich retroactivo `vocabularyTags` para separables — cat. **B**, baja prioridad |
| **LT-FULL-TRIAGE-B1** | 222× A candidatos en questions B1 — triage determinista tanda 3 |
| **LT-DOCKER-LOAD** | concurrency >1 tumba LT Docker; usar concurrency 1 en auditorías bulk |

Registro: `GERMAN-LANGUAGE-DEBT-REGISTRY-2026-08-02.md`

---

## Prompt gaps (questions)

- Explanations MCQ: checklist concordancia (`ein Problem`, `einer Unterkunft`, sustantivos capitalizados).
- A2 Lesen T3: evitar `ins` + Akkusativ falsch en opciones repetidas.
- Hören options: no embedder líneas `Tim: …` completas en MCQ si dispara FP DE_CASE.

---

## Veredicto parte 4

| Item | Estado |
|------|--------|
| Extensión LT a questions | ✅ implementada y escaneada 679 archivos |
| Evidencia JSON 3 niveles | ✅ |
| Fixes A auto-aplicados | ❌ fuera de alcance (solo diagnóstico; fixes A tanda 2 ya commiteados) |
| SEP-VOCAB-TAG-GAP | 📝 deuda, sin acción |
