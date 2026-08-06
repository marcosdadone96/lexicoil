# MIGRATION REPORT — 02_VALIDATOR_HARDENING

> Completado en rama `feat/validator-hardening`. Sin cambios al shape de exámenes ni al render.

## Qué cambió

| Archivo | Acción |
|---------|--------|
| `js/engine/validation/ExamValidator.js` | Reglas A–D: pasaje/transcript, recuentos vs blueprint, longitud CEFR, placeholders; `validate(exam, opts)` → `{ valid, errors, warnings }` |
| `js/engine/validation/blueprintResolver.js` | **Nuevo** — resuelve blueprint sync en Node por `lang`+`level` |
| `js/ui/exam/examGeneration.js` | `lcExamPassesValidator` pasa `strict` / `blueprint`; `LC_VALIDATOR_STRICT` en browser |
| `netlify/functions/lib/examQualityGate.js` | Usa `VALIDATOR_STRICT` + warnings del validator |
| `js/services/claudeClient.js` | Pool save pasa `strict` desde `LC_VALIDATOR_STRICT` |
| `js/engine/generators/ExamGenerator.js` | `VALIDATOR_STRICT` en assert post-generación |
| `scripts/test-exam-validator.mjs` | Tests ampliados (pasaje, longitud, blueprint, strict) |

## Decisiones tomadas

- **`VALIDATOR_STRICT` default OFF** — prod y generación actual no endurecen B/C; solo warnings.
- **Reglas A siempre error** — lectura sin texto / listening sin transcript invalidan en cualquier modo (exámenes sin contenido no son publicables).
- **Blueprint ausente** — emite `blueprint_missing` como **warning**, no fallo; reglas B omitidas.
- **`part_unexpected`** — siempre warning (spec).
- **Longitud CEFR** — suelo operativo por nivel (fase 06 refinará); compara el pasaje de lectura más largo del examen.
- **Placeholders** — misma regex que el quality gate; >5 tolerados → warning (loose) o error (strict).

## Riesgos / deuda introducida

- Exámenes legacy muy cortos reciben warnings `passage_too_short` / `item_count_mismatch` aunque sigan pasando con flag OFF.
- En browser no hay carga automática de blueprint (solo Node); reglas B requieren pasar `blueprint` explícito o ejecutar en servidor.
- Activar `VALIDATOR_STRICT=1` en prod rechazará la mayoría de exámenes library actuales hasta fases 03–04.

## Resultados de tests

- `node scripts/test-exam-validator.mjs` — **OK**
- `npm run test:engine` — **OK** (suite completa)

## Verificación manual

- [x] API previa: `validate(exam)` sigue devolviendo `{ valid, errors }`; `warnings` añadido
- [x] Flag OFF: exámenes cortos pasan `valid` con warnings
- [x] Flag ON: `passage_too_short` e `item_count_mismatch` → `valid: false`
- [ ] Activar `VALIDATOR_STRICT=1` en staging cuando blueprints + pasajes estén alineados (fase 03–04)

## Próximos pasos / pendientes

1. **03_AI_PATH_BLUEPRINTS** — IA sigue el blueprint fiel
2. **04_EXAMBUILDER_PASSAGES** — pasajes largos en banco
3. Activar strict en staging tras 03+04

## Feature flags tocados

- `VALIDATOR_STRICT` (env, default OFF)
- `window.LC_VALIDATOR_STRICT` (browser, opcional)
