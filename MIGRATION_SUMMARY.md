# LexiCoil Trust, Activation & Personalization Refactor

**Date:** June 5, 2026  
**Scope:** Strategic refactor (not redesign / not rewrite)  
**Production:** https://lexicoil.com

---

## Summary

This migration removes fabricated trust signals, surfaces guest-first activation, clarifies practice vs personalized exams, and turns the app into an exam coach ù while preserving backend behavior and working exam generation.

---

## Files Modified

### Landing (`landing/src/`)

| File | Changes |
|------|---------|
| `lib/tryExam.ts` | **New** ù guest try flow redirects to `/app.html?try=1` |
| `lib/constants.ts` | Removed fake `STATS`; added `EXAM_FORMATS` |
| `components/sections/HeroSection.tsx` | Guest-first CTA; removed fake avatars/ratings; German umlauts fixed |
| `components/sections/SocialProofSection.tsx` | Beta messaging; practice vs personalized cards |
| `components/sections/TestimonialsSection.tsx` | Replaced fake testimonials with honest value props |
| `components/sections/HowItWorksSection.tsx` | Practice vs personalized exam clarified |
| `components/sections/FAQSection.tsx` | Guest-first flow; exam types; Hùrverstehen fixed |
| `components/sections/PricingSection.tsx` | "Try exam first" on free tier |
| `components/sections/CTASection.tsx` | Guest-first CTAs |
| `components/sections/BenefitsSection.tsx` | Headline: product benefits, not social proof |
| `components/layout/Header.tsx` | Primary "Try exam" button |
| `components/ui/AuthModal.tsx` | Guest path ? "Try a practice exam" |
| `components/seo/JsonLd.tsx` | Removed fake `aggregateRating` |

### App (`index.html`)

| Area | Changes |
|------|---------|
| Level screen | Practice vs personalized exam context banner |
| `runInit()` / `handleTryEntry()` | `?try=1` auto-starts Goethe B1 demo in practice mode |
| `renderResults()` | Weak areas, vocabulary detected, recommended action, guest save CTA |
| `saveToFCData()` | `missCount` tracking; `examSavedWords` session list |
| `renderFCCard()` | Evidence line (source exam) + miss/review status |
| `renderExam()` | Clears `examSavedWords` per session |
| Practice / Learn hubs | Practice vs personalized naming; flashcards as supporting tool |
| German UI labels | `Hoeren` ? `Hùrverstehen`, `Uebersetzen` ? `ùbersetzen`, `sorgfaeltig` ? `sorgfùltig` |

### Supporting JS

| File | Changes |
|------|---------|
| `js/appFeatures.js` | German module label `Hùrverstehen` in PDF/results helpers |

### Design system (prior session, unchanged this pass)

- `assets/css/lexicoil-design-system.css`
- `landing/src/app/globals.css`, `layout.tsx`, `tailwind.config.ts`

---

## UX Changes

### Trust & honesty

- All hardcoded stats, fake testimonials, star ratings, and aggregate SEO ratings removed from landing.
- Replaced with beta positioning, verified capabilities, and product benefit copy aligned with Product OS.

### Activation (guest-first)

**New preferred flow:**

```
Landing ? Try Exam (guest) ? Experience Value ? Results ? Create Account To Save Progress
```

- Landing CTAs use `tryExamAsGuest()` ? `/app.html?try=1`
- App `handleTryEntry()` loads Goethe B1 demo in practice mode when available
- Results page shows guest CTA: "Create account to save progress"

### Practice vs personalized exams

- **Practice exam** = general mock on official topic (baseline assessment)
- **Personalized exam** = built from vocabulary saved after mistakes
- Clarified on: landing FAQ/How It Works, level screen, practice hub

### Exam coach navigation

- Dashboard answers: preparing for, readiness, weak areas, recommended action, recent improvement, vocabulary growth
- Nav: Dashboard / Learn / Practice / Progress (not toolbox labels)

### Results ? learning loop

After every exam, results now show:

1. Score + module breakdown
2. **Weak areas** (modules below 70%)
3. **Vocabulary detected** (words saved this session)
4. **Recommended next step** (contextual action button)
5. **Personalized practice available** when deck ? 4 words
6. Guest account CTA when applicable

### Vocabulary as evidence

Each flashcard shows:

- Source: e.g. "From Goethe B2 ù Umwelt"
- Status: "Missed 3 times" / "Due for review" / "New" / "Mastered"

### Flashcards repositioned

- Positioned as a tool for strengthening weak vocabulary ù not the primary product outcome
- Learn hub copy updated accordingly

---

## Quality Improvements

- German **UI labels** corrected (umlauts, ù where applicable in interface copy)
- Session vocabulary tracking for accurate results display
- `missCount` increments on re-encountered words
- Demo exam auto-load for landing try flow (no registration wall)

**Not changed (by design):**

- `netlify/functions/` ù backend preserved
- Exam AI engine / prompt files ù not redesigned
- Pre-generated demo exam JSON content (ASCII transliterations in stored data remain; visible UI uses proper German)

---

## Navigation Changes

| Before | After |
|--------|-------|
| Toolbox: Exams, Flashcards, Vocabulary, Progress | Goal-based: Dashboard, Learn, Practice, Progress |
| Registration implied on landing | Guest try exam first |
| Generic first exam | Practice exam vs personalized exam distinction |
| Results = score only | Results = coach loop into learning |

---

## Remaining Recommendations

1. **Demo exam content encoding** ù Bulk-fix umlauts in `js/goetheDemoExams.js` and `data/exams/*.json` (large pass; UI layer already fixed)
2. **`confirmacion.html`** ù Align with design system
3. **Root `favicon.svg`** ù Replace legacy gold "Lc" with brand icon
4. **Future roadmap UX** ù Stories, reading texts, listening exercises from weak vocab: prepare slots but do not market until shipped
5. **Personalized exam validation** ù Add client-side check that generated exams contain selected vocabulary (reliability pass on prompts, not engine rewrite)
6. **Deploy** ù Run `npm run build:site` and `netlify deploy --prod --dir=dist` when ready

---

## Test Checklist

- [ ] Landing: no fake stats/testimonials/ratings visible
- [ ] Landing "Try a practice exam" ? guest B1 demo loads
- [ ] Complete demo in practice mode ? save words ? results show weak areas + vocab + recommendation
- [ ] Guest results ? "Create account to save progress" works
- [ ] Flashcards show evidence + miss count
- [ ] Dashboard coach shows recommended action
- [ ] Practice hub distinguishes practice vs personalized exam
- [ ] German labels show Hùrverstehen, ùbersetzen in app UI

---

## Build & ZIP

```bash
cd lexiloop
npm run build:site
```

Output: `dist/` ù ready for Netlify deploy or local testing.  
ZIP artifact: `lexicoil-trust-refactor-dist.zip` (generated at repo root).

---

## Activation, Profile & Navigation Refactor (June 5, 2026)

### Exam profile system

- **New:** `js/examProfile.js` ó profiles in `lc_profiles` + `lc_active_profile`; migrates legacy `lc_goal`
- All vocabulary, history, readiness, and coach stats scoped to active profile via `getProfileFlashcards()` / `getProfileHistory()`
- Post-registration onboarding: `profileSetupScreen` ó "What are you preparing for?"
- Profile bar always visible: **Preparing for Goethe B2** (etc.)
- Multi-profile architecture: switcher UI when user has 2+ profiles (`switchExamProfile`)

### 5-minute product demo (replaces guest-first)

- **New:** `js/guidedDemo.js` ó reduced Goethe/Cambridge exam (reading, listening, writing, speaking)
- Landing `tryExamAsGuest()` ? `/app.html?demo=1` + `lc_demo` session flag
- Demo setup screen: pick certification + level ? guided demo (~5 min)
- Demo auto-seeds vocabulary; results CTA explains account benefits
- Auth overlay guest button ? "Try 5-minute product demo"

### Dashboard, history & navigation

- Dashboard = exam coach (readiness, weak areas, recommended action, progress tiles)
- Progress tabs: **Exam history** / **Readiness** / **Statistics** (profile-scoped)
- History cards ? **Mistake review** (`openMistakeReview`) with correction, vocab, learning loop
- Practice hub: Product demo, Practice exam, Personalized exam, Oral practice
- Learn hub: Vocabulary / flashcard review paths

### Logout & landing

- `doLogout()` and logo click redirect to `https://lexicoil.com` (or `/` on localhost)

### New localStorage keys

| Key | Purpose |
|-----|---------|
| `lc_profiles` | Exam profiles array |
| `lc_active_profile` | Active profile id |
| `lc_demo` | Product demo session |

### Test checklist (profile refactor)

- [ ] Landing CTA ? demo setup (cert + level)
- [ ] Complete guided demo ? results ? vocab seeded ? account CTA
- [ ] Register/login ? profile onboarding if no profile; demo session cleared on auth
- [ ] Profile bar shows active certification throughout app
- [ ] Flashcards/history filtered by active profile
- [ ] History ? mistake review shows questions, answers, vocab
- [ ] Logout ? marketing site
