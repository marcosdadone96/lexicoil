# MIGRATION REPORT — 06_CEFR_GATE

> Cursor rellena esto al terminar la fase. No borrar las secciones.

## Qué cambió

- **`knowledge/cefr/vocab/{de,en,es}/{A1..C2}.json`** (18 ficheros): listas parciales `{ level, lang, lemmas[] }` — no duplican `knowledge/cefr/*.json` ni gramática de `knowledge/languages/`.
- **`scripts/seed-cefr-vocab.mjs`**: genera/regenera listas (`npm run seed:cefr-vocab`).
- **`js/engine/validation/CefrVocabLoader.js`**: carga por nivel + acumulado hasta nivel objetivo (Node sync + browser fetch).
- **`js/engine/validation/CefrGate.js`**: verificador determinista — `validatePassage(text, { level, lang })` → `{ withinRange, metrics, reasons[] }`.
- **`js/engine/validation/cefrGateFlags.js`**: `CEFR_GATE` / `LC_CEFR_GATE` / `opts.curation`.
- **`js/engine/validation/ExamValidator.js`**: check opcional `_checkCefrGate` cuando flag activo.
- **`netlify/functions/lib/examQualityGate.js`**: gate de publicación con métricas CEFR cuando `CEFR_GATE=1`.
- **`scripts/test-cefr-gate.mjs`**: regresión + métricas de 3 textos muestra.
- **`scripts/warm-pool.mjs`**: respeta `CEFR_GATE=1` en curación de pool.

## Decisiones tomadas

- **Listas parciales** con `source: partial-seed` y TODO para Profile Deutsch / EVP / Plan Curricular completos.
- **Lematización**: lowercase + stripping de sufijos (aproximación documentada); determinista, sin dependencias NLP externas.
- **Cobertura dura** solo si vocab acumulado ≥ 120 lemas; si no, `coverage_skipped:partial_vocab_list` (gate sigue midiendo).
- **Umbral cobertura**: 85% de tokens dentro del vocab acumulado ≤ nivel.
- **Longitud**: rangos de `knowledge/cefr/{LEVEL}.json` → `textLength.readingWords`.
- **Complejidad proxy**: longitud media de frase + % frases con marcadores subordinados (weil/dass/because/porque…).
- **Recuento de ítems**: delegado a ExamValidator+blueprint (no reimplementado).
- **`CEFR_GATE` default OFF** — live legacy no bloqueado; ON en curación (`CEFR_GATE=1`, `opts.curation`, fase 07).

## Riesgos / deuda introducida

- Listas parciales → cobertura imperfecta hasta importar inventarios completos.
- Lematización simple puede falsear rare words o aceptar variantes incorrectas.
- Gate EN/ES menos calibrado que DE en tests (B1-en muestra ~72% cobertura con lista parcial).
- Pool seed con `CEFR_GATE=1` rechazará la mayoría de exámenes actuales (pasajes cortos + vocab limitado).

## Resultados de tests

- Comando(s):
  - `npm run seed:cefr-vocab` → 18 ficheros
  - `node scripts/test-cefr-gate.mjs` → PASS
  - `npm run test:engine` → PASS
- Resultado: **todos verdes**

### Métricas muestra (test-cefr-gate)

| Texto | Nivel | withinRange | words | coverage | avgSent |
|-------|-------|-------------|-------|----------|---------|
| B1-de-passage | B1 | true | 165 | 89.7% | 11 |
| A1-de-short | A1 | false | 17 | 76.5% | 5.7 |
| B1-en-passage | B1 | false | 100 | 72% | 14.3 |

B1 alemán pasa B1, falla A1 (longitud) y C1 (longitud/complejidad). Métricas idempotentes.

## Verificación manual

- `CefrGate.validatePassage(B1_DE_TEXT, { level:'B1', lang:'de' })` → `withinRange: true`.
- Mismo texto con `level:'A1'` → `length_above_max`.
- `ExamValidator` sin flag → sin errores `cefr_gate:*`.
- Con `{ cefrGate: true, curation: true }` y nivel A1 + texto B1 → errores `cefr_gate:*`.

## Próximos pasos / pendientes

- Importar listas completas Profile Deutsch / EVP / Plan Curricular.
- Sustituir lematizador aproximado por lematizador offline por idioma.
- Fase 07: activar `CEFR_GATE=1` en pipeline de curación antes de publicar a library/pool.
- Calibrar listas EN/ES y bajar falsos positivos en cobertura.

## Feature flags tocados

| Flag | Default | Efecto |
|------|---------|--------|
| `CEFR_GATE` (env) | OFF | Hard-gate publicación en examQualityGate + warm-pool |
| `LC_CEFR_GATE` (browser) | OFF | Mismo gate en cliente |
| `opts.curation` / `opts.cefrGate` | — | Override explícito en validate |

## Comandos

```bash
npm run seed:cefr-vocab
node scripts/test-cefr-gate.mjs
CEFR_GATE=1 npm run seed:pool   # curación estricta (mayoría fallará hasta ampliar bancos)
```
