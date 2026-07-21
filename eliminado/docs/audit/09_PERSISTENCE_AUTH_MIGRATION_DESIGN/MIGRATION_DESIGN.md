# MIGRATION_DESIGN — Persistencia transaccional + Auth unificada

**Phase:** 09 — PERSISTENCE_AUTH_MIGRATION_DESIGN  
**Status:** Design only — **do not execute** until the decision gate is opened  
**Date:** 2026-06-12  
**Prerequisite:** Phase 08 (CAS patch on Netlify Blobs) deployed and stable

> Esta fase es **DISEÑO**. El equipo parcheó las races en la fase 08 y difiere la migración real
> hasta que se cumplan los disparadores del ADR (§6). **No tocar código, env ni infra** hasta
> abrir la puerta de decisión.

---

## Executive summary

LexiCoil today stores all server-side state in a single Netlify Blobs store (`lexicoil-data`) and authenticates users through **two parallel paths**: email/password with a custom HS256 JWT (`lc-auth`), and Supabase OAuth that still ends in the same app JWT. Quota and pool writes were patched in phase 08 with optimistic concurrency (CAS), but Blobs remain last-write-wins KV — not transactional.

This document specifies how to move **users, quota, pool, payments, and sync** to **Supabase Postgres** with atomic SQL, consolidate auth on **Supabase as the single identity source**, and cut over with **dual-write → read-from-Postgres → stop Blobs** while preserving zero-downtime and a reversible rollback path.

**Out of scope for this design:** changing the monetization model (one-time Stripe payment granting perpetual monthly Pro quota — see §7).

---

## Current state (baseline)

| Concern | Today | Primary files |
|---------|-------|-----------------|
| Store | Netlify Blobs `lexicoil-data` | `netlify/functions/lib/blobStore.js` |
| Users | `user:{email}` JSON blobs | `auth-register.js`, `auth-login.js`, `auth-supabase-session.js` |
| Quota (auth) | `quota:{email}` + CAS (phase 08) | `netlify/functions/lib/quotaLib.js`, `lib/casBlob.js` |
| Quota (guest) | `guest_quota:{ipHash32}` + CAS | `quotaLib.js` |
| Idempotency | `quota:{scope}:idem:{requestId}` | `quotaLib.js`, `casBlob.js` |
| Pool | `pool:{lang}:{level}:{id}` + `pool_idx:{lang}:{level}:{id}` | `lib/poolIndex.js`, `exam-pool.js` |
| Sync | `sync:{email}` client payload | `user-sync.js` |
| Payments | Stripe webhook + `processed:{eventId}` dedup | `stripe-webhook.js`, `lib/proUpgrade.js` |
| App JWT | HS256 `typ: lc-auth`, `sub: email`, `tv: tokenVersion` | `lib/authLib.js`, `lib/jwt.js` |
| Supabase | Identity provider only; `auth.getUser(access_token)` | `auth-supabase-session.js` |

Supabase is **not** used for persistence today — only token validation during OAuth exchange.

---

## 1. Target schema (Postgres / Supabase)

All tables live in schema `lexicoil`. Supabase Auth owns `auth.users`; application tables reference it via `auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE`.

### 1.1 `lexicoil.profiles`

Extends Supabase auth with app-specific fields. One row per user.

```sql
CREATE TABLE lexicoil.profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id    UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email           CITEXT NOT NULL UNIQUE,
  display_name    VARCHAR(80) NOT NULL DEFAULT '',
  plan            TEXT NOT NULL DEFAULT 'free'
                    CHECK (plan IN ('free', 'pro', 'guest')),
  pro             BOOLEAN NOT NULL DEFAULT FALSE,
  token_version   INTEGER NOT NULL DEFAULT 1,
  password_set    BOOLEAN NOT NULL DEFAULT FALSE,  -- true if bcrypt hash migrated
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  pro_activated_at TIMESTAMPTZ,
  pro_revoked_at  TIMESTAMPTZ,
  migrated_from_blobs_at TIMESTAMPTZ,
  blob_snapshot   JSONB  -- optional one-time audit copy; drop after 90d
);

CREATE INDEX profiles_plan_idx ON lexicoil.profiles (plan) WHERE pro = TRUE;
```

**Mapping from blob `user:{email}`:**

| Blob field | Column |
|------------|--------|
| `email` | `email` |
| `name` | `display_name` |
| `plan`, `pro` | `plan`, `pro` |
| `tokenVersion` | `token_version` |
| `passwordHash` present | `password_set = true`; hash stored separately or dropped after Supabase password reset campaign |
| `supabaseId` | `auth_user_id` |
| `createdAt` | `created_at` |
| `proActivatedAt` / `proRevokedAt` | same |

**Guest users:** optional `lexicoil.guest_profiles` keyed by `ip_hash CHAR(32) PRIMARY KEY` with `expires_at`, or keep guest quota only (no profile row) as today.

### 1.2 `lexicoil.quota_usage`

One row per **authenticated** user per calendar month. Atomic increment eliminates TOCTOU.

```sql
CREATE TABLE lexicoil.quota_usage (
  id              BIGSERIAL PRIMARY KEY,
  profile_id      UUID NOT NULL REFERENCES lexicoil.profiles(id) ON DELETE CASCADE,
  period          TEXT NOT NULL,  -- 'YYYY-M' matching getMonthKey()
  used            INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  quota_limit     INTEGER NOT NULL CHECK (quota_limit > 0),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, period)
);

CREATE INDEX quota_usage_period_idx ON lexicoil.quota_usage (period);
```

**Atomic increment (replaces CAS loop):**

```sql
-- Returns new used count or zero rows if at limit
UPDATE lexicoil.quota_usage
SET used = used + 1, updated_at = now()
WHERE profile_id = $1
  AND period = $2
  AND used < quota_limit
RETURNING used, quota_limit;
```

**Upsert on first use of month:**

```sql
INSERT INTO lexicoil.quota_usage (profile_id, period, used, quota_limit)
VALUES ($1, $2, 0, $3)
ON CONFLICT (profile_id, period) DO NOTHING;
```

**Guest quota:**

```sql
CREATE TABLE lexicoil.guest_quota (
  ip_hash         CHAR(32) PRIMARY KEY,
  used            INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  quota_limit     INTEGER NOT NULL DEFAULT 2,
  expires_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 1.3 `lexicoil.quota_idempotency`

Replaces blob keys `quota:{scope}:idem:{requestId}`.

```sql
CREATE TABLE lexicoil.quota_idempotency (
  scope_key       TEXT NOT NULL,   -- 'profile:{uuid}' or 'guest:{ip_hash}'
  request_id      UUID NOT NULL,
  result_used     INTEGER NOT NULL,
  result_limit    INTEGER NOT NULL,
  result_plan     TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_key, request_id)
);

-- TTL cleanup via pg_cron: DELETE WHERE created_at < now() - interval '7 days'
```

### 1.4 `lexicoil.exam_pool`

Replaces `pool:{lang}:{level}:{id}` + `pool_idx:*` + legacy `pool_index:*`.

```sql
CREATE TABLE lexicoil.exam_pool (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lang            CHAR(2) NOT NULL,
  level           VARCHAR(4) NOT NULL,
  topic           VARCHAR(120) NOT NULL DEFAULT '',
  exam            JSONB NOT NULL,
  provenance      JSONB,
  curated         BOOLEAN NOT NULL DEFAULT FALSE,
  served_count    INTEGER NOT NULL DEFAULT 0,
  contributed_by  CITEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_served_at  TIMESTAMPTZ,
  CHECK (jsonb_typeof(exam) = 'object')
);

CREATE INDEX exam_pool_serve_idx
  ON lexicoil.exam_pool (lang, level, created_at DESC)
  WHERE served_count <= 100;

CREATE INDEX exam_pool_curated_idx
  ON lexicoil.exam_pool (lang, level, created_at DESC)
  WHERE curated = TRUE;
```

**Serve (random sample, exclude seen IDs):**

```sql
SELECT id, exam, topic
FROM lexicoil.exam_pool
WHERE lang = $1 AND level = $2
  AND id != ALL($3::uuid[])
  AND served_count <= 100
ORDER BY random()
LIMIT 1
FOR UPDATE SKIP LOCKED;
-- then UPDATE served_count, last_served_at in same transaction
```

**Rotation (replaces timestamp delete loop):**

```sql
DELETE FROM lexicoil.exam_pool
WHERE id IN (
  SELECT id FROM lexicoil.exam_pool
  WHERE lang = $1 AND level = $2
  ORDER BY created_at ASC
  OFFSET 50
);
```

Each INSERT is an independent row — concurrent publishers never clobber each other.

### 1.5 `lexicoil.payments`

Replaces Stripe dedup blob `processed:{eventId}` and links payments to profiles.

```sql
CREATE TABLE lexicoil.payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID REFERENCES lexicoil.profiles(id) ON DELETE SET NULL,
  stripe_event_id TEXT UNIQUE,
  stripe_session_id TEXT UNIQUE,
  amount_cents    INTEGER,
  currency        CHAR(3) DEFAULT 'EUR',
  status          TEXT NOT NULL CHECK (status IN ('pending','paid','refunded','failed')),
  plan_granted    TEXT NOT NULL DEFAULT 'pro',
  raw_event       JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX payments_profile_idx ON lexicoil.payments (profile_id, created_at DESC);
```

Webhook handler: `INSERT ... ON CONFLICT (stripe_event_id) DO NOTHING` → if 0 rows inserted, event already processed (idempotent).

### 1.6 `lexicoil.user_sync` (optional phase 1b)

Client sync payload currently in `sync:{email}`. Can migrate in same cutover or defer:

```sql
CREATE TABLE lexicoil.user_sync (
  profile_id      UUID PRIMARY KEY REFERENCES lexicoil.profiles(id) ON DELETE CASCADE,
  payload         JSONB NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Deferred (stay on Blobs longer):** rate limits (`ratelimit_*`), TTS cache (`tts:*`), translation cache (`xlat:*`), password reset tokens (`reset:*`) — low risk, no cross-user races.

### 1.7 Row Level Security (RLS)

| Table | Policy |
|-------|--------|
| `profiles` | Users read/update own row (`auth.uid() = auth_user_id`); service role full access |
| `quota_usage` | Users read own; writes **only** via service-role Edge Function |
| `exam_pool` | Public read via service role (pool GET is unauthenticated); authenticated POST via function |
| `payments` | Users read own; writes via webhook function only |
| `user_sync` | Users read/write own payload |

Netlify functions use **Supabase service role key** (server-only env) — never exposed to browser.

### 1.8 Indexes & constraints summary

| Constraint | Purpose |
|------------|---------|
| `UNIQUE (profile_id, period)` on quota | One counter row per user per month |
| `CHECK (used >= 0)` | No negative usage |
| `CHECK (used < quota_limit)` enforced in UPDATE WHERE | Hard cap at DB layer |
| `stripe_event_id UNIQUE` | Webhook idempotency |
| `email UNIQUE` on profiles | Matches blob key semantics |
| Partial index `served_count <= 100` | Fast pool serve queries |

---

## 2. How atomicity eliminates phase-08 races

Phase 08 reduced races with **optimistic concurrency (CAS)** on Blobs. Residual gaps are documented in `docs/audit/08_QUOTA_POOL_RACES/MIGRATION_REPORT.md`. Postgres removes the root cause: **read-modify-write on shared keys**.

| Race (phase 08) | Blob patch (08) | Postgres (09) |
|-----------------|-----------------|---------------|
| Quota TOCTOU — two reads see same `used`, one increment lost | CAS with etag + 5 retries; may throw `cas_write_exhausted` | Single `UPDATE … SET used = used + 1 WHERE used < limit RETURNING` — **one round-trip, serializable per row** |
| Quota double-charge on network retry | Idempotency blob `onlyIfNew` | `INSERT INTO quota_idempotency … ON CONFLICT DO NOTHING` + return stored result in same transaction |
| Pool index lost on concurrent POST | Append-only `pool_idx:*` per exam | Each exam is an `INSERT` — no shared index blob |
| Pool rotation orphan/dangling refs | Non-transactional delete of index + exam | `DELETE` in one transaction; optional FK none needed (single table) |
| check-then-increment over-admission | Still two steps | Optional: combine check+increment in one SQL statement; or `SELECT … FOR UPDATE` in transaction |
| Guest IP spoofing | Not fixed in 08 | Still not fixed by Postgres alone — needs rate limiting + optional device fingerprint (future) |

**Example: quota increment transaction (replaces `incrementQuota` + `casWriteJson`):**

```sql
BEGIN;
  INSERT INTO quota_idempotency (scope_key, request_id, result_used, result_limit, result_plan)
  SELECT $scope, $req, q.used, q.quota_limit, p.plan
  FROM quota_usage q
  JOIN profiles p ON p.id = q.profile_id
  WHERE q.profile_id = $profile AND q.period = $period
  ON CONFLICT DO NOTHING;

  -- If idempotency row existed, return early (handled in app layer)

  INSERT INTO quota_usage (profile_id, period, used, quota_limit)
  VALUES ($profile, $period, 0, $limit)
  ON CONFLICT DO NOTHING;

  UPDATE quota_usage
  SET used = used + 1, updated_at = now()
  WHERE profile_id = $profile AND period = $period AND used < quota_limit
  RETURNING used, quota_limit;

  -- Insert idempotency record with result
COMMIT;
```

No retry loop required under normal load; row-level lock serializes concurrent increments for the same user.

---

## 3. Auth consolidation plan (Supabase as single source)

### 3.1 Target state

```
Browser → Supabase Auth (OAuth / magic link / email password)
       → Supabase access_token (short-lived)
       → Netlify function validates via supabase.auth.getUser(token)
       → Service calls use service_role for DB writes
       → Optional: issue thin lc-auth JWT for backward compat during transition only
```

**Retire:** custom bcrypt login (`auth-login.js`, `auth-register.js`) and standalone HS256 as the **primary** session mechanism.

**Keep temporarily:** `auth-supabase-session.js` renamed/refactored to `auth-session.js` — validates Supabase JWT, loads `profiles` from Postgres instead of Blobs.

### 3.2 Migration mapping

| Current path | Target |
|--------------|--------|
| Email register → bcrypt → app JWT | Supabase `signUp` with email/password; trigger creates `profiles` row |
| Email login → bcrypt verify → app JWT | Supabase `signInWithPassword`; client holds Supabase session |
| Google/GitHub OAuth | Already Supabase — remove second app JWT exchange step once client uses Supabase session directly |
| `lc_token` in localStorage | `supabase.auth.session` (or Supabase SSR cookie if moving to Next.js later) |
| `tokenVersion` revocation | Supabase `signOut` globally + increment `profiles.token_version`; or rely on Supabase session invalidation |
| `auth-me.js` | Read `profiles` + join `quota_usage` for current period |

### 3.3 Existing user migration

**Users with `supabaseId` on blob:** link `profiles.auth_user_id = supabaseId`; email must match.

**Users with password only (no Supabase account):**

1. Batch import: Supabase Admin API `createUser({ email, email_confirm: true })` without password.
2. Send magic-link / password-reset email: "We've upgraded login — set your password."
3. On first Supabase login, link `profiles` row by email.
4. Deprecate bcrypt after 90-day grace window; blob `passwordHash` never copied to Postgres (security).

**Active sessions during cutover:**

- **Dual-token window (2 weeks):** accept both valid `lc-auth` JWT (legacy) and Supabase access token.
- Legacy JWT validation checks `profiles.token_version`; after migration bump version for all imported users → forces re-login once.
- Client update: `authClient.js` stops storing `lc_token`; uses Supabase client session only.

### 3.4 AI proxy validation after change

All protected functions (`claude-chat.js`, `exam-pool.js` POST, `stripe-checkout.js`, etc.) today call `verifyAuthToken(bearer)` from `authLib.js`.

**New middleware `resolveAuth(event)`:**

1. Parse Bearer token.
2. Try Supabase `getUser(token)` (works for Supabase access tokens).
3. If fail and `ALLOW_LEGACY_JWT=1`, fall back to `verifyAuthToken` during dual-token window.
4. Return `{ profileId, email, plan, pro }` from Postgres (cached 60s in function memory if needed).

Guest/unauthenticated paths unchanged (guest quota by IP hash).

### 3.5 Functions to deprecate (post-cutover)

| Function | Fate |
|----------|------|
| `auth-login.js` | Remove after grace period |
| `auth-register.js` | Remove; registration via Supabase |
| `auth-forgot.js`, `auth-reset.js` | Remove; Supabase password recovery |
| `auth-supabase-session.js` | Replace with session refresh against Postgres profiles |
| `lib/jwt.js` sign path | Remove; verify-only during transition |

---

## 4. Data migration plan

### 4.1 Principles

- **No big-bang:** dual-write → verify → read switch → stop writes → archive Blobs.
- **Reversible until step 4:** feature flag `PERSISTENCE_BACKEND=blobs|dual|postgres`.
- **Idempotent importers:** safe to re-run; use email / blob key as natural key.

### 4.2 Phase A — Provision (week 1)

1. Create Supabase project tables + RLS policies (migration SQL in repo `supabase/migrations/`).
2. Add env vars to Netlify: `SUPABASE_SERVICE_ROLE_KEY`, `PERSISTENCE_BACKEND=dual`.
3. Deploy **read-only** importer script (`scripts/migrate-blobs-to-postgres.mjs`) — no production writes yet.
4. Run importer against production Blobs export (Netlify CLI `blobs export` or list+get API).

### 4.3 Phase B — Backfill (week 1–2)

Import order (respect FKs):

1. `user:{email}` → `profiles` (+ create missing `auth.users` via Admin API where needed).
2. `quota:{email}` → `quota_usage` (map email → profile_id, current month).
3. `pool:{lang}:{level}:{id}` + `pool_idx:*` → `exam_pool` (dedupe by id).
4. `processed:{stripeEventId}` → `payments` stub rows (event id only, for dedup continuity).
5. Optional: `sync:{email}` → `user_sync`.

**Validation job:** compare counts and sample hashes (blob JSON vs Postgres JSONB) — report in CI.

### 4.4 Phase C — Dual-write window (2–4 weeks)

When `PERSISTENCE_BACKEND=dual`:

| Operation | Write path |
|-----------|------------|
| Register / login | Supabase + Postgres profile (stop writing user blob) |
| Quota increment | Postgres transaction **then** blob CAS (blob is secondary) |
| Pool POST | Postgres INSERT **then** blob publish |
| Pro activation | Postgres profile + quota reset **then** blob |
| Stripe webhook | Postgres payments + profile **then** blob processed key |

Read path still from **Blobs** initially; shadow-read Postgres and log mismatches (`[dual-write-mismatch]`).

### 4.5 Phase D — Cutover (1 maintenance window, ~30 min)

1. Set `PERSISTENCE_BACKEND=postgres`.
2. All reads/writes from Postgres only.
3. Deploy client that uses Supabase session (no `lc_token`).
4. Bump `token_version` for all profiles → one-time re-login.
5. Monitor error rates, quota counts, pool serve latency.

**Zero-downtime note:** dual-write phase means no hard downtime required; the maintenance window is for the auth client swap and token bump only.

### 4.6 Phase E — Rollback (if needed, within 72h of cutover)

1. Set `PERSISTENCE_BACKEND=blobs`.
2. Re-enable legacy JWT (`ALLOW_LEGACY_JWT=1`).
3. **Do not** auto-sync Postgres → Blobs (data drift risk); instead:
   - Quota: accept temporary inconsistency; manual reconcile script for affected users.
   - Pool: exams published during Postgres-only window may be missing from Blobs — export Postgres pool slice back to Blobs if rollback within 72h.
4. Root-cause fix forward; re-attempt cutover.

### 4.7 Phase F — Decommission (week 6+)

1. Stop dual-write to Blobs.
2. Archive Blobs export to cold storage (S3/GCS).
3. Remove CAS code paths (`casBlob.js`, blob quota/pool writes).
4. Remove deprecated auth functions.
5. Drop `blob_snapshot` column after 90 days.

### 4.8 Export tooling

```bash
# Pseudocode — implement at execution time
netlify blobs:list --store lexicoil-data --prefix user: > users.keys
node scripts/migrate-blobs-to-postgres.mjs --dry-run
node scripts/migrate-blobs-to-postgres.mjs --apply
node scripts/verify-blobs-postgres-parity.mjs
```

---

## 5. Risk register

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R1 | Dual-write drift (Postgres vs Blobs disagree) | Medium | Medium | Shadow reads + automated parity job; Postgres is source of truth during dual-write |
| R2 | User cannot log in after auth cutover | Medium | High | Dual-token window; magic-link campaign for password-only users; rollback flag |
| R3 | Quota under/over count during migration | Low | High | Idempotency table; single SQL increment; freeze quota during cutover minute if needed |
| R4 | Pool exams lost during rotation/import | Low | Medium | Idempotent import by UUID; seed files remain fallback |
| R5 | Stripe double-grant Pro | Low | Medium | `stripe_event_id UNIQUE`; transactional profile update |
| R6 | Service role key leak | Low | Critical | Netlify secrets only; never in client; rotate on deploy |
| R7 | Supabase connection limits under burst | Medium | Medium | Connection pooler (Supavisor); pgBouncer transaction mode |
| R8 | RLS misconfiguration exposes data | Low | Critical | Pen-test policies; all writes via service role functions |
| R9 | Rollback data loss | Medium | High | 72h rollback window; Postgres backup before cutover; pool export script |
| R10 | Guest quota abuse persists | High | Low | Document as known; optional Cloudflare rate limit (out of scope) |

### 5.1 Go / no-go checklist

Execute migration only when **all** are true:

- [ ] Phase 08 CAS patch deployed ≥ 2 weeks; `[quota-cas] conflict` rate baseline captured
- [ ] Supabase migrations applied in staging; RLS policies reviewed
- [ ] Importer + parity verifier pass on staging Blobs snapshot
- [ ] Dual-write deployed in staging; 0 mismatches for 48h soak test
- [ ] Auth client PR ready (Supabase session); QA on OAuth + email login
- [ ] Rollback runbook tested in staging (`PERSISTENCE_BACKEND=blobs` revert)
- [ ] On-call owner assigned for cutover window
- [ ] Postgres backup + Blobs export completed immediately pre-cutover
- [ ] Product sign-off on forced re-login (token_version bump)
- [ ] **Business decision** on Pro monetization model documented (see §7) — not blocking tech migration but flagged

**No-go triggers (abort or rollback):**

- Parity mismatch > 0.1% of quota rows
- Auth login failure rate > 5% for 15 min post-cutover
- `[quota-cas] cas_write_exhausted` or Postgres deadlock rate spike
- Unplanned Stripe webhook failures

### 5.2 Effort estimate

| Workstream | Estimate | Notes |
|------------|----------|-------|
| Schema + migrations + RLS | 3–5 days | Supabase SQL + local testing |
| Postgres data access layer (`lib/db.js`, repositories) | 5–8 days | quota, pool, profiles, payments |
| Dual-write + feature flag | 5–7 days | Highest complexity |
| Auth consolidation (client + functions) | 5–8 days | Supabase session, deprecate login/register |
| Importer + parity scripts | 3–4 days | |
| User migration (Admin API batch) | 2–3 days | + comms for password reset |
| Testing (unit + staging soak) | 5–7 days | Include concurrency tests ported from phase 08 |
| Cutover + monitoring | 1–2 days | |
| Decommission Blobs paths | 2–3 days | After stabilization |
| **Total** | **~6–8 engineer-weeks** | 1 senior backend + part-time frontend for auth client |

---

## 6. ADR — Deferral decision and execution triggers

### ADR-009: Defer Postgres migration; patch Blobs races first

**Status:** Accepted (2026-06)  
**Context:** Quota and pool suffered TOCTOU races on Netlify Blobs. A full Postgres migration is 6–8 weeks of work and touches auth, billing, and all server functions. Shipping a CAS patch (phase 08) restores correctness for expected load at lower risk and cost.

**Decision:** Defer Supabase Postgres migration. Implement phase 08 CAS + append-only pool index. Produce this design document (phase 09) so execution can start immediately when triggered.

**Consequences:**

- (+) Faster time-to-safe for current user base.
- (+) Design ready — no discovery lag when triggered.
- (−) Residual race windows remain under extreme contention (see phase 08 report).
- (−) Dual auth and Blobs operational complexity continues.
- (−) Analytics across users/pool/quota remains difficult (phase 13).

### Execution triggers (any one opens the gate)

| Trigger | Threshold | Owner action |
|---------|-----------|--------------|
| **T1 — Scale** | > 1,000 MAU or > 100 concurrent quota increments/min sustained | Schedule migration sprint |
| **T2 — CAS exhaustion** | `cas_write_exhausted` or `[quota-cas] conflict` > 100/hour in production logs | Hotfix review → migrate quota first (partial cutover) |
| **T3 — Pool loss** | Any confirmed lost pool entry post-08 in production | Prioritize pool table migration |
| **T4 — Analytics** | Phase 13 requires SQL reporting on usage/revenue | Migrate profiles + quota + payments |
| **T5 — Auth debt** | Security review mandates single IdP | Prioritize auth consolidation track |
| **T6 — Business model change** | Move from one-time Pro to subscription | Migrate payments schema + Stripe subscription handlers |

**Gate opener:** Engineering lead + product owner sign go/no-go checklist (§5.1).

**Revisit cadence:** Review triggers quarterly even if not met.

---

## 7. Product note (not resolved in this migration)

The audit flags **monetization economics**: current Stripe checkout is a **one-time €9.99 payment** that grants **perpetual monthly Pro quota** (20 exams/month forever). This is a business policy choice, not a persistence bug.

- **Record:** `payments.plan_granted = 'pro'` with no expiry column today.
- **If subscription model adopted (T6):** add `subscriptions` table with `current_period_end`, wire Stripe `customer.subscription.*` events (handler stub exists in `stripe-webhook.js` for `customer.subscription.deleted`).
- **Do not block** technical Postgres migration on this decision; schema supports both one-time and subscription via `payments` + future `subscriptions` table.

---

## 8. Acceptance mapping

| Acceptance item | Section |
|-----------------|---------|
| Postgres schema (users/quota/pool/payments + indexes) | §1 |
| Atomicity vs phase-08 races | §2 |
| Auth consolidation to Supabase | §3 |
| Dual-write / cutover / rollback | §4 |
| Risks + go/no-go + effort | §5 |
| ADR deferral + triggers | §6 |
| No code/infra changes in phase 09 | This doc only |

---

## Appendix A — Blob key → table quick reference

| Blob key | Postgres destination |
|----------|------------------------|
| `user:{email}` | `lexicoil.profiles` |
| `quota:{email}` | `lexicoil.quota_usage` |
| `quota:{email}:idem:{uuid}` | `lexicoil.quota_idempotency` |
| `guest_quota:{hash}` | `lexicoil.guest_quota` |
| `pool:{lang}:{level}:{id}` | `lexicoil.exam_pool` |
| `pool_idx:*` | (same row — index columns on `exam_pool`) |
| `processed:{stripeEventId}` | `lexicoil.payments.stripe_event_id` |
| `sync:{email}` | `lexicoil.user_sync` (optional 1b) |
| `ratelimit_*`, `tts:*`, `xlat:*`, `reset:*` | Stay on Blobs or Redis later |

## Appendix B — Environment variables (execution phase)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Existing |
| `SUPABASE_ANON_KEY` | Existing (client) |
| `SUPABASE_SERVICE_ROLE_KEY` | **New** — server DB writes |
| `PERSISTENCE_BACKEND` | `blobs` \| `dual` \| `postgres` |
| `ALLOW_LEGACY_JWT` | `1` during auth transition only |
| `AUTH_JWT_SECRET` | Retire after legacy JWT sunset |

---

*Document version: 1.0 — design only, no implementation in phase 09.*
