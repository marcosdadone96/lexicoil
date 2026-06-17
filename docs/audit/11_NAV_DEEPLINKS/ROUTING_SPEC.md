# ROUTING_SPEC — routing por hash + pila de navegación

## Rutas (mapear a las 11 screens existentes)

| Hash | Screen |
|------|--------|
| `#/` | `homeScreen` |
| `#/goal/:slug/exams` | `goalWorkspaceScreen` (Exams) |
| `#/goal/:slug/vocab` | `goalWorkspaceScreen` (Vocabulary) |
| `#/goal/:slug/progress` | `goalWorkspaceScreen` (Progress) |
| `#/goal/:slug/config` | `examConfigScreen` |
| `#/goal/:slug/oral` | `oralPracticeScreen` |
| `#/goal/:slug/deck` | `flashcardScreen` (goal deck hub) |
| `#/exam/:id` | `examScreen` |
| `#/exam/:id/results` | `resultsScreen` |
| `#/review/:historyId` | `mistakeReviewScreen` |
| `#/flashcards` | `flashcardScreen` (global) |
| `#/vocab-exam` | `vocabExamScreen` |
| `#/profile-setup` | `profileSetupScreen` |
| *(none)* | `loadingScreen` (transient) |

Legacy: `#/workspace/:slug` → `#/goal/:slug/exams`

## Pila de navegación

- `routerNavigate(path, { label, replace })` — push (or replace) stack + `history.pushState`
- `LcRouter.back()` — `history.back()`; `popstate`/`hashchange` sync stack
- `navBackLabel()` — `_stack[length-2].label`
- **Eliminado:** `resolveNavBack()` if-else

## Deep-link / restauración de estado

- `#/exam/:id` — loads from `S.savedExams`, active `S.examData`, or history
- `#/goal/:slug/*` — resolves goal by slug via `findGoalBySlug`
- Missing state → `nav-route-recovery` banner (not silent `goHome()`)

## Restricciones

- Sin framework, sin bundler nuevo. Markup y estilos actuales intactos.
- Goal Workspace UI sin cambios estructurales.

## Implementado

Ver `js/bootstrap/router.js` y `docs/audit/11_NAV_DEEPLINKS/MIGRATION_REPORT.md`.
