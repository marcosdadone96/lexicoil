# Auditoría funcional A2 & B2 — tanda 3 (diagnóstico)

**Fecha:** 2026-08-07  
**Alcance:** `de.A2` y `de.B2` — misma matriz que `B1-FUNCTIONAL-AUDIT-2026-08-02.md`, **adaptada al alcance real** de cada nivel  
**Tipo:** auditoría funcional (producto + contenido publicado + pool); **sin fixes**  
**Entorno:** repo local `lexiloop`, Node v24.15.0, Windows  
**Referencia B1:** `B1-FUNCTIONAL-AUDIT-2026-08-02.md` (cerrada 2026-08-02)

---

## Resumen ejecutivo

| # | Área | A2 | B2 | Nota vs B1 |
|---|------|----|----|------------|
| 1 | Exámenes (mock / oficial / personalizado) | ⚠️ | ⚠️ | A2 curated-only; B2 beta oculto por defecto |
| 2 | Vocabulario E2E | ⚠️ | ⚠️ | Misma UI; personalizado/vocab-bg A2 bloqueado en manifest |
| 3 | Juegos | ✅ | ✅ | Sin gate por nivel en lógica |
| 4 | Conjugación | ⚠️ | ⚠️ | Igual que B1 — integrada, sin juego dedicado |
| 5 | Verbos separables | ✅ | ✅ | Runtime compartido; gloss FR sigue vacío |
| 6 | Traducciones UI | ⚠️ | ⚠️ | Mismas superficies que B1 |
| 7 | Precisión gramatical / alineación | ⚠️ A2 pool | ✅ B2 pub | CHK-H2 solo A2; published A2/B2 CHK-34 limpio |

**Veredicto global:** A2 tiene **producto parcial live** (1 examen oficial curated, sin personalizado). B2 tiene **pipeline y wiring verificados** pero **no ofrecido en UI** (`status: beta`, `isExamLevelOffered` false sin flag). El pool A2 acumula **8 CRITICAL CHK-H2-ALIGN** en Hören T2 gemini (no afectan al único examen live curated).

---

## Matriz de alcance — qué existe en cada nivel

Fuente primaria: `data/exams/availability.json` + `js/library/levelAvailability.js` (ejecutado 2026-08-07).

| Flag / feature | B1 | A2 | B2 |
|----------------|----|----|-----|
| `status` | live | live | beta |
| Ofrecido en UI (`isExamLevelOffered`) | ✅ | ✅ | ❌ (✅ con `LEXICOIL_SHOW_BETA_LEVELS=1`) |
| Exámenes oficiales published (catálogo) | 16–19 | **1** (`e1`) | **1** (`e1`) |
| JSON published en disco | 19 | **4** (e1–e4; e2–e4 **fuera de catálogo**) | 1 |
| `personalized` | true | **false** | true (default) |
| `quickModules` | true | **false** | true |
| `aiFeatures` | true | **false** | true |
| `curatedOnly` | false | **true** | false |
| `poolPreview` (free curated/mes) | — | **4** | — |
| Mock demo (`goetheDemoExams`) | ✅ | ✅ | ✅ |
| Weakness 70/30 (`test-personalized-7030`) | ✅ testeado | ⚙️ código genérico, test solo B1 | idem |
| Vocab-bg pipeline | ✅ prod B1 | ⚙️ código OK (`test-vocab-bg-a2-level`) | ⚙️ sin test dedicado |
| Vía B Schreiben/Sprechen AI live | bloqueada (`EXAM_POOL_ONLY`) | bloqueada | bloqueada |
| Modular grading Goethe | modular | **whole-exam** (45/75 + 15/25) | modular |
| CHK-H2-ALIGN (Hören T2 picture) | N/A | **sí** | N/A |
| Grammar tags test dedicado | no | `a2-grammar-tags.test.mjs` | `b2-grammar-tags.test.mjs` |
| Pool-verified (archivos) | 542+ | **134** | **13** |

**Huecos de producto (esperados vs pendientes):**

| Hueco | ¿Esperado? | Acción futura |
|-------|------------|---------------|
| A2 sin personalizado / quick / AI | **Sí** — manifest explícito | Habilitar flags cuando pool + QA listos |
| B2 beta oculto | **Sí** — pre-launch | Flag beta o `status: live` |
| A2 e2–e4 published sin catálogo | **No** — drift deploy | Publicar en `_catalog.json` o borrar huérfanos |
| B2 `availability.exams: 3` vs 1 published | **No** — manifest stale | Alinear manifest |
| Fixture `horen-a2-t2-picture-matching-smoke.json` missing | **No** — test roto | Restaurar fixture o skip documentado |

---

# PARTE A — A2

## A2-1. Flujo de exámenes

**Veredicto: ⚠️**

### Oficial (curated live)

| Evidencia | Resultado |
|-----------|-----------|
| `library/published-exams/de/A2/_catalog.json` | **1 examen live:** `official-de-A2-e1` |
| Disco | **4 JSON** (e1–e4); **e2–e4 no están en catálogo** |
| `audit-published-vs-assembled.mjs --level A2` | **4/4 SYNC**, quarantine=0 |
| Partes en e1 (live) | 13 celdas curated (`lesen-t1-cur-education` … `sprechen-cur-education-t3`) |
| Hören T2 en e1 | `horen-t2-cur-society` (curated, **no** gemini con CHK-H2) |
| `test-goethe-a2-modellsatz.mjs` | **PASS** |
| `test-module-grading.mjs` | **PASS** — A2 whole-exam 45/75 + 15/25 |

### Práctica / mock

| Evidencia | Resultado |
|-----------|-----------|
| `goetheDemoExams.js` | `buildA2()` existe |
| `test-exam-engine-e2e.mjs --dry` | Solo casos **B1** — sin smoke A2 dedicado |
| `test-personalized-7030.mjs` | **PASS** — tags B1 hardcoded; motor genérico |

### Personalizado — **NO APLICA (bloqueado)**

| Evidencia | Resultado |
|-----------|-----------|
| `availability.json` | `de.A2.personalized: false`, `aiFeatures: false` |
| `levelAvailability.isPersonalizedAllowed('de','A2')` | **false** |
| `examConfig.js` | toast «Personalized practice for A2 is coming soon…» |
| `test-vocab-bg-a2-level.mjs` | **PASS** — plan A2, 13 smoke cells, 75 seed records |
| `verify-personal-pool-phase-c.mjs` | **PASS** — infra B1-centric; no desbloquea A2 en UI |

### Acceso free curated

| Evidencia | Resultado |
|-----------|-----------|
| `test-a2-exam-access.mjs` | **FAIL** L62 — `curatedStandardExamsThisMonth` devuelve 0 vs 1 esperado |
| Diagnóstico | **Drift test/harness** (filtro fecha `toLocaleDateString` vs `getMonthKey`), no regresión de producto verificada en browser |
| Lógica esperada | Free A2: hasta **4** exámenes curated/mes (`poolPreview: 4`), bypass quota global |

### Tests correlacionados A2 exámenes

```
test-goethe-a2-modellsatz.mjs     PASS
test-a2-exam-access.mjs            FAIL (harness L62)
test-a2-gates-integration.mjs      PASS
audit-published-vs-assembled A2    PASS 4/4 SYNC
test-module-grading.mjs            PASS (A2 whole-exam)
test-exam-validator.mjs            PASS (incl. blueprints)
```

---

## A2-2. Vocabulario

**Veredicto: ⚠️**

| Evidencia | Resultado |
|-----------|-----------|
| `test-saved-vocab-quizzes.mjs` | **PASS** — level-agnostic |
| Flashcards `sourceLevel` | Persiste nivel (`goalStore.js`, `flashcards.js`) |
| Validación lemma | `ManualVocab.validate(word, subject, **level**)` — usa banco del nivel activo |
| Personalizado desde vocab | **Bloqueado** si goal A2 (`isPersonalizedAllowed`) |
| Vocab-bg A2 | Código OK; **no reachable** en prod con flags actuales |

**Gap vs B1:** sin smoke browser A2 save→deck→quiz; sin evidencia quota personal Lesen A2.

---

## A2-3. Juegos

**Veredicto: ✅**

| Juego | Test | Resultado |
|-------|------|-----------|
| Quiz | `test-saved-vocab-quizzes.mjs` | PASS |
| Listening | `test-horen-game.mjs` | PASS |
| Phrases | (incl. en vocab quiz utils) | PASS vía B1 suite |
| Vocab-bg counter | `test-vocab-bg-e2e.mjs` | PASS — lógica B1; A2 plan en test dedicado |

Sin filtro de nivel en `test-horen-game.mjs`. UI usa `goal.level || S.level || 'B1'` como default si no hay goal — **riesgo UX** si usuario A2 sin goal seteado cae a banco B1 al añadir manual.

---

## A2-4. Conjugación

**Veredicto: ⚠️** (paridad B1)

| Evidencia | Resultado |
|-----------|-----------|
| `verify-conjugation-dwds.mjs` | **PASS** 10/10 separables |
| `verbConjugation.separable-present.test.mjs` | **PASS** 175/175 |
| Juego dedicado | **No existe** — panel en flashcards |

---

## A2-5. Verbos separables

**Veredicto: ✅**

| Evidencia | Resultado |
|-----------|-----------|
| `test-b1-separable-finite-split.mjs` | **PASS** 19+10 — runtime compartido |
| `separable-dwds-expand.test.mjs` | PASS (suite B1) |
| `separable-ui-langs-fr-it.test.mjs` | **PARTIAL offline** — FR gloss 0/125; live requiere `:8888` |
| Enrich pool A2 | `INSEPARABLE_INFINITIVES` compartido |

Ejemplo publicado: e1 no indexado aquí; pool A2 Hören usa separables en opciones (auditoría preventiva previa).

---

## A2-6. Traducciones UI

**Veredicto: ⚠️** (paridad B1)

| Superficie | Idiomas |
|------------|---------|
| Vocab / juegos | en, es, fr, it |
| Exam UI | de, en, es |
| Separable gloss FR | **0 entradas** — deuda SEP-GLOSS-FR |

| Test | Resultado |
|------|-----------|
| `test-vocab-ui-lang.mjs` | **PASS** |
| `separable-ui-langs-fr-it.test.mjs` | FAIL offline (API :8888) |

---

## A2-7. Precisión gramatical y alineación

**Veredicto: ⚠️** (published OK; pool Hören T2 con deuda)

### Published live (e1)

| Scan | Resultado |
|------|-----------|
| CHK-34 (`smoke-a2-b2-chk34-published.mjs`) | **45 preguntas, 0 CRITICAL, 4 MINOR** |
| Mojibake 4 JSON | **0 hits** |
| Grammar tags e1 (top) | `g-de-a2-praesens`×13, `g-de-a2-modal`×5, … |
| `a2-grammar-tags.test.mjs` | **PASS** — 7 IDs A2, sin bleed B1 |
| `horen-t2-a2-grammar.test.mjs` | **PASS** 12/12 |

### Pool (134 archivos)

| Scan | Resultado |
|------|-----------|
| `audit-pass-2.mjs pool-verified/A2 --fail-on=CRITICAL` | **8 CRITICAL**, 33 IMPORTANT, 441 MINOR |
| Check dominante | **CHK-H2-ALIGN** — Hören A2 T2 picture_matching (5 archivos gemini, ej. `horen-t2-gemini-104/106`) |
| Parte published `horen-t2-cur-society` | **0 CRITICAL** audit individual |

**Conclusión:** el examen **live** no incluye partes gemini con CHK-H2 roto; la deuda está en **stock pool** para futuros ensamblados.

### A2-only: CHK-H2-ALIGN

Aplica **solo** `level === 'A2' && horen && teil === 2` (`audit-pass-2.mjs` L1263). B1 no tiene este check; B2 Hören T2 no es picture_matching.

---

# PARTE B — B2

## B2-1. Flujo de exámenes

**Veredicto: ⚠️**

### Oficial

| Evidencia | Resultado |
|-----------|-----------|
| `_catalog.json` | **1 live:** `official-de-B2-e1` |
| `availability.json` | `status: beta`, `exams: 3` (**manifest ≠ disco**) |
| `isExamLevelOffered('de','B2')` | **false** (true con beta flag) |
| `audit-published-vs-assembled.mjs --level B2` | **1/1 SYNC** |
| Partes e1 | 13 gemini (`lesen-t1-gemini-208` … `sprechen-t2-gemini-019-t2`) |
| `test-goethe-b2-modellsatz.mjs` | **PASS** |
| `test-module-grading.mjs` | **PASS** — B2 modular |

### Routing / wiring (pre-launch)

| Test | Resultado |
|------|-----------|
| `b2-lesen-routing.test.mjs` | **PASS** |
| `b2-horen-routing.test.mjs` | **PASS** |
| `b2-schreiben-routing.test.mjs` | **PASS** |
| `b2-sprechen-routing.test.mjs` | **PASS** |
| `b2-sprechen-quality.test.mjs` | **PASS** |
| `b2-wiring-trace.mjs` | **PASS** |

### Personalizado / mock

| Evidencia | Resultado |
|-----------|-----------|
| Manifest | `personalized: true` (default) — **pero nivel no ofrecido** |
| Quick modules | `true` en manifest |
| `test-exam-engine-e2e` | Sin casos B2 |
| `EXAM_POOL_ONLY=true` | Vía B AI bloqueada igual que B1 |

---

## B2-2. Vocabulario

**Veredicto: ⚠️**

Misma stack que B1/A2. **Banco B2:** diseño parcial (~44 lemmas seed, sin DWDS Goethe B2 — ver `B2-VOCAB-BANK-DESIGN-2026-08-02.md`). Sin test vocab-bg B2 dedicado.

---

## B2-3. Juegos

**Veredicto: ✅** — mismos tests level-agnostic que A2 §A2-3.

---

## B2-4. Conjugación

**Veredicto: ⚠️** — paridad B1 §1-4.

---

## B2-5. Verbos separables

**Veredicto: ✅** — runtime compartido; sin regresión B2-specific en tests.

---

## B2-6. Traducciones UI

**Veredicto: ⚠️** — paridad B1; SEP-GLOSS-FR pendiente.

---

## B2-7. Precisión gramatical y alineación

**Veredicto: ✅** (published); **⚠️** pool fino

### Published e1

| Scan | Resultado |
|------|-----------|
| CHK-34 | **64 preguntas, 0 CRITICAL, 1 MINOR** |
| Mojibake | **0** |
| Grammar tags (top) | `g-de-b2-nominal`×26, `g-de-b2-passiv`×8, … |
| `b2-grammar-tags.test.mjs` | **PASS** |

### Pool (13 archivos)

| Scan | Resultado |
|------|-----------|
| `audit-pass-2.mjs pool-verified/B2 --fail-on=CRITICAL` | **0 CRITICAL**, 3 IMPORTANT, 3 MINOR |
| IMPORTANT | estructura/metadata (CHK-6, etc.) |
| CHK-34 pool | 1 MINOR (`horen-t4-gemini-040`) |

**CHK-H2-ALIGN:** no aplica a B2.

---

# PARTE C — Batería de tests ejecutada (2026-08-07)

## PASS (26)

```
test-goethe-a2-modellsatz.mjs
test-goethe-b2-modellsatz.mjs
test-a2-gates-integration.mjs
test-vocab-bg-a2-level.mjs
test-horen-a2-t1-template.mjs
test-sprechen-partner-a2-calibration.mjs
a2-grammar-tags.test.mjs
horen-t2-a2-grammar.test.mjs
b2-grammar-tags.test.mjs
b2-sprechen-routing.test.mjs
b2-lesen-routing.test.mjs
b2-horen-routing.test.mjs
b2-schreiben-routing.test.mjs
b2-sprechen-quality.test.mjs
b2-wiring-trace.mjs
test-saved-vocab-quizzes.mjs
test-horen-game.mjs
test-vocab-ui-lang.mjs
verify-conjugation-dwds.mjs
test-b1-separable-finite-split.mjs
test-module-grading.mjs
test-mastery-tracking.mjs
test-production-eval.mjs
test-exam-validator.mjs
test-personalized-7030.mjs
verify-personal-pool-phase-c.mjs
audit-published-vs-assembled A2/B2
smoke-a2-b2-chk34-published.mjs
verify-a2topics-browser-collision.mjs  (RESOLVED — A2Topics OK)
```

## FAIL / PARTIAL (4)

| Test | Resultado | Diagnóstico |
|------|-----------|-------------|
| `test-a2-exam-access.mjs` | **FAIL** L62 | Drift contador curated/mes en harness |
| `test-horen-a2-picture-matching.mjs` | **FAIL** ENOENT | Falta `batches/fixtures/horen-a2-t2-picture-matching-smoke.json` |
| `separable-ui-langs-fr-it.test.mjs` | **PARTIAL** | Offline OK except FR gloss; live necesita `:8888` |
| `audit-pass-2 A2 pool` | **FAIL** `--fail-on=CRITICAL` | 8× CHK-H2-ALIGN en gemini Hören T2 (no en live e1) |

## No corrido / no aplica

| Item | Motivo |
|------|--------|
| Browser E2E A2/B2 official | Fuera de scope tanda 3 (solo B1 smoke 2026-08-02) |
| Gemini live Schreiben/Sprechen | `EXAM_POOL_ONLY` + no solicitado |
| `test-exam-engine-e2e` A2/B2 | Solo casos B1 en script |
| `test-production-eval` A2/B2 | Payload hardcoded B1 |

---

# PARTE D — Smokes mínimos propuestos (siguiente tanda)

1. **A2 browser:** cargar `official-de-A2-e1`, 1 ítem/módulo, submit → historial (`lc_hist`).
2. **A2 free curated:** 4º examen del mes → bloqueo coherente con `poolPreview: 4`.
3. **B2 beta:** con `LEXICOIL_SHOW_BETA_LEVELS`, cargar e1, verificar modular grading UI.
4. **Vocab A2:** guardar palabra desde e1 con goal A2 → flashcard `sourceLevel: A2`.
5. **Restaurar fixture** picture-matching + re-run `test-horen-a2-picture-matching.mjs`.
6. **Catálogo A2:** decidir e2–e4 (publicar o eliminar huérfanos).

---

# Apéndice — Artefactos

| Artefacto | Path |
|-----------|------|
| CHK-34 A2/B2 published | `smoke-a2-b2-chk34-published-2026-08-07.json` |
| Script CHK-34 | `scripts/dev/smoke-a2-b2-chk34-published.mjs` |
| A2Topics collision | `a2topics-browser-collision-verify-2026-08-02.json` |
| Catálogo A2 | `library/published-exams/de/A2/_catalog.json` |
| Catálogo B2 | `library/published-exams/de/B2/_catalog.json` |
| Availability | `data/exams/availability.json` |
| Madurez celdas | `CELL-MATURITY-AUDIT-A2-B2.md` |
| Deuda idioma | `GERMAN-LANGUAGE-DEBT-REGISTRY-2026-08-02.md` |
| Referencia B1 | `B1-FUNCTIONAL-AUDIT-2026-08-02.md` |

---

## Cierre tanda 3 — aclaraciones (2026-08-07)

### B2 `exams: 3` → corregido a `1`

| Pregunta | Respuesta |
|----------|-----------|
| ¿Existieron e2/e3? | **No** — `git log` nunca tuvo `official-de-B2-e2/e3.json`. Solo `e1` desde baseline. |
| ¿Placeholder futuro? | **Sí, aspiracional** — `exams: 3` copiado del patrón A1/C1 beta (`52b670e`, jul-2025) sin contenido. |
| Acción | `data/exams/availability.json` → **`exams: 1`** (alineado con `_catalog.json` + único JSON). |

### A2 e2–e4: SYNC pero fuera de catálogo

| Hecho | Detalle |
|-------|---------|
| Estado en disco | `official-de-A2-e{2,3,4}.json` — `status: live`, `gate1.ok`, **100% A2** (re-ensamblados jul-27) |
| SYNC assembled | `audit-published-vs-assembled` 4/4 OK |
| Por qué no visibles | **Política de producto explícita:** `_catalog.json` + `de_A2.json` + `availability.exams: 1` + `verify-a2-app-catalog.mjs` exigen **1 solo examen live** |
| Historia | Jul-22: e2–e5 en cuarentena eran 100% B1. Jul-27: re-publish e2/e4 (evidencia `a2-horen-t3-e2-e4-close-evidence.json`) a `library/published-exams/` pero **sin actualizar catálogo ni overlay app** |
| ¿Desaprovechados? | **Sí, contenido listo** — Hören T2 usa `-cur-*` (sin CHK-H2). Publicar = actualizar `_catalog.json`, `de_A2.json`, `availability.exams`, y relajar `verify-a2-app-catalog.mjs` |
| CHK-34 e2–e4 | Pendiente scan individual; e1 = 0 CRITICAL |

### Pre-launch Personalizado A2 (bundle P0)

Condiciones **todas** requeridas antes de `de.A2.personalized: true`:

1. **vocab-bg bundle** — plantillas A2/B2 en `netlify.toml` included_files + evidencia prod (`--dry-plan`, blob quota, publish vocab-bg-pipeline).
2. **CHK-H2-ALIGN pool** — `audit-pass-2 batches/ready/pool-verified/A2 --fail-on=CRITICAL` limpio en celda Hören T2 gemini (hoy: **5 archivos, 7 CRITICAL**).
3. *(Recomendado mismo bundle)* CHK-34 CRITICAL pool Hören T3 gemini — hoy 1× en `horen-t3-gemini-074`.

Registro: `GERMAN-LANGUAGE-DEBT-REGISTRY` → **CHK-H2-POOL-A2** · `PROJECT-STATE-AUDIT` §4 P0.

### 4 tests fallidos — infra vs funcional

| Test | Tipo | Una línea |
|------|------|-----------|
| `test-a2-exam-access.mjs` | **Infra/harness** | Assert L62 drift: contador `curatedStandardExamsThisMonth` vs fecha locale Windows — no reproduce bug producto verificado. |
| `test-horen-a2-picture-matching.mjs` | **Infra** | ENOENT fixture `batches/fixtures/horen-a2-t2-picture-matching-smoke.json` — archivo ausente, no fallo de lógica picture_matching. |
| `separable-ui-langs-fr-it.test.mjs` | **Infra (+ deuda conocida)** | Offline partial; live requiere `:8888`. FR gloss vacío = SEP-GLOSS-FR, no regresión runtime DE. |
| `audit-pass-2 A2 pool --fail-on=CRITICAL` | **Funcional real (pool)** | 8 CRITICAL reales en stock gemini — no bloquea live e1; **sí bloqueante Personalizado A2** (ver arriba). |

**Tanda 3: CERRADA** (diagnóstico + aclaraciones; manifest B2 corregido).

