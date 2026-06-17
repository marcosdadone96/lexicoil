# MIGRATION REPORT — 10_REFACTOR_GODFILES

**Status:** Complete  
**Date:** 2026-06-12  
**Scope:** Behavior-preserving structural refactor (no bundler, no feature changes)

## Qué cambió

### `appFeatures.js` (655 → ~175 ln shim)

Split into focused modules; shim keeps `window.*` contracts and load order:

| Module | Responsibility | Key `window.*` exports |
|--------|----------------|------------------------|
| `js/bootstrap/featureQuota.js` | Client quota sync, UI, modals | `applyServerQuota`, `getQuotaUsed`, `canGenerate`, `incQuota`, `updQuotaUI`, … |
| `js/bootstrap/featurePayments.js` | Stripe checkout, URL params | `activatePro`, `handleUrlParams` |
| `js/bootstrap/featurePdf.js` | PDF correction export | `buildPdfHtml`, `downloadCorrectionPdf` |
| `js/bootstrap/featureSpeaking.js` | AI speaking evaluation | `buildSpeakingEvalPrompt`, `evalSpeakingWithAI`, `renderSpeakingResultsHtml`, … |
| `js/bootstrap/featureFlashcards.js` | FC type filters/sort | `normWordType`, `filterCardsByType`, `sortFlashcardsByType`, … |
| `js/bootstrap/appFeatures.js` | Topic picker, loader, **`generateExam` orchestrator**, init wrapper | `pickExamTopic`, `setLoaderStep`, `generateExam`, `lcStrategyBEnabled` |

### Exam generation cascade

| Module | Role |
|--------|------|
| `js/ui/exam/examSources.js` | `fromPool`, `fromQuestionLibrary`, `fromExamLibrary`, `runExamSourceCascade` |
| `js/ui/exam/examValidation.js` | `validateExamCandidate` — single normalize + renderable + validator check |
| `js/bootstrap/appFeatures.js` | `generateExam()` ~35 ln orchestrator; AI path in `runAiExamPath()` helper |

Cascade order unchanged: **pool → question library → exam library → (Strategy B block) → AI**.

### Utilities

| Module | Role |
|--------|------|
| `js/ui/components/notify.js` | `window.notify(msg, type, ms)` — toast if available, else alert |
| `js/ui/components/debugLog.js` | `window.lcDebug` — gated by `DEBUG_LEXICOIL=1` or `localStorage.DEBUG_LEXICOIL` |

### `examGeneration.js`

- All `console.*` → `lcDebug.*` (10 call sites)
- `salvageJson` marked `@deprecated` (structured output phase 03)
- Personal exam pool path uses `validateExamCandidate`
- `selectLastExamFC` uses `notify` instead of toast/alert duplicate

### Other files — console gated

`init.js`, `auth.js`, `state.js`, `examRunner.js`, `claudeClient.js`, `ExamGenerator.js` — 21 production `console.*` call sites now behind `lcDebug`.

### `index.html`

New scripts inserted before dependents; `appFeatures.js` bumped to `v=25`, `examGeneration.js` to `v=2`.

## Decisiones tomadas

- **No bundler** — IIFE modules + script tags preserve SPA load-order contract.
- **`generateExam` stayed in shim** — it was in `appFeatures.js` (not `examGeneration.js`); cascade extracted to `examSources.js` per REFACTOR_MAP intent.
- **`lcToast` retained** — existing helper in `state.js` delegates to `showToast`; new code in feature modules uses `notify` for former toast/alert duplicates in `appFeatures`.
- **AI path not in cascade module** — `runAiExamPath()` stays in shim (server validation + pool contribute are orchestration concerns).
- **`debugLog.js` loads first** in the LexiCoil module block so all downstream scripts can use `lcDebug`.

## Riesgos / deuda introducida

- **Script order sensitivity** — new files must load before `appFeatures.js`; documented in `index.html`.
- **`quota.js` overlap** — legacy `js/bootstrap/quota.js` still defines overlapping globals; `featureQuota.js` overrides via later load in `appFeatures` chain (same as before when quota lived in appFeatures).
- **`salvageJson` still present** — deprecated but required until structured AI output is default (phase 03).
- **No browser E2E in CI** — parity verified via `npm run test:engine` dry runs, not live UI automation.

## Resultados de tests

**Comando(s):**

```bash
node scripts/test-exam-sources.mjs
npm run test:engine
```

**Resultado:** All green.

- `test-exam-sources.mjs`: cascade order, pool-over-library priority, Strategy B block, `validateExamCandidate`
- Full engine suite including exam validator, generators, strategy B, concurrency, Spanish exams, dry E2E

## Verificación manual

- [x] Same `window.*` surface preserved for quota, payments, PDF, speaking, flashcards, `generateExam`
- [x] Cascade source order unchanged
- [x] No new feature flags
- [ ] Optional: manual smoke in browser (`netlify dev`) — generate exam from pool/library/AI paths

## Próximos pasos / pendientes

- Remove `salvageJson` when structured engine output (phase 03) is universal
- Consolidate `quota.js` + `featureQuota.js` duplicate globals in a future cleanup
- Consider moving `runAiExamPath` + error helpers into `examSources.js` or `examOrchestrator.js` if shim grows again

## Feature flags tocados

None.

## File split map

```
appFeatures.js (655 ln)
├── featureQuota.js       (~145 ln)
├── featurePayments.js    (~75 ln)
├── featurePdf.js         (~65 ln)
├── featureSpeaking.js    (~95 ln)
├── featureFlashcards.js  (~70 ln)
└── appFeatures.js shim   (~175 ln)

examGeneration.js (697 ln, unchanged size — normalization/merge/personal exam)
├── examValidation.js     (new, shared helper)
└── examSources.js        (new, cascade)

Utilities
├── notify.js
└── debugLog.js
```
