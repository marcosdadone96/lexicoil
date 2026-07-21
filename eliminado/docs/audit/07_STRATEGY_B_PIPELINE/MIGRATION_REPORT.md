# MIGRATION REPORT — 07_STRATEGY_B_PIPELINE

> Cursor rellena esto al terminar la fase. No borrar las secciones.

## Qué cambió

- **`scripts/pipeline/curate.mjs`**: runner offline `generate → validate(strict + CefrGate) → publish`.
- **`scripts/pipeline/lib/`**: `validateForPublish.js`, `publishCurated.js`, `provenance.js`, `normalizeExamForPublish.js`, `sampleB1.js`.
- **`library/curated/{lang}/{level}/`**: exámenes curados individuales + índice `library/curated/de_B1.json`.
- **`library/pool-seed/de_B1.json`**: regenerado con 5 entradas curadas (provenance + `curated: true`).
- **`js/engine/strategyBFlags.js`**: flag `STRATEGY_B` / `LC_STRATEGY_B`.
- **`js/bootstrap/appFeatures.js`**: cascada reordenada — pool curado → biblioteca estática; sin IA genérica si `LC_STRATEGY_B=1`.
- **`netlify/functions/exam-pool.js`**: con `STRATEGY_B=1` solo sirve entradas curadas validadas; POST exige provenance.
- **`scripts/test-strategy-b-pipeline.mjs`**: smoke tests del pipeline.
- **Lote muestra**: 5 exámenes `de/B1` publicados vía `--source composite`.

## Decisiones tomadas

- **Strategy B default OFF** — prod sigue con cascada legacy hasta activar flag.
- **Generación offline `composite`** (B1 de): ensamblado del banco + pasaje de lectura calibrado CEFR (fixture in-repo en `sampleB1.js`); validación strict sin blueprint item-count (banco incompleto vs blueprint Goethe).
- **`--source bank`**: exige blueprint strict; actualmente ~0% pass hasta ampliar banco (fase contenido).
- **`--import`**: importa exámenes legacy normalizados (matching→MCQ); `useBlueprint: false`.
- **Personal vocab path intacto**: `generatePersonalExam` mantiene pool→library→IA; weakness exams sin cambios.
- **Target biblioteca**: N≥200 exámenes válidos por nivel activo (documentado; actual de B1: 5).

## Riesgos / deuda introducida

- Modo `composite` usa pasaje compartido entre variantes (misma lectura, distintas preguntas del banco) — aceptable para lote inicial, no para producción final.
- `--source bank` no publica hasta completar bancos + pasajes largos (CefrGate + blueprint).
- Pool blob store (Netlify) puede contener exámenes pre-flag no curados hasta migración/limpieza.
- Pipeline `--live` LLM no implementado en este PR — ensamblado offline; generación IA queda para batch futuro con API key.

## Resultados de tests

- Comando(s):
  - `npm run pipeline:curate:b1` → 5 published, 0 rejected
  - `npm run test:strategy-b` → PASS
  - `npm run test:engine` → (incluye strategy-b)
- Resultado: pipeline + tests verdes

## Verificación manual

- `library/curated/de/B1/curated_de_B1_*.json` contiene `provenance.generatedBy`, `cefrGate.withinRange: true`.
- `library/pool-seed/de_B1.json` — entradas con `curated: true` al inicio.
- Con `LC_STRATEGY_B=1`: examen estándar usa pool; sin pool muestra toast (no IA).
- `generatePersonalExam` sigue disponible con flashcards (≥4 palabras).

## Próximos pasos / pendientes

- Ampliar bancos para `--source bank` con blueprint strict al 100%.
- Batch LLM offline (`--source ai`) con PromptBuilder blueprint-bound (fase 03).
- Escalar a N≥200 por nivel: `npm run pipeline:curate -- --lang de --level B1 --count 200 --source bank` (cuando banco listo).
- Migrar pool Netlify existente o purgar entradas no curadas al activar `STRATEGY_B` en prod.
- UX: estado de carga unificado (doc en PIPELINE_ARCHITECTURE).

## Feature flags tocados

| Flag | Default | Efecto |
|------|---------|--------|
| `STRATEGY_B` (env/server) | OFF | Pool solo curado; POST requiere provenance |
| `LC_STRATEGY_B` (browser) | OFF | Standard exam: pool → static library; bloquea IA genérica |
| `CEFR_GATE` | OFF | ON automático en pipeline curate + pool POST con STRATEGY_B |

## Comandos

```bash
# Lote B1 muestra (5 exámenes curados)
npm run pipeline:curate:b1

# Curación custom
node scripts/pipeline/curate.mjs --lang de --level B1 --count 20 --source composite
node scripts/pipeline/curate.mjs --lang de --level B1 --count 50 --source bank   # cuando banco completo
node scripts/pipeline/curate.mjs --import data/exams/de_B1.json --lang de --level B1 --max 3

# Activar Strategy B (staging)
# Server: STRATEGY_B=1
# Browser: window.LC_STRATEGY_B = '1'
```
