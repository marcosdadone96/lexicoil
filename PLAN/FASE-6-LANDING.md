# Fase 6 · Landing refrescada

**Rama:** `refactor/fase-6-landing`  
**Referencia:** `anexo-C-landing.html`, `01-DESIGN-TOKENS-AND-PATTERNS.md`

---

## Objetivo

Landing coherente con la app post-refactor (Fases 1–4): mismos tokens, copy orientado a resultados, y vistas del producto real (dashboard + workspace).

## Cambios

| Área | Antes | Después |
|------|-------|---------|
| Hero | Mock de pregunta MC | `ProductFrame` + preview dashboard (coach, readiness, KPIs) |
| How it works | 3 pasos | 4 pasos del loop (exam → gaps → practice → readiness) |
| Demo | Tarjetas abstractas | Workspace preview + loop numerado |
| Benefits | 6 cards genéricas | 3 beneficios (anexo C) |
| Comparison | 6 columnas | 5 filas vs Duolingo/Babbel/Quizlet |
| CTA | Navy block | Gradiente brand → teal (anexo C) |
| Tokens | `--shadow-hero` suave | Alineado con anexo (0.18 opacity) |

## Capturas reales

- `landing/public/capture/dashboard.html` — UI referencia Fase 1–4 (anexo A)
- `landing/public/capture/workspace.html` — UI referencia Fase 2 (anexo B)
- `scripts/capture-landing-screenshots.mjs` — genera PNG con Playwright (`npx playwright install chromium`)

Los componentes `AppScreenshotDashboard` / `AppScreenshotWorkspace` replican el mismo UI inline hasta que existan PNG en `landing/public/screenshots/`.

## Aceptación

- [x] Tokens unificados con la app (`globals.css` ↔ design system)
- [x] ≥2 vistas del proceso real (dashboard + workspace)
- [x] Sin métricas ni testimonios inventados
- [x] Estructura de secciones preservada (`page.tsx` sin cambios de orden)
- [x] `npm run build` landing OK

## Verificación

```bash
cd landing && npm run build
npm run validate:demo
npm run test:acceptance
```
