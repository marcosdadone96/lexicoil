# Tier 2 divergence audit (HEAD vs local vs CDN prod)

Run: `node scripts/audit-tier2-divergence.mjs`  
JSON: [`tier2-divergence-audit.json`](./tier2-divergence-audit.json)

Base commit: `cd3f831` (Tier 1 reconcile)

---

## Resultado

| Clasificación | Count | Acción |
|---------------|-------|--------|
| `simple_prod_ahead` (local ≡ prod, HEAD older) | **35** | Reconciliación directa: commit working tree |
| `three_way_diverge` | **1** | Ver abajo — **no** es conflicto git↔git incompatible |

---

## Único caso marcado: `js/ui/exam/examConfig.js`

| Versión | SHA256 (norm) prefix | Tamaño (~chars) |
|---------|----------------------|-----------------|
| **HEAD** (`cd3f831`) | `2f0fdea47123` | 36 890 |
| **Prod CDN** | `a51facbb93f6` | 43 960 |
| **Working tree** | `e0bb01844f3d` | 44 177 |

**Causa (no divergencia contradictoria en git):**

- Prod y HEAD siguen la misma línea: `setConfigTopicChoice` usa solo `B1Topics.normalizeB1Topic`.
- El working tree local añade **7 líneas** de prep **Alcance B** (`A2Topics.normalizeA2Topic` cuando `level === 'A2'`) que **aún no están deployadas** en prod.

Diff local − prod (único hunk semántico):

```diff
-  const canon = B1Topics.normalizeB1Topic(value) …
+  const lv = goal.level …
+  if (lv === 'A2' && A2Topics.normalizeA2Topic) …
+  else if (B1Topics.normalizeB1Topic) …
```

**Resolución acordada con el espíritu Tier 2:**

- Tier 2 commit: **`examConfig.js` = contenido prod CDN** (igual que los otros 35).
- Alcance B commit: reaplica el hunk A2 + `a2Topics.js` + hunk `index.html`.

No hay evidencia de que alguien haya commiteado en `main` un `examConfig` distinto al que prod sirve; HEAD simplemente es más viejo y local tiene WIP de feature.

---

## 35 archivos — reconciliación simple (local ≡ prod)

`assets/css/app.css`  
`js/bootstrap/auth.js`  
`js/bootstrap/featureQuota.js`  
`js/bootstrap/nav.js`  
`js/bootstrap/state.js`  
`js/data/manualVocab.js`  
`js/data/personalLesenTopicStock.js`  
`js/data/publishedExamAdapter.js`  
`js/data/savedVocabQuizzes.js`  
`js/data/vocabQuizUtils.js`  
`js/engine/examRenumber.js`  
`js/engine/partTopicDetect.js`  
`js/engine/personalExamCoverage.js`  
`js/engine/separableResolve.js`  
`js/engine/sprechenBriefing.js`  
`js/engine/validation/CefrGate.js`  
`js/i18n/vocabModuleLocale.js`  
`js/library/AnalyticsStore.js`  
`js/library/HorenGame.js`  
`js/library/PracticeDictionary.js`  
`js/library/VocabBatching.js`  
`js/library/grammarCategories.js`  
`js/services/authClient.js`  
`js/services/claudeClient.js`  
`js/ui/exam/adminContentReview.js`  
`js/ui/exam/examGeneration.js`  
`js/ui/exam/examRunner.js`  
`js/ui/exam/results.js`  
`js/ui/exam/speakingConversation.js`  
`js/ui/exam/speakingFlow.js`  
`js/ui/mastery/masteryView.js`  
`js/ui/vocabulary/flashcards.js`  
`js/ui/vocabulary/tooltip.js`  
`js/ui/vocabulary/vocabPhrases.js`  
`js/ui/workspace/vocabHub.js`

---

## Nota sobre Alcance B en Tier 2

Varios de estos 35 **contienen** ya en prod el comportamiento personal-vocab / planModule (`claudeClient`, `examGeneration`, `examRunner`, `personalExamCoverage`, …). Tier 2 **no cambia prod**; solo alinea git con lo servido hoy. El commit **feature** Alcance B quedará pequeño si prod ya tenía casi todo — salvo lo que prod aún no tiene (`a2Topics` tag, normalización A2 en `examConfig`, y cualquier delta local−prod post-audit).
