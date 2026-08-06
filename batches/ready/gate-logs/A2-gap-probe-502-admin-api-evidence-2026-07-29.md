# A2 gap probe 502 — admin-api (2026-07-29)

## Client

- Step 3 smoke: `GET admin-api?action=pool_gap_probe&lang=de&level=A2&module=horen&teil=2`
- **502** at **2026-07-29T09:18:39Z** (cf-ray `a22b09922a3cb571`)

## Not the same cause as exam-part M01

M01 was **function timeout** (30s). This request never reached handler logic for gap probe.

## netlify.toml before fix

`[functions."admin-api"]` had **no `timeout`** (would use platform default) — **irrelevant here**: invocation lasted **324 ms** with **ImportModuleError**.

Separate block from `[functions."exam-part"]`; the exam-part timeout fix (`587d356`) did not change admin-api.

## Netlify logs (`admin-api`, 09:10–09:25 UTC)

```
Init Error: Runtime.ImportModuleError
Cannot find module '/var/task/js/data/b1Topics.js'
Require stack: /var/task/netlify/functions/admin-api.js
INIT_REPORT Init Duration: 348.99 ms  Phase: init  Status: error
Duration: 324.11 ms  Status: error  Error Type: Runtime.ImportModuleError
```

**Cause:** Cold start loads `reusablePartsStore.js` → `require('../../../js/data/b1Topics.js')` but `included_files` omitted `js/data/**`. Lambda returns 502 to client.

`pool_gap_probe` also dynamic-imports `scripts/lib/levelPlanner.mjs` (needs `b1Topics.js`, `a2Topics.js`) and `poolGapPlanner.mjs` (needs `library/reusable-seed/**`).

## Fix

Extend `[functions."admin-api"] included_files` with `js/data/**`, `scripts/lib/**`, `library/reusable-seed/**`, and shared pool-index runtime files (aligned with exam-part bundle needs for `partIndex`).

No timeout change (not evidenced).
