# LexiLoop — Private Beta

Share this link with testers:

**https://lexiloop.netlify.app**

Oral mode: **https://lexiloop.netlify.app/oral.html**

## For testers (copy & send)

> Hi! I'm testing **LexiLoop** — an AI exam trainer for official **English** (Cambridge / IELTS) and **German** (Goethe) exams.
>
> **Try it:** https://lexiloop.netlify.app  
> Click **"Continue without account"** to start instantly (no sign-up needed).
>
> **What to try:**
> 1. Pick German or English ? choose a level ? generate a full exam  
> 2. Quick modules (Reading / Listening / Writing) — work without AI quota limits on structure  
> 3. Flashcard deck — save words in Practice mode  
> 4. Oral mode — record and get AI feedback  
>
> **Feedback:** reply to this message or email marcosdadra@gmail.com with subject `LexiLoop Beta Feedback`
>
> *Private beta — features may change.*

## What works without sign-up

- Full UI navigation
- Guest mode (progress saved in browser only)
- Quick exam modules
- Flashcards (local)

## What needs an account

- Sync across devices
- Cloud backup of history & saved exams

## What needs Anthropic credits (server)

- Full AI exam generation
- Oral evaluation
- Vocabulary AI lookup

## Owner checklist before sharing

- [ ] `ANTHROPIC_API_KEY` set in Netlify (secret)
- [ ] `AUTH_JWT_SECRET` set in Netlify (secret) — optional for guest-only testing
- [ ] Trigger deploy after env changes
- [ ] Test guest flow once yourself
