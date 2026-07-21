# Generation evaluation (PASO 8)

Measurable A/B harness for generation feedback.

## Layout

- `manifest.json` — 50 planned pairs (Lesen/Hören/Schreiben/Sprechen)
- `pairs/<id>/`
  - `without-feedback.json` — generated with `feedbackMode=off`
  - `with-feedback.json` — generated with `feedbackMode=active`
  - `audit-report.json` — output of `audit-generated-with-feedback.mjs`
- `reports/` — aggregate summaries
- `feedback-audit-latest.json` — store audit snapshot

## Commands

```bash
node scripts/audit-generation-feedback.mjs --fixture
node scripts/prepare-generation-evaluation.mjs
node scripts/audit-generated-with-feedback.mjs --pair generation-evaluation/pairs/lesen-001
```

Do not delete or rewrite feedback rules from this folder — measurement only.
