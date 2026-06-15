# MIGRATION REPORT — 11_NAV_DEEPLINKS

**Status:** Complete  
**Date:** 2026-06-12  
**Scope:** Hash routing + navigation stack (no UI redesign)

## Qué cambió

### New: `js/bootstrap/router.js`

Hash-based router with explicit navigation stack:

| Route | Screen | Notes |
|-------|--------|-------|
| `#/` `#/dashboard` | `homeScreen` | Dashboard |
| `#/goal/:slug/exams` | `goalWorkspaceScreen` | Exams tab |
| `#/goal/:slug/vocab` | `goalWorkspaceScreen` | Vocabulary tab |
| `#/goal/:slug/progress` | `goalWorkspaceScreen` | Progress tab |
| `#/goal/:slug/config` | `examConfigScreen` | Personalized exam config |
| `#/goal/:slug/oral` | `oralPracticeScreen` | Oral practice (session restore) |
| `#/goal/:slug/deck` | `flashcardScreen` | Goal deck hub |
| `#/exam/:id` | `examScreen` | Deep-link / share saved exam |
| `#/exam/:id/results` | `resultsScreen` | Results snapshot |
| `#/review/:historyId` | `mistakeReviewScreen` | Mistake review |
| `#/flashcards` | `flashcardScreen` | Global deck (no goal filter) |
| `#/vocab-exam` | `vocabExamScreen` | Recovery prompt if no active quiz |
| `#/profile-setup` | `profileSetupScreen` | Profile setup |
| *(transient)* | `loadingScreen` | No URL (loader overlay) |

Legacy `#/workspace/:slug` → parsed as `#/goal/:slug/exams`.

**API:** `LcRouter.navigate`, `LcRouter.back`, `LcRouter.backLabel`, `LcRouter.replaceRoute`, `getShareableExamUrl()`, `syncExamRouteUrl()`, `parseAppRoute()`.

**Recovery UI:** Unknown routes / missing state show `nav-route-recovery` banner on dashboard (not silent `goHome()`).

### `js/bootstrap/nav.js` (before → after)

- **Removed:** `resolveNavBack()` 57-line if-else chain over `_vocabHub`, `_examConfig`, `_oralSession`, etc.
- **Added:** Stack-based `navBack()` → `LcRouter.back()`; labels from `_stack[n-2].label`
- **Kept:** Special case for vocab flashcards overlay inside workspace (`_navExitVocabFlashcards`)
- **Kept:** `show` / `hide` / `hideAll` / screen list unchanged

### Wired navigation → URL

| File | Change |
|------|--------|
| `workspaceUi.js` | `setWsTab` updates hash; `openGoalWorkspace` pushes history |
| `goalStore.js` | `updateWorkspaceUrl` delegates to router; removed duplicate `parseAppRoute` |
| `init.js` | Startup uses `parseAppRoute()`; hash listeners owned by router |
| `examConfig.js` | Config + deck hub → `#/goal/:slug/config` / `deck` |
| `examRunner.js` | `renderExam` → `#/exam/:id` |
| `saveExams.js` | Save syncs exam URL |
| `results.js` | Results → `#/exam/:id/results`; **Copy exam link** button |
| `mistakeReview.js` | `#/review/:historyId` |
| `oralPractice.js` | `#/goal/:slug/oral` when task rendered |

### CSS

Minimal `.nav-route-recovery` styles in `assets/css/app.css` (no layout changes).

### Tests

`scripts/test-nav-routes.mjs` — hash parsing + route table (14 entries).

## Decisiones tomadas

- **Stack labels** stored per route entry (`Exams`, `Vocabulary`, `Progress`, `Dashboard`) — back button text comes from stack, not screen-specific if-else.
- **Tab switches** use `replaceRoute` (no new history entry); entering workspace from dashboard **pushes** history.
- **`loadingScreen`** stays transient (no hash) to avoid broken deep-links mid-generation.
- **Exam IDs** use existing `_savedId` / `_flightId` from `saveCurrentExam`; share URL works after save.
- **No framework** — plain hash + `history.pushState` / `popstate` / `hashchange`.

## Riesgos / deuda introducida

- **OAuth hash conflict:** Supabase OAuth tokens in hash on return are handled before `parseAppRoute` in `init.js` (unchanged order).
- **Duplicate hash listeners removed from `init.js`** — router owns `popstate` + `hashchange`.
- **In-progress oral session** cannot be fully restored from URL alone (task is in memory) — recovery message shown.
- **Manual hash edit** without valid state shows recovery banner (by design).

## Resultados de tests

```bash
node scripts/test-nav-routes.mjs
npm run test:engine
```

All green (including full engine suite).

## Verificación manual

Suggested browser checks (`netlify dev`):

1. Open goal workspace → URL `#/goal/de-b1/exams`; browser Back returns to dashboard.
2. Switch tabs → URL updates (`vocab`, `progress`); Back leaves workspace.
3. Save exam → copy link from results → open in new tab → exam loads.
4. Invalid `#/exam/999999` → recovery banner, not blank home.
5. Legacy `#/workspace/de-b1` still opens workspace.

## Próximos pasos / pendientes

- Optional: redirect legacy `#/workspace/*` to `#/goal/*/exams` in the address bar
- Persist oral session task in `sessionStorage` for true oral deep-link restore
- Query-param deep links (`?lang=de&level=B1`) could migrate to hash routes

## Feature flags tocados

None.

## Deep-link demo

```
https://your-app/#/goal/de-b1/exams
https://your-app/#/exam/1739123456789
https://your-app/#/exam/1739123456789/results
https://your-app/#/review/42
```

After completing an exam, use **Copy exam link** on the results screen.
