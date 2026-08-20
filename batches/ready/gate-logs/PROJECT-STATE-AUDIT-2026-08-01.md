# Auditoría de estado del proyecto — B1 · A2 · B2

**Generado:** 2026-08-01T10:45:00+02:00  
**Alcance:** diagnóstico únicamente — **sin fixes aplicados** en este documento.  
**Evidencia JSON:** `full-state-snapshot-2026-08-01.json`, `cell-maturity-audit-a2-b2.json`, `audit-pass2-pool-{B1,A2,B2}-2026-08-01.json`

---

## Comandos ejecutados para esta auditoría

```bash
node scripts/audit-cell-maturity-a2-b2.mjs --json
node scripts/audit-full-state-snapshot.mjs
node scripts/audit-pass-2.mjs batches/ready/pool-verified/B1 --json --summary-only
node scripts/audit-pass-2.mjs batches/ready/pool-verified/A2 --json --summary-only
node scripts/audit-pass-2.mjs batches/ready/pool-verified/B2 --json --summary-only
git log -1 --oneline
git status --short | Measure-Object -Line
git diff --stat HEAD | Select-Object -Last 1
```

---

## 1. Madurez de contenido por celda (B1 + A2 + B2)

### Definiciones de tier

| Tier | Criterio |
|------|----------|
| ✅ **PUBLISHED_GEMINI** | ≥1 archivo `-gemini-` en `batches/ready/pool-verified/{nivel}/` |
| 🟡 **GENERATED_OK_NOT_IN_POOL** | Generación OK en cost-log pero 0 gemini en pool |
| 🔴 **ATTEMPTED_NEVER_PUBLISHED** | Intentos con rechazos masivos, 0 gemini publicado |
| 📦 **CURATED_ONLY** | Solo `-cur-`, sin gemini |
| ⚪ **NEVER_TOUCHED** | 0 archivos en pool-verified para esa celda |

**Stock:** `gemini` = partes generadas publicadas · `cur` = curated · `other` = batches legacy (`-batch-`, `-auto-`, `-claude-`, etc.)

### B1 — 15 celdas (blueprint Goethe B1)

| Módulo | Teil | Tier | Gemini | Cur | Other | **Total** |
|--------|------|------|--------|-----|-------|-----------|
| lesen | T1 | ✅ PUBLISHED_GEMINI | 51 | 0 | 1 | **52** |
| lesen | T2 | ✅ PUBLISHED_GEMINI | 36 | 0 | 1 | **37** |
| lesen | T3 | ✅ PUBLISHED_GEMINI | 20 | 0 | 20 | **40** |
| lesen | T4 | ✅ PUBLISHED_GEMINI | 50 | 0 | 1 | **51** |
| lesen | T5 | ✅ PUBLISHED_GEMINI | 42 | 0 | 3 | **45** |
| horen | T1 | ✅ PUBLISHED_GEMINI | 37 | 0 | 1 | **38** |
| horen | T2 | ✅ PUBLISHED_GEMINI | 46 | 0 | 1 | **47** |
| horen | T3 | ✅ PUBLISHED_GEMINI | 36 | 0 | 1 | **37** |
| horen | T4 | ✅ PUBLISHED_GEMINI | 33 | 0 | 1 | **34** |
| schreiben | T1 | ✅ PUBLISHED_GEMINI | 49 | 0 | 33 | **82** |
| schreiben | T2 | ⚪ NEVER_TOUCHED | 0 | 0 | 0 | **0** |
| schreiben | T3 | ⚪ NEVER_TOUCHED | 0 | 0 | 0 | **0** |
| sprechen | T1 | ✅ PUBLISHED_GEMINI | 24 | 0 | 45 | **69** |
| sprechen | T2 | ✅ PUBLISHED_GEMINI | 5 | 0 | 0 | **5** |
| sprechen | T3 | ✅ PUBLISHED_GEMINI | 5 | 0 | 0 | **5** |

**Resumen B1:** 13/15 celdas con gemini en producción local · **542 archivos** en `pool-verified/B1/` · Schreiben T2/T3 sin stock · Sprechen T2/T3 muy fino (5 partes/celda).

*Fuente:* `node scripts/audit-full-state-snapshot.mjs` → `b1Cells` en `full-state-snapshot-2026-08-01.json`.

### A2 — 13 celdas

| Módulo | Teil | Tier | Gemini | Cur | Cost OK/Fail | $ hist. | Rechazos |
|--------|------|------|--------|-----|--------------|---------|----------|
| lesen | T1 | ✅ PUBLISHED_GEMINI | 2 | 4 | 4/0 | 0.03 | 6 |
| lesen | T2 | ✅ PUBLISHED_GEMINI | **3** | 4 | 7/0 | 0.05 | 0 |
| lesen | T3 | 🟡 GENERATED_OK_NOT_IN_POOL | 0 | 4 | 2/0 | 0.03 | 0 |
| lesen | T4 | 🔴 ATTEMPTED_NEVER_PUBLISHED | 0 | 4 | 0/0 | 0 | **112** |
| horen | T1 | ✅ PUBLISHED_GEMINI | 8 | 4 | 12/0 | 0.22 | 0 |
| horen | T2 | ✅ PUBLISHED_GEMINI | 21 | 4 | 35/0 | 0.41 | 7 |
| horen | T3 | ✅ PUBLISHED_GEMINI | 17 | 4 | 53/0 | 0.50 | 2 |
| horen | T4 | ✅ PUBLISHED_GEMINI | 1 | 4 | 1/0 | 0.01 | 0 |
| schreiben | T1 | ✅ PUBLISHED_GEMINI | 2 | 4 | 4/0 | 0.02 | 1 |
| schreiben | T2 | 🟡 GENERATED_OK_NOT_IN_POOL | 0 | 0 | 1/0 | 0.01 | 0 |
| sprechen | T1 | ✅ PUBLISHED_GEMINI | 1 | 4 | 11/0 | 0.07 | 0 |
| sprechen | T2 | ✅ PUBLISHED_GEMINI | 1 | 0 | 13/0 | 0.06 | 0 |
| sprechen | T3 | ✅ PUBLISHED_GEMINI | 1 | 0 | 10/0 | 0.07 | 0 |

**Resumen A2:** 10 PUBLISHED_GEMINI · 2 GENERATED_OK_NOT_IN_POOL · 1 ATTEMPTED_NEVER_PUBLISHED · **97 archivos** en pool-verified (vs 92 al review externo de la mañana — +5 netos: lesen-t2-gemini 173/175/176, horen-t4-gemini-043, schreiben-gemini 057/058; −1 retirado: lesen-t3-gemini-053).

*Fuente:* `cell-maturity-audit-a2-b2.json` (regenerado 2026-08-01T08:42:14Z).

### B2 — 13 celdas

| Módulo | Teil | Tier | Gemini | Cur | Cost OK/Fail | $ hist. | Rechazos |
|--------|------|------|--------|-----|--------------|---------|----------|
| lesen | T1 | ✅ PUBLISHED_GEMINI | 1 | 0 | 1/0 | 0.01 | 6 |
| lesen | T2 | ✅ PUBLISHED_GEMINI | 1 | 0 | 0/0 | 0 | 0 |
| lesen | T3 | ✅ PUBLISHED_GEMINI | 1 | 0 | 0/0 | 0 | 0 |
| lesen | T4 | ✅ PUBLISHED_GEMINI | 1 | 0 | 0/0 | 0 | **112** |
| lesen | T5 | ✅ PUBLISHED_GEMINI | 1 | 0 | 0/0 | 0 | **105** |
| horen | T1 | ✅ PUBLISHED_GEMINI | 1 | 0 | 2/0 | 0.03 | 0 |
| horen | T2 | ✅ PUBLISHED_GEMINI | 1 | 0 | 1/0 | 0.02 | 7 |
| horen | T3 | ✅ PUBLISHED_GEMINI | 1 | 0 | 1/0 | 0.03 | 2 |
| horen | T4 | ✅ PUBLISHED_GEMINI | 1 | 0 | 3/0 | 0.03 | 0 |
| schreiben | T1 | ✅ PUBLISHED_GEMINI | 2 | 0 | 1/0 | 0 | 1 |
| schreiben | T2 | 🟡 GENERATED_OK_NOT_IN_POOL | 0 | 0 | 1/0 | 0 | 0 |
| sprechen | T1 | ✅ PUBLISHED_GEMINI | 1 | 0 | 1/0 | 0 | 0 |
| sprechen | T2 | ✅ PUBLISHED_GEMINI | 1 | 0 | 1/0 | 0 | 0 |

**Resumen B2:** 12 PUBLISHED_GEMINI · 1 GENERATED_OK_NOT_IN_POOL · **13 archivos** en pool-verified · stock mínimo (1 gemini/celda salvo schreiben T1=2).

---

## 2. Calidad real del contenido (más allá de gates automáticos)

Escaneos corridos hoy con los mismos checkers usados en la sesión (audit-pass-2, contentTopicCheck, metadataSchemaGate, lexical/anglicism/participle).

### 2.1 audit-pass-2 — pool-verified completo

| Nivel | Archivos | Preguntas | CRITICAL | IMPORTANT | MINOR | Clean | Cosmetic | Important files | Critical files |
|-------|----------|-----------|----------|-----------|-------|-------|----------|-----------------|----------------|
| **B1** | 542 | 2964 | **7** | **323** | 686 | 236 | 143 | 160 | 3 |
| **A2** | 97 | 445 | **9** | **29** | 273 | 35 | 44 | 12 | 6 |
| **B2** | 13 | 64 | **0** | **1** | 3 | 9 | 3 | 1 | 0 |

*Comando:* `node scripts/audit-pass-2.mjs batches/ready/pool-verified/{NIVEL} --json --summary-only`  
*Artefactos:* `audit-pass2-pool-{B1,A2,B2}-2026-08-01.json`

#### A2 — hallazgos CRITICAL accionables (6 archivos)

| Archivo | Check | Problema |
|---------|-------|----------|
| `horen-t1-cur-education.json` | CHK-4 | Balance MC: «b»=100% (adivinable) |
| `horen-t2-gemini-102.json` | CHK-H2-ALIGN | Claves Q3/Q4 no coinciden con diálogo |
| `horen-t2-gemini-103.json` | CHK-H2-ALIGN | Actividad Montag no mapea a ficha; clave Q5 errónea |
| `horen-t2-gemini-104.json` | CHK-H2-ALIGN | Clave Q4 errónea vs diálogo |
| `horen-t2-gemini-106.json` | CHK-H2-ALIGN | Actividades Donnerstag/Freitag no mapean |
| `horen-t3-gemini-074.json` | CHK-34 | Cita en explicación no coincide con opción correcta |

#### B1 — CRITICAL (muestra; 3 archivos en grupo critical)

| Archivo | Check |
|---------|-------|
| `horen-t1-gemini-005.json` | CHK-34 |
| `horen-t2-gemini-033.json` | CHK-34 |
| `lesen-t2-gemini-113.json` | CHK-34 |

**Top checks B1 por volumen:** CHK-14 (12 109 hits, mayormente INFO), CHK-32 (675), CHK-18 (96 IMPORTANT — caps/mayúsculas).

#### B2 — único IMPORTANT

| Archivo | Check | Problema |
|---------|-------|----------|
| `lesen-t1-gemini-208.json` | CHK-14 | Posible falso positivo «zu Nachrichten» en contexto nominal |

### 2.2 Topic mismatch (`contentTopicCheck` + política poolReady)

Política actual (`poolReadyCheck.mjs`): Hören T1 y Hören T3 A2 = **audit-only**; resto = **blocking** si mismatch.

| Nivel | Archivos pool | Con mismatch (cualquier pasaje) | **Blocking** (fallarían poolReady hoy) | **Audit-only** (flag, no bloquea) |
|-------|---------------|--------------------------------|----------------------------------------|-----------------------------------|
| **B1** | 542 | 339 (62.5%) | **32** | **37** |
| **A2** | 97 | 84 (86.6%) | **16** | **31** |
| **B2** | 13 | 9 (69.2%) | **0** | **1** |

**A2 blocking (16 archivos — lista completa re-scan 2026-08-01):**

```
horen-t4-cur-society.json
lesen-t2-cur-society.json, lesen-t2-cur-work.json
lesen-t3-cur-work.json
lesen-t4-cur-{education,health,society,work}.json
schreiben-cur-{education,health,society,work}.json
sprechen-cur-{education,health,work}.json
sprechen-t1-gemini-016.json
```

**Nota sobre los «21 archivos» del review externo (mañana):** el escaneo de las 09:19 reportó **21/92** archivos con `content_topic_mismatch` usando el detector batch/primer-pasaje (transcript sesión, Prioridad 2). Tras retirar `lesen-t3-gemini-053` y añadir partes nuevas, el re-scan con la misma política blocking/audit da **16 blocking + 31 audit-only**. La deuda sigue concentrada en `-cur-*` legacy y Lesen T4; Hören T1/T3 inflan el conteo pasaje-a-pasaje pero no bloquean publish.

**B1 — deuda oculta:** 32 archivos bloquearían `content_topic` si se regeneraran hoy con gates actuales; 339/542 tienen al menos un pasaje con mismatch léxico. B1 lleva meses en producción — el detector es ruidoso en Hören (textos cortos), pero **no es cero deuda**.

### 2.3 Checker léxico ampliado (sesión A/C)

| Scan | Scope | Resultado | Evidencia |
|------|-------|-----------|-----------|
| Anglicism raw blacklist | A2 pool (91 archivos) | **1 alerta real:** `Latecoming` en `lesen-t2-cur-work.json` | `a2-ac-close-anglicism-morphology-pool-scan-evidence-2026-08-01.json` |
| Anglicism morfología | A2 pool | **39 alertas / 27 archivos** — **95% FP** (palabras `-tion` alemanas); 2 TP (`Latecoming`, `Littering`) | mismo archivo |
| Participio sin auxiliar | Hören A2 (62 archivos) | **2 hits, 0 errores nuevos** — TP conocido `horen-t1-cur-health`; FP `bleibt geschlossen` | `a2-ac-close-participle-pool-scan-evidence-2026-08-01.json` |

### 2.4 Sellos de metadata QC

Campos esperados en gemini recientes: `_poolReadyAt`, `_publishedAt`, `_qcVersion`, `_balanceMcqVersion` (Lesen MCQ).

| Nivel | Archivos gemini (-cur excl.) | Sin `_poolReadyAt` | Sin `_publishedAt` | Sin `_qcVersion` | Sin `_balanceMcqVersion` (MCQ) |
|-------|------------------------------|--------------------|--------------------|------------------|--------------------------------|
| **B1** | 542 | **542/542** | **542/542** | **542/542** | 16/542 |
| **A2** | 57 | **57/57** | **57/57** | **57/57** | 0/57 |
| **B2** | 13 | **13/13** | **13/13** | **13/13** | 1/13 |

**Interpretación:** Los sellos `_poolReadyAt` / `_publishedAt` / `_qcVersion` **no existían en el esquema B1 histórico** — no implica que 542 partes B1 estén mal, sino que el pipeline no estampaba esos campos hasta generaciones recientes A2/B2. El bug de `_balanceMcqVersion` en Lesen (**coerceGeneratedLesenPart** descartaba metadata) fue corregido hoy en local; archivos previos no retroactivos.

### 2.5 Desajustes filename vs contenido (A2 curated)

Confirmados en review externo y re-verificados en `a2-pool-root-review-report.json` + scan actual:

| Archivo | Slug filename | topicTag / contenido real |
|---------|---------------|---------------------------|
| `lesen-t2-cur-education.json` | education | **Sport** (gimnasio) |
| `lesen-t2-cur-health.json` | health | **Reisen** (Parkhaus) |
| `lesen-t2-cur-work.json` | work | **Reisen** (Cinemaxx) + anglicismo Latecoming |

---

## 3. Estado de infraestructura — git vs producción

### 3.1 HEAD git vs Netlify producción

| Artefacto | Estado |
|-----------|--------|
| **HEAD local** | `0f99b5c` — `fix(netlify): unify admin-api and exam-part runtime included_files` |
| **Deploy 0f99b5c** | **ERROR** — `Skipped due to account credit usage exceeded` (2026-07-29) |
| **Producción activa** | Deploy `6a69c625` (2026-07-29T09:25Z) — **no incluye** commit 0f99b5c |
| **CLI deploy manual** | Forbidden (misma causa: créditos) |
| **Cola deploy (pendiente créditos)** | `0f99b5c` + commits 2026-08-01 + **fix `vocab-bg-generate-background` included_files** (A2/B2 plantillas + data banks) — ver §4 P0 Personalizado A2 |
| **Evidencia** | `deploy-0f99b5c-status-evidence.json` |

### 3.2 Precálculo índice texto personal B1

| Item | Estado |
|------|--------|
| Diseño | **Aprobado** — `PERSONAL-TEXT-INDEX-PRECOMPUTE-DESIGN-2026-07-29.md` |
| Implementación | **Sin implementar, sin deploy** (bloqueado por cuota Netlify) |
| Objetivo | Reducir `planModule` / `verifyPlanPicksText` bajo tope ≤10 s Free |

### 3.3 Drift adicional detectado hoy

| Área | En git/local | En producción | Riesgo |
|------|--------------|---------------|--------|
| Deploy unificado 0f99b5c | Commit en main | **No desplegado** | `separableResolve.js` / included_files mismatch persiste |
| `vocab-bg-generate-background` plantillas A2/B2 | Fix local `netlify.toml` (cola deploy) | Prod solo B1 plantillas | **Bloqueante Personalizado A2** — bg A2 rompe FS en runtime; B1 OK |
| Pool A2 nuevos (Lesen T2×3, Hören T4, Schreiben×2) | `pool-verified/A2/` local | **Desconocido** hasta sync Blobs/seed | Personalizado puede servir pool viejo |
| Hotfix sellos `normalizeBatch.mjs` | **Commitado** `430bb03` (2026-08-01) | Prod aún sin deploy | Commits locales ≠ prod hasta créditos |
| Fix `mcqDistinctCheck` (Stock/Etage) | **Commitado** `c5a41af` | Prod aún sin deploy | Idem |
| Fix anglicism gate disconnect | **Commitado** `20e1755` | Prod aún sin deploy | Idem |
| `lesen-t3-gemini-053` | Retirado → `needs-regeneration/` | Estaba en seed antes del retiro | Reconciliado localmente; prod puede tener stale hasta sync |
| Working tree sin commit | **~1829 paths** (1841 − 12 commiteados hoy) | — | Ver desglose §6.1 |

### 3.4 Commits de código de sesión (2026-08-01, sin deploy)

```
430bb03 fix(normalize): preserve metadata stamps in coerceGeneratedLesenPart
c5a41af fix(mcq): A2 Lesen T2 Stock/Etage mcq_distinct false positives
20e1755 fix(lexical): anglicism blocking uses raw patterns; expand blacklist
79095be fix(auto-sync): resolve per-Teil publish for A2 Schreiben
37ac8ee feat(prompt): A2 Lesen T2 prosa and MCQ anti-duplicate rules
```

### 3.5 Cambios locales de contenido (no commiteados; fix e9 aplicado en disco)

```
plantillas-lesen-a2/lesen-teil2.md     (+155 líneas prosa/MCQ rules)
scripts/lib/normalizeBatch.mjs         (preserve metadata stamps)
scripts/lib/mcqDistinctCheck.mjs       (A2 Stock/Etage fix)
scripts/lib/anglicismPolicy.mjs        (blocking vs morphology split)
batches/ready/pool-verified/A2/lesen-t2-gemini-{173,175,176}.json  (nuevos)
batches/ready/pool-verified/A2/horen-t4-gemini-043.json
batches/ready/pool-verified/A2/schreiben-gemini-{057,058}.json
batches/needs-regeneration/A2/lesen-t3-gemini-053.json  (retirado)
```

---

## 4. Deuda técnica consolidada (priorizada)

| P | Item | Evidencia | Urgencia | Por qué |
|---|------|-----------|----------|---------|
| **P0** | Deploy 0f99b5c bloqueado (créditos Netlify) | `deploy-0f99b5c-status-evidence.json` | **Alta** | Código en main ≠ prod; fixes de functions no llegan a usuarios |
| **P0** | **vocab-bg `included_files` sin plantillas A2/B2** — bloqueante **Personalizado A2** (no B1) | `netlify.toml` L12–15; diagnóstico 2026-08-01 §5 | **Alta** | Prod empaqueta solo `plantillas-*-b1/**`; `resolveBgLevelFromPending` puede elegir A2 → `loadExamTemplate` falla en bg. Fix en cola deploy 0f99b5c+. **Pre-launch A2:** evidencia real obligatoria (no solo «debería»): `--dry-plan`, quota blob `lastBgGenAt`/`bgGenLastError`, publish con `contributor: vocab-bg-pipeline` — mismo estándar que M15 (`m15-prod-blobs-live-check.mjs`). |
| **P0** | **CHK-H2-ALIGN en pool A2 Hören T2** — bloqueante **Personalizado A2** (mismo bundle pre-launch que vocab-bg) | `audit-pass-2.mjs` pool A2 2026-08-07: **7 CRITICAL** en 5 archivos gemini (`102`,`103`,`104`,`106` + ver abajo); no en e1 live (`-cur-` T2) | **Alta** | Claves picture_matching incorrectas → evaluación Hören T2 mal si el ensamblador personal elige gemini. **Gate:** `--fail-on=CRITICAL` limpio en celda `horen/T2` A2 antes de `personalized: true`. Archivos: `horen-t2-gemini-{102,103,104,106}.json`. *(+1 CRITICAL CHK-34 en `horen-t3-gemini-074` — misma regla de calidad, celda distinta.)* |
| **P1** | A2 Lesen T4 — 112 rechazos, 0 gemini | cell-maturity | **Alta** | Celda bloqueada; `content_topic` sin diseño (pausado hoy) |
| **P1** | 16 archivos A2 blocking topic + 3 Lesen T2 `-cur-` slug mismatch | §2.2, review externo | **Media-alta** | Visible en Personalizado; `-cur-` legacy en reusable-seed |
| **P1** | A2 Lesen T3 + Schreiben T2 — generated OK, no en pool | cell-maturity | **Media** | Pipeline probado; falta publish/smoke |
| **P1** | B1 Schreiben T2/T3 — NEVER_TOUCHED | §1 | **Media** | Hueco de producto en nivel production |
| **P2** | B2 stock fino (1 gemini/celda) + schreiben T2 sin pool | §1 | **Media** | Insuficiente para variedad/exámenes |
| **P2** | B2 banco vocabulario / rejected history (T4/T5: 112+105) | cell-maturity B2 | **Media** | Misma fricción que A2 Lesen T4 |
| **P2** | Detector morfología anglicism — 95% FP | anglicism scan | **Media** | No usar como gate duro hasta allowlist `-tion` |
| **P2** | Participio sin auxiliar — FP `bleibt + Partizip II` | participle scan | **Baja-media** | 1 TP confirmado; refinar antes de gate |
| **P2** | B1: 7 CRITICAL + 323 IMPORTANT en audit-pass-2 | audit-pass-2 B1 | **Media** | Producción madura pero no limpia — ver §6 (e9 corregido; e11 Q4 clave OK) |
| **P2** | Hören A2 T3: mencionar `audio[]` explícitamente en checklist inyectado (ya en plantilla/ejemplo) | auditoría preventiva 2026-08-01 | **Baja** | No bloquea generación; plantilla OK |
| **P2** | Stamps QC (`_balanceMcqVersion`, caps) en publish para módulos no-Lesen — evaluar `coerceGeneratedExamPart` o extender `partGateRunner` | auditoría preventiva 2026-08-01 | **Baja** | Lesen cubierto por `coerceGeneratedLesenPart`; Hören/Schreiben/Sprechen usan `normalizeBatch` directo |
| **HOLD** | A2 Lesen T4 `content_topic_mismatch` batch-level gate | `A2-LESEN-T4-CONTENT-TOPIC-DESIGN-2026-08-01.md` | **Alta** | No generar T4 hasta decidir/implementar Option B |
| ~~P2~~ | ~~243 paths código sin commit~~ | — | — | **Resuelto 2026-08-01** — 20 commits + doc T4 en `main` |
| **P3** | 21→16 archivos topic mismatch A2 (batch B/D pendiente) | review + re-scan | **Baja** | Operador pospuso; no hay tráfico masivo |
| **P3** | Precálculo índice B1 — diseño sin código | PRECOMPUTE design | **Baja** (hasta créditos) | Timeout planModule en Free |
| **P3** | `pool-fill-teil.mjs` sin `--topic` | smoke r6 hoy | **Baja** | Workaround: `generate-cli --topic` |
| **P3** | Sellos `_poolReadyAt`/`_qcVersion` ausentes en histórico B1 | §2.4 | **Baja** | Deuda de esquema, no funcional |

---

## 5. Costo Gemini — sesión y proyección

### 5.1 Sesión 2026-08-01 (hoy)

*Fuente:* `generation-cost.jsonl` filtrado `2026-08-01`

| Métrica | Valor |
|---------|-------|
| **Total USD** | **$0.6212** |
| Llamadas API | 134 |
| OK / Fail | 14 / 120 (**10.4%** tasa éxito por llamada) |
| Por módulo | lesen **$0.5765** · schreiben $0.023 · horen $0.0217 |
| Por celda | lesen:T2 **$0.4703** (111 calls) · lesen:T3 $0.1063 · horen:T4 $0.0217 · schreiben:T1 $0.0178 · schreiben:T2 $0.0052 |

**Partes publicadas hoy (OK con file):** lesen-t2-gemini 173/175/176 (3) · schreiben 057/058 (2) · horen-t4-gemini-043 (1) · + intentos parciales T3 ≈ **8 partes útiles** → **~$0.078/parte publicada** en ritmo de hoy (incluye retries).

### 5.2 Histórico acumulado (paths con nivel en filename)

| Nivel | USD acumulado (cost log) |
|-------|--------------------------|
| B1 | $5.44 |
| A2 | $1.49 |
| B2 | $0.13 |
| Sin nivel en path | $62.37 (mayoría B1 temprano) |
| **Total archivo** | **~$69.44** |

### 5.3 Proyección honesta — completar A2 y B2

**Supuestos explícitos:**

1. **Objetivo mínimo operativo:** ≥3 gemini/celda donde hoy hay 0–2 (smoke-ready).
2. **Objetivo densidad B1-like:** ~30–50 gemini/celda (B1 hoy: 20–51).
3. **Ritmo de hoy** para celdas difíciles (Lesen T2): ~11 llamadas/parte publicada, ~90% fail.

#### Escenario A — Mínimo (cerrar huecos críticos)

| Trabajo | Partes faltantes | Costo est. (@ $0.08/parte) | Costo est. (@ ritmo hoy $0.08–$0.47) |
|---------|------------------|----------------------------|--------------------------------------|
| A2 Lesen T3 publish | 1–3 | $0.08–0.24 | $0.25–1.40 |
| A2 Schreiben T2 publish | 1 | $0.08 | $0.08–0.25 |
| A2 celdas finas → 3 gemini (T1,T4 horen, schreiben T1, sprechen×3) | ~12 | $0.96 | $1–5 |
| A2 Lesen T4 (si se destraba diseño) | 3+ | $0.24+ | **$5–50+** (112 rechazos históricos) |
| B2 todas las celdas 1→3 gemini | ~26 | $2.08 | $3–12 |
| B2 schreiben T2 publish | 1 | $0.08 | $0.08–0.25 |
| **Subtotal Escenario A** | **~45 partes** | **~$3.50** | **~$5–70** (T4 domina rango) |

#### Escenario B — Densidad production (≈30 gemini/celda A2+B2)

| Nivel | Celdas | Gap a ~30 gemini | Partes | @ $0.08/parte | @ ritmo hoy (×3–5 por retries) |
|-------|--------|------------------|--------|---------------|--------------------------------|
| A2 | 13 | ~350 partes netas | 350 | **~$28** | **$85–140** |
| B2 | 13 | ~370 partes netas | 370 | **~$30** | **$90–150** |
| **Total B** | 26 | | **~720** | **~$58** | **$175–290** |

#### Escenario C — Solo lo pendiente «obvio» sin T4

Excluyendo A2 Lesen T4 y B2 T4/T5 con historial de rechazo masivo:

- ~40 partes × $0.08 = **~$3.20** optimista
- Con retries de hoy: **~$8–15**

**Conclusión de proyección:** Al ritmo de hoy, **no conviene extrapolar linealmente** — Lesen T2 consumió **75% del presupuesto diario** ($0.47/$0.62) en una celda. Completar A2+B2 a densidad B1 cuesta del orden de **$60–300** según fricción de T4/T5 y gates. El mínimo para destrabar celdas pausadas (T3, Schreiben T2, stock fino B2) es del orden de **$5–15** si se evita Lesen T4.

---

## 6. Addendum B1 — cierre 2026-08-01 (tarde)

### 6.1 Desglose working tree sin commit

| Categoría | Paths | Naturaleza |
|-----------|-------|------------|
| `batches/` | **1387** | Output generado (pool-verified, logs, assembled) — normal fuera de git |
| **Código real** (`scripts/`, `netlify/`, `js/`, `plantillas/`, `data/`, etc.) | **~305** | Trabajo previo no commiteado; **~243** solo en `scripts/` + `plantillas-lesen-a2/` |
| `landing/` build artifacts | **63** | `.next/`, `out/` |
| `library/` pool/published | **20** | seeds, published-exams (incl. fix e9 local) |
| Otros | **66** | admin.html, assets, staging |

**Commiteado hoy (sesión):** 12 archivos en 5 commits (§3.4). **Pendiente de resguardar:** ~243 paths de código de sesiones anteriores — ítem P2 en §4.

### 6.2 e11 Q4 — `lesen-t5-gemini-095.json` (examen oficial live)

**Pregunta:** Gemeinschaftsraum für Familienfeier mieten — ¿qué hay que hacer?

**Pasaje relevante (Raumnutzung):**
> «… ist eine **vorherige Reservierung notwendig**. Die Kosten … **müssen mindestens zwei Tage im Voraus bezahlt werden**.»

| Opción | Texto | ¿Correcta? |
|--------|-------|------------|
| **b** | «… **einen Tag** vorher reservieren und bezahlen» | **No** — el texto exige pago **dos días** antes, no uno |
| **c** | «… buchen und die Kosten **zwei Tage vorher** begleichen» | **Sí** — coincide con «mindestens zwei Tage im Voraus bezahlt werden» |

**Veredicto con certeza:** la clave **c es correcta**. El texto **no es ambiguo** en el plazo de pago. CHK-18b fue falso positivo por overlap léxico entre b y c (ambas mencionan reservar/pagar); b falla en el número de días. **No hay que corregir el examen en vivo** — solo la heurística del checker si se quiere endurecer.

Reservierung: el pasaje solo dice «vorherige Reservierung notwendig» sin fijar «un día» vs «dos días» para la reserva en sí; eso no invalida c, que acierta en el único plazo explícito (pago).

### 6.3 e9 — explicaciones CHK-34 corregidas (determinista, sin Gemini)

**Tipo de fix:** reescritura manual de 4 campos `explanation` citando la opción correcta literalmente. **Costo: $0.**

| Archivo | Preguntas | Archivos tocados |
|---------|-----------|------------------|
| `lesen-t2-gemini-113.json` | Q1, Q4, Q5 | `pool-verified/B1/` + `official-de-B1-e9.json` |
| `horen-t2-gemini-033.json` | Q2 | `pool-verified/B1/` + `official-de-B1-e9.json` |

**Nota deploy:** cambios en `library/published-exams/de/B1/official-de-B1-e9.json` son locales hasta sync/deploy; prod puede seguir sirviendo texto viejo hasta publicación.

---

## Anexo — archivos de evidencia

| Archivo | Contenido |
|---------|-----------|
| `full-state-snapshot-2026-08-01.json` | Stock B1, topic counts, audit-pass-2 summary, cost today |
| `cell-maturity-audit-a2-b2.json` | Maturity A2/B2 regenerado |
| `audit-pass2-pool-B1-2026-08-01.json` | Calidad B1 completa |
| `audit-pass2-pool-A2-2026-08-01.json` | Calidad A2 completa |
| `audit-pass2-pool-B2-2026-08-01.json` | Calidad B2 completa |
| `deploy-0f99b5c-status-evidence.json` | Estado deploy producción |
| `a2-ac-close-anglicism-morphology-pool-scan-evidence-2026-08-01.json` | Scan anglicismos |
| `a2-ac-close-participle-pool-scan-evidence-2026-08-01.json` | Scan participio |
| `generation-cost.jsonl` | Log costos Gemini (filtrar `2026-08-01`) |
| `CELL-MATURITY-AUDIT-A2-B2.md` | Formato referencia (A2/B2, pre-actualización T2) |

---

*Documento generado para decisión conjunta operador/producto antes de continuar generación o gasto API.*
