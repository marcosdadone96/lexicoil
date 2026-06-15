# MIGRATION REPORT — 12_VISUAL_TOKENS_A11Y

**Status:** Complete  
**Date:** 2026-06-11  
**Scope:** Token consolidation + accessibility (no visual rebrand)

## Qué cambió

### Token alias migration

Legacy CSS variable aliases removed from `assets/css/lexicoil-design-system.css` and replaced with canonical names across the main app:

| Legacy | Canonical |
|--------|-----------|
| `--accent` | `--brand` |
| `--accent2` | `--brand-dark` |
| `--accent-dim` | `--brand-light` |
| `--text2` | `--text-secondary` |
| `--text3` | `--text-muted` |
| `--r` | `--radius-md` |
| `--r-lg` | `--radius-lg` |

**Files migrated:** `assets/css/app.css`, all `js/**/*.js`, `index.html`, `assets/css/app-screens.css` (demo/dist bundle).

Structural aliases (`--bg`, `--bg2`, `--surface`, `--border2`, semantic `--green`/`--red`) remain for a later pass — they do not change rendered colors.

### New: `assets/css/app-utilities.css`

Token-based utility classes for common inline patterns: typography (`.u-text-secondary`, `.u-text-caption`, …), layout (`.u-flex-inline`, `.u-icon-hero`), lists (`.u-list-secondary`), auth/footer helpers, exam mobile responsive rules (44px tap targets, stacked topbar), and `:focus-visible` outlines.

Loaded in `index.html` after `app.css`; included in `scripts/assemble-dist.mjs`.

### Inline style reduction

| Surface | Before | After |
|---------|--------|-------|
| `index.html` | ~52 `style=` | ~32 (mostly `display:none` toggles) |
| `js/**/*.js` | ~176 `style=` | ~131 (dynamic widths/heights retained) |

High-traffic generators partially migrated: `results.js` (lists, captions, secondary text → utility classes).

### Accessibility

| File | Role |
|------|------|
| `js/ui/components/a11y.js` | Live region announcer + `LcA11y.onScreenShown()` focus management |
| `js/bootstrap/nav.js` | Calls `LcA11y` on every `show()` |
| `js/ui/exam/examRunner.js` | Announces exam screen; `bindExamKeyboard()` after render |
| `js/ui/exam/examKeyboard.js` | Arrow key navigation between exam inputs; ARIA `role="group"` on question blocks |
| `js/ui/vocabulary/fcKeyboard.js` | Space/Enter flip, arrow prev/next in single-card view |
| `js/ui/vocabulary/flashcards.js` | `role="button"` + `tabindex="0"` on single-card flip surface |

### WCAG AA contrast (locked palette, light theme)

Verified programmatically in `scripts/test-visual-tokens.mjs`:

- `#2563EB` on `#FFFFFF` → **5.17:1**
- `#0F172A` on `#F8FAFC` → **17.06:1**
- `#475569` on `#F8FAFC` → **7.24:1**

Brand colors, Poppins, and logo assets untouched.

## Decisiones tomadas

- **Rename only** — no hex value changes; rendered UI must stay identical.
- **Utility classes over one-off CSS** — dynamic values (progress bar widths, chart heights) stay inline.
- **`display:none` toggles** in `index.html` kept as inline styles (JS-driven visibility).
- **Exam screen bypasses `show()`** — `renderExam()` calls `LcA11y.onScreenShown('examScreen')` directly.
- **Structural `--bg` aliases deferred** — out of scope for this phase; documented as follow-up.

## Riesgos / deuda introducida

- **`demo-loop.css` and landing capture HTML** still reference legacy token names — not loaded by main `index.html`.
- **Remaining ~131 inline styles in JS** — mostly exam/flashcard dynamic layout; further migration is incremental.
- **Keyboard handlers bind once per screen** — re-binding safe via `_fcKeyBound` guard; exam keyboard re-runs each `renderExam()`.
- **onclick inline handlers** not migrated (spec said "where viable"; out of scope for this pass).

## Resultados de tests

- Comando: `node scripts/test-visual-tokens.mjs`
- Resultado: **All checks passed** (canonical tokens, required files, contrast ratios, nav a11y wiring)
- Wired into: `npm run test:engine`

## Verificación manual

- [ ] Dashboard → exam → submit: Tab/arrow through radio options; focus ring visible
- [ ] Flashcards single-card view: Space flips card; arrows change card
- [ ] Screen change announces in screen reader (live region `#lcScreenAnnouncer`)
- [ ] Long Goethe exam on mobile: horizontal scroll absent; topbar stacks; options ≥44px
- [ ] Colors/logo unchanged vs pre-migration screenshot

## Próximos pasos / pendientes

- Migrate remaining JS inline styles in `examRunner.js`, `workspaceUi.js`, `flashcards.js`
- Remove structural `--bg`/`--surface` aliases once `app.css` references `--bg-base` directly
- Migrate `demo-loop.css` + landing capture pages to canonical tokens
- Delegate high-traffic `onclick=` handlers where low-risk

## Feature flags tocados

- None
