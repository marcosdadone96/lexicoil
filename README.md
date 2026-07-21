# LexiCoil

AI-powered simulator for official **English** (Cambridge) and **German** (Goethe-Institut) exams.

## Live site

**https://www.lexicoil.com**

## Features

- Full written exams (Reading, Listening, Writing, Speaking)
- Shared exam pool (reduces AI costs ù pool hits do not use quota)
- Oral mode with microphone (IELTS & Goethe)
- Flashcard deck with spaced repetition and word-type filters
- **Accounts** with cloud sync (flashcards, history, saved exams)
- Server-side quota enforcement (guest / free / pro)
- Stripe Checkout for Pro upgrade (ù9.99 one-time)
- Secure Claude API proxy (no keys in the browser)
- PDF correction export

## Environment variables (Netlify)

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key (secret) |
| `AUTH_JWT_SECRET` | Yes | Random string, min 32 chars recommended (secret) |
| `CLAUDE_MODEL` | No | Default: `claude-sonnet-4-6` |
| `STRIPE_SECRET_KEY` | For payments | Stripe secret key (`sk_live_...` or test key) |
| `STRIPE_WEBHOOK_SECRET` | For payments | Stripe webhook signing secret (`whsec_...`) |
| `LEXICOIL_SITE_URL` | Recommended | Canonical URL: `https://www.lexicoil.com` |
| `LEXICOIL_ALLOWED_ORIGINS` | No | Extra CORS origins, comma-separated |

Copy `.env.example` to `.env` for local development.

Generate a JWT secret (PowerShell):

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

## Local development

```powershell
cd c:\Users\marco\Desktop\MDR\lexicoil
copy .env.example .env
npm install
npm start          # static + AI proxy (quota not enforced ù use netlify dev for full stack)
npm run dev        # full Netlify Functions (auth, quota, pool, Stripe)
```

### TLS / antivirus (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`)

On Windows, antivirus or a corporate proxy often intercepts HTTPS and replaces
Google/Anthropic certificates. Node?s default CA store then rejects the leaf
(`fetch failed` ? `UNABLE_TO_VERIFY_LEAF_SIGNATURE`).

**Fix (preferred):** npm generator/judge scripts already pass `--use-system-ca`
(e.g. `npm run generate:sprechen:gemini`). Prefer those over raw `node scripts/?`.

**If you call Node directly:**

```powershell
node --use-system-ca scripts/generate-part-gemini.mjs --module sprechen --count 1
# or:
$env:NODE_OPTIONS="--use-system-ca"
```

**Alternative:** export the AV/proxy root as PEM and point Node at it:

```powershell
$env:NODE_EXTRA_CA_CERTS="C:\path\to\av-or-proxy-root.pem"
```

Gemini/Claude clients rethrow this case with an actionable hint instead of a bare `fetch failed`.

## Deployment (Netlify + www.lexicoil.com)

1. Connect the repo to a Netlify site and enable **Netlify Blobs** (Starter plan or higher).
2. **Domain setup** in Netlify ? Domain management:
   - Add custom domain `lexicoil.com`
   - Set primary domain to **`www.lexicoil.com`**
   - Netlify will provide DNS records (A/ALIAS for apex, CNAME for `www`)
   - At your registrar, point `lexicoil.com` and `www` to Netlify
   - `netlify.toml` redirects apex `lexicoil.com` ? `www.lexicoil.com`
3. Set environment variables (see table above). Minimum for production:
   - `ANTHROPIC_API_KEY`, `AUTH_JWT_SECRET`, `LEXICOIL_SITE_URL=https://www.lexicoil.com`
   - For payments: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
4. **Stripe** (Dashboard ? Developers ? Webhooks):
   - Endpoint URL: `https://www.lexicoil.com/.netlify/functions/stripe-webhook`
   - Event: `checkout.session.completed`
   - Copy signing secret ? `STRIPE_WEBHOOK_SECRET` in Netlify
   - Checkout success/cancel URLs use the request origin (your live domain)
5. Push to `main` ù Netlify auto-deploys.

## Quota limits

| Plan | Limit |
|------|-------|
| Guest (no account) | 2 exam generations per device/IP |
| Free (registered) | 20 standard exam generations per calendar month |
| Pro (paid) | 50 exam generations per calendar month |

**Free includes:** library/pool exams, flashcards, vocab quizzes.  
**Pro adds:** personalized vocabulary exams, listening game, AI speaking practice, PDF reports.

**Counts toward quota:** new exams delivered from the library, pool, or AI.  
**Does not count:** retaking a **saved exam** you already generated.

## Email (optional)

Set `RESEND_API_KEY` and `RESEND_FROM` in Netlify for Pro welcome emails and password reset (legacy JWT accounts). Supabase handles its own reset emails when Supabase auth is enabled.

## Estado del corpus (2026-06-30)

Banco de contenido en `batches/generated/` ? generado con `node scripts/print-corpus-stats.mjs --markdown`.

| MÛdulo | Teil | Archivos | Preguntas |
|--------|------|----------|-----------|
| horen    |    1 |        5 |        50 |
| horen    |    2 |        3 |        15 |
| horen    |    3 |        6 |        42 |
| horen    |    4 |        3 |        24 |
| lesen    |    1 |       57 |       342 |
| lesen    |    2 |       15 |        90 |
| lesen    |    3 |      101 |       707 |
| lesen    |    4 |        7 |        49 |
| lesen    |    5 |        5 |        20 |
| schreiben |    1 |        6 |        18 |
| sprechen |    1 |        7 |        21 |
| **TOTAL** | ? | **215** | **1378** |

**AuditorÌa:** `node scripts/audit-pass-2.mjs batches/generated --fail-on=IMPORTANT` ? 0 CRÕTICOS ? 0 IMPORTANTES ? 8 MENORES (backlog)

**Pool:** `library/pool-seed/de_B1.json` ? 3 ex·menes completos disjuntos (reconstruida 2026-06-30)
