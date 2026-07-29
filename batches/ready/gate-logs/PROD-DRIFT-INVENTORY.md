# Production drift inventory — `www.lexicoil.com/app.html`

Generated: `node scripts/audit-prod-html-vs-git.mjs`  
Machine JSON: [`prod-app-html-drift-inventory.json`](./prod-app-html-drift-inventory.json)

Baseline HTML: live fetch → `prod-app-html-www.html` (2026-07-29)

---

## Tier 1 — Referenced in prod HTML, **not in git** (commit en reconciliación)

| # | Path |
|---|------|
| 1 | `js/library/adminAccess.js` |
| 2 | `js/data/savedVocabPhrases.js` |
| 3 | `js/data/savedListeningGames.js` |
| 4 | `js/data/savedFlashcardSets.js` |
| 5 | `js/data/savedVocabPractice.js` |
| 6 | `js/ui/grammar/grammarDrill.js` |
| 7 | `js/data/examLevelLayout.js` |
| 8 | `js/data/personalTopicStock.js` |
| 9 | `js/data/personalTopicStockFactory.js` |
| 10 | `js/data/personalHorenTopicStock.js` |

**Total: 10 archivos.** (Los “6 scripts” anteriores + **4** del picker personal que también están en prod pero nunca se commitearon.)

---

## Tier 2 — Referenced in prod HTML, **en git pero contenido local ≠ HEAD** (36)

Estos **sí tienen commit**, pero el working tree (≈ prod CDN) no coincide con `HEAD`. **No van en el commit `chore: reconcile` (solo untracked)**; parte entra en el commit de Alcance B u otros commits temáticos.

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
`js/ui/exam/examConfig.js`  
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

Además **`index.html`** (tracked): prod ≈ working tree; **HEAD** sigue en `app.css?v=29`, sin topic stock, etc.

---

## Tier 3 — En CDN / disco, **no referenciado** en prod `app.html` hoy

| Path | Notas |
|------|--------|
| `js/data/a2Topics.js` | HTTP 200 en CDN; tag HTML pendiente → **Alcance B** |

---

## Tier 4 — Falsos positivos del parser

`#`, `demo`, `privacy`, `terms` — anchors/rutas landing, no assets bajo `js/` o `assets/`.

---

## Reconciliación commit (alcance)

- **Incluye:** Tier 1 (10 archivos) + `index.html` alineado a prod publicado (**sin** línea `a2Topics.js`).
- **Excluye:** Tier 2 (salvo que decidas un mega-commit “sync all modified” aparte).
- **Siguiente commit:** Alcance B = Tier 2 personal-vocab + `a2Topics` hunk + lo que falte de feature.

---

## Re-ejecutar auditoría

```bash
node scripts/audit-prod-html-vs-git.mjs
```

Opcional: comparar otros entrypoints (`admin.html`, `demo.html`) ampliando el script.
