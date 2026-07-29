# M01 502 — exam-part timeout evidence (2026-07-29)

## Client symptoms

- **M01** (B1 Lesen, topic `Umwelt`, words Recycling/Klimawandel/Beruf/Gehalt/Smartphone/Arzt): **502 Bad Gateway** (Cloudflare), twice ~60s apart.
- Timestamps (user): `2026-07-29T09:05:05Z`, `2026-07-29T09:07:16Z` (cf-ray `a22af4fdbc64bc62`, `a22af7f27a0dbe89`).
- **M15** (B1 Hören, Bildung): **200**, `serve_now`, same smoke run.

## Netlify function logs (`exam-part`)

Fetched: `npx netlify logs --function exam-part --since 2026-07-29T08:50:00Z --until 2026-07-29T09:20:00Z --json`

| Timestamp (UTC) | Message |
|-----------------|--------|
| 09:04:20.344 | `[exam-part] planModule` → `module: 'horen'`, `topic: 'Bildung'`, `decision: 'serve_now'`, `textCoveredCount: 3` |
| 09:04:35.350 | `Duration: 15006.47 ms` (M15 planModule invocation) |
| **09:05:05.532** | **`Duration: 30000.00 ms` · `Status: timeout`** (no `planModule` log — killed before response) |
| 09:06:24.475 | Second smoke pass: Hören/Bildung `serve_now` again |
| 09:06:36.428 | `Duration: 11953.59 ms` |

Raw JSONL: `netlify-exam-part-logs-2026-07-29-0905-window.jsonl`

**Conclusion:** Not a crash stack trace — **Lambda/function hard timeout** at **30s** (platform default when `netlify.toml` omits `timeout`). Aligns with first 502 at 09:05:05Z (~30s after M15 ended 09:04:35). Second 502 at 09:07:16Z is consistent with another Lesen planModule exceeding the same cap (no separate timeout line in the narrow CLI window; same failure mode).

## `netlify.toml` before fix

`[functions."exam-part"]` had **`included_files` only** — no `timeout`. §14 design (`PERSONAL-VOCAB-GTE3-DESIGN-2026-07-28.md`) recommended explicit timeout; Commit A only added `included_files`.

Note: design assumed default **10s** and `timeout = 26`; **production logs show effective cap 30s** for this site, and Lesen M01 still exceeded it.

## Why Lesen M01 > Hören M15 on this path

Same handler: `planPersonalModuleAssembly` → per-Teil `listTeilCandidates` (TOP_K=15) → `searchBestCombination` → **`verifyPlanPicksText`** (loads each pick via `resolveRowPart` + `scorePersonalPartTextMatches` / full `partText` + lemmatizer index).

| Factor | Lesen M01 | Hören M15 |
|--------|-----------|-----------|
| Teile | **5** (blueprint default) | **4** |
| Topic filter | `Umwelt` — may force **strict then relaxed** pass (2× search) | `Bildung` — typically one pass |
| User words | **6** surfaces (partial golden) | **3** (serve_now) |
| Text verify | Up to **5** full reading passages indexed per pick set | **4** audio scripts (often shorter) |

Observed: Hören planModule **~12–15s**; Lesen planModule **>30s** (timeout).

## Fix

Add explicit `[functions."exam-part"] timeout = 60` (same as `exam-hybrid-execute`) — 26s would not cover the observed 30s+ Lesen run.

Deploy + `commit_ref` recorded in `deploy-exam-part-timeout-evidence.json` after push.
