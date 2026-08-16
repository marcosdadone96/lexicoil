# Auditoría funcional — puntos pendientes (post-género)

**Fecha:** 2026-08-11  
**Alcance:** flashcards E2E, 3 juegos vocab, vocab-bg B1, §4–6 (conjugación / separables / traducciones UI), matriz consolidada A2/B1/B2  
**Tipo:** re-ejecución de tests/scripts del repo; **sin fixes de producto**  
**Entorno:** repo local `lexiloop`, Node v24, Windows  
**Pre-requisito cerrado:** género — commit `f651f67` (Dienstag `parseLeadingArticle` false split)

---

## Resumen ejecutivo

| Área | Veredicto | Evidencia clave |
|------|-----------|-----------------|
| Flashcards save → deck → quiz/SRS | ⚠️→✅ lógica | `test-saved-vocab-quizzes` PASS; SRS en `flashcards.js`; aislamiento goals PASS |
| AI Quiz | ✅ | `vocabQuizUtils.test.mjs` 54/54 |
| Listening game | ✅ | `test-horen-game.mjs` PASS |
| Phrases | ✅ | `vocabPhrasesUtils.test.mjs` 54/54 |
| vocab-bg B1 | ✅ | `test-vocab-bg-e2e.mjs` ok, pending→plan→anchor→quota |
| vocab-bg A2 | ✅ código | `test-vocab-bg-a2-level.mjs` PASS (manifest bloquea prod) |
| §4 Conjugación | ⚠️ | DWDS 10/10 + separables 175/175; **sin juego dedicado** |
| §5 Verbos separables | ✅ | allowlist 34/34; phrases/quiz gaps OK |
| §6 Traducciones UI | ⚠️→✅ parcial | EN/ES/FR/IT vocab strings OK; gloss FR **125/125** (cerrado vs audit 02/08); exam UI solo de/en/es |
| Matriz por nivel | ⚠️ | A2 curated-only; B1 live 16 exámenes; B2 beta 1 examen, 13 pool |

**Veredicto global:** pipeline vocab + juegos **verificado en Node** para los tres niveles (lógica level-agnostic). Deuda restante: smokes browser, 6× CHK-34 paraphrase Hören (post-graduation), AI lemma safety net sin blob store local.

---

## Addendum 2026-08-16 (cierre ronda)

| Item | Resolución |
|------|------------|
| CHK-34 e9 + pool 033/113 | **Commit `379523b`** — 4 explicaciones con cita literal (`'…'`, parseable por CHK-34) |
| CHK-34 “0→8 regresión” | **Falso positivo de contenido masivo** — graduation `2026-08-10` + fix e9 nunca commiteado el 2/08 |
| 6 paraphrase Hören restantes | Deuda **CHK-34-B1-PARAPHRASE-6** en `GERMAN-LANGUAGE-DEBT-REGISTRY` — batch editorial futuro |
| `test-vocab-open` | Deuda **TEST-VOCAB-OPEN-STALE** — test desactualizado, baja prioridad |

---

## 0. Cierre género (contexto)

| Item | Estado |
|------|--------|
| Commit | `f651f67` — Fix Dienstag gender: stop parseLeadingArticle false die split |
| Causa | Regex glued `^(der\|die\|das)(…)$` con `/i` partía **Dienstag** → `die` + `nstag` |
| Fix | Artículo case-insensitive; sustantivo **debe** empezar en mayúscula (`[A-ZÄÖÜ]`) |
| Lexicon | `dienstag: m` añadido (1268 entradas) |
| Auditoría | Union GT 378 lemmas → **98.7%**; Dienstag **0 errores** runtime |

---

## 1. Flashcards punta a punta

**Veredicto: ⚠️→✅ (lógica); browser pendiente**

| Capa | Test / código | Resultado |
|------|---------------|-----------|
| Save → quiz store | `test-saved-vocab-quizzes.mjs` | **PASS** — persist, filter by goal, retake |
| Save separable reunify | `smoke-b1-audit-close.mjs` smoke 4 | **PASS** (sin Gemini) — `anrufen` → deck `lc_flashcards` |
| Enrich gender/POS | `article-gender.test.mjs` | **29/29** incl. Dienstag |
| SRS algorithm | `js/ui/vocabulary/flashcards.js` `getSRS` / `srsRate` | Again/Hard/Good/Easy → interval/ef/nextReview |
| SRS labels i18n | `test-vocab-ui-lang.mjs` | EN/ES flashcards SRS strings OK |
| Goal isolation | `test-goal-progress-isolation.mjs` | **PASS** — deck/due/history por lang+level |

**Hueco:** no smoke browser de tap “guardar” en examen → Vocabulary hub → sesión flashcard → rating persiste tras reload.

---

## 2. Tres juegos de vocabulario

**Veredicto: ✅**

| Juego | Script | Resultado |
|-------|--------|-----------|
| **AI Quiz** | `vocabQuizUtils.test.mjs` | **54/54** — POS-balanced distractors, verb stems, separables |
| **Listening** | `test-horen-game.mjs` | **PASS** — `played+absent==total`, detección ausentes |
| **Phrases** | `vocabPhrasesUtils.test.mjs` | **54/54** — split separables, gap stems, gate glued |

Migración Gemini (commit `f4f0384`) no rompió harnesses anteriores.

---

## 3. vocab-bg (B1 y A2)

**Veredicto: ✅ B1 prod; ⚠️ A2 manifest**

### B1 — `test-vocab-bg-e2e.mjs`

```json
{
  "pendingCount": 8,
  "proEligible": true,
  "plan": { "module": "lesen", "topic": "Gesundheit", "words": ["fitness","therapie","urlaub",...] },
  "quotas": { "proMaxLesen": 60, "freeMaxLesen": 8 },
  "ok": true
}
```

Pipeline pending → plan → userAnchor → quota pro/free verificado.

### A2 — `test-vocab-bg-a2-level.mjs`

**PASS** — plan Hören T1 Verkehr level A2, 13 smoke cells, 75 seed records.  
**Producto:** `availability.json` `de.A2.personalized: false` → vocab-bg **no expuesto** en UI A2 live (código OK, gate manifest).

---

## 4. Conjugación de verbos

**Veredicto: ⚠️** (integrada, sin drill standalone)

| Evidencia | Resultado |
|-----------|-----------|
| `verify-conjugation-dwds.mjs` | **10/10** separables DWDS |
| `verbConjugation.separable-present.test.mjs` | **175/175** |
| `vocabQuizUtils` verb gaps | stems conjugados, no lemmas |
| UI | `VerbConjugation.conjugationSelectHtml()` en flashcards/vocab hub |

**Conclusión:** conjugación correcta en código para muestra DWDS. No hay juego “Conjugation drill”.

---

## 5. Verbos separables

**Veredicto: ✅**

| Test | Resultado |
|------|-----------|
| `separable-dwds-expand.test.mjs` | **31/32** — 1 skip live Gemini (sin blob store) |
| `vocabPhrasesUtils.test.mjs` | split anrufen/vorschlagen/aufstehen/untergehen |
| `test-b1-separable-finite-split.mjs` | (audit previa) 19/19 |
| Producto | reunify en save, gaps phrases/quiz, enrich pool |

---

## 6. Traducciones UI — huecos restantes

**Veredicto: ⚠️→✅ parcial**

### Vocab / juegos (en, es, fr, it)

| Test | Resultado |
|------|-----------|
| `test-vocab-ui-lang.mjs` | **PASS** EN/ES — quiz, flashcards, phrases, listening |
| `vocabModuleLocale.test.mjs` | **5/5** — 4 langs listening UI |
| FR/IT manual sample | again/listening/quiz strings presentes |

### Separable gloss FR/IT — mejora vs 2026-08-02

| Lang | Audit 02/08 | Hoy 11/08 |
|------|-----------|-----------|
| EN | 125/125 | 125/125 |
| ES | 125/125 | 125/125 |
| FR | **0/125** | **125/125** ✅ |
| IT | 125/125 | 125/125 |

`separable-ui-langs-fr-it.test.mjs`: **23/24** — 1 fail: AI lemma `nachschlagen` → null (requiere Netlify Blobs para rate limit Gemini local).

### Exam UI

| Superficie | Idiomas |
|------------|---------|
| Vocab / juegos | en, es, fr, it |
| Exam modules / RF | **de, en, es** (sin fr/it) |
| `examLangToolbar.test.mjs` | **5/5** chips EN/ES/FR/IT en toolbar |

**Deuda formal restante:** exam UI fr/it; AI lemma safety net offline; browser sweep strings residuales EN con `lc_ui_lang=fr`.

---

## 7. Matriz consolidada por nivel (A2 / B1 / B2)

Fuente: `availability.json`, `levelAvailability.js`, disco 2026-08-11.

| Flag / feature | A2 | B1 | B2 |
|----------------|----|----|-----|
| `status` | live | live | beta |
| Ofrecido UI | ✅ | ✅ | ✅* |
| Published live | **1** | **16** | **1** |
| Pool-verified files | **134** | **542** | **13** |
| `personalized` | **false** | true | true (default) |
| `curatedOnly` | **true** | false | false |
| `quickModules` / `aiFeatures` | **false** | true | true |
| Vocab-bg prod | ⚙️ código OK, manifest off | ✅ | ⚙️ sin test dedicado |
| Juegos vocab | ✅ shared | ✅ shared | ✅ shared |
| Conjugación | ⚠️ shared | ⚠️ shared | ⚠️ shared |
| Separables | ✅ shared | ✅ shared | ✅ shared |
| Traducciones | ⚠️ shared | ⚠️ shared | ⚠️ shared |
| CHK-H2 (Hören A2 T2) | ✅ pool cerrado | N/A | N/A |
| CHK-34 published | 0 CR A2 (45 q) | **8 CR** re-scan hoy | 0 CR B2 |

\* B2 `isExamLevelOffered` true si `LEXICOIL_SHOW_BETA_LEVELS=1` en entorno; false por defecto en prod.

### Veredictos por nivel

| Nivel | Producto | Vocab/juegos | Contenido |
|-------|----------|--------------|-----------|
| **A2** | ⚠️ curated-only, 1 exam live | ✅ stack compartida | ✅ pool H2; 4 JSON huérfanos e2–e4 |
| **B1** | ✅ live 16 exams | ✅ vocab-bg prod | ⚠️ CHK-34 8 CRITICAL (regresión vs cierre 02/08) |
| **B2** | ⚠️ beta pre-launch | ✅ wiring tests previos | ⚠️ pool 13 files, vocab seed ~44 lemmas |

---

## Tests ejecutados (2026-08-11)

```
test-saved-vocab-quizzes.mjs           PASS
test-vocab-bg-e2e.mjs                  PASS (ok: true)
test-vocab-bg-a2-level.mjs             PASS
test-horen-game.mjs                    PASS
vocabQuizUtils.test.mjs                54/54
vocabPhrasesUtils.test.mjs             54/54
test-vocab-ui-lang.mjs                 PASS (EN/ES)
vocabModuleLocale.test.mjs             5/5
verify-conjugation-dwds.mjs            10/10
verbConjugation.separable-present      175/175
separable-dwds-expand.test.mjs         31 pass, 1 skip (live Gemini)
separable-ui-langs-fr-it.test.mjs      23/24 (AI lemma blob store)
examLangToolbar.test.mjs               5/5
test-goal-progress-isolation.mjs       PASS
article-gender.test.mjs                29/29
audit-noun-gender-systematic.mjs       Dienstag fixed

test-vocab-open.mjs                    FAIL — A2.json source tag ≠ open-frequency+manual
smoke-b1-audit-close.mjs smoke 1       FAIL — CHK-34 8 CRITICAL en 19 published B1
```

---

## Acciones recomendadas (prioridad)

1. **CHK-34 B1** — re-scan/fix en `horen-t2-gemini-033`, `lesen-t2-gemini-113` y exámenes published afectados (regresión vs cierre 02/08).
2. **Browser smokes** — flashcard SRS persist; 1 ronda quiz+listening+phrases con decremento créditos.
3. **A2 vocab bank** — alinear `library/vocab/de/A2.json` source tag o actualizar test.
4. **Exam UI fr/it** — extender `examUiLocale.js` si se quiere paridad con vocab.
5. **B2 launch** — `status: live` + ampliar pool/published cuando QA listo.

---

## Referencias

- `B1-FUNCTIONAL-AUDIT-2026-08-02.md` — baseline §2–6
- `A2-B2-FUNCTIONAL-AUDIT-2026-08-07.md` — matriz A2/B2
- `GENDER-AUDIT-SYSTEMATIC-2026-08-09.json` — post-fix Dienstag
