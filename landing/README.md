# LexiCoil Landing (V2)

Next.js + Tailwind + TypeScript marketing site. Static export merged with the main app at deploy time.

## Dev

```bash
cd landing
npm install
npm run dev
```

Open http://localhost:3000

## Full site build (landing + app)

From repo root:

```bash
npm run build:site
```

Output: `dist/` — landing at `/`, app at `/app.html`

## Structure

- `src/components/sections/` — Hero, SocialProof, HowItWorks, Demo, Benefits, Comparison, Testimonials, Pricing, FAQ, CTA
- `src/app/exams/[slug]/` — SEO landing pages (Goethe A1–C1, Cambridge B1–C1)
