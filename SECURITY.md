# Security — LexiCoil

## Never commit secrets

- **Do not commit `.env`** — it is gitignored; keep it local and in Netlify env vars only.
- **Do not commit zip archives** (`*.zip`, `**/*.dist.zip`) — they may bundle `.env` or build artifacts with embedded config.
- **Do not share project folders or zips** without checking they exclude `.env`.

Copy `.env.example` → `.env` for local development. Use clearly fake placeholders in docs and examples only.

## Incident note (2026)

A shared project package contained a root `.env` with **live** credentials (Anthropic, Stripe live + webhook, Supabase, JWT). Although `.env` is listed in `.gitignore`, it was included inside a distributed ZIP. **Treat those credentials as compromised** until rotated. Session tokens signed with a weak or leaked `AUTH_JWT_SECRET` may be forgeable until that secret is replaced.

> Rotating credentials is standard security hygiene, not a guarantee of full remediation. Confirm scope with Anthropic, Stripe, and Supabase dashboards.

## Human rotation checklist

Complete **today** if this repo or any zip/package was shared externally:

- [ ] **Anthropic** — revoke old `ANTHROPIC_API_KEY`, create new key in console
- [ ] **Stripe** — roll `STRIPE_SECRET_KEY` (live); regenerate `STRIPE_WEBHOOK_SECRET` on the webhook endpoint
- [ ] **Supabase** — rotate `SUPABASE_ANON_KEY` if exposed; review RLS policies
- [ ] **JWT** — generate new `AUTH_JWT_SECRET` (48+ random bytes); **invalidates all existing sessions**
- [ ] Update Netlify production env vars and local `.env`
- [ ] Treat any previously shared zip/package as compromised; do not redistribute old archives

### Generate a strong JWT secret

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Set the result as `AUTH_JWT_SECRET` in Netlify and local `.env`.

**Canonical name:** `AUTH_JWT_SECRET`  
**Legacy alias:** `LEXICOIL_JWT_SECRET` — still read as fallback in server code; deprecated, do not set in new deployments.

Alternative (OpenSSL):

```bash
openssl rand -base64 48
```

## Pre-commit guard

Before committing:

```bash
npm run precommit:secrets
```

This script:

1. **Fails** if `.env` or any `*.zip` / `*.dist.zip` is staged
2. **Scans tracked files** for patterns such as `sk_live_…`, `whsec_…`, `sk-ant-api…`, long Supabase JWT strings

It is intentionally lightweight (no external scanners). Run it manually or wire it into your git hook workflow.

## Environment variables

See `.env.example` for every key, placeholder, and where to obtain each value.

## Reporting

If you suspect a leak, rotate affected keys immediately, then review Netlify function logs and Stripe/Anthropic usage for anomalies.
