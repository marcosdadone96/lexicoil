# Level build & pool seed flow

Repeatable pipeline to bring a **lang/level** combo from empty stubs to **live** personal exams (4 modules + pool fallback).

Provider mapping: **de → Goethe**, **en → Cambridge**, **es → DELE**. Blueprints live in `library/blueprints/{provider}_{LEVEL}.json` (v3). Served exams: `data/exams/{lang}_{level}.json`.

## Prerequisites

- `.env`: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` (residual), `NETLIFY_SITE_ID`, `NETLIFY_API_TOKEN` (pool seed to Blobs)
- Bank paths: `library/{lang}/{level}/questions.json` (+ `passages.json`)

## Step A — Build 12 served exams

Dry-run first (no writes):

```cmd
node scripts/build-level.mjs --lang en --level B1 --target 12
```

Apply when the audit looks good:

```cmd
node scripts/build-level.mjs --lang en --level B1 --target 12 --apply --yes
```

This runs: Gemini bulk → pool fill → Claude residual → dedupe → fidelity gates → `data/exams/en_B1.json` (beta until promoted live).

Swap `en` / `B1` for any supported combo (`de`, `en`, `es` × `A1`–`C2`).

## Step B — Seed reusable pool (curated Teile)

Dry-run + local JSON fallback (always written to `library/reusable-seed/{lang}_{level}.json`):

```cmd
node scripts/seed-reusable-from-curated.mjs --lang en --level B1 --dry-run
```

Push to Netlify Blobs + verify inventory:

```cmd
node scripts/seed-reusable-from-curated.mjs --lang en --level B1 --apply --verify
```

Optional bank top-up (excludes curated overlap):

```cmd
node scripts/seed-reusable-from-bank.mjs --lang en --level B1 --apply --verify
```

## Step C — Strict fidelity before `live`

```cmd
node scripts/validate-exam-fidelity.mjs --lang en --level B1 --strict
```

Expect **12/12** exams passing blueprint fidelity. Then mark the level live in availability config.

## Runtime personal exams

Once A + B are done for a combo:

- `GET /.netlify/functions/exam-part?lang=&level=&module=&teil=` resolves blueprint via `ExamBlueprint.INDEX[lang_level]`
- `fetchExamPart(lang, level, …)` in the client passes query params through (not hardcoded to de/B1)
- Pool-first Teile: **Lesen T2**, **Hören T1/T4** (`personalLesenPoolFallback.js`) — served from Blobs or `library/reusable-seed/{lang}_{level}.json` in local dev
- AI generates the remaining Teile per blueprint chunk plan

## npm shortcuts

```cmd
npm run build:level -- --lang de --level B1 --target 12 --apply --yes
npm run seed:reusable-curated -- --lang de --level B1 --apply --verify
npm run validate:fidelity -- --lang de --level B1 --strict
```

## Tests

```cmd
node scripts/test-seed-reusable-curated.mjs
node scripts/test-personal-horen-runtime.mjs
node scripts/test-reusable-parts-local-seed.mjs
```
