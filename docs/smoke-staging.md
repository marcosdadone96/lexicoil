# Smoke test — German B1 (staging)

End-to-end HTTP smoke test for LexiCoil **German B1** happy paths against a **staging or deploy preview** environment. It does **not** replace unit tests; it verifies that Netlify functions, Blobs, quota, and Stripe webhooks work together after deploy.

Script: [`scripts/smoke-b1-de.mjs`](../scripts/smoke-b1-de.mjs)

## What it checks

| Step | Type | Description |
|------|------|-------------|
| 1 | Read-only | `GET /library/de/B1/questions.json` — bank has questions |
| 1 | Read-only | `GET exam-pool?lang=de&level=B1` — valid exam structure if pool non-empty |
| 2 | Guest | `startGeneration` (`exam_generation`) → receives `genTicket` |
| 2 | Guest | `examGeneration` **without** ticket → **403** `ticket_required` |
| 2 | Optional | One chunked call **with** ticket → **200** (costs Anthropic tokens) |
| 3 | Guest | Exhaust `GUEST_MAX` (2) → next call **429** `quota_exceeded`, not 500 |
| 4 | Mutating | Publish exam to pool → listed in `admin-api?action=pool` |
| 4 | Mutating | `disable_pool` → guest pool GET no longer serves it |
| 4 | Mutating | `enable_pool` → served again → `delete_pool` teardown |
| 5 | Mutating | Signed `checkout.session.completed` → user **Pro** |
| 5 | Mutating | Signed `credit_pack` webhook → **creditTopups** increase |

**Production:** the script **refuses** to run against `lexicoil.com` / `www.lexicoil.com` unless `SMOKE_ALLOW_PRODUCTION=1`.

## Prerequisites (staging site)

Configure on the **target Netlify site** (not necessarily production):

- `AUTH_JWT_SECRET`, `ANTHROPIC_API_KEY` (for ticket + optional chunk step)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (admin-api)
- Netlify Blobs (`lexicoil-data`)
- `STRIPE_WEBHOOK_SECRET` — **Stripe test mode** secret for that endpoint
- `ALLOW_NETLIFY_PREVIEWS=true` if using deploy previews
- Optional: `LEXICOIL_ALLOWED_ORIGINS` including your preview URL

Create two accounts on staging:

1. **Contributor** — can `POST exam-pool` (`SMOKE_USER_EMAIL` / `SMOKE_USER_PASSWORD`)
2. **Admin** — row in Supabase `lc_admin_roles` (`SMOKE_ADMIN_EMAIL` / `SMOKE_ADMIN_PASSWORD`)

## Environment variables (runner)

| Variable | Required | Purpose |
|----------|----------|---------|
| `SMOKE_BASE_URL` | Yes | e.g. `https://deploy-preview-123--lexicoil.netlify.app` |
| `SMOKE_USER_EMAIL` | Pool step | Publish test exam |
| `SMOKE_USER_PASSWORD` | Pool step | |
| `SMOKE_ADMIN_EMAIL` | Pool step | List/disable/enable/delete pool |
| `SMOKE_ADMIN_PASSWORD` | Pool step | |
| `STRIPE_WEBHOOK_SECRET` | Webhook step | Sign synthetic Stripe events (test mode) |
| `SMOKE_WEBHOOK_EMAIL` | Webhook step | Defaults to `SMOKE_USER_EMAIL` |
| `SMOKE_WEBHOOK_PASSWORD` | Webhook step | Defaults to `SMOKE_USER_PASSWORD` |
| `SMOKE_GUEST_IP` | Optional | Fixed `X-Forwarded-For` for ticket test |
| `SMOKE_QUOTA_IP` | Optional | Fixed IP for quota exhaustion (isolated from ticket test) |
| `SMOKE_ALLOW_PRODUCTION` | Optional | Set `1` to override production block |

You can put these in `.env` locally (the script loads `.env` if present).

## Run locally against staging

```bash
# Read-only + ticket gate + quota (no Anthropic chunk cost)
SMOKE_BASE_URL=https://your-preview.netlify.app \
  node scripts/smoke-b1-de.mjs --skip-anthropic --skip-webhook --skip-pool-mutate

# Full smoke (needs all secrets + staging users)
SMOKE_BASE_URL=https://your-preview.netlify.app \
  SMOKE_USER_EMAIL=contributor@example.com \
  SMOKE_USER_PASSWORD='...' \
  SMOKE_ADMIN_EMAIL=admin@example.com \
  SMOKE_ADMIN_PASSWORD='...' \
  STRIPE_WEBHOOK_SECRET=whsec_test_... \
  node scripts/smoke-b1-de.mjs
```

### npm script

```bash
npm run smoke:b1-de -- --skip-anthropic
```

### Local Netlify dev

With `npm run dev` (port 8888):

```bash
SMOKE_BASE_URL=http://localhost:8888 node scripts/smoke-b1-de.mjs --skip-webhook --skip-pool-mutate
```

Note: Blobs, Supabase, and Anthropic must be configured in `.env` for dev.

## Stripe CLI (manual webhook check)

The smoke script **simulates** signed webhooks (same HMAC as production). For manual debugging you can also use Stripe CLI against a **test** endpoint:

```bash
stripe listen --forward-to https://your-preview.netlify.app/.netlify/functions/stripe-webhook
stripe trigger checkout.session.completed
```

Use **test mode** keys only. Do not forward CLI events to production.

## GitHub Actions

Workflow: [`.github/workflows/smoke-b1-de.yml`](../.github/workflows/smoke-b1-de.yml)

1. Add repository secrets (staging values only):
   - `SMOKE_BASE_URL`
   - `SMOKE_USER_EMAIL`, `SMOKE_USER_PASSWORD`
   - `SMOKE_ADMIN_EMAIL`, `SMOKE_ADMIN_PASSWORD`
   - `STRIPE_WEBHOOK_SECRET` (test)

2. Run manually: **Actions → Smoke B1 DE → Run workflow**

3. Optional: trigger after deploy to staging by adding a `repository_dispatch` or `deployment_status` hook.

Default CI run uses `--skip-anthropic` to avoid API cost; enable full chunk test in a scheduled job if desired.

## Exit codes

- **0** — all executed steps passed
- **1** — any assertion failed or unhandled error

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| CORS / empty responses | Set `Origin` to match site; enable `ALLOW_NETLIFY_PREVIEWS` on previews |
| `503 misconfigured` | Missing `AUTH_JWT_SECRET` or `ANTHROPIC_API_KEY` on target site |
| `403 forbidden` on admin-api | User not in `lc_admin_roles` |
| Pro webhook OK but plan still free | Email mismatch; user must exist in Blobs before webhook |
| Pool publish 400 | Exam failed quality gate; check `validationErrors` in response |
| Quota test flaky | Reuse `SMOKE_QUOTA_IP` with a fresh RFC5737 TEST-NET address |
